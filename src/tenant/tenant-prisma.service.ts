import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant.context.js';
import { scopeArgs, TENANT_MODELS } from './tenant-scope.js';

const extendForTenant = (prisma: PrismaService, context: TenantContext) =>
  prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(operation, args, context.requireSeller().id));
        },
      },
    },
  });

export type TenantPrismaClient = ReturnType<typeof extendForTenant>;

// What `db.$transaction(async (tx) => ...)` hands its callback. `db` itself fits this type too,
// so helpers taking it work both inside and outside a transaction.
export type TenantTransactionClient = Omit<
  TenantPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

// The database as seen by one store: every query on a tenant model is limited to the
// current request's seller (TenantContext), and fails outright when there is none.
// Feature services use `this.tenantPrisma.db`; the raw PrismaService is only for code that
// works across stores on purpose (store lookup, onboarding).
//
// Rules for queries through `db`:
// - Creates pass `sellerId: this.tenantPrisma.sellerId` (Prisma's types require it; the
//   extension checks it is the current seller). Reads and updates can leave it out.
// - Write with scalar ids (`categoryId`), never `seller: { connect }`.
// - Compound keys take the current seller's id: { sellerId_slug: { sellerId, slug } }.
// - Avoid $queryRaw, which the extension cannot see.
@Injectable()
export class TenantPrismaService {
  readonly db: TenantPrismaClient;

  constructor(
    prisma: PrismaService,
    private readonly context: TenantContext,
  ) {
    this.db = extendForTenant(prisma, context);
  }

  // The current request's seller id; throws when the request has no store.
  get sellerId(): string {
    return this.context.requireSeller().id;
  }
}
