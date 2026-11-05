import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Address } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../tenant/tenant-prisma.service.js';
import type {
  AddressDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './addresses.dto.js';

export const MAX_ADDRESSES = 20;

export const toAddressDto = (address: Address): AddressDto => ({
  id: address.id,
  label: address.label,
  name: address.name,
  phone: address.phone,
  district: address.district,
  thana: address.thana,
  villageOrWard: address.villageOrWard,
  addressLine: address.addressLine,
  postCode: address.postCode,
  isDefault: address.isDefault,
});

// A user's address book. Exactly one address is the default once there is any: the database
// allows at most one (partial unique index), and the first address and the replacement for a
// deleted default are made default here.
@Injectable()
export class AddressesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async list(userId: string): Promise<AddressDto[]> {
    const addresses = await this.db.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map(toAddressDto);
  }

  create(userId: string, dto: CreateAddressDto): Promise<AddressDto> {
    return this.db.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw new ConflictException(
          `You can save at most ${MAX_ADDRESSES} addresses`,
        );
      }
      return toAddressDto(
        await this.insert(tx, userId, dto, count === 0 || !!dto.isDefault),
      );
    });
  }

  // Saves an address inside a caller's transaction (checkout). It becomes the default when
  // asked to, or when it is the user's first.
  async insert(
    tx: TenantTransactionClient,
    userId: string,
    dto: CreateAddressDto,
    makeDefault: boolean,
  ): Promise<Address> {
    const isDefault =
      makeDefault || (await tx.address.count({ where: { userId } })) === 0;
    if (isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        userId,
        label: dto.label ?? null,
        name: dto.name,
        phone: dto.phone,
        district: dto.district,
        thana: dto.thana,
        villageOrWard: dto.villageOrWard,
        addressLine: dto.addressLine ?? null,
        postCode: dto.postCode ?? null,
        isDefault,
      },
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    await this.require(userId, id);
    return this.db.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      // Unsetting the default here would leave none; pick another default to do that.
      const { isDefault, ...fields } = dto;
      const address = await tx.address.update({
        where: { id },
        data: { ...fields, ...(isDefault ? { isDefault: true } : {}) },
      });
      return toAddressDto(address);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const address = await this.require(userId, id);
    await this.db.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next)
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
      }
    });
  }

  async require(userId: string, id: string): Promise<Address> {
    const address = await this.db.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }
}
