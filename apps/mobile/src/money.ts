import type { SupportedCurrency } from '@equa/contracts';

const currencyDigits = (currency: SupportedCurrency): number =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

export function minorFromInput(value: string, currency: SupportedCurrency): string {
  const digits = currencyDigits(currency);
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d*))?$/.exec(normalized);
  if (!match || (digits === 0 && match[2] !== undefined) || (match[2]?.length ?? 0) > digits)
    throw new Error('Nhập số tiền hợp lệ theo đơn vị tiền tệ đã chọn.');
  const scale = 10n ** BigInt(digits);
  const fractional = (match[2] ?? '').padEnd(digits, '0');
  const result = BigInt(match[1] ?? '0') * scale + BigInt(fractional || '0');
  if (result <= 0n) throw new Error('Số tiền phải lớn hơn 0.');
  return result.toString();
}

export function inputFromMinor(value: string, currency: SupportedCurrency): string {
  if (!/^\d{1,30}$/.test(value)) throw new Error('Số tiền máy chủ không hợp lệ.');
  const digits = currencyDigits(currency);
  const amount = BigInt(value);
  const scale = 10n ** BigInt(digits);
  const major = (amount / scale).toString();
  if (!digits) return major;
  const fraction = (amount % scale).toString().padStart(digits, '0').replace(/0+$/, '');
  return fraction ? `${major}.${fraction}` : major;
}

export function formatMinor(value: string, currency: string): string {
  if (!/^\d{1,30}$/.test(value)) return `— ${currency}`;
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const amount = BigInt(value);
  const major = (amount / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const minor = digits ? `,${(amount % scale).toString().padStart(digits, '0')}` : '';
  return `${major}${minor} ${currency}`;
}
