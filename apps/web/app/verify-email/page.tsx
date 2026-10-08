'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiClientError, authJson } from '../api-client';

type VerificationState = 'checking' | 'success' | 'error';

export default function VerifyEmailPage() {
  const router = useRouter();
  const started = useRef(false);
  const verificationToken = useRef<string | null>(null);
  const [state, setState] = useState<VerificationState>('checking');
  const [message, setMessage] = useState('Đang xác minh địa chỉ email của bạn…');
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('error');
      setMessage('Liên kết xác minh không hợp lệ hoặc thiếu mã xác minh.');
      return;
    }

    verificationToken.current = token;
    void verify(token);
  }, []);

  async function verify(token: string) {
    setState('checking');
    setCanRetry(false);
    setMessage('Đang kết nối với dịch vụ xác thực…');
    try {
      await authJson('auth/verify-email', { token });
      setState('success');
      setMessage('Email đã được xác minh. Bây giờ bạn có thể đăng nhập vào Equa.');
    } catch (error) {
      setState('error');
      setCanRetry(error instanceof ApiClientError && [0, 502, 503, 504].includes(error.status));
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
          <button
            className="primaryBtn"
            type="button"
            onClick={() => {
              const token = verificationToken.current;
              if (canRetry && token) {
                void verify(token);
                return;
              }
              router.replace('/');
            }}
          >
            {state === 'success'
              ? 'Đăng nhập'
              : canRetry
                ? 'Thử xác minh lại'
                : 'Quay về trang đăng nhập'}
          </button>
        ) : null}
      </section>
    </main>
  );
}
