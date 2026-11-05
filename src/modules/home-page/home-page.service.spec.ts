import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import type { HomePageContent, SaveHomePageDto } from './dto/home-page.dto.js';
import { defaultHomePage } from './home-page.defaults.js';
import { HomePageService } from './home-page.service.js';

const SELLER_ID = '0192f3c4-0000-7000-8000-000000000001';
const PRODUCT_ID = '0192f3c4-0000-7000-8000-0000000000aa';

const db = {
  homePage: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  product: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
};

const withHidden = (): HomePageContent => {
  const page = defaultHomePage('Solar Bari');
  page.sections[1].visible = false;
  return page;
};

describe('HomePageService', () => {
  let service: HomePageService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HomePageService,
        { provide: TenantPrismaService, useValue: { db, sellerId: SELLER_ID } },
      ],
    }).compile();
    service = moduleRef.get(HomePageService);
  });

  it('shows the default page, named after the store, until one is saved', async () => {
    db.homePage.findUnique.mockResolvedValue(null);
    const page = await service.get('Solar Bari', false);
    expect(page.customised).toBe(false);
    expect(page.updatedAt).toBeNull();
    expect(page.hero.title).toBe('Welcome to Solar Bari');
    expect(page.sections.length).toBeGreaterThan(0);
  });

  it('gives shoppers the visible sections and staff all of them', async () => {
    const updatedAt = new Date('2026-11-03T10:00:00Z');
    db.homePage.findUnique.mockResolvedValue({
      content: withHidden(),
      updatedAt,
    });
    const total = withHidden().sections.length;

    const shopper = await service.get('Solar Bari', false);
    expect(shopper.sections).toHaveLength(total - 1);
    expect(shopper.sections.every((section) => section.visible)).toBe(true);

    const staff = await service.get('Solar Bari', true);
    expect(staff.sections).toHaveLength(total);
    expect(staff).toMatchObject({ customised: true, updatedAt });
  });

  it('saves the page as plain JSON for the current store', async () => {
    const updatedAt = new Date();
    db.homePage.upsert.mockResolvedValue({ updatedAt });
    const dto = defaultHomePage('Solar Bari') as SaveHomePageDto;

    const saved = await service.save(dto);

    expect(db.homePage.upsert).toHaveBeenCalledWith({
      where: { sellerId: SELLER_ID },
      create: { sellerId: SELLER_ID, content: dto },
      update: { content: dto },
    });
    expect(saved).toMatchObject({ customised: true, updatedAt });
  });

  it('refuses two sections with the same id', async () => {
    const dto = defaultHomePage('Solar Bari') as SaveHomePageDto;
    dto.sections.push(structuredClone(dto.sections[0]));
    await expect(service.save(dto)).rejects.toThrow(BadRequestException);
    expect(db.homePage.upsert).not.toHaveBeenCalled();
  });

  it('refuses products that are not in the store', async () => {
    db.product.findMany.mockResolvedValue([]);
    const dto = defaultHomePage('Solar Bari') as SaveHomePageDto;
    dto.hero.featuredProductId = PRODUCT_ID;

    await expect(service.save(dto)).rejects.toThrow(
      'Some chosen products are not in this store',
    );
    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: [PRODUCT_ID] } },
      select: { id: true },
    });
  });

  it('refuses a product row for a category that does not exist', async () => {
    db.category.findMany.mockResolvedValue([]);
    const dto = defaultHomePage('Solar Bari') as SaveHomePageDto;
    dto.sections.push({
      id: 'batteries',
      type: 'products',
      visible: true,
      title: 'Batteries',
      subtitle: '',
      source: 'category',
      categorySlug: 'batteries',
      limit: 4,
    });
    await expect(service.save(dto)).rejects.toThrow(
      'No category with the slug batteries',
    );
  });

  it('resets by removing the saved page', async () => {
    await service.reset();
    expect(db.homePage.deleteMany).toHaveBeenCalledWith({});
  });
});
