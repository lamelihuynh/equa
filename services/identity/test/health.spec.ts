import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health.controller';

describe('identity health', () => {
  it('identifies the service', () => {
    expect(new HealthController().health()).toMatchObject({ status: 'ok', service: 'identity' });
  });
});
