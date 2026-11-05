import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  originalPrice,
  parseVariant,
  priceRange,
  resolveVariant,
} from './pricing.js';

const d = (value: number) => new Prisma.Decimal(value);

const battery = {
  price: d(150000),
  options: [
    {
      name: 'Color',
      position: 1,
      values: [
        { label: 'White', priceDelta: d(0), position: 0 },
        { label: 'Black', priceDelta: d(2000), position: 1 },
      ],
    },
    {
      name: 'Capacity',
      position: 0,
      values: [
        { label: '6.4 kWh', priceDelta: d(0), position: 0 },
        { label: '9.6 kWh', priceDelta: d(95000), position: 1 },
      ],
    },
  ],
};

describe('pricing', () => {
  it('parses the client variant label', () => {
    expect(
      Object.fromEntries(parseVariant('Capacity: 9.6 kWh / Color: Black')),
    ).toEqual({
      Capacity: '9.6 kWh',
      Color: 'Black',
    });
  });

  it('prices a variant and puts its label in option order', () => {
    const resolved = resolveVariant(
      battery,
      'Color: Black / Capacity: 9.6 kWh',
    );
    expect(resolved.variant).toBe('Capacity: 9.6 kWh / Color: Black');
    expect(resolved.unitPrice.toFixed(2)).toBe('247000.00');
  });

  it('needs every option, and only real values', () => {
    expect(() => resolveVariant(battery, 'Capacity: 9.6 kWh')).toThrow(
      BadRequestException,
    );
    expect(() =>
      resolveVariant(battery, 'Capacity: 99 kWh / Color: Black'),
    ).toThrow(/Choose a Capacity/);
    expect(() =>
      resolveVariant(battery, 'Capacity: 6.4 kWh / Color: Black / Size: XL'),
    ).toThrow(BadRequestException);
  });

  it('takes no variant for a product without options', () => {
    const plain = { price: d(4500), options: [] };
    expect(resolveVariant(plain, '')).toEqual({
      variant: '',
      unitPrice: d(4500),
    });
    expect(() => resolveVariant(plain, 'Color: Black')).toThrow(
      BadRequestException,
    );
  });

  it('gives the cheapest and dearest combination', () => {
    const range = priceRange(battery);
    expect([range.min.toFixed(2), range.max.toFixed(2)]).toEqual([
      '150000.00',
      '247000.00',
    ]);
  });

  it('works out the struck-through price from the discount', () => {
    expect(originalPrice(d(18000), d(10))?.toFixed(2)).toBe('20000.00');
    expect(originalPrice(d(18000), d(0))).toBeNull();
  });
});
