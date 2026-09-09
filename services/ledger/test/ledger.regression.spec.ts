import { describe, expect, it } from 'vitest';

import { InMemoryExpenseRepository } from '../src/expense.repository.js';
import { ExpenseService } from '../src/expense.service.js';
import { LedgerOutboxPublisher } from '../src/outbox.publisher.js';
import type { LedgerSocialAdapter } from '../src/social-adapter.js';

const alice = { id: 'alice', email: 'alice@example.test' };
const bob = { id: 'bob', email: 'bob@example.test' };
const social: LedgerSocialAdapter = {
  isGroupMember: () => Promise.resolve(true),
  isGroupAdmin: () => Promise.resolve(true),
  isFriend: () => Promise.resolve(true),
};

describe('Ledger EXP balance and event regressions', () => {
  it('keeps mixed-currency pair balances separate and totals currency-safe', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    await service.create(
      alice,
      {
        amountMinor: '100',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '100' }],
        friendId: bob.id,
      },
      'usd',
    );
    await service.create(
      alice,
      {
        amountMinor: '100',
        currency: 'VND',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '100' }],
        friendId: bob.id,
      },
      'vnd',
    );
    await expect(service.pairBalance(alice.id, bob.id)).resolves.toMatchObject({
      balances: [
        { currency: 'USD', netMinor: '100' },
        { currency: 'VND', netMinor: '100' },
      ],
      hasOutstandingDebt: true,
      netMinor: null,
      currency: null,
    });
    await expect(service.total(alice, {})).resolves.toMatchObject({
      totalMinor: null,
      currency: null,
      totals: [
        { currency: 'USD', totalMinor: '100', count: 1 },
        { currency: 'VND', totalMinor: '100', count: 1 },
      ],
    });
  });

  it('does not invent a split when a multi-participant amount changes', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    const expense = await service.create(
      alice,
      {
        amountMinor: '100',
        currency: 'USD',
        payerId: alice.id,
        participants: [
          { userId: alice.id, shareMinor: '50' },
          { userId: bob.id, shareMinor: '50' },
        ],
        friendId: bob.id,
      },
      'split',
    );
    await expect(
      service.update(alice, expense.id, { amountMinor: '120' }, 'split-update'),
    ).rejects.toMatchObject({ code: 'PARTICIPANTS_REQUIRED' });
    await expect(service.get(alice, expense.id)).resolves.toMatchObject({
      amountMinor: '100',
      participants: [
        { userId: alice.id, shareMinor: '50' },
        { userId: bob.id, shareMinor: '50' },
      ],
    });
  });

  it('recomputes the narrow pair balance on update and soft delete', async () => {
    const service = new ExpenseService(new InMemoryExpenseRepository(), social);
    const expense = await service.create(
      alice,
      {
        amountMinor: '100',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '100' }],
        friendId: bob.id,
      },
      'balance-create',
    );
    await expect(service.pairBalance(alice.id, bob.id)).resolves.toMatchObject({
      balances: [{ currency: 'USD', netMinor: '100' }],
      hasOutstandingDebt: true,
    });
    const updated = await service.update(
      alice,
      expense.id,
      { amountMinor: '150', participants: [{ userId: bob.id, shareMinor: '150' }] },
      'balance-update',
    );
    expect(updated.version).toBe(2);
    await expect(
      service.update(
        alice,
        expense.id,
        { amountMinor: '150', participants: [{ userId: bob.id, shareMinor: '150' }] },
        'balance-update',
      ),
    ).resolves.toEqual(updated);
    await expect(service.pairBalance(alice.id, bob.id)).resolves.toMatchObject({
      balances: [{ currency: 'USD', netMinor: '150' }],
      hasOutstandingDebt: true,
    });
    await service.remove(alice, expense.id, 'balance-delete');
    await expect(service.remove(alice, expense.id, 'balance-delete')).resolves.toMatchObject({
      state: 'DELETED',
      version: 3,
    });
    await expect(service.pairBalance(alice.id, bob.id)).resolves.toMatchObject({
      balances: [],
      hasOutstandingDebt: false,
    });
  });

  it('requires an associated context for delegated payers and checks exact group net debt', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    await expect(
      service.create(
        alice,
        { amountMinor: '10', currency: 'USD', payerId: bob.id },
        'arbitrary-payer',
      ),
    ).rejects.toMatchObject({ code: 'PAYER_FORBIDDEN' });
    await service.create(
      alice,
      {
        amountMinor: '100',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '100' }],
        groupId: 'group',
      },
      'group-one',
    );
    await service.create(
      bob,
      {
        amountMinor: '100',
        currency: 'USD',
        payerId: bob.id,
        participants: [{ userId: alice.id, shareMinor: '100' }],
        groupId: 'group',
      },
      'group-two',
    );
    await expect(service.hasOutstandingGroupDebt('group', alice.id)).resolves.toBe(false);
  });

  it('emits one event per successful mutation and exposes a signed owner feed', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    const input = {
      amountMinor: '100',
      currency: 'USD',
      payerId: alice.id,
      participants: [{ userId: bob.id, shareMinor: '100' }],
      friendId: bob.id,
    };
    const expense = await service.create(alice, input, 'event-create');
    await service.create(alice, input, 'event-create');
    await service.update(alice, expense.id, { description: 'updated' }, 'event-update');
    await service.remove(alice, expense.id, 'event-delete');
    expect(repository.outbox).toHaveLength(3);
    expect(repository.outbox.map((event) => event.type)).toEqual([
      'expense.created',
      'expense.updated',
      'expense.deleted',
    ]);
    const first = await service.feed(alice.id, undefined, 1);
    expect(first.events).toHaveLength(1);
    expect(first.cursor).toBeTruthy();
    const second = await service.feed(alice.id, first.cursor, 10);
    expect(second.events).toHaveLength(2);
    expect(second.cursor).toBeTruthy();
    const empty = await service.feed(alice.id, second.cursor, 10);
    expect(empty.events).toEqual([]);
    expect(empty.cursor).toBe(second.cursor);
    await expect(service.feed(alice.id, `${first.cursor}tampered`, 10)).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
    await expect(service.feed(bob.id, second.cursor, 10)).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('retries a fenced outbox publication without creating a second event', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    await service.create(
      alice,
      {
        amountMinor: '10',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '10' }],
        friendId: bob.id,
      },
      'publisher-create',
    );
    let now = new Date('2026-01-01T00:00:00.000Z');
    let failures = 1;
    const published: string[] = [];
    const publisher = new LedgerOutboxPublisher(
      repository,
      {
        publish: (event) => {
          if (failures-- > 0) throw new Error('temporary broker failure');
          published.push(event.id);
          return Promise.resolve();
        },
      },
      () => now,
    );
    await publisher.publishOne();
    expect(published).toEqual([]);
    now = new Date('2026-01-01T00:00:03.000Z');
    await publisher.publishOne();
    expect(published).toHaveLength(1);
    expect(repository.outbox).toHaveLength(1);
  });
});
