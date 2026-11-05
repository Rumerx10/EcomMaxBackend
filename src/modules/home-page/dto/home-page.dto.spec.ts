import { readFileSync } from 'node:fs';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { defaultHomePage } from '../home-page.defaults.js';
import { ComboSectionDto, SaveHomePageDto } from './home-page.dto.js';

const PRODUCT_A = '0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0a';
const PRODUCT_B = '0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0b';

// Every message, nested ones included, as the global ValidationPipe would report them.
const messages = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...messages(error.children ?? []),
  ]);

const errorsFor = async (body: unknown) => {
  const dto = plainToInstance(SaveHomePageDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return JSON.stringify(messages(errors));
};

const page = (sections: unknown[]) => ({
  hero: defaultHomePage('Solar Bari').hero,
  sections,
});

const combo = (overrides: Record<string, unknown> = {}) => ({
  id: 'combo',
  type: 'combo',
  visible: true,
  title: 'Home backup kit',
  text: '',
  productIds: [PRODUCT_A, PRODUCT_B],
  comboPrice: 185000,
  couponCode: 'BACKUPKIT',
  image: null,
  ...overrides,
});

describe('SaveHomePageDto', () => {
  it('accepts the default page', async () => {
    expect(await errorsFor(defaultHomePage('Solar Bari'))).toBe('[]');
  });

  it("accepts NextPower's seeded home page", async () => {
    const seeded = readFileSync(
      new URL(
        '../../../../prisma/seed-data/next-power-home.json',
        import.meta.url,
      ),
      'utf8',
    ).replace(/\{product:[a-z0-9-]+\}/g, PRODUCT_A);
    expect(await errorsFor(JSON.parse(seeded))).toBe('[]');
  });

  it('turns each section into the class its type names', () => {
    const dto = plainToInstance(SaveHomePageDto, page([combo()]));
    expect(dto.sections[0]).toBeInstanceOf(ComboSectionDto);
    expect(dto.sections[0].type).toBe('combo');
  });

  it('accepts every kind of section', async () => {
    const image = { url: 'https://example.com/a.jpg', alt: '' };
    const body = page([
      combo(),
      {
        id: 'ads',
        type: 'banners',
        visible: true,
        title: '',
        slides: [
          { image: image.url, mobileImage: null, alt: 'Sale', href: '/deals' },
          {
            image: '/api/v1/uploads/0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f',
            alt: 'Batteries',
            href: null,
          },
        ],
        autoplaySeconds: 6,
      },
      {
        id: 'board',
        type: 'billboard',
        visible: false,
        title: 'Eid sale',
        text: '15% off',
        image,
        link: { label: 'Shop the sale', href: 'https://example.com/eid' },
        align: 'center',
      },
      {
        id: 'cards',
        type: 'promoCards',
        visible: true,
        title: '',
        cards: [
          {
            title: 'Home',
            text: '',
            points: ['Backup'],
            image,
            link: { label: 'Shop', href: '/products?searchTerm=home' },
          },
        ],
      },
      {
        id: 'picked',
        type: 'products',
        visible: true,
        title: 'Picked for you',
        subtitle: '',
        source: 'manual',
        productIds: [PRODUCT_A],
        limit: 4,
      },
      {
        id: 'videos',
        type: 'videos',
        visible: true,
        title: 'How it works',
        subtitle: '',
        videos: [
          {
            title: 'Home',
            text: '',
            videoUrl: 'https://example.com/a.mp4',
            poster: image.url,
          },
        ],
        image: null,
        points: [{ icon: 'wrench', title: 'Installed', text: '' }],
      },
      {
        id: 'steps',
        type: 'steps',
        visible: true,
        title: 'Steps',
        subtitle: '',
        steps: [{ icon: 'zap', title: 'Order', text: '' }],
      },
    ]);
    expect(await errorsFor(body)).toBe('[]');
  });

  it('refuses a section type it does not know', async () => {
    const errors = await errorsFor(
      page([{ id: 'x', type: 'marquee', visible: true }]),
    );
    expect(errors).toContain('type must be one of the following values');
  });

  it('refuses fields a section does not have', async () => {
    const errors = await errorsFor(page([combo({ price: 1 })]));
    expect(errors).toContain('property price should not exist');
  });

  it('needs at least two products in a combo', async () => {
    const errors = await errorsFor(page([combo({ productIds: [PRODUCT_A] })]));
    expect(errors).toContain('productIds must contain at least 2 elements');
  });

  it('refuses links that leave the shop without https', async () => {
    for (const href of [
      '//evil.example',
      'http://example.com',
      'javascript:alert(1)',
    ]) {
      const errors = await errorsFor(
        page([
          {
            id: 'board',
            type: 'billboard',
            visible: true,
            title: 'Sale',
            text: '',
            image: { url: 'https://example.com/a.jpg', alt: '' },
            link: { label: 'Go', href },
            align: 'left',
          },
        ]),
      );
      expect(errors).toContain('href must be a page of the shop');
    }
  });

  it('needs a category for a category row and products for a manual row', async () => {
    const row = {
      id: 'row',
      type: 'products',
      visible: true,
      title: 'Row',
      subtitle: '',
      limit: 4,
    };
    expect(await errorsFor(page([{ ...row, source: 'category' }]))).toContain(
      'categorySlug',
    );
    expect(await errorsFor(page([{ ...row, source: 'manual' }]))).toContain(
      'productIds',
    );
    expect(await errorsFor(page([{ ...row, source: 'popular' }]))).toBe('[]');
  });
});
