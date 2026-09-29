export type RecurringPeriodUnit = 'D' | 'W' | 'M' | 'Y';

export interface RecurringPeriod {
  amount: number;
  unit: RecurringPeriodUnit;
}

const periodPattern = /^P(\d+)([DWMY])$/;
const timestampWithZonePattern = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i;
const millisecondsPerDay = 86_400_000;

/** Supports one positive ISO-8601 date-period unit; combined/time periods are not V1 schedules. */
export function parseRecurringSchedule(value: string): RecurringPeriod | undefined {
  const match = periodPattern.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return undefined;
  return { amount, unit: match[2] as RecurringPeriodUnit };
}

/** Starts are instants; requiring an offset prevents machine-local timezone interpretation. */
export function parseRecurringStart(value: string): Date | undefined {
  if (!timestampWithZonePattern.test(value)) return undefined;
  const start = new Date(value);
  return Number.isNaN(start.valueOf()) ? undefined : start;
}

/** Calculates the next occurrence while preserving a calendar schedule's original UTC anchor. */
export function nextRecurringOccurrence(
  currentOccurrence: Date,
  anchorAt: Date,
  schedule: string | RecurringPeriod,
): Date {
  const period = typeof schedule === 'string' ? parseRecurringSchedule(schedule) : schedule;
  if (
    !period ||
    !Number.isFinite(currentOccurrence.valueOf()) ||
    !Number.isFinite(anchorAt.valueOf())
  )
    throw new RangeError('A valid recurring date period and timestamps are required.');
  if (currentOccurrence < anchorAt)
    throw new RangeError('Current occurrence precedes its schedule anchor.');

  if (period.unit === 'D' || period.unit === 'W') {
    const days = period.amount * (period.unit === 'W' ? 7 : 1);
    const milliseconds = days * millisecondsPerDay;
    if (!Number.isSafeInteger(milliseconds))
      throw new RangeError('Recurring interval is too large.');
    return validDate(currentOccurrence.valueOf() + milliseconds);
  }

  const intervalMonths = period.amount * (period.unit === 'Y' ? 12 : 1);
  if (!Number.isSafeInteger(intervalMonths))
    throw new RangeError('Recurring interval is too large.');
  const anchorMonth = monthIndex(anchorAt);
  const currentMonth = monthIndex(currentOccurrence);
  const elapsedMonths = currentMonth - anchorMonth;
  let periods = Math.max(1, Math.floor(elapsedMonths / intervalMonths) + 1);
  let candidate = monthOccurrence(anchorAt, anchorMonth + periods * intervalMonths);
  while (candidate <= currentOccurrence) {
    periods += 1;
    candidate = monthOccurrence(anchorAt, anchorMonth + periods * intervalMonths);
  }
  return candidate;
}

function monthIndex(value: Date): number {
  return value.getUTCFullYear() * 12 + value.getUTCMonth();
}

function monthOccurrence(anchorAt: Date, targetMonthIndex: number): Date {
  if (!Number.isSafeInteger(targetMonthIndex))
    throw new RangeError('Recurring date is out of range.');
  const year = Math.floor(targetMonthIndex / 12);
  const month = targetMonthIndex - year * 12;
  const lastDay = new Date(0);
  lastDay.setUTCHours(0, 0, 0, 0);
  lastDay.setUTCFullYear(year, month + 1, 0);
  const day = Math.min(anchorAt.getUTCDate(), lastDay.getUTCDate());
  const occurrence = new Date(anchorAt.valueOf());
  occurrence.setUTCDate(1);
  occurrence.setUTCFullYear(year, month, day);
  occurrence.setUTCHours(
    anchorAt.getUTCHours(),
    anchorAt.getUTCMinutes(),
    anchorAt.getUTCSeconds(),
    anchorAt.getUTCMilliseconds(),
  );
  return validDate(occurrence.valueOf());
}

function validDate(value: number): Date {
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) throw new RangeError('Recurring date is out of range.');
  return result;
}
