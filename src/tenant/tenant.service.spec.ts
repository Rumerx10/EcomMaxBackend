import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TenantService } from './tenant.service.js';

const nextPower = {
  id: 's1',
  slug: 'next-power',
  name: 'NextPower',
  status: 'ACTIVE',
  currency: 'BDT',
};

describe('TenantService', () => {
  const prisma = {
    seller: { findUnique: vi.fn() },
    sellerDomain: { findUnique: vi.fn() },
  };
  const config = { get: () => 'myplatform.com' } as unknown as ConfigService<
    any,
    true
  >;
  let service: TenantService;

  beforeEach(() => {
    vi.useRealTimers();
    prisma.seller.findUnique.mockReset().mockResolvedValue(nextPower);
    prisma.sellerDomain.findUnique.mockReset();
    service = new TenantService(prisma as unknown as PrismaService, config);
  });

  it('finds a platform subdomain by slug', async () => {
    await expect(service.resolve('next-power.myplatform.com')).resolves.toEqual(
      nextPower,
    );
    expect(prisma.seller.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'next-power' } }),
    );
  });

  it('does not treat deeper subdomains or the bare platform domain as stores', async () => {
    await expect(service.resolve('a.b.myplatform.com')).resolves.toBeNull();
    prisma.sellerDomain.findUnique.mockResolvedValue(null);
    await expect(service.resolve('myplatform.com')).resolves.toBeNull();
    expect(prisma.seller.findUnique).not.toHaveBeenCalled();
  });

  it('serves a custom domain only once it is verified', async () => {
    prisma.sellerDomain.findUnique.mockResolvedValueOnce({
      verifiedAt: null,
      seller: nextPower,
    });
    await expect(service.resolve('shop.example.com')).resolves.toBeNull();

    service.invalidate();
    prisma.sellerDomain.findUnique.mockResolvedValueOnce({
      verifiedAt: new Date(),
      seller: nextPower,
    });
    await expect(service.resolve('shop.example.com')).resolves.toEqual(
      nextPower,
    );
  });

  it('caches answers and refreshes them after the TTL', async () => {
    vi.useFakeTimers();
    await service.resolve('next-power.myplatform.com');
    await service.resolve('next-power.myplatform.com');
    expect(prisma.seller.findUnique).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TenantService.TTL_MS + 1);
    await service.resolve('next-power.myplatform.com');
    expect(prisma.seller.findUnique).toHaveBeenCalledTimes(2);
  });

  it('forgets everything on invalidate', async () => {
    await service.resolve('next-power.myplatform.com');
    service.invalidate();
    await service.resolve('next-power.myplatform.com');
    expect(prisma.seller.findUnique).toHaveBeenCalledTimes(2);
  });
});
