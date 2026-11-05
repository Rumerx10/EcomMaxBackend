import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators/public.decorator.js';
import { NoTenant } from './tenant/tenant.decorators.js';
import { AppService } from './app.service.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  @NoTenant()
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness and database check for load balancers' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  health(): Promise<{ status: 'ok' }> {
    return this.appService.health();
  }
}
