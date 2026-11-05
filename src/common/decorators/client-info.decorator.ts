import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Where a request came from, kept on sessions so users can recognise their devices.
// The IP is only right behind a proxy when TRUST_PROXY is set.
export interface ClientInfo {
  userAgent: string | null;
  ipAddress: string | null;
}

export const Client = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return {
      userAgent: req.header('user-agent')?.slice(0, 255) ?? null,
      ipAddress: req.ip ?? null,
    };
  },
);
