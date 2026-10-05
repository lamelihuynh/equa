'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { SUPPORTED_CURRENCIES } from '@equa/contracts';

import {
  ApiClientError,
  apiJson,
  currentUserId,
  getMutationIdempotencyKey,
  isLocalDemoSession,
  isRecord,
} from '../api-client';
import { DemoShell } from '../components/demo-shell';
import { humanIdentityLabel } from '../identity-label';
import {
  formatMinor as formatServerMinor,
  minorDigits,
  minorFromInput as serverMinorFromInput,
} from '../money';
import {
  activeExpenses,
  currencies,
  formatMinor,
  loadDemoState,
  minorFromInput,
  newDemoId,
  saveDemoState,
  standardCategories,
  subscribeDemo,
  type DemoExpense,
  type DemoState,
} from '../demo-store';

interface ApiGroup {
  id: string;
  name: string;
  type: string;
  dissolvedAt: string | null;
}

interface ApiMember {
  userId: string;
  role: 'admin' | 'member';
  user?: ApiHumanIdentity;
}

interface ApiHumanIdentity {
  id?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

interface ApiFriendship {
  userA: string;
  userB: string;
  friend?: ApiHumanIdentity;
}

interface ApiFriend {
  id: string;
  identity?: ApiHumanIdentity;
}

interface ApiCategory {
  id: string;
  name: string;
  standard: boolean;
}

interface ApiParticipant {
  userId: string;
  shareMinor: string;
}

interface ApiExpense {
  id: string;
  description: string;
  amountMinor: string;
  currency: string;
  payerId: string;
  participants: ApiParticipant[];
  categoryId: string | null;
  friendId: string | null;
  groupId: string | null;
  state: 'ACTIVE' | 'UPDATED' | 'DELETED';
  version: number;
  createdAt: string;
}

interface ApiTotal {
  currency: string;
  totalMinor: string;
  count: number;
}

export default function ExpensesPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'loading' | 'demo' | 'api'>('loading');
  useEffect(() => {
    const expire = (): void => router.replace('/?expired=1');
    window.addEventListener('equa-session-expired', expire);
    if (!sessionStorage.getItem('equa_access_token')) {
      router.replace('/');
      return () => window.removeEventListener('equa-session-expired', expire);
    }
    setMode(isLocalDemoSession() ? 'demo' : 'api');
    return () => window.removeEventListener('equa-session-expired', expire);
  }, [router]);
  if (mode === 'demo') return <LocalExpensesPage />;
  if (mode === 'api') return <ApiExpensesPage />;
  return (
    <main className="workspace">
      <section className="contentCard demoContent" role="status">
        Loading expenses…
      </section>
    </main>
  );
}

