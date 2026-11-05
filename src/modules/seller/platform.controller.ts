import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { NoTenant } from '../../tenant/tenant.decorators.js';
import {
  CreateSellerDto,
  UpdateSellerStatusDto,
} from './dto/create-seller.dto.js';
import {
  SellerCreatedDto,
  StoreSettingsDto,
} from './dto/store-response.dto.js';
import { PlatformKeyGuard } from './platform-key.guard.js';
import { SellerService } from './seller.service.js';

// Platform operations across stores. Not tied to one store, and not signed in as a store
// user: the X-Platform-Key header is the credential until there is a platform admin.
@ApiTags('Platform')
@ApiHeader({ name: 'X-Platform-Key', required: true })
@NoTenant()
@Public()
@UseGuards(PlatformKeyGuard)
@Controller('platform/sellers')
export class PlatformController {
  constructor(private readonly sellers: SellerService) {}

  @Post()
  @ApiOperation({
    summary: 'Open a new store with its owner account',
    description: 'The store starts PENDING unless status is ACTIVE.',
  })
  @ApiCreatedResponse({ type: SellerCreatedDto })
  @ApiConflictResponse({ description: 'The slug is taken' })
  create(@Body() dto: CreateSellerDto): Promise<SellerCreatedDto> {
    return this.sellers.createSeller(dto);
  }

  @Get()
  @ApiOperation({ summary: 'All stores, newest first' })
  @ApiOkResponse({ type: [StoreSettingsDto] })
  list(): Promise<StoreSettingsDto[]> {
    return this.sellers.listSellers();
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Open, suspend or close a store' })
  @ApiOkResponse({ type: StoreSettingsDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSellerStatusDto,
  ): Promise<StoreSettingsDto> {
    return this.sellers.setStatus(id, dto.status);
  }
}
