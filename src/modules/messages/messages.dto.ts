import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { CursorQueryDto } from '../../common/dto/cursor-query.dto.js';
import { IsBdPhone } from '../../common/validators/is-bd-phone.decorator.js';
import { MessageKind } from '../../generated/prisma/client.js';

export const FEEDBACK_TOPICS = [
  'general',
  'bug',
  'feature',
  'complaint',
] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class CreateMessageDto {
  @ApiProperty({
    enum: MessageKind,
    description: 'CONTACT from the contact page, FEEDBACK from the account',
  })
  @IsIn(Object.values(MessageKind))
  kind: MessageKind;

  @ApiPropertyOptional({ enum: FEEDBACK_TOPICS, description: 'Feedback only' })
  @IsOptional()
  @IsIn(FEEDBACK_TOPICS)
  topic?: FeedbackTopic;

  @ApiPropertyOptional({
    example: 'Tanvir Hasan',
    description: "Taken from the account when you're signed in",
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'tanvir@example.com' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: '01712345678' })
  @IsOptional()
  @IsBdPhone()
  phone?: string;

  @ApiPropertyOptional({ example: 'Installation in Sylhet' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  subject?: string;

  @ApiProperty({ example: 'Do you install hybrid systems in Sylhet?' })
  @Transform(trim)
  @IsString()
  @Length(10, 3000, {
    message: 'Write between 10 and 3000 characters',
  })
  body: string;

  @ApiPropertyOptional({
    default: false,
    description: 'The sender asked to be contacted',
  })
  @IsOptional()
  @IsBoolean()
  wantsReply?: boolean;
}

export class StoreMessagesQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: MessageKind })
  @IsOptional()
  @IsIn(Object.values(MessageKind))
  kind?: MessageKind;

  @ApiPropertyOptional({ description: 'Only read, or only unread, messages' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isRead?: boolean;
}

export class UpdateMessageDto {
  @ApiProperty()
  @IsBoolean()
  isRead: boolean;
}

export class MessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: MessageKind })
  kind: MessageKind;

  @ApiProperty({ nullable: true, enum: FEEDBACK_TOPICS })
  topic: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  email: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ nullable: true, type: String })
  subject: string | null;

  @ApiProperty()
  body: string;

  @ApiProperty()
  wantsReply: boolean;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The account that sent it',
  })
  userId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class MessageListDto {
  @ApiProperty({ type: [MessageDto] })
  data: MessageDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;

  @ApiProperty({ example: 3, description: 'Unread messages in total' })
  unread: number;
}
