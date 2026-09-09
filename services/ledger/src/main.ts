import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';

import { LedgerDatabase } from './database/postgres.repository.js';
import { buildLedgerServer } from './main.server.js';
import { LedgerOutboxPublisher } from './outbox.publisher.js';
import { AmqpLedgerEventPublisher } from './rabbit.publisher.js';

loadEnv();

async function bootstrap(): Promise<void> {
  if (!process.env.IDENTITY_JWT_SECRET) return;
  const database = process.env.LEDGER_DATABASE_URL
    ? new LedgerDatabase(process.env.LEDGER_DATABASE_URL)
    : undefined;
  const app = await buildLedgerServer(process.env.IDENTITY_JWT_SECRET, {
    repository: database,
  });
  const broker = process.env.RABBITMQ_URL;
  const rabbit = database && broker ? new AmqpLedgerEventPublisher(broker) : undefined;
  const outbox = rabbit && database ? new LedgerOutboxPublisher(database, rabbit) : undefined;
  const stopOutbox = outbox?.start();
  await app.listen({ port: Number(process.env.LEDGER_PORT ?? 3002), host: '0.0.0.0' });
  const shutdown = async (): Promise<void> => {
    stopOutbox?.();
    await rabbit?.close();
    await app.close();
    await database?.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void bootstrap();
