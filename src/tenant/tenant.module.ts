import {
  Global,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TenantPrismaService } from './tenant-prisma.service.js';
import { TenantContext } from './tenant.context.js';
import { TenantMiddleware } from './tenant.middleware.js';
import { TenantService } from './tenant.service.js';

// Global: every feature module needs the current store. TenantGuard is registered as a
// global guard in AppModule, after the rate limiter and before authentication.
@Global()
@Module({
  providers: [TenantContext, TenantService, TenantPrismaService],
  exports: [TenantContext, TenantService, TenantPrismaService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // The health check must answer even when store lookups fail.
    consumer
      .apply(TenantMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes('{*path}');
  }
}
