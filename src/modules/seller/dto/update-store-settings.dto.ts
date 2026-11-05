import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// What the owner and managers can change about their store. The slug, status and currency are
// not here: they change what customers and old orders see, so the platform handles them.
export class UpdateStoreSettingsDto {
  @ApiPropertyOptional({ example: 'NextPower' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'support@nextpower.com.bd' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+8809612345678' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Enter a phone number' })
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({
    example: 'Saturday to Thursday, 9:00 to 21:00',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  supportHours?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsImageUrl()
  logoUrl?: string | null;

  @ApiPropertyOptional({
    example: '#1d4ed8',
    nullable: true,
    description: "The store's own colour, as #rrggbb",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9a-f]{6}$/, {
    message: 'brandColor must be a colour like #1d4ed8',
  })
  brandColor?: string | null;

  @ApiPropertyOptional({
    example: '000123456-0101',
    nullable: true,
    description: 'VAT registration (BIN), printed on invoices',
  })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  taxId?: string | null;

  @ApiPropertyOptional({
    example: 'Keep this invoice for warranty claims.',
    nullable: true,
    description: 'Printed at the foot of every invoice',
  })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  invoiceNote?: string | null;

  @ApiPropertyOptional({
    example: 5,
    description: 'VAT in percent, added at checkout',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ApiPropertyOptional({
    example: 15000,
    nullable: true,
    description:
      'Installation fee offered at checkout; null when the store does not install',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  installationFee?: number | null;

  @ApiPropertyOptional({
    example: 5,
    description: 'Stock at or below this counts as low',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  lowStockThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyNewOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyLowStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyWeeklySummary?: boolean;
}
