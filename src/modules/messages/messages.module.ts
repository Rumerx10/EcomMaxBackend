import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  providers: [MessagesService],
  controllers: [MessagesController],
})
export class MessagesModule {}
