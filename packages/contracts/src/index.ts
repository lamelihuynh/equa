export const SERVICE_NAMES = ['identity', 'ledger', 'platform', 'notification'] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface HealthResponse {
  status: 'ok';
  service: ServiceName;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  correlationId: string;
  details: unknown[];
}

export const SUPPORTED_LANGUAGES = ['vi', 'en', 'ja', 'ko', 'zh', 'fr', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const SUPPORTED_CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'GBP', 'SGD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface UserProfile {
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  currency: SupportedCurrency;
  language: SupportedLanguage;
  timezone: string;
}

export type UpdateUserProfile = Partial<UserProfile>;
