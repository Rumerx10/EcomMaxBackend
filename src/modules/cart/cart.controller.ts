import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CartService } from './cart.service.js';
import {
  AddCartItemDto,
  AddWishlistItemDto,
  CartResponseDto,
  UpdateCartItemDto,
  WishlistResponseDto,
} from './dto/cart.dto.js';
import { CurrentShopper, readGuestToken, type Shopper } from './shopper.js';
import { WishlistService } from './wishlist.service.js';

const GUEST_HEADER_DOC = {
  name: 'X-Guest-Token',
  required: false,
  description:
    'For visitors who are not signed in: the guestToken from an earlier response',
};

// Hands a guest their token in a header too, so a frontend can store it from any response.
const exposeGuestToken = <T extends { guestToken: string | null }>(
  res: Response,
  body: T,
) => {
  if (body.guestToken) res.setHeader('X-Guest-Token', body.guestToken);
  return body;
};

@ApiTags('Cart')
@ApiHeader(GUEST_HEADER_DOC)
@Public()
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly wishlist: WishlistService,
  ) {}

  @Get()
  @ApiOperation({ summary: "The visitor's cart, priced now" })
  @ApiOkResponse({ type: CartResponseDto })
  async get(
    @CurrentShopper() shopper: Shopper,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(res, await this.cart.get(shopper));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add a product; adding it again raises the quantity',
    description:
      'A visitor without a guest token gets one with their new cart.',
  })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiConflictResponse({ description: 'Not enough stock, or the cart is full' })
  async add(
    @CurrentShopper() shopper: Shopper,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(res, await this.cart.addItem(shopper, dto));
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Change the quantity of a line' })
  @ApiOkResponse({ type: CartResponseDto })
  async update(
    @CurrentShopper() shopper: Shopper,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(
      res,
      await this.cart.updateItem(shopper, id, dto.quantity),
    );
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove a line' })
  @ApiOkResponse({ type: CartResponseDto })
  async remove(
    @CurrentShopper() shopper: Shopper,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(res, await this.cart.removeItem(shopper, id));
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the cart' })
  @ApiOkResponse({ type: CartResponseDto })
  async clear(
    @CurrentShopper() shopper: Shopper,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(res, await this.cart.clear(shopper));
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'After sign-in, move the guest cart and wishlist to the account',
    description:
      'Send the access token and the X-Guest-Token the visitor had before signing in.',
  })
  @ApiOkResponse({ type: CartResponseDto })
  async merge(@GetUser('id') userId: string | undefined, @Req() req: Request) {
    if (!userId)
      throw new BadRequestException('Sign in first, then merge the guest cart');
    const guestToken = readGuestToken(req);
    if (guestToken) {
      await this.cart.mergeGuestCart(userId, guestToken);
      await this.wishlist.mergeGuestWishlist(userId, guestToken);
    }
    return this.cart.get({ kind: 'user', userId });
  }
}

@ApiTags('Wishlist')
@ApiHeader(GUEST_HEADER_DOC)
@Public()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "The visitor's saved products" })
  @ApiOkResponse({ type: WishlistResponseDto })
  async get(
    @CurrentShopper() shopper: Shopper,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(res, await this.wishlist.get(shopper));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a product (saving it twice changes nothing)' })
  @ApiOkResponse({ type: WishlistResponseDto })
  async add(
    @CurrentShopper() shopper: Shopper,
    @Body() dto: AddWishlistItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(
      res,
      await this.wishlist.add(shopper, dto.productId),
    );
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove a saved product' })
  @ApiOkResponse({ type: WishlistResponseDto })
  async remove(
    @CurrentShopper() shopper: Shopper,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return exposeGuestToken(
      res,
      await this.wishlist.remove(shopper, productId),
    );
  }
}
