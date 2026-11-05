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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import {
  BulkUpdateProductsDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product-input.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import {
  ProductDetailDto,
  ProductListResponseDto,
  ProductSummaryDto,
} from './dto/product-response.dto.js';
import { ProductsService } from './products.service.js';

const isStaff = (user?: AuthUser) => !!user && STAFF_ROLES.includes(user.role);

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: "List the store's products with filters and sorting",
    description:
      'Shoppers get ACTIVE products; signed-in staff get every status.',
  })
  @ApiOkResponse({ type: ProductListResponseDto })
  list(
    @Query() query: ProductQueryDto,
    @GetUser() user?: AuthUser,
  ): Promise<ProductListResponseDto> {
    return this.products.list(query, isStaff(user));
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'One product by its slug' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiNotFoundResponse()
  findBySlug(
    @Param('slug') slug: string,
    @GetUser() user?: AuthUser,
  ): Promise<ProductDetailDto> {
    return this.products.findOne({ slug }, isStaff(user));
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'One product by id' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiNotFoundResponse()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user?: AuthUser,
  ): Promise<ProductDetailDto> {
    return this.products.findOne({ id }, isStaff(user));
  }

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Add a product with its images and options (staff)',
  })
  @ApiCreatedResponse({ type: ProductDetailDto })
  @ApiConflictResponse({
    description: 'The SKU or slug is taken in this store',
  })
  create(@Body() dto: CreateProductDto): Promise<ProductDetailDto> {
    return this.products.create(dto);
  }

  // Declared before :id so "bulk" is not read as an id.
  @Patch('bulk')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Change price, stock or status of many products at once (staff)',
    description:
      'All changes are saved together, or none if any product is not found.',
  })
  @ApiOkResponse({ type: [ProductSummaryDto] })
  bulkUpdate(@Body() dto: BulkUpdateProductsDto): Promise<ProductSummaryDto[]> {
    return this.products.bulkUpdate(dto);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a product (staff)',
    description: 'images and options, when sent, replace the whole list.',
  })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiConflictResponse({
    description: 'The SKU or slug is taken in this store',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product that was never ordered (staff)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'It has been ordered; archive it instead',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.products.remove(id);
  }
}
