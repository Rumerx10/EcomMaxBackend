import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_CART_LINES = 100;
export const MAX_LINE_QUANTITY = 1000;

export class AddCartItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    example: 'Capacity: 9.6 kWh',
    description:
      'The chosen options, "Name: Value / Name: Value"; leave out when there are none',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  variant?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_LINE_QUANTITY })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity?: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class AddWishlistItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;
}

export const LINE_PROBLEMS = [
  'unavailable',
  'out_of_stock',
  'not_enough_stock',
  'options_changed',
] as const;
export type LineProblem = (typeof LINE_PROBLEMS)[number];

export class CartLineDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({ example: 'Lynx Home Battery' })
  title: string;

  @ApiProperty({ example: 'lynx-home-battery' })
  slug: string;

  @ApiProperty({ nullable: true, type: String })
  thumbnail: string | null;

  @ApiProperty({
    example: 'Capacity: 9.6 kWh',
    description: '"" when the product has no options',
  })
  variant: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({
    example: '245000.00',
    description: 'Today’s price of one unit, options included',
  })
  unitPrice: string;

  @ApiProperty({ example: '490000.00' })
  lineTotal: string;

  @ApiProperty({ example: 12, description: 'Units in stock right now' })
  stock: number;

  @ApiProperty({
    enum: LINE_PROBLEMS,
    nullable: true,
    description:
      'Why this line cannot be bought as it is; such lines are not in the subtotal',
  })
  problem: LineProblem | null;
}

export class CartResponseDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'For visitors who are not signed in: send it back as X-Guest-Token',
  })
  guestToken: string | null;

  @ApiProperty({ type: [CartLineDto] })
  items: CartLineDto[];

  @ApiProperty({ example: 3, description: 'Units in lines that can be bought' })
  itemCount: number;

  @ApiProperty({
    example: '509500.00',
    description: 'Lines that can be bought',
  })
  subtotal: string;
}

export class WishlistItemDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ example: '19500.00' })
  price: string;

  @ApiProperty({ nullable: true, type: String })
  thumbnail: string | null;

  @ApiProperty({ description: 'On sale and in stock' })
  available: boolean;

  @ApiProperty()
  addedAt: Date;
}

export class WishlistResponseDto {
  @ApiProperty({ nullable: true, type: String })
  guestToken: string | null;

  @ApiProperty({ type: [WishlistItemDto] })
  items: WishlistItemDto[];
}
