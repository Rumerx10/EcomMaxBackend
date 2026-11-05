import PDFDocument from 'pdfkit';
import type { ReportUnit } from './report-period.js';
import type { SalesReportDto } from './sales-report.dto.js';

// Draws the sales report as an A4 PDF with PDFKit's built-in Helvetica. Amounts are written
// without a currency sign (the headings name it), because the standard PDF fonts have no ৳.

const INK = '#0f172a';
const MUTED = '#475569';
const FAINT = '#94a3b8';
const RULE = '#e2e8f0';
const TILE = '#f8fafc';
// The dashboard's chart colours: revenue in the brand blue, profit in aqua.
const REVENUE = '#1d4ed8';
const PROFIT = '#1baf7a';
const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const MARGIN = 48;
const FOOTER = 24;
const ROW = 16;

type Doc = PDFKit.PDFDocument;
type Align = 'left' | 'right';
interface Column {
  header: string;
  share: number; // of the page width
  align?: Align;
}

// "1250000.50" -> "1,250,000.50", without going through floating point.
export const formatMoney = (value: string) => {
  const negative = value.startsWith('-');
  const [whole, cents = '00'] = value.replace('-', '').split('.');
  return `${negative ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
};
const count = (value: number) => value.toLocaleString('en-US');
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '–';
const dash = (value: string, zero: boolean) => (zero ? '–' : value);

const UNIT_NAMES: Record<ReportUnit, string> = {
  hour: 'hour',
  day: 'day',
  month: 'month',
  year: 'year',
};
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Short x-axis labels: "9am", "Mon 26", "26", "Jan", "Jan '26", "2026".
const axisLabel = (report: SalesReportDto, bucket: string) => {
  const local = new Date(`${bucket}:00Z`);
  const hour = local.getUTCHours();
  if (report.unit === 'hour')
    return `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
  if (report.unit === 'day')
    return report.period === 'week'
      ? `${SHORT_DAYS[local.getUTCDay()]} ${local.getUTCDate()}`
      : String(local.getUTCDate());
  if (report.unit === 'month')
    return report.period === 'year'
      ? SHORT_MONTHS[local.getUTCMonth()]
      : `${SHORT_MONTHS[local.getUTCMonth()]} '${String(local.getUTCFullYear()).slice(2)}`;
  return String(local.getUTCFullYear());
};

// A round step for about four gridlines: 1, 2, 2.5 or 5 times a power of ten.
const niceStep = (raw: number) => {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const factor =
    residual <= 1
      ? 1
      : residual <= 2
        ? 2
        : residual <= 2.5
          ? 2.5
          : residual <= 5
            ? 5
            : 10;
  return factor * magnitude;
};

export const renderSalesReport = (report: SalesReportDto): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `${report.store} sales report, ${report.label}`,
        Author: report.store,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    new ReportWriter(doc, report).write();
    doc.end();
  });

class ReportWriter {
  private readonly left = MARGIN;
  private readonly width: number;

  constructor(
    private readonly doc: Doc,
    private readonly report: SalesReportDto,
  ) {
    this.width = doc.page.width - 2 * MARGIN;
  }

  write() {
    const { report } = this;
    const unit = UNIT_NAMES[report.unit];
    this.header();
    this.summary();
    this.breakdowns();
    const labels = report.series.map((point) =>
      axisLabel(report, point.bucket),
    );
    this.barChart(
      `Revenue and profit by ${unit} (${report.currency})`,
      labels,
      [
        {
          name: 'Revenue',
          color: REVENUE,
          values: report.series.map((p) => Number(p.revenue)),
        },
        {
          name: 'Profit',
          color: PROFIT,
          values: report.series.map((p) => Number(p.profit)),
        },
      ],
    );
    this.barChart(`Units sold by ${unit}`, labels, [
      {
        name: 'Units',
        color: REVENUE,
        values: report.series.map((p) => p.units),
      },
    ]);
    this.periodTable();
    this.categoryTable();
    this.productTable();
    this.notes();
    this.footers();
  }

  private get bottom() {
    return this.doc.page.height - MARGIN - FOOTER;
  }

  // Starts a new page when the next block would not fit.
  private room(height: number) {
    if (this.doc.y + height > this.bottom) this.doc.addPage();
  }

  private fit(text: string, max: number) {
    if (this.doc.widthOfString(text) <= max) return text;
    let cut = text;
    while (cut.length > 1 && this.doc.widthOfString(`${cut}…`) > max)
      cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  }

