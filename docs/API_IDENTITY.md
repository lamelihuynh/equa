# API Identity

Đường dẫn gốc: `/v1`. Swagger được phục vụ tại `/v1/docs`.

| Phương thức | Đường dẫn                  | Mục đích                                           |
| ----------- | -------------------------- | -------------------------------------------------- |
| POST        | `/auth/register`           | Tạo người dùng `UNVERIFIED` và gửi link xác thực email |
| POST        | `/auth/verify-email`       | Kích hoạt người dùng từ token dùng một lần         |
| POST        | `/auth/resend-verification`| Gửi lại email mà không tiết lộ email có tồn tại hay không |
| POST        | `/auth/login`              | Cấp access token và phiên refresh                  |
| POST        | `/auth/refresh`            | Xoay vòng refresh token                            |
| POST        | `/auth/logout`             | Thu hồi phiên refresh hiện tại                     |
| POST        | `/auth/logout-all`         | Thu hồi mọi phiên của người dùng đã xác thực       |
| POST        | `/auth/forgot-password`    | Yêu cầu link đặt lại mà không tiết lộ email có tồn tại hay không |
| POST        | `/auth/reset-password`     | Đặt lại mật khẩu và thu hồi các phiên              |
| GET/PATCH   | `/profile/me`              | Đọc/cập nhật hồ sơ của người dùng đã xác thực      |
| POST        | `/profile/me/avatar`       | Tải avatar JPEG/PNG/WebP lên MinIO (tối đa 2 MB)   |

Web nhận refresh token dưới dạng cookie `HttpOnly`. Mobile gửi `X-Equa-Client: mobile` và có trách
nhiệm lưu refresh token trả về trong kho lưu trữ bảo mật của nền tảng.
