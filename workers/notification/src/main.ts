import type { ServiceName } from '@equa/contracts';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

import { InMemoryNotificationStore } from './in-memory.store.js';
import { PostgresNotificationStore } from './database/postgres.store.js';
import { createNotificationProvider } from './mailpit.provider.js';
import { NotificationWorker } from './notification.worker.js';
import { consumeRabbit } from './rabbit.consumer.js';

if (process.env.NODE_ENV !== 'test')
  loadEnv({ path: join(process.cwd(), '../../.env'), quiet: true });

const service: ServiceName = 'notification';

const databaseUrl = process.env.NOTIFICATION_DATABASE_URL;
const store = databaseUrl
  ? new PostgresNotificationStore(databaseUrl)
  : new InMemoryNotificationStore();
const reportWorkerFailure = (stage: 'ingest' | 'poll'): void => {
  console.error(
    JSON.stringify({
      level: 'error',
      service,
      component: 'notification-worker',
      stage,
      message: 'Background notification operation failed; recovery or DLQ handling will continue.',
    }),
  );
};
const reportRabbitFailure = (notice: {
  reason: 'connect' | 'connection' | 'message';
  attempt: number;
  delayMs: number;
}): void => {
  console.error(
    JSON.stringify({
      level: 'error',
      service,
      component: 'rabbit-consumer',
      message: 'RabbitMQ consumer will retry.',
      ...notice,
    }),
  );
};
const provider = createNotificationProvider();
const worker = new NotificationWorker(store, provider, undefined, reportWorkerFailure);
const stopPolling = worker.start();
console.info(
  JSON.stringify({
    level: 'info',
    message: databaseUrl
      ? provider.enabled
        ? 'PostgreSQL worker ready; local Mailpit provider enabled'
        : 'PostgreSQL worker ready; provider disabled'
      : 'persistence not configured; worker disabled',
    service,
  }),
);
const rabbit =
  databaseUrl && process.env.RABBITMQ_URL
    ? consumeRabbit(process.env.RABBITMQ_URL, worker, 1_000, undefined, reportRabbitFailure)
    : undefined;

const shutdown = (signal: string): void => {
  stopPolling();
  console.info(JSON.stringify({ level: 'info', message: 'worker stopping', service, signal }));
  void rabbit
    ?.close()
    .catch(() => undefined)
    .finally(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
