import { Module } from '@nestjs/common';
import {
  DNS_TXT_RESOLVER,
  defaultTxtResolver,
  DomainService,
} from './domain.service.js';
import { PlatformKeyGuard } from './platform-key.guard.js';
import { PlatformController } from './platform.controller.js';
import { SellerService } from './seller.service.js';
import { StoreController } from './store.controller.js';

@Module({
  providers: [
    SellerService,
    DomainService,
    PlatformKeyGuard,
    { provide: DNS_TXT_RESOLVER, useValue: defaultTxtResolver },
  ],
  controllers: [StoreController, PlatformController],
  exports: [SellerService],
})
export class SellerModule {}
