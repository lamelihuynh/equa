'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token');
    if (!value) setMessage('Liên kết đặt lại mật khẩu không hợp lệ hoặc thiếu mã xác minh.');
    setToken(value);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const passwordValue = data.get('password');
    const confirmationValue = data.get('confirmation');
    const password = typeof passwordValue === 'string' ? passwordValue : '';
    const confirmation = typeof confirmationValue === 'string' ? confirmationValue : '';
    if (password !== confirmation) {
      setMessage('Hai mật khẩu chưa trùng khớp.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': crypto.randomUUID(),
        },
        body: JSON.stringify({ token, password }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(body.message ?? 'Không thể đặt lại mật khẩu.');
      setCompleted(true);
      setMessage('Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Đã có lỗi xảy ra khi đặt lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  }

  const invalidLink = token === null && Boolean(message);

  return (
    <main className="authActionPage">
      <section className="authActionCard" aria-live="polite">
        <p className="kicker">BẢO MẬT TÀI KHOẢN</p>
        <h1>{completed ? 'Mật khẩu mới đã sẵn sàng.' : 'Đặt lại mật khẩu'}</h1>
        {!completed && !invalidLink ? (
          <form className="formStack" onSubmit={(event) => { void submit(event); }}>
            <label>
              Mật khẩu mới
              <input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="Tối thiểu 8 ký tự" />
            </label>
            <label>
              Nhập lại mật khẩu mới
              <input name="confirmation" type="password" autoComplete="new-password" minLength={8} required placeholder="Nhập lại mật khẩu" />
            </label>
            <button className="primaryBtn" disabled={loading}>
              {loading ? 'Đang đặt lại…' : 'Lưu mật khẩu mới'}
            </button>
          </form>
        ) : null}
        {message ? <p className={`authActionMessage ${completed ? 'success' : 'error'}`}>{message}</p> : null}
        {(completed || invalidLink) ? (
          <button className="textAction authActionLink" type="button" onClick={() => router.replace('/')}>
            Quay về trang đăng nhập
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
