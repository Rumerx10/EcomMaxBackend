import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { SalesReportController } from './sales-report.controller.js';
import { SalesReportService } from './sales-report.service.js';

@Module({
  providers: [AnalyticsService, SalesReportService],
  controllers: [AnalyticsController, SalesReportController],
})
export class AnalyticsModule {}
