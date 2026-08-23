# Kiểm thử Identity

Chạy unit test bằng `pnpm --filter @equa/identity-service test`. Bộ test hiện bao phủ health check,
chính sách mật khẩu và việc xác minh access token đã ký. Trước staging, cần mở rộng bằng integration
test PostgreSQL/Redis cho migration, xoay vòng/phát hiện tái sử dụng refresh token, adapter email và
bản ghi audit; phải dùng credential cô lập, tuyệt đối không dùng dữ liệu staging.

Workflow staging chạy lint, typecheck, coverage và build image trước khi kích hoạt Render. Sau deploy,
smoke test gọi health endpoint công khai qua API Gateway.
