'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { LOCAL_DEMO_TOKEN, logoutSession } from '../api-client';

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

export function DemoShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [localDemo, setLocalDemo] = useState(false);
  useEffect(() => {
    const token = sessionStorage.getItem('equa_access_token');
    if (!token) router.replace('/');
    setLocalDemo(token === LOCAL_DEMO_TOKEN);
    const expire = (): void => router.replace('/?expired=1');
    window.addEventListener('equa-session-expired', expire);
    return () => window.removeEventListener('equa-session-expired', expire);
  }, [router]);
  const go = (path: string): void => router.push(path);
  const logout = (): void => {
    void logoutSession().finally(() => router.replace('/'));
  };
  return (
    <main className="workspace demoWorkspace">
      <aside className="sidebar">
        <button className="sidebarBrand demoBrandButton" onClick={() => go('/dashboard')}>
          <Mark />
          <b>equa</b>
        </button>
        <nav className="sideNav" aria-label="Điều hướng chính">
          <button
            className={pathname === '/dashboard' ? 'active' : ''}
            onClick={() => go('/dashboard')}
          >
            <span>⌂</span>Tổng quan
          </button>
          <button
            className={pathname.startsWith('/groups') ? 'active' : ''}
            onClick={() => go('/groups')}
          >
            <span>◫</span>Nhóm
          </button>
          <button
            className={pathname.startsWith('/friends') ? 'active' : ''}
            onClick={() => go('/friends')}
          >
            <span>◌</span>Bạn bè
          </button>
          <button
            className={pathname.startsWith('/expenses') ? 'active' : ''}
            onClick={() => go('/expenses')}
          >
            <span>＋</span>Khoản chi
          </button>
        </nav>
        <div className="sidebarBottom">
          <button onClick={() => go('/profile')}>
            <span>⚙</span>Hồ sơ & cài đặt
          </button>
          <button onClick={logout}>
            <span>↪</span>Đăng xuất
          </button>
        </div>
      </aside>
      <section className="dashboardContent demoContent">
        <header className="dashboardHeader">
          <div>
            <p className="kicker">{kicker}</p>
            <h1>{title}</h1>
          </div>
          {localDemo && <span className="demoModeBadge">Local Demo · browser storage</span>}
        </header>
        {children}
      </section>
    </main>
  );
}
