import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { couponDiscount } from './coupon-rules.js';

const d = (value: number) => new Prisma.Decimal(value);
const save10 = {
  discountType: 'PERCENTAGE' as const,
  discountValue: d(10),
  minOrderAmount: null,
  maxDiscountAmount: null,
  usageLimit: null,
  usedCount: 0,
  startsAt: null,
  endsAt: null,
  isActive: true,
};

describe('couponDiscount', () => {
  it('takes a percentage, rounded to the paisa', () => {
    expect(couponDiscount(save10, d(19999.99)).toFixed(2)).toBe('2000.00');
    expect(couponDiscount(save10, d(105.55)).toFixed(2)).toBe('10.56');
  });

  it('caps a percentage at maxDiscountAmount and any discount at the subtotal', () => {
    expect(
      couponDiscount(
        { ...save10, maxDiscountAmount: d(500) },
        d(100000),
      ).toFixed(2),
    ).toBe('500.00');
    const fixed = {
      ...save10,
      discountType: 'FIXED_AMOUNT' as const,
      discountValue: d(1000),
    };
    expect(couponDiscount(fixed, d(5000)).toFixed(2)).toBe('1000.00');
    expect(couponDiscount(fixed, d(400)).toFixed(2)).toBe('400.00');
  });

  it('refuses inactive, early, expired, used-up and too-small orders', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const cases = [
      { ...save10, isActive: false },
      { ...save10, startsAt: new Date('2026-11-01') },
      { ...save10, endsAt: new Date('2026-10-01') },
      { ...save10, usageLimit: 5, usedCount: 5 },
      { ...save10, minOrderAmount: d(10000) },
    ];
    for (const coupon of cases) {
      expect(() => couponDiscount(coupon, d(5000), now)).toThrow(
        BadRequestException,
      );
    }
  });
});
