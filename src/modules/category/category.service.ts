import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { slugify } from '../../common/utils/slug.js';
import type { Category, Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type {
  CategoryListResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { QueryCategoryDto } from './dto/query-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

// Shoppers see active categories and count only products on sale; staff see everything.
const productCount = (staff: boolean) => ({
  _count: {
    select: {
      products: staff ? true : { where: { status: 'ACTIVE' as const } },
    },
  },
});

type CategoryWithCount = Category & { _count: { products: number } };

const toResponse = ({
  _count,
  sellerId: _sellerId,
  ...category
}: CategoryWithCount) => ({
  ...category,
  productCount: _count.products,
});

// A store's category tree. Slugs are unique within the store (enforced by the database), and
// a category can only be deleted once it has no products and no subcategories.
@Injectable()
export class CategoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug)
      throw new BadRequestException(
        'Give the category a slug made of letters or digits',
      );
    if (dto.parentId)
      await this.requireCategory(dto.parentId, 'Parent category not found');

    const category = await this.db.category.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        slug,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: productCount(true),
    });
    return toResponse(category);
  }

  async list(
    query: QueryCategoryDto,
    staff: boolean,
  ): Promise<CategoryListResponseDto> {
    const where: Prisma.CategoryWhereInput = {};
    if (!staff) where.isActive = true;
    else if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.parentId) where.parentId = query.parentId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, categories] = await Promise.all([
      this.db.category.count({ where }),
      this.db.category.findMany({
        where,
        include: productCount(staff),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: categories.map(toResponse),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, staff: boolean): Promise<CategoryResponseDto> {
    return this.findVisible({ id }, staff);
  }

  async findBySlug(slug: string, staff: boolean): Promise<CategoryResponseDto> {
    return this.findVisible({ slug }, staff);
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    await this.requireCategory(id, 'Category not found');
    if (dto.parentId) await this.checkNewParent(id, dto.parentId);

    const category = await this.db.category.update({
      where: { id },
      data: dto,
      include: productCount(true),
    });
    return toResponse(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.db.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    const { products, children } = category._count;
    if (products > 0) {
      throw new ConflictException(
        `This category still has ${products} product(s). Move them to another category first.`,
      );
    }
    if (children > 0) {
      throw new ConflictException(
        `This category still has ${children} subcategory(ies). Move or delete them first.`,
      );
    }
    await this.db.category.delete({ where: { id } });
  }

  private async findVisible(
    where: { id: string } | { slug: string },
    staff: boolean,
  ): Promise<CategoryResponseDto> {
    const category = await this.db.category.findFirst({
      where: { ...where, ...(staff ? {} : { isActive: true }) },
      include: productCount(staff),
    });
    if (!category) throw new NotFoundException('Category not found');
    return toResponse(category);
  }

  private async requireCategory(id: string, message: string) {
    const category = await this.db.category.findUnique({
      where: { id },
      select: { id: true, parentId: true },
    });
    if (!category) throw new NotFoundException(message);
    return category;
  }

  // A category can't sit under itself or under one of its own subcategories. Walks up from
  // the new parent; trees are a few levels deep, so this is a handful of lookups.
  private async checkNewParent(id: string, parentId: string) {
    let current: { id: string; parentId: string | null } | null =
      await this.requireCategory(parentId, 'Parent category not found');
    for (let depth = 0; current; depth++) {
      if (current.id === id || depth > 50) {
        throw new BadRequestException(
          'A category cannot be moved under itself or its subcategory',
        );
      }
      current = current.parentId
        ? await this.db.category.findUnique({
            where: { id: current.parentId },
            select: { id: true, parentId: true },
          })
        : null;
    }
  }
}
