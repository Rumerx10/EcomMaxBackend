import { Injectable, NotFoundException } from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import type { ShippingRate } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type {
  CreateShippingRateDto,
  ShippingRateDto,
  UpdateShippingRateDto,
} from './shipping.dto.js';

export const toShippingRateDto = (rate: ShippingRate): ShippingRateDto => ({
  id: rate.id,
  name: rate.name,
  description: rate.description,
  price: fixed2(rate.price),
  estimate: rate.estimate,
  sortOrder: rate.sortOrder,
  isActive: rate.isActive,
});

// Delivery options offered at checkout. Orders copy the name and price, so changing or
// deleting a rate never changes a past order.
@Injectable()
export class ShippingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async list(staff: boolean): Promise<ShippingRateDto[]> {
    const rates = await this.db.shippingRate.findMany({
      where: staff ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
    return rates.map(toShippingRateDto);
  }

  async create(dto: CreateShippingRateDto): Promise<ShippingRateDto> {
    const rate = await this.db.shippingRate.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        estimate: dto.estimate,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    return toShippingRateDto(rate);
  }

  async update(
    id: string,
    dto: UpdateShippingRateDto,
  ): Promise<ShippingRateDto> {
    await this.require(id);
    return toShippingRateDto(
      await this.db.shippingRate.update({ where: { id }, data: dto }),
    );
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.db.shippingRate.delete({ where: { id } });
  }

  private async require(id: string) {
    const rate = await this.db.shippingRate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!rate) throw new NotFoundException('Shipping rate not found');
  }
}
