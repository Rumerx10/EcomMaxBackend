import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';
import {
  SALES_PERIODS,
  type ReportUnit,
  type SalesPeriod,
} from './report-period.js';

export class SalesReportQueryDto {
  @ApiProperty({ enum: SALES_PERIODS, default: 'month', required: false })
  @IsOptional()
  @IsIn(SALES_PERIODS)
  period: SalesPeriod = 'month';

  @ApiProperty({
    required: false,
    example: '2026-10-01',
    description:
      'Any day in the period, Dhaka time; today if left out. Weeks run Monday to Sunday. Not used for all.',
  })
  @IsOptional()
  @Matches(/^20\d\d-\d\d-\d\d$/, { message: 'date must look like 2026-10-01' })
  @IsISO8601({ strict: true }, { message: 'date must be a real day' })
  date?: string;
}

class ReportTotalsDto {
  @ApiProperty({ example: 41 })
  orders: number;

  @ApiProperty({ example: 128 })
  unitsSold: number;

  @ApiProperty({
    example: '1250000.00',
    description: 'What customers paid, cancelled and returned orders left out',
  })
  revenue: string;

  @ApiProperty({ example: '1190000.00', description: 'Item prices' })
  goods: string;

  @ApiProperty({ example: '25000.00' })
  discounts: string;

  @ApiProperty({ example: '18000.00' })
  delivery: string;

  @ApiProperty({ example: '40000.00' })
  installation: string;

  @ApiProperty({ example: '27000.00' })
  vat: string;

  @ApiProperty({ example: '30487.80' })
  averageOrder: string;

  @ApiProperty({
    example: '210000.00',
    description: 'Price minus cost, for items that have a cost price',
  })
  profit: string;

  @ApiProperty({ example: '1100000.00', description: 'Of revenue, paid' })
  collected: string;

  @ApiProperty({
    example: '150000.00',
    description: 'Of revenue, not paid yet (cash on delivery to collect)',
  })
  awaiting: string;
}

class ReportPointDto {
  @ApiProperty({ example: '2026-10-01T00:00', description: 'Dhaka time' })
  bucket: string;

  @ApiProperty({ example: 'Thu 1 Oct' })
  label: string;

  @ApiProperty({ example: 2 })
  orders: number;

  @ApiProperty({ example: 6 })
  units: number;

  @ApiProperty({ example: '48000.00' })
  revenue: string;

  @ApiProperty({ example: '9000.00' })
  profit: string;
}

class ReportGroupDto {
  @ApiProperty({ example: 'Solar panels' })
  name: string;

  @ApiProperty({ example: 40 })
  units: number;

  @ApiProperty({ example: '300000.00', description: 'Item prices' })
  revenue: string;

  @ApiProperty({ example: '60000.00' })
  profit: string;
}

class ReportProductDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  sku: string;

  @ApiProperty({ example: 12 })
  units: number;

  @ApiProperty({ example: '125000.00', description: 'Item prices' })
  revenue: string;

  @ApiProperty({ example: '20000.00' })
  profit: string;
}

export class SalesReportDto {
  @ApiProperty({ example: 'NextPower' })
  store: string;

  @ApiProperty({ example: 'BDT' })
  currency: string;

  @ApiProperty({ example: 'Asia/Dhaka' })
  timezone: string;

  @ApiProperty({ enum: SALES_PERIODS })
  period: SalesPeriod;

  @ApiProperty({ enum: ['hour', 'day', 'month', 'year'] })
  unit: ReportUnit;

  @ApiProperty({ example: 'October 2026' })
  label: string;

  @ApiProperty({ example: '2026-10', description: 'For file names' })
  key: string;

  @ApiProperty()
  from: Date;

  @ApiProperty()
  to: Date;

  @ApiProperty()
  generatedAt: Date;

  @ApiProperty({ type: ReportTotalsDto })
  totals: ReportTotalsDto;

  @ApiProperty({
    example: { PENDING: 3, DELIVERED: 30, CANCELLED: 1 },
    description: 'Orders placed in the period, by their status now',
  })
  statusCounts: Record<string, number>;

  @ApiProperty({ type: [ReportPointDto] })
  series: ReportPointDto[];

  @ApiProperty({ type: [ReportGroupDto], description: 'Biggest first' })
  categories: ReportGroupDto[];

  @ApiProperty({
    type: [ReportProductDto],
    description: 'Best sellers by revenue, at most 20',
  })
  products: ReportProductDto[];
}
