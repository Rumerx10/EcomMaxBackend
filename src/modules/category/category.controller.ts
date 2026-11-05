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
import { CategoryService } from './category.service.js';
import {
  CategoryListResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { QueryCategoryDto } from './dto/query-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

const isStaff = (user?: AuthUser) => !!user && STAFF_ROLES.includes(user.role);

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: "List the store's categories",
    description:
      'Shoppers get active categories; signed-in staff get all of them.',
  })
  @ApiOkResponse({ type: CategoryListResponseDto })
  list(
    @Query() query: QueryCategoryDto,
    @GetUser() user?: AuthUser,
  ): Promise<CategoryListResponseDto> {
    return this.categoryService.list(query, isStaff(user));
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'One category by its slug' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse()
  findBySlug(
    @Param('slug') slug: string,
    @GetUser() user?: AuthUser,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.findBySlug(slug, isStaff(user));
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'One category by id' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user?: AuthUser,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.findOne(id, isStaff(user));
  }

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a category (staff)' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'The slug is taken in this store' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoryService.create(dto);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a category (staff)' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'The slug is taken in this store' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an empty category (staff)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'It still has products or subcategories',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.categoryService.remove(id);
  }
}
