'use client';

export type FriendStatus = 'PENDING' | 'FRIEND';
export type GroupType = 'trip' | 'household' | 'event' | 'other';
export type MemberRole = 'admin' | 'member';
export type ExpenseStatus = 'ACTIVE' | 'UPDATED' | 'DELETED';

export interface DemoFriend {
  id: string;
  name: string;
  identifier: string;
  status: FriendStatus;
  incoming: boolean;
}

export interface DemoMember {
  id: string;
  name: string;
  role: MemberRole;
}

export interface DemoGroup {
  id: string;
  name: string;
  type: GroupType;
  image: string;
  members: DemoMember[];
  dissolved: boolean;
}

export interface DemoExpense {
  id: string;
  description: string;
  amountMinor: string;
  currency: string;
  payerId: string;
  groupId: string;
  category: string;
  participantIds: string[];
  status: ExpenseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DemoState {
  friends: DemoFriend[];
  groups: DemoGroup[];
  expenses: DemoExpense[];
}

const storageKey = 'equa_local_demo_v1';
const changedEvent = 'equa-demo-changed';

function seed(): DemoState {
  return {
    friends: [
      {
        id: 'friend-minh-anh',
        name: 'Minh Anh',
        identifier: 'minh.anh@example.com',
        status: 'PENDING',
        incoming: true,
      },
    ],
    groups: [
      {
        id: 'group-da-lat',
        name: 'Chuyến đi Đà Lạt',
        type: 'trip',
        image: 'ĐL',
        members: [{ id: 'demo-me', name: 'Bạn', role: 'admin' }],
        dissolved: false,
      },
    ],
    expenses: [],
  };
}

export function loadDemoState(): DemoState {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return seed();
    const value: unknown = JSON.parse(raw);
    if (!isDemoState(value)) return seed();
    return value;
  } catch {
    return seed();
  }
}

export function saveDemoState(state: DemoState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
  window.dispatchEvent(new Event(changedEvent));
}

export function subscribeDemo(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const callback = (): void => listener();
  window.addEventListener(changedEvent, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(changedEvent, callback);
    window.removeEventListener('storage', callback);
  };
}

export function newDemoId(prefix: string): string {
  const value =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${value}`;
}

export function activeExpenses(state: DemoState): DemoExpense[] {
  return state.expenses.filter((expense) => expense.status !== 'DELETED');
}

export function minorFromInput(value: string, currency: string): string | undefined {
  const compact = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return undefined;
  const digits = minorDigits(currency);
  const [whole, fraction = ''] = compact.split('.');
  if (fraction.length > digits || (digits === 0 && fraction.length > 0)) return undefined;
  const amount =
    BigInt(whole ?? '0') * 10n ** BigInt(digits) +
    BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0');
  return amount > 0n ? amount.toString() : undefined;
}

export function formatMinor(minor: string, currency: string): string {
  const digits = minorDigits(currency);
  const raw = BigInt(minor);
  const sign = raw < 0n ? '-' : '';
  const absolute = (raw < 0n ? -raw : raw).toString().padStart(digits + 1, '0');
  const whole = digits === 0 ? absolute : absolute.slice(0, -digits);
  const fraction = digits === 0 ? '' : absolute.slice(-digits);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const symbol =
    currency === 'VND' ? '₫' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
  return currency === 'VND' || currency === 'KRW' || currency === 'JPY'
    ? `${sign}${grouped}${symbol}`
    : `${sign}${symbol}${grouped}${fraction ? `,${fraction}` : ''}`;
}

export function minorDigits(currency: string): number {
  return currency === 'VND' || currency === 'JPY' || currency === 'KRW' ? 0 : 2;
}

export const currencies = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'GBP', 'SGD'];
export const standardCategories = [
  'Ăn uống',
  'Di chuyển',
  'Lưu trú',
  'Giải trí',
  'Mua sắm',
  'Khác',
];

function isDemoState(value: unknown): value is DemoState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as DemoState).friends) &&
    Array.isArray((value as DemoState).groups) &&
    Array.isArray((value as DemoState).expenses)
  );
}
