import {
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import {
  CheckCouponDto,
  CouponCheckDto,
  CouponDto,
  CreateCouponDto,
  PublicCouponDto,
  UpdateCouponDto,
} from './coupons.dto.js';
import { CouponsService } from './coupons.service.js';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post('check')
  @Public()
  // Slows down guessing codes.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'What a coupon code takes off a subtotal' })
  @ApiOkResponse({ type: CouponCheckDto })
  check(@Body() dto: CheckCouponDto): Promise<CouponCheckDto> {
    return this.coupons.check(dto);
  }

  @Get('public')
  @Public()
  @ApiOperation({
    summary: "Coupons listed on the store's coupons page, usable now",
  })
  @ApiOkResponse({ type: [PublicCouponDto] })
  listPublic(): Promise<PublicCouponDto[]> {
    return this.coupons.listPublic();
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "The store's coupons (staff)" })
  @ApiOkResponse({ type: [CouponDto] })
  list(): Promise<CouponDto[]> {
    return this.coupons.list();
  }

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a coupon (staff)' })
  @ApiCreatedResponse({ type: CouponDto })
  @ApiConflictResponse({ description: 'The code is taken' })
  create(@Body() dto: CreateCouponDto): Promise<CouponDto> {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change a coupon (staff)' })
  @ApiOkResponse({ type: CouponDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponDto> {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a coupon no order used (staff)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Orders used it; deactivate it instead' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.coupons.remove(id);
  }
}
