import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import { CursorQueryDto } from '../../common/dto/cursor-query.dto.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import {
  ChatMessageDto,
  ChatThreadDto,
  ConversationListDto,
  SendChatMessageDto,
} from './chat.dto.js';
import { ChatService } from './chat.service.js';

// Two messages a second is plenty for a person typing.
const SEND_LIMIT = { default: { limit: 30, ttl: 15_000 } };

@ApiTags('Chat')
@ApiBearerAuth('JWT-auth')
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('chat')
  @ApiOperation({ summary: 'Your conversation with the store (customers)' })
  @ApiOkResponse({ type: ChatThreadDto })
  @ApiForbiddenResponse({ description: 'Staff use /admin/chats' })
  mine(@GetUser() user: AuthUser): Promise<ChatThreadDto> {
    return this.chat.mine(user);
  }

  @Post('chat/messages')
  @Throttle(SEND_LIMIT)
  @ApiOperation({ summary: 'Write to the store (customers)' })
  @ApiCreatedResponse({ type: ChatMessageDto })
  send(
    @GetUser() user: AuthUser,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessageDto> {
    return this.chat.sendAsCustomer(user, dto.body);
  }

  @Post('chat/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mark the store's replies read (customers)" })
  @ApiNoContentResponse()
  async read(@GetUser() user: AuthUser): Promise<void> {
    await this.chat.readAsCustomer(user);
  }

  @Get('admin/chats')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Customer conversations, latest message first (staff)',
  })
  @ApiOkResponse({ type: ConversationListDto })
  list(@Query() query: CursorQueryDto): Promise<ConversationListDto> {
    return this.chat.list(query);
  }

  @Get('admin/chats/:id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'One conversation with its customer (staff)' })
  @ApiOkResponse({ type: ChatThreadDto })
  conversation(@Param('id', ParseUUIDPipe) id: string): Promise<ChatThreadDto> {
    return this.chat.conversation(id);
  }

  @Post('admin/chats/:id/messages')
  @Roles(...STAFF_ROLES)
  @Throttle(SEND_LIMIT)
  @ApiOperation({ summary: 'Reply to a customer (staff)' })
  @ApiCreatedResponse({ type: ChatMessageDto })
  reply(
    @GetUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessageDto> {
    return this.chat.sendAsStore(user, id, dto.body);
  }

  @Post('admin/chats/:id/read')
  @Roles(...STAFF_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mark a customer's messages read (staff)" })
  @ApiNoContentResponse()
  async readConversation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.chat.readAsStore(id);
  }
}
