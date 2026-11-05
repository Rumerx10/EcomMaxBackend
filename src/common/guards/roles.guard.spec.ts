import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { fakeContext } from '../testing/execution-context.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const check = (user: unknown, roles?: string[]) =>
    guard.canActivate(
      fakeContext({ user }, roles ? { [ROLES_KEY]: roles } : {}),
    );

  it('allows routes without @Roles', () => {
    expect(check(undefined)).toBe(true);
  });

  it('allows a matching role', () => {
    expect(
      check({ id: 'u', sellerId: 's', role: 'MANAGER' }, ['OWNER', 'MANAGER']),
    ).toBe(true);
  });

  it('refuses other roles with 403 and anonymous callers with 401', () => {
    expect(() =>
      check({ id: 'u', sellerId: 's', role: 'CUSTOMER' }, ['OWNER']),
    ).toThrow(ForbiddenException);
    expect(() => check(undefined, ['OWNER'])).toThrow(UnauthorizedException);
  });
});
