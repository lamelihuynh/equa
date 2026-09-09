import type { ServiceName } from '@equa/contracts';

import { InMemoryNotificationStore } from './in-memory.store.js';
import { PostgresNotificationStore } from './database/postgres.store.js';
import { DisabledNotificationProvider, NotificationWorker } from './notification.worker.js';
import { consumeRabbit } from './rabbit.consumer.js';

const service: ServiceName = 'notification';

const databaseUrl = process.env.NOTIFICATION_DATABASE_URL;
const store = databaseUrl
  ? new PostgresNotificationStore(databaseUrl)
  : new InMemoryNotificationStore();
const worker = new NotificationWorker(store, new DisabledNotificationProvider());
const stopPolling = worker.start();
console.log(
  JSON.stringify({
    level: 'info',
    message: databaseUrl
      ? 'PostgreSQL worker ready; provider disabled'
      : 'persistence not configured; worker disabled',
    service,
  }),
);
const rabbit =
  databaseUrl && process.env.RABBITMQ_URL
    ? consumeRabbit(process.env.RABBITMQ_URL, worker)
    : undefined;

const shutdown = (signal: string): void => {
  stopPolling();
  console.log(JSON.stringify({ level: 'info', message: 'worker stopping', service, signal }));
  void rabbit?.close().finally(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
