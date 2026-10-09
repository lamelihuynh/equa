'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiClientError,
  apiJson,
  isLocalDemoSession,
  isRecord,
  logoutSession,
} from '../api-client';
import { activeExpenses, loadDemoState, subscribeDemo } from '../demo-store';
import { formatMinor } from '../money';

interface DashboardProfile {
  displayName: string;
  defaultCurrency: string;
  locale: string;
  timezone: string;
}

interface DashboardGroup {
  id: string;
  name: string;
  type: string;
  dissolvedAt: string | null;
}

interface DashboardExpense {
  id: string;
  description: string;
  amountMinor: string;
  currency: string;
  categoryId: string | null;
  groupId: string | null;
  createdAt: string;
  state: string;
}

interface DashboardTotal {
  currency: string;
  totalMinor: string;
  count: number;
}

function Mark() {
  return (
    <span className="equaMark smallMark" aria-hidden="true">
      <svg viewBox="0 0 42 42">
        <path d="M9 17.5h24" />
        <path d="M9 24.5h24" />
        <path d="M12 12c4.8-4.6 13.2-4.6 18 0" />
        <path d="M12 30c4.8 4.6 13.2 4.6 18 0" />
      </svg>
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'loading' | 'demo' | 'api'>('loading');
  useEffect(() => {
    if (!sessionStorage.getItem('equa_access_token')) {
      router.replace('/');
      return;
    }
    setMode(isLocalDemoSession() ? 'demo' : 'api');
    const expire = (): void => router.replace('/?expired=1');
    window.addEventListener('equa-session-expired', expire);
    return () => window.removeEventListener('equa-session-expired', expire);
  }, [router]);

  if (mode === 'demo') return <LocalDashboard />;
  if (mode === 'api') return <ServerDashboard />;
  return (
    <main className="workspace">
      <section className="contentCard demoContent" role="status">
        Đang khởi động dịch vụ và tải tổng quan…
      </section>
    </main>
  );
}

function LocalDashboard() {
  const [groups, setGroups] = useState<DashboardGroup[]>([]);
  const [expenses, setExpenses] = useState<DashboardExpense[]>([]);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const refresh = (): void => {
      const state = loadDemoState();
      setGroups(
        state.groups
          .filter((group) => !group.dissolved)
          .map((group) => ({
            id: group.id,
            name: group.name,
            type: group.type,
            dissolvedAt: null,
          })),
      );
      setExpenses(
        activeExpenses(state).map((expense) => ({
          id: expense.id,
          description: expense.description,
          amountMinor: expense.amountMinor,
          currency: expense.currency,
          categoryId: expense.category,
          groupId: expense.groupId || null,
          createdAt: expense.createdAt,
          state: expense.status,
        })),
      );
    };
    setEmail(sessionStorage.getItem('equa_user_email') ?? '');
    refresh();
    return subscribeDemo(refresh);
  }, []);

  return (
    <DashboardView
      titleName={email.split('@')[0] ?? ''}
      groups={groups}
      expenses={expenses}
      totals={sumByCurrency(expenses)}
      demo
    />
  );
}

function ServerDashboard() {
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [groups, setGroups] = useState<DashboardGroup[]>([]);
  const [expenses, setExpenses] = useState<DashboardExpense[]>([]);
  const [totals, setTotals] = useState<DashboardTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      apiJson('profile/me'),
      apiJson('groups'),
      apiJson('expenses'),
      apiJson('expenses/total'),
    ])
      .then(([profileValue, groupValue, expenseValue, totalValue]) => {
        if (cancelled) return;
        if (!isProfile(profileValue)) throw new Error('Identity trả về hồ sơ không hợp lệ.');
        if (!Array.isArray(groupValue) || !groupValue.every(isGroup))
          throw new Error('Social trả về danh sách nhóm không hợp lệ.');
        if (!Array.isArray(expenseValue) || !expenseValue.every(isExpense))
          throw new Error('Ledger trả về danh sách khoản chi không hợp lệ.');
        if (!isTotal(totalValue)) throw new Error('Ledger trả về tổng khoản chi không hợp lệ.');
        setProfile(profileValue);
        setGroups(groupValue.filter((group) => group.dissolvedAt === null));
        setExpenses(expenseValue.filter((expense) => expense.state !== 'DELETED'));
        setTotals(totalValue.totals);
        setError('');
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof ApiClientError || reason instanceof Error
              ? reason.message
              : 'Không thể tải tổng quan.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <DashboardView
      titleName={profile?.displayName ?? ''}
      groups={groups}
      expenses={expenses}
      totals={
        totals.length
          ? totals
          : [{ currency: profile?.defaultCurrency ?? 'VND', totalMinor: '0', count: 0 }]
      }
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((value) => value + 1)}
    />
  );
}

