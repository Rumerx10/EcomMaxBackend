import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator.js';
import { SLUG_PATTERN } from '../../../common/utils/slug.js';

// Icons a section item can show; the shop maps each name to its own icon.
export const HOME_ICONS = [
  'banknote',
  'battery',
  'building',
  'clipboard',
  'clock',
  'gift',
  'headphones',
  'home',
  'leaf',
  'map-pin',
  'message',
  'percent',
  'phone',
  'shield',
  'smartphone',
  'star',
  'sun',
  'truck',
  'wrench',
  'zap',
] as const;
export type HomeIcon = (typeof HOME_ICONS)[number];

export const SECTION_TYPES = [
  'features',
  'categories',
  'promoCards',
  'products',
  'banners',
  'billboard',
  'combo',
  'videos',
  'steps',
  'help',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

// Where a product row takes its products from.
export const PRODUCT_SOURCES = [
  'popular',
  'trending',
  'latest',
  'deals',
  'category',
  'manual',
] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

// A page of the shop ("/products?category=batteries"; the shop adds its own prefix) or an
// https link. "//host" is refused: it would leave the shop without saying so.
const LINK_PATTERN = /^(\/(?!\/)|https:\/\/)/;
const LINK_MESSAGE =
  'must be a page of the shop starting with / or an https link';
const SECTION_ID = /^[A-Za-z0-9_-]{1,40}$/;
const COUPON_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$/;

const nullable = (_: object, value: unknown) => value !== null;

export class HomeLinkDto {
  @ApiProperty({ example: 'Shop solar', maxLength: 40 })
  @IsString()
  @Length(1, 40)
  label: string;

  @ApiProperty({ example: '/products?category=batteries', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @Matches(LINK_PATTERN, { message: `href ${LINK_MESSAGE}` })
  href: string;
}

export class HomeImageDto {
  @ApiProperty({
    example: '/api/v1/uploads/0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f',
  })
  @IsImageUrl()
  url: string;

  @ApiProperty({
    example: 'Rows of solar panels under a blue sky',
    description:
      'Describes the picture for screen readers; empty for decoration',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  alt: string;
}

export class HomeIconItemDto {
  @ApiProperty({ enum: HOME_ICONS, example: 'truck' })
  @IsIn(HOME_ICONS)
  icon: HomeIcon;

  @ApiProperty({ example: 'Delivered nationwide', maxLength: 80 })
  @IsString()
  @Length(1, 80)
  title: string;

  @ApiProperty({ example: 'Packed for the road', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  text: string;
}

export class HeroDto {
  @ApiProperty({
    example: 'Official GoodWe range, delivered and installed',
    description: 'Short line above the title; empty to leave it out',
    maxLength: 80,
  })
  @IsString()
  @MaxLength(80)
  badge: string;

  @ApiProperty({ example: 'Power your home with', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({
    example: 'the sun.',
    description: 'Ends the title in the accent colour; empty for none',
    maxLength: 60,
  })
  @IsString()
  @MaxLength(60)
  highlight: string;

  @ApiProperty({
    example: 'Panels, inverters and batteries sized to your bill.',
    maxLength: 300,
  })
  @IsString()
  @MaxLength(300)
  subtitle: string;

  @ApiPropertyOptional({
    type: HomeImageDto,
    nullable: true,
    description: 'Background photo',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @ValidateNested()
  @Type(() => HomeImageDto)
  image?: HomeImageDto | null;

  @ApiPropertyOptional({ type: HomeLinkDto, nullable: true })
  @IsOptional()
  @ValidateIf(nullable)
  @ValidateNested()
  @Type(() => HomeLinkDto)
  primary?: HomeLinkDto | null;

  @ApiPropertyOptional({ type: HomeLinkDto, nullable: true })
  @IsOptional()
  @ValidateIf(nullable)
  @ValidateNested()
  @Type(() => HomeLinkDto)
  secondary?: HomeLinkDto | null;

  @ApiProperty({ description: 'Show a product card next to the text' })
  @IsBoolean()
  showProduct: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The product on the card; null picks the best rated',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @IsUUID()
  featuredProductId?: string | null;

  @ApiProperty({ description: 'Show the first public coupon under the card' })
  @IsBoolean()
  showCoupon: boolean;
}

// Fields every section has; each section class adds its own `type`.
export class HomeSectionBaseDto {
  @ApiProperty({
    example: 'popular',
    description: 'Stable id, unique on the page',
  })
  @IsString()
  @Matches(SECTION_ID, {
    message: 'id must be 1 to 40 letters, digits, - or _',
  })
  id: string;

  @ApiProperty({
    description: 'Hidden sections stay saved but shoppers do not see them',
  })
  @IsBoolean()
  visible: boolean;
}

// What a section with an unknown `type` becomes, so it fails with a clear message.
export class UnknownSectionDto extends HomeSectionBaseDto {
  @IsIn(SECTION_TYPES)
  type: string;
}

export class FeaturesSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['features'] })
  @IsIn(['features'])
  type: 'features';

  @ApiProperty({ type: [HomeIconItemDto], minItems: 1, maxItems: 8 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => HomeIconItemDto)
  items: HomeIconItemDto[];
}

export class CategoriesSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['categories'] })
  @IsIn(['categories'])
  type: 'categories';

  @ApiProperty({ example: 'Shop by category', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;
}

export class PromoCardDto {
  @ApiProperty({ example: 'Solar for your home', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 400 })
  @IsString()
  @MaxLength(400)
  text: string;

  @ApiProperty({
    type: [String],
    maxItems: 6,
    example: ['Backup during power cuts'],
  })
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  points: string[];

  @ApiProperty({ type: HomeImageDto })
  @ValidateNested()
  @Type(() => HomeImageDto)
  image: HomeImageDto;

  @ApiProperty({ type: HomeLinkDto })
  @ValidateNested()
  @Type(() => HomeLinkDto)
  link: HomeLinkDto;
}

export class PromoCardsSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['promoCards'] })
  @IsIn(['promoCards'])
  type: 'promoCards';

  @ApiProperty({
    example: 'Solutions for homes and businesses',
    description:
      'Read by screen readers only; the cards carry their own titles',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ type: [PromoCardDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PromoCardDto)
  cards: PromoCardDto[];
}

export class ProductsSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['products'] })
  @IsIn(['products'])
  type: 'products';

  @ApiProperty({ example: 'Popular right now', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  subtitle: string;

  @ApiProperty({
    enum: PRODUCT_SOURCES,
    description:
      'popular, trending or latest: products marked so; deals: the biggest discounts in stock; ' +
      'category: one category; manual: the products in productIds, in that order',
  })
  @IsIn(PRODUCT_SOURCES)
  source: ProductSource;

  @ApiPropertyOptional({
    example: 'batteries',
    description: 'With source category',
  })
  @ValidateIf((section: ProductsSectionDto) => section.source === 'category')
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'categorySlug must be a category slug' })
  categorySlug?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'With source manual',
    maxItems: 12,
  })
  @ValidateIf((section: ProductsSectionDto) => section.source === 'manual')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsUUID('all', { each: true })
  productIds?: string[];

  @ApiProperty({ example: 8, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  limit: number;
}

export class BannerSlideDto {
  @ApiProperty({ description: 'Wide image, about 2:1' })
  @IsImageUrl()
  image: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Taller crop for phones; else the wide one',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @IsImageUrl()
  mobileImage?: string | null;

  @ApiProperty({ example: 'GoodWe ESA home energy storage', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  alt: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '/products?category=batteries',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(500)
  @Matches(LINK_PATTERN, { message: `href ${LINK_MESSAGE}` })
  href?: string | null;
}

export class BannersSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['banners'] })
  @IsIn(['banners'])
  type: 'banners';

  @ApiProperty({ description: 'Read by screen readers only', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({
    type: [BannerSlideDto],
    minItems: 1,
    maxItems: 10,
    description: 'One banner is shown as is; several become a carousel',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BannerSlideDto)
  slides: BannerSlideDto[];

  @ApiProperty({
    example: 6,
    minimum: 0,
    maximum: 30,
    description: '0 turns autoplay off',
  })
  @IsInt()
  @Min(0)
  @Max(30)
  autoplaySeconds: number;
}

export class BillboardSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['billboard'] })
  @IsIn(['billboard'])
  type: 'billboard';

  @ApiProperty({
    example: 'Eid sale: 15% off hybrid inverters',
    maxLength: 120,
  })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  text: string;

  @ApiProperty({ type: HomeImageDto })
  @ValidateNested()
  @Type(() => HomeImageDto)
  image: HomeImageDto;

  @ApiPropertyOptional({ type: HomeLinkDto, nullable: true })
  @IsOptional()
  @ValidateIf(nullable)
  @ValidateNested()
  @Type(() => HomeLinkDto)
  link?: HomeLinkDto | null;

  @ApiProperty({ enum: ['left', 'center'] })
  @IsIn(['left', 'center'])
  align: 'left' | 'center';
}

export class ComboSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['combo'] })
  @IsIn(['combo'])
  type: 'combo';

  @ApiProperty({ example: 'Home backup kit', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  text: string;

  @ApiProperty({ type: [String], minItems: 2, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsUUID('all', { each: true })
  productIds: string[];

  @ApiProperty({ example: 185000, description: 'What the set costs together' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000_000)
  comboPrice: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 'BACKUPKIT',
    description: 'The coupon that gives the combo price at checkout',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @Matches(COUPON_CODE, {
    message: 'couponCode must be 3 to 30 letters, digits, - or _',
  })
  couponCode?: string | null;

  @ApiPropertyOptional({ type: HomeImageDto, nullable: true })
  @IsOptional()
  @ValidateIf(nullable)
  @ValidateNested()
  @Type(() => HomeImageDto)
  image?: HomeImageDto | null;
}

export class HomeVideoDto {
  @ApiProperty({ example: 'Home energy storage', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  text: string;

  @ApiProperty({
    example: 'https://example.com/home.mp4',
    description: 'An https MP4 or WebM',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  videoUrl: string;

  @ApiProperty({
    description: 'Shown before it plays and when motion is reduced',
  })
  @IsImageUrl()
  poster: string;
}

export class VideosSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['videos'] })
  @IsIn(['videos'])
  type: 'videos';

  @ApiProperty({ example: 'How a solar system works', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  subtitle: string;

  @ApiProperty({ type: [HomeVideoDto], maxItems: 4 })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => HomeVideoDto)
  videos: HomeVideoDto[];

  @ApiPropertyOptional({
    type: HomeImageDto,
    nullable: true,
    description: 'Photo beside the points',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @ValidateNested()
  @Type(() => HomeImageDto)
  image?: HomeImageDto | null;

  @ApiProperty({ type: [HomeIconItemDto], maxItems: 6 })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => HomeIconItemDto)
  points: HomeIconItemDto[];
}

export class StepsSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['steps'] })
  @IsIn(['steps'])
  type: 'steps';

  @ApiProperty({ example: 'How going solar works', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  subtitle: string;

  @ApiProperty({ type: [HomeIconItemDto], minItems: 1, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => HomeIconItemDto)
  steps: HomeIconItemDto[];
}

export class HelpSectionDto extends HomeSectionBaseDto {
  @ApiProperty({ enum: ['help'] })
  @IsIn(['help'])
  type: 'help';

  @ApiProperty({ example: 'Not sure what to pick?', maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({
    maxLength: 300,
    description: "The shop adds the store's support hours after it",
  })
  @IsString()
  @MaxLength(300)
  text: string;
}

export const SECTION_DTOS = [
  FeaturesSectionDto,
  CategoriesSectionDto,
  PromoCardsSectionDto,
  ProductsSectionDto,
  BannersSectionDto,
  BillboardSectionDto,
  ComboSectionDto,
  VideosSectionDto,
  StepsSectionDto,
  HelpSectionDto,
];

export type HomeSectionDto =
  | FeaturesSectionDto
  | CategoriesSectionDto
  | PromoCardsSectionDto
  | ProductsSectionDto
  | BannersSectionDto
  | BillboardSectionDto
  | ComboSectionDto
  | VideosSectionDto
  | StepsSectionDto
  | HelpSectionDto;

const sectionsSchema = {
  type: 'array' as const,
  maxItems: 30,
  description: 'The sections under the hero, top to bottom',
  items: { oneOf: SECTION_DTOS.map((dto) => ({ $ref: getSchemaPath(dto) })) },
};

export class SaveHomePageDto {
  @ApiProperty({
    type: HeroDto,
    description: 'Always first; it cannot be moved or hidden',
  })
  @ValidateNested()
  @Type(() => HeroDto)
  hero: HeroDto;

  @ApiProperty(sectionsSchema)
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  // `type` picks the class; an unknown type becomes UnknownSectionDto and fails its @IsIn.
  @Type(() => UnknownSectionDto, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'type',
      subTypes: [
        { value: FeaturesSectionDto, name: 'features' },
        { value: CategoriesSectionDto, name: 'categories' },
        { value: PromoCardsSectionDto, name: 'promoCards' },
        { value: ProductsSectionDto, name: 'products' },
        { value: BannersSectionDto, name: 'banners' },
        { value: BillboardSectionDto, name: 'billboard' },
        { value: ComboSectionDto, name: 'combo' },
        { value: VideosSectionDto, name: 'videos' },
        { value: StepsSectionDto, name: 'steps' },
        { value: HelpSectionDto, name: 'help' },
      ],
    },
  })
  sections: HomeSectionDto[];
}

export class HomePageDto {
  @ApiProperty({ type: HeroDto })
  hero: HeroDto;

  @ApiProperty(sectionsSchema)
  sections: HomeSectionDto[];

  @ApiProperty({
    description: 'false while the store still shows the default page',
  })
  customised: boolean;

  @ApiProperty({ nullable: true, type: Date })
  updatedAt: Date | null;
}

// The saved shape: what SaveHomePageDto holds, as plain JSON.
export interface HomePageContent {
  hero: HeroDto;
  sections: HomeSectionDto[];
}
