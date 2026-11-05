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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import {
  CreateShippingRateDto,
  ShippingRateDto,
  UpdateShippingRateDto,
} from './shipping.dto.js';
import { ShippingService } from './shipping.service.js';

@ApiTags('Shipping')
@Controller('shipping-rates')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Delivery options for checkout',
    description: 'Shoppers get the active ones; staff get all.',
  })
  @ApiOkResponse({ type: [ShippingRateDto] })
  list(@GetUser() user?: AuthUser): Promise<ShippingRateDto[]> {
    return this.shipping.list(!!user && STAFF_ROLES.includes(user.role));
  }

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add a delivery option (staff)' })
  @ApiCreatedResponse({ type: ShippingRateDto })
  create(@Body() dto: CreateShippingRateDto): Promise<ShippingRateDto> {
    return this.shipping.create(dto);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change a delivery option (staff)' })
  @ApiOkResponse({ type: ShippingRateDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShippingRateDto,
  ): Promise<ShippingRateDto> {
    return this.shipping.update(id, dto);
  }

  @Delete(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a delivery option (staff)' })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.shipping.remove(id);
  }
}
