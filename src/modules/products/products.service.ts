import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import { sanitizeHtml } from '../../common/utils/rich-text.js';
import { slugify } from '../../common/utils/slug.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type {
  BulkUpdateProductsDto,
  CreateProductDto,
  ProductImageInputDto,
  ProductOptionInputDto,
  UpdateProductDto,
} from './dto/product-input.dto.js';
import type { ProductQueryDto, ProductSort } from './dto/product-query.dto.js';
import type {
  ProductDetailDto,
  ProductListResponseDto,
  ProductSummaryDto,
} from './dto/product-response.dto.js';
import { originalPrice, priceRange } from './pricing.js';

const byPosition = { orderBy: { position: 'asc' as const } };

const SUMMARY_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  images: byPosition,
  options: { ...byPosition, include: { values: byPosition } },
} satisfies Prisma.ProductInclude;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  images: byPosition,
} satisfies Prisma.ProductInclude;

type ProductWithSummary = Prisma.ProductGetPayload<{
  include: typeof SUMMARY_INCLUDE;
}>;
type ProductWithDetail = Prisma.ProductGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

const ORDER_BY: Record<ProductSort, Prisma.ProductOrderByWithRelationInput[]> =
  {
    newest: [{ createdAt: 'desc' }, { id: 'desc' }],
    price_asc: [{ price: 'asc' }, { id: 'asc' }],
    price_desc: [{ price: 'desc' }, { id: 'desc' }],
    popular: [{ soldCount: 'desc' }, { id: 'desc' }],
    rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'desc' }],
  };

const imageRows = (images: ProductImageInputDto[]) =>
  images.map((image, position) => ({
    url: image.url,
    alt: image.alt ?? null,
    position,
  }));

const optionRows = (options: ProductOptionInputDto[]) =>
  options.map((option, position) => ({
    name: option.name,
    position,
    values: {
      create: option.values.map((value, index) => ({
        label: value.label,
        priceDelta: value.priceDelta ?? 0,
        swatch: value.swatch ?? null,
        imageUrl: value.imageUrl ?? null,
        position: index,
      })),
    },
  }));

// The plain fields of a create or update; lists (images, options) are handled separately.
const scalarFields = (dto: UpdateProductDto) => ({
  title: dto.title,
  slug: dto.slug,
  sku: dto.sku,
  categoryId: dto.categoryId,
  price: dto.price,
  discountPercent: dto.discountPercent,
  costPrice: dto.costPrice,
  stock: dto.stock,
  status: dto.status,
  description:
    dto.description === undefined ? undefined : sanitizeHtml(dto.description),
  brand: dto.brand,
  barcode: dto.barcode,
  weight: dto.weight,
  tags: dto.tags,
  highlights: dto.highlights,
  specs: dto.specs,
  warrantyInfo: dto.warrantyInfo,
  popular: dto.popular,
  trending: dto.trending,
  latest: dto.latest,
});

const toSummary = (
  product: ProductWithSummary,
  staff: boolean,
): ProductSummaryDto => {
  const range = priceRange(product);
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    sku: product.sku,
    brand: product.brand,
    category: product.category,
    price: fixed2(product.price),
    originalPrice: fixed2(
      originalPrice(product.price, product.discountPercent),
    ),
    discountPercent: fixed2(product.discountPercent),
    priceRange: { min: fixed2(range.min), max: fixed2(range.max) },
    stock: product.stock,
    inStock: product.stock > 0,
    status: product.status,
    tags: product.tags,
    popular: product.popular,
    trending: product.trending,
    latest: product.latest,
    ratingAvg: fixed2(product.ratingAvg),
    ratingCount: product.ratingCount,
    soldCount: product.soldCount,
    thumbnail: product.images[0]?.url ?? null,
    hasOptions: product.options.some((option) => option.values.length > 0),
    // Cards add to the cart and show colour swatches, so lists carry images and options too.
    highlights: product.highlights,
    images: product.images.map(({ id, url, alt, position }) => ({
      id,
      url,
      alt,
      position,
    })),
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((value) => ({
        id: value.id,
        label: value.label,
        priceDelta: fixed2(value.priceDelta),
        swatch: value.swatch,
        imageUrl: value.imageUrl,
      })),
    })),
    ...(staff ? { costPrice: fixed2(product.costPrice) } : {}),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

const toDetail = (
  product: ProductWithDetail,
  staff: boolean,
): ProductDetailDto =>
  Object.assign(toSummary(product, staff), {
    description: product.description,
    barcode: product.barcode,
    weight: product.weight?.toFixed(3) ?? null,
    specs: product.specs as [string, string][],
    warrantyInfo: product.warrantyInfo,
  });

