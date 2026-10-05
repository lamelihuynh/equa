export type MobilePlatform = 'android' | 'other';

export function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  isDevelopment: boolean,
  platform: MobilePlatform,
): string {
  const configured = configuredUrl?.trim();
  if (!configured) {
    if (!isDevelopment)
      throw new Error('EXPO_PUBLIC_API_BASE_URL must be set for non-development builds.');
    // The Android Emulator reserves this host alias for the development machine's loopback.
    return platform === 'android' ? 'http://10.0.2.2:8000/v1' : 'http://localhost:8000/v1';
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  if (!isDevelopment && url.protocol !== 'https:')
    throw new Error('Non-development builds must use an HTTPS Gateway URL.');
  if (
    !isDevelopment &&
    (url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost') ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname === '[::1]')
  )
    throw new Error('Non-development builds cannot use a localhost API URL.');
  if (url.search || url.hash)
    throw new Error('EXPO_PUBLIC_API_BASE_URL cannot include a query or fragment.');

  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname.endsWith('/v1') ? pathname : `${pathname}/v1`}`;
}
