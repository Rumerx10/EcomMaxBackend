import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { Coupon } from '../../generated/prisma/client.js';

export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

export const roundMoney = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

type CouponRules = Pick<
  Coupon,
  | 'discountType'
  | 'discountValue'
  | 'minOrderAmount'
  | 'maxDiscountAmount'
  | 'usageLimit'
  | 'usedCount'
  | 'startsAt'
  | 'endsAt'
  | 'isActive'
>;

// What a coupon takes off this subtotal, or why it can't be used. Percentages are capped by
// maxDiscountAmount, and no coupon takes off more than the subtotal.
export const couponDiscount = (
  coupon: CouponRules,
  subtotal: Prisma.Decimal,
  now = new Date(),
): Prisma.Decimal => {
  if (!coupon.isActive)
    throw new BadRequestException('This coupon is not active');
  if (coupon.startsAt && now < coupon.startsAt) {
    throw new BadRequestException('This coupon is not valid yet');
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    throw new BadRequestException('This coupon has expired');
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new BadRequestException('This coupon has been used up');
  }
  if (coupon.minOrderAmount && subtotal.lessThan(coupon.minOrderAmount)) {
    throw new BadRequestException(
      `Spend at least ${coupon.minOrderAmount.toFixed(2)} to use this coupon`,
    );
  }

  let discount =
    coupon.discountType === 'PERCENTAGE'
      ? subtotal.times(coupon.discountValue).dividedBy(100)
      : coupon.discountValue;
  if (
    coupon.maxDiscountAmount &&
    discount.greaterThan(coupon.maxDiscountAmount)
  ) {
    discount = coupon.maxDiscountAmount;
  }
  return roundMoney(Prisma.Decimal.min(discount, subtotal));
};
