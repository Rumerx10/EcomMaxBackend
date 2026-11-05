import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { hashPassword } from '../../common/utils/password.js';
import type { Seller } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RESERVED_SLUGS } from '../../tenant/host.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { USER_PUBLIC_FIELDS } from '../users/dto/user-response.dto.js';
import type { CreateSellerDto } from './dto/create-seller.dto.js';
import type {
  SellerCreatedDto,
  StoreProfileDto,
  StoreSettingsDto,
} from './dto/store-response.dto.js';
import type { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';

// Stores themselves. The sellers table is the tenant list, so this service works on it with
// the plain PrismaService and an explicit seller id; every change clears the store cache.
@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  // A new store with its order counter and owner account, all or nothing.
  async createSeller(dto: CreateSellerDto): Promise<SellerCreatedDto> {
    if (RESERVED_SLUGS.has(dto.slug)) {
      throw new BadRequestException(
        `"${dto.slug}" is reserved. Choose another slug.`,
      );
    }
    const passwordHash = await hashPassword(dto.owner.password);
    const { seller, owner } = await this.prisma.$transaction(async (tx) => {
      const seller = await tx.seller.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          email: dto.email,
          phone: dto.phone,
          address: dto.address ?? null,
          status: dto.status ?? 'PENDING',
        },
      });
      await tx.orderCounter.create({ data: { sellerId: seller.id } });
      const owner = await tx.user.create({
        data: {
          sellerId: seller.id,
          role: 'OWNER',
          name: dto.owner.name,
          phone: dto.owner.phone,
          email: dto.owner.email ?? null,
          passwordHash,
        },
        select: USER_PUBLIC_FIELDS,
      });
      return { seller, owner };
    });
    // A cached "no store here" answer for the new slug must not linger.
    this.tenants.invalidate();
    return { store: await this.toSettings(seller), owner };
  }

  async setStatus(
    sellerId: string,
    status: Seller['status'],
  ): Promise<StoreSettingsDto> {
    const seller = await this.prisma.seller.update({
      where: { id: sellerId },
      data: { status },
    });
    this.tenants.invalidate();
    return this.toSettings(seller);
  }

  async listSellers(): Promise<StoreSettingsDto[]> {
    const sellers = await this.prisma.seller.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return Promise.all(sellers.map((seller) => this.toSettings(seller)));
  }

  async getProfile(sellerId: string): Promise<StoreProfileDto> {
    return this.toProfile(await this.requireSeller(sellerId));
  }

  async getSettings(sellerId: string): Promise<StoreSettingsDto> {
    return this.toSettings(await this.requireSeller(sellerId));
  }

  async updateSettings(
    sellerId: string,
    dto: UpdateStoreSettingsDto,
  ): Promise<StoreSettingsDto> {
    const seller = await this.prisma.seller.update({
      where: { id: sellerId },
      data: dto,
    });
    this.tenants.invalidate();
    return this.toSettings(seller);
  }

  private async requireSeller(sellerId: string): Promise<Seller> {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Store not found');
    return seller;
  }

  private async toProfile(seller: Seller): Promise<StoreProfileDto> {
    const primary = await this.prisma.sellerDomain.findFirst({
      where: {
        sellerId: seller.id,
        isPrimary: true,
        verifiedAt: { not: null },
      },
      select: { hostname: true },
    });
    return {
      id: seller.id,
      name: seller.name,
      slug: seller.slug,
      logoUrl: seller.logoUrl,
      brandColor: seller.brandColor,
      currency: seller.currency,
      email: seller.email,
      phone: seller.phone,
      address: seller.address,
      supportHours: seller.supportHours,
      taxRate: fixed2(seller.taxRate),
      installationFee: fixed2(seller.installationFee),
      primaryHost: primary?.hostname ?? this.tenants.platformHost(seller.slug),
    };
  }

  private async toSettings(seller: Seller): Promise<StoreSettingsDto> {
    return Object.assign(await this.toProfile(seller), {
      status: seller.status,
      lowStockThreshold: seller.lowStockThreshold,
      taxId: seller.taxId,
      invoiceNote: seller.invoiceNote,
      notifyNewOrder: seller.notifyNewOrder,
      notifyLowStock: seller.notifyLowStock,
      notifyWeeklySummary: seller.notifyWeeklySummary,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
    });
  }
}
