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
