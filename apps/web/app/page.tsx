const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';

export default function Home() {
  return (
    <main>
      <span className="eyebrow">EQUA · WORKSPACE SCAFFOLD</span>
      <h1>Nền tảng quản lý chi tiêu chung</h1>
      <p>
        Web shell đã sẵn sàng. Business features sẽ được phát triển theo contract và bounded context
        trong tài liệu kiến trúc.
      </p>
      <dl>
        <div>
          <dt>API Gateway</dt>
          <dd>{apiBaseUrl}</dd>
        </div>
        <div>
          <dt>Trạng thái</dt>
          <dd>Scaffold only — chưa có dữ liệu thật</dd>
        </div>
      </dl>
    </main>
  );
}
