# Quy trình phát triển chung

## Git workflow

Áp dụng trunk-based development: `main` luôn có thể phát hành, branch ngắn `feat/FR-EXP-001-*`,
`fix/*`, `chore/*`; merge bằng pull request và squash. Không dùng branch sống lâu theo từng service.

Thiết lập branch protection cho `main` trên GitHub:

- Bắt buộc pull request và ít nhất 1 approval; 2 approval cho auth/payment/migration.
- Bắt buộc jobs `Quality gates`, `Infrastructure smoke test`, `CodeQL` pass.
- Require conversation resolution, block force-push/delete, không cho bypass trừ maintainer khẩn cấp.
- Bật secret scanning, push protection, Dependabot alerts và private vulnerability reporting.

## Definition of Ready

- Có Requirement ID/acceptance criteria và bounded context owner.
- Quy tắc tiền tệ, authorization và hành vi offline được nêu rõ nếu liên quan.
- API/event thay đổi có contract draft và compatibility plan.

## Definition of Done

- Code, unit/integration test và docs/contract cùng PR.
- Structured log/correlation ID; không log token/PII/chi tiết tài chính nhạy cảm.
- Migration forward + rollback/roll-forward plan; không JOIN xuyên database.
- Metrics cho error/latency và business failure quan trọng.
- `pnpm ci` pass; reviewer đúng domain approve.
- Feature chưa hoàn thiện nằm sau feature flag, default off ở production.

## Quy ước quan trọng

- API public version `/v1`; error shape theo SRS; mọi mutation tài chính nhận `Idempotency-Key`.
- ID là UUIDv7 khi ORM/DB layer được thêm; thời gian lưu UTC, hiển thị theo timezone user.
- Money = integer minor unit + ISO currency; không dùng float/double.
- Mỗi service tự sở hữu migration, DB credential và schema; service khác chỉ dùng API/event.
- Shared package chỉ chứa contract/value không có business/domain entity hoặc ORM model.
- Event publish bằng transactional outbox; consumer idempotent và có DLQ.

## Migration database local

PostgreSQL phải đang chạy trước khi chạy migration:

```powershell
pnpm infra:up
pnpm --filter @equa/social-service db:migrate
pnpm --filter @equa/identity-service db:migrate
```

Root `.env` cần có `SOCIAL_DATABASE_URL` trỏ đến `equa_social` (xem `.env.example`). Với volume
đã tồn tại, lệnh Social tự tạo database nếu user có `CREATEDB`; nếu không, administrator tạo
`equa_social` trong database `postgres` trước rồi chạy lại lệnh migration.

Nếu cần tạo thủ công vì user ứng dụng không có `CREATEDB` (chỉ chạy khi database chưa tồn tại):

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE equa_social;"'
```

Lệnh Social đọc `SOCIAL_DATABASE_URL`, kết nối vào database quản trị `postgres` để tạo
`equa_social` nếu database chưa tồn tại, rồi mới chạy các file migration của Social. Lệnh này
an toàn khi chạy lại. Nếu user PostgreSQL không có quyền `CREATEDB`, hãy tạo database bằng
administrator rồi chạy lại lệnh trên. Không dùng `docker-entrypoint-initdb.d/init.sql` để sửa volume
đã tồn tại: file init chỉ chạy khi PostgreSQL khởi tạo volume mới.

Migration Identity cũng cần chạy trên database cũ để thêm cột `users.username`; trường `username`
trong payload register vẫn là tùy chọn, nên payload cũ chỉ gồm `displayName`, `email` và `password`
tiếp tục hợp lệ sau khi migration hoàn tất.

## Phân công gợi ý cho 5 developer

Không cố định vĩnh viễn, nhưng mỗi phần có primary và secondary reviewer:

1. Web/BFF experience.
2. Mobile/offline sync.
3. Identity/security/platform.
4. Ledger financial domain.
5. Platform integrations/DevOps/QA automation.

Luân chuyển secondary reviewer để tránh knowledge silo; ledger và identity luôn có ít nhất hai người
hiểu luồng chính.
