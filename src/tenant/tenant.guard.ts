import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../generated/prisma/client.js';
import {
  ROLES_KEY,
  STAFF_ROLES,
} from '../common/decorators/roles.decorator.js';
import { TenantContext } from './tenant.context.js';
import { ALLOW_PENDING_STORE_KEY, NO_TENANT_KEY } from './tenant.decorators.js';

// Global guard: every route serves exactly one store unless it is marked @NoTenant(). The
// store must be ACTIVE; a PENDING one is let through only for its own staff and sign-in.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: TenantContext,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(NO_TENANT_KEY, targets))
      return true;

    const { host = null, seller = null } = this.context.store ?? {};
    if (!seller) {
      throw host
        ? new NotFoundException(`No store is served at ${host}`)
        : new BadRequestException('Name the store in the X-Seller-Host header');
    }
    ctx.switchToHttp().getRequest<{ seller: unknown }>().seller = seller;

    if (seller.status === 'ACTIVE') return true;
    if (seller.status === 'PENDING') {
      const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
        ROLES_KEY,
        targets,
      );
      const staffOnly =
        !!roles?.length && roles.every((role) => STAFF_ROLES.includes(role));
      if (
        staffOnly ||
        this.reflector.getAllAndOverride<boolean>(
          ALLOW_PENDING_STORE_KEY,
          targets,
        )
      ) {
        return true;
      }
      throw new ForbiddenException('This store is not open yet');
    }
    throw new ForbiddenException('This store is not available');
  }
}
