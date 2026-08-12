# Onboarding và cài đặt môi trường

## 1. Phần mềm mọi developer cần

| Công cụ               |              Bắt buộc | Ghi chú                                                      |
| --------------------- | --------------------: | ------------------------------------------------------------ |
| Git                   |                    Có | Cấu hình tên/email và SSH key hoặc GitHub credential manager |
| Node.js 24 LTS        |                    Có | Dùng nvm/fnm/Volta; repo có `.nvmrc` và `.node-version`      |
| Corepack + pnpm 11.21 |                    Có | Không cài pnpm phiên bản tuỳ ý                               |
| Docker Desktop        |                    Có | macOS/Windows; Linux có thể dùng Engine + Compose v2         |
| VS Code               |           Khuyến nghị | Mở workspace để nhận extension/settings gợi ý                |
| GitHub CLI            |              Tuỳ chọn | Tạo/xem PR, kiểm tra workflow                                |
| Bruno hoặc Postman    |     Khuyến nghị BE/QA | Collection phải export và commit, không chứa secret          |
| Android Studio        |        Mobile Android | SDK + emulator; máy thật dùng Expo/dev build                 |
| Xcode                 | Mobile iOS, chỉ macOS | Simulator, signing khi chuẩn bị release                      |
| Expo Go/dev build     |                Mobile | Dev build là lựa chọn dài hạn khi thêm native module         |

Không cần cài PostgreSQL, Redis, RabbitMQ, Kong hay MinIO trực tiếp trên máy; Compose cung cấp cùng
phiên bản cho cả nhóm.

## 2. Thiết lập lần đầu

```bash
git clone <repository-url>
cd <repository-directory>
cp .env.example .env
corepack enable
corepack install --global pnpm@11.21.0
pnpm install
pnpm check:scaffold
pnpm check:compose
pnpm infra:up
pnpm dev
```

Không sửa `.env.example` bằng credential thật. Mỗi người giữ `.env` local; staging/production lấy secret
từ GitHub Environment và cloud secret manager.

## 3. Kiểm tra môi trường

```bash
node --version
pnpm --version
docker --version
docker compose version
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

Mở `http://localhost:3000` để xem Web shell; `http://localhost:8025` để xem email test;
`http://localhost:15672` để xem queue; `http://localhost:9001` để quản lý object local.

## 4. Lệnh hằng ngày

```bash
pnpm infra:up       # bật dependency local
pnpm dev            # hot reload tất cả package có dev task
pnpm ci             # gate giống CI trước PR
pnpm infra:logs     # xem log dependency
pnpm infra:down     # dừng, giữ volume dữ liệu
```

Muốn xoá volume để reset dữ liệu phải chạy thủ công `docker compose ... down -v`; thao tác này phá huỷ
dữ liệu local và không nằm trong script mặc định.

## 5. Thư viện dự kiến khi bắt đầu feature

Chỉ thêm khi feature đầu tiên dùng đến, tránh scaffold nặng và dependency không có owner.

- Web: TanStack Query, React Hook Form, Zod, i18n, Playwright.
- Mobile: Expo Router, expo-sqlite, secure-store, TanStack Query, NetInfo; queue sync riêng có
  idempotency key.
- Backend: ORM/migration (chọn Prisma hoặc Drizzle qua ADR), OpenAPI, validation, OpenTelemetry,
  RabbitMQ client, Argon2.
- Testing: Vitest unit, Testcontainers integration, Playwright web E2E, Maestro/Detox mobile, k6 load,
  OWASP ZAP baseline.

Mọi dependency mới phải có lý do trong PR, license phù hợp và không trùng chức năng với dependency đã
có.
