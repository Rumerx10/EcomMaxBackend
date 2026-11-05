import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DiscountType } from '../../generated/prisma/client.js';
import { COUPON_CODE_PATTERN, normalizeCouponCode } from './coupon-rules.js';

const toCode = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeCouponCode(value) : value;

export class CreateCouponDto {
  @ApiProperty({
    example: 'SAVE10',
    description: 'Stored in capitals; 3 to 30 letters, digits, - or _',
  })
  @Transform(toCode)
  @Matches(COUPON_CODE_PATTERN, {
    message: 'Use 3 to 30 letters, digits, - or _',
  })
  code: string;

  @ApiPropertyOptional({ example: '10% off your order' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.PERCENTAGE })
  @IsOptional()
  @IsIn(Object.values(DiscountType))
  discountType?: DiscountType;

  @ApiProperty({
    example: 10,
    description: 'Percent, or an amount for FIXED_AMOUNT',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000)
  discountValue: number;

  @ApiPropertyOptional({ example: 5000, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderAmount?: number | null;

  @ApiPropertyOptional({
    example: 2000,
    nullable: true,
    description: 'Cap for percentage coupons',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxDiscountAmount?: number | null;

  @ApiPropertyOptional({
    example: 100,
    nullable: true,
    description: 'null means no limit',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: "List it on the store's coupons page",
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class CheckCouponDto {
  @ApiProperty({ example: 'save10' })
  @Transform(toCode)
  @IsString()
  @MaxLength(30)
  code: string;

  @ApiProperty({
    example: 39000,
    description: 'The cart subtotal to work the discount out on',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal: number;
}

export class CouponCheckDto {
  @ApiProperty({ example: 'SAVE10' })
  code: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: '3900.00' })
  discountAmount: string;
}

export class CouponDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'SAVE10' })
  code: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: DiscountType })
  discountType: DiscountType;

  @ApiProperty({ example: '10.00' })
  discountValue: string;

  @ApiProperty({ nullable: true, type: String })
  minOrderAmount: string | null;

  @ApiProperty({ nullable: true, type: String })
  maxDiscountAmount: string | null;

  @ApiProperty({ nullable: true, type: Number })
  usageLimit: number | null;

  @ApiProperty()
  usedCount: number;

  @ApiProperty({ nullable: true, type: Date })
  startsAt: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  endsAt: Date | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  createdAt: Date;
}

// What shoppers see of a coupon on the store's coupons page.
export class PublicCouponDto {
  @ApiProperty({ example: 'SAVE10' })
  code: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: DiscountType })
  discountType: DiscountType;

  @ApiProperty({ example: '10.00' })
  discountValue: string;

  @ApiProperty({ nullable: true, type: String })
  minOrderAmount: string | null;

  @ApiProperty({ nullable: true, type: String })
  maxDiscountAmount: string | null;

  @ApiProperty({ nullable: true, type: Date })
  endsAt: Date | null;
}
