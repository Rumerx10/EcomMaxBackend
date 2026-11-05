import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import {
  type EnvironmentVariables,
  validateEnv,
} from './config/env.validation.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CategoryModule } from './modules/category/category.module.js';
import { CouponsModule } from './modules/coupons/coupons.module.js';
import { HomePageModule } from './modules/home-page/home-page.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { SellerModule } from './modules/seller/seller.module.js';
import { ShippingModule } from './modules/shipping/shipping.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenantGuard } from './tenant/tenant.guard.js';
import { TenantModule } from './tenant/tenant.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests pass every variable explicitly and must never pick up a real database from .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    // NestJS Observe (traces, metrics, CPU profiles) runs only in production with real keys,
    // which it reads from OBSERVE_APP_KEY and OBSERVE_APP_SECRET. Elsewhere it stays off: it
    // would report with placeholder keys, and its profiler sometimes aborted the e2e workers.
    // ConfigModule (above) has loaded .env into process.env by the time this runs.
    ObserveModule.forRoot({
      enabled:
        process.env.NODE_ENV === 'production' &&
        !!process.env.OBSERVE_APP_KEY &&
        !!process.env.OBSERVE_APP_SECRET,
      serviceId: 'nextpower',
    }),
    // Per client IP. Frontend servers that call the API on behalf of shoppers must forward the
    // shopper's IP (X-Forwarded-For) and be trusted through TRUST_PROXY, or every shopper of a
    // store shares one limit.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    PrismaModule,
    TenantModule,
    AuthModule,
    UsersModule,
    SellerModule,
    HomePageModule,
    CategoryModule,
    ProductsModule,
    CartModule,
    AddressesModule,
    ShippingModule,
    CouponsModule,
    OrdersModule,
    ReviewsModule,
    AnalyticsModule,
    UploadsModule,
    MessagesModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global guards run in this order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
