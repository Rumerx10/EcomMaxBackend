import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../generated/prisma/client.js';

// One print run: a day's packing is rarely more, and the page stays quick to render.
export const MAX_INVOICES = 50;

export class InvoicesQueryDto {
  @ApiPropertyOptional({
    type: String,
    example:
      '0192e0b4-8f3a-7cc1-9a1e-3f2b1c4d5e6f,0192e0b4-8f3a-7cc1-9a1e-3f2b1c4d5e70',
    description: `Order ids, comma separated, at most ${MAX_INVOICES}`,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? [
          ...new Set(
            value
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        ]
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_INVOICES)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    enum: OrderStatus,
    description: `Instead of ids: the orders in this status, oldest first, at most ${MAX_INVOICES}`,
  })
  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;
}

// The store as an invoice shows it: who sold, and how to reach them.
export class InvoiceStoreDto {
  @ApiProperty({ example: 'NextPower' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  logoUrl: string | null;

  @ApiProperty({ nullable: true, type: String })
  address: string | null;

  @ApiProperty({ example: '+8809612345678' })
  phone: string;

  @ApiProperty({ example: 'support@nextpower.com.bd' })
  email: string;

  @ApiProperty({
    example: 'nextpower.com.bd',
    description: 'The primary domain, else the platform subdomain',
  })
  website: string;

  @ApiProperty({ nullable: true, type: String, example: '000123456-0101' })
  taxId: string | null;

  @ApiProperty({ nullable: true, type: String })
  invoiceNote: string | null;

  @ApiProperty({ example: 'BDT' })
  currency: string;
}

class InvoiceAddressDto {
  @ApiProperty({ example: 'Rahim Uddin' })
  name: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiProperty({ example: 'Dhaka' })
  district: string;

  @ApiProperty({ example: 'Mirpur' })
  thana: string;

  @ApiProperty({ example: 'Ward 6' })
  villageOrWard: string;

  @ApiProperty({ nullable: true, type: String, example: 'House 12, Road 3' })
  addressLine: string | null;

  @ApiProperty({ nullable: true, type: String, example: '1216' })
  postCode: string | null;
}

class InvoiceItemDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  sku: string;

  @ApiProperty({ nullable: true, type: String })
  variant: string | null;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: '145000.00' })
  unitPrice: string;

  @ApiProperty({ example: '290000.00' })
  totalPrice: string;
}

export class InvoiceDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty({ example: 1163, description: 'Also the invoice number' })
  orderNumber: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus: PaymentStatus;

  @ApiProperty({ nullable: true, type: Date })
  paidAt: Date | null;

  @ApiProperty({ nullable: true, type: String })
  customerEmail: string | null;

  @ApiProperty({ type: InvoiceAddressDto })
  shipTo: InvoiceAddressDto;

  @ApiProperty({ example: 'Standard delivery' })
  shippingMethod: string;

  @ApiProperty({ nullable: true, type: String, description: "Buyer's note" })
  note: string | null;

  @ApiProperty({ type: [InvoiceItemDto] })
  items: InvoiceItemDto[];

  @ApiProperty({ example: '290000.00' })
  subtotal: string;

  @ApiProperty({ example: '29000.00' })
  discountAmount: string;

  @ApiProperty({ nullable: true, type: String })
  couponCode: string | null;

  @ApiProperty({ example: '150.00' })
  shippingAmount: string;

  @ApiProperty({ example: '0.00' })
  installationFee: string;

  @ApiProperty({ example: '0.00' })
  taxAmount: string;

  @ApiProperty({ example: '261150.00' })
  totalAmount: string;

  @ApiProperty({ example: '0.00' })
  amountPaid: string;

  @ApiProperty({
    example: '261150.00',
    description:
      'What the courier collects: nothing once paid, cancelled or returned',
  })
  amountDue: string;
}

export class InvoiceBatchDto {
  @ApiProperty({ type: InvoiceStoreDto })
  store: InvoiceStoreDto;

  @ApiProperty({
    type: [InvoiceDto],
    description: 'In the order asked for; by status, oldest first',
  })
  invoices: InvoiceDto[];
}
