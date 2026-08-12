# ADR-004: Kong Gateway DB-less

- Status: Accepted
- Date: 2026-08-12

## Decision

Dùng Kong Gateway ở DB-less mode, declarative config lưu trong Git. Redis hỗ trợ rate-limit counter.

## Consequences

Không cần database riêng cho Gateway, config review/deploy được như code. Admin API read-only/không
public. JWT/JWKS/key rotation phải được hoàn thiện cùng Identity trước khi mở API business.
