import { describe, expect, it } from 'vitest';

import {
  nextRecurringOccurrence,
  parseRecurringSchedule,
  parseRecurringStart,
} from '../src/automation/recurrence.js';

describe('recurring schedule periods', () => {
  it('parses weekly, monthly, yearly and custom single-unit ISO date periods', () => {
    expect(parseRecurringSchedule('P1W')).toEqual({ amount: 1, unit: 'W' });
    expect(parseRecurringSchedule('P1M')).toEqual({ amount: 1, unit: 'M' });
    expect(parseRecurringSchedule('P1Y')).toEqual({ amount: 1, unit: 'Y' });
    expect(parseRecurringSchedule('P3M')).toEqual({ amount: 3, unit: 'M' });
    expect(parseRecurringSchedule('P2D')).toEqual({ amount: 2, unit: 'D' });
    expect(parseRecurringSchedule('P0D')).toBeUndefined();
    expect(parseRecurringSchedule('P1M2D')).toBeUndefined();
    expect(parseRecurringSchedule('PT1H')).toBeUndefined();
  });

  it('requires an explicit timezone and normalizes starts to an instant', () => {
    expect(parseRecurringStart('2026-01-31T10:00:00-05:00')?.toISOString()).toBe(
      '2026-01-31T15:00:00.000Z',
    );
    expect(parseRecurringStart('2026-01-31T10:00:00')).toBeUndefined();
  });

  it('adds weeks as fixed UTC periods', () => {
    const start = new Date('2026-01-01T09:30:00.000Z');
    expect(nextRecurringOccurrence(start, start, 'P1W').toISOString()).toBe(
      '2026-01-08T09:30:00.000Z',
    );
  });

  it('clamps month ends while preserving the original day anchor', () => {
    const anchor = new Date('2026-01-31T08:15:00.000Z');
    const february = nextRecurringOccurrence(anchor, anchor, 'P1M');
    expect(february.toISOString()).toBe('2026-02-28T08:15:00.000Z');
    expect(nextRecurringOccurrence(february, anchor, 'P1M').toISOString()).toBe(
      '2026-03-31T08:15:00.000Z',
    );
    expect(nextRecurringOccurrence(anchor, anchor, 'P3M').toISOString()).toBe(
      '2026-04-30T08:15:00.000Z',
    );
  });

  it('clamps leap-day yearly schedules and restores the anchor in leap years', () => {
    const anchor = new Date('2024-02-29T12:00:00.000Z');
    const next = nextRecurringOccurrence(anchor, anchor, 'P1Y');
    expect(next.toISOString()).toBe('2025-02-28T12:00:00.000Z');
    const following = nextRecurringOccurrence(new Date('2027-02-28T12:00:00.000Z'), anchor, 'P1Y');
    expect(following.toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });
});
