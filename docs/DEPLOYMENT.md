# CI/CD và triển khai

## Pipeline hiện có

- `ci.yml`: install bằng lockfile, format/scaffold/Compose validation, lint, typecheck, test, build; sau
  đó bật Postgres/Redis/RabbitMQ/Kong và chờ health check.
- `security.yml`: CodeQL trên PR, main và lịch hằng tuần.
- `release-images.yml`: build/push image Web, 3 services và worker lên GHCR khi tag `v*` hoặc chạy tay.
- Dependabot kiểm tra npm, Docker image và GitHub Actions hằng tuần.

Pipeline hiện là **continuous delivery đến registry**, chưa tự ý deploy lên một cloud chưa được chọn.
Sau khi quyết định AWS/GCP/Azure/Render/Fly.io, thêm một job deploy dùng GitHub Environment, OIDC và
approval production; không dùng SSH password hoặc long-lived cloud key.

## Môi trường

| Environment | Dữ liệu               | Trigger                     | Quy tắc                                          |
| ----------- | --------------------- | --------------------------- | ------------------------------------------------ |
| Local       | Compose, giả lập      | developer                   | Không có secret thật                             |
| CI          | Ephemeral             | PR/push                     | Reset mỗi run                                    |
| Staging     | Managed, dữ liệu giả  | main hoặc release candidate | Auto deploy + E2E                                |
| Production  | Managed, dữ liệu thật | tag semver + approval       | Immutable image digest, canary/rolling, rollback |

Staging và production dùng account/project/network/secret riêng. Không dùng chung database, bucket,
queue hoặc signing key.

## Luồng release đề xuất

1. Merge PR vào `main` sau quality gates.
2. Build image một lần, scan SBOM/vulnerability, ký image (bước cần thêm khi chọn platform).
3. Deploy chính image digest đó lên staging; migration chạy bằng one-off job có lock.
4. E2E/security smoke pass.
5. Tạo tag SemVer, approval production, rolling/canary deploy.
6. Verify health, error rate, latency, queue backlog và business metrics; rollback image hoặc
   roll-forward migration nếu vượt threshold.

Không dùng `latest` cho image ứng dụng. Database migration phải backward-compatible trong ít nhất một
release: expand → deploy app → migrate data → contract ở release sau.

## Backup/DR baseline

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
