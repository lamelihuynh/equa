import { describe, expect, it } from 'vitest';

import { minorFromInput } from './demo-store';

describe('Local Demo minor-unit input', () => {
  it('rejects commas instead of silently changing the entered amount', () => {
    expect(minorFromInput('1,2', 'USD')).toBeUndefined();
    expect(minorFromInput('1,234.56', 'USD')).toBeUndefined();
    expect(minorFromInput('1234.56', 'USD')).toBe('123456');
  });
});
