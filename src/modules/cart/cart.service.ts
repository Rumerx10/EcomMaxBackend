import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../tenant/tenant-prisma.service.js';
import { resolveVariant } from '../products/pricing.js';
import {
  type AddCartItemDto,
  type CartLineDto,
  type CartResponseDto,
  type LineProblem,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
} from './dto/cart.dto.js';
import { newGuestToken, type Shopper } from './shopper.js';

const byPosition = { orderBy: { position: 'asc' as const } };

export const LINE_PRODUCT = {
  product: {
    include: {
      images: { ...byPosition, take: 1 },
      options: { ...byPosition, include: { values: byPosition } },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartLine = Prisma.CartItemGetPayload<{ include: typeof LINE_PRODUCT }>;

// A cart line priced from today's product, with the reason it can't be bought, if any.
export interface PricedLine {
  line: CartLine;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  problem: LineProblem | null;
}

export const priceLine = (line: CartLine): PricedLine => {
  const { product } = line;
  let unitPrice = product.price;
  let problem: LineProblem | null = null;
  if (product.status !== 'ACTIVE') {
    problem = 'unavailable';
  } else {
    try {
      unitPrice = resolveVariant(product, line.variant).unitPrice;
    } catch {
      problem = 'options_changed';
    }
    if (!problem && product.stock === 0) problem = 'out_of_stock';
    else if (!problem && line.quantity > product.stock)
      problem = 'not_enough_stock';
  }
  return {
    line,
    unitPrice,
    lineTotal: unitPrice.times(line.quantity),
    problem,
  };
};

interface CartRef {
  id: string;
  guestToken: string | null;
}

// Carts of signed-in users (one per user) and of guests (found by their guest token). Every
// read prices the lines again from the products, so a cart never shows a stale price.
@Injectable()
export class CartService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async get(shopper: Shopper): Promise<CartResponseDto> {
    const cart = await this.findCart(shopper);
    return cart ? this.view(cart) : this.emptyView(shopper);
  }

  async addItem(
    shopper: Shopper,
    dto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    const product = await this.db.product.findFirst({
      where: { id: dto.productId, status: 'ACTIVE' },
      include: { options: { include: { values: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    const { variant } = resolveVariant(product, dto.variant ?? '');

    const cart = await this.findOrCreateCart(shopper);
    const key = {
      sellerId: this.tenantPrisma.sellerId,
      cartId: cart.id,
      productId: product.id,
      variant,
    };
    const existing = await this.db.cartItem.findUnique({
      where: { sellerId_cartId_productId_variant: key },
    });
    const quantity = Math.min(
      (existing?.quantity ?? 0) + (dto.quantity ?? 1),
      MAX_LINE_QUANTITY,
    );
    this.checkStock(quantity, product.stock);
    if (
      !existing &&
      (await this.db.cartItem.count({ where: { cartId: cart.id } })) >=
        MAX_CART_LINES
    ) {
      throw new ConflictException(
        `A cart can hold at most ${MAX_CART_LINES} different items`,
      );
    }

    await this.db.cartItem.upsert({
      where: { sellerId_cartId_productId_variant: key },
      create: { ...key, quantity },
      update: { quantity },
    });
    return this.view(cart);
  }

  async updateItem(shopper: Shopper, lineId: string, quantity: number) {
    const cart = await this.requireCart(shopper);
    const line = await this.db.cartItem.findFirst({
      where: { id: lineId, cartId: cart.id },
      include: { product: { select: { stock: true } } },
    });
    if (!line) throw new NotFoundException('That item is not in the cart');
    this.checkStock(quantity, line.product.stock);
    await this.db.cartItem.update({
      where: { id: line.id },
      data: { quantity },
    });
    return this.view(cart);
  }

  async removeItem(shopper: Shopper, lineId: string): Promise<CartResponseDto> {
    const cart = await this.requireCart(shopper);
    const { count } = await this.db.cartItem.deleteMany({
      where: { id: lineId, cartId: cart.id },
    });
    if (count === 0)
      throw new NotFoundException('That item is not in the cart');
    return this.view(cart);
  }

  async clear(shopper: Shopper): Promise<CartResponseDto> {
    const cart = await this.findCart(shopper);
    if (!cart) return this.emptyView(shopper);
    await this.db.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.view(cart);
  }

  // After sign-in: the guest's lines join the user's cart (quantities add up), and the guest
  // cart is removed. Runs inside the caller's transaction when one is given (checkout).
  async mergeGuestCart(
    userId: string,
    guestToken: string,
    tx: TenantTransactionClient = this.db,
  ): Promise<void> {
    const sellerId = this.tenantPrisma.sellerId;
    const guest = await tx.cart.findUnique({
      where: { sellerId_guestToken: { sellerId, guestToken } },
      include: { items: true },
    });
    if (!guest) return;
    const userCart = await tx.cart.upsert({
      where: { sellerId_userId: { sellerId, userId } },
      create: { sellerId, userId },
      update: {},
    });
    for (const item of guest.items) {
      const key = {
        sellerId,
        cartId: userCart.id,
        productId: item.productId,
        variant: item.variant,
      };
      const existing = await tx.cartItem.findUnique({
        where: { sellerId_cartId_productId_variant: key },
      });
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: Math.min(
              existing.quantity + item.quantity,
              MAX_LINE_QUANTITY,
            ),
          },
        });
      } else {
        await tx.cartItem.create({ data: { ...key, quantity: item.quantity } });
      }
    }
    await tx.cart.delete({ where: { id: guest.id } });
  }

  // The shopper's cart lines, priced now. Used by the cart view and by checkout.
  async pricedLines(
    cartId: string,
    tx: TenantTransactionClient = this.db,
  ): Promise<PricedLine[]> {
    const lines = await tx.cartItem.findMany({
      where: { sellerId: this.tenantPrisma.sellerId, cartId },
      include: LINE_PRODUCT,
      orderBy: { createdAt: 'asc' },
    });
    return lines.map(priceLine);
  }

  async findCart(shopper: Shopper): Promise<CartRef | null> {
    const sellerId = this.tenantPrisma.sellerId;
    const select = { id: true, guestToken: true };
    if (shopper.kind === 'user') {
      return this.db.cart.findUnique({
        where: { sellerId_userId: { sellerId, userId: shopper.userId } },
        select,
      });
    }
    if (!shopper.guestToken) return null;
    return this.db.cart.findUnique({
      where: {
        sellerId_guestToken: { sellerId, guestToken: shopper.guestToken },
      },
      select,
    });
  }

  private async findOrCreateCart(shopper: Shopper): Promise<CartRef> {
    const sellerId = this.tenantPrisma.sellerId;
    const select = { id: true, guestToken: true };
    if (shopper.kind === 'user') {
      return this.db.cart.upsert({
        where: { sellerId_userId: { sellerId, userId: shopper.userId } },
        create: { sellerId, userId: shopper.userId },
        update: {},
        select,
      });
    }
    const guestToken = shopper.guestToken ?? newGuestToken();
    return this.db.cart.upsert({
      where: { sellerId_guestToken: { sellerId, guestToken } },
      create: { sellerId, guestToken },
      update: {},
      select,
    });
  }

  private async requireCart(shopper: Shopper): Promise<CartRef> {
    const cart = await this.findCart(shopper);
    if (!cart) throw new NotFoundException('That item is not in the cart');
    return cart;
  }

  private checkStock(quantity: number, stock: number) {
    if (stock === 0)
      throw new ConflictException('This product is out of stock');
    if (quantity > stock)
      throw new ConflictException(`Only ${stock} left in stock`);
  }

  private async view(cart: CartRef): Promise<CartResponseDto> {
    const priced = await this.pricedLines(cart.id);
    const ok = priced.filter((line) => !line.problem);
    return {
      guestToken: cart.guestToken,
      items: priced.map(toLineDto),
      itemCount: ok.reduce((sum, line) => sum + line.line.quantity, 0),
      subtotal: fixed2(
        ok.reduce(
          (sum, line) => sum.plus(line.lineTotal),
          new Prisma.Decimal(0),
        ),
      ),
    };
  }

  private emptyView(shopper: Shopper): CartResponseDto {
    return {
      guestToken: shopper.kind === 'guest' ? shopper.guestToken : null,
      items: [],
      itemCount: 0,
      subtotal: '0.00',
    };
  }
}

const toLineDto = ({
  line,
  unitPrice,
  lineTotal,
  problem,
}: PricedLine): CartLineDto => ({
  id: line.id,
  productId: line.productId,
  title: line.product.title,
  slug: line.product.slug,
  thumbnail: line.product.images[0]?.url ?? null,
  variant: line.variant,
  quantity: line.quantity,
  unitPrice: fixed2(unitPrice),
  lineTotal: fixed2(lineTotal),
  stock: line.product.stock,
  problem,
});