  private header() {
    const { doc, report } = this;
    doc
      .font(BOLD)
      .fontSize(10)
      .fillColor(REVENUE)
      .text(report.store, this.left, MARGIN);
    doc.moveDown(0.2);
    doc
      .font(BOLD)
      .fontSize(20)
      .fillColor(INK)
      .text(`Sales report: ${report.label}`);
    const generated = new Intl.DateTimeFormat('en-GB', {
      timeZone: report.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(report.generatedAt);
    doc.moveDown(0.3);
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `Bangladesh time · amounts in ${report.currency} · created ${generated}`,
      );
    const y = doc.y + 10;
    doc
      .moveTo(this.left, y)
      .lineTo(this.left + this.width, y)
      .lineWidth(0.75)
      .strokeColor(RULE)
      .stroke();
    doc.y = y + 14;
  }

  private summary() {
    const { doc, report } = this;
    const t = report.totals;
    const cur = report.currency;
    const revenue = Number(t.revenue);
    const tiles = [
      [`Revenue (${cur})`, formatMoney(t.revenue)],
      ['Orders', count(t.orders)],
      [`Average order (${cur})`, formatMoney(t.averageOrder)],
      ['Units sold', count(t.unitsSold)],
      [`Profit (${cur})`, formatMoney(t.profit)],
      ['Profit margin', share(Number(t.profit), revenue)],
      [`Paid (${cur})`, formatMoney(t.collected)],
      [`Still to collect (${cur})`, formatMoney(t.awaiting)],
    ];
    const gap = 10;
    const w = (this.width - 3 * gap) / 4;
    const h = 46;
    const top = doc.y;
    tiles.forEach(([label, value], i) => {
      const x = this.left + (i % 4) * (w + gap);
      const y = top + Math.floor(i / 4) * (h + gap);
      doc.roundedRect(x, y, w, h, 6).lineWidth(0.75).fillAndStroke(TILE, RULE);
      doc.font(FONT).fontSize(8).fillColor(MUTED);
      doc.text(this.fit(label, w - 20), x + 10, y + 9, { lineBreak: false });
      let size = 14;
      doc.font(BOLD).fontSize(size);
      while (size > 8 && doc.widthOfString(value) > w - 20)
        doc.fontSize(--size);
      doc.fillColor(INK).text(value, x + 10, y + 22, { lineBreak: false });
    });
    doc.y = top + 2 * h + gap + 22;
    doc.x = this.left;
  }

  // How revenue adds up, beside orders by status.
  private breakdowns() {
    const { doc, report } = this;
    const t = report.totals;
    const s = report.statusCounts;
    const placed = Object.values(s).reduce((a, b) => a + b, 0);
    const gap = 24;
    const w = (this.width - gap) / 2;
    const top = doc.y;
    this.keyValues(
      this.left,
      top,
      w,
      `How revenue adds up (${report.currency})`,
      [
        ['Goods', formatMoney(t.goods)],
        ['Delivery', formatMoney(t.delivery)],
        ['Installation', formatMoney(t.installation)],
        ['VAT', formatMoney(t.vat)],
        [
          'Discounts',
          t.discounts === '0.00' ? '0.00' : `-${formatMoney(t.discounts)}`,
        ],
        ['Revenue', formatMoney(t.revenue)],
      ],
    );
    const end = this.keyValues(
      this.left + w + gap,
      top,
      w,
      'Orders by status',
      [
        ['Delivered', count(s.DELIVERED ?? 0)],
        ['Shipped', count(s.SHIPPED ?? 0)],
        ['Processing', count(s.PROCESSING ?? 0)],
        ['Pending', count(s.PENDING ?? 0)],
        ['Cancelled', count(s.CANCELLED ?? 0)],
        ['Returned', count(s.RETURNED ?? 0)],
        ['Placed', count(placed)],
      ],
    );
    doc.y = end + 20;
    doc.x = this.left;
  }

  // A titled list of label/value rows; the last row is the total. Returns where it ends.
  private keyValues(
    x: number,
    top: number,
    w: number,
    title: string,
    rows: string[][],
  ) {
    const { doc } = this;
    doc
      .font(BOLD)
      .fontSize(10)
      .fillColor(INK)
      .text(title, x, top, { lineBreak: false });
    let y = top + 18;
    rows.forEach(([label, value], i) => {
      const last = i === rows.length - 1;
      if (last) {
        doc
          .moveTo(x, y)
          .lineTo(x + w, y)
          .lineWidth(0.75)
          .strokeColor(RULE)
          .stroke();
        y += 3;
      }
      doc
        .font(last ? BOLD : FONT)
        .fontSize(9)
        .fillColor(last ? INK : MUTED);
      doc.text(label, x, y, { lineBreak: false });
      doc
        .fillColor(INK)
        .text(value, x, y, { width: w, align: 'right', lineBreak: false });
      y += 14;
    });
    return y;
  }

  private heading(title: string, note?: string) {
    const { doc } = this;
    doc.font(BOLD).fontSize(11).fillColor(INK).text(title, this.left, doc.y);
    if (note) {
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(MUTED)
        .text(note, this.left, doc.y + 1);
    }
    doc.y += 6;
  }

  private barChart(
    title: string,
    labels: string[],
    series: { name: string; color: string; values: number[] }[],
  ) {
    const { doc } = this;
    const height = 150;
    this.room(height + 44);
    const titleY = doc.y;
    this.heading(title);
    // Text calls move doc.y, so the plot's top is fixed before the legend is written.
    const top = doc.y + 4;

    // Legend on the title's line, right-aligned, for more than one series.
    if (series.length > 1) {
      doc.font(FONT).fontSize(8);
      let x = this.left + this.width;
      for (const item of [...series].reverse()) {
        x -= doc.widthOfString(item.name);
        doc
          .fillColor(MUTED)
          .text(item.name, x, titleY + 2, { lineBreak: false });
        x -= 12;
        doc.rect(x, titleY + 3, 8, 8).fill(item.color);
        x -= 14;
      }
    }

    const all = series.flatMap((item) => item.values);
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    if (max === min) {
      doc
        .roundedRect(this.left, top, this.width, 48, 6)
        .lineWidth(0.75)
        .fillAndStroke(TILE, RULE);
      doc
        .font(FONT)
        .fontSize(9)
        .fillColor(MUTED)
        .text('Nothing sold in this period.', this.left, top + 19, {
          width: this.width,
          align: 'center',
        });
      doc.y = top + 48 + 22;
      doc.x = this.left;
      return;
    }

    const axis = 42;
    const plotLeft = this.left + axis;
    const plotWidth = this.width - axis;
    const plotHeight = height - 22;
    const step = niceStep((max - min) / 4);
    const high = Math.ceil(max / step) * step;
    const low = Math.floor(min / step) * step;
    const yOf = (value: number) =>
      top + (plotHeight * (high - value)) / (high - low);

    doc.font(FONT).fontSize(7);
    for (let value = low; value <= high + step / 2; value += step) {
      const y = yOf(value);
      doc
        .moveTo(plotLeft, y)
        .lineTo(plotLeft + plotWidth, y)
        .lineWidth(value === 0 ? 0.75 : 0.5)
        .strokeColor(value === 0 ? FAINT : RULE)
        .stroke();
      doc.fillColor(MUTED).text(compact.format(value), this.left, y - 3, {
        width: axis - 6,
        align: 'right',
        lineBreak: false,
      });
    }

    const groups = labels.length;
    const groupWidth = plotWidth / groups;
    const gap = 1;
    const barWidth = Math.min(14, (groupWidth * 0.72 - gap) / series.length);
    const groupBars = barWidth * series.length + gap * (series.length - 1);
    for (let i = 0; i < groups; i++) {
      series.forEach((item, j) => {
        const value = item.values[i];
        if (value === 0) return;
        const x =
          plotLeft +
          i * groupWidth +
          (groupWidth - groupBars) / 2 +
          j * (barWidth + gap);
        const y0 = yOf(0);
        const y1 = yOf(value);
        doc
          .rect(
            x,
            Math.min(y0, y1),
            barWidth,
            Math.max(Math.abs(y1 - y0), 0.75),
          )
          .fill(item.color);
      });
    }

    // Every nth label, so they never run into each other.
    const widest = Math.max(...labels.map((label) => doc.widthOfString(label)));
    const every = Math.max(1, Math.ceil((widest + 6) / groupWidth));
    doc.fillColor(MUTED);
    labels.forEach((label, i) => {
      if (i % every !== 0) return;
      const center = plotLeft + (i + 0.5) * groupWidth;
      doc.text(
        label,
        center - doc.widthOfString(label) / 2,
        top + plotHeight + 6,
        {
          lineBreak: false,
        },
      );
    });
    doc.y = top + height + 18;
    doc.x = this.left;
  }

  private table(
    title: string,
    note: string | undefined,
    columns: Column[],
    rows: string[][],
    total?: string[],
  ) {
    const { doc } = this;
    this.room(48 + ROW * Math.min(rows.length + 1, 3));
    this.heading(title, note);
    const xs: number[] = [];
    let x = this.left;
    for (const column of columns) {
      xs.push(x);
      x += column.share * this.width;
    }
    const cell = (text: string, i: number, y: number) => {
      const w = columns[i].share * this.width - 8;
      doc.text(this.fit(text, w), xs[i] + 4, y + 4, {
        width: w,
        align: columns[i].align ?? 'left',
        lineBreak: false,
      });
    };
    let y = doc.y;
    const head = () => {
      doc.font(BOLD).fontSize(8).fillColor(MUTED);
      columns.forEach((column, i) => cell(column.header, i, y));
      y += ROW;
      doc
        .moveTo(this.left, y)
        .lineTo(this.left + this.width, y)
        .lineWidth(0.75)
        .strokeColor(FAINT)
        .stroke();
    };
    head();

    if (rows.length === 0) {
      doc
        .font(FONT)
        .fontSize(9)
        .fillColor(MUTED)
        .text('No sales in this period.', this.left + 4, y + 5);
      y += ROW + 4;
    }
    rows.forEach((row) => {
      if (y + ROW > this.bottom) {
        doc.addPage();
        y = doc.y;
        head();
      }
      doc.font(FONT).fontSize(8.5).fillColor(INK);
      row.forEach((text, i) => cell(text, i, y));
      y += ROW;
      doc
        .moveTo(this.left, y)
        .lineTo(this.left + this.width, y)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke();
    });
    if (total && rows.length > 0) {
      if (y + ROW > this.bottom) {
        doc.addPage();
        y = doc.y;
      }
      doc.font(BOLD).fontSize(8.5).fillColor(INK);
      total.forEach((text, i) => cell(text, i, y));
      y += ROW;
    }
    doc.y = y + 20;
    doc.x = this.left;
  }

  private periodTable() {
    const { report } = this;
    const t = report.totals;
    const unit = UNIT_NAMES[report.unit];
    const cur = report.currency;
    this.table(
      `By ${unit}`,
      undefined,
      [
        { header: unit.charAt(0).toUpperCase() + unit.slice(1), share: 0.28 },
        { header: 'Orders', share: 0.14, align: 'right' },
        { header: 'Units', share: 0.14, align: 'right' },
        { header: `Revenue (${cur})`, share: 0.22, align: 'right' },
        { header: `Profit (${cur})`, share: 0.22, align: 'right' },
      ],
      report.series.map((point) => {
        const none = point.orders === 0;
        return [
          point.label,
          dash(count(point.orders), none),
          dash(count(point.units), none),
          dash(formatMoney(point.revenue), none),
          dash(formatMoney(point.profit), none),
        ];
      }),
      [
        'Total',
        count(t.orders),
        count(t.unitsSold),
        formatMoney(t.revenue),
        formatMoney(t.profit),
      ],
    );
  }

  private categoryTable() {
    const { report } = this;
    const cur = report.currency;
    const units = report.categories.reduce((sum, row) => sum + row.units, 0);
    this.table(
      'By category',
      'Item prices, before delivery, fees and discounts.',
      [
        { header: 'Category', share: 0.3 },
        { header: 'Units', share: 0.1, align: 'right' },
        { header: 'Share of units', share: 0.14, align: 'right' },
        { header: `Revenue (${cur})`, share: 0.18, align: 'right' },
        { header: `Profit (${cur})`, share: 0.16, align: 'right' },
        { header: 'Margin', share: 0.12, align: 'right' },
      ],
      report.categories.map((row) => [
        row.name,
        count(row.units),
        share(row.units, units),
        formatMoney(row.revenue),
        formatMoney(row.profit),
        share(Number(row.profit), Number(row.revenue)),
      ]),
    );
  }

  private productTable() {
    const { report } = this;
    const cur = report.currency;
    this.table(
      'Best sellers',
      `The top ${report.products.length || 20} products by revenue, at item prices.`,
      [
        { header: '#', share: 0.05, align: 'right' },
        { header: 'Product', share: 0.33 },
        { header: 'SKU', share: 0.18 },
        { header: 'Units', share: 0.1, align: 'right' },
        { header: `Revenue (${cur})`, share: 0.18, align: 'right' },
        { header: `Profit (${cur})`, share: 0.16, align: 'right' },
      ],
      report.products.map((row, i) => [
        String(i + 1),
        row.title,
        row.sku,
        count(row.units),
        formatMoney(row.revenue),
        formatMoney(row.profit),
      ]),
    );
  }

  private notes() {
    const { doc } = this;
    this.room(60);
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        'Revenue is what customers paid for the orders placed in this period: goods, delivery, ' +
          'installation and VAT, less discounts. Cancelled and returned orders are left out of ' +
          'the money and the units, but counted under orders by status. Profit is the item price ' +
          'minus the cost price, for items that have a cost price. "Still to collect" is revenue ' +
          'from orders not paid yet, mostly cash on delivery.',
        this.left,
        doc.y,
        { width: this.width, lineGap: 2 },
      );
  }

  // "Store · Sales report · period" and "Page n of m" on every page.
  private footers() {
    const { doc, report } = this;
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      // Writing inside the bottom margin would otherwise start a new page.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGIN + 6;
      doc.font(FONT).fontSize(7.5).fillColor(FAINT);
      doc.text(
        `${report.store} · Sales report · ${report.label}`,
        this.left,
        y,
        {
          lineBreak: false,
        },
      );
      doc.text(`Page ${i + 1} of ${pages.count}`, this.left, y, {
        width: this.width,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = bottom;
    }
  }
}
