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

## Phân công gợi ý cho 5 developer

Không cố định vĩnh viễn, nhưng mỗi phần có primary và secondary reviewer:

1. Web/BFF experience.
2. Mobile/offline sync.
3. Identity/security/platform.
4. Ledger financial domain.
5. Platform integrations/DevOps/QA automation.

Luân chuyển secondary reviewer để tránh knowledge silo; ledger và identity luôn có ít nhất hai người
hiểu luồng chính.
