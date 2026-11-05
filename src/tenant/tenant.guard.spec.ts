import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { fakeContext } from '../common/testing/execution-context.js';
import {
  TenantContext,
  type TenantSeller,
  type TenantStore,
} from './tenant.context.js';
import { ALLOW_PENDING_STORE_KEY, NO_TENANT_KEY } from './tenant.decorators.js';
import { TenantGuard } from './tenant.guard.js';

const seller = (status: TenantSeller['status']): TenantSeller => ({
  id: 's1',
  slug: 'next-power',
  name: 'NextPower',
  status,
  currency: 'BDT',
});

describe('TenantGuard', () => {
  const context = new TenantContext();
  const guard = new TenantGuard(new Reflector(), context);
  const check = (
    store: TenantStore,
    metadata: Record<string, unknown> = {},
  ) => {
    const request: Record<string, unknown> = {};
    const result = context.run(store, () =>
      guard.canActivate(fakeContext(request, metadata)),
    );
    return { result, request };
  };

  it('lets an active store through and puts the seller on the request', () => {
    const { result, request } = check({
      host: 'a.test',
      seller: seller('ACTIVE'),
    });
    expect(result).toBe(true);
    expect(request.seller).toEqual(seller('ACTIVE'));
  });

  it('asks for the header when no store was named', () => {
    expect(() => check({ host: null, seller: null })).toThrow(
      BadRequestException,
    );
  });

  it('answers 404 for a host that is no store', () => {
    expect(() => check({ host: 'nope.test', seller: null })).toThrow(
      NotFoundException,
    );
  });

  it('skips the check on @NoTenant routes', () => {
    expect(
      check({ host: null, seller: null }, { [NO_TENANT_KEY]: true }).result,
    ).toBe(true);
  });

  it('keeps shoppers out of a pending store', () => {
    expect(() => check({ host: 'a.test', seller: seller('PENDING') })).toThrow(
      ForbiddenException,
    );
    expect(() =>
      check(
        { host: 'a.test', seller: seller('PENDING') },
        { [ROLES_KEY]: ['OWNER', 'CUSTOMER'] },
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets staff routes and sign-in through for a pending store', () => {
    const pending = { host: 'a.test', seller: seller('PENDING') };
    expect(check(pending, { [ROLES_KEY]: ['OWNER', 'MANAGER'] }).result).toBe(
      true,
    );
    expect(check(pending, { [ALLOW_PENDING_STORE_KEY]: true }).result).toBe(
      true,
    );
  });

  it('blocks suspended and closed stores for everyone', () => {
    for (const status of ['SUSPENDED', 'CLOSED'] as const) {
      expect(() =>
        check(
          { host: 'a.test', seller: seller(status) },
          { [ALLOW_PENDING_STORE_KEY]: true },
        ),
      ).toThrow(ForbiddenException);
    }
  });
});
