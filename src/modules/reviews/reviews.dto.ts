import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorQueryDto } from '../../common/dto/cursor-query.dto.js';
import { IsImageUrl } from '../../common/validators/is-image-url.decorator.js';

export const MAX_REVIEW_IMAGES = 4;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Runs the whole house', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({ example: 'Installed in a day; the app shows every panel.' })
  @Transform(trim)
  @IsString()
  @Length(3, 2000)
  comment: string;

  @ApiPropertyOptional({
    description: `Up to ${MAX_REVIEW_IMAGES} photos: URLs from POST /uploads, or https links`,
    example: ['/api/v1/uploads/0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REVIEW_IMAGES, {
    message: `A review can have at most ${MAX_REVIEW_IMAGES} photos`,
  })
  @IsImageUrl({
    each: true,
    message: 'Each photo must be an uploaded image URL or an https link',
  })
  images?: string[];
}

export class UpdateReviewDto extends PartialType(CreateReviewDto) {}

export class ModerateReviewDto {
  @ApiProperty({
    description: 'false hides it from shoppers and from the rating',
  })
  @IsBoolean()
  isPublished: boolean;
}

export class StoreReviewsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  isPublished?: boolean;
}

export class ReviewProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ nullable: true, type: String })
  thumbnail: string | null;
}

export class ReviewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({ type: ReviewProductDto })
  product: ReviewProductDto;

  @ApiProperty({ example: 5 })
  rating: number;

  @ApiProperty({ nullable: true, type: String })
  title: string | null;

  @ApiProperty()
  comment: string;

  @ApiProperty({
    example: 'Tanvir H.',
    description: 'First name and last initial',
  })
  author: string;

  @ApiProperty({ type: [String], description: 'Photo URLs' })
  images: string[];

  @ApiProperty({
    example: 3,
    description: 'Comments and replies shown under the review',
  })
  commentCount: number;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class RatingSummaryDto {
  @ApiProperty({ example: '4.50' })
  ratingAvg: string;

  @ApiProperty({ example: 12 })
  ratingCount: number;

  @ApiProperty({
    example: { 1: 0, 2: 1, 3: 1, 4: 3, 5: 7 },
    description: 'How many published reviews gave each star rating',
  })
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export class ReviewListDto {
  @ApiProperty({ type: [ReviewDto] })
  data: ReviewDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}

export class ProductReviewsDto extends ReviewListDto {
  @ApiProperty({ type: RatingSummaryDto })
  summary: RatingSummaryDto;
}

export class ToReviewItemDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;

  @ApiProperty({ description: 'When the order with this product was placed' })
  orderedAt: Date;
}

export class CreateCommentDto {
  @ApiProperty({
    example: 'Which inverter did you pair it with?',
    maxLength: 1000,
  })
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  body: string;
}

export class HideCommentDto {
  @ApiProperty({
    description: 'true hides the comment and its replies from shoppers',
  })
  @IsBoolean()
  isHidden: boolean;
}

export class CommentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  reviewId: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The comment this replies to',
  })
  parentId: string | null;

  @ApiProperty()
  body: string;

  @ApiProperty({ example: 'Mina R.' })
  author: string;

  @ApiProperty({
    description: "The author's own account, for edit and delete buttons",
  })
  authorId: string;

  @ApiProperty({ description: 'Written by the store (owner or manager)' })
  fromStore: boolean;

  @ApiProperty({ example: 2, description: 'Replies; 0 for replies themselves' })
  replyCount: number;

  @ApiProperty({
    type: () => [CommentDto],
    description: 'The first replies, oldest first',
  })
  replies: CommentDto[];

  @ApiProperty()
  isHidden: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CommentListDto {
  @ApiProperty({ type: [CommentDto] })
  data: CommentDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}
