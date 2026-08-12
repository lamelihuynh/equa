import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health.controller';

describe('ledger health', () => {
  it('identifies the service', () => {
    expect(new HealthController().health()).toMatchObject({ status: 'ok', service: 'ledger' });
  });
});
