import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  AuthUser,
  RequestWithUser,
} from '../interfaces/request-with-user.interface.js';

// The signed-in user from the access token, or one of its fields: @GetUser('id').
// Undefined on public routes when nobody is signed in.
export const GetUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<RequestWithUser>().user;
    return field ? user?.[field] : user;
  },
);
