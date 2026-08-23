'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';
type Profile = { id: string; email: string; displayName: string; avatarKey: string | null; defaultCurrency: string; locale: string; timezone: string; roles: string[] };
type AvatarUrlResponse = { url: string | null };

export default function ProfilePage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('equa_access_token') ?? ''}`, 'X-Correlation-ID': crypto.randomUUID() });
  const handleUnauthorized = (response: Response) => { if (response.status === 401) { sessionStorage.removeItem('equa_access_token'); router.replace('/'); return true; } return false; };
  async function loadAvatarUrl(): Promise<string | null> {
    const response = await fetch(`${apiBaseUrl}/profile/me/avatar-url`, { headers: authHeaders() });
    if (handleUnauthorized(response)) return null;
    const result: unknown = await response.json();
    return isAvatarUrl(result) ? result.url : null;
  }

  useEffect(() => {
    void (async () => {
      const token = sessionStorage.getItem('equa_access_token');
      if (!token) { router.replace('/'); return; }
      try {
        const response = await fetch(`${apiBaseUrl}/profile/me`, { headers: authHeaders() });
        if (handleUnauthorized(response)) return;
        const result: unknown = await response.json();
        if (!response.ok || !isProfile(result)) throw new Error('Không thể tải hồ sơ.');
        setProfile(result);
        if (result.avatarKey) setPreview(await loadAvatarUrl());
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể tải hồ sơ.'); }
      finally { setLoading(false); }
    })();
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/profile/me`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: data.get('displayName'), defaultCurrency: data.get('defaultCurrency'), locale: data.get('locale'), timezone: data.get('timezone') }) });
      if (handleUnauthorized(response)) return;
      const result: unknown = await response.json();
      if (!response.ok || !isProfile(result)) throw new Error(readMessage(result) ?? 'Không thể lưu hồ sơ.');
      setProfile(result); setMessage('Đã lưu thay đổi hồ sơ.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu hồ sơ.'); } finally { setSaving(false); }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setMessage('Avatar phải là JPEG, PNG hoặc WebP, tối đa 2 MB.'); return; }
    setSaving(true); setMessage(''); setPreview(URL.createObjectURL(file));
    try {
      const body = new FormData(); body.append('file', file);
      const response = await fetch(`${apiBaseUrl}/profile/me/avatar`, { method: 'POST', headers: authHeaders(), body });
      if (handleUnauthorized(response)) return;
      const result: unknown = await response.json();
      if (!response.ok || !isProfile(result)) throw new Error(readMessage(result) ?? 'Không thể tải avatar.');
      setProfile(result); setPreview(await loadAvatarUrl()); setMessage('Đã tải avatar lên MinIO.');
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Không thể tải avatar.'); } finally { setSaving(false); }
  }

  if (loading) return <main className="profileLoading">Đang tải hồ sơ…</main>;
  if (!profile) return <main className="profileLoading">{message || 'Không thể tải hồ sơ.'}</main>;
  const initials = profile.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <main className="profilePage"><header className="profileHeader"><button className="backButton" onClick={() => router.push('/dashboard')}>← Tổng quan</button><div className="sidebarBrand"><span className="equaMark smallMark">=</span><b>equa</b></div></header><section className="profileHero"><p className="kicker">HỒ SƠ & TUỲ CHỌN</p><h1>Thiết lập Equa theo cách của bạn.</h1><p>Thông tin này thuộc Identity service và được lưu riêng với dữ liệu chi tiêu của Ledger.</p></section><section className="profileCard"><div className="avatarArea"><button className="profileAvatar" type="button" onClick={() => fileInput.current?.click()} aria-label="Đổi ảnh đại diện">{preview ? <img src={preview} alt="Avatar mới" /> : initials}<span>Thay ảnh</span></button><input ref={fileInput} className="visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadAvatar(event); }} /><div><h2>{profile.displayName}</h2><p>{profile.email}</p><small>{profile.avatarKey ? 'Avatar đã lưu trong MinIO.' : 'JPEG, PNG hoặc WebP · tối đa 2 MB'}</small></div></div><form className="profileForm" onSubmit={(event) => { void save(event); }}><label>Tên hiển thị<input name="displayName" defaultValue={profile.displayName} required maxLength={100} /></label><label>Email<input value={profile.email} disabled /></label><label>Tiền tệ mặc định<select name="defaultCurrency" defaultValue={profile.defaultCurrency}><option value="VND">VND — Việt Nam đồng</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option></select></label><label>Ngôn ngữ<select name="locale" defaultValue={profile.locale}><option value="vi">Tiếng Việt</option><option value="en">English</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="es">Español</option><option value="pt">Português</option><option value="ja">日本語</option></select></label><label className="fullWidth">Múi giờ<input name="timezone" defaultValue={profile.timezone} required placeholder="Asia/Ho_Chi_Minh" /></label><div className="profileActions"><button className="primaryBtn" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></form>{message && <p className="formMessage" role="status">{message}</p>}</section></main>;
}

function isProfile(value: unknown): value is Profile { return typeof value === 'object' && value !== null && 'email' in value && 'displayName' in value; }
function isAvatarUrl(value: unknown): value is AvatarUrlResponse { return typeof value === 'object' && value !== null && 'url' in value && (typeof value.url === 'string' || value.url === null); }
function readMessage(value: unknown): string | undefined { return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string' ? value.message : undefined; }
