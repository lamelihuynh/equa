'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiClientError,
  apiJson,
  currentUserId,
  isLocalDemoSession,
  isRecord,
} from '../api-client';
import { DemoShell } from '../components/demo-shell';
import { humanIdentityLabel, humanIdentitySecondaryLabel } from '../identity-label';
import { formatMinor } from '../money';
import {
  FRIEND_EMAIL_VALIDATION_ERROR,
  FRIEND_LOOKUP_HELP_TEXT,
  isValidFriendEmailAddress,
} from './lookup-copy';
import {
  loadDemoState,
  newDemoId,
  saveDemoState,
  subscribeDemo,
  type DemoState,
} from '../demo-store';

interface FriendRequestDto {
  id: string;
  requesterId: string;
  targetUserId?: string;
  targetIdentifier: string;
  targetEmail?: string;
  requester?: HumanIdentityDto;
  target?: HumanIdentityDto;
  status: 'pending' | 'accepted' | 'rejected';
}

interface FriendshipDto {
  userA: string;
  userB: string;
  createdAt: string;
  friend?: HumanIdentityDto;
}

interface HumanIdentityDto {
  id?: string;
  displayName?: string;
  email?: string;
}

interface PairBalanceDto {
  balances: Array<{ currency: string; netMinor: string }>;
  hasOutstandingDebt: boolean;
}

export default function FriendsPage() {
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
  if (mode === 'demo') return <LocalFriendsPage />;
  if (mode === 'api') return <ApiFriendsPage />;
  return (
    <main className="workspace">
      <section className="contentCard demoContent" role="status">
        Loading friends…
      </section>
    </main>
  );
}

