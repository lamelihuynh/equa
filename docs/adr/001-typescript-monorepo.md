# ADR-001: TypeScript monorepo

- Status: Accepted
- Date: 2026-08-12

## Decision

Dùng Node.js 24 LTS, TypeScript, pnpm workspace và Turborepo; Next.js cho Web, Expo/React Native cho
Mobile, NestJS/Fastify cho backend.

## Consequences

Đội chia sẻ toolchain và contract nhanh hơn. Ranh giới service vẫn phải được bảo vệ: không import
domain/ORM model xuyên service. Tính tiền dùng integer/BigInt minor unit, không dùng JavaScript number.
