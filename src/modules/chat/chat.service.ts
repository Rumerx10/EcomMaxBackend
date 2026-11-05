import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CursorQueryDto,
  toCursorPage,
} from '../../common/dto/cursor-query.dto.js';
import { STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { TenantContext } from '../../tenant/tenant.context.js';
import { shortName } from '../reviews/reviews.service.js';
import {
  type ChatMessageDto,
  type ChatThreadDto,
  type ConversationListDto,
  THREAD_LENGTH,
} from './chat.dto.js';

const MESSAGE_INCLUDE = {
  sender: { select: { name: true } },
} satisfies Prisma.ChatMessageInclude;
type MessageRow = Prisma.ChatMessageGetPayload<{
  include: typeof MESSAGE_INCLUDE;
}>;

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

const toMessageDto = (
  message: MessageRow,
  storeName: string,
): ChatMessageDto => ({
  id: message.id,
  body: message.body,
  fromStore: message.fromStore,
  // Customers see the store, not which staff member answered.
  senderName: message.fromStore ? storeName : shortName(message.sender.name),
  createdAt: message.createdAt,
});

const preview = (body: string) =>
  body.length > 120 ? `${body.slice(0, 117)}...` : body;

// Customers chat with the store: one conversation each, answered by any staff member in the
// seller centre. Clients poll for new messages; each side has its own unread counter.
@Injectable()
export class ChatService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async mine(user: AuthUser): Promise<ChatThreadDto> {
    this.requireCustomer(user);
    const conversation = await this.db.conversation.findUnique({
      where: {
        sellerId_userId: {
          sellerId: this.tenantPrisma.sellerId,
          userId: user.id,
        },
      },
    });
    if (!conversation) {
      return { conversationId: null, unread: 0, messages: [] };
    }
    return {
      conversationId: conversation.id,
      unread: conversation.customerUnread,
      messages: await this.thread(conversation.id),
    };
  }

  async sendAsCustomer(user: AuthUser, body: string): Promise<ChatMessageDto> {
    this.requireCustomer(user);
    const sellerId = this.tenantPrisma.sellerId;
    const message = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const conversation = await tx.conversation.upsert({
        where: { sellerId_userId: { sellerId, userId: user.id } },
        create: {
          sellerId,
          userId: user.id,
          lastMessage: preview(body),
          lastMessageAt: now,
          storeUnread: 1,
        },
        update: {
          lastMessage: preview(body),
          lastMessageAt: now,
          storeUnread: { increment: 1 },
        },
      });
      return tx.chatMessage.create({
        data: {
          sellerId,
          conversationId: conversation.id,
          senderId: user.id,
          fromStore: false,
          body,
          createdAt: now,
        },
        include: MESSAGE_INCLUDE,
      });
    });
    return toMessageDto(message, this.storeName);
  }

  async readAsCustomer(user: AuthUser): Promise<void> {
    this.requireCustomer(user);
    await this.db.conversation.updateMany({
      where: { userId: user.id },
      data: { customerUnread: 0 },
    });
  }

  async list(query: CursorQueryDto): Promise<ConversationListDto> {
    const [rows, unread] = await Promise.all([
      this.db.conversation.findMany({
        include: { user: { select: CUSTOMER_SELECT } },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.db.conversation.count({ where: { storeUnread: { gt: 0 } } }),
    ]);
    const page = toCursorPage(rows, query.limit);
    return {
      data: page.data.map((conversation) => ({
        id: conversation.id,
        customer: conversation.user,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unread: conversation.storeUnread,
      })),
      nextCursor: page.nextCursor,
      unread,
    };
  }

  async conversation(id: string): Promise<ChatThreadDto> {
    const conversation = await this.require(id);
    return {
      conversationId: conversation.id,
      unread: conversation.storeUnread,
      messages: await this.thread(conversation.id),
      customer: conversation.user,
    };
  }

  async sendAsStore(
    staff: AuthUser,
    id: string,
    body: string,
  ): Promise<ChatMessageDto> {
    await this.require(id);
    const message = await this.db.$transaction(async (tx) => {
      const now = new Date();
      await tx.conversation.update({
        where: { id },
        data: {
          lastMessage: preview(body),
          lastMessageAt: now,
          customerUnread: { increment: 1 },
          // Answering means the customer's messages were read.
          storeUnread: 0,
        },
      });
      return tx.chatMessage.create({
        data: {
          sellerId: this.tenantPrisma.sellerId,
          conversationId: id,
          senderId: staff.id,
          fromStore: true,
          body,
          createdAt: now,
        },
        include: MESSAGE_INCLUDE,
      });
    });
    return toMessageDto(message, this.storeName);
  }

  async readAsStore(id: string): Promise<void> {
    await this.require(id);
    await this.db.conversation.update({
      where: { id },
      data: { storeUnread: 0 },
    });
  }

  // The latest messages, oldest first.
  private async thread(conversationId: string): Promise<ChatMessageDto[]> {
    const rows = await this.db.chatMessage.findMany({
      where: { conversationId },
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: THREAD_LENGTH,
    });
    return rows.reverse().map((row) => toMessageDto(row, this.storeName));
  }

  private get storeName() {
    return this.tenant.requireSeller().name;
  }

  private requireCustomer(user: AuthUser) {
    if (STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException('Staff answer chats from the seller centre');
    }
  }

  private async require(id: string) {
    const conversation = await this.db.conversation.findUnique({
      where: { id },
      include: { user: { select: CUSTOMER_SELECT } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
