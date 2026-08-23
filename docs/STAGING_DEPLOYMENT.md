# Triển khai staging

`develop` là nhánh staging. Vercel được kết nối với repository và cấu hình `develop` là nhánh staging;
biến môi trường `NEXT_PUBLIC_API_BASE_URL` trỏ đến URL Kong/API công khai của staging. Render chạy
Identity từ image GHCR bất biến được build bởi `deploy-staging.yml`.

Cấu hình bắt buộc của GitHub Environment `staging`:

- Secret `RENDER_IDENTITY_DEPLOY_HOOK`
- Variable `STAGING_API_BASE_URL`

Runtime secret bắt buộc trên Render: `IDENTITY_DATABASE_URL`, `IDENTITY_JWT_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `APP_WEB_URL` và các giá trị Redis/MinIO riêng cho dịch vụ. Không đưa
bất kỳ giá trị nào trong số này vào repository.

Trên Vercel staging, đặt `NEXT_PUBLIC_AVATAR_ORIGIN` bằng origin HTTPS công khai của MinIO/S3 staging.
Web chỉ render avatar từ origin này, dù URL đọc object được Identity ký có thời hạn.

Render cấp biến `PORT` cho Web Service; Identity ưu tiên lắng nghe biến này. Không đặt URL local hoặc
`host.docker.internal` vào bất kỳ biến môi trường staging nào.

Mailpit chỉ dùng local. Staging dùng `EMAIL_PROVIDER=resend`; cần xác thực domain gửi mail trước khi
gửi email xác minh/đặt lại thật đến người nhận bất kỳ.
