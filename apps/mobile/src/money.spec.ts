import { describe, expect, it } from 'vitest';

import { formatMinor, inputFromMinor, minorFromInput } from './money';

describe('Mobile integer money helpers', () => {
  it('keeps VND values as integer minor units', () => {
    expect(minorFromInput('50000', 'VND')).toBe('50000');
    expect(formatMinor('50000', 'VND')).toBe('50.000 VND');
  });

  it('converts fractional currencies without floating point', () => {
    expect(minorFromInput('12.34', 'USD')).toBe('1234');
    expect(formatMinor('1234', 'USD')).toBe('12,34 USD');
    expect(inputFromMinor('1200', 'USD')).toBe('12');
    expect(inputFromMinor('1234', 'USD')).toBe('12.34');
  });

  it('rejects decimals beyond currency precision and non-positive totals', () => {
    expect(() => minorFromInput('12.345', 'USD')).toThrow();
    expect(() => minorFromInput('0', 'VND')).toThrow();
    expect(() => minorFromInput('1.5', 'VND')).toThrow();
  });
});