// The store's catalogue. Shoppers only ever see ACTIVE products; drafts and archived products
// are for staff. A product that has been ordered can't be deleted, only archived, because
// order history points at it.
@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async list(
    query: ProductQueryDto,
    staff: boolean,
  ): Promise<ProductListResponseDto> {
    const where: Prisma.ProductWhereInput = {
      status: staff ? query.status : 'ACTIVE',
    };

    if (query.category || query.categoryId) {
      const categoryIds = await this.categoryWithDescendants(query, staff);
      if (!categoryIds) return this.emptyPage(query);
      where.categoryId = { in: categoryIds };
    }
    if (query.search) {
      where.OR = (['title', 'brand', 'sku'] as const).map((field) => ({
        [field]: { contains: query.search, mode: 'insensitive' },
      }));
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = { gte: query.minPrice, lte: query.maxPrice };
    }
    if (query.inStock) where.stock = { gt: 0 };
    if (query.tag) where.tags = { has: query.tag };
    if (query.brand) where.brand = { equals: query.brand, mode: 'insensitive' };
    if (query.popular !== undefined) where.popular = query.popular;
    if (query.trending !== undefined) where.trending = query.trending;
    if (query.latest !== undefined) where.latest = query.latest;
    if (staff && query.lowStock) {
      const seller = await this.prisma.seller.findUniqueOrThrow({
        where: { id: this.tenantPrisma.sellerId },
        select: { lowStockThreshold: true },
      });
      where.stock = { lte: seller.lowStockThreshold };
    }

    const [total, products] = await Promise.all([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: ORDER_BY[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: products.map((product) => toSummary(product, staff)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(where: { id: string } | { slug: string }, staff: boolean) {
    const product = await this.db.product.findFirst({
      where: { ...where, ...(staff ? {} : { status: 'ACTIVE' }) },
      include: DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return toDetail(product, staff);
  }

  async create(dto: CreateProductDto): Promise<ProductDetailDto> {
    await this.requireCategory(dto.categoryId);
    const slug = dto.slug ?? slugify(dto.title);
    if (!slug)
      throw new BadRequestException(
        'Give the product a slug made of letters or digits',
      );

    const product = await this.db.product.create({
      data: {
        ...scalarFields(dto),
        sellerId: this.tenantPrisma.sellerId,
        title: dto.title,
        sku: dto.sku,
        categoryId: dto.categoryId,
        price: dto.price,
        stock: dto.stock,
        slug,
        images: { create: imageRows(dto.images ?? []) },
        options: { create: optionRows(dto.options ?? []) },
      },
      include: DETAIL_INCLUDE,
    });
    return toDetail(product, true);
  }

  // Images and options, when given, replace the whole list in the same transaction.
  async update(id: string, dto: UpdateProductDto): Promise<ProductDetailDto> {
    await this.requireProduct(id);
    if (dto.categoryId) await this.requireCategory(dto.categoryId);

    const product = await this.db.$transaction(async (tx) => {
      if (dto.images)
        await tx.productImage.deleteMany({ where: { productId: id } });
      if (dto.options)
        await tx.productOption.deleteMany({ where: { productId: id } });
      return tx.product.update({
        where: { id },
        data: {
          ...scalarFields(dto),
          ...(dto.images ? { images: { create: imageRows(dto.images) } } : {}),
          ...(dto.options
            ? { options: { create: optionRows(dto.options) } }
            : {}),
        },
        include: DETAIL_INCLUDE,
      });
    });
    return toDetail(product, true);
  }

  async bulkUpdate(dto: BulkUpdateProductsDto): Promise<ProductSummaryDto[]> {
    const products = await this.db.$transaction(
      dto.items.map(({ id, ...changes }) =>
        this.db.product.update({
          where: { id },
          data: changes,
          include: SUMMARY_INCLUDE,
        }),
      ),
    );
    return products.map((product) => toSummary(product, true));
  }

  async remove(id: string): Promise<void> {
    const product = await this.db.product.findUnique({
      where: { id },
      select: { _count: { select: { orderItems: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product._count.orderItems > 0) {
      throw new ConflictException(
        'This product has been ordered, so it stays in the order history. Archive it instead.',
      );
    }
    await this.db.product.delete({ where: { id } });
  }

  private async requireProduct(id: string) {
    const product = await this.db.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
  }

  private async requireCategory(id: string) {
    const category = await this.db.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  // The category and every category below it, so "Solar" also lists "Rooftop panels".
  // A store has few categories, so they are loaded in one query and walked in memory.
  private async categoryWithDescendants(
    query: ProductQueryDto,
    staff: boolean,
  ): Promise<string[] | null> {
    const categories = await this.db.category.findMany({
      where: staff ? {} : { isActive: true },
      select: { id: true, slug: true, parentId: true },
    });
    const root = categories.find((category) =>
      query.categoryId
        ? category.id === query.categoryId
        : category.slug === query.category,
    );
    if (!root) return null;
    const ids = [root.id];
    for (let i = 0; i < ids.length; i++) {
      for (const category of categories) {
        if (category.parentId === ids[i]) ids.push(category.id);
      }
    }
    return ids;
  }

  private emptyPage(query: ProductQueryDto): ProductListResponseDto {
    return {
      data: [],
      meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
    };
  }
}
