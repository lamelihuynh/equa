# Runbook vận hành dịch vụ Identity

Đây là tài liệu hướng dẫn vận hành `@equa/identity-service`. Xem
`docs/IDENTITY_SERVICE.md` để biết phạm vi và `docs/API_IDENTITY.md` để xem danh sách endpoint.

## 1. Ranh giới dịch vụ và kiến trúc

Identity chịu trách nhiệm cho ranh giới xác thực của Equa. Đây là dịch vụ duy nhất được ghi vào cơ sở
dữ liệu PostgreSQL `equa_identity`. Ledger và Platform không bao giờ đọc bảng của Identity; thay vào
đó, chúng nhận ID người dùng đã được xác minh trong access JWT/request đã xác thực ở gateway.

```text
Web (Next.js) / Mobile (Expo)
               |
               | HTTPS: /v1/auth, /v1/profile
               v
         Kong API Gateway
               |
               | proxy, CORS, 300 request/phút, correlation ID
               v
      Identity (NestJS + Fastify, cổng 3001)
          |             |                 |
          v             v                 v
 PostgreSQL          Mailpit/Resend       MinIO (avatar)
 equa_identity      local / staging       Lưu trữ tương thích S3
```

Route Kong nằm tại `infra/kong/kong.yml`. Ở local, upstream Identity là
`host.docker.internal:3001` và nhận `/v1/auth`, `/v1/profile`, `/v1/identity`.
Kong tạo hoặc truyền `X-Correlation-ID`; Identity trả lại header này trong response và lưu vào audit.

| Thành phần | Trách nhiệm | Dữ liệu trạng thái |
| --- | --- | --- |
| NestJS Identity | đăng ký, đăng nhập, xác minh/xoay token, đặt lại mật khẩu, hồ sơ | không có ngoài các dependency |
| PostgreSQL | người dùng, hồ sơ, phiên, token một lần, audit log, lịch sử migration | `equa_identity` |
| Kong | điểm vào công khai, khớp route, CORS, giới hạn dung lượng và rate limit dùng Redis | cấu hình khai báo |
| Redis | bộ đếm rate limit của Kong; các nhu cầu session/rate limit sau này | dữ liệu cache tạm/lưu bền |
| Mailpit / Resend | bắt email local / email giao dịch thật | thư được giữ bởi nhà cung cấp |
| MinIO | chỉ lưu object avatar; database lưu object key | object S3 |

## 2. Luồng xác thực

1. `POST /v1/auth/register` kiểm tra payload, băm mật khẩu bằng Argon2id, tạo người dùng/hồ sơ
   `UNVERIFIED`, lưu *hash* của token xác minh dùng một lần, ghi audit log, rồi gửi link qua Mailpit
   (local) hoặc Resend (staging).
2. `POST /v1/auth/verify-email` sử dụng token đó và kích hoạt tài khoản.
3. `POST /v1/auth/login` cấp access JWT đã ký (mặc định 15 phút) và refresh token opaque (mặc định
   30 ngày). PostgreSQL chỉ lưu hash của refresh token.
4. Web chỉ nhận refresh token trong cookie `HttpOnly`, `SameSite=Lax`. Mobile gửi
   `X-Equa-Client: mobile`, nhận token trong JSON và phải lưu bằng Expo SecureStore / secure storage
   native, không được dùng AsyncStorage.
5. `POST /v1/auth/refresh` xoay vòng refresh token. Việc tái sử dụng token đã thu hồi sẽ thu hồi cả
   family của token; người dùng phải đăng nhập lại. `logout`, `logout-all` và đặt lại mật khẩu đều
   thu hồi phiên.
6. Route hồ sơ được bảo vệ yêu cầu `Authorization: Bearer <access-token>`.

## 3. Khởi động local

### Điều kiện cần

- Node **24.x** (`node -v`; CI bắt buộc `>=24 <25`). Node 22 có thể chạy nhưng không được hỗ trợ.
- pnpm 11.21.0, Docker Desktop đang chạy.
- File `.env` local được copy từ `.env.example`; không bao giờ commit file này.

### Thiết lập một lần

```bash
cd /Users/huynhnhatlinh0305/equa
cp .env.example .env
# Đặt IDENTITY_JWT_SECRET ngẫu nhiên, duy nhất, tối thiểu 32 ký tự trong .env.
pnpm install --frozen-lockfile
pnpm infra:up
pnpm --filter @equa/identity-service db:migrate
```

Migration đọc `.env` ở root, kết nối bằng `IDENTITY_DATABASE_URL` và ghi từng SQL file đã áp dụng vào
`equa_identity.schema_migrations`. Có thể chạy lại an toàn: migration đã ghi nhận sẽ được bỏ qua.

