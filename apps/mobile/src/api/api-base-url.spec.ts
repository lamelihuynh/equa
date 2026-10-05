import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl } from './api-base-url';

describe('Mobile API base URL configuration', () => {
  it('uses platform-safe local defaults only in development', () => {
    expect(resolveApiBaseUrl(undefined, true, 'android')).toBe('http://10.0.2.2:8000/v1');
    expect(resolveApiBaseUrl(undefined, true, 'other')).toBe('http://localhost:8000/v1');
  });

  it('uses an explicit public HTTPS Gateway URL for staging builds', () => {
    expect(resolveApiBaseUrl('https://gateway.example.test', false, 'android')).toBe(
      'https://gateway.example.test/v1',
    );
    expect(resolveApiBaseUrl('https://gateway.example.test/v1/', false, 'other')).toBe(
      'https://gateway.example.test/v1',
    );
  });

  it('refuses a missing or insecure non-development API URL', () => {
    expect(() => resolveApiBaseUrl(undefined, false, 'android')).toThrow('must be set');
    expect(() => resolveApiBaseUrl('http://gateway.example.test', false, 'android')).toThrow(
      'must use an HTTPS Gateway',
    );
    expect(() => resolveApiBaseUrl('https://localhost/v1', false, 'android')).toThrow(
      'cannot use a localhost API URL',
    );
  });
});
