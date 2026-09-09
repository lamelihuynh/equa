import { describe, expect, it } from 'vitest';

import { InMemoryExpenseRepository } from '../src/expense.repository.js';
import { ExpenseService } from '../src/expense.service.js';
import type { LedgerSocialAdapter } from '../src/social-adapter.js';

const alice = { id: 'alice', email: 'alice@example.test' };
const bob = { id: 'bob', email: 'bob@example.test' };
const social: LedgerSocialAdapter = {
  isGroupMember: () => Promise.resolve(true),
  isGroupAdmin: () => Promise.resolve(true),
  isFriend: () => Promise.resolve(true),
};

describe('ExpenseService', () => {
  it('creates integer-safe expenses and replays a payload-bound idempotency key', async () => {
    const service = new ExpenseService(new InMemoryExpenseRepository(), social);
    const input = {
      amountMinor: '300',
      currency: 'VND',
      payerId: alice.id,
      participants: [
        { userId: alice.id, shareMinor: '100' },
        { userId: bob.id, shareMinor: '200' },
      ],
      friendId: bob.id,
      categoryId: 'food',
    };
    const first = await service.create(alice, input, 'create-1');
    expect(first.state).toBe('ACTIVE');
    expect((await service.create(alice, input, 'create-1')).id).toBe(first.id);
    await expect(
      service.create(alice, { ...input, amountMinor: '301' }, 'create-1'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(
      service.create(alice, { ...input, amountMinor: 1.5 }, 'float'),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(
      service.create(alice, { ...input, currency: 'ZZZ' }, 'invalid-currency'),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENCY' });
  });

  it('rejects an expense that is associated with a group the actor cannot access', async () => {
    const service = new ExpenseService(new InMemoryExpenseRepository(), {
      isGroupMember: () => Promise.resolve(false),
      isGroupAdmin: () => Promise.resolve(false),
      isFriend: () => Promise.resolve(false),
    });
    await expect(
      service.create(
        alice,
        {
          amountMinor: '10',
          currency: 'USD',
          payerId: alice.id,
          groupId: 'group-1',
        },
        'group-forbidden',
      ),
    ).rejects.toMatchObject({ code: 'GROUP_FORBIDDEN' });
  });

  it('updates, retains history, recalculates once per mutation, and soft deletes idempotently', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    const expense = await service.create(
      alice,
      {
        amountMinor: '1000',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '1000' }],
        friendId: bob.id,
      },
      'create',
    );
    const updated = await service.update(
      bob,
      expense.id,
      { amountMinor: '1200', participants: [{ userId: bob.id, shareMinor: '1200' }] },
      'update',
    );
    expect(updated.state).toBe('UPDATED');
    expect(service.recalculationCount(expense.id)).toBe(2);
    const deleted = await service.remove(alice, expense.id, 'delete');
    expect(deleted.state).toBe('DELETED');
    expect((await service.remove(alice, expense.id, 'delete')).state).toBe('DELETED');
    expect((await service.history(alice, expense.id)).map((row) => row.state)).toEqual([
      'ACTIVE',
      'UPDATED',
      'DELETED',
    ]);
    expect(service.recalculationCount(expense.id)).toBe(3);
  });

  it('supports custom categories, group membership gates, and filtered integer totals', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    const category = await service.createCategory(alice, 'School');
    await service.create(
      alice,
      {
        amountMinor: '9007199254740992',
        currency: 'JPY',
        payerId: alice.id,
        groupId: 'group',
        categoryId: category.id,
      },
      'large',
    );
    const total = await service.total(alice, { groupId: 'group', userId: alice.id });
    expect(total.totalMinor).toBe('9007199254740992');
    expect(total.currency).toBe('JPY');
    await expect(
      service.create(
        bob,
        { amountMinor: '10', currency: 'USD', payerId: bob.id, categoryId: category.id },
        'bad-category',
      ),
    ).rejects.toMatchObject({ code: 'CATEGORY_FORBIDDEN' });
  });

  it('enforces optimistic versions and keeps standard categories visible', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    const expense = await service.create(
      alice,
      {
        amountMinor: '100',
        currency: 'VND',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '100' }],
        friendId: bob.id,
      },
      'version-create',
    );
    await expect(
      service.update(bob, expense.id, { amountMinor: '101', expectedVersion: 0 }, 'version-stale'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const updated = await service.update(
      bob,
      expense.id,
      { amountMinor: '101', expectedVersion: 1 },
      'version-current',
    );
    expect(updated.version).toBe(2);
    await expect(service.remove(alice, expense.id, 'delete-stale', 1)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await service.categories(alice)).map((category) => category.id)).toContain('food');
  });

  it('requires participant authorization for updates and excludes deleted rows from totals', async () => {
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(repository, social);
    const expense = await service.create(
      alice,
      {
        amountMinor: '250',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: alice.id, shareMinor: '250' }],
        friendId: bob.id,
      },
      'access-create',
    );
    await expect(
      service.update({ id: 'charlie', email: 'charlie@example.test' }, expense.id, {}, 'forbidden'),
    ).rejects.toMatchObject({ code: 'EXPENSE_UPDATE_FORBIDDEN' });
    expect((await service.total(alice, { friendId: bob.id })).totalMinor).toBe('250');
    await service.remove(alice, expense.id, 'access-delete');
    expect((await service.total(alice, { friendId: bob.id })).totalMinor).toBe('0');
    await expect(
      service.remove(
        { id: 'charlie', email: 'charlie@example.test' },
        expense.id,
        'forbidden-delete',
      ),
    ).rejects.toMatchObject({ code: 'EXPENSE_DELETE_FORBIDDEN' });
  });

  it('rejects a non-payer delete when the actor is not a group admin', async () => {
    const service = new ExpenseService(new InMemoryExpenseRepository(), {
      isGroupMember: () => Promise.resolve(true),
      isGroupAdmin: () => Promise.resolve(false),
      isFriend: () => Promise.resolve(true),
    });
    const expense = await service.create(
      alice,
      {
        amountMinor: '25',
        currency: 'USD',
        payerId: alice.id,
        participants: [{ userId: bob.id, shareMinor: '25' }],
        groupId: 'group-1',
      },
      'group-delete-create',
    );
    await expect(service.remove(bob, expense.id, 'group-delete-forbidden')).rejects.toMatchObject({
      code: 'EXPENSE_DELETE_FORBIDDEN',
    });
  });

  it('supports user, friend, group, trip and date filters with access checks', async () => {
    let tick = 0;
    const repository = new InMemoryExpenseRepository();
    const service = new ExpenseService(
      repository,
      {
        isGroupMember: (groupId, userId) =>
          Promise.resolve(groupId === 'group-1' && userId === alice.id),
        isGroupAdmin: () => Promise.resolve(false),
        isFriend: (userId, friendId) => Promise.resolve(userId === alice.id && friendId === bob.id),
      },
      () => new Date(`2026-01-0${tick + 1}T00:00:00.000Z`),
    );
    const base = {
      amountMinor: '100',
      currency: 'USD',
      payerId: alice.id,
      participants: [{ userId: bob.id, shareMinor: '100' }],
    };
    tick = 0;
    await service.create(alice, { ...base, friendId: bob.id }, 'filter-friend');
    tick = 1;
    await service.create(
      alice,
      { ...base, amountMinor: '200', participants: undefined, groupId: 'group-1' },
      'filter-group',
    );
    tick = 2;
    await service.create(
      alice,
      { ...base, amountMinor: '300', participants: undefined, tripId: 'trip-1' },
      'filter-trip',
    );

    await expect(service.total(alice, { userId: alice.id })).resolves.toMatchObject({
      totalMinor: '600',
      count: 3,
    });
    await expect(service.total(alice, { friendId: bob.id })).resolves.toMatchObject({
      totalMinor: '100',
      count: 1,
    });
    await expect(service.total(alice, { groupId: 'group-1' })).resolves.toMatchObject({
      totalMinor: '200',
      count: 1,
    });
    await expect(service.total(alice, { tripId: 'trip-1' })).resolves.toMatchObject({
      totalMinor: '300',
      count: 1,
    });
    await expect(
      service.total(alice, {
        from: '2026-01-02T00:00:00.000Z',
        to: '2026-01-02T23:59:59.999Z',
      }),
    ).resolves.toMatchObject({ totalMinor: '200', count: 1 });
    await expect(service.total(alice, { from: '2026-01-04T00:00:00.000Z' })).resolves.toMatchObject(
      { totalMinor: '0', count: 0 },
    );
    await expect(service.total(alice, { friendId: 'charlie' })).rejects.toMatchObject({
      code: 'FRIEND_FORBIDDEN',
    });
    await expect(service.total(bob, { groupId: 'group-1' })).rejects.toMatchObject({
      code: 'GROUP_FORBIDDEN',
    });
    await expect(service.total(bob, { userId: alice.id })).rejects.toMatchObject({
      code: 'TOTAL_FORBIDDEN',
    });
  });
});
