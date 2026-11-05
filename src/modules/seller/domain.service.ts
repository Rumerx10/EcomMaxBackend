import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import type { SellerDomain } from '../../generated/prisma/client.js';
import { normalizeHost } from '../../tenant/host.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import type { DomainResponseDto } from './dto/domain.dto.js';

// Looks up TXT records; replaced in tests so they need no real DNS.
export const DNS_TXT_RESOLVER = Symbol('DNS_TXT_RESOLVER');
export type TxtResolver = (name: string) => Promise<string[][]>;
export const defaultTxtResolver: TxtResolver = (name) => resolveTxt(name);

export const MAX_DOMAINS_PER_STORE = 10;
const RECORD_PREFIX = '_store-verification';

const toResponse = (domain: SellerDomain): DomainResponseDto => ({
  id: domain.id,
  hostname: domain.hostname,
  isPrimary: domain.isPrimary,
  verifiedAt: domain.verifiedAt,
  verification: {
    type: 'TXT',
    name: `${RECORD_PREFIX}.${domain.hostname}`,
    value: `store-verification=${domain.verificationToken}`,
  },
  createdAt: domain.createdAt,
});

// A store's custom domains. A domain serves the store only after the owner proves control of
// it with a DNS TXT record, so nobody can claim someone else's domain; hostnames are unique
// across the platform.
@Injectable()
export class DomainService {
  private readonly platformDomain: string;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenants: TenantService,
    @Inject(DNS_TXT_RESOLVER) private readonly resolveTxtRecords: TxtResolver,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.platformDomain = config.get('PLATFORM_DOMAIN', { infer: true });
  }

  private get db() {
    return this.tenantPrisma.db;
  }

  async list(): Promise<DomainResponseDto[]> {
    const domains = await this.db.sellerDomain.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return domains.map(toResponse);
  }

  async add(rawHostname: string): Promise<DomainResponseDto> {
    const hostname = normalizeHost(rawHostname);
    if (!hostname || !hostname.includes('.')) {
      throw new BadRequestException('Enter a domain such as shop.example.com');
    }
    if (
      hostname === this.platformDomain ||
      hostname.endsWith(`.${this.platformDomain}`)
    ) {
      throw new BadRequestException(
        `Subdomains of ${this.platformDomain} come with the store; add your own domain instead`,
      );
    }
    if ((await this.db.sellerDomain.count()) >= MAX_DOMAINS_PER_STORE) {
      throw new ConflictException(
        `A store can have at most ${MAX_DOMAINS_PER_STORE} domains`,
      );
    }
    const domain = await this.db.sellerDomain.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        hostname,
        verificationToken: randomBytes(16).toString('hex'),
      },
    });
    return toResponse(domain);
  }

  // Looks for the TXT record now. The first verified domain becomes the primary one.
  async verify(id: string): Promise<DomainResponseDto> {
    const domain = await this.requireDomain(id);
    if (domain.verifiedAt) return toResponse(domain);

    const { name, value } = toResponse(domain).verification;
    const records = await this.resolveTxtRecords(name).catch(
      () => [] as string[][],
    );
    if (!records.some((chunks) => chunks.join('') === value)) {
      throw new UnprocessableEntityException(
        `No TXT record "${value}" found at ${name} yet. DNS changes can take a while to spread.`,
      );
    }
    const hasPrimary =
      (await this.db.sellerDomain.count({ where: { isPrimary: true } })) > 0;
    const verified = await this.db.sellerDomain.update({
      where: { id },
      data: { verifiedAt: new Date(), isPrimary: !hasPrimary },
    });
    this.tenants.invalidate();
    return toResponse(verified);
  }

  async makePrimary(id: string): Promise<DomainResponseDto> {
    const domain = await this.requireDomain(id);
    if (!domain.verifiedAt) {
      throw new BadRequestException(
        'Verify the domain before making it the primary one',
      );
    }
    // Clear the old primary first: a partial unique index allows only one per store.
    const [, primary] = await this.db.$transaction([
      this.db.sellerDomain.updateMany({
        where: { isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      }),
      this.db.sellerDomain.update({ where: { id }, data: { isPrimary: true } }),
    ]);
    return toResponse(primary);
  }

  async remove(id: string): Promise<void> {
    await this.requireDomain(id);
    await this.db.sellerDomain.delete({ where: { id } });
    this.tenants.invalidate();
  }

  private async requireDomain(id: string): Promise<SellerDomain> {
    const domain = await this.db.sellerDomain.findUnique({ where: { id } });
    if (!domain) throw new NotFoundException('Domain not found');
    return domain;
  }
}
