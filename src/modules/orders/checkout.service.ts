import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClientInfo } from '../../common/decorators/client-info.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import { retryOnConflict } from '../../common/utils/retry.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../tenant/tenant-prisma.service.js';
import type { AddressInputDto } from '../addresses/addresses.dto.js';
import { AddressesService } from '../addresses/addresses.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CartService, type PricedLine } from '../cart/cart.service.js';
import type { Shopper } from '../cart/shopper.js';
import { WishlistService } from '../cart/wishlist.service.js';
import { couponDiscount, roundMoney } from '../coupons/coupon-rules.js';
import { USER_PUBLIC_FIELDS } from '../users/dto/user-response.dto.js';
import type { CheckoutDto } from './dto/checkout.dto.js';
import type { CheckoutResponseDto } from './dto/order-response.dto.js';
import { STATUS_TITLES } from './order-status.js';
import { ORDER_DETAIL_INCLUDE, toOrderDto } from './order-view.js';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

// Who pays: a signed-in user, a guest whose phone already has an account (and who proved it
// with the password), or a guest whose account the order creates.
type Buyer =
  | { kind: 'signed-in'; userId: string }
  | { kind: 'returning-guest'; userId: string }
  | {
      kind: 'new-guest';
      name: string;
      phone: string;
      email: string | null;
      passwordHash: string;
    };

interface Delivery {
  address: AddressInputDto;
  // Whether to add it to the buyer's address book.
  save: boolean;
}

export interface CheckoutInput {
  dto: CheckoutDto;
  user?: AuthUser;
  guestToken: string | null;
  idempotencyKey?: string;
  client: ClientInfo;
}

