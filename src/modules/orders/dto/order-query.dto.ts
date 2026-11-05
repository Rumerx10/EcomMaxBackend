import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { CursorQueryDto } from '../../../common/dto/cursor-query.dto.js';
import {
  OrderStatus,
  PaymentStatus,
} from '../../../generated/prisma/client.js';

export class MyOrdersQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;
}

export class StoreOrdersQueryDto extends MyOrdersQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ description: 'An order number, or a phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  search?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Placed on or after',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Placed before' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsIn(Object.values(OrderStatus))
  status: OrderStatus;

  @ApiPropertyOptional({
    example: 'Handed to Pathao, tracking 123456',
    maxLength: 300,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 300)
  note?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'For CANCELLED and RETURNED: put the items back in stock',
  })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

export class UpdatePaymentDto {
  @ApiProperty({
    enum: ['PAID', 'REFUNDED'],
    description: 'Money received, or given back',
  })
  @IsIn(['PAID', 'REFUNDED'])
  status: 'PAID' | 'REFUNDED';
}
