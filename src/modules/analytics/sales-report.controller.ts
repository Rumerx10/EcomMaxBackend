import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { TenantContext } from '../../tenant/tenant.context.js';
import { SalesReportDto, SalesReportQueryDto } from './sales-report.dto.js';
import { renderSalesReport } from './sales-report.pdf.js';
import { SalesReportService } from './sales-report.service.js';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Roles('OWNER')
@Controller('admin/reports')
export class SalesReportController {
  constructor(
    private readonly reports: SalesReportService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('sales')
  @ApiOperation({
    summary: 'Sales report for a day, week, month, year or all time (owner)',
    description: 'Dhaka time; weeks run Monday to Sunday.',
  })
  @ApiOkResponse({ type: SalesReportDto })
  report(@Query() query: SalesReportQueryDto): Promise<SalesReportDto> {
    return this.reports.report(query.period, query.date);
  }

  @Get('sales/pdf')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The same sales report as a PDF (owner)' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'An A4 PDF file' })
  async pdf(@Query() query: SalesReportQueryDto): Promise<StreamableFile> {
    const report = await this.reports.report(query.period, query.date);
    const file = await renderSalesReport(report);
    const name = `${this.tenant.requireSeller().slug}-sales-${report.key}.pdf`;
    return new StreamableFile(file, {
      type: 'application/pdf',
      disposition: `attachment; filename="${name}"`,
      length: file.length,
    });
  }
}
