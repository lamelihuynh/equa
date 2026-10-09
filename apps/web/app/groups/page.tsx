'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiClientError, apiJson, isLocalDemoSession, isRecord } from '../api-client';
import { DemoShell } from '../components/demo-shell';
import { humanIdentityLabel, humanIdentitySecondaryLabel } from '../identity-label';
import {
  loadDemoState,
  newDemoId,
  saveDemoState,
  subscribeDemo,
  type DemoState,
  type GroupType,
} from '../demo-store';

const groupTypes: Array<{ value: GroupType; label: string }> = [
  { value: 'trip', label: 'Chuyến đi' },
  { value: 'household', label: 'Nhà ở chung' },
  { value: 'event', label: 'Sự kiện' },
  { value: 'other', label: 'Khác' },
];

interface GroupDto {
  id: string;
  name: string;
  type: GroupType;
  dissolvedAt: string | null;
  updatedAt: string;
}

interface HumanIdentityDto {
  id?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

interface GroupInvitationDto {
  id: string;
  createdAt: string;
  group: { id: string; name: string; type: GroupType };
  inviter: HumanIdentityDto;
}

export default function GroupsPage() {
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
  if (mode === 'demo') return <LocalGroupsPage />;
  if (mode === 'api') return <ApiGroupsPage />;
  return (
    <main className="workspace">
      <section className="contentCard demoContent" role="status">
        Loading groups…
      </section>
    </main>
  );
}

function LocalGroupsPage() {
  const router = useRouter();
  const [state, setState] = useState<DemoState>(() => loadDemoState());
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('trip');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setShowForm(true);
    return subscribeDemo(() => setState(loadDemoState()));
  }, []);
  const persist = (next: DemoState): void => {
    setState(next);
    saveDemoState(next);
  };
  function create(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!name.trim()) {
      setMessage('Tên nhóm là bắt buộc.');
      return;
    }
    const group = {
      id: newDemoId('group'),
      name: name.trim(),
      type,
      image: name.trim().slice(0, 2).toUpperCase(),
      members: [{ id: 'demo-me', name: 'Bạn', role: 'admin' as const }],
      dissolved: false,
    };
    persist({ ...state, groups: [...state.groups, group] });
    setName('');
    setShowForm(false);
    setMessage('Đã tạo nhóm. Bạn là Admin của nhóm này.');
    router.push(`/groups/${group.id}`);
  }
  const active = state.groups.filter((group) => !group.dissolved);
  return (
    <DemoShell kicker="NHÓM" title="Không gian chi tiêu chung">
      <div className="demoToolbar">
        <p>{active.length} nhóm đang hoạt động trong Local Demo.</p>
        <button className="primaryBtn" onClick={() => setShowForm((value) => !value)}>
          ＋ Tạo nhóm
        </button>
      </div>
      {showForm && (
        <section className="contentCard demoFormCard">
          <form className="demoInlineForm" onSubmit={create}>
            <label>
              Tên nhóm
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Chuyến đi Đà Lạt"
                autoFocus
              />
            </label>
            <label>
              Loại nhóm
              <select value={type} onChange={(event) => setType(event.target.value as GroupType)}>
                {groupTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primaryBtn" type="submit">
              Lưu nhóm
            </button>
          </form>
        </section>
      )}
      {message && (
        <p className="demoFeedback" role="status">
          {message}
        </p>
      )}
      <section className="demoCardGrid">
        {state.groups.map((group) => (
          <article
            className={`contentCard demoGroupCard${group.dissolved ? ' isDeleted' : ''}`}
            key={group.id}
          >
            <span className="groupAvatar largeAvatar">{group.image}</span>
            <p className="kicker">{groupTypes.find((item) => item.value === group.type)?.label}</p>
            <h2>{group.name}</h2>
            <p>
              {group.members.length} thành viên ·{' '}
              {group.members.filter((member) => member.role === 'admin').length} Admin
            </p>
            <span className={`statusPill ${group.dissolved ? 'deleted' : 'friend'}`}>
              {group.dissolved ? 'ĐÃ GIẢI TÁN' : 'ĐANG HOẠT ĐỘNG'}
            </span>
            <button className="outlineButton" onClick={() => router.push(`/groups/${group.id}`)}>
              Mở nhóm
            </button>
          </article>
        ))}
      </section>
    </DemoShell>
  );
}

function ApiGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitationDto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [type, setType] = useState<GroupType>('trip');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function reload(): Promise<void> {
    const [value, invitationValue] = await Promise.all([
      apiJson('groups'),
      apiJson('groups/invitations'),
    ]);
    if (!Array.isArray(value) || !value.every(isGroup))
      throw new Error('Social trả về danh sách nhóm không hợp lệ.');
    if (!Array.isArray(invitationValue) || !invitationValue.every(isGroupInvitation))
      throw new Error('Social trả về lời mời nhóm không hợp lệ.');
    setGroups(value);
    setInvitations(invitationValue);
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setShowForm(true);
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

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) {
      setError('Tên nhóm là bắt buộc.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await apiJson('groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), imageUrl: imageUrl.trim() || null, type }),
      });
      if (!isGroup(value)) throw new Error('Social trả về nhóm vừa tạo không hợp lệ.');
      setName('');
      setImageUrl('');
      setMessage('Đã tạo nhóm. Bạn là Admin của nhóm này.');
      await reload();
      router.push(`/groups/${value.id}`);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvitation(invitation: GroupInvitationDto): Promise<void> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiJson(`groups/invitations/${encodeURIComponent(invitation.id)}/accept`, {
        method: 'POST',
      });
      await reload();
      setMessage(`Bạn đã tham gia nhóm ${invitation.group.name}.`);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function declineInvitation(invitation: GroupInvitationDto): Promise<void> {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiJson(`groups/invitations/${encodeURIComponent(invitation.id)}/decline`, {
        method: 'POST',
      });
      await reload();
      setMessage(`Đã từ chối lời mời vào nhóm ${invitation.group.name}.`);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const active = groups.filter((group) => group.dissolvedAt === null);
  return (
    <DemoShell kicker="NHÓM" title="Không gian chi tiêu chung">
      <div className="demoToolbar">
        <p>{active.length} nhóm đang hoạt động trên Equa.</p>
        <button className="primaryBtn" onClick={() => setShowForm((value) => !value)}>
          ＋ Tạo nhóm
        </button>
      </div>
      <section className="contentCard demoSection">
        <div className="cardHeading">
          <div>
            <p className="kicker">ĐANG CHỜ</p>
            <h2>Lời mời nhóm</h2>
          </div>
          <b>{invitations.length}</b>
        </div>
        <div className="demoList">
          {invitations.length ? (
            invitations.map((invitation) => {
              const inviterLabel = humanIdentityLabel(invitation.inviter);
              return (
                <article className="demoRow" key={invitation.id}>
                  <div>
                    <b>{invitation.group.name}</b>
                    <p>
                      Mời bởi {inviterLabel}
                      {humanIdentitySecondaryLabel(invitation.inviter, inviterLabel)
                        ? ` · ${humanIdentitySecondaryLabel(invitation.inviter, inviterLabel)}`
                        : ''}
                    </p>
                    <p>
                      {groupTypes.find((item) => item.value === invitation.group.type)?.label ??
                        invitation.group.type}{' '}
                      · {new Date(invitation.createdAt).toLocaleDateString()}
                    </p>
                    <span className="statusPill pending">PENDING</span>
                  </div>
                  <div className="rowActions">
                    <button
                      className="smallAction primarySmall"
                      disabled={busy}
                      onClick={() => void acceptInvitation(invitation)}
                    >
                      Chấp nhận
                    </button>
                    <button
                      className="smallAction"
                      disabled={busy}
                      onClick={() => void declineInvitation(invitation)}
                    >
                      Từ chối
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="emptyState">Không có lời mời nhóm đang chờ.</p>
          )}
        </div>
      </section>
      {showForm && (
        <section className="contentCard demoFormCard">
          <form className="demoInlineForm" onSubmit={(event) => void create(event)}>
            <label>
              Tên nhóm
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Chuyến đi Đà Lạt"
                required
              />
            </label>
            <label>
              Ảnh nhóm (URL)
              <input
                type="url"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://example.com/group.png"
              />
            </label>
            <label>
              Loại nhóm
              <select value={type} onChange={(event) => setType(event.target.value as GroupType)}>
                {groupTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primaryBtn" type="submit" disabled={busy}>
              Lưu nhóm
            </button>
          </form>
        </section>
      )}
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
      <section className="demoCardGrid">
        {loading ? (
          <p className="emptyState">Đang khởi động dịch vụ và tải nhóm…</p>
        ) : active.length ? (
          active.map((group) => (
            <article className="contentCard demoGroupCard" key={group.id}>
              <span className="groupAvatar largeAvatar">
                {group.name.slice(0, 2).toUpperCase()}
              </span>
              <p className="kicker">
                {groupTypes.find((item) => item.value === group.type)?.label ?? group.type}
              </p>
              <h2>{group.name}</h2>
              <p>Cập nhật {new Date(group.updatedAt).toLocaleDateString()}</p>
              <span className="statusPill friend">ĐANG HOẠT ĐỘNG</span>
              <button className="outlineButton" onClick={() => router.push(`/groups/${group.id}`)}>
                Mở nhóm
              </button>
            </article>
          ))
        ) : (
          <p className="emptyState">Chưa có nhóm. Tạo nhóm để bắt đầu theo dõi chi tiêu.</p>
        )}
      </section>
    </DemoShell>
  );
}

function isGroup(value: unknown): value is GroupDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.type === 'trip' ||
      value.type === 'household' ||
      value.type === 'event' ||
      value.type === 'other') &&
    (value.dissolvedAt === null || typeof value.dissolvedAt === 'string') &&
    typeof value.updatedAt === 'string'
  );
}

function isGroupInvitation(value: unknown): value is GroupInvitationDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    isRecord(value.group) &&
    typeof value.group.id === 'string' &&
    typeof value.group.name === 'string' &&
    (value.group.type === 'trip' ||
      value.group.type === 'household' ||
      value.group.type === 'event' ||
      value.group.type === 'other') &&
    isHumanIdentity(value.inviter)
  );
}

function isHumanIdentity(value: unknown): value is HumanIdentityDto {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.displayName === undefined || typeof value.displayName === 'string') &&
    (value.email === undefined || typeof value.email === 'string') &&
    (value.username === undefined || typeof value.username === 'string')
  );
}

function errorText(value: unknown): string {
  return value instanceof ApiClientError || value instanceof Error
    ? value.message
    : 'Không thể tải dữ liệu nhóm.';
}
