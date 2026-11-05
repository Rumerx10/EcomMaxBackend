import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws a descriptive error when DATABASE_URL is not set', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(
      Test.createTestingModule({ providers: [PrismaService] }).compile(),
    ).rejects.toThrow('DATABASE_URL is not set');
  });

  it('is created without connecting when DATABASE_URL is set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');

    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    const prisma = moduleRef.get(PrismaService);

    // PrismaClient's constructor returns a Proxy, so `instanceof` (and
    // toBeInstanceOf) don't work on it; check the client API instead.
    expect(typeof prisma.$queryRaw).toBe('function');
  });
});
