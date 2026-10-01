---
paths:
  - "src/server/**"
---

# NestJS server rules

- **Multi-tenant.** Every query and write is scoped by the store/tenant. Read one existing module first and copy how tenant scope is obtained; never trust a tenant id from the request body.
- **POS compatibility (N-1).** Do not remove/rename/retype endpoints, fields, enum values, or status codes the POS uses (auth, products/categories pull, sales upload, shift sync, reconciliation, health). New request fields are optional; new response fields are additive.
- **Sales upload is idempotent.** POS retries with backoff (`queue-manager.ts`). Upsert by the sale's client id; a retried sale returns success. Sale + items in one `$transaction`.
- Product/category pull returns only changed rows since the client's timestamp, including inactive ones, so terminals can hide them.
- Guards: `JwtAuthGuard` + role guard on every controller; admin mutations write an `AuditLog` row. Cashiers only see their own data; enforce in the service.
- Money and quantities are Prisma `Decimal`; serialize as string or via the module's existing serializer. No float math on money.
- DTOs: match the module you're next to (class-validator + `@nestjs/swagger` decorators). Whitelist unknown props on new endpoints; stay lenient on endpoints existing terminals call.
- Bilingual fields: return both `nameUz` and `nameRu`.
- Cron/scheduled jobs (`@nestjs/schedule`) must be idempotent and safe to run twice.
- The Telegram bot (separate VPS, PM2) reads the same PostgreSQL via an SSH tunnel. Before changing a table it may use, grep for it in the bot repo or ask.
- Logging with Nest `Logger`, never `console.log`. Never log tokens, passwords, or full request bodies.
- Tests: `*.test.ts` next to the code (Jest, ts-jest). Every new service method gets one.
