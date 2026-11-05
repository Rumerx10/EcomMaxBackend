import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { REPORT_RANGES, type ReportRange } from './period.js';

export class AnalyticsQueryDto {
  @ApiProperty({ enum: REPORT_RANGES, default: 'month', required: false })
  @IsOptional()
  @IsIn(REPORT_RANGES)
  range: ReportRange = 'month';
}

class Compared {
  @ApiProperty({ example: '1250000.00' })
  current: string;

  @ApiProperty({ example: '1100000.00' })
  previous: string;
}

class ComparedCount {
  @ApiProperty({ example: 41 })
  current: number;

  @ApiProperty({ example: 37 })
  previous: number;
}

class TotalsDto {
  @ApiProperty({
    type: Compared,
    description: 'What customers paid, cancelled and returned orders left out',
  })
  revenue: Compared;

  @ApiProperty({ type: ComparedCount })
  orders: ComparedCount;

  @ApiProperty({ type: Compared })
  averageOrder: Compared;

  @ApiProperty({ type: ComparedCount })
  unitsSold: ComparedCount;

  @ApiProperty({
    type: Compared,
    description: 'Price minus cost, for items that have a cost price',
  })
  profit: Compared;

  @ApiProperty({ type: ComparedCount })
  newCustomers: ComparedCount;
}

class SeriesPointDto {
  @ApiProperty({
    example: '2026-10-25T00:00',
    description: 'Start of the hour, day or month, Dhaka time',
  })
  bucket: string;

  @ApiProperty({
    example: '2026-10-24T00:00',
    description: 'The matching bucket of the previous period',
  })
  previousBucket: string;

  @ApiProperty({ example: '48000.00' })
  revenue: string;

  @ApiProperty({ example: 1 })
  orders: number;

  @ApiProperty({ example: 6, description: 'Items sold in those orders' })
  units: number;

  @ApiProperty({
    example: '9000.00',
    description: 'Price minus cost, for items that have a cost price',
  })
  profit: string;

  @ApiProperty({ example: '52000.00' })
  previousRevenue: string;

  @ApiProperty({ example: 1 })
  previousOrders: number;

  @ApiProperty({ example: 5 })
  previousUnits: number;

  @ApiProperty({ example: '8000.00' })
  previousProfit: string;
}

class ProductSalesDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  units: number;

  @ApiProperty({ example: '125000.00' })
  revenue: string;

  @ApiProperty({ example: '110000.00' })
  previousRevenue: string;
}

class GroupSalesDto {
  @ApiProperty({
    example: 'Solar panels',
    description: 'A category name, or a tag such as home',
  })
  name: string;

  @ApiProperty({ example: '300000.00' })
  revenue: string;

  @ApiProperty({ example: '280000.00' })
  previousRevenue: string;

  @ApiProperty({ example: 24, description: 'Items sold' })
  units: number;

  @ApiProperty({ example: 20 })
  previousUnits: number;
}

class LowStockDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  stock: number;
}

export class AnalyticsDto {
  @ApiProperty({ enum: REPORT_RANGES })
  range: ReportRange;

  @ApiProperty({ example: 'Asia/Dhaka' })
  timezone: string;

  @ApiProperty()
  from: Date;

  @ApiProperty()
  to: Date;

  @ApiProperty({ example: 'BDT' })
  currency: string;

  @ApiProperty({ type: TotalsDto })
  totals: TotalsDto;

  @ApiProperty({ type: [SeriesPointDto] })
  series: SeriesPointDto[];

  @ApiProperty({
    example: {
      PENDING: 3,
      PROCESSING: 2,
      SHIPPED: 5,
      DELIVERED: 30,
      CANCELLED: 1,
      RETURNED: 0,
    },
    description: 'Orders placed in the period, by their status now',
  })
  statusCounts: Record<string, number>;

  @ApiProperty({
    type: [ProductSalesDto],
    description: 'Best sellers by revenue',
  })
  topProducts: ProductSalesDto[];

  @ApiProperty({ type: [GroupSalesDto] })
  categories: GroupSalesDto[];

  @ApiProperty({
    type: [GroupSalesDto],
    description: 'Revenue by product tag, e.g. home and business',
  })
  segments: GroupSalesDto[];

  @ApiProperty({
    example: [[2, 4, 7, 3, 2, 6, 5]],
    description:
      'Orders by weekday (Mon to Sun) and two-hour slot from 8am to 10pm, Dhaka time',
  })
  heatmap: number[][];

  @ApiProperty({
    type: [LowStockDto],
    description: "Products at or below the store's low-stock level",
  })
  lowStock: LowStockDto[];
}
