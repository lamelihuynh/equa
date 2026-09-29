import assert from 'node:assert/strict';
import test from 'node:test';

import { detectAffected, matrixFor, readComponents } from './affected-components.mjs';

const components = readComponents();
const ids = (files, mode = 'quality') =>
  matrixFor(detectAffected(files, components), mode).include.map((item) => item.id);

test('identity-only change validates only identity', () => {
  assert.deepEqual(ids(['services/identity/src/auth/auth.service.ts']), ['identity']);
});

test('ledger-only change validates only ledger', () => {
  assert.deepEqual(ids(['services/ledger/src/main.ts']), ['ledger']);
});

test('web-only change validates only web', () => {
  assert.deepEqual(ids(['apps/web/app/page.tsx']), ['web']);
});

test('shared contracts propagate through all workspace consumers', () => {
  assert.deepEqual(ids(['packages/contracts/src/index.ts']), [
    'contracts',
    'identity',
    'ledger',
    'social',
    'automation-sync',
    'platform',
    'notification',
    'web',
    'mobile',
  ]);
  assert.deepEqual(ids(['packages/contracts/src/index.ts'], 'images'), [
    'identity',
    'ledger',
    'social',
    'automation-sync',
    'platform',
    'notification',
    'web',
  ]);
});

test('root lockfile change validates all packages and all container images', () => {
  assert.deepEqual(
    ids(['pnpm-lock.yaml']),
    components.map((component) => component.id),
  );
  assert.equal(ids(['pnpm-lock.yaml'], 'images').length, 7);
});

test('documentation-only change selects no component or image', () => {
  assert.deepEqual(ids(['docs/ARCHITECTURE.md']), []);
  assert.deepEqual(ids(['docs/ARCHITECTURE.md'], 'images'), []);
});

test('shared service Dockerfile excludes web and non-containerized packages', () => {
  assert.deepEqual(ids(['infra/docker/node-service.Dockerfile'], 'images'), [
    'identity',
    'ledger',
    'social',
    'automation-sync',
    'platform',
    'notification',
  ]);
});

test('staging matrix includes only configured affected deployables', () => {
  assert.deepEqual(ids(['services/identity/src/main.ts'], 'staging'), ['identity']);
  assert.deepEqual(ids(['services/ledger/src/main.ts'], 'staging'), []);
});
