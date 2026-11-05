import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toCursorPage } from '../../common/dto/cursor-query.dto.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import { fixed2 } from '../../common/utils/money.js';
import { Prisma } from '../../generated/prisma/client.js';
import { STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../tenant/tenant-prisma.service.js';
import type {
  CreateReviewDto,
  ProductReviewsDto,
  RatingSummaryDto,
  ReviewDto,
  ReviewListDto,
  StoreReviewsQueryDto,
  ToReviewItemDto,
  UpdateReviewDto,
} from './reviews.dto.js';
import type { CursorQueryDto } from '../../common/dto/cursor-query.dto.js';

const WITH_AUTHOR = {
  user: { select: { name: true } },
  product: {
    select: {
      title: true,
      slug: true,
      images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
    },
  },
  _count: { select: { comments: { where: { isHidden: false } } } },
} satisfies Prisma.ReviewInclude;
type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof WITH_AUTHOR }>;

// "Tanvir Hasan" -> "Tanvir H.": enough to feel real, not enough to find the person.
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
};

const toDto = (review: ReviewRow): ReviewDto => ({
  id: review.id,
  productId: review.productId,
  product: {
    id: review.productId,
    title: review.product.title,
    slug: review.product.slug,
    thumbnail: review.product.images[0]?.url ?? null,
  },
  rating: review.rating,
  title: review.title,
  comment: review.comment,
  author: shortName(review.user.name),
  images: review.images,
  commentCount: review._count.comments,
  isPublished: review.isPublished,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

const ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

// Product reviews. Only people who received the product can review it, once each. Every
// change recalculates the product's ratingAvg and ratingCount from the published reviews in
// the same transaction, so listings can sort by rating without counting reviews.
@Injectable()
export class ReviewsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async forProduct(
    productId: string,
    query: CursorQueryDto,
  ): Promise<ProductReviewsDto> {
    const product = await this.db.product.findFirst({
      where: { id: productId, status: 'ACTIVE' },
      select: { ratingAvg: true, ratingCount: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const where = { productId, isPublished: true };
    const [rows, counts] = await Promise.all([
      this.db.review.findMany({
        where,
        include: WITH_AUTHOR,
        orderBy: ORDER,
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.db.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
    ]);
    const distribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    } as RatingSummaryDto['distribution'];
    for (const row of counts) {
      distribution[row.rating as 1 | 2 | 3 | 4 | 5] = row._count._all;
    }
    const page = toCursorPage(rows, query.limit);
    return {
      data: page.data.map(toDto),
      nextCursor: page.nextCursor,
      summary: {
        ratingAvg: fixed2(product.ratingAvg),
        ratingCount: product.ratingCount,
        distribution,
      },
    };
  }

  async create(
    userId: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    const received = await this.db.orderItem.findFirst({
      where: { productId, order: { userId, status: 'DELIVERED' } },
      select: { id: true },
    });
    if (!received) {
      throw new ForbiddenException(
        'You can review products once they have been delivered to you',
      );
    }
    const existing = await this.db.review.findUnique({
      where: {
        sellerId_userId_productId: {
          sellerId: this.tenantPrisma.sellerId,
          userId,
          productId,
        },
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'You have reviewed this product; edit that review',
      );

    return this.db.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          sellerId: this.tenantPrisma.sellerId,
          productId,
          userId,
          rating: dto.rating,
          title: dto.title ?? null,
          comment: dto.comment,
          images: dto.images ?? [],
        },
        include: WITH_AUTHOR,
      });
      await this.refreshRating(tx, productId);
      return toDto(review);
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewDto> {
    const review = await this.require(id);
    if (review.userId !== userId)
      throw new NotFoundException('Review not found');
    return this.db.$transaction(async (tx) => {
      const updated = await tx.review.update({
        where: { id },
        data: {
          rating: dto.rating,
          title: dto.title,
          comment: dto.comment,
          images: dto.images,
        },
        include: WITH_AUTHOR,
      });
      await this.refreshRating(tx, review.productId);
      return toDto(updated);
    });
  }

  // Authors delete their own reviews; staff can delete any.
  async remove(user: AuthUser, id: string): Promise<void> {
    const review = await this.require(id);
    if (review.userId !== user.id && !STAFF_ROLES.includes(user.role)) {
      throw new NotFoundException('Review not found');
    }
    await this.db.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await this.refreshRating(tx, review.productId);
    });
  }

  async moderate(id: string, isPublished: boolean): Promise<ReviewDto> {
    const review = await this.require(id);
    return this.db.$transaction(async (tx) => {
      const updated = await tx.review.update({
        where: { id },
        data: { isPublished },
        include: WITH_AUTHOR,
      });
      await this.refreshRating(tx, review.productId);
      return toDto(updated);
    });
  }

  async mine(userId: string, query: CursorQueryDto): Promise<ReviewListDto> {
    return this.page({ userId }, query);
  }

  async forStore(query: StoreReviewsQueryDto): Promise<ReviewListDto> {
    return this.page(
      query.isPublished === undefined ? {} : { isPublished: query.isPublished },
      query,
    );
  }

  // Delivered products the user has not reviewed yet, newest order first (the client's
  // "To review" page).
  async toReview(userId: string): Promise<ToReviewItemDto[]> {
    const items = await this.db.orderItem.findMany({
      where: {
        order: { userId, status: 'DELIVERED' },
        product: { reviews: { none: { userId } } },
      },
      select: {
        productId: true,
        title: true,
        imageUrl: true,
        order: { select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const seen = new Set<string>();
    return items
      .filter((item) => !seen.has(item.productId) && seen.add(item.productId))
      .map((item) => ({
        productId: item.productId,
        title: item.title,
        imageUrl: item.imageUrl,
        orderedAt: item.order.createdAt,
      }));
  }

  private async page(where: Prisma.ReviewWhereInput, query: CursorQueryDto) {
    const rows = await this.db.review.findMany({
      where,
      include: WITH_AUTHOR,
      orderBy: ORDER,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = toCursorPage(rows, query.limit);
    return { data: page.data.map(toDto), nextCursor: page.nextCursor };
  }

  private async require(id: string) {
    const review = await this.db.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  private async refreshRating(tx: TenantTransactionClient, productId: string) {
    const stats = await tx.review.aggregate({
      where: { productId, isPublished: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        ratingAvg: new Prisma.Decimal(stats._avg.rating ?? 0).toDecimalPlaces(
          2,
        ),
        ratingCount: stats._count._all,
      },
    });
  }
}
