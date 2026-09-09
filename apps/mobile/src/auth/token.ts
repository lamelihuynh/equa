/** The JWT subject is only a local partition hint. Servers must authenticate every request. */
export function accountHint(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const json = globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' &&
      parsed !== null &&
      'sub' in parsed &&
      typeof parsed.sub === 'string'
      ? parsed.sub
      : undefined;
  } catch {
    return undefined;
  }
}
