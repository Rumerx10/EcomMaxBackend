import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { TenantSeller } from './tenant.context.js';

export const NO_TENANT_KEY = 'noTenant';
export const ALLOW_PENDING_STORE_KEY = 'allowPendingStore';
export const CURRENT_SELLER_KEY = 'currentSeller';

// For routes that are not tied to one store: health checks, platform onboarding, payment
// webhooks that find their seller from the payment itself.
export const NoTenant = () => SetMetadata(NO_TENANT_KEY, true);

// Lets a store that is not live yet (status PENDING) use the route, e.g. so its owner can sign
// in and set it up. Routes limited to OWNER/MANAGER are allowed for pending stores already.
export const AllowPendingStore = () =>
  SetMetadata(ALLOW_PENDING_STORE_KEY, true);

// The store this request is for, as resolved by TenantMiddleware and checked by TenantGuard.
export const CurrentSeller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantSeller =>
    ctx.switchToHttp().getRequest<{ seller: TenantSeller }>().seller,
);
