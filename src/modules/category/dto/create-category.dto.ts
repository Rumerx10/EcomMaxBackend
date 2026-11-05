import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SLUG_PATTERN } from '../../../common/utils/slug.js';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @ApiProperty({ example: 'Solar panels', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({
    example: 'solar-panels',
    description: 'Made from the name when left out. Unique within the store.',
  })
  @IsOptional()
  @Matches(SLUG_PATTERN, {
    message: 'Use lowercase letters, digits and dashes, like solar-panels',
  })
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({
    example: 'Lightweight, bifacial and balcony panels',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/categories/solar.jpg',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsImageUrl()
  imageUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Makes this a subcategory; null makes it top level',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({
    example: 0,
    description: 'Lower numbers are listed first',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Inactive categories are hidden from shoppers',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
