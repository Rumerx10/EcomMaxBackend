import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../generated/prisma/client.js';
import { AuthResponseDto } from '../../auth/dto/auth-response.dto.js';

export class OrderItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({ example: 'Lynx Home Battery' })
  title: string;

  @ApiProperty({ example: 'LX-F6.4' })
  sku: string;

  @ApiProperty({ nullable: true, type: String, example: 'Capacity: 9.6 kWh' })
  variant: string | null;

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;

  @ApiProperty({ example: '245000.00' })
  unitPrice: string;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiProperty({ example: '245000.00' })
  totalPrice: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Staff only',
  })
  unitCost?: string | null;
}

export class OrderEventDto {
  @ApiProperty({ enum: OrderStatus, nullable: true })
  status: OrderStatus | null;

  @ApiProperty({ example: 'Shipped' })
  title: string;

  @ApiProperty({ nullable: true, type: String })
  note: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class OrderPaymentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ example: '257250.00' })
  amount: string;

  @ApiProperty({ nullable: true, type: String })
  transactionId: string | null;

  @ApiProperty({ nullable: true, type: Date })
  paidAt: Date | null;
}

export class OrderShippingDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  district: string;

  @ApiProperty()
  thana: string;

  @ApiProperty()
  villageOrWard: string;

  @ApiProperty({ nullable: true, type: String })
  addressLine: string | null;

  @ApiProperty({ nullable: true, type: String })
  postCode: string | null;

  @ApiProperty({ example: 'Inside Dhaka' })
  method: string;
}

class OrderCustomerDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;
}

// One order in a list.
export class OrderSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 1001, description: 'Counts per store' })
  orderNumber: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus: PaymentStatus;

  @ApiProperty({ example: 'BDT' })
  currency: string;

  @ApiProperty({ example: '257250.00' })
  totalAmount: string;

  @ApiProperty({ example: 3 })
  itemCount: number;

  @ApiProperty({
    example: ['/api/v1/uploads/0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f'],
    description: 'Pictures of the first few items',
  })
  previewImages: string[];

  @ApiProperty({
    nullable: true,
    type: Date,
    description: 'When the latest payment was received',
  })
  paidAt: Date | null;

  @ApiProperty({ example: 'Rahim Uddin' })
  shipName: string;

  @ApiPropertyOptional({ type: OrderCustomerDto, description: 'Staff only' })
  customer?: OrderCustomerDto;

  @ApiProperty()
  createdAt: Date;
}

export class OrderDto extends OrderSummaryDto {
  @ApiProperty({ example: '245000.00' })
  subtotal: string;

  @ApiProperty({ example: '0.00' })
  discountAmount: string;

  @ApiProperty({ example: '80.00' })
  shippingAmount: string;

  @ApiProperty({ example: '0.00' })
  installationFee: string;

  @ApiProperty({ example: '12250.00' })
  taxAmount: string;

  @ApiProperty({ nullable: true, type: String, example: 'SAVE10' })
  couponCode: string | null;

  @ApiProperty({ nullable: true, type: String })
  note: string | null;

  @ApiProperty({ type: OrderShippingDto })
  shipping: OrderShippingDto;

  @ApiProperty({ type: [OrderItemDto] })
  items: OrderItemDto[];

  @ApiProperty({
    type: [OrderEventDto],
    description: 'The timeline, oldest first',
  })
  events: OrderEventDto[];

  @ApiProperty({ type: [OrderPaymentDto] })
  payments: OrderPaymentDto[];

  @ApiProperty({ nullable: true, type: String })
  cancelReason: string | null;

  @ApiProperty({ nullable: true, type: Date })
  cancelledAt: Date | null;

  @ApiProperty()
  updatedAt: Date;
}

class PaymentBucketDto {
  @ApiProperty({ example: 12 })
  count: number;

  @ApiProperty({ example: '540000.00' })
  amount: string;
}

// Counts for the seller's orders and payments pages, over all of the store's orders.
export class StoreOrdersSummaryDto {
  @ApiProperty({ example: 41 })
  orders: number;

  @ApiProperty({
    example: {
      PENDING: 3,
      PROCESSING: 2,
      SHIPPED: 5,
      DELIVERED: 30,
      CANCELLED: 1,
      RETURNED: 0,
    },
  })
  byStatus: Record<OrderStatus, number>;

  @ApiProperty({
    example: {
      PENDING: { count: 8, amount: '384000.00' },
      PAID: { count: 30, amount: '1440000.00' },
      FAILED: { count: 1, amount: '48000.00' },
      REFUNDED: { count: 0, amount: '0.00' },
    },
    description: 'FAILED includes unpaid orders that were cancelled',
  })
  byPaymentStatus: Record<PaymentStatus, PaymentBucketDto>;

  @ApiProperty({
    example: '1824000.00',
    description: 'Order totals, cancelled and returned orders left out',
  })
  revenue: string;

  @ApiProperty({ example: '48000.00' })
  averageOrder: string;

  @ApiProperty({
    example: 6,
    description: 'Cash on delivery orders still waiting for the cash',
  })
  awaitingCod: number;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderSummaryDto] })
  data: OrderSummaryDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}

export class CheckoutResponseDto {
  @ApiProperty({ type: OrderDto })
  order: OrderDto;

  @ApiProperty({
    type: AuthResponseDto,
    nullable: true,
    description: 'For guests: their account is signed in with these tokens',
  })
  auth: AuthResponseDto | null;

  @ApiProperty({
    description:
      'false when the same Idempotency-Key was sent before and this is that order',
  })
  created: boolean;
}