function LocalFriendsPage() {
  const [state, setState] = useState<DemoState>(() => loadDemoState());
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => subscribeDemo(() => setState(loadDemoState())), []);
  const persist = (next: DemoState): void => {
    setState(next);
    saveDemoState(next);
  };

  function sendRequest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = identifier.trim();
    if (!isValidFriendEmailAddress(value)) {
      setMessage(FRIEND_EMAIL_VALIDATION_ERROR);
      return;
    }
    if (state.friends.some((friend) => friend.identifier.toLowerCase() === value.toLowerCase())) {
      setMessage('Lời mời hoặc quan hệ bạn bè này đã tồn tại.');
      return;
    }
    persist({
      ...state,
      friends: [
        ...state.friends,
        {
          id: newDemoId('friend'),
          name: value.includes('@') ? (value.split('@')[0] ?? value) : value,
          identifier: value,
          status: 'PENDING',
          incoming: false,
        },
      ],
    });
    setIdentifier('');
    setMessage('Đã gửi lời mời kết bạn.');
  }

  function accept(id: string): void {
    persist({
      ...state,
      friends: state.friends.map((friend) =>
        friend.id === id ? { ...friend, status: 'FRIEND', incoming: false } : friend,
      ),
    });
    setMessage('Đã chấp nhận lời mời.');
  }

  function remove(id: string, name: string): void {
    if (!window.confirm(`Xóa ${name} khỏi danh sách bạn bè?`)) return;
    persist({ ...state, friends: state.friends.filter((friend) => friend.id !== id) });
    setMessage('Đã xóa bạn khỏi demo local.');
  }

  const pending = state.friends.filter((friend) => friend.status === 'PENDING');
  const friends = state.friends.filter((friend) => friend.status === 'FRIEND');
  return (
    <DemoShell kicker="BẠN BÈ" title="Chia sẻ cùng người quen">
      <div className="demoGrid twoColumns">
        <section className="contentCard demoFormCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">THÊM BẠN</p>
              <h2>Gửi lời mời</h2>
            </div>
          </div>
          <form className="formStack compactForm" onSubmit={sendRequest}>
            <label>
              Email
              <input
                type="email"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="minh.anh@example.com"
                required
                autoComplete="email"
                aria-describedby="friend-lookup-help"
              />
            </label>
            <p id="friend-lookup-help" className="fieldHint">
              {FRIEND_LOOKUP_HELP_TEXT}
            </p>
            <button className="primaryBtn" type="submit">
              Gửi lời mời
            </button>
          </form>
          {message && (
            <p className="demoFeedback" role="status">
              {message}
            </p>
          )}
        </section>
        <section className="contentCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">ĐANG CHỜ</p>
              <h2>Lời mời</h2>
            </div>
            <b>{pending.length}</b>
          </div>
          <div className="demoList">
            {pending.length ? (
              pending.map((friend) => (
                <article className="demoRow" key={friend.id}>
                  <div>
                    <b>{friend.name}</b>
                    <p>{friend.identifier}</p>
                    <span className="statusPill pending">PENDING</span>
                  </div>
                  <div className="rowActions">
                    {friend.incoming && (
                      <button
                        className="smallAction primarySmall"
                        onClick={() => accept(friend.id)}
                      >
                        Chấp nhận
                      </button>
                    )}
                    <button className="smallAction" onClick={() => remove(friend.id, friend.name)}>
                      Xóa
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="emptyState">Không có lời mời đang chờ.</p>
            )}
          </div>
        </section>
      </div>
      <section className="contentCard demoSection">
        <div className="cardHeading">
          <div>
            <p className="kicker">DANH SÁCH</p>
            <h2>Bạn bè</h2>
          </div>
          <b>{friends.length}</b>
        </div>
        <div className="demoList">
          {friends.length ? (
            friends.map((friend) => (
              <article className="demoRow" key={friend.id}>
                <div>
                  <b>{friend.name}</b>
                  <p>{friend.identifier}</p>
                  <span className="statusPill friend">FRIEND</span>
                </div>
                <button className="smallAction" onClick={() => remove(friend.id, friend.name)}>
                  Xóa bạn
                </button>
              </article>
            ))
          ) : (
            <p className="emptyState">Hãy chấp nhận lời mời để bắt đầu theo dõi chi tiêu chung.</p>
          )}
        </div>
      </section>
    </DemoShell>
  );
}

function ApiFriendsPage() {
  const [identifier, setIdentifier] = useState('');
  const [requests, setRequests] = useState<FriendRequestDto[]>([]);
  const [friendships, setFriendships] = useState<FriendshipDto[]>([]);
  const [balances, setBalances] = useState<Record<string, PairBalanceDto | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const userId = currentUserId();

  async function reload(): Promise<void> {
    const [requestValue, friendshipValue] = await Promise.all([
      apiJson('friends/requests'),
      apiJson('friends'),
    ]);
    if (!Array.isArray(requestValue) || !requestValue.every(isFriendRequest))
      throw new Error('Identity trả về danh sách lời mời không hợp lệ.');
    if (!Array.isArray(friendshipValue) || !friendshipValue.every(isFriendship))
      throw new Error('Social trả về danh sách bạn bè không hợp lệ.');
    const friendIds = friendshipValue.map((friendship) =>
      friendship.userA === userId ? friendship.userB : friendship.userA,
    );
    const balanceEntries = await Promise.all(
      friendIds.map(async (friendId) => {
        try {
          const value: unknown = await apiJson(`friends/${encodeURIComponent(friendId)}/balance`);
          return [friendId, isPairBalance(value) ? value : null] as const;
        } catch {
          return [friendId, null] as const;
        }
      }),
    );
    setRequests(requestValue);
    setFriendships(friendshipValue);
    setBalances(Object.fromEntries(balanceEntries));
  }

  useEffect(() => {
    let cancelled = false;
    void reload()
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await reload();
      setMessage(success);
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function sendRequest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = identifier.trim();
    if (!isValidFriendEmailAddress(value)) {
      setError(FRIEND_EMAIL_VALIDATION_ERROR);
      return;
    }
    void runAction(
      () =>
        apiJson('friends/requests', {
          method: 'POST',
          body: JSON.stringify({ identifier: value }),
        }),
      'Đã gửi lời mời kết bạn.',
    ).then((succeeded) => {
      if (succeeded) setIdentifier('');
    });
  }

  const pending = requests.filter((request) => request.status === 'pending');
  const incoming = pending.filter((request) => request.targetUserId === userId);
  const outgoing = pending.filter((request) => request.requesterId === userId);
  const friends = friendships.map((friendship) => ({
    id: friendship.userA === userId ? friendship.userB : friendship.userA,
    identity: friendship.friend,
  }));

  return (
    <DemoShell kicker="BẠN BÈ" title="Chia sẻ cùng người quen">
      <div className="demoGrid twoColumns">
        <section className="contentCard demoFormCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">THÊM BẠN</p>
              <h2>Gửi lời mời</h2>
            </div>
          </div>
          <form className="formStack compactForm" onSubmit={sendRequest}>
            <label>
              Email
              <input
                type="email"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="minh.anh@example.com"
                required
                autoComplete="email"
                aria-describedby="friend-lookup-help"
              />
            </label>
            <p id="friend-lookup-help" className="fieldHint">
              {FRIEND_LOOKUP_HELP_TEXT}
            </p>
            <button className="primaryBtn" type="submit" disabled={busy}>
              Gửi lời mời
            </button>
          </form>
        </section>
        <section className="contentCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">ĐANG CHỜ</p>
              <h2>Lời mời nhận được</h2>
            </div>
            <b>{incoming.length}</b>
          </div>
          <div className="demoList">
            {loading ? (
              <p className="emptyState">Đang khởi động dịch vụ và tải lời mời…</p>
            ) : incoming.length ? (
              incoming.map((request) => (
                <article className="demoRow" key={request.id}>
                  <div>
                    <b>{humanIdentityLabel(request.requester)}</b>
                    <p>
                      {humanIdentitySecondaryLabel(
                        request.requester,
                        humanIdentityLabel(request.requester),
                      ) ?? 'Lời mời kết bạn trên Equa'}
                    </p>
                    <span className="statusPill pending">PENDING</span>
                  </div>
                  <div className="rowActions">
                    <button
                      className="smallAction primarySmall"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            apiJson(`friends/requests/${encodeURIComponent(request.id)}/accept`, {
                              method: 'POST',
                            }),
                          'Đã chấp nhận lời mời.',
                        )
                      }
                    >
                      Chấp nhận
                    </button>
                    <button
                      className="smallAction"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            apiJson(`friends/requests/${encodeURIComponent(request.id)}/reject`, {
                              method: 'POST',
                            }),
                          'Đã từ chối lời mời.',
                        )
                      }
                    >
                      Từ chối
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="emptyState">Không có lời mời đang chờ.</p>
            )}
          </div>
          {outgoing.map((request) => (
            <p className="demoFeedback" role="status" key={request.id}>
              Đang chờ phản hồi từ{' '}
              {humanIdentityLabel(request.target, request.targetEmail ?? request.targetIdentifier)}.
            </p>
          ))}
        </section>
      </div>
      {error && (
        <p className="formMessage" role="alert">
          {error}
          <button className="textAction" type="button" onClick={() => window.location.reload()}>
            Thử lại
          </button>
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
            <h2>Bạn bè</h2>
          </div>
          <b>{friends.length}</b>
        </div>
        <div className="demoList">
          {loading ? (
            <p className="emptyState">Đang khởi động dịch vụ và tải bạn bè…</p>
          ) : friends.length ? (
            friends.map((friend) => {
              const label = humanIdentityLabel(friend.identity);
              return (
                <article className="demoRow" key={friend.id}>
                  <div>
                    <b>{label}</b>
                    <p>
                      {humanIdentitySecondaryLabel(friend.identity, label) ??
                        formatPairBalance(balances[friend.id])}
                    </p>
                    {humanIdentitySecondaryLabel(friend.identity, label) && (
                      <p>{formatPairBalance(balances[friend.id])}</p>
                    )}
                    <span className="statusPill friend">FRIEND</span>
                  </div>
                  <button
                    className="smallAction"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Xóa ${label} khỏi danh sách bạn bè?`)) return;
                      void runAction(
                        () =>
                          apiJson(`friends/${encodeURIComponent(friend.id)}`, { method: 'DELETE' }),
                        'Đã xóa bạn khỏi danh sách.',
                      );
                    }}
                  >
                    Xóa bạn
                  </button>
                </article>
              );
            })
          ) : (
            <p className="emptyState">Hãy gửi hoặc chấp nhận lời mời để bắt đầu theo dõi.</p>
          )}
        </div>
      </section>
    </DemoShell>
  );
}

function isFriendRequest(value: unknown): value is FriendRequestDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.requesterId === 'string' &&
    typeof value.targetIdentifier === 'string' &&
    (value.targetEmail === undefined || typeof value.targetEmail === 'string') &&
    (value.requester === undefined || isHumanIdentity(value.requester)) &&
    (value.target === undefined || isHumanIdentity(value.target)) &&
    (value.targetUserId === undefined || typeof value.targetUserId === 'string') &&
    (value.status === 'pending' || value.status === 'accepted' || value.status === 'rejected')
  );
}

function isFriendship(value: unknown): value is FriendshipDto {
  return (
    isRecord(value) &&
    typeof value.userA === 'string' &&
    typeof value.userB === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.friend === undefined || isHumanIdentity(value.friend))
  );
}

function isHumanIdentity(value: unknown): value is HumanIdentityDto {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.displayName === undefined || typeof value.displayName === 'string') &&
    (value.email === undefined || typeof value.email === 'string')
  );
}

function isPairBalance(value: unknown): value is PairBalanceDto {
  return (
    isRecord(value) &&
    typeof value.hasOutstandingDebt === 'boolean' &&
    Array.isArray(value.balances) &&
    value.balances.every(
      (balance) =>
        isRecord(balance) &&
        typeof balance.currency === 'string' &&
        typeof balance.netMinor === 'string' &&
        /^-?\d+$/.test(balance.netMinor),
    )
  );
}

function formatPairBalance(balance: PairBalanceDto | null | undefined): string {
  if (balance === undefined) return 'Đang khởi động dịch vụ và tải số dư…';
  if (balance === null) return 'Không thể tải số dư từ Ledger.';
  if (!balance.balances.length) return 'Đã cân bằng';
  return balance.balances
    .map((item) => {
      const netMinor = BigInt(item.netMinor);
      if (netMinor === 0n) return `Đã cân bằng · ${item.currency}`;
      const direction = netMinor > 0n ? 'Họ nợ bạn' : 'Bạn nợ họ';
      const amount = formatMinor((netMinor > 0n ? netMinor : -netMinor).toString(), item.currency);
      return `${direction} ${amount}`;
    })
    .join(' · ');
}

function errorText(value: unknown): string {
  return value instanceof ApiClientError || value instanceof Error
    ? value.message
    : 'Không thể tải dữ liệu bạn bè.';
}
