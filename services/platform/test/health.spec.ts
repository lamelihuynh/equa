import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health.controller';

describe('platform health', () => {
  it('identifies the service', () => {
    expect(new HealthController().health()).toMatchObject({ status: 'ok', service: 'platform' });
  });
});
