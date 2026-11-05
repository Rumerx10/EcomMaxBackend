import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';

export const PLATFORM_KEY_HEADER = 'x-platform-key';

// Protects the platform routes (creating and suspending stores) until there is a platform
// admin with accounts of its own. Without PLATFORM_API_KEY the routes don't exist at all.
@Injectable()
export class PlatformKeyGuard implements CanActivate {
  private readonly key?: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const key = config.get('PLATFORM_API_KEY', { infer: true });
    this.key = key ? Buffer.from(key) : undefined;
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.key) throw new NotFoundException();
    const given = Buffer.from(
      ctx.switchToHttp().getRequest<Request>().header(PLATFORM_KEY_HEADER) ??
        '',
    );
    // Constant-time comparison, so response times don't reveal how much of a guess was right.
    if (given.length !== this.key.length || !timingSafeEqual(given, this.key)) {
      throw new ForbiddenException('A valid X-Platform-Key header is required');
    }
    return true;
  }
}
