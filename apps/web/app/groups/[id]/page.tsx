'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  ApiClientError,
  apiJson,
  currentUserId,
  isLocalDemoSession,
  isRecord,
} from '../../api-client';
import { DemoShell } from '../../components/demo-shell';
import { humanIdentityLabel, humanIdentitySecondaryLabel } from '../../identity-label';
import {
  loadDemoState,
  newDemoId,
  saveDemoState,
  subscribeDemo,
  type DemoGroup,
  type DemoState,
  type GroupType,
} from '../../demo-store';

const groupTypes: Array<{ value: GroupType; label: string }> = [
  { value: 'trip', label: 'Chuyến đi' },
  { value: 'household', label: 'Nhà ở chung' },
  { value: 'event', label: 'Sự kiện' },
  { value: 'other', label: 'Khác' },
];

interface GroupDto {
  id: string;
  name: string;
  imageUrl: string | null;
  type: GroupType;
  dissolvedAt: string | null;
  updatedAt: string;
}

interface GroupMemberDto {
  groupId: string;
  userId: string;
  role: 'admin' | 'member';
  user?: HumanIdentityDto;
}

interface HumanIdentityDto {
  id?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

export default function GroupDetailPage() {
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
  if (mode === 'demo') return <LocalGroupDetailPage />;
  if (mode === 'api') return <ApiGroupDetailPage />;
  return (
    <main className="workspace">
      <section className="contentCard demoContent" role="status">
        Loading group…
      </section>
    </main>
  );
}

function LocalGroupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<DemoState>(() => loadDemoState());
  const [message, setMessage] = useState('');
  const group = state.groups.find((item) => item.id === params.id);
  useEffect(() => subscribeDemo(() => setState(loadDemoState())), []);
  const persist = (next: DemoState): void => {
    setState(next);
    saveDemoState(next);
  };
  if (!group)
    return (
      <DemoShell kicker="NHÓM" title="Không tìm thấy nhóm">
        <section className="contentCard">
          <p className="emptyState">Nhóm này không còn trong Local Demo.</p>
          <button className="primaryBtn" onClick={() => router.push('/groups')}>
            Quay lại nhóm
          </button>
        </section>
      </DemoShell>
    );

  const currentGroup = group;

