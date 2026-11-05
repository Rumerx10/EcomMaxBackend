import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toCursorPage } from '../../common/dto/cursor-query.dto.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import type { Prisma, StoreMessage } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type {
  CreateMessageDto,
  MessageDto,
  MessageListDto,
  StoreMessagesQueryDto,
} from './messages.dto.js';

const toDto = (message: StoreMessage): MessageDto => ({
  id: message.id,
  kind: message.kind,
  topic: message.topic,
  name: message.name,
  email: message.email,
  phone: message.phone,
  subject: message.subject,
  body: message.body,
  wantsReply: message.wantsReply,
  isRead: message.isRead,
  userId: message.userId,
  createdAt: message.createdAt,
});

// Messages to the store from the contact page and customers' feedback page. Signed-in
// senders are known from their account; guests must say who they are and how to reach them.
@Injectable()
export class MessagesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async create(dto: CreateMessageDto, sender?: AuthUser): Promise<MessageDto> {
    const account = sender
      ? await this.db.user.findUnique({
          where: { id: sender.id },
          select: { id: true, name: true, email: true, phone: true },
        })
      : null;
    const name = dto.name ?? account?.name;
    const email = dto.email ?? account?.email ?? null;
    const phone = dto.phone ?? account?.phone ?? null;
    if (!name) throw new BadRequestException('Enter your name');
    if (!email && !phone) {
      throw new BadRequestException(
        'Enter an email or a phone number so we can reply',
      );
    }
    const message = await this.db.storeMessage.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        userId: account?.id ?? null,
        kind: dto.kind,
        topic: dto.kind === 'FEEDBACK' ? (dto.topic ?? 'general') : null,
        name,
        email,
        phone,
        subject: dto.subject || null,
        body: dto.body,
        wantsReply: dto.wantsReply ?? dto.kind === 'CONTACT',
      },
    });
    return toDto(message);
  }

  async list(query: StoreMessagesQueryDto): Promise<MessageListDto> {
    const where: Prisma.StoreMessageWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.isRead !== undefined) where.isRead = query.isRead;
    const [rows, unread] = await Promise.all([
      this.db.storeMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.db.storeMessage.count({ where: { isRead: false } }),
    ]);
    const page = toCursorPage(rows, query.limit);
    return { data: page.data.map(toDto), nextCursor: page.nextCursor, unread };
  }

  async markRead(id: string, isRead: boolean): Promise<MessageDto> {
    await this.require(id);
    return toDto(
      await this.db.storeMessage.update({ where: { id }, data: { isRead } }),
    );
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.db.storeMessage.delete({ where: { id } });
  }

  private async require(id: string) {
    const message = await this.db.storeMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }
}
