import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithUser } from '../../common/interfaces/request-with-user.interface.js';

export const GUEST_TOKEN_HEADER = 'x-guest-token';
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Who owns a cart or wishlist: a signed-in user, or a visitor known only by a guest token.
export type Shopper =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestToken: string | null };

// The visitor's guest token is a random secret the API hands out with the first guest cart or
// wishlist; the frontend keeps it (e.g. in a cookie) and sends it back as X-Guest-Token.
export const newGuestToken = () => randomBytes(32).toString('base64url');

export const readGuestToken = (req: Request): string | null => {
  const token = req.header(GUEST_TOKEN_HEADER);
  if (token === undefined || token === '') return null;
  if (!GUEST_TOKEN_PATTERN.test(token)) {
    throw new BadRequestException(
      'X-Guest-Token is not a token this API issued',
    );
  }
  return token;
};

// Signed in wins over a guest token; the guest cart is merged in with POST /cart/merge.
export const CurrentShopper = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Shopper => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (req.user) return { kind: 'user', userId: req.user.id };
    return { kind: 'guest', guestToken: readGuestToken(req) };
  },
);
