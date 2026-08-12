# Architecture Decision Records

| ADR                               | Trạng thái | Quyết định                                   |
| --------------------------------- | ---------- | -------------------------------------------- |
| [001](001-typescript-monorepo.md) | Accepted   | TypeScript monorepo cho đội 5 người          |
| [002](002-service-boundaries.md)  | Accepted   | 3 service + notification worker ban đầu      |
| [003](003-database-strategy.md)   | Accepted   | Logical database per service trên PostgreSQL |
| [004](004-kong-db-less.md)        | Accepted   | Kong DB-less làm API Gateway                 |
| [005](005-rabbitmq-outbox.md)     | Accepted   | RabbitMQ + transactional outbox/inbox        |

ADR không bị sửa để viết lại lịch sử; quyết định mới sẽ supersede ADR cũ.
