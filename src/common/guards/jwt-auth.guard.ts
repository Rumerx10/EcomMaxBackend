import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { TenantContext } from '../../tenant/tenant.context.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type {
  AccessTokenPayload,
  RequestWithUser,
} from '../interfaces/request-with-user.interface.js';

// Global guard, after TenantGuard. Checks the Bearer access token and sets req.user. A token
// only works at the store it was issued by, so a token from store A is refused at store B.
// Routes marked @Public() let anonymous callers through but still read a valid token.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly context: TenantContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const [scheme, token] = req.header('authorization')?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Sign in to continue');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      const seller = this.context.seller;
      if (!seller || payload.sellerId !== seller.id)
        throw new Error('token from another store');
      req.user = {
        id: payload.sub,
        sellerId: payload.sellerId,
        role: payload.role,
      };
      return true;
    } catch {
      // An expired token on a public page should not break browsing; the caller is anonymous.
      if (isPublic) return true;
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    }
  }
}
