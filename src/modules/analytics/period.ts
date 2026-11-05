// Report periods for the seller dashboard, in Bangladesh time (UTC+6 all year, no daylight
// saving), matching the client's ranges: today by hour, 7 and 30 days by day, 12 months by
// month. Each period comes with the one before it, of the same length, for comparisons.

export const REPORT_RANGES = ['today', 'week', 'month', 'year'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];
export type BucketUnit = 'hour' | 'day' | 'month';

export const TIMEZONE = 'Asia/Dhaka';
const OFFSET_MS = 6 * 3_600_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export interface Period {
  range: ReportRange;
  unit: BucketUnit;
  from: Date;
  to: Date;
  previousFrom: Date;
  // Bucket keys, oldest first, as local "YYYY-MM-DDTHH:MM" strings (what the SQL returns).
  buckets: string[];
  previousBuckets: string[];
}

// UTC instants <-> Dhaka wall-clock time, done with a fixed offset.
export const toLocal = (utc: number) => new Date(utc + OFFSET_MS);
export const fromLocal = (local: Date) => new Date(local.getTime() - OFFSET_MS);
export const key = (local: Date) => local.toISOString().slice(0, 16);

export const startOfLocalDay = (now: Date) => {
  const local = toLocal(now.getTime());
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
};

export const addMonths = (local: Date, months: number) =>
  new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + months, 1));

export const periodFor = (range: ReportRange, now = new Date()): Period => {
  const today = startOfLocalDay(now);
  if (range === 'year') {
    const thisMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    const fromLocalMonth = addMonths(thisMonth, -11);
    const previousLocal = addMonths(fromLocalMonth, -12);
    const months = (start: Date) =>
      Array.from({ length: 12 }, (_, i) => key(addMonths(start, i)));
    return {
      range,
      unit: 'month',
      from: fromLocal(fromLocalMonth),
      to: fromLocal(addMonths(thisMonth, 1)),
      previousFrom: fromLocal(previousLocal),
      buckets: months(fromLocalMonth),
      previousBuckets: months(previousLocal),
    };
  }

  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  const unit: BucketUnit = range === 'today' ? 'hour' : 'day';
  const step = unit === 'hour' ? HOUR : DAY;
  const count = unit === 'hour' ? 24 : days;
  const startLocal = new Date(today.getTime() - (days - 1) * DAY);
  const previousLocal = new Date(startLocal.getTime() - days * DAY);
  const series = (start: Date) =>
    Array.from({ length: count }, (_, i) =>
      key(new Date(start.getTime() + i * step)),
    );
  return {
    range,
    unit,
    from: fromLocal(startLocal),
    to: fromLocal(new Date(today.getTime() + DAY)),
    previousFrom: fromLocal(previousLocal),
    buckets: series(startLocal),
    previousBuckets: series(previousLocal),
  };
};
