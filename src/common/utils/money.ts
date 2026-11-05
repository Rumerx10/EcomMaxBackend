import type { Prisma } from '../../generated/prisma/client.js';

// Money and percentages leave the API as strings with two decimals ("19500.00"), never as
// floats, so no client ever sees 0.30000000000000004.
export function fixed2(value: Prisma.Decimal): string;
export function fixed2(value: Prisma.Decimal | null): string | null;
export function fixed2(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}
