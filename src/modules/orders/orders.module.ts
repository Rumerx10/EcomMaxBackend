import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CartModule } from '../cart/cart.module.js';
import { SellerModule } from '../seller/seller.module.js';
import { CheckoutService } from './checkout.service.js';
import { InvoicesService } from './invoices.service.js';
import {
  CheckoutController,
  OrdersController,
  StoreOrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule, CartModule, AddressesModule, SellerModule],
  providers: [CheckoutService, OrdersService, InvoicesService],
  controllers: [CheckoutController, OrdersController, StoreOrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
