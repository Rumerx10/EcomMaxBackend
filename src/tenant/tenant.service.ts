import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TenantSeller } from './tenant.context.js';

const SELLER_FIELDS = {
  id: true,
  slug: true,
  name: true,
  status: true,
  currency: true,
} as const;

interface CacheEntry {
  seller: TenantSeller | null;
  expiresAt: number;
}

// Finds the seller a host belongs to: <slug>.<PLATFORM_DOMAIN> by slug, any other host by a
// verified SellerDomain. Answers are cached per host, so most requests need no query.
// Each API instance has its own cache, so a change reaches every instance within TTL_MS.
@Injectable()
export class TenantService {
  static readonly TTL_MS = 60_000;
  // Unknown hosts are cached briefly too, so random Host headers can't hammer the database.
  static readonly MISS_TTL_MS = 10_000;
  static readonly MAX_ENTRIES = 10_000;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly platformSuffix: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.platformSuffix = `.${config.get('PLATFORM_DOMAIN', { infer: true })}`;
  }

  async resolve(host: string): Promise<TenantSeller | null> {
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > Date.now()) return cached.seller;

    const seller = await this.lookup(host);
    if (this.cache.size >= TenantService.MAX_ENTRIES) {
      // Maps keep insertion order, so the first key is the oldest entry.
      this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(host, {
      seller,
      expiresAt:
        Date.now() +
        (seller ? TenantService.TTL_MS : TenantService.MISS_TTL_MS),
    });
    return seller;
  }

  // The platform subdomain of a slug, e.g. next-power.myplatform.com.
  platformHost(slug: string): string {
    return `${slug}${this.platformSuffix}`;
  }

  // Call after a seller's status, slug or domains change.
  invalidate(): void {
    this.cache.clear();
  }

  private async lookup(host: string): Promise<TenantSeller | null> {
    if (host.endsWith(this.platformSuffix)) {
      const slug = host.slice(0, -this.platformSuffix.length);
      if (!slug || slug.includes('.')) return null;
      return this.prisma.seller.findUnique({
        where: { slug },
        select: SELLER_FIELDS,
      });
    }
    const domain = await this.prisma.sellerDomain.findUnique({
      where: { hostname: host },
      select: { verifiedAt: true, seller: { select: SELLER_FIELDS } },
    });
    return domain?.verifiedAt ? domain.seller : null;
  }
}
