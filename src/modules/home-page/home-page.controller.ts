import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import type { TenantSeller } from '../../tenant/tenant.context.js';
import { CurrentSeller } from '../../tenant/tenant.decorators.js';
import {
  HomePageDto,
  SaveHomePageDto,
  SECTION_DTOS,
} from './dto/home-page.dto.js';
import { HomePageService } from './home-page.service.js';

const isStaff = (user?: AuthUser) => !!user && STAFF_ROLES.includes(user.role);

// The shop's home page, built in the seller centre: a hero, then sections in any order.
@ApiTags('Home page')
@ApiExtraModels(...SECTION_DTOS)
@Controller('store/home')
export class HomePageController {
  constructor(private readonly homePage: HomePageService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: "The shop's home page: the hero and its sections",
    description:
      'Shoppers get the visible sections; signed-in staff get hidden ones too. A store ' +
      'that has not saved one gets the default page (customised: false).',
  })
  @ApiOkResponse({ type: HomePageDto })
  get(
    @CurrentSeller() seller: TenantSeller,
    @GetUser() user?: AuthUser,
  ): Promise<HomePageDto> {
    return this.homePage.get(seller.name, isStaff(user));
  }

  @Put()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Save the whole home page (staff)',
    description:
      'The sections are saved in the order sent; the hero always comes first.',
  })
  @ApiOkResponse({ type: HomePageDto })
  @ApiBadRequestResponse({
    description:
      'Invalid content, a repeated section id, or a product or category not in the store',
  })
  save(@Body() dto: SaveHomePageDto): Promise<HomePageDto> {
    return this.homePage.save(dto);
  }

  @Delete()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Go back to the default home page (staff)' })
  @ApiNoContentResponse()
  async reset(): Promise<void> {
    await this.homePage.reset();
  }
}
