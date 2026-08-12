# ADR-003: PostgreSQL logical database per service

- Status: Accepted
- Date: 2026-08-12

## Decision

Local dùng một PostgreSQL instance với bốn database. Staging/production ban đầu có thể dùng một managed
instance nhưng database và role riêng; cấm cross-database query/JOIN từ application.

## Consequences

Chi phí vận hành thấp nhưng vẫn giữ ownership. Khi tách instance, contract không đổi. Backup/PITR ở
instance level phải đi kèm restore test từng database.