// Turns the shopper's cart into an order. Everything that must happen together runs in one
// database transaction: prices are worked out again on the server, stock is taken with a
// conditional decrement (so two buyers can't get the last unit), the coupon use is counted,
// the guest's account is created, the next order number is taken, the order is written and
// the cart is emptied. If any step fails, none of it happened.
@Injectable()
export class CheckoutService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly wishlist: WishlistService,
    private readonly addresses: AddressesService,
    private readonly auth: AuthService,
  ) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async checkout(input: CheckoutInput): Promise<CheckoutResponseDto> {
    const { dto, user } = input;
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new BadRequestException(
        'Send an Idempotency-Key header (8 to 100 letters, digits, - or _), new for each order',
      );
    }

    // Slow or fixed things first, outside the transaction: hashing a password takes time.
    const buyer = await this.identifyBuyer(dto, user);
    const repeat = await this.findRepeat(idempotencyKey, buyer, input.client);
    if (repeat) return repeat;

    const shopper: Shopper = user
      ? { kind: 'user', userId: user.id }
      : { kind: 'guest', guestToken: input.guestToken };
    if (shopper.kind === 'guest' && !shopper.guestToken) {
      throw new BadRequestException(
        'Send the X-Guest-Token of the cart to order',
      );
    }
    const cart = await this.cart.findCart(shopper);
    if (!cart) throw new BadRequestException('Your cart is empty');

    const rate = await this.db.shippingRate.findFirst({
      where: { id: dto.shippingRateId, isActive: true },
    });
    if (!rate)
      throw new NotFoundException('Choose one of the delivery options');
    const seller = await this.prisma.seller.findUniqueOrThrow({
      where: { id: this.tenantPrisma.sellerId },
      select: { taxRate: true, installationFee: true, currency: true },
    });
    if (dto.installation && seller.installationFee === null) {
      throw new BadRequestException('This store does not offer installation');
    }
    const delivery = await this.delivery(dto, user);

    let orderId: string;
    try {
      orderId = await retryOnConflict(() =>
        this.db.$transaction(
          async (tx) => {
            const lines = await this.cart.pricedLines(cart.id, tx);
            checkLines(lines);
            await takeStock(tx, lines);

            const subtotal = lines.reduce(
              (sum, line) => sum.plus(line.lineTotal),
              new Prisma.Decimal(0),
            );
            const coupon = dto.couponCode
              ? await this.useCoupon(tx, dto.couponCode, subtotal)
              : null;
            const discount = coupon?.discount ?? new Prisma.Decimal(0);
            const shipping = rate.price;
            const installation = dto.installation
              ? (seller.installationFee ?? new Prisma.Decimal(0))
              : new Prisma.Decimal(0);
            // VAT on the goods after the discount, as the client's checkout works it out.
            const taxable = subtotal.minus(discount);
            const tax = roundMoney(
              taxable.times(seller.taxRate).dividedBy(100),
            );
            const total = taxable.plus(shipping).plus(installation).plus(tax);

            const userId =
              buyer.kind === 'new-guest'
                ? (
                    await tx.user.create({
                      data: {
                        sellerId: this.tenantPrisma.sellerId,
                        role: 'CUSTOMER',
                        name: buyer.name,
                        phone: buyer.phone,
                        email: buyer.email,
                        passwordHash: buyer.passwordHash,
                      },
                      select: { id: true },
                    })
                  ).id
                : buyer.userId;
            if (delivery.save) {
              await this.addresses.insert(
                tx,
                userId,
                delivery.address,
                buyer.kind === 'new-guest',
              );
            }

            // Taken last, so the per-store counter row stays locked for as short as possible.
            const { lastNumber } = await tx.orderCounter.upsert({
              where: { sellerId: this.tenantPrisma.sellerId },
              create: {
                sellerId: this.tenantPrisma.sellerId,
                lastNumber: 1001,
              },
              update: { lastNumber: { increment: 1 } },
            });
            const paymentMethod = dto.paymentMethod ?? 'COD';
            const order = await tx.order.create({
              data: {
                sellerId: this.tenantPrisma.sellerId,
                orderNumber: lastNumber,
                userId,
                idempotencyKey,
                couponId: coupon?.id ?? null,
                couponCode: coupon?.code ?? null,
                paymentMethod,
                currency: seller.currency,
                subtotal,
                discountAmount: discount,
                shippingAmount: shipping,
                installationFee: installation,
                taxAmount: tax,
                totalAmount: total,
                shippingMethod: rate.name,
                note: dto.note ?? null,
                shipName: delivery.address.name,
                shipPhone: delivery.address.phone,
                shipDistrict: delivery.address.district,
                shipThana: delivery.address.thana,
                shipVillageOrWard: delivery.address.villageOrWard,
                shipAddressLine: delivery.address.addressLine ?? null,
                shipPostCode: delivery.address.postCode ?? null,
                items: {
                  create: lines.map(({ line, unitPrice, lineTotal }) => ({
                    productId: line.productId,
                    title: line.product.title,
                    sku: line.product.sku,
                    variant: line.variant || null,
                    imageUrl: line.product.images[0]?.url ?? null,
                    unitPrice,
                    unitCost: line.product.costPrice,
                    quantity: line.quantity,
                    totalPrice: lineTotal,
                  })),
                },
                payments: {
                  create: {
                    method: paymentMethod,
                    amount: total,
                    currency: seller.currency,
                  },
                },
                events: {
                  create: { status: 'PENDING', title: STATUS_TITLES.PENDING },
                },
              },
              select: { id: true },
            });

            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            if (shopper.kind === 'guest' && shopper.guestToken) {
              await tx.cart.delete({ where: { id: cart.id } });
              await this.wishlist.mergeGuestWishlist(
                userId,
                shopper.guestToken,
                tx,
              );
            }
            return order.id;
          },
          { maxWait: 5_000, timeout: 15_000 },
        ),
      );
    } catch (error) {
      // The same order submitted twice at once: the other request won; answer with its order.
      if (isDuplicateIdempotencyKey(error)) {
        const winner = await this.findRepeat(
          idempotencyKey,
          await this.identifyBuyer(dto, user),
          input.client,
        );
        if (winner) return winner;
      }
      throw error;
    }

    const order = await this.db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });
    const auth = user ? null : await this.signIn(order.userId, input.client);
    return { order: toOrderDto(order, false), auth, created: true };
  }

  private async identifyBuyer(
    dto: CheckoutDto,
    user?: AuthUser,
  ): Promise<Buyer> {
    if (user) return { kind: 'signed-in', userId: user.id };

    const missing = (['name', 'phone', 'password'] as const).filter(
      (field) => !dto[field],
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `To order without signing in, give your ${missing.join(', ')}`,
      );
    }
    if (dto.addressId)
      throw new BadRequestException('Sign in to use a saved address');
    const name = dto.name!;
    const phone = dto.phone!;
    const password = dto.password!;

    const existing = await this.db.user.findUnique({
      where: {
        sellerId_phone: { sellerId: this.tenantPrisma.sellerId, phone },
      },
    });
    if (existing) {
      if (!(await verifyPassword(existing.passwordHash, password))) {
        throw new ConflictException(
          "This phone number already has an account. Sign in, or enter that account's password.",
        );
      }
      if (!existing.isActive)
        throw new ForbiddenException('This account has been deactivated');
      return { kind: 'returning-guest', userId: existing.id };
    }
    return {
      kind: 'new-guest',
      name,
      phone,
      email: dto.email ?? null,
      passwordHash: await hashPassword(password),
    };
  }

  // A repeated Idempotency-Key returns the order it made, but only to the same buyer.
  private async findRepeat(
    idempotencyKey: string,
    buyer: Buyer,
    client: ClientInfo,
  ): Promise<CheckoutResponseDto | null> {
    const order = await this.db.order.findUnique({
      where: {
        sellerId_idempotencyKey: {
          sellerId: this.tenantPrisma.sellerId,
          idempotencyKey,
        },
      },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) return null;
    if (buyer.kind === 'new-guest' || order.userId !== buyer.userId) {
      throw new ConflictException(
        'This Idempotency-Key belongs to another order',
      );
    }
    const auth =
      buyer.kind === 'returning-guest'
        ? await this.signIn(order.userId, client)
        : null;
    return { order: toOrderDto(order, false), auth, created: false };
  }

  private async delivery(dto: CheckoutDto, user?: AuthUser): Promise<Delivery> {
    if (dto.addressId) {
      if (!user)
        throw new BadRequestException('Sign in to use a saved address');
      const saved = await this.addresses.require(user.id, dto.addressId);
      return {
        address: {
          name: saved.name,
          phone: saved.phone,
          district: saved.district,
          thana: saved.thana,
          villageOrWard: saved.villageOrWard,
          addressLine: saved.addressLine ?? undefined,
          postCode: saved.postCode ?? undefined,
        },
        save: false,
      };
    }
    if (!dto.address) throw new BadRequestException('Give a delivery address');
    return { address: dto.address, save: user ? !!dto.saveAddress : true };
  }

  private async useCoupon(
    tx: TenantTransactionClient,
    code: string,
    subtotal: Prisma.Decimal,
  ) {
    const coupon = await tx.coupon.findUnique({
      where: { sellerId_code: { sellerId: this.tenantPrisma.sellerId, code } },
    });
    if (!coupon)
      throw new NotFoundException('There is no coupon with this code');
    const discount = couponDiscount(coupon, subtotal);
    // A limited coupon is counted only if nobody used it in the meantime.
    const { count } = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        ...(coupon.usageLimit !== null ? { usedCount: coupon.usedCount } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictException(
        'Someone used the coupon at the same moment. Please try again.',
      );
    }
    return { id: coupon.id, code: coupon.code, discount };
  }

  private async signIn(userId: string, client: ClientInfo) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: USER_PUBLIC_FIELDS,
    });
    return this.auth.startSession(user, client);
  }
}

