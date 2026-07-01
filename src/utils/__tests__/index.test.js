import { describe, it, expect } from 'vitest';
import {
  toDateString,
  toDisplayDate,
  toJSDate,
  formatDate,
  formatNumber,
  formatLakhs,
} from '../index';

describe('toDateString', () => {
  it('returns empty string for null/undefined/falsy', () => {
    expect(toDateString(null)).toBe('');
    expect(toDateString(undefined)).toBe('');
    expect(toDateString('')).toBe('');
    expect(toDateString(0)).toBe('');
  });

  it('slices first 10 chars of a string', () => {
    expect(toDateString('2024-03-15')).toBe('2024-03-15');
    expect(toDateString('2024-03-15T10:30:00Z')).toBe('2024-03-15');
  });

  it('handles a JS Date object', () => {
    // Use a UTC date to avoid timezone-offset surprises in the slice
    const d = new Date('2024-06-01T00:00:00.000Z');
    expect(toDateString(d)).toBe('2024-06-01');
  });

  it('handles a Firestore-like object with toDate()', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2023-12-25T00:00:00.000Z'),
    };
    expect(toDateString(fakeTimestamp)).toBe('2023-12-25');
  });

  it('handles a Firestore-like object with .seconds', () => {
    // 2024-01-01T00:00:00Z = 1704067200 seconds
    const ts = { seconds: 1704067200 };
    expect(toDateString(ts)).toBe('2024-01-01');
  });

  it('returns empty string for unknown types (e.g. a number without .seconds)', () => {
    expect(toDateString(42)).toBe('');
  });
});

describe('toDisplayDate', () => {
  it('returns em-dash for empty/null/undefined', () => {
    expect(toDisplayDate(null)).toBe('—');
    expect(toDisplayDate(undefined)).toBe('—');
    expect(toDisplayDate('')).toBe('—');
  });

  it('converts YYYY-MM-DD string to DD/MM/YYYY', () => {
    expect(toDisplayDate('2024-03-05')).toBe('05/03/2024');
  });

  it('handles a JS Date', () => {
    const d = new Date('2023-11-20T00:00:00.000Z');
    expect(toDisplayDate(d)).toBe('20/11/2023');
  });
});

describe('toJSDate', () => {
  it('returns null for falsy values', () => {
    expect(toJSDate(null)).toBeNull();
    expect(toJSDate(undefined)).toBeNull();
    expect(toJSDate('')).toBeNull();
    expect(toJSDate(0)).toBeNull();
  });

  it('returns the same Date if already a Date', () => {
    const d = new Date('2024-01-15');
    expect(toJSDate(d)).toBe(d);
  });

  it('calls .toDate() on Firestore timestamp objects', () => {
    const inner = new Date('2024-07-04T00:00:00.000Z');
    const fakeTs = { toDate: () => inner };
    expect(toJSDate(fakeTs)).toBe(inner);
  });

  it('converts .seconds to Date', () => {
    const ts = { seconds: 1704067200 };
    const result = toJSDate(ts);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString().startsWith('2024-01-01')).toBe(true);
  });

  it('parses ISO string', () => {
    const result = toJSDate('2025-06-15');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
  });
});

describe('formatDate', () => {
  it('returns em-dash for falsy input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns a non-empty string for a valid date', () => {
    const result = formatDate('2024-03-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain the year
    expect(result).toContain('2024');
  });
});

describe('formatNumber', () => {
  it('returns em-dash for null/undefined', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats a simple number', () => {
    const result = formatNumber(1000);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats large Indian-style numbers (commas present)', () => {
    const result = formatNumber(100000);
    // In Indian locale: 1,00,000
    expect(result).toContain(',');
  });
});

describe('formatLakhs', () => {
  it('returns "0" for null, undefined, empty string, 0', () => {
    expect(formatLakhs(null)).toBe('0');
    expect(formatLakhs(undefined)).toBe('0');
    expect(formatLakhs('')).toBe('0');
    expect(formatLakhs(0)).toBe('0');
    expect(formatLakhs('0')).toBe('0');
  });

  it('returns "0" for NaN strings', () => {
    expect(formatLakhs('abc')).toBe('0');
  });

  it('formats crores (>= 10,000,000)', () => {
    expect(formatLakhs(10000000)).toBe('1.0Cr');
    expect(formatLakhs(25000000)).toBe('2.5Cr');
  });

  it('formats lakhs (>= 100,000)', () => {
    expect(formatLakhs(100000)).toBe('1.0L');
    expect(formatLakhs(500000)).toBe('5.0L');
  });

  it('formats thousands (>= 1,000)', () => {
    expect(formatLakhs(1000)).toBe('1K');
    expect(formatLakhs(5500)).toBe('6K');
  });

  it('returns plain number string for small values', () => {
    expect(formatLakhs(999)).toBe('999');
    expect(formatLakhs(1)).toBe('1');
  });

  it('accepts string numbers', () => {
    expect(formatLakhs('500000')).toBe('5.0L');
  });
});
