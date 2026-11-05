import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SLUG_PATTERN } from '../../../common/utils/slug.js';
import { ProductStatus } from '../../../generated/prisma/client.js';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator.js';

// Matches the client's admin form (productForm/formModel.ts).
export const MAX_OPTIONS = 3;
export const MAX_IMAGES = 20;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lowerKey = (text: string) => text.trim().toLowerCase();

// [label, value] pairs such as ["Rated power", "570 W"].
const IsSpecList = () => (target: object, propertyName: string) =>
  registerDecorator({
    name: 'isSpecList',
    target: target.constructor,
    propertyName,
    options: {
      message: 'specs must be up to 50 [label, value] pairs of short text',
    },
    validator: {
      validate: (value: unknown) =>
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(
          (pair) =>
            Array.isArray(pair) &&
            pair.length === 2 &&
            pair.every(
              (text) => typeof text === 'string' && text.length <= 200,
            ),
        ),
    },
  });

export class ProductImageInputDto {
  @ApiProperty({
    example: 'https://en.pvbm.com/.../Galaxy570FrontBack.png',
    description: 'A URL from POST /uploads, or an https link',
  })
  @IsImageUrl()
  url: string;

  @ApiPropertyOptional({ example: 'Front and back of the panel' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;
}

export class ProductOptionValueInputDto {
  @ApiProperty({ example: '9.6 kWh' })
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  label: string;

  @ApiPropertyOptional({
    example: 95000,
    default: 0,
    description: 'Added to the price',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  priceDelta?: number;

  @ApiPropertyOptional({
    example: '#1f2937',
    description: 'Colour options only',
  })
  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i, {
    message: 'swatch must be a colour like #1f2937',
  })
  swatch?: string;

  @ApiPropertyOptional({
    description: 'The product image to show for this value',
  })
  @IsOptional()
  @IsImageUrl()
  imageUrl?: string;
}

export class ProductOptionInputDto {
  @ApiProperty({ example: 'Capacity' })
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  name: string;

  @ApiProperty({ type: [ProductOptionValueInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one value' })
  @ArrayMaxSize(50)
  @ArrayUnique(
    (value: ProductOptionValueInputDto) => lowerKey(String(value?.label)),
    {
      message: 'Each value of an option needs a different name',
    },
  )
  @ValidateNested({ each: true })
  @Type(() => ProductOptionValueInputDto)
  values: ProductOptionValueInputDto[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'GoodWe Galaxy 570W Ultra-lightweight Solar Panel' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({ description: 'Made from the title when left out' })
  @IsOptional()
  @Matches(SLUG_PATTERN, {
    message: 'Use lowercase letters, digits and dashes',
  })
  @MaxLength(200)
  slug?: string;

  @ApiProperty({
    example: 'GALAXY-570',
    description: 'Unique within the store',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  sku: string;

  @ApiProperty({ description: 'The category it is listed under' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({
    example: 19500,
    description: 'What the buyer pays, before options',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000)
  price: number;

  @ApiPropertyOptional({
    example: 8,
    default: 0,
    description:
      'Only for the struck-through "was" price; the buyer still pays price',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(90)
  discountPercent?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'What one unit costs the store; staff only',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  costPrice?: number | null;

  @ApiProperty({ example: 240 })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  stock: number;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsIn(Object.values(ProductStatus))
  status?: ProductStatus;

  @ApiPropertyOptional({
    description: 'HTML from the rich text editor; sanitised when saved',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  description?: string;

  @ApiPropertyOptional({ example: 'GoodWe' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional({ example: 25.5, nullable: true, description: 'kg' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100_000)
  weight?: number | null;

  @ApiPropertyOptional({ example: ['home', 'business'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: ['IP67 ingress protection'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  highlights?: string[];

  @ApiPropertyOptional({ example: [['Rated power', '570 W']] })
  @IsOptional()
  @IsSpecList()
  specs?: [string, string][];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  warrantyInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  popular?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trending?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  latest?: boolean;

  @ApiPropertyOptional({
    type: [ProductImageInputDto],
    description: 'In display order; the first is the thumbnail',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];

  @ApiPropertyOptional({
    type: [ProductOptionInputDto],
    description: `At most ${MAX_OPTIONS}`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS)
  @ArrayUnique(
    (option: ProductOptionInputDto) => lowerKey(String(option?.name)),
    {
      message: 'Each option needs a different name',
    },
  )
  @ValidateNested({ each: true })
  @Type(() => ProductOptionInputDto)
  options?: ProductOptionInputDto[];
}

// Every field is optional. images and options, when sent, replace the whole list.
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class BulkProductChangeDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(90)
  discountPercent?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  stock?: number;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsIn(Object.values(ProductStatus))
  status?: ProductStatus;
}

// The bulk editor saves many rows at once; all of them or none.
export class BulkUpdateProductsDto {
  @ApiProperty({ type: [BulkProductChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((change: BulkProductChangeDto) => change?.id, {
    message: 'Each product can appear only once',
  })
  @ValidateNested({ each: true })
  @Type(() => BulkProductChangeDto)
  items: BulkProductChangeDto[];
}