### Chạy dịch vụ và client

Dùng các terminal riêng:

```bash
pnpm --filter @equa/identity-service dev
pnpm --filter @equa/web dev
pnpm --filter @equa/mobile start
```

| Địa chỉ | Ý nghĩa |
| --- | --- |
| `http://localhost:8000/v1/docs` | Swagger qua Kong, khi Kong và Identity đều chạy |
| `http://localhost:3001/v1/docs` | Swagger gọi trực tiếp Identity; chỉ dùng debug, client dùng Kong |
| `http://localhost:8025` | Hộp thư Mailpit cho email xác minh/đặt lại |
| `http://localhost:9001` | Console MinIO |
| `http://localhost:15672` | Console RabbitMQ; không cần cho luồng xác thực đồng bộ của Identity |

## 4. Cách kiểm thử

### Kiểm tra nhanh health và gateway

```bash
curl -i http://localhost:3001/health
curl -i http://localhost:8000/v1/docs
curl -i -H 'X-Correlation-ID: identity-demo-001' \
  http://localhost:8000/v1/profile/me
```

Request cuối cần trả `401` khi chưa có bearer token, nhưng phải chứa cùng `X-Correlation-ID`. Điều đó
chứng minh Kong đã khớp route và Identity đã thực thi xác thực. `404` nghĩa là không khớp path tại
Kong; `502/503` nghĩa là Kong không tới được tiến trình Identity; `401` nghĩa route chạy đúng nhưng
thiếu xác thực.

### Kịch bản end-to-end thủ công

1. Trong Swagger, gọi `POST /v1/auth/register` bằng email chưa dùng và mật khẩu hợp lệ.
2. Mở Mailpit, copy tham số `token` từ URL xác minh, sau đó gọi `POST /v1/auth/verify-email` với
   `{ "token": "..." }`.
3. Gọi `POST /v1/auth/login`; lưu `accessToken` (request từ web cũng nhận refresh cookie).
4. Gọi `GET /v1/profile/me` với `Authorization: Bearer <accessToken>`.
5. Gọi `POST /v1/auth/refresh`, rồi lặp lại bước 4 với access token mới.
6. Gọi `POST /v1/auth/logout-all` bằng bearer token. Một lần refresh sau đó phải thất bại.

Để test avatar, dùng `POST /v1/profile/me/avatar` với field multipart `file` và ảnh JPEG, PNG hoặc
WebP nhỏ hơn 2 MB. Kiểm tra `avatarKey` trả về và bucket `equa-avatars` trong MinIO.

### Cổng kiểm tra tự động

```bash
pnpm --filter @equa/identity-service lint
pnpm --filter @equa/identity-service typecheck
pnpm --filter @equa/identity-service test
pnpm --filter @equa/identity-service test:coverage
pnpm --filter @equa/identity-service build
```

Test hiện tại là **unit test** cho health, chính sách mật khẩu và xác minh JWT đã ký. Chúng chưa chứng
minh được PostgreSQL, MinIO, email, xoay refresh token hoặc tích hợp Kong. Trước khi tuyên bố
Identity hoàn chỉnh, cần thêm integration test Docker/Testcontainers cho migration,
register/verify/login/tái sử dụng refresh/logout, gửi Mailpit, upload MinIO và smoke test route Kong.
Đây là hạng mục còn lại, không được coi là coverage đã đạt.

## 5. Cấu hình và secret

Giá trị mặc định local nằm ở `.env.example`; giá trị thật phải đặt trong `.env` local và biến môi
trường được mã hóa của Render ở staging. Không commit hoặc ghi log URL database, JWT secret, Resend
key, mật khẩu SMTP hay S3 secret.

| Nhóm biến | Dùng cho | Ghi chú |
| --- | --- | --- |
| `IDENTITY_DATABASE_URL` | migration và service | chỉ trỏ đến `equa_identity` |
| `IDENTITY_JWT_SECRET`, `IDENTITY_JWT_ISSUER`, `IDENTITY_JWT_AUDIENCE` | token | secret riêng cho từng môi trường |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` | email staging thật | staging dùng Resend; domain người gửi phải xác thực |
| `SMTP_HOST`, `SMTP_PORT` | Mailpit local | chỉ local |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_AVATAR_BUCKET` | avatar | MinIO local, lưu trữ tương thích được quản lý ở staging |
| `APP_WEB_URL` | link email | URL Vercel staging tại staging |
| `REDIS_URL` | kiểm soát cấp ứng dụng tương lai | Kong hiện kết nối trực tiếp Redis của Compose |

