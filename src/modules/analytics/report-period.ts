// Periods for the downloadable sales report, in Bangladesh time: one calendar day (by hour),
// week from Monday to Sunday (by day), month (by day) or year (by month), or everything since
// the store's first order (by month, or by year once that is more than two years of months).
// Dates are carried the way period.ts does: a Date whose UTC fields are Dhaka wall-clock time.
import {
  addMonths,
  DAY,
  fromLocal,
  HOUR,
  key,
  startOfLocalDay,
} from './period.js';

export const SALES_PERIODS = ['day', 'week', 'month', 'year', 'all'] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];
export type ReportUnit = 'hour' | 'day' | 'month' | 'year';

export interface ReportWindow {
  period: SalesPeriod;
  unit: ReportUnit;
  // UTC instants, from inclusive, to exclusive.
  from: Date;
  to: Date;
  // Bucket keys, oldest first, as local "YYYY-MM-DDTHH:MM" strings (what the SQL returns).
  buckets: string[];
  label: string; // "October 2026"
  key: string; // for file names: "2026-10"
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MAX_MONTH_BUCKETS = 24;

const dateOnly = (local: Date) => local.toISOString().slice(0, 10);
const longDate = (local: Date) =>
  `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
const monthYear = (local: Date) =>
  `${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;

// "19–25 October 2026", "26 October – 1 November 2026", "29 December 2025 – 4 January 2026".
const dayRange = (first: Date, last: Date) => {
  if (first.getUTCFullYear() !== last.getUTCFullYear())
    return `${longDate(first)} – ${longDate(last)}`;
  if (first.getUTCMonth() !== last.getUTCMonth())
    return `${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]} – ${longDate(last)}`;
  return `${first.getUTCDate()}–${longDate(last)}`;
};

const steps = (
  start: Date,
  count: number,
  next: (d: Date, i: number) => Date,
) => Array.from({ length: count }, (_, i) => key(next(start, i)));

// Today's date in Dhaka, "YYYY-MM-DD".
export const localToday = (now = new Date()) => dateOnly(startOfLocalDay(now));

// `date` is any day inside the period, "YYYY-MM-DD" in Dhaka time; `firstSale` is the store's
// first order, for "all".
export const reportWindow = (
  period: SalesPeriod,
  date: string,
  firstSale: Date | null,
  now = new Date(),
): ReportWindow => {
  const [year, month, day] = date.split('-').map(Number);
  const picked = new Date(Date.UTC(year, month - 1, day));

  if (period === 'day') {
    return {
      period,
      unit: 'hour',
      from: fromLocal(picked),
      to: fromLocal(new Date(picked.getTime() + DAY)),
      buckets: steps(picked, 24, (d, i) => new Date(d.getTime() + i * HOUR)),
      label: `${DAYS[picked.getUTCDay()]} ${longDate(picked)}`,
      key: dateOnly(picked),
    };
  }
  if (period === 'week') {
    const monday = new Date(
      picked.getTime() - ((picked.getUTCDay() + 6) % 7) * DAY,
    );
    const sunday = new Date(monday.getTime() + 6 * DAY);
    return {
      period,
      unit: 'day',
      from: fromLocal(monday),
      to: fromLocal(new Date(sunday.getTime() + DAY)),
      buckets: steps(monday, 7, (d, i) => new Date(d.getTime() + i * DAY)),
      label: dayRange(monday, sunday),
      key: `week-of-${dateOnly(monday)}`,
    };
  }
  if (period === 'month') {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const next = addMonths(first, 1);
    const days = Math.round((next.getTime() - first.getTime()) / DAY);
    return {
      period,
      unit: 'day',
      from: fromLocal(first),
      to: fromLocal(next),
      buckets: steps(first, days, (d, i) => new Date(d.getTime() + i * DAY)),
      label: monthYear(first),
      key: dateOnly(first).slice(0, 7),
    };
  }
  if (period === 'year') {
    const first = new Date(Date.UTC(year, 0, 1));
    return {
      period,
      unit: 'month',
      from: fromLocal(first),
      to: fromLocal(new Date(Date.UTC(year + 1, 0, 1))),
      buckets: steps(first, 12, addMonths),
      label: String(year),
      key: String(year),
    };
  }

  // Everything, from the month of the first order to today.
  const today = startOfLocalDay(now);
  const start = startOfLocalDay(firstSale ?? now);
  const startMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const months =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    today.getUTCMonth() -
    start.getUTCMonth() +
    1;
  const byYear = months > MAX_MONTH_BUCKETS;
  const years = today.getUTCFullYear() - start.getUTCFullYear() + 1;
  const firstYear = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  return {
    period,
    unit: byYear ? 'year' : 'month',
    from: fromLocal(byYear ? firstYear : startMonth),
    to: fromLocal(new Date(today.getTime() + DAY)),
    buckets: byYear
      ? steps(firstYear, years, (d, i) => addMonths(d, 12 * i))
      : steps(startMonth, months, addMonths),
    label: firstSale
      ? `All time, ${longDate(start)} to ${longDate(today)}`
      : 'All time',
    key: 'all-time',
  };
};

const SHORT_DAYS = DAYS.map((name) => name.slice(0, 3));
const SHORT_MONTHS = MONTHS.map((name) => name.slice(0, 3));
const hourLabel = (hour: number) =>
  `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 || hour === 24 ? 'am' : 'pm'}`;

// Row label for a bucket key: "9am–10am", "Mon 26 Oct", "Oct 2026", "2026".
export const bucketLabel = (bucket: string, unit: ReportUnit) => {
  const local = new Date(`${bucket}:00Z`);
  const hour = local.getUTCHours();
  if (unit === 'hour') return `${hourLabel(hour)}–${hourLabel(hour + 1)}`;
  if (unit === 'day')
    return `${SHORT_DAYS[local.getUTCDay()]} ${local.getUTCDate()} ${SHORT_MONTHS[local.getUTCMonth()]}`;
  if (unit === 'month')
    return `${SHORT_MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
  return String(local.getUTCFullYear());
};

// A picked period that starts after now has nothing to report yet.
export const startsInFuture = (window: ReportWindow, now = new Date()) =>
  window.from.getTime() > now.getTime();
