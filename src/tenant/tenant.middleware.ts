import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { normalizeHost } from './host.js';
import { TenantContext, type TenantStore } from './tenant.context.js';
import { TenantService } from './tenant.service.js';

export const SELLER_HOST_HEADER = 'x-seller-host';

// Runs before every route. It works out which store the request is for and keeps it in
// TenantContext for the rest of the request. It never rejects a request itself; TenantGuard
// decides, because only the guard can see whether a route needs a store (@NoTenant).
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenants: TenantService,
    private readonly context: TenantContext,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      this.context.run(await this.findStore(req), () => next());
    } catch (error) {
      next(error);
    }
  }

  // Frontends name their store in X-Seller-Host, and then nothing else is consulted. Without
  // it, browsers calling the API directly send Origin. Last, a store domain proxied straight to
  // the API arrives as Host; but Host is always present (usually it is the API's own name), so
  // it only counts when it really is a store.
  private async findStore(req: Request): Promise<TenantStore> {
    const explicit = req.header(SELLER_HOST_HEADER);
    if (explicit !== undefined) {
      const host = normalizeHost(explicit);
      return { host, seller: host ? await this.tenants.resolve(host) : null };
    }

    const origin = normalizeHost(req.header('origin'));
    const fromOrigin = origin ? await this.tenants.resolve(origin) : null;
    if (fromOrigin) return { host: origin, seller: fromOrigin };

    const direct = normalizeHost(req.header('host'));
    const fromHost = direct ? await this.tenants.resolve(direct) : null;
    if (fromHost) return { host: direct, seller: fromHost };

    return { host: origin, seller: null };
  }
}
