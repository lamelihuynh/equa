'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const activity: Array<[string, string, string, string, 'positive' | 'negative']> = [
  ['🍜', 'Maya added brunch', 'Lisbon crew · bạn được hoàn €18.40', '+€18.40', 'positive'],
  ['🏠', 'Tiền nhà đã đến hạn', 'Flat 3B · hạn thanh toán thứ Sáu', '-€42.00', 'negative'],
  ['✓', 'Theo đã thanh toán', 'Chuyển khoản đã được xác nhận', '+€86.00', 'positive'],
];
const groups: Array<[string, string, string, string]> = [
  ['Lisbon crew', '6 thành viên · €1,699.71 đã theo dõi', '+€128.50', 'LC'],
  ['Flat 3B', '4 thành viên · cập nhật hôm nay', '-€42.00', 'F3'],
  ['Movie night', '5 thành viên · 2 khoản chi', '+$91.75', 'MN'],
];
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';
const avatarOrigin = process.env.NEXT_PUBLIC_AVATAR_ORIGIN ?? 'http://localhost:9000';
type Profile = { displayName: string; avatarKey: string | null; defaultCurrency: string; locale: string; timezone: string };

function Mark() { return <span className="equaMark smallMark"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M9 17.5h24" /><path d="M9 24.5h24" /><path d="M12 12c4.8-4.6 13.2-4.6 18 0" /><path d="M12 30c4.8 4.6 13.2 4.6 18 0" /></svg></span>; }

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    const token = sessionStorage.getItem('equa_access_token');
    if (!token) { router.replace('/'); return; }
    setEmail(sessionStorage.getItem('equa_user_email') ?? '');
    void (async () => {
      const response = await fetch(`${apiBaseUrl}/profile/me`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Correlation-ID': crypto.randomUUID() },
      });
      if (response.status === 401) { logout(); return; }
      const result: unknown = await response.json();
      if (isProfile(result)) {
        setProfile(result);
        if (result.avatarKey) {
          const avatarResponse = await fetch(`${apiBaseUrl}/profile/me/avatar-url`, {
            headers: { Authorization: `Bearer ${token}`, 'X-Correlation-ID': crypto.randomUUID() },
          });
          const avatarResult: unknown = await avatarResponse.json();
          setAvatarUrl(trustedAvatarUrl(avatarResult));
        }
      }
    })();
  }, [router]);
  function logout() { sessionStorage.removeItem('equa_access_token'); sessionStorage.removeItem('equa_user_email'); router.replace('/'); }
  const currency = profile?.defaultCurrency ?? 'EUR';
  const netBalance = new Intl.NumberFormat(profile?.locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(413.8);

  return <main className="workspace">
    <aside className="sidebar">
      <div className="sidebarBrand"><Mark /><b>equa</b></div>
      <nav className="sideNav" aria-label="Điều hướng chính">
        <button className="active"><span>⌂</span>Tổng quan</button><button><span>◫</span>Nhóm</button><button><span>◌</span>Bạn bè</button><button><span>↗</span>Hoạt động</button>
      </nav>
      <div className="sidebarBottom"><button onClick={() => router.push('/profile')}><span>⚙</span>Hồ sơ & cài đặt</button><button onClick={logout}><span>↪</span>Đăng xuất</button></div>
    </aside>
    <section className="dashboardContent">
      <header className="dashboardHeader"><div><p className="kicker">TỔNG QUAN HÔM NAY</p><h1>Chào bạn{profile?.displayName ? `, ${profile.displayName}` : email ? `, ${email.split('@')[0]}` : ''}.</h1></div><div className="headerActions"><button className="iconButton" aria-label="Thông báo">♧<i /></button><button className="avatarButton" aria-label="Hồ sơ" onClick={() => router.push('/profile')}>{avatarUrl ? <img src={avatarUrl} alt="Avatar của bạn" /> : profile?.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() ?? 'EQ'}</button></div></header>
      <section className="balanceHero"><div><p>Số dư trên 3 nhóm đang hoạt động · {profile?.timezone ?? 'Asia/Ho_Chi_Minh'}</p><h2>Bạn đang được hoàn</h2><strong>{netBalance}</strong><div className="balanceMeta"><span>Bạn nợ <b>{formatMoney(72.4, currency, profile?.locale)}</b></span><span>Ròng <b>+{netBalance}</b></span></div></div><div className="heroArt"><span className="coin">{currency === 'VND' ? '₫' : currency === 'USD' ? '$' : '€'}</span><span className="paperSlip">Brunch<br /><b>{formatMoney(214.8, currency, profile?.locale)}</b></span><i /><i /></div></section>
      <section className="quickActions"><button className="addExpense"><span>＋</span>Thêm khoản chi</button><button><span>♜</span>Tạo nhóm</button><button><span>↗</span>Thanh toán</button></section>
      <div className="dashboardGrid"><section className="contentCard recentCard"><div className="cardHeading"><div><p className="kicker">CẬP NHẬT GẦN ĐÂY</p><h2>Chuyển động mới</h2></div><button className="textAction">Xem tất cả</button></div><div className="activityList">{activity.map(([icon, title, meta, amount, tone]) => <article className="activityRow" key={title}><span className="activityIcon">{icon}</span><div><b>{title}</b><p>{meta}</p></div><strong className={tone}>{amount}</strong></article>)}</div></section>
      <section className="contentCard groupCard"><div className="cardHeading"><div><p className="kicker">NHÓM CỦA BẠN</p><h2>Đang theo dõi</h2></div><button className="textAction">Tất cả nhóm</button></div><div className="groupList">{groups.map(([name, meta, amount, initials]) => <article className="groupRow" key={name}><span className="groupAvatar">{initials}</span><div><b>{name}</b><p>{meta}</p></div><strong className={amount.startsWith('-') ? 'negative' : 'positive'}>{amount}</strong></article>)}</div><button className="outlineButton">＋ Tạo nhóm mới</button></section></div>
    </section>
  </main>;
}

function isProfile(value: unknown): value is Profile { return typeof value === 'object' && value !== null && 'displayName' in value && 'avatarKey' in value && 'defaultCurrency' in value && 'locale' in value && 'timezone' in value; }
function trustedAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('url' in value) || typeof value.url !== 'string') return null;
  try {
    const candidate = new URL(value.url);
    const allowed = new URL(avatarOrigin);
    if (candidate.origin !== allowed.origin || !candidate.pathname.startsWith('/equa-avatars/')) return null;
    return candidate.toString();
  } catch {
    return null;
  }
}
function formatMoney(value: number, currency: string, locale?: string): string { return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
