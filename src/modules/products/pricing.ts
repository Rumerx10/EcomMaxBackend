import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

// The parts of a product that decide what one unit costs.
export interface PricedProduct {
  price: Prisma.Decimal;
  options: {
    name: string;
    position: number;
    values: { label: string; priceDelta: Prisma.Decimal; position: number }[];
  }[];
}

// Pricing follows the client (lib/products.ts): `price` is what the buyer pays, and every
// chosen option value adds its priceDelta. discountPercent only produces the struck-through
// "was" price, so it is never subtracted again.

const byPosition = <T extends { position: number }>(items: T[]) =>
  [...items].sort((a, b) => a.position - b.position);

const optionsWithValues = (product: PricedProduct) =>
  byPosition(product.options).filter((option) => option.values.length > 0);

// "Capacity: 9.6 kWh / Color: Black" -> { Capacity: '9.6 kWh', Color: 'Black' }
export const parseVariant = (variant: string): Map<string, string> => {
  const selection = new Map<string, string>();
  for (const part of variant.split(' / ')) {
    const split = part.indexOf(': ');
    if (split > 0)
      selection.set(part.slice(0, split).trim(), part.slice(split + 2).trim());
  }
  return selection;
};

export interface ResolvedVariant {
  // The canonical label, options in their display order: "Capacity: 9.6 kWh / Color: Black".
  variant: string;
  unitPrice: Prisma.Decimal;
}

// Checks a chosen variant against the product and prices it. A product with options needs a
// value for every option; a product without options takes no variant.
export const resolveVariant = (
  product: PricedProduct,
  variant: string,
): ResolvedVariant => {
  const options = optionsWithValues(product);
  if (options.length === 0) {
    if (variant.trim())
      throw new BadRequestException('This product has no options to choose');
    return { variant: '', unitPrice: product.price };
  }

  const selection = parseVariant(variant);
  let unitPrice = product.price;
  const parts: string[] = [];
  for (const option of options) {
    const label = selection.get(option.name);
    const value = option.values.find((candidate) => candidate.label === label);
    if (!value) {
      throw new BadRequestException(
        `Choose a ${option.name}: ${byPosition(option.values)
          .map((v) => v.label)
          .join(', ')}`,
      );
    }
    unitPrice = unitPrice.plus(value.priceDelta);
    parts.push(`${option.name}: ${value.label}`);
  }
  if (selection.size !== options.length) {
    throw new BadRequestException(
      'The chosen options do not match this product',
    );
  }
  return { variant: parts.join(' / '), unitPrice };
};

// Cheapest and dearest combination, for "from ৳19,500" on listings.
export const priceRange = (product: PricedProduct) => {
  let min = product.price;
  let max = product.price;
  for (const option of optionsWithValues(product)) {
    const deltas = option.values.map((value) => value.priceDelta);
    min = min.plus(Prisma.Decimal.min(...deltas));
    max = max.plus(Prisma.Decimal.max(...deltas));
  }
  return { min, max };
};

// The "was" price shown struck through: price / (1 - discount%).
export const originalPrice = (
  price: Prisma.Decimal,
  discountPercent: Prisma.Decimal,
) =>
  discountPercent.greaterThan(0)
    ? price.dividedBy(
        new Prisma.Decimal(1).minus(discountPercent.dividedBy(100)),
      )
    : null;
