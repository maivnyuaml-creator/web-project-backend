# Velora Live — Backend Project Instructions & AI Rules

## 1. Tech Stack & Environment
- **Framework:** NestJS (TypeScript, Strict Mode)
- **Database & ORM:** PostgreSQL 16 with Prisma ORM
- **Cache & State:** Redis 7 (`ioredis`)
- **Authentication:** JWT (JSON Web Token) with Argon2id hashing & HttpOnly cookies
- **Object Storage:** S3 / MinIO compatible storage

## 2. Strict Role-Based Access Control (RBAC) Rules
The system strictly supports **only 3 roles**, and these roles **must NEVER be mixed or blended**:

1. `viewer` (Viewer / ຜູ້ຊົມທົ່ວໄປ):
   - Watch live streams
   - Send tips / participate in chat
   - Purchase tokens & manage viewer wallet
2. `creator` (Creator / ຜູ້ສ້າງເນື້ອຫາ):
   - Broadcast live streams (RTMP ingest credentials, room management)
   - Upload & manage media vault / gallery
   - Manage tip menu, view creator earnings & request payouts
3. `admin` (Administrator / ຜູ້ດູແລລະບົບ):
   - Full system administration & oversight
   - Review creator verification & applications
   - Moderation, user management, and payout approvals

### Guard & Decorator Requirements
- Every protected endpoint **MUST** enforce proper guards using `@UseGuards(JwtAuthGuard, RolesGuard)`.
- Restrict endpoint access explicitly with `@Roles(...)` custom decorator.
- Never grant `creator` or `admin` capabilities to `viewer`, and never cross-pollinate creator/viewer-only actions without appropriate role checks.

## 3. Code Standards for NestJS
- **Validation:** Always use DTOs (Data Transfer Objects) with `class-validator` / `class-transformer` or `zod` for request payload validation.
- **Exception Handling:** Always throw built-in NestJS `HttpException` (e.g., `NotFoundException`, `ForbiddenException`, `BadRequestException`, `ConflictException`) with clear, descriptive error messages.
- **Architecture:** Keep controllers thin; place all business logic, transactions, and domain rules in dedicated services.
- **Configuration & Secrets:** Never hardcode secrets, ports, or API keys; always access environment variables via NestJS `ConfigService`.
- **Financial Invariants:** Monetary amounts must always be represented as integers in minor units (e.g., cents) and all token ledger mutations must be atomic and append-only.
