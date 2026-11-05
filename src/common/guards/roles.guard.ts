import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../interfaces/request-with-user.interface.js';

// Global guard, after JwtAuthGuard: enforces @Roles(...) where a route declares it.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required?.length) return true;

    const { user } = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!user) throw new UnauthorizedException('Sign in to continue');
    if (!required.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this');
    }
    return true;
  }
}
