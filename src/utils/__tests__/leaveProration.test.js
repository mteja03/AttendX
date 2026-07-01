import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateProRatedAllowance, isMidYearJoinerThisYear } from '../leaveProration';

// We fix "today" to mid-2026 so tests don't depend on the actual current date.
// Use a local-time Date to avoid UTC/local-timezone ambiguity in getFullYear().
const FIXED_YEAR = 2026;
const FIXED_NOW = new Date(FIXED_YEAR, 5, 30); // June 30, 2026 local time

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: build a local-time date to avoid UTC-parsing timezone shifts
// e.g. localDate(2026, 6, 1) = July 1, 2026 in local time (month is 0-based)
function localDate(year, month0, day) {
  return new Date(year, month0, day);
}

describe('calculateProRatedAllowance', () => {
  it('returns 0 for null/undefined annualAllowance', () => {
    expect(calculateProRatedAllowance(null, localDate(FIXED_YEAR, 2, 1))).toBe(0);
    expect(calculateProRatedAllowance(undefined, localDate(FIXED_YEAR, 2, 1))).toBe(0);
  });

  it('returns 0 for NaN annualAllowance', () => {
    expect(calculateProRatedAllowance('abc', localDate(FIXED_YEAR, 2, 1))).toBe(0);
  });

  it('returns full allowance when no joiningDate provided', () => {
    expect(calculateProRatedAllowance(12, null)).toBe(12);
    expect(calculateProRatedAllowance(12, undefined)).toBe(12);
    expect(calculateProRatedAllowance(12, '')).toBe(12);
  });

  it('returns full allowance when joiningDate is in a prior year', () => {
    expect(calculateProRatedAllowance(12, localDate(2025, 0, 1))).toBe(12);
    expect(calculateProRatedAllowance(18, localDate(2020, 6, 15))).toBe(18);
  });

  it('returns 0 when joiningDate is in a future year', () => {
    expect(calculateProRatedAllowance(12, localDate(2027, 0, 1))).toBe(0);
  });

  it('returns full allowance when joined on Jan 1 of current year (month index 0)', () => {
    // monthsRemaining = 12 - 0 = 12 → same as annual
    expect(calculateProRatedAllowance(12, localDate(FIXED_YEAR, 0, 1))).toBe(12);
  });

  it('pro-rates correctly for mid-year join (July = month index 6)', () => {
    // monthsRemaining = 12 - 6 = 6; round(12 * 6 / 12) = 6
    expect(calculateProRatedAllowance(12, localDate(FIXED_YEAR, 6, 1))).toBe(6);
  });

  it('pro-rates correctly for Dec join (month index 11)', () => {
    // monthsRemaining = 12 - 11 = 1; round(12 * 1 / 12) = 1
    expect(calculateProRatedAllowance(12, localDate(FIXED_YEAR, 11, 1))).toBe(1);
  });

  it('rounds result correctly', () => {
    // 10 days, join in Feb (month 1) → 10 * 11 / 12 = 9.166... → rounds to 9
    expect(calculateProRatedAllowance(10, localDate(FIXED_YEAR, 1, 1))).toBe(9);
  });

  it('accepts string-number allowance', () => {
    // 12 months, join July (month 6) → 12 * 6 / 12 = 6
    expect(calculateProRatedAllowance('12', localDate(FIXED_YEAR, 6, 1))).toBe(6);
  });
});

describe('isMidYearJoinerThisYear', () => {
  it('returns false for null/undefined/empty joining date', () => {
    expect(isMidYearJoinerThisYear(null)).toBe(false);
    expect(isMidYearJoinerThisYear(undefined)).toBe(false);
    expect(isMidYearJoinerThisYear('')).toBe(false);
  });

  it('returns false for an invalid date string', () => {
    expect(isMidYearJoinerThisYear('not-a-date')).toBe(false);
  });

  it('returns false when joined in a prior year', () => {
    expect(isMidYearJoinerThisYear(localDate(2025, 5, 15))).toBe(false);
  });

  it('returns false when joined in a future year', () => {
    expect(isMidYearJoinerThisYear(localDate(2027, 5, 15))).toBe(false);
  });

  it('returns false when joined on Jan 1 of current year (month index 0)', () => {
    expect(isMidYearJoinerThisYear(localDate(FIXED_YEAR, 0, 1))).toBe(false);
  });

  it('returns true when joined in Feb or later of current year', () => {
    expect(isMidYearJoinerThisYear(localDate(FIXED_YEAR, 1, 1))).toBe(true);  // Feb
    expect(isMidYearJoinerThisYear(localDate(FIXED_YEAR, 5, 30))).toBe(true); // Jun
    expect(isMidYearJoinerThisYear(localDate(FIXED_YEAR, 11, 31))).toBe(true); // Dec
  });

  it('accepts a Date object', () => {
    const d = localDate(FIXED_YEAR, 7, 15); // Aug 15
    expect(isMidYearJoinerThisYear(d)).toBe(true);
  });
});
