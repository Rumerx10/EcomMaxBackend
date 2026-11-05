import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: '0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f' })
  id: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'null for a top-level category',
  })
  parentId: string | null;

  @ApiProperty({ example: 'Solar panels' })
  name: string;

  @ApiProperty({ example: 'solar-panels' })
  slug: string;

  @ApiProperty({
    example: 'Lightweight, bifacial and balcony panels',
    nullable: true,
    type: String,
  })
  description: string | null;

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({
    example: 12,
    description:
      'Products in this category; shoppers see only the ones on sale',
  })
  productCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CategoryListResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  data: CategoryResponseDto[];

  @ApiProperty({ example: { total: 7, page: 1, limit: 50, totalPages: 1 } })
  meta: { total: number; page: number; limit: number; totalPages: number };
}
