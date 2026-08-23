'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';
type Mode = 'login' | 'signup' | 'forgot';
interface ApiResponse { message?: string; accessToken?: string; }

function EquaMark() {
  return <span className="equaMark" aria-label="Equa"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M9 17.5h24" /><path d="M9 24.5h24" /><path d="M12 12c4.8-4.6 13.2-4.6 18 0" /><path d="M12 30c4.8 4.6 13.2 4.6 18 0" /></svg></span>;
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = data.get('email');
    const emailValue = typeof email === 'string' ? email : '';
    const endpoint = mode === 'signup' ? 'auth/register' : mode === 'login' ? 'auth/login' : 'auth/forgot-password';
    const body = mode === 'signup'
      ? { displayName: data.get('displayName'), email: data.get('email'), password: data.get('password') }
      : mode === 'login' ? { email: data.get('email'), password: data.get('password') } : { email: data.get('email') };
    setLoading(true); setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/${endpoint}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': crypto.randomUUID() }, body: JSON.stringify(body) });
      const result: unknown = await response.json();
      const apiResult = isApiResponse(result) ? result : {};
      if (!response.ok) throw new Error(apiResult.message ?? 'Không thể hoàn tất yêu cầu.');
      if (mode === 'login' && apiResult.accessToken) {
        sessionStorage.setItem('equa_access_token', apiResult.accessToken);
        sessionStorage.setItem('equa_user_email', emailValue);
        router.replace('/dashboard'); return;
      }
      setMessage(mode === 'signup' ? 'Tài khoản đã được tạo. Hãy kiểm tra email để xác thực.' : 'Nếu email hợp lệ, bạn sẽ nhận được liên kết đặt lại mật khẩu.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'); } finally { setLoading(false); }
  }

  const copy = {
    login: ['Chào mừng trở lại.', 'Đăng nhập để tiếp tục theo dõi các khoản chi chung.'],
    signup: ['Bắt đầu chia tiền nhẹ nhàng hơn.', 'Tạo tài khoản miễn phí, sau đó xác thực email của bạn.'],
    forgot: ['Đặt lại mật khẩu.', 'Chúng tôi sẽ gửi một liên kết dùng một lần đến email của bạn.'],
  }[mode];

  return <main className="authPage">
    <section className="authStory" aria-label="Giới thiệu Equa">
      <div className="authBrand"><EquaMark /><b>equa</b></div>
      <div className="authStoryCopy"><p className="kicker">SPLIT WITHOUT THE GROUP CHAT CHASE</p><h1>Mọi khoản chi chung, rõ ràng và công bằng.</h1><p>Equa giúp nhóm bạn theo dõi chi tiêu, nhắc khéo và thanh toán gọn gàng — không còn bảng tính rối rắm.</p></div>
      <div className="storyReceipt receiptOne"><span>Lisbon crew</span><strong>Brunch</strong><small>Maya paid · split 5 ways</small><b>€214.80</b></div>
      <div className="storyReceipt receiptTwo"><span>Đã cân bằng</span><strong>+ €18.40</strong><small>Bạn được hoàn lại</small></div>
      <div className="storyEqual" aria-hidden="true"><i /><i /></div>
      <p className="authFootnote">Dành cho chuyến đi, nhà ở chung và những khoản nhỏ mỗi ngày.</p>
    </section>
    <section className="authPanel">
      <div className="mobileBrand"><EquaMark /><b>equa</b></div>
      <div className="authPanelIntro"><p className="kicker">TÀI KHOẢN EQUA</p><h2>{copy[0]}</h2><p>{copy[1]}</p></div>
      <div className="authTabs" role="tablist" aria-label="Tác vụ tài khoản">
        {(['login', 'signup', 'forgot'] as const).map((item) => <button type="button" key={item} className={mode === item ? 'active' : ''} onClick={() => { setMode(item); setMessage(''); }}>{item === 'signup' ? 'Tạo tài khoản' : item === 'login' ? 'Đăng nhập' : 'Quên mật khẩu'}</button>)}
      </div>
      <form onSubmit={(event) => { void submit(event); }} className="formStack">
        {mode === 'signup' && <label>Họ tên hiển thị<input name="displayName" required maxLength={100} placeholder="Linh Nguyễn" autoComplete="name" /></label>}
        <label>Email<input name="email" type="email" required placeholder="ban@example.com" autoComplete="email" /></label>
        {mode !== 'forgot' && <label>Mật khẩu<input name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Tối thiểu 8 ký tự" /></label>}
        {mode === 'login' && <button className="quietLink" type="button" onClick={() => setMode('forgot')}>Quên mật khẩu?</button>}
        <button className="primaryBtn" disabled={loading}>{loading ? 'Đang xử lý…' : mode === 'signup' ? 'Tạo tài khoản' : mode === 'login' ? 'Đăng nhập' : 'Gửi liên kết đặt lại'}</button>
      </form>
      {message && <p className="formMessage" role="status">{message}</p>}
      <p className="authTerms">Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật của Equa.</p>
    </section>
  </main>;
}

function isApiResponse(value: unknown): value is ApiResponse { return typeof value === 'object' && value !== null; }
