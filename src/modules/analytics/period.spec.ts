import { periodFor } from './period.js';

// 25 Oct 2026, 01:30 in Dhaka is still 24 Oct in UTC: the day boundary must follow Dhaka.
const now = new Date('2026-10-24T19:30:00Z');

describe('periodFor', () => {
  it('today runs from midnight to midnight in Dhaka, by hour', () => {
    const period = periodFor('today', now);
    expect(period.from.toISOString()).toBe('2026-10-24T18:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(period.previousFrom.toISOString()).toBe('2026-10-23T18:00:00.000Z');
    expect(period.buckets).toHaveLength(24);
    expect(period.buckets[0]).toBe('2026-10-25T00:00');
    expect(period.buckets[23]).toBe('2026-10-25T23:00');
    expect(period.previousBuckets[0]).toBe('2026-10-24T00:00');
  });

  it('the last 7 and 30 days end today, by day', () => {
    const week = periodFor('week', now);
    expect(week.buckets).toEqual([
      '2026-10-19T00:00',
      '2026-10-20T00:00',
      '2026-10-21T00:00',
      '2026-10-22T00:00',
      '2026-10-23T00:00',
      '2026-10-24T00:00',
      '2026-10-25T00:00',
    ]);
    expect(week.previousBuckets[0]).toBe('2026-10-12T00:00');
    const month = periodFor('month', now);
    expect(month.buckets).toHaveLength(30);
    expect(month.buckets[0]).toBe('2026-09-26T00:00');
  });

  it('the last 12 months include this month, by month', () => {
    const year = periodFor('year', now);
    expect(year.buckets[0]).toBe('2025-11-01T00:00');
    expect(year.buckets[11]).toBe('2026-10-01T00:00');
    expect(year.previousBuckets[0]).toBe('2024-11-01T00:00');
    expect(year.from.toISOString()).toBe('2025-10-31T18:00:00.000Z');
    expect(year.to.toISOString()).toBe('2026-10-31T18:00:00.000Z');
  });
});
