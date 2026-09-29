import { SUPPORTED_CURRENCIES } from '@equa/contracts';

export type WebCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function minorDigits(currency: string): number {
  if (currency === 'VND' || currency === 'JPY' || currency === 'KRW') return 0;
  return 2;
}

export function minorFromInput(value: string, currency: string): string | undefined {
  if (!SUPPORTED_CURRENCIES.includes(currency as WebCurrency)) return undefined;
  const input = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(input)) return undefined;
  const digits = minorDigits(currency);
  const [whole, fraction = ''] = input.split('.');
  if (fraction.length > digits) return undefined;
  const amount =
    BigInt(whole ?? '0') * 10n ** BigInt(digits) +
    BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0');
  return amount > 0n ? amount.toString() : undefined;
}

export function formatMinor(value: string, currency: string, locale = 'vi-VN'): string {
  const amount = BigInt(value);
  const digits = minorDigits(currency);
  const scale = 10n ** BigInt(digits);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(digits, '0');
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (digits === 0) return formatter.format(whole);
  const parts = formatter.formatToParts(whole);
  const decimalIndex = parts.findIndex((part) => part.type === 'decimal');
  if (decimalIndex < 0) return `${formatter.format(whole)}${fraction}`;
  const prefix = parts
    .slice(0, decimalIndex)
    .map((part) => part.value)
    .join('');
  const decimal = parts[decimalIndex]!.value;
  const suffix = parts
    .slice(decimalIndex + 2)
    .map((part) => part.value)
    .join('');
  return `${prefix}${decimal}${fraction}${suffix}`;
}
