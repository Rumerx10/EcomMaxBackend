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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { TenantSeller } from '../../tenant/tenant.context.js';
import { CurrentSeller } from '../../tenant/tenant.decorators.js';
import { DomainService } from './domain.service.js';
import { AddDomainDto, DomainResponseDto } from './dto/domain.dto.js';
import { StoreProfileDto, StoreSettingsDto } from './dto/store-response.dto.js';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto.js';
import { SellerService } from './seller.service.js';

// The current store (named by X-Seller-Host): its public profile, settings and domains.
@ApiTags('Store')
@Controller('store')
export class StoreController {
  constructor(
    private readonly sellers: SellerService,
    private readonly domains: DomainService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Public store details for headers, footers and checkout',
  })
  @ApiOkResponse({ type: StoreProfileDto })
  profile(@CurrentSeller() seller: TenantSeller): Promise<StoreProfileDto> {
    return this.sellers.getProfile(seller.id);
  }

  @Get('settings')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'All store settings (staff)' })
  @ApiOkResponse({ type: StoreSettingsDto })
  settings(@CurrentSeller() seller: TenantSeller): Promise<StoreSettingsDto> {
    return this.sellers.getSettings(seller.id);
  }

  @Patch('settings')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change contact details, fees and alerts (staff)' })
  @ApiOkResponse({ type: StoreSettingsDto })
  updateSettings(
    @CurrentSeller() seller: TenantSeller,
    @Body() dto: UpdateStoreSettingsDto,
  ): Promise<StoreSettingsDto> {
    return this.sellers.updateSettings(seller.id, dto);
  }

  @Get('domains')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "The store's custom domains (staff)" })
  @ApiOkResponse({ type: [DomainResponseDto] })
  listDomains(): Promise<DomainResponseDto[]> {
    return this.domains.list();
  }

  @Post('domains')
  @Roles('OWNER')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Add a custom domain (owner)',
    description: 'Returns the DNS TXT record to create; then call verify.',
  })
  @ApiCreatedResponse({ type: DomainResponseDto })
  @ApiConflictResponse({
    description: 'Another store already uses this domain',
  })
  addDomain(@Body() dto: AddDomainDto): Promise<DomainResponseDto> {
    return this.domains.add(dto.hostname);
  }

  @Post('domains/:id/verify')
  @Roles('OWNER')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check the DNS record and start serving the domain (owner)',
  })
  @ApiOkResponse({ type: DomainResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'The TXT record is not there yet',
  })
  verifyDomain(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DomainResponseDto> {
    return this.domains.verify(id);
  }

  @Post('domains/:id/primary')
  @Roles('OWNER')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Make a verified domain the one the store links to (owner)',
  })
  @ApiOkResponse({ type: DomainResponseDto })
  makePrimary(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DomainResponseDto> {
    return this.domains.makePrimary(id);
  }

  @Delete('domains/:id')
  @Roles('OWNER')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a custom domain (owner)' })
  @ApiNoContentResponse()
  async removeDomain(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.domains.remove(id);
  }
}
