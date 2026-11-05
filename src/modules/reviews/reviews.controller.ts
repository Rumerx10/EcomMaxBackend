import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CursorQueryDto } from '../../common/dto/cursor-query.dto.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import {
  CommentDto,
  CommentListDto,
  CreateCommentDto,
  CreateReviewDto,
  HideCommentDto,
  ModerateReviewDto,
  ProductReviewsDto,
  ReviewDto,
  ReviewListDto,
  StoreReviewsQueryDto,
  ToReviewItemDto,
  UpdateReviewDto,
} from './reviews.dto.js';
import { CommentsService } from './comments.service.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly comments: CommentsService,
  ) {}

  @Get('products/:productId/reviews')
  @Public()
  @ApiOperation({
    summary: "A product's published reviews and its star summary",
  })
  @ApiOkResponse({ type: ProductReviewsDto })
  forProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: CursorQueryDto,
  ): Promise<ProductReviewsDto> {
    return this.reviews.forProduct(productId, query);
  }

  @Post('products/:productId/reviews')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Review a product that was delivered to you' })
  @ApiCreatedResponse({ type: ReviewDto })
  @ApiForbiddenResponse({ description: 'Not delivered to you' })
  @ApiConflictResponse({ description: 'Already reviewed; edit that review' })
  create(
    @GetUser('id') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.create(userId, productId, dto);
  }

  @Get('reviews/mine')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Your reviews' })
  @ApiOkResponse({ type: ReviewListDto })
  mine(
    @GetUser('id') userId: string,
    @Query() query: CursorQueryDto,
  ): Promise<ReviewListDto> {
    return this.reviews.mine(userId, query);
  }

  @Get('reviews/to-review')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delivered products you have not reviewed yet' })
  @ApiOkResponse({ type: [ToReviewItemDto] })
  toReview(@GetUser('id') userId: string): Promise<ToReviewItemDto[]> {
    return this.reviews.toReview(userId);
  }

  @Patch('reviews/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Edit your review' })
  @ApiOkResponse({ type: ReviewDto })
  update(
    @GetUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.update(userId, id, dto);
  }

  @Delete('reviews/:id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your review (staff: any review)' })
  @ApiNoContentResponse()
  async remove(
    @GetUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.reviews.remove(user, id);
  }

  @Get('admin/reviews')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "The store's reviews, newest first (staff)" })
  @ApiOkResponse({ type: ReviewListDto })
  forStore(@Query() query: StoreReviewsQueryDto): Promise<ReviewListDto> {
    return this.reviews.forStore(query);
  }

  @Patch('admin/reviews/:id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Hide or show a review (staff)' })
  @ApiOkResponse({ type: ReviewDto })
  moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.moderate(id, dto.isPublished);
  }

  @Get('reviews/:id/comments')
  @Public()
  @ApiOperation({
    summary: 'Comments on a review, oldest first, each with its first replies',
  })
  @ApiOkResponse({ type: CommentListDto })
  listComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorQueryDto,
    @GetUser() user?: AuthUser,
  ): Promise<CommentListDto> {
    return this.comments.list(id, query, user);
  }

  @Post('reviews/:id/comments')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Comment on a review' })
  @ApiCreatedResponse({ type: CommentDto })
  addComment(
    @GetUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.comment(user, id, dto.body);
  }

  @Get('comments/:id/replies')
  @Public()
  @ApiOperation({ summary: 'All replies to a comment, oldest first' })
  @ApiOkResponse({ type: CommentListDto })
  listReplies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorQueryDto,
    @GetUser() user?: AuthUser,
  ): Promise<CommentListDto> {
    return this.comments.replies(id, query, user);
  }

  @Post('comments/:id/replies')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Reply to a comment (replying to a reply joins its thread)',
  })
  @ApiCreatedResponse({ type: CommentDto })
  reply(
    @GetUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.reply(user, id, dto.body);
  }

  @Patch('comments/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Edit your comment' })
  @ApiOkResponse({ type: CommentDto })
  editComment(
    @GetUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.edit(user, id, dto.body);
  }

  @Delete('comments/:id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete your comment and its replies (staff: any comment)',
  })
  @ApiNoContentResponse()
  async removeComment(
    @GetUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.comments.remove(user, id);
  }

  @Patch('admin/comments/:id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Hide or show a comment (staff)' })
  @ApiOkResponse({ type: CommentDto })
  hideComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideCommentDto,
  ): Promise<CommentDto> {
    return this.comments.hide(id, dto.isHidden);
  }
}
