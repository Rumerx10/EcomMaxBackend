import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../../../generated/prisma/client.js';

class ProductCategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Solar panels' })
  name: string;

  @ApiProperty({ example: 'solar-panels' })
  slug: string;
}

class PriceRangeDto {
  @ApiProperty({ example: '150000.00' })
  min: string;

  @ApiProperty({ example: '530000.00' })
  max: string;
}

export class ProductImageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ nullable: true, type: String })
  alt: string | null;

  @ApiProperty({ example: 0 })
  position: number;
}

export class ProductOptionValueDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '9.6 kWh' })
  label: string;

  @ApiProperty({ example: '95000.00', description: 'Added to the price' })
  priceDelta: string;

  @ApiProperty({ nullable: true, type: String, example: '#1f2937' })
  swatch: string | null;

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;
}

export class ProductOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Capacity' })
  name: string;

  @ApiProperty({ type: [ProductOptionValueDto] })
  values: ProductOptionValueDto[];
}

// One product in a list: enough for a product card.
export class ProductSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'goodwe-galaxy-570w-ultra-lightweight-solar-panel' })
  slug: string;

  @ApiProperty({ example: 'GoodWe Galaxy 570W Ultra-lightweight Solar Panel' })
  title: string;

  @ApiProperty({ example: 'GALAXY-570' })
  sku: string;

  @ApiProperty({ nullable: true, type: String, example: 'GoodWe' })
  brand: string | null;

  @ApiProperty({ type: ProductCategoryDto })
  category: ProductCategoryDto;

  @ApiProperty({
    example: '19500.00',
    description: 'What the buyer pays, before options',
  })
  price: string;

  @ApiProperty({
    example: '21195.65',
    nullable: true,
    type: String,
    description: 'The struck-through "was" price, when discounted',
  })
  originalPrice: string | null;

  @ApiProperty({ example: '8.00' })
  discountPercent: string;

  @ApiProperty({
    type: PriceRangeDto,
    description: 'Cheapest and dearest option combination',
  })
  priceRange: PriceRangeDto;

  @ApiProperty({ example: 240 })
  stock: number;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ example: ['home', 'business'] })
  tags: string[];

  @ApiProperty()
  popular: boolean;

  @ApiProperty()
  trending: boolean;

  @ApiProperty()
  latest: boolean;

  @ApiProperty({ example: '4.70' })
  ratingAvg: string;

  @ApiProperty({ example: 12 })
  ratingCount: number;

  @ApiProperty({ example: 30 })
  soldCount: number;

  @ApiProperty({ nullable: true, type: String, description: 'The first image' })
  thumbnail: string | null;

  @ApiProperty({ description: 'Whether the buyer has to choose options' })
  hasOptions: boolean;

  @ApiProperty({ example: ['IP67 ingress protection'] })
  highlights: string[];

  @ApiProperty({ type: [ProductImageDto] })
  images: ProductImageDto[];

  @ApiProperty({ type: [ProductOptionDto] })
  options: ProductOptionDto[];

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Staff only',
  })
  costPrice?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Everything the product page needs.
export class ProductDetailDto extends ProductSummaryDto {
  @ApiProperty({ nullable: true, type: String, description: 'Sanitised HTML' })
  description: string | null;

  @ApiProperty({ nullable: true, type: String })
  barcode: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '25.500',
    description: 'kg',
  })
  weight: string | null;

  @ApiProperty({ example: [['Rated power', '570 W']] })
  specs: [string, string][];

  @ApiProperty({ nullable: true, type: String })
  warrantyInfo: string | null;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductSummaryDto] })
  data: ProductSummaryDto[];

  @ApiProperty({ example: { total: 27, page: 1, limit: 24, totalPages: 2 } })
  meta: { total: number; page: number; limit: number; totalPages: number };
}
