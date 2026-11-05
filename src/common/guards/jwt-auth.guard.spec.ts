import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  TenantContext,
  type TenantSeller,
} from '../../tenant/tenant.context.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { fakeContext, fakeRequest } from '../testing/execution-context.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const storeA: TenantSeller = {
  id: 'store-a',
  slug: 'a',
  name: 'A',
  status: 'ACTIVE',
  currency: 'BDT',
};
const storeB: TenantSeller = { ...storeA, id: 'store-b', slug: 'b' };

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({
    secret: 'test-secret-'.repeat(4),
    signOptions: { expiresIn: 60 },
  });
  const context = new TenantContext();
  const guard = new JwtAuthGuard(new Reflector(), jwt, context);

  const run = async (store: TenantSeller, token?: string, isPublic = false) => {
    const request: Record<string, any> = fakeRequest(
      token ? { authorization: `Bearer ${token}` } : {},
    );
    const result = await context.run({ host: store.slug, seller: store }, () =>
      guard.canActivate(
        fakeContext(request, isPublic ? { [IS_PUBLIC_KEY]: true } : {}),
      ),
    );
    return { result, user: request.user };
  };
  const tokenFor = (sellerId: string) =>
    jwt.signAsync({ sub: 'user-1', sellerId, role: 'CUSTOMER' });

  it('accepts a token from the same store and sets req.user', async () => {
    const { result, user } = await run(storeA, await tokenFor(storeA.id));
    expect(result).toBe(true);
    expect(user).toEqual({
      id: 'user-1',
      sellerId: storeA.id,
      role: 'CUSTOMER',
    });
  });

  it('refuses a token issued by another store', async () => {
    await expect(run(storeB, await tokenFor(storeA.id))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a missing, forged or expired token on private routes', async () => {
    await expect(run(storeA)).rejects.toBeInstanceOf(UnauthorizedException);
    const forged = await new JwtService({
      secret: 'another-secret-'.repeat(3),
    }).signAsync({
      sub: 'user-1',
      sellerId: storeA.id,
      role: 'OWNER',
    });
    await expect(run(storeA, forged)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const expired = await jwt.signAsync(
      { sub: 'user-1', sellerId: storeA.id, role: 'CUSTOMER' },
      { expiresIn: -10 },
    );
    await expect(run(storeA, expired)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets anonymous callers and bad tokens through on public routes, without a user', async () => {
    expect(await run(storeA, undefined, true)).toEqual({
      result: true,
      user: undefined,
    });
    expect(await run(storeB, await tokenFor(storeA.id), true)).toEqual({
      result: true,
      user: undefined,
    });
  });

  it('still identifies a signed-in caller on public routes', async () => {
    const { user } = await run(storeA, await tokenFor(storeA.id), true);
    expect(user?.id).toBe('user-1');
  });
});
