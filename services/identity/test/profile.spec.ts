import { describe, expect, it } from 'vitest';

import { SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES } from '@equa/contracts';

describe('Profile preferences validation', () => {
  describe('SUPPORTED_CURRENCIES', () => {
    it('includes all 7 supported currencies', () => {
      expect(SUPPORTED_CURRENCIES).toHaveLength(7);
      expect(SUPPORTED_CURRENCIES).toContain('VND');
      expect(SUPPORTED_CURRENCIES).toContain('USD');
      expect(SUPPORTED_CURRENCIES).toContain('EUR');
      expect(SUPPORTED_CURRENCIES).toContain('JPY');
      expect(SUPPORTED_CURRENCIES).toContain('KRW');
      expect(SUPPORTED_CURRENCIES).toContain('GBP');
      expect(SUPPORTED_CURRENCIES).toContain('SGD');
    });

    it('rejects unsupported currencies', () => {
      const invalid = ['BTC', 'XRP', 'CNY', 'AUD', 'CAD'];
      for (const currency of invalid) {
        expect(SUPPORTED_CURRENCIES.includes(currency as typeof SUPPORTED_CURRENCIES[number])).toBe(
          false,
        );
      }
    });
  });

  describe('SUPPORTED_LANGUAGES', () => {
    it('includes at least 7 supported languages', () => {
      expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(7);
      expect(SUPPORTED_LANGUAGES).toContain('vi');
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('ja');
      expect(SUPPORTED_LANGUAGES).toContain('ko');
      expect(SUPPORTED_LANGUAGES).toContain('zh');
      expect(SUPPORTED_LANGUAGES).toContain('fr');
      expect(SUPPORTED_LANGUAGES).toContain('es');
    });

    it('rejects unsupported languages', () => {
      const invalid = ['de', 'pt', 'th', 'ru'];
      for (const lang of invalid) {
        expect(SUPPORTED_LANGUAGES.includes(lang as typeof SUPPORTED_LANGUAGES[number])).toBe(false);
      }
    });
  });
});