# Triển khai staging

Workflow staging chọn nhánh theo GitHub Environment variable `STAGING_BRANCH`, mặc định là
`develop`. Trong `.github/components.json`, hiện chỉ Identity có deploy hook và HTTP smoke check;
Social, Ledger, Automation & Sync, Platform, Notification và Web chưa có staging target trong repo.

GitHub Environment `staging` cần:

- Secret `RENDER_IDENTITY_DEPLOY_HOOK`
- Variable `STAGING_API_BASE_URL`

Render nhận image Identity bất biến được workflow build cho commit đang deploy. Runtime config cần
được cấu hình riêng trong Render, gồm `IDENTITY_DATABASE_URL`, `IDENTITY_JWT_SECRET`, email provider
settings và S3-compatible avatar settings. Không đưa giá trị thật vào repository.

Vercel/Web staging nếu đang được cấu hình thì là target ngoài workflow và component manifest này;
repo hiện không xác nhận được project, branch, hay biến môi trường đó. Khi Web được thêm vào manifest,
cần ghi rõ URL và smoke check tương ứng.

Nếu Web staging chạy riêng, `NEXT_PUBLIC_AVATAR_ORIGIN` phải là origin HTTPS công khai của MinIO/S3
staging. Render cấp biến `PORT` cho Identity service; service ưu tiên lắng nghe biến này. Không đặt
URL local hoặc `host.docker.internal` vào biến môi trường staging.

Mailpit chỉ dùng local. Staging dùng `EMAIL_PROVIDER=resend`; cần xác thực domain gửi mail trước khi
gửi email xác minh/đặt lại thật đến người nhận bất kỳ.
