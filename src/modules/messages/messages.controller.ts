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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import {
  CreateMessageDto,
  MessageDto,
  MessageListDto,
  StoreMessagesQueryDto,
  UpdateMessageDto,
} from './messages.dto.js';
import { MessagesService } from './messages.service.js';

@ApiTags('Messages')
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('messages')
  @Public()
  // A contact form is an easy target for spam.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send the store a message (contact page) or feedback',
  })
  @ApiCreatedResponse({ type: MessageDto })
  create(
    @Body() dto: CreateMessageDto,
    @GetUser() user?: AuthUser,
  ): Promise<MessageDto> {
    return this.messages.create(dto, user);
  }

  @Get('admin/messages')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Messages and feedback, newest first (staff)' })
  @ApiOkResponse({ type: MessageListDto })
  list(@Query() query: StoreMessagesQueryDto): Promise<MessageListDto> {
    return this.messages.list(query);
  }

  @Patch('admin/messages/:id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark a message read or unread (staff)' })
  @ApiOkResponse({ type: MessageDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMessageDto,
  ): Promise<MessageDto> {
    return this.messages.markRead(id, dto.isRead);
  }

  @Delete('admin/messages/:id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a message (staff)' })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.messages.remove(id);
  }
}
