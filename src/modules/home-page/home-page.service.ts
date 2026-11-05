import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type {
  HomePageContent,
  HomePageDto,
  HomeSectionDto,
  SaveHomePageDto,
} from './dto/home-page.dto.js';
import { defaultHomePage } from './home-page.defaults.js';

// The products and categories a page points at, so a save can check they exist.
const references = (page: HomePageContent) => {
  const productIds = new Set<string>();
  const categorySlugs = new Set<string>();
  if (page.hero.featuredProductId) productIds.add(page.hero.featuredProductId);
  for (const section of page.sections) {
    if (section.type === 'combo') {
      section.productIds.forEach((id) => productIds.add(id));
    }
    if (section.type === 'products' && section.source === 'manual') {
      section.productIds?.forEach((id) => productIds.add(id));
    }
    if (
      section.type === 'products' &&
      section.source === 'category' &&
      section.categorySlug
    ) {
      categorySlugs.add(section.categorySlug);
    }
  }
  return { productIds: [...productIds], categorySlugs: [...categorySlugs] };
};

const duplicateId = (sections: HomeSectionDto[]) => {
  const seen = new Set<string>();
  return sections.find((section) => seen.size === seen.add(section.id).size)
    ?.id;
};

// The store's home page: the saved one, or the default until staff save their own.
@Injectable()
export class HomePageService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  // Shoppers get the visible sections only; staff get all of them to edit.
  async get(storeName: string, staff: boolean): Promise<HomePageDto> {
    const row = await this.db.homePage.findUnique({
      where: { sellerId: this.tenantPrisma.sellerId },
    });
    // Validated by SaveHomePageDto when it was saved.
    const page = row
      ? (row.content as unknown as HomePageContent)
      : defaultHomePage(storeName);
    return {
      hero: page.hero,
      sections: staff
        ? page.sections
        : page.sections.filter((section) => section.visible),
      customised: row !== null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async save(dto: SaveHomePageDto): Promise<HomePageDto> {
    const repeated = duplicateId(dto.sections);
    if (repeated) {
      throw new BadRequestException(`Two sections share the id "${repeated}"`);
    }
    await this.checkReferences(dto);

    // Plain JSON: the DTO class instances carry nothing else.
    const page = JSON.parse(JSON.stringify(dto)) as HomePageContent;
    const content = page as unknown as Prisma.InputJsonObject;
    const sellerId = this.tenantPrisma.sellerId;
    const row = await this.db.homePage.upsert({
      where: { sellerId },
      create: { sellerId, content },
      update: { content },
    });
    return { ...page, customised: true, updatedAt: row.updatedAt };
  }

  // Back to the default page.
  async reset(): Promise<void> {
    await this.db.homePage.deleteMany({});
  }

  private async checkReferences(page: HomePageContent) {
    const { productIds, categorySlugs } = references(page);
    if (productIds.length > 0) {
      const found = await this.db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (found.length < productIds.length) {
        throw new BadRequestException(
          'Some chosen products are not in this store any more. Pick them again.',
        );
      }
    }
    if (categorySlugs.length > 0) {
      const found = await this.db.category.findMany({
        where: { slug: { in: categorySlugs } },
        select: { slug: true },
      });
      const known = new Set(found.map((category) => category.slug));
      const missing = categorySlugs.filter((slug) => !known.has(slug));
      if (missing.length > 0) {
        throw new BadRequestException(
          `No category with the slug ${missing.join(', ')}`,
        );
      }
    }
  }
}