function DashboardView({
  titleName,
  groups,
  expenses,
  totals,
  demo = false,
  loading = false,
  error,
  onRetry,
}: {
  titleName: string;
  groups: DashboardGroup[];
  expenses: DashboardExpense[];
  totals: DashboardTotal[];
  demo?: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const orderedExpenses = [...expenses].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const primaryTotal = totals[0];
  function logout(): void {
    void logoutSession().finally(() => router.replace('/'));
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <Mark />
          <b>equa</b>
        </div>
        <nav className="sideNav" aria-label="Điều hướng chính">
          <button className="active">
            <span>⌂</span>Tổng quan
          </button>
          <button onClick={() => router.push('/groups')}>
            <span>◫</span>Nhóm
          </button>
          <button onClick={() => router.push('/friends')}>
            <span>◌</span>Bạn bè
          </button>
          <button onClick={() => router.push('/expenses')}>
            <span>↗</span>Khoản chi
          </button>
        </nav>
        <div className="sidebarBottom">
          <button onClick={() => router.push('/profile')}>
            <span>⚙</span>Hồ sơ & cài đặt
          </button>
          <button onClick={logout}>
            <span>↪</span>Đăng xuất
          </button>
        </div>
      </aside>
      <section className="dashboardContent">
        <header className="dashboardHeader">
          <div>
            <p className="kicker">TỔNG QUAN HÔM NAY</p>
            <h1>Chào bạn{titleName ? `, ${titleName}` : ''}.</h1>
          </div>
          <div className="headerActions">
            {demo && <span className="demoModeBadge">Local Demo · browser storage</span>}
            <button
              className="avatarButton"
              aria-label="Hồ sơ"
              onClick={() => router.push('/profile')}
            >
              EQ
            </button>
          </div>
        </header>
        <section className="balanceHero">
          <div>
            <p>{groups.length} nhóm đang hoạt động</p>
            <h2>Tổng khoản chi active</h2>
            {loading ? (
              <strong>Đang khởi động dịch vụ…</strong>
            ) : (
              <strong>
                {primaryTotal ? formatMinor(primaryTotal.totalMinor, primaryTotal.currency) : '0'}
              </strong>
            )}
            <div className="balanceMeta">
              <span>{expenses.length} khoản chi</span>
              {totals.length > 1 && <span>{totals.length} loại tiền tệ</span>}
            </div>
            {totals.length > 1 && (
              <div className="balanceMeta">
                {totals.map((total) => (
                  <span key={total.currency}>{formatMinor(total.totalMinor, total.currency)}</span>
                ))}
              </div>
            )}
          </div>
          <div className="heroArt" aria-hidden="true">
            <span className="coin">¤</span>
            <span className="paperSlip">
              Equa
              <br />
              <b>Chi tiêu chung</b>
            </span>
            <i />
            <i />
          </div>
        </section>
        <section className="quickActions">
          <button className="addExpense" onClick={() => router.push('/expenses?new=1')}>
            <span>＋</span>Thêm khoản chi
          </button>
          <button onClick={() => router.push('/groups?new=1')}>
            <span>♜</span>Tạo nhóm
          </button>
          <button onClick={() => router.push('/friends')}>
            <span>◌</span>Bạn bè
          </button>
        </section>
        {error && (
          <p className="formMessage" role="alert">
            {error}{' '}
            {onRetry && (
              <button className="textAction" onClick={onRetry}>
                Thử lại
              </button>
            )}
          </p>
        )}
        <div className="dashboardGrid">
          <section className="contentCard recentCard">
            <div className="cardHeading">
              <div>
                <p className="kicker">CẬP NHẬT GẦN ĐÂY</p>
                <h2>Khoản chi mới</h2>
              </div>
              <button className="textAction" onClick={() => router.push('/expenses')}>
                Xem tất cả
              </button>
            </div>
            <div className="activityList">
              {loading ? (
                <p className="emptyState">Đang khởi động dịch vụ và tải khoản chi…</p>
              ) : orderedExpenses.length ? (
                orderedExpenses.slice(0, 3).map((expense) => (
                  <article className="activityRow" key={expense.id}>
                    <span className="activityIcon">▣</span>
                    <div>
                      <b>{expense.description || 'Khoản chi'}</b>
                      <p>{expense.categoryId ?? 'Chưa phân loại'}</p>
                    </div>
                    <strong className="negative">
                      {formatMinor(expense.amountMinor, expense.currency)}
                    </strong>
                  </article>
                ))
              ) : (
                <p className="emptyState">Chưa có khoản chi. Tạo khoản chi đầu tiên để bắt đầu.</p>
              )}
            </div>
          </section>
          <section className="contentCard groupCard">
            <div className="cardHeading">
              <div>
                <p className="kicker">NHÓM CỦA BẠN</p>
                <h2>Đang theo dõi</h2>
              </div>
              <button className="textAction" onClick={() => router.push('/groups')}>
                Tất cả nhóm
              </button>
            </div>
            <div className="groupList">
              {groups.slice(0, 4).map((group) => (
                <button
                  className="groupRow"
                  key={group.id}
                  onClick={() => router.push(`/groups/${group.id}`)}
                >
                  <span className="groupAvatar">{group.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <b>{group.name}</b>
                    <p>{group.type}</p>
                  </div>
                  <strong className="positive">Mở</strong>
                </button>
              ))}
              {!loading && groups.length === 0 && (
                <p className="emptyState">Chưa có nhóm đang hoạt động.</p>
              )}
            </div>
            <button className="outlineButton" onClick={() => router.push('/groups?new=1')}>
              ＋ Tạo nhóm mới
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}

function isProfile(value: unknown): value is DashboardProfile {
  return (
    isRecord(value) &&
    typeof value.displayName === 'string' &&
    typeof value.defaultCurrency === 'string' &&
    typeof value.locale === 'string' &&
    typeof value.timezone === 'string'
  );
}

function isGroup(value: unknown): value is DashboardGroup {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    (value.dissolvedAt === null || typeof value.dissolvedAt === 'string')
  );
}

function isExpense(value: unknown): value is DashboardExpense {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.description === 'string' &&
    typeof value.amountMinor === 'string' &&
    typeof value.currency === 'string' &&
    (value.categoryId === null || typeof value.categoryId === 'string') &&
    (value.groupId === null || typeof value.groupId === 'string') &&
    typeof value.createdAt === 'string' &&
    typeof value.state === 'string'
  );
}

function isTotal(value: unknown): value is { totals: DashboardTotal[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.totals) &&
    value.totals.every(
      (item) =>
        isRecord(item) &&
        typeof item.currency === 'string' &&
        typeof item.totalMinor === 'string' &&
        typeof item.count === 'number',
    )
  );
}

function sumByCurrency(expenses: DashboardExpense[]): DashboardTotal[] {
  const totals = new Map<string, { total: bigint; count: number }>();
  for (const expense of expenses) {
    const current = totals.get(expense.currency) ?? { total: 0n, count: 0 };
    current.total += BigInt(expense.amountMinor);
    current.count += 1;
    totals.set(expense.currency, current);
  }
  return [...totals.entries()].map(([currency, value]) => ({
    currency,
    totalMinor: value.total.toString(),
    count: value.count,
  }));
}
