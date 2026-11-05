import {
  bucketLabel,
  localToday,
  reportWindow,
  startsInFuture,
} from './report-period.js';

// 25 Oct 2026, 01:30 in Dhaka is still 24 Oct in UTC: the day boundary must follow Dhaka.
const now = new Date('2026-10-24T19:30:00Z');

describe('reportWindow', () => {
  it('a day runs midnight to midnight in Dhaka, by hour', () => {
    const day = reportWindow('day', '2026-10-27', null, now);
    expect(day.from.toISOString()).toBe('2026-10-26T18:00:00.000Z');
    expect(day.to.toISOString()).toBe('2026-10-27T18:00:00.000Z');
    expect(day.buckets).toHaveLength(24);
    expect(day.buckets[0]).toBe('2026-10-27T00:00');
    expect(day.label).toBe('Tuesday 27 October 2026');
    expect(day.key).toBe('2026-10-27');
  });

  it('a week is Monday to Sunday around the picked day', () => {
    const week = reportWindow('week', '2026-10-28', null, now);
    expect(week.buckets[0]).toBe('2026-10-26T00:00');
    expect(week.buckets[6]).toBe('2026-11-01T00:00');
    expect(week.from.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(week.label).toBe('26 October – 1 November 2026');
    expect(week.key).toBe('week-of-2026-10-26');
    // A Sunday belongs to the week that started the Monday before.
    expect(reportWindow('week', '2026-10-25', null, now).buckets[0]).toBe(
      '2026-10-19T00:00',
    );
    expect(reportWindow('week', '2026-10-21', null, now).label).toBe(
      '19–25 October 2026',
    );
  });

  it('a month has its own number of days', () => {
    const february = reportWindow('month', '2028-02-10', null, now);
    expect(february.buckets).toHaveLength(29);
    expect(february.label).toBe('February 2028');
    expect(february.key).toBe('2028-02');
    expect(february.to.toISOString()).toBe('2028-02-29T18:00:00.000Z');
  });

  it('a year is twelve months', () => {
    const year = reportWindow('year', '2026-06-01', null, now);
    expect(year.unit).toBe('month');
    expect(year.buckets[0]).toBe('2026-01-01T00:00');
    expect(year.buckets[11]).toBe('2026-12-01T00:00');
    expect(year.from.toISOString()).toBe('2025-12-31T18:00:00.000Z');
    expect(year.label).toBe('2026');
  });

  it('all time starts at the first order, by month, then by year past two years', () => {
    const recent = reportWindow(
      'all',
      '2026-10-25',
      new Date('2025-12-03T10:00:00Z'),
      now,
    );
    expect(recent.unit).toBe('month');
    expect(recent.buckets[0]).toBe('2025-12-01T00:00');
    expect(recent.buckets.at(-1)).toBe('2026-10-01T00:00');
    expect(recent.to.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(recent.label).toBe('All time, 3 December 2025 to 25 October 2026');

    const old = reportWindow(
      'all',
      '2026-10-25',
      new Date('2021-05-01T10:00:00Z'),
      now,
    );
    expect(old.unit).toBe('year');
    expect(old.buckets).toEqual([
      '2021-01-01T00:00',
      '2022-01-01T00:00',
      '2023-01-01T00:00',
      '2024-01-01T00:00',
      '2025-01-01T00:00',
      '2026-01-01T00:00',
    ]);

    expect(reportWindow('all', '2026-10-25', null, now).label).toBe('All time');
  });

  it('knows today and future periods in Dhaka time', () => {
    expect(localToday(now)).toBe('2026-10-25');
    expect(
      startsInFuture(reportWindow('day', '2026-10-25', null, now), now),
    ).toBe(false);
    expect(
      startsInFuture(reportWindow('day', '2026-10-26', null, now), now),
    ).toBe(true);
    expect(
      startsInFuture(reportWindow('month', '2026-10-01', null, now), now),
    ).toBe(false);
  });
});

describe('bucketLabel', () => {
  it('names hours, days, months and years', () => {
    expect(bucketLabel('2026-10-27T09:00', 'hour')).toBe('9am–10am');
    expect(bucketLabel('2026-10-27T23:00', 'hour')).toBe('11pm–12am');
    expect(bucketLabel('2026-10-26T00:00', 'day')).toBe('Mon 26 Oct');
    expect(bucketLabel('2026-10-01T00:00', 'month')).toBe('Oct 2026');
    expect(bucketLabel('2026-01-01T00:00', 'year')).toBe('2026');
  });
});
