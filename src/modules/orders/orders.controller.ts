import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  Client,
  type ClientInfo,
} from '../../common/decorators/client-info.decorator.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import { readGuestToken } from '../cart/shopper.js';
import { CheckoutService } from './checkout.service.js';
import { CancelOrderDto, CheckoutDto } from './dto/checkout.dto.js';
import {
  MyOrdersQueryDto,
  StoreOrdersQueryDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
} from './dto/order-query.dto.js';
import {
  CheckoutResponseDto,
  OrderDto,
  OrderListResponseDto,
  StoreOrdersSummaryDto,
} from './dto/order-response.dto.js';
import { InvoiceBatchDto, InvoicesQueryDto } from './dto/invoice.dto.js';
import { InvoicesService } from './invoices.service.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @Public()
  // Guests prove an existing account with its password here, so it is limited like sign-in.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'A new random value per order; resending it returns the same order',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    required: false,
    description: "A guest's cart",
  })
  @ApiOperation({
    summary: 'Place an order from the cart, signed in or as a guest',
    description:
      'Guests give name, phone and password: the order creates their account (or uses the ' +
      'existing one if the password matches) and signs them in.',
  })
  @ApiCreatedResponse({ type: CheckoutResponseDto })
  @ApiOkResponse({
    type: CheckoutResponseDto,
    description: 'The same Idempotency-Key again',
  })
  @ApiConflictResponse({
    description: 'Cart items changed or sold out, or the phone has an account',
  })
  async checkout(
    @Body() dto: CheckoutDto,
    @GetUser() user: AuthUser | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Client() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CheckoutResponseDto> {
    const result = await this.checkoutService.checkout({
      dto,
      user,
      guestToken: user ? null : readGuestToken(req),
      idempotencyKey,
      client,
    });
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Your orders, newest first' })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(@GetUser('id') userId: string, @Query() query: MyOrdersQueryDto) {
    return this.orders.listMine(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of your orders, with its timeline' })
  @ApiOkResponse({ type: OrderDto })
  get(@GetUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getMine(userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel your order before it ships' })
  @ApiOkResponse({ type: OrderDto })
  @ApiConflictResponse({ description: 'Already shipped, or paid' })
  cancel(
    @GetUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelMine(userId, id, dto.reason);
  }
}

@ApiTags('Store orders')
@ApiBearerAuth('JWT-auth')
@Roles(...STAFF_ROLES)
@Controller('admin/orders')
export class StoreOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly invoiceService: InvoicesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "The store's orders, newest first (staff)" })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(@Query() query: StoreOrdersQueryDto) {
    return this.orders.listStore(query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Order counts by status and money by payment status (staff)',
  })
  @ApiOkResponse({ type: StoreOrdersSummaryDto })
  summary(): Promise<StoreOrdersSummaryDto> {
    return this.orders.storeSummary();
  }

  @Get('invoices')
  @ApiOperation({
    summary: 'Invoices to print, by order ids or by status (staff)',
    description:
      'The store once, then each order: delivery address, items, totals and the amount to ' +
      'collect. At most 50; by status they come oldest first.',
  })
  @ApiOkResponse({ type: InvoiceBatchDto })
  invoices(@Query() query: InvoicesQueryDto): Promise<InvoiceBatchDto> {
    return this.invoiceService.invoices(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One order with customer, costs and timeline (staff)',
  })
  @ApiOkResponse({ type: OrderDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getStore(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Move an order on: packed, shipped, delivered, cancelled or returned (staff)',
    description:
      'Cancelled and returned orders go back in stock unless restock is false. Delivering a ' +
      'cash-on-delivery order marks it paid.',
  })
  @ApiOkResponse({ type: OrderDto })
  @ApiConflictResponse({ description: 'Not a move this status allows' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.changeStatus(id, dto);
  }

  @Patch(':id/payment')
  @ApiOperation({
    summary: 'Mark an order paid (cash, bank transfer) or refunded (staff)',
  })
  @ApiOkResponse({ type: OrderDto })
  setPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.orders.setPayment(id, dto.status);
  }
}