const isDuplicateIdempotencyKey = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  JSON.stringify(error.meta ?? {}).includes('idempotencyKey');

// Every line must be buyable as it is; otherwise the buyer sees which ones and why.
const checkLines = (lines: PricedLine[]) => {
  if (lines.length === 0) throw new BadRequestException('Your cart is empty');
  const problems = lines.filter((line) => line.problem);
  if (problems.length > 0) {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message:
        'Some items in your cart cannot be bought as they are. Update the cart first.',
      items: problems.map(({ line, problem }) => ({
        id: line.id,
        productId: line.productId,
        title: line.product.title,
        problem,
        stock: line.product.stock,
      })),
    });
  }
};

// Takes the stock of every product, in a fixed order so two checkouts can't deadlock. The
// decrement only happens while enough is left, so stock never goes below zero.
const takeStock = async (tx: TenantTransactionClient, lines: PricedLine[]) => {
  const perProduct = new Map<string, { quantity: number; title: string }>();
  for (const { line } of lines) {
    const entry = perProduct.get(line.productId) ?? {
      quantity: 0,
      title: line.product.title,
    };
    entry.quantity += line.quantity;
    perProduct.set(line.productId, entry);
  }
  for (const productId of [...perProduct.keys()].sort()) {
    const { quantity, title } = perProduct.get(productId)!;
    const { count } = await tx.product.updateMany({
      where: { id: productId, status: 'ACTIVE', stock: { gte: quantity } },
      data: {
        stock: { decrement: quantity },
        soldCount: { increment: quantity },
      },
    });
    if (count === 0) {
      throw new ConflictException(
        `"${title}" sold out while you were checking out`,
      );
    }
  }
};