## 6. Deploy lên staging

Quy trình deploy: merge đã duyệt vào `develop` -> GitHub Actions kiểm tra -> publish image lên GHCR
-> Render deploy hook khởi chạy image được pin -> chạy smoke test health Kong công khai. Workflow:
`.github/workflows/deploy-staging.yml`.

Trước lần deploy đầu tiên, maintainer phải:

1. Tạo PostgreSQL managed và đặt `IDENTITY_DATABASE_URL`.
2. Tạo Render Identity web service từ image GHCR, public `/health` và thêm secret Render theo
   `docs/STAGING_DEPLOYMENT.md`.
3. Cấp route Kong/API gateway ở staging chuyển tiếp `/v1/auth` và `/v1/profile` đến Render. Đặt
   GitHub Environment variable `STAGING_API_BASE_URL` là URL **gateway** này, không phải URL trực tiếp
   của Identity.
4. Thêm GitHub Environment secret `RENDER_IDENTITY_DEPLOY_HOOK`.
5. Cấu hình deploy Vercel cho `develop` với `NEXT_PUBLIC_API_BASE_URL` bằng URL gateway; đặt
   `APP_WEB_URL` tại Render bằng URL Vercel staging.
6. Cấu hình domain gửi đã được Resend xác thực. Trước đó, gửi mail thật bị giới hạn bởi quy tắc test.
7. Chạy migration đã được review trên staging trước khi code phụ thuộc schema mới. Không bao giờ trỏ
   lệnh migration local vào credential staging.

Mỗi lần push lên `develop` sẽ chạy lint, typecheck, coverage, build/push image, trigger Render và
`GET $STAGING_API_BASE_URL/health`. Job lỗi đồng nghĩa staging chưa deploy; cần xem step lỗi trong
Actions trước khi chạy lại.

## 7. Vận hành và chẩn đoán

| Triệu chứng | Kiểm tra | Cách xử lý |
| --- | --- | --- |
| `IDENTITY_DATABASE_URL must be configured` | `.env` root có key khác rỗng; chạy từ root repository | copy `.env.example`, đặt URL, chạy lại migration |
| migration không kết nối được | `pnpm infra:up`, trạng thái Compose, host/cổng DB | chạy Docker hoặc sửa URL; không tùy tiện xóa volume |
| Kong `404` | path gọi và `infra/kong/kong.yml` | dùng `/v1/auth` hoặc `/v1/profile`, sau đó restart/deploy Kong sau khi đổi config |
| Kong `502/503` | tiến trình Identity cổng 3001; log Kong | chạy Identity hoặc sửa upstream |
| `401` ở profile | bearer header và hạn access token | login/refresh rồi gửi lại header Authorization |
| không có email | Mailpit local; cấu hình/domain provider staging | xem log provider; không để lộ token trong log |
| upload avatar lỗi | 2 MB/loại file, MinIO, credential/bucket | sửa cấu hình object storage và giữ quan hệ DB/object |
| deploy lỗi sau khi push image | Render hook trong Actions và health gateway | kiểm tra hook, log Render, sau đó route gateway |

Dùng `X-Correlation-ID` từ response client để liên kết log Kong, Identity và audit. Phải che access
token, refresh token và credential trong log/ảnh chụp.

## 8. Khôi phục phiên bản và an toàn dữ liệu

- Ứng dụng: chọn image SHA GHCR bất biến trước đó trong Render rồi deploy lại.
- Migration database chỉ chạy theo hướng tiến. Không xóa row/table hoặc sửa `schema_migrations` để
  “undo” release; hãy tạo migration sửa lỗi được review hoặc khôi phục từ backup database đã kiểm tra.
- Sự cố lộ secret: xoay `IDENTITY_JWT_SECRET` (làm vô hiệu access token) và credential Resend/S3/DB
  đã lộ; thu hồi các refresh session đang hoạt động khi phù hợp.

## 9. Checklist theo trách nhiệm

| Nhóm phụ trách | Việc cần làm trước demo/release sprint |
| --- | --- |
| Backend | migration, các cổng kiểm tra tự động và kịch bản xác thực thủ công |
| QA | expected/actual cho đăng ký, xác minh, login, refresh, logout, reset, profile, avatar và trường hợp lỗi |
| DevOps | bảo vệ `develop`, cấu hình secret GitHub/Render/gateway, log và chính sách backup |
| Frontend/Mobile | chỉ gọi gateway; web bật credentials; mobile lưu refresh token an toàn |
