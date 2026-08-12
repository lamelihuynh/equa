# Chiến lược kiểm thử

## Quality gates theo tầng

| Tầng        | Chạy khi nào          | Mục tiêu                                                                  |
| ----------- | --------------------- | ------------------------------------------------------------------------- |
| Static      | Mọi commit/PR         | format, lint, strict typecheck, secret/dependency/code scan               |
| Unit        | Mọi PR                | Domain policy, validation, mapper; nhanh và không cần network             |
| Integration | Mọi PR bị ảnh hưởng   | PostgreSQL/Redis/RabbitMQ thật bằng container, migration thật             |
| Contract    | Mọi PR thay API/event | OpenAPI compatibility + consumer/provider contract                        |
| E2E smoke   | main/staging          | register/login, create group/expense, balance, settlement, offline resync |
| Security    | PR + lịch tuần        | CodeQL/dependency scan; ZAP baseline ở staging                            |
| Performance | Trước release lớn     | k6 theo P95/P99 trong SRS; theo dõi regression                            |

## Logic tài chính

Module split/balance/debt simplification phải có coverage tối thiểu 80% và property/invariant tests:

- Tổng participant shares bằng chính xác expense total ở minor unit.
- Percentage = 100%; share total > 0; rounding deterministic.
- Tổng net balance trong closed group bằng 0.
- Sửa/xoá expense cập nhật balance đúng một lần kể cả event retry.
- Settlement không sửa expense history.
- Debt simplification giữ nguyên net balance từng user.
- Cùng idempotency key không tạo hai expense/settlement/recurring instance.

Coverage không thay thế case quality; CI sẽ thêm threshold khi module tài chính đầu tiên xuất hiện, không
đặt threshold giả cho scaffold rỗng.

## Integration và contract

- Mỗi suite tạo database/queue riêng và chạy migration từ đầu; không dùng database developer.
- Test outbox publisher, duplicate event, out-of-order event, retry, DLQ và provider timeout.
- OpenAPI là contract của Gateway; breaking change cần version mới hoặc migration window.
- Event schema có version; producer phải giữ compatibility với consumer đang deploy.

## Mobile offline

Test tối thiểu: tạo/sửa khi offline, app restart khi queue còn pending, reconnect, request duplicate,
server version conflict, partial sync, clock lệch, nhiều thiết bị và token hết hạn lúc reconnect. Dữ liệu
local phải mã hoá/secure-store đúng theo phân loại.

## Test data

Không dùng production dump. Factory sinh user/group/expense giả; currency gồm 0/2/3 minor digits;
case biên gồm số rất lớn, phần dư rounding, timezone/DST, Unicode và 7 locale.
