# Dịch vụ Identity

Identity chịu trách nhiệm xác thực, phiên đăng nhập và hồ sơ người dùng. Đây là dịch vụ duy nhất được
ghi vào `equa_identity`; Ledger và Platform phải dùng ID người dùng đã xác thực từ token hợp lệ.

## Phạm vi đã triển khai

- Đăng ký và xác thực bằng email/mật khẩu.
- Đăng nhập, access JWT thời hạn ngắn, xoay vòng phiên refresh và phát hiện tái sử dụng token.
- Đăng xuất, đăng xuất mọi thiết bị, đặt lại mật khẩu và các tuỳ chọn hồ sơ.
- Băm mật khẩu Argon2id, token opaque đã băm, bản ghi audit chỉ được ghi thêm và correlation ID.
- Adapter Mailpit ở local; adapter Resend cho staging/production.

## Giả định vận hành

`IDENTITY_JWT_SECRET` là secret dành cho staging/production. Mặc định access token có hạn 15 phút và
phiên refresh có hạn 30 ngày. OAuth và MFA được chủ động để lại cho giai đoạn sau; khi bổ sung phải
giữ ranh giới tích hợp với nhà cung cấp xác thực.