function LocalExpensesPage() {
  const [state, setState] = useState<DemoState>(() => loadDemoState());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DemoExpense | null>(null);
  const [filterGroup, setFilterGroup] = useState('all');
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setShowForm(true);
    return subscribeDemo(() => setState(loadDemoState()));
  }, []);
  const persist = (next: DemoState): void => {
    setState(next);
    saveDemoState(next);
  };
  const visible = useMemo(
    () =>
      (showHistory ? state.expenses : activeExpenses(state)).filter(
        (expense) => filterGroup === 'all' || expense.groupId === filterGroup,
      ),
    [filterGroup, showHistory, state],
  );
  const total = visible
    .filter((expense) => expense.status !== 'DELETED')
    .reduce((sum, expense) => sum + BigInt(expense.amountMinor), 0n);
  const totalCurrency = visible.find((expense) => expense.status !== 'DELETED')?.currency ?? 'VND';
  const groups = state.groups.filter((group) => !group.dissolved);

  function openCreate(): void {
    setEditing(null);
    setShowForm(true);
  }
  function saveExpense(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = data.get('description');
    const amount = data.get('amount');
    const currency = data.get('currency');
    const groupId = data.get('group');
    const category = data.get('category');
    const customCategory = data.get('customCategory');
    const payer = data.get('payer');
    const participants = data.get('participants');
    if (
      typeof description !== 'string' ||
      !description.trim() ||
      typeof amount !== 'string' ||
      typeof currency !== 'string' ||
      typeof groupId !== 'string' ||
      typeof payer !== 'string' ||
      typeof participants !== 'string'
    ) {
      setMessage('Kiểm tra lại biểu mẫu khoản chi.');
      return;
    }
    const amountMinor = minorFromInput(amount, currency);
    if (!amountMinor) {
      setMessage('Số tiền không hợp lệ. Dùng số dương, không dùng dấu phẩy.');
      return;
    }
    const categoryValue = category === 'custom' ? customCategory : category;
    if (typeof categoryValue !== 'string' || !categoryValue.trim()) {
      setMessage('Chọn hoặc nhập danh mục.');
      return;
    }
    const participantIds = participants
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const now = new Date().toISOString();
    const expense: DemoExpense = editing
      ? {
          ...editing,
          description: description.trim(),
          amountMinor,
          currency,
          payerId: payer,
          groupId,
          category: categoryValue.trim(),
          participantIds,
          status: 'UPDATED',
          updatedAt: now,
        }
      : {
          id: newDemoId('expense'),
          description: description.trim(),
          amountMinor,
          currency,
          payerId: payer,
          groupId,
          category: categoryValue.trim(),
          participantIds,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        };
    persist({
      ...state,
      expenses: editing
        ? state.expenses.map((item) => (item.id === editing.id ? expense : item))
        : [expense, ...state.expenses],
    });
    setShowForm(false);
    setEditing(null);
    setMessage(editing ? 'Đã cập nhật khoản chi.' : 'Đã tạo khoản chi.');
  }
  function remove(expense: DemoExpense): void {
    if (!window.confirm(`Chuyển “${expense.description}” vào lịch sử đã xóa?`)) return;
    persist({
      ...state,
      expenses: state.expenses.map((item) =>
        item.id === expense.id
          ? { ...item, status: 'DELETED', updatedAt: new Date().toISOString() }
          : item,
      ),
    });
    setMessage('Khoản chi đã được xóa mềm và vẫn còn trong Lịch sử.');
  }
  const current = editing;
  const selectedGroup = current?.groupId || groups[0]?.id || '';
  const members = state.groups.find((group) => group.id === selectedGroup)?.members ?? [
    { id: 'demo-me', name: 'Bạn', role: 'admin' as const },
  ];
  return (
    <DemoShell kicker="KHOẢN CHI" title="Theo dõi chi tiêu chung">
      <div className="demoToolbar">
        <div>
          <label className="filterLabel">
            Lọc theo nhóm
            <select value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)}>
              <option value="all">Tất cả nhóm</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button className="textAction" onClick={() => setShowHistory((value) => !value)}>
            {showHistory ? 'Ẩn lịch sử' : 'Xem lịch sử đã xóa'}
          </button>
        </div>
        <button className="primaryBtn" onClick={openCreate}>
          ＋ Thêm khoản chi
        </button>
      </div>
      <section className="balanceHero compactBalance">
        <div>
          <p>Tổng active theo bộ lọc</p>
          <h2>Đang theo dõi</h2>
          <strong>{formatMinor(total.toString(), totalCurrency)}</strong>
          <div className="balanceMeta">
            <span>
              {visible.filter((expense) => expense.status !== 'DELETED').length} khoản chi active
            </span>
            <span>Local Demo · minor unit</span>
          </div>
        </div>
      </section>
      {showForm && (
        <section className="contentCard demoFormCard modalLike">
          <div className="cardHeading">
            <div>
              <p className="kicker">{editing ? 'SỬA KHOẢN CHI' : 'THÊM KHOẢN CHI'}</p>
              <h2>{editing ? editing.description : 'Khoản chi mới'}</h2>
            </div>
            <button
              className="textAction"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Đóng
            </button>
          </div>
          <form className="demoExpenseForm" onSubmit={saveExpense}>
            <label>
              Mô tả
              <input
                name="description"
                defaultValue={current?.description}
                placeholder="Ăn tối tại Đà Lạt"
                required
              />
            </label>
            <label>
              Số tiền
              <input
                name="amount"
                defaultValue={
                  current ? formatInputAmount(current.amountMinor, current.currency) : ''
                }
                placeholder="1000"
                required
              />
            </label>
            <label>
              Tiền tệ
              <select name="currency" defaultValue={current?.currency ?? 'VND'}>
                {currencies.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <label>
              Nhóm
              <select name="group" defaultValue={current?.groupId ?? selectedGroup}>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Người trả
              <select name="payer" defaultValue={current?.payerId ?? members[0]?.id}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thành viên
              <input
                name="participants"
                defaultValue={
                  current?.participantIds.join(', ') ??
                  members.map((member) => member.id).join(', ')
                }
                placeholder="demo-me, member-id"
                required
              />
            </label>
            <label>
              Danh mục
              <select
                name="category"
                defaultValue={
                  standardCategories.includes(current?.category ?? '')
                    ? current?.category
                    : 'custom'
                }
              >
                {standardCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
                <option value="custom">Tùy chỉnh…</option>
              </select>
            </label>
            <label>
              Danh mục tùy chỉnh
              <input
                name="customCategory"
                defaultValue={
                  standardCategories.includes(current?.category ?? '') ? '' : current?.category
                }
                placeholder="Ví dụ: Quà sinh nhật"
              />
            </label>
            <button className="primaryBtn" type="submit">
              {editing ? 'Lưu thay đổi' : 'Tạo khoản chi'}
            </button>
          </form>
        </section>
      )}
      {message && (
        <p className="demoFeedback" role="status">
          {message}
        </p>
      )}
      <section className="contentCard demoSection">
        <div className="cardHeading">
          <div>
            <p className="kicker">DANH SÁCH</p>
            <h2>{showHistory ? 'Lịch sử khoản chi' : 'Khoản chi đang hoạt động'}</h2>
          </div>
        </div>
        <div className="demoList">
          {visible.length ? (
            visible.map((expense) => (
              <article
                className={`demoRow expenseRow${expense.status === 'DELETED' ? ' isDeleted' : ''}`}
                key={expense.id}
              >
                <div>
                  <b>{expense.description}</b>
                  <p>
                    {state.groups.find((group) => group.id === expense.groupId)?.name ??
                      'Không gắn nhóm'}{' '}
                    · {expense.category} · {expense.participantIds.length} người
                  </p>
                  <span
                    className={`statusPill ${expense.status === 'DELETED' ? 'deleted' : expense.status === 'UPDATED' ? 'pending' : 'friend'}`}
                  >
                    {expense.status}
                  </span>
                </div>
                <div className="expenseValue">
                  <strong>{formatMinor(expense.amountMinor, expense.currency)}</strong>
                  {expense.status !== 'DELETED' && (
                    <div className="rowActions">
                      <button
                        className="smallAction"
                        onClick={() => {
                          setEditing(expense);
                          setShowForm(true);
                        }}
                      >
                        Sửa
                      </button>
                      <button className="smallAction" onClick={() => remove(expense)}>
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="emptyState">Chưa có khoản chi nào với bộ lọc hiện tại.</p>
          )}
        </div>
      </section>
    </DemoShell>
  );
}

function formatInputAmount(minor: string, currency: string): string {
  const digits = currency === 'VND' || currency === 'JPY' || currency === 'KRW' ? 0 : 2;
  if (digits === 0) return minor;
  const padded = minor.padStart(digits + 1, '0');
  return `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

function ApiExpensesPage() {
  const userId = currentUserId();
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [friends, setFriends] = useState<ApiFriend[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [expenses, setExpenses] = useState<ApiExpense[]>([]);
  const [totals, setTotals] = useState<ApiTotal[]>([]);
  const [filterGroup, setFilterGroup] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiExpense | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<(typeof SUPPORTED_CURRENCIES)[number]>('VND');
  const [groupId, setGroupId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [payerId, setPayerId] = useState(userId ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiJson('groups'), apiJson('friends'), apiJson('categories')])
      .then(([groupValue, friendValue, categoryValue]) => {
        if (cancelled) return;
        if (!Array.isArray(groupValue) || !groupValue.every(isApiGroup))
          throw new Error('Social trả về danh sách nhóm không hợp lệ.');
        if (!Array.isArray(friendValue) || !friendValue.every(isFriendship))
          throw new Error('Social trả về danh sách bạn bè không hợp lệ.');
        if (!Array.isArray(categoryValue) || !categoryValue.every(isApiCategory))
          throw new Error('Ledger trả về danh mục không hợp lệ.');
        setGroups(groupValue.filter((group) => group.dissolvedAt === null));
        setFriends(
          friendValue.map((friendship) => ({
            id: friendship.userA === userId ? friendship.userB : friendship.userA,
            identity: friendship.friend,
          })),
        );
        setCategories(categoryValue);
        if (categoryValue[0]) setCategoryId(categoryValue[0].id);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    if (new URLSearchParams(window.location.search).get('new') === '1') setShowForm(true);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = filterGroup === 'all' ? '' : `?groupId=${encodeURIComponent(filterGroup)}`;
    void Promise.all([apiJson(`expenses${query}`), apiJson(`expenses/total${query}`)])
      .then(([expenseValue, totalValue]) => {
        if (cancelled) return;
        if (!Array.isArray(expenseValue) || !expenseValue.every(isApiExpense))
          throw new Error('Ledger trả về danh sách khoản chi không hợp lệ.');
        if (!isApiTotals(totalValue)) throw new Error('Ledger trả về tổng khoản chi không hợp lệ.');
        setExpenses(expenseValue);
        setTotals(totalValue.totals);
        setError('');
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterGroup, refreshKey]);

  useEffect(() => {
    if (!groupId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    void apiJson(`groups/${encodeURIComponent(groupId)}/members`)
      .then((value) => {
        if (cancelled) return;
        if (!Array.isArray(value) || !value.every(isApiMember))
          throw new Error('Social trả về thành viên không hợp lệ.');
        setMembers(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const candidateIds = groupId
    ? members.map((member) => member.userId)
    : friendId
      ? [userId, friendId].filter((value): value is string => Boolean(value))
      : userId
        ? [userId]
        : [];
  const selectedIds = Object.keys(shares);
  const candidateProfiles = new Map<string, ApiHumanIdentity>([
    ...friends.flatMap((friend) =>
      friend.identity ? [[friend.id, friend.identity] as const] : [],
    ),
    ...members.flatMap((member) => (member.user ? [[member.userId, member.user] as const] : [])),
  ]);
  const candidateLabel = (candidateId: string): string =>
    candidateId === userId ? 'Bạn' : humanIdentityLabel(candidateProfiles.get(candidateId));

  function openCreate(): void {
    setEditing(null);
    setDescription('');
    setAmount('');
    setCurrency('VND');
    setGroupId('');
    setFriendId('');
    setPayerId(userId ?? '');
    setCategoryId(categories[0]?.id ?? '');
    setShares(userId ? { [userId]: '' } : {});
    setShowForm(true);
  }

  function openEdit(expense: ApiExpense): void {
    setEditing(expense);
    setDescription(expense.description);
    setAmount(formatInputMinor(expense.amountMinor, expense.currency));
    setCurrency(expense.currency as (typeof SUPPORTED_CURRENCIES)[number]);
    setGroupId(expense.groupId ?? '');
    setFriendId(expense.friendId ?? '');
    setPayerId(expense.payerId);
    setCategoryId(expense.categoryId ?? '');
    setShares(
      Object.fromEntries(
        expense.participants.map((participant) => [
          participant.userId,
          formatInputMinor(participant.shareMinor, expense.currency),
        ]),
      ),
    );
    setShowForm(true);
  }

  function toggleParticipant(participantId: string, selected: boolean): void {
    setShares((current) => {
      const next = { ...current };
      if (selected) next[participantId] = next[participantId] ?? '';
      else delete next[participantId];
      return next;
    });
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!userId) {
      setError('Không thể xác định tài khoản đang đăng nhập.');
      return;
    }
    const amountMinor = serverMinorFromInput(amount, currency);
    if (!description.trim() || !amountMinor) {
      setError('Nhập mô tả và số tiền hợp lệ. Số tiền được lưu bằng đơn vị nhỏ nhất.');
      return;
    }
    if (membersLoading) {
      setError('Đang tải thành viên nhóm. Hãy thử lại sau giây lát.');
      return;
    }
    const participants = [...selectedIds].sort().map((participantId) => {
      const shareMinor = serverMinorFromInput(shares[participantId] ?? '', currency);
      return shareMinor ? { userId: participantId, shareMinor } : undefined;
    });
    if (
      participants.length === 0 ||
      participants.some((participant) => participant === undefined)
    ) {
      setError('Chọn thành viên và nhập phần chia của từng người.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const payload = {
      description: description.trim(),
      amountMinor,
      currency,
      payerId,
      participants,
      categoryId: categoryId || null,
      groupId: groupId || null,
      friendId: groupId ? null : friendId || null,
    };
    try {
      const operation = await getMutationIdempotencyKey(
        editing ? `expense-update:${editing.id}:${editing.version}` : 'expense-create',
        payload,
      );
      if (editing) {
        await apiJson(`expenses/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH',
          headers: { 'Idempotency-Key': operation.key },
          body: JSON.stringify({ ...payload, expectedVersion: editing.version }),
        });
        setMessage('Đã cập nhật khoản chi.');
      } else {
        await apiJson('expenses', {
          method: 'POST',
          headers: { 'Idempotency-Key': operation.key },
          body: JSON.stringify(payload),
        });
        setMessage('Đã tạo khoản chi.');
      }
      operation.clear();
      setShowForm(false);
      setEditing(null);
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeExpense(expense: ApiExpense): Promise<void> {
    if (!window.confirm(`Xóa mềm khoản chi “${expense.description}”?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = { expectedVersion: expense.version };
      const operation = await getMutationIdempotencyKey(
        `expense-delete:${expense.id}:${expense.version}`,
        payload,
      );
      await apiJson(`expenses/${encodeURIComponent(expense.id)}`, {
        method: 'DELETE',
        headers: { 'Idempotency-Key': operation.key },
        body: JSON.stringify(payload),
      });
      operation.clear();
      setMessage('Đã xóa mềm khoản chi.');
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const count = totals.reduce((sum, total) => sum + total.count, 0);
  return (
    <DemoShell kicker="KHOẢN CHI" title="Theo dõi chi tiêu chung">
      <div className="demoToolbar">
        <div>
          <label className="filterLabel">
            Lọc theo nhóm
            <select value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)}>
              <option value="all">Tất cả nhóm</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primaryBtn" onClick={openCreate}>
          ＋ Thêm khoản chi
        </button>
      </div>
      <section className="balanceHero compactBalance">
        <div>
          <p>Tổng active theo bộ lọc</p>
          <h2>Đang theo dõi</h2>
          {loading ? (
            <strong>Đang tải…</strong>
          ) : (
            <strong>
              {totals.length
                ? totals
                    .map((total) => formatServerMinor(total.totalMinor, total.currency))
                    .join(' · ')
                : '0'}
            </strong>
          )}
          <div className="balanceMeta">
            <span>{count} khoản chi active</span>
            <span>Ledger · minor unit</span>
          </div>
        </div>
      </section>
      {showForm && (
        <section className="contentCard demoFormCard modalLike">
          <div className="cardHeading">
            <div>
              <p className="kicker">{editing ? 'SỬA KHOẢN CHI' : 'THÊM KHOẢN CHI'}</p>
              <h2>{editing ? editing.description : 'Khoản chi mới'}</h2>
            </div>
            <button
              className="textAction"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Đóng
            </button>
          </div>
          <form className="demoExpenseForm" onSubmit={(event) => void saveExpense(event)}>
            <label>
              Mô tả
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={200}
                required
              />
            </label>
            <label>
              Số tiền
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="1000.00"
                required
              />
            </label>
            <label>
              Tiền tệ
              <select
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as (typeof SUPPORTED_CURRENCIES)[number])
                }
              >
                {SUPPORTED_CURRENCIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nhóm
              <select
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value);
                  setFriendId('');
                  setShares({});
                }}
              >
                <option value="">Không gắn nhóm</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {!groupId && (
              <label>
                Bạn bè liên quan
                <select
                  value={friendId}
                  onChange={(event) => {
                    setFriendId(event.target.value);
                    setShares(
                      userId
                        ? {
                            [userId]: '',
                            ...(event.target.value ? { [event.target.value]: '' } : {}),
                          }
                        : {},
                    );
                  }}
                >
                  <option value="">Không gắn bạn</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {humanIdentityLabel(friend.identity)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Người trả
              <select value={payerId} onChange={(event) => setPayerId(event.target.value)}>
                {candidateIds.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidateLabel(candidate)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Danh mục
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Không phân loại</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="participantShares">
              <legend>Người tham gia và phần chia</legend>
              {membersLoading ? (
                <p className="emptyState">Đang tải thành viên nhóm…</p>
              ) : (
                candidateIds.map((candidate) => (
                  <div className="participantShareRow" key={candidate}>
                    <label className="participantCheck">
                      <input
                        type="checkbox"
                        checked={shares[candidate] !== undefined}
                        onChange={(event) => toggleParticipant(candidate, event.target.checked)}
                      />
                      {candidateLabel(candidate)}
                    </label>
                    {shares[candidate] !== undefined && (
                      <input
                        aria-label={`Phần chia của ${candidate}`}
                        inputMode="decimal"
                        placeholder="Phần chia"
                        value={shares[candidate]}
                        onChange={(event) =>
                          setShares((current) => ({ ...current, [candidate]: event.target.value }))
                        }
                      />
                    )}
                  </div>
                ))
              )}
            </fieldset>
            <p className="formHint">
              Nhập phần chia cho từng người; Ledger kiểm tra tổng và phiên bản khi lưu.
            </p>
            <button className="primaryBtn" type="submit" disabled={busy || membersLoading}>
              {editing ? 'Lưu thay đổi' : 'Tạo khoản chi'}
            </button>
          </form>
        </section>
      )}
      {error && (
        <p className="formMessage" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="demoFeedback" role="status">
          {message}
        </p>
      )}
      <section className="contentCard demoSection">
        <div className="cardHeading">
          <div>
            <p className="kicker">DANH SÁCH</p>
            <h2>Khoản chi đang hoạt động</h2>
          </div>
        </div>
        <div className="demoList">
          {loading ? (
            <p className="emptyState">Đang tải khoản chi…</p>
          ) : expenses.length ? (
            expenses.map((expense) => (
              <article className="demoRow expenseRow" key={expense.id}>
                <div>
                  <b>{expense.description || 'Khoản chi'}</b>
                  <p>
                    {expense.groupId ? (groupNames.get(expense.groupId) ?? 'Nhóm') : 'Cá nhân'} ·{' '}
                    {expense.categoryId
                      ? (categoryNames.get(expense.categoryId) ?? expense.categoryId)
                      : 'Không phân loại'}{' '}
                    · {expense.participants.length} người
                  </p>
                  <span
                    className={`statusPill ${expense.state === 'UPDATED' ? 'pending' : 'friend'}`}
                  >
                    {expense.state}
                  </span>
                </div>
                <div className="expenseValue">
                  <strong>{formatServerMinor(expense.amountMinor, expense.currency)}</strong>
                  <div className="rowActions">
                    <button
                      className="smallAction"
                      disabled={busy}
                      onClick={() => openEdit(expense)}
                    >
                      Sửa
                    </button>
                    <button
                      className="smallAction"
                      disabled={busy}
                      onClick={() => void removeExpense(expense)}
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="emptyState">Chưa có khoản chi nào với bộ lọc hiện tại.</p>
          )}
        </div>
      </section>
    </DemoShell>
  );
}

function isApiGroup(value: unknown): value is ApiGroup {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    (value.dissolvedAt === null || typeof value.dissolvedAt === 'string')
  );
}

function isFriendship(value: unknown): value is ApiFriendship {
  return (
    isRecord(value) &&
    typeof value.userA === 'string' &&
    typeof value.userB === 'string' &&
    (value.friend === undefined || isApiHumanIdentity(value.friend))
  );
}

function isApiMember(value: unknown): value is ApiMember {
  return (
    isRecord(value) &&
    typeof value.userId === 'string' &&
    (value.role === 'admin' || value.role === 'member') &&
    (value.user === undefined || isApiHumanIdentity(value.user))
  );
}

function isApiHumanIdentity(value: unknown): value is ApiHumanIdentity {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.displayName === undefined || typeof value.displayName === 'string') &&
    (value.email === undefined || typeof value.email === 'string') &&
    (value.username === undefined || typeof value.username === 'string')
  );
}

function isApiCategory(value: unknown): value is ApiCategory {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.standard === 'boolean'
  );
}

function isApiExpense(value: unknown): value is ApiExpense {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.description === 'string' &&
    typeof value.amountMinor === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.payerId === 'string' &&
    Array.isArray(value.participants) &&
    value.participants.every(
      (participant) =>
        isRecord(participant) &&
        typeof participant.userId === 'string' &&
        typeof participant.shareMinor === 'string',
    ) &&
    (value.categoryId === null || typeof value.categoryId === 'string') &&
    (value.friendId === null || typeof value.friendId === 'string') &&
    (value.groupId === null || typeof value.groupId === 'string') &&
    (value.state === 'ACTIVE' || value.state === 'UPDATED' || value.state === 'DELETED') &&
    typeof value.version === 'number'
  );
}

function isApiTotals(value: unknown): value is { totals: ApiTotal[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.totals) &&
    value.totals.every(
      (total) =>
        isRecord(total) &&
        typeof total.currency === 'string' &&
        typeof total.totalMinor === 'string' &&
        typeof total.count === 'number',
    )
  );
}

function formatInputMinor(value: string, currency: string): string {
  const digits = minorDigits(currency);
  if (digits === 0) return value;
  const padded = value.padStart(digits + 1, '0');
  return `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

function errorText(value: unknown): string {
  return value instanceof ApiClientError || value instanceof Error
    ? value.message
    : 'Không thể tải khoản chi.';
}
