import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
  '.env.example',
  '.github/workflows/ci.yml',
  'infra/compose/docker-compose.yml',
  'infra/kong/kong.yml',
  'docs/ARCHITECTURE.md',
  'docs/GETTING_STARTED.md',
  'docs/TESTING_STRATEGY.md',
  'apps/web/package.json',
  'apps/mobile/package.json',
  'services/identity/package.json',
  'services/ledger/package.json',
  'services/social/package.json',
  'services/platform/package.json',
  'workers/notification/package.json',
];

const missing = required.filter((file) => !existsSync(resolve(file)));
if (missing.length > 0) {
  console.error(`Missing scaffold files:\n${missing.join('\n')}`);
  process.exit(1);
}

const envExample = readFileSync(resolve('.env.example'), 'utf8');
if (/=(?:changeme|password|secret)$/imu.test(envExample)) {
  console.error('Use clearly local-only example values; do not suggest production secrets.');
  process.exit(1);
}

console.log(`Scaffold check passed (${required.length} required files).`);
