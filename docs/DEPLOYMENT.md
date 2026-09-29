# CI/CD và triển khai

## Pipeline hiện có

- `ci.yml` chạy trên pull request và push lên `main`/`develop`: kiểm tra repository,
  chỉ chạy quality cho component bị ảnh hưởng, rồi dựng Compose infrastructure smoke test.
- `component-quality.yml` chạy build, lint, typecheck, test và coverage nếu component có script đó.
- `security.yml` chạy CodeQL trên pull request, `main`/`develop` và lịch hằng tuần.
- `release-images.yml` xuất bản các image deployable trong `.github/components.json` lên GHCR
  khi chạy tay hoặc push tag `v*`.
- `deploy-staging.yml` nhận push lên nhánh staging đã chọn bằng variable `STAGING_BRANCH`
  (mặc định `develop`). Chỉ component có target trong manifest mới được deploy; hiện chỉ Identity
  có deploy hook và HTTP smoke check.

Không có production deploy workflow trong repository. Staging hiện mới cấu hình Identity; không
suy ra Web, Social, Ledger, Automation & Sync, Platform hay Notification đã được deploy.

## Môi trường

| Environment | Dữ liệu               | Trigger hiện tại                                 | Trạng thái                                                       |
| ----------- | --------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Local       | Compose, dữ liệu giả  | Developer                                        | Có cấu hình local                                                |
| CI          | Ephemeral             | Pull request; push `main`/`develop`              | Quality theo component bị ảnh hưởng và infrastructure smoke test |
| Staging     | Managed, dữ liệu giả  | Push nhánh `STAGING_BRANCH` (mặc định `develop`) | Identity có deploy target; các component khác chưa được cấu hình |
| Production  | Managed, dữ liệu thật | Chưa có workflow                                 | Cần quyết định hạ tầng và quy trình trước khi triển khai         |

Khi cấu hình thêm component, mỗi staging target cần secret/database credentials riêng và smoke check
phù hợp. Không dùng chung database, bucket, queue hoặc signing key giữa staging và production.

## Luồng release đề xuất

1. Merge pull request sau quality gates.
2. Build image một lần, scan SBOM/vulnerability, ký image (bước cần thêm khi chọn platform).
3. Deploy cùng image digest lên staging; migration chạy bằng one-off job có lock.
4. E2E/security smoke pass.
5. Production approval, rolling/canary deploy và immutable image digest.
6. Verify health, error rate, latency, queue backlog và business metrics; rollback image hoặc
   roll-forward migration nếu vượt threshold.

Đây là quy trình đề xuất, chưa phải workflow production đang chạy. Không dùng `latest` cho image ứng
dụng. Database migration nên backward-compatible trong ít nhất một release: expand → deploy app →
migrate data → contract ở release sau.

## Backup/DR target (not configured or verified)

- PostgreSQL: daily backup + PITR; production RPO mục tiêu 1 giờ, RTO 1 giờ khi ngân sách cho phép.
- Object storage: versioning/lifecycle; receipt private.
- RabbitMQ không phải nguồn sự thật duy nhất; outbox/inbox cho phép replay.
- Thực hiện restore drill mỗi quý và lưu bằng chứng, không chỉ tin trạng thái “backup succeeded”.

## Quyết định còn cần Product Owner/DevOps chốt

- Cloud/region và ngân sách tháng.
- Domain, DNS/WAF/TLS và chính sách data residency.
- Managed identity hay tự vận hành identity.
- Payment/OCR/email/exchange-rate provider theo thị trường.
- Apple/Google developer account và Expo EAS organization.
