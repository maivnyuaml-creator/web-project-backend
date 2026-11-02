# Velora Live — Backend Platform

Velora Live is a secure, high-concurrency backend API and real-time streaming engine built for verified adult live-streaming. It provides REST APIs under `/api/v1`, real-time Socket.IO chat and presence, an immutable transactional token ledger, role-based authorization, provider abstraction layers (streaming, payments, identity, storage), and tamper-evident audit logging.

---

## 1. Technology Stack

- **Framework**: [NestJS](https://nestjs.com/) v12 with TypeScript strict mode
- **Primary Database**: PostgreSQL 16
- **ORM & Migrations**: [Prisma ORM](https://www.prisma.io/) v6 with versioned migrations
- **Distributed Cache & State**: Redis 7 via `ioredis` (room viewer counts, rate limiting, distributed atomic locking)
- **Real-time Engine**: [Socket.IO](https://socket.io/) namespace `/chat` with connection authentication
- **Password Security**: Argon2id via `argon2`
- **Session Strategy**: HttpOnly secure cookies + Bearer access token support
- **Object Storage**: S3-compatible object storage (AWS S3 SDK / MinIO) with short-lived presigned URLs
- **API Documentation**: OpenAPI / Swagger (`/api/docs`)
- **Containerization**: Docker & Docker Compose

---

## 2. Architecture & Modules

The backend is organized into 24 distinct NestJS modules with clear separation of controllers, services, DTOs, and provider adapters:

| # | Module | Description |
|---|---|---|
| 1 | `AuthModule` | Email/password registration, login, logout, refresh, email verification, password reset, 2FA |
| 2 | `UsersModule` | Authenticated profile retrieval (`/users/me`), profile updates, account deactivation/deletion |
| 3 | `SessionsModule` | Active session tracking, device management, remote session revocation |
| 4 | `AgeVerificationModule` | Identity & age verification sessions, provider webhooks, adult compliance |
| 5 | `CreatorApplicationsModule`| Creator onboarding, government ID submission, admin review workflows |
| 6 | `CreatorProfilesModule` | Verified creator stage profiles, rates, and tip menu item management |
| 7 | `RoomsModule` | Live stream rooms, categorization, viewer presence, live status toggling |
| 8 | `StreamingModule` | RTMP ingest provisioning, stream key rotation, signed HLS playback access |
| 9 | `ChatModule` | Real-time Socket.IO gateway, automated safety filters, room-scoped messaging |
| 10 | `WalletModule` | Token balances, immutable append-only ledger entries, double-spending prevention |
| 11 | `TokenPackagesModule` | Catalog of token bundles with integer minor-unit pricing |
| 12 | `PaymentsModule` | Checkout session creation, HMAC-SHA256 signature verification, webhook processing |
| 13 | `TipsModule` | Transactional tipping, authoritative price resolution, automated revenue sharing |
| 14 | `ShowsModule` | Private & group show session state machine (`REQUESTED` → `ACTIVE` → `ENDED`) |
| 15 | `FavoritesModule` | Follow / favorite creators, dynamic follower counts, live notifications |
| 16 | `NotificationsModule` | User notifications for tips, payments, system alerts |
| 17 | `EarningsModule` | Creator gross/net earnings breakdown, platform fee accounting |
| 18 | `PayoutsModule` | Creator withdrawal requests, bank wire/wallet configuration, admin approval |
| 19 | `MediaModule` | Image/document upload to S3/MinIO, MIME validation, presigned download URLs |
| 20 | `ReportsModule` | User reporting for harassment, room violations, media, or chat |
| 21 | `ModerationModule` | Moderator actions: warnings, chat mutes, room kicks, bans, stream termination |
| 22 | `AdminModule` | Protected administrator console endpoints with strict role-based access |
| 23 | `AuditModule` | Immutable audit trail for authentication, approvals, financial actions, and bans |
| 24 | `HealthModule` | Subsystem health monitoring (PostgreSQL, Redis, uptime) |

---

## 3. Financial Correctness & Ledger Design

Velora Live enforces strict financial invariants:

1. **Integer Minor Units**: All monetary values are represented as integers in minor units (e.g., 999 cents = $9.99 USD). Token balances are positive integers.
2. **Append-Only Ledger**: Balances are never modified by direct updates without an immutable `WalletLedgerEntry` recording `balanceAfter`, `type`, `referenceType`, `referenceId`, and `idempotencyKey`.
3. **Double-Spending Prevention**: Tipping and show billing utilize distributed atomic locking via Redis and database transactions. If a viewer balance is lower than the required amount, the transaction fails immediately.
4. **Authoritative Pricing**: Token package prices and tip menu prices are fetched from the server database—never from client requests.
5. **Deduplication**: Payment webhooks and tip operations require unique idempotency keys. Duplicate events are acknowledged without duplicate credit.

---

## 4. Local Development Setup

### Prerequisites
- Node.js 20+ (Node.js 24 supported)
- npm 10+
- Docker & Docker Compose (optional for local PostgreSQL/Redis/MinIO)

### Quick Start

1. **Clone repository and install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start infrastructure services (PostgreSQL, Redis, MinIO)**:
   ```bash
   docker compose up -d postgres redis minio
   ```

4. **Run database migrations and seed default data**:
   ```bash
   # Generate Prisma client
   npx prisma generate

   # Run PostgreSQL migrations
   npx prisma migrate dev

   # Seed default categories, packages, admin, test creator, and viewer
   npm run prisma:seed
   ```

5. **Start backend development server**:
   ```bash
   npm run start:dev
   ```

6. **Access Swagger OpenAPI Documentation**:
   Open [http://localhost:3000/api/docs](http://localhost:3000/api/docs) in your browser.

---

## 5. Seed Accounts & Credentials

The seed script (`prisma/seed.ts`) provisions the following testing accounts:

| Role | Email | Password | Initial State |
|---|---|---|---|
| **Administrator** | `admin@velora.live` | `VeloraAdmin2026!` | Role: `ADMINISTRATOR`, Wallet: 10,000 tokens |
| **Verified Creator** | `creator@velora.live` | `VeloraCreator2026!` | Stage: `Aria Star`, Approved, default tip menu |
| **Test Viewer** | `viewer@velora.live` | `VeloraViewer2026!` | Role: `VIEWER`, Wallet: 500 tokens |

---

## 6. Testing

The repository includes both unit tests and end-to-end integration tests:

```bash
# Run unit tests (wallet, tips, rooms, payments, auth)
npm run test

# Run end-to-end API integration tests
npm run test:e2e

# Run with test coverage
npm run test:cov
```

All 18 unit tests across 5 suites and 6 e2e test suites pass.

---

## 7. Production Readiness Checklist

Before transitioning to production:

- [ ] **Payment Acquiring**: Replace `SandboxPaymentProvider` with an approved adult high-risk acquiring merchant account (e.g., CCBill, Segpay, Epoch) and configure merchant webhook secrets.
- [ ] **Identity & 2257 Compliance**: Replace `SandboxIdentityProvider` with a certified KYC/age verification provider (e.g., Veriff, Persona, Yoti) supporting government ID OCR and liveness detection.
- [ ] **Media & Streaming Engine**: Connect `SandboxStreamingProvider` to an RTMP/WebRTC ingestion cluster (e.g., Ant Media Server, OvenMediaEngine, or AWS IVS) and verify webhook HMAC signatures.
- [ ] **S3 Object Storage**: Point `S3_ENDPOINT` to AWS S3 or a production multi-region Ceph/MinIO cluster with encrypted private buckets for verification documents.
- [ ] **SSL / TLS**: Enforce HTTPS and secure cookie attributes (`secure: true`, `sameSite: 'strict'`).
