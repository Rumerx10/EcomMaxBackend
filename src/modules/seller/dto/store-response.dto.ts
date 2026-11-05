import { ApiProperty } from '@nestjs/swagger';
import { SellerStatus } from '../../../generated/prisma/client.js';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

// What any storefront may show: header, footer, contact page, checkout fees.
export class StoreProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'NextPower' })
  name: string;

  @ApiProperty({ example: 'next-power' })
  slug: string;

  @ApiProperty({ nullable: true, type: String })
  logoUrl: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '#1d4ed8',
    description:
      "The store's own colour; the seller centre themes itself with it",
  })
  brandColor: string | null;

  @ApiProperty({ example: 'BDT' })
  currency: string;

  @ApiProperty({ example: 'support@nextpower.com.bd' })
  email: string;

  @ApiProperty({ example: '+8809612345678' })
  phone: string;

  @ApiProperty({ nullable: true, type: String })
  address: string | null;

  @ApiProperty({ nullable: true, type: String })
  supportHours: string | null;

  @ApiProperty({ example: '5.00', description: 'VAT in percent' })
  taxRate: string;

  @ApiProperty({ example: '15000.00', nullable: true, type: String })
  installationFee: string | null;

  @ApiProperty({
    example: 'next-power.myplatform.com',
    description:
      'The primary custom domain if verified, else the platform subdomain',
  })
  primaryHost: string;
}

// The full settings, for the store's own staff.
export class StoreSettingsDto extends StoreProfileDto {
  @ApiProperty({ enum: SellerStatus })
  status: SellerStatus;

  @ApiProperty({ example: 5 })
  lowStockThreshold: number;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'VAT registration (BIN), printed on invoices',
  })
  taxId: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Printed at the foot of every invoice',
  })
  invoiceNote: string | null;

  @ApiProperty()
  notifyNewOrder: boolean;

  @ApiProperty()
  notifyLowStock: boolean;

  @ApiProperty()
  notifyWeeklySummary: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SellerCreatedDto {
  @ApiProperty({ type: StoreSettingsDto })
  store: StoreSettingsDto;

  @ApiProperty({ type: UserResponseDto })
  owner: UserResponseDto;
}
