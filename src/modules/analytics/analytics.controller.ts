import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import { AnalyticsDto, AnalyticsQueryDto } from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Roles(...STAFF_ROLES)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seller dashboard figures for a period, compared with the one before (staff)',
    description:
      'today by hour, week and month by day, year by month; Dhaka time.',
  })
  @ApiOkResponse({ type: AnalyticsDto })
  report(@Query() query: AnalyticsQueryDto): Promise<AnalyticsDto> {
    return this.analytics.report(query.range);
  }
}
