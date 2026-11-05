import { Module } from '@nestjs/common';
import { HomePageController } from './home-page.controller.js';
import { HomePageService } from './home-page.service.js';

@Module({
  providers: [HomePageService],
  controllers: [HomePageController],
})
export class HomePageModule {}
