import { Module } from '@nestjs/common';
import { ShippingController } from './shipping.controller.js';
import { ShippingService } from './shipping.service.js';

@Module({
  providers: [ShippingService],
  controllers: [ShippingController],
  exports: [ShippingService],
})
export class ShippingModule {}
