# ADR-005: RabbitMQ với outbox/inbox

- Status: Accepted
- Date: 2026-08-12

## Decision

Dùng RabbitMQ cho integration event. Producer ghi outbox cùng transaction domain; publisher chuyển
event; consumer lưu inbox/idempotency, retry có backoff và DLQ.

## Consequences

Hệ thống chấp nhận at-least-once delivery và thiết kế handler idempotent. RabbitMQ không trở thành
nguồn dữ liệu tài chính; có thể replay từ outbox/audit khi cần.
