import { describe, expect, it } from 'vitest';

import { SERVICE_NAMES } from './index';

describe('service contracts', () => {
  it('keeps all initial deployables visible', () => {
    expect(SERVICE_NAMES).toEqual(['identity', 'ledger', 'platform', 'notification']);
  });
});
