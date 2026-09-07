import { describe, expect, it } from 'vitest';

import { SERVICE_NAMES, SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES } from './index';

describe('service contracts', () => {
  it('keeps all initial deployables visible', () => {
    expect(SERVICE_NAMES).toEqual(['identity', 'ledger', 'platform', 'notification']);
  });

  it('defines profile preference choices', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['VND', 'USD', 'EUR', 'JPY', 'KRW', 'GBP', 'SGD']);
    expect(SUPPORTED_LANGUAGES).toEqual(['vi', 'en', 'ja', 'ko', 'zh', 'fr', 'es']);
    expect(SUPPORTED_LANGUAGES).toHaveLength(7);
  });
});
