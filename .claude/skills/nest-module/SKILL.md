---
name: nest-module
description: Add or extend a NestJS module, controller, service, DTO or endpoint in src/server following this repo's patterns (multi-tenant, guards, audit log, Swagger, Jest). Use whenever the user asks for a new API endpoint, resource, CRUD, report, or server feature, even without saying "module".
---

# NestJS feature workflow

1. **Read first.** Open one existing module under `src/server/modules/` (the closest in purpose) and copy its patterns: how tenant scope is obtained, guards, DTO validation, Swagger decorators, error handling. Do not invent a new style.
2. **Contract check.** If an endpoint the POS calls is involved, changes must be additive (N-1 compatibility, see rules). New endpoints are free-form.
3. **Files** in `src/server/modules/<name>/`: `<name>.module.ts`, `.controller.ts`, `.service.ts`, `dto/*.dto.ts`, `<name>.service.test.ts`. Register the module where the others are registered; export the service only if another module needs it.
4. **Security defaults:** JWT + role guards on the controller; admin mutations write an `AuditLog` row; cashier data scoped in the service; tenant/store scope on every query.
5. **Data:** Prisma only inside services; `$transaction` when writing several tables; `Decimal` for money and quantities; response DTOs (no password, cost, or profit fields for cashiers).
6. **Idempotency** for anything the POS can retry (uploads, syncs).
7. Schema changes → skill `prisma-migration`. UI needs → the web dashboard (`src/web`) or POS (skill `ipc-feature`).
8. Tests (`*.test.ts`), then `/check`. Push to `dev` and verify on staging.

## Shape of a tenant-scoped, audited write

```ts
async create(dto: CreateThingDto, actor: AuthUser, tenantId: string): Promise<ThingResponseDto> {
  return this.prisma.$transaction(async (tx) => {
    const row = await tx.thing.create({ data: { ...dto, storeId: tenantId } });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.nameRu,
        action: 'create_thing',
        entity: 'thing',
        entityId: String(row.id),
        details: JSON.stringify({ name: row.nameRu }),
      },
    });
    return toThingResponse(row);
  });
}
```

Names (`storeId`, `AuthUser`, how the tenant is resolved) are placeholders: use the real ones from the module you read in step 1.
