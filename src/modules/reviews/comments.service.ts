import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import {
  type CursorQueryDto,
  toCursorPage,
} from '../../common/dto/cursor-query.dto.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type { CommentDto, CommentListDto } from './reviews.dto.js';
import { shortName } from './reviews.service.js';

// How many replies come with each comment; "View more replies" loads the rest.
export const REPLY_PREVIEW = 3;

const AUTHOR = { user: { select: { name: true, role: true } } } as const;
const OLDEST_FIRST = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

type CommentRow = Prisma.ReviewCommentGetPayload<{ include: typeof AUTHOR }>;

const isStaff = (user?: AuthUser) => !!user && STAFF_ROLES.includes(user.role);

const toDto = (
  comment: CommentRow,
  replies: CommentDto[] = [],
  replyCount = 0,
): CommentDto => ({
  id: comment.id,
  reviewId: comment.reviewId,
  parentId: comment.parentId,
  body: comment.body,
  author: shortName(comment.user.name),
  authorId: comment.userId,
  fromStore: STAFF_ROLES.includes(comment.user.role),
  replyCount,
  replies,
  isHidden: comment.isHidden,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
});

// Comments under reviews, like comments on a Facebook post: anyone signed in at the store can
// comment on a review or reply to a comment. Replies stay one level deep. Staff can hide any
// comment; hidden ones are left out for everyone else.
@Injectable()
export class CommentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async list(
    reviewId: string,
    query: CursorQueryDto,
    viewer?: AuthUser,
  ): Promise<CommentListDto> {
    await this.requireReview(reviewId, viewer);
    const visible = isStaff(viewer) ? {} : { isHidden: false };
    const rows = await this.db.reviewComment.findMany({
      where: { reviewId, parentId: null, ...visible },
      include: {
        ...AUTHOR,
        replies: {
          where: visible,
          include: AUTHOR,
          orderBy: OLDEST_FIRST,
          take: REPLY_PREVIEW,
        },
        _count: { select: { replies: { where: visible } } },
      },
      orderBy: OLDEST_FIRST,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = toCursorPage(rows, query.limit);
    return {
      data: page.data.map((row) =>
        toDto(
          row,
          row.replies.map((reply) => toDto(reply)),
          row._count.replies,
        ),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async replies(
    commentId: string,
    query: CursorQueryDto,
    viewer?: AuthUser,
  ): Promise<CommentListDto> {
    const parent = await this.requireComment(commentId, viewer);
    const rows = await this.db.reviewComment.findMany({
      where: {
        parentId: parent.id,
        ...(isStaff(viewer) ? {} : { isHidden: false }),
      },
      include: AUTHOR,
      orderBy: OLDEST_FIRST,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = toCursorPage(rows, query.limit);
    return {
      data: page.data.map((row) => toDto(row)),
      nextCursor: page.nextCursor,
    };
  }

  async comment(
    user: AuthUser,
    reviewId: string,
    body: string,
  ): Promise<CommentDto> {
    await this.requireReview(reviewId, user);
    return toDto(await this.insert(user, reviewId, null, body));
  }

  // Replying to a reply joins the same thread, under its top comment.
  async reply(
    user: AuthUser,
    commentId: string,
    body: string,
  ): Promise<CommentDto> {
    const target = await this.requireComment(commentId, user);
    await this.requireReview(target.reviewId, user);
    return toDto(
      await this.insert(
        user,
        target.reviewId,
        target.parentId ?? target.id,
        body,
      ),
    );
  }

  async edit(user: AuthUser, id: string, body: string): Promise<CommentDto> {
    const comment = await this.requireComment(id, user);
    if (comment.userId !== user.id)
      throw new ForbiddenException('You can only edit your own comments');
    return toDto(
      await this.db.reviewComment.update({
        where: { id },
        data: { body },
        include: AUTHOR,
      }),
    );
  }

  // Authors delete their own comments, staff any; a comment takes its replies with it.
  async remove(user: AuthUser, id: string): Promise<void> {
    const comment = await this.requireComment(id, user);
    if (comment.userId !== user.id && !isStaff(user)) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.db.reviewComment.delete({ where: { id } });
  }

  async hide(id: string, isHidden: boolean): Promise<CommentDto> {
    await this.requireComment(id, { role: 'OWNER' } as AuthUser);
    return toDto(
      await this.db.reviewComment.update({
        where: { id },
        data: { isHidden },
        include: AUTHOR,
      }),
    );
  }

  private insert(
    user: AuthUser,
    reviewId: string,
    parentId: string | null,
    body: string,
  ) {
    return this.db.reviewComment.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        reviewId,
        userId: user.id,
        parentId,
        body,
      },
      include: AUTHOR,
    });
  }

  // Comments belong to published reviews; staff also see unpublished ones.
  private async requireReview(reviewId: string, viewer?: AuthUser) {
    const review = await this.db.review.findFirst({
      where: {
        id: reviewId,
        ...(isStaff(viewer) ? {} : { isPublished: true }),
      },
      select: { id: true },
    });
    if (!review) throw new NotFoundException('Review not found');
  }

  private async requireComment(id: string, viewer?: AuthUser) {
    const comment = await this.db.reviewComment.findFirst({
      where: { id, ...(isStaff(viewer) ? {} : { isHidden: false }) },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
