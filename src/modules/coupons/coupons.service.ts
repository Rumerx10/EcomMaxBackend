import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { type Coupon, Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { couponDiscount } from './coupon-rules.js';
import type {
  CheckCouponDto,
  CouponCheckDto,
  CouponDto,
  CreateCouponDto,
  PublicCouponDto,
  UpdateCouponDto,
} from './coupons.dto.js';

const toDto = (coupon: Coupon): CouponDto => ({
  id: coupon.id,
  code: coupon.code,
  description: coupon.description,
  discountType: coupon.discountType,
  discountValue: fixed2(coupon.discountValue),
  minOrderAmount: fixed2(coupon.minOrderAmount),
  maxDiscountAmount: fixed2(coupon.maxDiscountAmount),
  usageLimit: coupon.usageLimit,
  usedCount: coupon.usedCount,
  startsAt: coupon.startsAt,
  endsAt: coupon.endsAt,
  isActive: coupon.isActive,
  isPublic: coupon.isPublic,
  createdAt: coupon.createdAt,
});

const checkRules = (coupon: {
  discountType?: string;
  discountValue?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
}) => {
  if (
    coupon.discountType !== 'FIXED_AMOUNT' &&
    (coupon.discountValue ?? 0) > 100
  ) {
    throw new BadRequestException('A percentage discount can be at most 100');
  }
  if (coupon.startsAt && coupon.endsAt && coupon.endsAt <= coupon.startsAt) {
    throw new BadRequestException('endsAt must be after startsAt');
  }
};

// Discount codes of a store. Codes are unique within the store and stored in capitals.
// A coupon that orders used can't be deleted, only deactivated.
@Injectable()
export class CouponsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async list(): Promise<CouponDto[]> {
    const coupons = await this.db.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return coupons.map(toDto);
  }

  // The coupons page: public codes that work right now, ending soonest first.
  async listPublic(now = new Date()): Promise<PublicCouponDto[]> {
    const coupons = await this.db.coupon.findMany({
      where: {
        isActive: true,
        isPublic: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ endsAt: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
    });
    return coupons
      .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
      .map((coupon) => ({
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: fixed2(coupon.discountValue),
        minOrderAmount: fixed2(coupon.minOrderAmount),
        maxDiscountAmount: fixed2(coupon.maxDiscountAmount),
        endsAt: coupon.endsAt,
      }));
  }

  async create(dto: CreateCouponDto): Promise<CouponDto> {
    checkRules(dto);
    const coupon = await this.db.coupon.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        code: dto.code,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount,
        usageLimit: dto.usageLimit,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        isActive: dto.isActive,
        isPublic: dto.isPublic,
      },
    });
    return toDto(coupon);
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponDto> {
    const existing = await this.require(id);
    checkRules({
      discountType: dto.discountType ?? existing.discountType,
      discountValue: dto.discountValue ?? existing.discountValue.toNumber(),
      startsAt: dto.startsAt === undefined ? existing.startsAt : dto.startsAt,
      endsAt: dto.endsAt === undefined ? existing.endsAt : dto.endsAt,
    });
    return toDto(await this.db.coupon.update({ where: { id }, data: dto }));
  }

  async remove(id: string): Promise<void> {
    const coupon = await this.db.coupon.findUnique({
      where: { id },
      select: { _count: { select: { orders: true } } },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (coupon._count.orders > 0) {
      throw new ConflictException(
        'Orders used this coupon. Deactivate it instead.',
      );
    }
    await this.db.coupon.delete({ where: { id } });
  }

  // For the cart page: what the code would take off. Checkout works it out again.
  async check(dto: CheckCouponDto): Promise<CouponCheckDto> {
    const coupon = await this.findByCode(dto.code);
    const discount = couponDiscount(coupon, new Prisma.Decimal(dto.subtotal));
    return {
      code: coupon.code,
      description: coupon.description,
      discountAmount: fixed2(discount),
    };
  }

  async findByCode(code: string): Promise<Coupon> {
    const coupon = await this.db.coupon.findUnique({
      where: { sellerId_code: { sellerId: this.tenantPrisma.sellerId, code } },
    });
    if (!coupon)
      throw new NotFoundException('There is no coupon with this code');
    return coupon;
  }

  private async require(id: string): Promise<Coupon> {
    const coupon = await this.db.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }
}
