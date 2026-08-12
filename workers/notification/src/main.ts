import type { ServiceName } from '@equa/contracts';

const service: ServiceName = 'notification';

// The real worker will consume integration events from RabbitMQ. Keeping this process alive makes
// container/deployment wiring testable before business handlers are implemented.
console.log(JSON.stringify({ level: 'info', message: 'worker scaffold ready', service }));

const shutdown = (signal: string): void => {
  console.log(JSON.stringify({ level: 'info', message: 'worker stopping', service, signal }));
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
setInterval(() => undefined, 60_000);
