# Equa

Equa là nền tảng quản lý chi tiêu chung theo kiến trúc microservices. Repository này hiện là
**workspace scaffold**: có khung Web, Mobile, backend services, worker, hạ tầng local, quality gates
và pipeline phát hành image; chưa chứa business feature hay dữ liệu production.

## Bắt đầu nhanh

Yêu cầu: Node.js 24 LTS, Corepack/pnpm 11, Docker Desktop (hoặc Docker Engine + Compose v2), Git.

```bash
cp .env.example .env
corepack enable
corepack install --global pnpm@11.21.0
corepack install --global pnpm@11.21.0
pnpm infra:up
pnpm dev
```

Các địa chỉ local:

| Thành phần          | URL/port                         |
| ------------------- | -------------------------------- |
| Web                 | http://localhost:3000            |
| API Gateway (Kong)  | http://localhost:8000            |
| Mailpit             | http://localhost:8025            |
| RabbitMQ Management | http://localhost:15672           |
| MinIO Console       | http://localhost:9001            |
| PostgreSQL / Redis  | localhost:15432 / localhost:6379 |

Kiểm tra toàn bộ trước khi mở pull request:

```bash
pnpm ci
```

## Tài liệu chính

- [Kiến trúc và ranh giới service](docs/ARCHITECTURE.md)
- [Cài đặt máy và onboarding](docs/GETTING_STARTED.md)
- [Quy trình phát triển](docs/DEVELOPMENT.md)
- [Chiến lược kiểm thử](docs/TESTING_STRATEGY.md)
- [Triển khai và CI/CD](docs/DEPLOYMENT.md)
- [Bảo mật môi trường](docs/SECURITY.md)
- [Các quyết định kiến trúc](docs/adr/README.md)

## Cấu trúc repository

```text
apps/          web (Next.js), mobile (Expo/React Native)
services/      identity, ledger, platform
workers/       notification consumer
packages/      contracts dùng chung có kiểm soát
infra/         Compose, Kong, observability, Dockerfiles
docs/          architecture, onboarding, testing, ADR
.github/       CI, security scan, container release
```

Mọi client chỉ gọi API Gateway. Không service nào đọc/ghi trực tiếp database của service khác.
