import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateShippingRateDto {
  @ApiProperty({ example: 'Inside Dhaka' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: 'Delivered by our own team' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: 80 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price: number;

  @ApiPropertyOptional({ example: '1 to 2 days' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  estimate?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShippingRateDto extends PartialType(CreateShippingRateDto) {}

export class ShippingRateDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Inside Dhaka' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: '80.00' })
  price: string;

  @ApiProperty({ nullable: true, type: String, example: '1 to 2 days' })
  estimate: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  isActive: boolean;
}
