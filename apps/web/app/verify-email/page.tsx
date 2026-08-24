'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';

type VerificationState = 'checking' | 'success' | 'error';

export default function VerifyEmailPage() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<VerificationState>('checking');
  const [message, setMessage] = useState('Đang xác minh địa chỉ email của bạn…');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('error');
      setMessage('Liên kết xác minh không hợp lệ hoặc thiếu mã xác minh.');
      return;
    }

    void verify(token);
  }, []);

  async function verify(token: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': crypto.randomUUID(),
        },
        body: JSON.stringify({ token }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(body.message ?? 'Không thể xác minh email này.');
      setState('success');
      setMessage('Email đã được xác minh. Bây giờ bạn có thể đăng nhập vào Equa.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Đã có lỗi xảy ra khi xác minh email.');
    }
  }

  return (
    <main className="authActionPage">
      <section className="authActionCard" aria-live="polite">
        <p className="kicker">XÁC MINH TÀI KHOẢN</p>
        <h1>{state === 'success' ? 'Bạn đã sẵn sàng.' : 'Xác minh email'}</h1>
        <p className={`authActionMessage ${state}`}>{message}</p>
        {state === 'checking' ? <span className="loadingDot" aria-label="Đang xử lý" /> : null}
        {state !== 'checking' ? (
          <button className="primaryBtn" type="button" onClick={() => router.replace('/')}>
            {state === 'success' ? 'Đăng nhập' : 'Quay về trang đăng nhập'}
          </button>
        ) : null}
      </section>
    </main>
  );
}

async function readBody(response: Response): Promise<{ message?: string }> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? body : {};
  } catch {
    return {};
  }
}
