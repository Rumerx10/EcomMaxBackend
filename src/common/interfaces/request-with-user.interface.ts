import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client.js';

// What a valid access token says about the caller. JwtAuthGuard sets it on the request.
export interface AuthUser {
  id: string;
  sellerId: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  sellerId: string;
  role: Role;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
}
