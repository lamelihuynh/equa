import { describe, expect, it, vi } from 'vitest';

import { InMemorySocialRepository } from '../src/social.repository.js';
import { SocialOutboxPublisher } from '../src/outbox.publisher.js';

const event = {
  version: 1 as const,
  id: '00000000-0000-4000-8000-000000000001',
  type: 'group.invitation.created',
  occurredAt: '2026-01-01T00:00:00.000Z',
  ownerId: '00000000-0000-4000-8000-000000000002',
  producer: 'social',
  payload: { invitationId: '00000000-0000-4000-8000-000000000001' },
};

describe('SocialOutboxPublisher', () => {
  it('publishes persisted events and does not publish a completed event twice', async () => {
    const repository = new InMemorySocialRepository();
    const publish = vi.fn().mockResolvedValue(undefined);
    await repository.ensureOutboxEvent(event);
    const publisher = new SocialOutboxPublisher(repository, { publish });

    await expect(publisher.publishOne()).resolves.toBe(true);
    await expect(publisher.publishOne()).resolves.toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(event);
  });

  it('keeps the event retryable after broker failure', async () => {
    const repository = new InMemorySocialRepository();
    await repository.ensureOutboxEvent(event);
    let now = new Date('2026-01-01T00:00:00.000Z');
    let attempt = 0;
    const publisher = new SocialOutboxPublisher(
      repository,
      {
        publish: () => {
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new Error('broker unavailable'))
            : Promise.resolve();
        },
      },
      () => now,
    );

    await publisher.publishOne();
    await expect(publisher.publishOne()).resolves.toBe(false);
    now = new Date(now.valueOf() + 2_001);
    await expect(publisher.publishOne()).resolves.toBe(true);
    expect(attempt).toBe(2);
  });
});
