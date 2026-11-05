import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { SellerStatus } from '../generated/prisma/client.js';

// The parts of a seller every request needs; cached by TenantService.
export interface TenantSeller {
  id: string;
  slug: string;
  name: string;
  status: SellerStatus;
  currency: string;
}

export interface TenantStore {
  // The store host the request named (X-Seller-Host, else Origin, else Host), normalised.
  host: string | null;
  // The seller served at that host, or null when no store matches.
  seller: TenantSeller | null;
}

// Holds the current request's seller for everything that runs during the request, including
// TenantPrismaService, without passing it through every call. TenantMiddleware fills it.
@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  get store(): TenantStore | undefined {
    return this.storage.getStore();
  }

  get seller(): TenantSeller | null {
    return this.storage.getStore()?.seller ?? null;
  }

  // For code that must only ever run inside a store's request; fails closed otherwise.
  requireSeller(): TenantSeller {
    const seller = this.seller;
    if (!seller) {
      throw new InternalServerErrorException(
        'No store is set for this request',
      );
    }
    return seller;
  }
}
