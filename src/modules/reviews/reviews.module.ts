import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller.js';
import { CommentsService } from './comments.service.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  providers: [ReviewsService, CommentsService],
  controllers: [ReviewsController],
})
export class ReviewsModule {}
