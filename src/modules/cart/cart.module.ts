import { Module } from '@nestjs/common';
import { CartController, WishlistController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { WishlistService } from './wishlist.service.js';

@Module({
  providers: [CartService, WishlistService],
  controllers: [CartController, WishlistController],
  exports: [CartService, WishlistService],
})
export class CartModule {}
