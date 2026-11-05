import { Prisma } from '../../generated/prisma/client.js';
import { toHttpException } from './prisma-exception.filter.js';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('toHttpException', () => {
  it('turns a duplicate into 409 and names the field, never sellerId', () => {
    const fromTarget = toHttpException(
      prismaError('P2002', { target: ['sellerId', 'sku'] }),
    );
    expect(fromTarget.getStatus()).toBe(409);
    expect(fromTarget.message).toBe('Another record already uses this sku');

    const fromAdapter = toHttpException(
      prismaError('P2002', {
        driverAdapterError: {
          cause: { constraint: { fields: ['sellerId', 'phone'] } },
        },
      }),
    );
    expect(fromAdapter.message).toBe('Another record already uses this phone');

    // What the pg driver adapter actually reports: only the index and table names.
    const fromIndexName = toHttpException(
      prismaError('P2002', {
        driverAdapterError: {
          cause: {
            constraint: { index: 'products_sellerId_sku_key' },
            table: 'products',
          },
        },
      }),
    );
    expect(fromIndexName.message).toBe('Another record already uses this sku');
  });

  it('explains the custom-named partial indexes', () => {
    const error = toHttpException(
      prismaError('P2002', {
        driverAdapterError: {
          cause: {
            constraint: { index: 'users_one_owner_per_seller' },
            table: 'users',
          },
        },
      }),
    );
    expect(error.message).toBe('This store already has an owner');
  });

  it('maps restricted deletes to 409, missing rows to 404 and conflicts to 409', () => {
    expect(toHttpException(prismaError('P2003')).getStatus()).toBe(409);
    expect(toHttpException(prismaError('P2025')).getStatus()).toBe(404);
    expect(toHttpException(prismaError('P2034')).getStatus()).toBe(409);
  });

  it('answers anything else with a bare 500', () => {
    const error = toHttpException(prismaError('P1001'));
    expect(error.getStatus()).toBe(500);
    expect(error.message).not.toContain('db error');
  });
});
