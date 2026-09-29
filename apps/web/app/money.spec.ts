import { describe, expect, it } from 'vitest';

import { formatMinor, minorFromInput } from './money.js';

describe('web minor-unit formatting', () => {
  it('converts decimal form values without floating-point arithmetic', () => {
    expect(minorFromInput('1234.56', 'USD')).toBe('123456');
    expect(minorFromInput('1234', 'VND')).toBe('1234');
    expect(minorFromInput('1.2', 'VND')).toBeUndefined();
    expect(minorFromInput('1.234', 'USD')).toBeUndefined();
    expect(minorFromInput('1,2', 'USD')).toBeUndefined();
    expect(minorFromInput('1,234.56', 'USD')).toBeUndefined();
  });

  it('formats integer minor units in the currency fraction scale', () => {
    expect(formatMinor('123456', 'USD', 'en-US')).toBe('$1,234.56');
    expect(formatMinor('1234', 'VND', 'en-US')).toBe('₫1,234');
  });
});
