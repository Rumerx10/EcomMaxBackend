import { Prisma } from '../generated/prisma/client.js';

// Every model except Seller carries sellerId (a rule of prisma/schema.prisma, checked by
// tenant-scope.spec.ts), so all of them are scoped.
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter(
    (model) => model !== Prisma.ModelName.Seller,
  ),
);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);
const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
]);
const DATA_UPDATE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
]);

export class CrossTenantError extends Error {
  constructor(detail: string) {
    super(`Blocked a query outside the current store: ${detail}`);
  }
}

type Args = Record<string, any>;

// sellerId given explicitly must be the current seller. Compound keys such as
// { sellerId_slug: { sellerId, slug } } are checked too.
const checkWhere = (where: Args | undefined, sellerId: string) => {
  if (!where) return;
  for (const [key, value] of Object.entries(where)) {
    if (key === 'sellerId' && value !== sellerId) {
      throw new CrossTenantError(`where.sellerId is ${JSON.stringify(value)}`);
    }
    if (key.startsWith('sellerId_') && value?.sellerId !== sellerId) {
      throw new CrossTenantError(
        `where.${key}.sellerId is ${JSON.stringify(value?.sellerId)}`,
      );
    }
  }
};

const scopeWhere = (where: Args | undefined, sellerId: string): Args => {
  checkWhere(where, sellerId);
  return { ...where, sellerId };
};

const scopeData = (data: Args, sellerId: string): Args => {
  if ('seller' in data) {
    throw new CrossTenantError(
      'write tenant models with sellerId-free scalar input, not seller',
    );
  }
  if (data.sellerId !== undefined && data.sellerId !== sellerId) {
    throw new CrossTenantError(
      `data.sellerId is ${JSON.stringify(data.sellerId)}`,
    );
  }
  return { ...data, sellerId };
};

// Rows never move between stores.
const checkUpdateData = (data: Args | undefined, sellerId: string) => {
  if (data && 'sellerId' in data && data.sellerId !== sellerId) {
    throw new CrossTenantError('an update may not change sellerId');
  }
};

// Adds the current seller to a query on a tenant model: to `where` for reads, updates and
// deletes, and to `data` for creates. Unique lookups keep working because Prisma accepts extra
// filters next to a unique field. Nested writes need nothing: child rows take sellerId from the
// composite (sellerId, parentId) relation.
export const scopeArgs = (
  operation: string,
  args: Args | undefined,
  sellerId: string,
): Args => {
  const scoped: Args = { ...args };
  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = scopeWhere(scoped.where, sellerId);
  }
  if (DATA_UPDATE_OPERATIONS.has(operation)) {
    checkUpdateData(scoped.data, sellerId);
  }
  if (CREATE_OPERATIONS.has(operation)) {
    scoped.data = Array.isArray(scoped.data)
      ? scoped.data.map((row: Args) => scopeData(row, sellerId))
      : scopeData(scoped.data ?? {}, sellerId);
  }
  if (operation === 'upsert') {
    scoped.where = scopeWhere(scoped.where, sellerId);
    scoped.create = scopeData(scoped.create ?? {}, sellerId);
    checkUpdateData(scoped.update, sellerId);
  }
  return scoped;
};
