import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

// How many messages a conversation shows: the latest ones, oldest first.
export const THREAD_LENGTH = 100;

export class SendChatMessageDto {
  @ApiProperty({ example: 'Is the 10 kW system in stock?' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body: string;
}

export class ChatMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ description: 'Written by the store' })
  fromStore: boolean;

  @ApiProperty({ example: 'Tanvir H.' })
  senderName: string;

  @ApiProperty()
  createdAt: Date;
}

export class ChatCustomerDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ nullable: true, type: String })
  avatarUrl: string | null;
}

export class ChatThreadDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'null until the first message',
  })
  conversationId: string | null;

  @ApiProperty({
    description:
      'Messages from the other side not read yet (customer: store replies; staff: customer messages)',
  })
  unread: number;

  @ApiProperty({ type: [ChatMessageDto] })
  messages: ChatMessageDto[];

  @ApiProperty({ type: ChatCustomerDto, required: false })
  customer?: ChatCustomerDto;
}

export class ConversationDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: ChatCustomerDto })
  customer: ChatCustomerDto;

  @ApiProperty()
  lastMessage: string;

  @ApiProperty()
  lastMessageAt: Date;

  @ApiProperty({ description: 'Customer messages staff have not read' })
  unread: number;
}

export class ConversationListDto {
  @ApiProperty({ type: [ConversationDto] })
  data: ConversationDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;

  @ApiProperty({ description: 'Conversations with unread customer messages' })
  unread: number;
}