  function update(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get('name');
    const type = data.get('type');
    const image = data.get('image');
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof type !== 'string' ||
      typeof image !== 'string'
    ) {
      setMessage('Kiểm tra lại thông tin nhóm.');
      return;
    }
    updateGroup({
      ...currentGroup,
      name: name.trim(),
      type: type as GroupType,
      image: image.trim().slice(0, 2).toUpperCase() || currentGroup.image,
    });
    setMessage('Đã cập nhật thông tin nhóm.');
  }
  function updateGroup(nextGroup: DemoGroup): void {
    persist({
      ...state,
      groups: state.groups.map((item) => (item.id === currentGroup.id ? nextGroup : item)),
    });
  }
  function invite(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('member');
    if (typeof name !== 'string' || !name.trim()) {
      setMessage('Nhập tên hoặc email thành viên.');
      return;
    }
    if (
      currentGroup.members.some((member) => member.name.toLowerCase() === name.trim().toLowerCase())
    ) {
      setMessage('Thành viên này đã có trong nhóm.');
      return;
    }
    updateGroup({
      ...currentGroup,
      members: [
        ...currentGroup.members,
        { id: newDemoId('member'), name: name.trim(), role: 'member' },
      ],
    });
    setMessage(`Đã mời và chấp nhận ${name.trim()} trong Local Demo.`);
    event.currentTarget.reset();
  }
  function removeMember(id: string, name: string): void {
    if (!window.confirm(`Xóa ${name} khỏi nhóm?`)) return;
    updateGroup({
      ...currentGroup,
      members: currentGroup.members.filter((member) => member.id !== id),
    });
    setMessage('Đã xóa thành viên khỏi nhóm.');
  }
  function dissolve(): void {
    if (!window.confirm(`Giải tán nhóm ${currentGroup.name}?`)) return;
    updateGroup({ ...currentGroup, dissolved: true });
    setMessage('Nhóm đã được giải tán.');
  }
  return (
    <DemoShell kicker="CHI TIẾT NHÓM" title={currentGroup.name}>
      <div className="demoGrid twoColumns">
        <section className="contentCard demoFormCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">ADMIN</p>
              <h2>Thông tin nhóm</h2>
            </div>
            <span className="statusPill friend">ADMIN</span>
          </div>
          <form className="formStack compactForm" onSubmit={update}>
            <label>
              Tên nhóm
              <input
                name="name"
                defaultValue={currentGroup.name}
                disabled={currentGroup.dissolved}
              />
            </label>
            <label>
              Ảnh / ký hiệu
              <input
                name="image"
                defaultValue={currentGroup.image}
                maxLength={2}
                disabled={currentGroup.dissolved}
              />
            </label>
            <label>
              Loại nhóm
              <select
                name="type"
                defaultValue={currentGroup.type}
                disabled={currentGroup.dissolved}
              >
                {groupTypes.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primaryBtn" disabled={currentGroup.dissolved}>
              Lưu thay đổi
            </button>
          </form>
          {!currentGroup.dissolved && (
            <button className="dangerButton" onClick={dissolve}>
              Giải tán nhóm
            </button>
          )}
        </section>
        <section className="contentCard demoFormCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">MỜI THÀNH VIÊN</p>
              <h2>Tham gia nhóm</h2>
            </div>
          </div>
          <form className="formStack compactForm" onSubmit={invite}>
            <label>
              Email hoặc tên
              <input
                name="member"
                placeholder="bob@example.com"
                disabled={currentGroup.dissolved}
              />
            </label>
            <button className="primaryBtn" disabled={currentGroup.dissolved}>
              Mời & chấp nhận
            </button>
          </form>
        </section>
      </div>
      {message && (
        <p className="demoFeedback" role="status">
          {message}
        </p>
      )}
      <section className="contentCard demoSection">
        <div className="cardHeading">
          <div>
            <p className="kicker">THÀNH VIÊN</p>
            <h2>{currentGroup.members.length} người trong nhóm</h2>
          </div>
        </div>
        <div className="demoList">
          {currentGroup.members.map((member) => (
            <article className="demoRow" key={member.id}>
              <div>
                <b>{member.name}</b>
                <p>Vai trò trong nhóm</p>
                <span className={`statusPill ${member.role === 'admin' ? 'friend' : 'pending'}`}>
                  {member.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                </span>
              </div>
              {member.role !== 'admin' && !currentGroup.dissolved && (
                <button
                  className="smallAction"
                  onClick={() => removeMember(member.id, member.name)}
                >
                  Xóa thành viên
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </DemoShell>
  );
}

function ApiGroupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<GroupDto | null>(null);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const currentId = currentUserId();
  const isAdmin = members.some((member) => member.userId === currentId && member.role === 'admin');

  async function reload(): Promise<void> {
    const [groupValue, memberValue] = await Promise.all([
      apiJson(`groups/${encodeURIComponent(params.id)}`),
      apiJson(`groups/${encodeURIComponent(params.id)}/members`),
    ]);
    if (!isGroup(groupValue)) throw new Error('Social trả về nhóm không hợp lệ.');
    if (!Array.isArray(memberValue) || !memberValue.every(isGroupMember))
      throw new Error('Social trả về danh sách thành viên không hợp lệ.');
    setGroup(groupValue);
    setMembers(memberValue);
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
  }, [params.id]);

  async function update(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!group) return;
    const data = new FormData(event.currentTarget);
    const name = data.get('name');
    const imageUrl = data.get('imageUrl');
    const type = data.get('type');
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      (typeof imageUrl !== 'string' && imageUrl !== null) ||
      !isGroupType(type)
    ) {
      setError('Kiểm tra lại thông tin nhóm.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiJson(`groups/${encodeURIComponent(group.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), imageUrl: imageUrl?.trim() || null, type }),
      });
      await reload();
      setMessage('Đã cập nhật thông tin nhóm.');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function dissolve(): Promise<void> {
    if (!group || !window.confirm(`Giải tán nhóm ${group.name}?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiJson(`groups/${encodeURIComponent(group.id)}`, { method: 'DELETE' });
      router.push('/groups');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>): Promise<void> {
    const form = event.currentTarget;
    event.preventDefault();
    if (!group) return;
    const identifier = new FormData(event.currentTarget).get('identifier');
    if (typeof identifier !== 'string' || !identifier.trim()) {
      setError('Nhập email thành viên.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const invitation = await apiJson(`groups/${encodeURIComponent(group.id)}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'email',
          identifier: identifier.trim(),
        }),
      });
      if (!isRecord(invitation) || typeof invitation.id !== 'string')
        throw new Error('Social không xác nhận được lời mời.');
      setMessage(`Đã gửi lời mời đến ${identifier.trim()}.`);
      form.reset();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: GroupMemberDto): Promise<void> {
    const label = member.userId === currentId ? 'Bạn' : humanIdentityLabel(member.user);
    if (!group || !window.confirm(`Xóa ${label} khỏi nhóm?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiJson(
        `groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(member.userId)}`,
        { method: 'DELETE' },
      );
      await reload();
      setMessage('Đã xóa thành viên khỏi nhóm.');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <DemoShell kicker="CHI TIẾT NHÓM" title="Đang tải…">
        <p className="emptyState">Đang tải thông tin nhóm…</p>
      </DemoShell>
    );
  if (!group)
    return (
      <DemoShell kicker="NHÓM" title="Không mở được nhóm">
        <p className="formMessage" role="alert">
          {error || 'Nhóm không tồn tại hoặc bạn không có quyền xem.'}
        </p>
        <button className="primaryBtn" onClick={() => router.push('/groups')}>
          Quay lại nhóm
        </button>
      </DemoShell>
    );

  return (
    <DemoShell kicker="CHI TIẾT NHÓM" title={group.name}>
      <div className="demoGrid twoColumns">
        <section className="contentCard demoFormCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">THÔNG TIN NHÓM</p>
              <h2>Quản lý nhóm</h2>
            </div>
            <span className={`statusPill ${isAdmin ? 'friend' : 'pending'}`}>
              {isAdmin ? 'ADMIN' : 'MEMBER'}
            </span>
          </div>
          <form className="formStack compactForm" onSubmit={(event) => void update(event)}>
            <label>
              Tên nhóm
              <input name="name" defaultValue={group.name} disabled={!isAdmin || busy} required />
            </label>
            <label>
              Ảnh nhóm (URL)
              <input
                name="imageUrl"
                type="url"
                defaultValue={group.imageUrl ?? ''}
                disabled={!isAdmin || busy}
              />
            </label>
            <label>
              Loại nhóm
              <select name="type" defaultValue={group.type} disabled={!isAdmin || busy}>
                {groupTypes.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {isAdmin && (
              <button className="primaryBtn" disabled={busy}>
                Lưu thay đổi
              </button>
            )}
          </form>
          {isAdmin && (
            <button
              className="dangerButton"
              type="button"
              disabled={busy}
              onClick={() => void dissolve()}
            >
              Giải tán nhóm
            </button>
          )}
        </section>
        <section className="contentCard demoFormCard">
          <div className="cardHeading">
            <div>
              <p className="kicker">MỜI THÀNH VIÊN</p>
              <h2>Tham gia nhóm</h2>
            </div>
          </div>
          <form className="formStack compactForm" onSubmit={(event) => void invite(event)}>
            <label>
              Email thành viên
              <input
                name="identifier"
                type="email"
                placeholder="bob@example.com"
                disabled={!isAdmin || busy}
                required
              />
            </label>
            {isAdmin && (
              <button className="primaryBtn" disabled={busy}>
                Tạo lời mời
              </button>
            )}
          </form>
        </section>
      </div>
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
            <p className="kicker">THÀNH VIÊN</p>
            <h2>{members.length} người trong nhóm</h2>
          </div>
        </div>
        <div className="demoList">
          {members.map((member) => (
            <article className="demoRow" key={member.userId}>
              <div>
                <b>{member.userId === currentId ? 'Bạn' : humanIdentityLabel(member.user)}</b>
                <p>
                  {member.userId === currentId
                    ? (humanIdentitySecondaryLabel(member.user, 'Bạn') ?? 'Tài khoản của bạn')
                    : (humanIdentitySecondaryLabel(member.user, humanIdentityLabel(member.user)) ??
                      'Thành viên Equa')}
                </p>
                <span className={`statusPill ${member.role === 'admin' ? 'friend' : 'pending'}`}>
                  {member.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                </span>
              </div>
              {isAdmin && member.role !== 'admin' && (
                <button
                  className="smallAction"
                  disabled={busy}
                  onClick={() => void removeMember(member)}
                >
                  Xóa thành viên
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </DemoShell>
  );
}

function isGroup(value: unknown): value is GroupDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isGroupType(value.type) &&
    (value.imageUrl === null || typeof value.imageUrl === 'string') &&
    (value.dissolvedAt === null || typeof value.dissolvedAt === 'string') &&
    typeof value.updatedAt === 'string'
  );
}

function isGroupMember(value: unknown): value is GroupMemberDto {
  return (
    isRecord(value) &&
    typeof value.groupId === 'string' &&
    typeof value.userId === 'string' &&
    (value.role === 'admin' || value.role === 'member') &&
    (value.user === undefined || isHumanIdentity(value.user))
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

function isGroupType(value: unknown): value is GroupType {
  return value === 'trip' || value === 'household' || value === 'event' || value === 'other';
}

function errorText(value: unknown): string {
  return value instanceof ApiClientError || value instanceof Error
    ? value.message
    : 'Không thể tải dữ liệu nhóm.';
}
