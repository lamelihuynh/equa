# Security baseline cho môi trường

- Không commit `.env`, private key, provider token hoặc production sample data.
- Local credential trong `.env.example` chỉ bind loopback; không tái sử dụng ở staging/production.
- GitHub Environment giữ metadata deploy; runtime secret ở cloud secret manager, cấp qua workload
  identity/OIDC và rotate định kỳ.
- Gateway là public entry duy nhất; database/broker/cache/object endpoint nằm private network.
- TLS 1.2+; JWT asymmetric, access token ngắn, refresh rotation/reuse detection; service vẫn kiểm tra
  ownership chứ không tin gateway tuyệt đối.
- Password dùng Argon2id; token/OTP lưu hash; payment dùng hosted checkout/tokenization.
- Receipt validate real MIME, size, random key và malware scan; bucket private + signed URL.
- Structured audit append-only cho login/security, expense mutation, settlement/payment, subscription
  và admin action.
- Log redaction mặc định cho Authorization/Cookie/token/password/email/receipt/payment metadata.

Trước khi có user thật: threat model cho auth/offline sync/payment, ZAP baseline, restore drill, incident
runbook, dependency/image scan, rate limit abuse cases và review OWASP ASVS/API Top 10.
