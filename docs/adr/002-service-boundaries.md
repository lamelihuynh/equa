# ADR-002: Service boundaries ban đầu

- Status: Accepted
- Date: 2026-08-12

## Decision

Khởi đầu bằng Identity, Ledger, Platform và Notification worker. Expense, split, balance, debt và
settlement nằm chung Ledger để bảo toàn invariant bằng local transaction.

## Consequences

Ít deployable hơn sơ đồ microservice cực nhỏ, nhưng ownership/API/database vẫn độc lập. Tách analytics,
search hoặc integration trước nếu metric chứng minh cần; không tách financial write path chỉ vì tên
entity khác nhau.
