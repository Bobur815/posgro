# POSGRO Architecture Analysis
### Complete Reference for Replicating Multi-Tenant Architecture in a Medical CRM

---

## Table of Contents

1. [Project Structure & Tech Stack](#1-project-structure--tech-stack)
2. [Multi-Tenant Database Architecture](#2-multi-tenant-database-architecture)
3. [Admin Dashboard](#3-admin-dashboard)
4. [API Structure & Tenant Isolation](#4-api-structure--tenant-isolation)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Electron Sync System](#6-electron-sync-system)
7. [Shared Types & Utilities](#7-shared-types--utilities)
8. [Environment & Deployment](#8-environment--deployment)
9. [Adding New Tenant Types](#9-adding-new-tenant-types)
10. [Medical CRM Mapping](#10-medical-crm-mapping)

---

## 1. Project Structure & Tech Stack

### Package Versions

**Root (server + electron):**
```json
{
  "version": "1.8.7",
  "@nestjs/core": "^10.0.0",
  "@nestjs/jwt": "^10.0.0",
  "@nestjs/passport": "^10.0.0",
  "@prisma/client": "^5.0.0",
  "electron": "^40.1.0",
  "electron-builder": "^26.7.0",
  "electron-vite": "^5.0.0",
  "react": "^18.2.0",
  "zustand": "^4.4.0",
  "styled-components": "^6.0.0",
  "bcryptjs": "^3.0.3",
  "telegraf": "^4.16.3",
  "zod": "^3.22.0"
}
```

**Web dashboard (`src/web/`):** separate Vite project, same React/Zustand stack.

### Source Layout

```
grocery-pos/
├── src/
│   ├── server/              # NestJS backend (VPS)
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── modules/         # Feature modules (auth, stores, products, ...)
│   │   ├── common/          # Guards, decorators, filters, interceptors
│   │   └── prisma/          # PrismaService wrapper
│   │
│   ├── main/                # Electron main process
│   │   ├── index.ts
│   │   ├── sync/            # Bidirectional VPS sync
│   │   ├── database/        # SQLite client
│   │   ├── ipc/             # IPC handler files per domain
│   │   └── [printer, scale, updater, config]
│   │
│   ├── renderer/            # Electron renderer UI (React)
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/           # Zustand state
│   │   ├── hooks/
│   │   └── i18n/
│   │
│   ├── web/                 # Browser-based super-admin dashboard
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Admin/   # Store management (SUPER_ADMIN only)
│   │       │   ├── Login/
│   │       │   ├── Products/
│   │       │   ├── Users/
│   │       │   ├── Suppliers/
│   │       │   └── Reports/
│   │       ├── store/       # Zustand (auth-store, etc.)
│   │       ├── hooks/
│   │       └── api/client.ts
│   │
│   ├── shared/              # Types + constants shared across all targets
│   │   ├── types/
│   │   └── constants/
│   │
│   └── generated/
│       └── prisma-sqlite/   # Generated SQLite Prisma client (committed)
│
├── prisma/
│   ├── schema.prisma        # PostgreSQL schema (VPS)
│   └── schema.sqlite.prisma # SQLite schema (terminal)
│
├── .env.pos                 # Baked into Electron bundle at build time
├── .env / .env.server       # NestJS server runtime config
└── electron-builder.config.js
```

### Electron Build Config Highlights

`electron.vite.config.ts` injects terminal-specific vars at build time:
```typescript
define: {
  'process.env.VPS_API_URL':   JSON.stringify(process.env.VPS_API_URL),
  'process.env.TERMINAL_ID':   JSON.stringify(process.env.TERMINAL_ID),
  'process.env.STORE_ID':      JSON.stringify(process.env.STORE_ID),
  'process.env.SYNC_INTERVAL_MS': JSON.stringify(process.env.SYNC_INTERVAL_MS),
}
```

Each installed terminal is a different build — its `STORE_ID` is baked in.

---

## 2. Multi-Tenant Database Architecture

### PostgreSQL Schema (VPS) — `prisma/schema.prisma`

#### The Root Tenant: `Store`

```prisma
model Store {
  id               String    @id @default(cuid())
  name             String
  phone            String?
  address          String?
  plan             String    @default("free")   // "free" | "paid"
  aiCredits        Decimal   @default(0)
  active           Boolean   @default(true)
  scheduledDeleteAt DateTime?                   // Soft-delete grace period

  // All tenant data hangs off here
  users              User[]
  categories         Category[]
  products           Product[]
  sales              Sale[]
  inventoryArrivals  InventoryArrival[]
  suppliers          Supplier[]
  systemSettings     SystemSetting[]
  auditLogs          AuditLog[]
  terminalHeartbeats TerminalHeartbeat[]
  terminalLogs       TerminalLog[]
  paynetReceipts     PaynetReceipt[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("stores")
}
```

#### How Each Entity is Scoped

Every entity that belongs to a tenant follows the same pattern:

```prisma
model Product {
  id      Int    @id @default(autoincrement())
  storeId String @map("store_id")
  store   Store  @relation(fields: [storeId], references: [id])
  barcode String

  // Business uniqueness enforced PER STORE (not globally)
  @@unique([storeId, barcode])
  @@unique([storeId, internalCode])
  @@index([storeId])          // Critical for query performance

  @@map("products")
}

model Sale {
  id            String @id @default(cuid())
  storeId       String @map("store_id")
  store         Store  @relation(fields: [storeId], references: [id])
  receiptNumber String

  @@unique([storeId, receiptNumber])  // Deduplication key for sync
  @@index([storeId])
  @@index([synced])

  @@map("sales")
}

model User {
  id      String    @id @default(cuid())
  storeId String?   @map("store_id")   // NULL = SUPER_ADMIN
  store   Store?    @relation(fields: [storeId], references: [id])
  phone   String
  role    UserRole                      // SUPER_ADMIN | ADMIN | USER

  @@unique([storeId, phone])           // Phone unique per store
  @@index([storeId])

  @@map("users")
}
```

**Three multi-tenancy rules enforced in the schema:**
1. `storeId` foreign key on every tenant-owned entity
2. `@@index([storeId])` on every table for query performance
3. Business uniqueness uses `@@unique([storeId, key])` — not global uniqueness

#### Roles Enum

```prisma
enum UserRole {
  SUPER_ADMIN   // Platform operator — no storeId
  ADMIN         // Store owner/manager — storeId required
  USER          // Cashier/staff — storeId required
}
```

#### Soft Delete Pattern

```prisma
model Store {
  active            Boolean   @default(true)
  scheduledDeleteAt DateTime?   // Set 30 days in future on deactivation
}
```

Service sets `scheduledDeleteAt = now() + 30 days` and `active = false`. A scheduled job calls `purgeExpired()` to actually delete.

---

### SQLite Schema (Terminal) — `prisma/schema.sqlite.prisma`

The terminal is **pinned to a single store** — no `storeId` columns needed locally.

```prisma
// The store identity is stored once here
model LocalConfig {
  id         String   @id @default("config")  // Always one row
  storeId    String   @map("store_id")
  storeName  String   @map("store_name")
  terminalId String   @map("terminal_id")
  apiUrl     String   @map("api_url")
  lastSync   DateTime @default(now()) @map("last_sync")
}

// Local product cache — no storeId (single tenant)
model Product {
  id           Int     @id
  barcode      String  @unique
  nameUz       String  @map("name_uz")
  nameRu       String  @map("name_ru")
  price        Decimal
  stock        Decimal @default(0)
  // ...
}

// Sales created locally, synced up
model Sale {
  id            String   @id @default(uuid())
  receiptNumber String   @unique
  synced        Boolean  @default(false)
  syncedAt      DateTime?
  items         SaleItem[]
}

// Retry queue for failed syncs
model SyncQueue {
  id        String   @id @default(uuid())
  entity    String
  entityId  String
  action    String
  payload   String   // JSON
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
}
```

---

### Tenant Isolation Architecture Diagram

```
                    POSTGRESQL (VPS)
┌─────────────────────────────────────────────────────┐
│                                                      │
│  Store A (id: "abc")     Store B (id: "xyz")        │
│  ┌───────────────────┐   ┌───────────────────┐      │
│  │ Product           │   │ Product           │      │
│  │ storeId = "abc"   │   │ storeId = "xyz"   │      │
│  ├───────────────────┤   ├───────────────────┤      │
│  │ Sale              │   │ Sale              │      │
│  │ storeId = "abc"   │   │ storeId = "xyz"   │      │
│  ├───────────────────┤   ├───────────────────┤      │
│  │ User (ADMIN)      │   │ User (ADMIN)      │      │
│  │ storeId = "abc"   │   │ storeId = "xyz"   │      │
│  └───────────────────┘   └───────────────────┘      │
│                                                      │
│  User (SUPER_ADMIN)                                  │
│  storeId = NULL ──────── can access both stores      │
└─────────────────────────────────────────────────────┘

             SQLITE (Terminal — per store)
┌──────────────────────────────────────┐
│  LocalConfig { storeId: "abc" }      │
│  ← pinned at install time            │
│                                      │
│  Products (cache of Store A only)    │
│  Sales    (unsynced + synced)        │
│  Users    (cache for offline login)  │
└──────────────────────────────────────┘
```

---

## 3. Admin Dashboard

### Page Map (`src/web/src/pages/`)

```
pages/
├── Admin/
│   ├── StoreList.tsx         # List all stores: name, plan, user count, terminal count
│   ├── StoreFormModal.tsx    # Create/edit store: name, phone, address, plan, aiCredits
│   ├── StoreDetailModal.tsx  # View store: revenue stats, last sync, terminal list
│   ├── LogsPage.tsx          # Terminal logs filtered by storeId
│   ├── AuditLogsPage.tsx     # Audit trail (SUPER_ADMIN sees all; ADMIN sees own)
│   └── LoginBannerPage.tsx   # Configure site-wide login page banner
│
├── Login/
│   └── LoginPage.tsx         # Login with optional storeId (for multi-store users)
│
├── Products/
│   ├── ProductList.tsx       # Products for current store, FAB scan, MXIK auto-fill
│   └── ProductDetails.tsx
│
├── Users/
│   ├── UserList.tsx          # Users in current store only
│   └── UserForm.tsx
│
├── Reports/
│   ├── DailySummary.tsx
│   ├── MonthlyReport.tsx
│   └── Analytics.tsx
│
├── Suppliers/
│   └── SupplierList.tsx
│
└── Settings/
    └── SettingsPage.tsx
```

### Routing with Role Guards

```typescript
// src/web/src/App.tsx (simplified)

function PrivateRoute({
  children,
  superAdminOnly = false,
  adminOnly = false,
  excludeSuperAdmin = false,
}) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;

  // SUPER_ADMIN trying to access store-level pages → redirect to admin panel
  if (excludeSuperAdmin && user?.role === 'SUPER_ADMIN') {
    return <Navigate to="/admin/stores" />;
  }

  // Page requires SUPER_ADMIN
  if (superAdminOnly && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" />;
  }

  // Page requires ADMIN or SUPER_ADMIN
  if (adminOnly && user?.role === 'USER') {
    return <Navigate to="/" />;
  }

  return children;
}

// Routes:
<Route path="/admin/stores"  element={<PrivateRoute superAdminOnly><StoreList /></PrivateRoute>} />
<Route path="/users"         element={<PrivateRoute adminOnly excludeSuperAdmin><UserList /></PrivateRoute>} />
<Route path="/products"      element={<PrivateRoute><ProductList /></PrivateRoute>} />
<Route path="/audit-logs"    element={<PrivateRoute adminOnly><AuditLogsPage /></PrivateRoute>} />
```

### StoreList.tsx Key Logic

- Fetches all stores with aggregate counts: `users`, `products`, `sales`, `terminals`
- SUPER_ADMIN can create / edit / soft-delete / hard-delete stores
- Plan badge shows `free` or `paid`
- Terminal heartbeat status per store (online/offline/never)

### StoreFormModal.tsx Key Fields

```typescript
interface StoreFormData {
  name: string;
  phone?: string;
  address?: string;
  plan: 'free' | 'paid';
  aiCredits: number;     // Pre-paid AI scanning credits
  active: boolean;
}
```

---

## 4. API Structure & Tenant Isolation

### NestJS Modules (`src/server/modules/`)

| Module | Endpoints | Auth Level |
|--------|-----------|------------|
| `auth` | POST /auth/login, /logout, /sessions | Public / JWT |
| `stores` | CRUD /stores | SUPER_ADMIN only |
| `users` | CRUD /users | ADMIN (own store) |
| `products` | CRUD /products | ADMIN write, USER read |
| `sales` | GET /sales, POST /sales/sync | USER+ |
| `inventory` | CRUD /inventory | ADMIN |
| `suppliers` | CRUD /suppliers | ADMIN |
| `analytics` | GET /analytics/… | ADMIN |
| `terminals` | Heartbeat, logs | USER+ |
| `mxik` | GET /mxik/code/:code, /mxik/search/:barcode | ADMIN+ |
| `aslbelgisi` | POST /aslbelgisi/verify | JWT (any) |
| `site-config` | GET/PUT /site-config/login-banner | SUPER_ADMIN write |
| `paynet` | Fiscal receipts | ADMIN |

### The Guard Chain

Every protected endpoint uses exactly this chain:

```typescript
@UseGuards(JwtAuthGuard, StoreGuard, RolesGuard)
```

#### JwtAuthGuard

```typescript
// Validates Bearer token, calls JwtStrategy.validate()
// Attaches request.user = { sub, storeId, phone, role, sessionId }
// Throws 401 if token invalid or session revoked
```

#### StoreGuard — The Tenant Isolation Enforcer

```typescript
@Injectable()
export class StoreGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    // Extract storeId from params, query, or body
    const requestedStoreId =
      request.params?.storeId ??
      request.query?.storeId ??
      request.body?.storeId;

    if (user.role === UserRole.SUPER_ADMIN) {
      // SUPER_ADMIN can act on any store
      if (requestedStoreId) {
        request.storeId = requestedStoreId;
        return true;
      }
      throw new ForbiddenException('storeId required for SUPER_ADMIN');
    }

    // Regular users: validate they're accessing their own store
    if (!user.storeId) {
      throw new ForbiddenException('User not assigned to a store');
    }
    if (requestedStoreId && requestedStoreId !== user.storeId) {
      throw new ForbiddenException('Access denied to this store');
    }

    request.storeId = user.storeId;  // Set effective storeId
    return true;
  }
}
```

#### RolesGuard

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) return true;  // No role requirement

    const user: JwtPayload = context.switchToHttp().getRequest().user;

    // SUPER_ADMIN bypasses all role checks
    if (user.role === UserRole.SUPER_ADMIN) return true;

    return roles.includes(user.role);
  }
}
```

### Decorators

```typescript
// Returns the effective storeId set by StoreGuard
export const CurrentStore = createParamDecorator(
  (_data, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().storeId,
);

// Returns full user object from request.user
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);

// Sets role metadata for RolesGuard
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

### Complete Controller Example — Products

```typescript
@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // Any authenticated user in the store can list products
  @Get()
  findAll(
    @CurrentStore() storeId: string,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(storeId, { categoryId, search });
  }

  // Only ADMIN can create
  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @CurrentStore() storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(storeId, dto);
    // storeId comes from guard, NOT from dto — user cannot spoof it
  }

  // Finding a single product verifies ownership in the service
  @Get(':id')
  findOne(
    @CurrentStore() storeId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.productsService.findById(id, storeId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @CurrentStore() storeId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, storeId, dto);
  }
}
```

### Service Layer — Tenant Scoping Pattern

```typescript
@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // storeId is always a parameter, never taken from user input
  async findAll(storeId: string, filters: ProductFilters) {
    return this.prisma.product.findMany({
      where: {
        storeId,                                // Always filtered by tenant
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.search && {
          OR: [
            { nameRu: { contains: filters.search, mode: 'insensitive' } },
            { nameUz: { contains: filters.search, mode: 'insensitive' } },
            { barcode: { contains: filters.search } },
          ],
        }),
      },
    });
  }

  async findById(id: number, storeId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    // Double-check: product must belong to requesting store
    if (!product || product.storeId !== storeId) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async create(storeId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        storeId,   // Injected by service, not user input
        barcode: dto.barcode,
        nameRu: dto.nameRu,
        nameUz: dto.nameUz,
        price: dto.price,
      },
    });
  }
}
```

### Tenant Isolation Flow Diagram

```
HTTP Request
    │
    ▼
JwtAuthGuard
    │  Validates JWT signature
    │  Checks session not revoked
    │  Attaches: request.user = { sub, storeId, role, sessionId }
    │
    ▼
StoreGuard
    │  Extracts storeId from params/query/body
    │  SUPER_ADMIN → can use any storeId
    │  ADMIN/USER  → must match user.storeId
    │  Attaches: request.storeId (the validated effective storeId)
    │
    ▼
RolesGuard
    │  Checks @Roles() metadata
    │  SUPER_ADMIN bypasses
    │
    ▼
Controller
    │  @CurrentStore() → request.storeId (from StoreGuard, tamper-proof)
    │  @CurrentUser()  → request.user
    │
    ▼
Service(storeId, ...)
    │  All Prisma calls: WHERE { storeId }
    │  findById also checks product.storeId === storeId
    │
    ▼
Prisma → PostgreSQL
    WHERE storeId = $1  ← enforced at every layer
```

---

## 5. Authentication & Authorization

### Login Flow

```typescript
// POST /api/auth/login
// Body: { storeId?: string, phone: string, password: string }

async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
  const user = await this.usersService.findByPhoneAndStore(dto.phone, dto.storeId);

  if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');

  const isValid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!isValid) throw new UnauthorizedException('Invalid credentials');

  // Create revocable session
  const session = await this.prisma.userSession.create({
    data: { userId: user.id, userAgent, ipAddress, deviceName: parseDevice(userAgent) },
  });

  const payload: JwtPayload = {
    sub: user.id,
    storeId: user.storeId,   // NULL for SUPER_ADMIN
    phone: user.phone,
    role: user.role,
    sessionId: session.id,
  };

  return {
    token: this.jwtService.sign(payload),  // Default expiry: 8h
    user: pick(user, ['id', 'storeId', 'phone', 'role', 'nameUz', 'nameRu']),
  };
}
```

### JWT Payload Shape

```typescript
interface JwtPayload {
  sub: string;           // User UUID
  storeId: string | null; // NULL for SUPER_ADMIN, store UUID for others
  phone: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  sessionId?: string;    // For revocation
  iat: number;           // Issued at (Unix)
  exp: number;           // Expiry (Unix, default iat + 8h)
}
```

### JWT Strategy (Token Validation)

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateUser(payload);
    if (!user) throw new UnauthorizedException();
    return user;  // → request.user
  }
}

async validateUser(payload: JwtPayload) {
  const user = await this.usersService.findById(payload.sub);
  if (!user || !user.active) return null;

  // Check session revocation
  if (payload.sessionId) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.isRevoked) return null;
  }

  return { ...user, storeId: payload.storeId, sessionId: payload.sessionId };
}
```

### Session Management

```prisma
model UserSession {
  id         String   @id @default(cuid())
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userAgent  String?  @map("user_agent")
  ipAddress  String?  @map("ip_address")
  deviceName String?  @map("device_name")
  isRevoked  Boolean  @default(false) @map("is_revoked")
  createdAt  DateTime @default(now()) @map("created_at")

  @@map("user_sessions")
}
```

**Endpoints:**
```
POST   /api/auth/login             → create session, return JWT
POST   /api/auth/logout            → revoke current session
GET    /api/auth/sessions          → list active sessions
DELETE /api/auth/sessions/:id      → revoke specific session
DELETE /api/auth/sessions/others   → revoke all except current
GET    /api/auth/profile           → current user (validate token still valid)
```

### Role Permission Matrix

| Action | SUPER_ADMIN | ADMIN | USER |
|--------|:-----------:|:-----:|:----:|
| Create/manage stores | ✅ | ❌ | ❌ |
| View all stores | ✅ | ❌ | ❌ |
| Manage store users | ✅ (any) | ✅ (own) | ❌ |
| Create products | ✅ | ✅ | ❌ |
| View products | ✅ | ✅ | ✅ |
| Create sales | ✅ | ✅ | ✅ |
| View all store sales | ✅ | ✅ | ❌ (own only) |
| View analytics | ✅ | ✅ | ❌ |
| Manage inventory | ✅ | ✅ | ❌ |
| Manage site config | ✅ | ❌ | ❌ |
| View audit logs | ✅ (all) | ✅ (own) | ❌ |

### Frontend Auth Store (Zustand)

```typescript
// src/web/src/store/auth-store.ts
// Persists to localStorage as "auth-storage"

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (phone: string, password: string, storeId?: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

// axiosInstance reads token from localStorage:
axiosInstance.interceptors.request.use((config) => {
  const raw = localStorage.getItem('auth-storage');
  const token = JSON.parse(raw)?.state?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On app load, restoreSession() calls GET /api/auth/profile
// to verify the persisted token is still valid (not revoked)
```

---

## 6. Electron Sync System

### Architecture

```
POS Terminal (offline-first)          VPS Server
┌────────────────────────┐           ┌──────────────────────────┐
│  Electron + SQLite     │           │  NestJS + PostgreSQL     │
│                        │           │                          │
│  SyncService           │           │                          │
│  ├─ start() →          │           │                          │
│  │   5s delay, then    │           │                          │
│  │   every 5min        │           │                          │
│  │                     │           │                          │
│  ├─ UPLOAD (online):   │ ────────► │  POST /sales/sync        │
│  │   Sales             │           │  POST /inventory/sync    │
│  │   Inventory         │           │  POST /audit-logs/sync   │
│  │   Products*         │           │  POST /products (ADMIN)  │
│  │   (* ADMIN only)    │           │                          │
│  │                     │           │                          │
│  └─ DOWNLOAD:          │ ◄──────── │  GET /products           │
│      Products          │           │  GET /users              │
│      Users             │           │  GET /categories         │
│      Categories        │           │  GET /suppliers          │
│      Suppliers         │           │  GET /settings           │
│      Settings          │           │                          │
└────────────────────────┘           └──────────────────────────┘
```

### Sync Guards (sync-service.ts)

Before each sync cycle:

```typescript
async sync(): Promise<void> {
  if (this.isSyncing) return;  // No concurrent syncs

  const token = getServerToken();
  if (!token) return;  // Not logged in — skip

  // Security: token's storeId must match terminal's LocalConfig.storeId
  const localConfig = await prisma.localConfig.findUnique({ where: { id: 'config' } });
  if (localConfig?.storeId) {
    const tokenStoreId = decodeTokenStoreId(token);  // Decode JWT without verify
    if (tokenStoreId !== undefined && tokenStoreId !== localConfig.storeId) {
      clearServerToken();  // Wrong store — clear token, stop sync
      return;
    }
  }

  // Check connectivity
  const isOnline = await this.checkConnectivity();
  if (!isOnline) return;

  const user = getCurrentUser();
  if (user?.role === 'ADMIN') await uploadLocalData();  // Products, suppliers
  await uploadAuditLogs();
  await syncSales();
  await syncProducts();
  await syncUsers();
  await syncCategories();
  await syncSuppliers();
  await syncSettings();
}
```

### Sales Sync — Idempotency Pattern

**Why idempotency matters:** Network can fail mid-request. Terminal might retry the same sale. Server must handle duplicates gracefully.

```typescript
// Terminal sends:
POST /api/sales/sync
{
  id: "local-uuid",           // Terminal-generated UUID
  receiptNumber: "001-20240115-042",  // Human-readable, unique per store
  cashierPhone: "+998901234567",      // Used to resolve server-side user ID
  terminalId: "T1",
  items: [{ barcode: "4870...", quantity: 2, unitPrice: 5000 }]
}

// Server deduplicates by (storeId, receiptNumber), NOT by id:
const existing = await prisma.sale.findFirst({
  where: { storeId, receiptNumber: dto.receiptNumber }
});
if (existing) return { synced: true };  // Already saved — idempotent

// New sale — resolve IDs by stable identifiers:
// - cashier: by phone (not local user ID, which may differ)
// - product: by barcode (not local product ID, which may differ)
```

### Products Sync — Downstream

```typescript
// Terminal fetches all store products every 5 min
const serverProducts = await fetch(`${vpsApiUrl}/products`, { headers: { Authorization } });

// Upsert all into local SQLite
for (const product of serverProducts) {
  await localPrisma.product.upsert({
    where: { id: product.id },
    create: { ...product },
    update: {
      price: product.price,      // Price changes sync down
      stock: product.stock,      // Stock changes sync down
      nameRu: product.nameRu,
      nameUz: product.nameUz,
    },
  });
}

// Deactivate products removed from server
await localPrisma.product.updateMany({
  where: { id: { notIn: serverIds } },
  data: { active: false },
});
```

---

## 7. Shared Types & Utilities

### `src/shared/types/`

```typescript
// User shape shared across Electron renderer and server
export interface CurrentUser {
  id: string;
  storeId: string | null;  // NULL = SUPER_ADMIN
  phone: string;
  nameUz: string;
  nameRu: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
}

// Sync payload shapes
export interface SaleSyncPayload {
  id: string;
  storeId: string;
  receiptNumber: string;
  terminalId: string;
  cashierId: string;
  cashierPhone?: string;
  items: SaleItemSyncPayload[];
  createdAt: string;
}

export interface SaleItemSyncPayload {
  productId: number;
  barcode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
```

### `src/shared/constants/`

```typescript
export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;
```

### Key Utilities

**`ipcSafe(value)`** — Strips non-cloneable Prisma types before IPC:
```typescript
const ipcSafe = (v: unknown) => JSON.parse(JSON.stringify(v));
```

**`serializeProduct(product)`** — Converts `Decimal` → `number`:
```typescript
function serializeProduct(p: PrismaProduct) {
  return {
    ...p,
    price: p.price.toNumber(),
    stock: p.stock.toNumber(),
    cost: p.cost?.toNumber() ?? null,
  };
}
```

---

## 8. Environment & Deployment

### Environment Variables

**`.env.pos` (baked into Electron bundle):**
```bash
DATABASE_URL=file:./pos-local.db
VPS_API_URL=https://pos.bobur-dev.uz
TERMINAL_ID=T1
STORE_ID=<store-cuid>
JWT_SECRET=<same-as-server>
PRINTER_NAME=Epson TM-T88V
PRINTER_TYPE=usb
SYNC_INTERVAL_MS=300000
```

**`.env` / `.env.server` (NestJS runtime):**
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/posgro
JWT_SECRET=<min-32-chars>
JWT_EXPIRES_IN=8h
PORT=3001
NODE_ENV=production
CORS_ORIGINS=https://pos.bobur-dev.uz
ASLBELGISI_API_KEY=<key>
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=<token>
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

### Docker Compose

```yaml
services:
  api:
    build: .
    ports: ["3001:3001"]
    env_file: .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 10s
      retries: 3
    volumes:
      - ./prisma:/app/prisma
      - ./dist/server/uploads:/app/dist/server/uploads  # Persisted uploads
```

### GitHub Actions Deploy

```yaml
# .github/workflows/deploy.yml
# Triggers: daily 18:00 UTC (23:00 Tashkent) + manual dispatch
on:
  schedule:
    - cron: '0 18 * * *'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            git pull origin main
            cat > .env <<'EOF'
            ${{ secrets.ENV_FILE }}
            EOF
            docker compose build api
            docker compose up -d --no-deps api
            # Health check — waits up to 60s
            timeout 60 bash -c 'until docker compose ps api | grep healthy; do sleep 3; done'
```

### Electron Release Flow

```bash
# 1. Bump version
npm version patch   # 1.0.0 → 1.0.1

# 2. Build + upload to VPS
npm run deploy:pos
# → build:pos (Electron installer)
# → upload to https://pos.bobur-dev.uz/releases/
# → electron-updater checks this URL on startup

# 3. Terminals auto-update on next launch
```

---

## 9. Adding New Tenant Types

To add a new tenant type (e.g. `pharmacy` alongside `grocery`), the architecture supports it through a `plan` field and type discrimination — no schema changes needed for simple cases.

### Option A: Add a `type` field to Store (minimal change)

```prisma
model Store {
  id   String    @id @default(cuid())
  type StoreType @default(GROCERY)
  // ...existing fields...
}

enum StoreType {
  GROCERY
  PHARMACY
  MEDICAL_CLINIC
}
```

Then add type-based guards for features:
```typescript
// clinic-guard.ts
if (store.type !== StoreType.MEDICAL_CLINIC) {
  throw new ForbiddenException('Feature only available for medical clinics');
}
```

### Option B: Separate tenant root model (full isolation)

For fully separate data models (patients vs customers), add a parallel tenant entity:

```prisma
model Clinic {
  id      String  @id @default(cuid())
  name    String
  active  Boolean @default(true)

  users       User[]       // Reuse User with clinicId
  patients    Patient[]
  appointments Appointment[]
  doctors     Doctor[]
}
```

Add `clinicId` to User alongside or replacing `storeId`, then create a `ClinicGuard` mirroring `StoreGuard`.

### Option C: Multi-type single schema (current POSGRO approach)

POSGRO already uses `plan` to differentiate store tiers. Extend with:

```typescript
// In stores.service.ts — returns features allowed per plan/type
getStoreFeatures(store: Store): StoreFeatures {
  return {
    canUseMxik:      true,
    canUseFiscal:    store.plan === 'paid',
    canUseAI:        store.aiCredits > 0,
    canUsePharmacy:  store.type === 'PHARMACY',
  };
}
```

---

## 10. Medical CRM Mapping

### Direct Entity Mapping

| POSGRO | Medical CRM | Notes |
|--------|-------------|-------|
| `Store` | `Clinic` | Root tenant entity |
| `Product` | `Patient` | With `@@unique([clinicId, ssn])` |
| `Sale` | `Appointment` / `Visit` | With `@@unique([clinicId, visitNumber])` |
| `SaleItem` | `PrescriptionItem` / `ServiceItem` | Line items |
| `Supplier` | `InsuranceProvider` | — |
| `InventoryArrival` | `MedicalSupplyOrder` | — |
| `Category` | `Specialty` / `ServiceType` | — |
| `SystemSetting` | `ClinicSetting` | — |
| `AuditLog` | `AuditLog` | Unchanged |
| `UserSession` | `UserSession` | Unchanged |
| `TerminalHeartbeat` | `WorkstationHeartbeat` | — |

### Prisma Schema Starter

```prisma
model Clinic {
  id               String    @id @default(cuid())
  name             String
  address          String?
  phone            String?
  active           Boolean   @default(true)
  plan             String    @default("free")
  scheduledDeleteAt DateTime?

  users        User[]
  patients     Patient[]
  appointments Appointment[]
  doctors      Doctor[]
  settings     ClinicSetting[]
  auditLogs    AuditLog[]
}

model Patient {
  id        Int    @id @default(autoincrement())
  clinicId  String @map("clinic_id")
  clinic    Clinic @relation(fields: [clinicId], references: [id])
  ssn       String?              // Government ID
  phone     String
  nameRu    String @map("name_ru")
  nameUz    String @map("name_uz")
  birthDate DateTime?
  active    Boolean @default(true)

  @@unique([clinicId, phone])
  @@unique([clinicId, ssn])
  @@index([clinicId])
}

model Appointment {
  id             String   @id @default(cuid())
  clinicId       String   @map("clinic_id")
  clinic         Clinic   @relation(fields: [clinicId], references: [id])
  visitNumber    String   @map("visit_number")
  patientId      Int      @map("patient_id")
  doctorId       String   @map("doctor_id")
  status         AppointmentStatus @default(SCHEDULED)
  synced         Boolean  @default(false)  // Offline-first sync flag
  createdAt      DateTime @default(now())

  @@unique([clinicId, visitNumber])  // Deduplication key, same as receiptNumber
  @@index([clinicId])
  @@index([synced])
}

enum UserRole {
  SUPER_ADMIN   // Platform admin
  ADMIN         // Clinic manager
  DOCTOR        // Doctor (replaces USER/cashier)
  RECEPTIONIST  // Front desk staff
}
```

### Guard Chain — Unchanged

```typescript
// Replace StoreGuard with ClinicGuard — identical logic, different field name
@UseGuards(JwtAuthGuard, ClinicGuard, RolesGuard)

// JWT payload: storeId → clinicId
interface JwtPayload {
  sub: string;
  clinicId: string | null;  // NULL for SUPER_ADMIN
  role: UserRole;
  sessionId?: string;
}

// Decorator: @CurrentClinic() replaces @CurrentStore()
export const CurrentClinic = createParamDecorator(
  (_data, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().clinicId,
);
```

### Controller Pattern — Identical

```typescript
@Controller('patients')
@UseGuards(JwtAuthGuard, ClinicGuard, RolesGuard)
export class PatientsController {
  @Get()
  findAll(@CurrentClinic() clinicId: string) {
    return this.patientsService.findAll(clinicId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  create(@CurrentClinic() clinicId: string, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(clinicId, dto);
  }
}
```

### Offline Sync — Reuse Entirely

The `SyncService`, `SyncQueue` model, sales-sync idempotency pattern, and the storeId-guard-in-sync all apply directly:

```typescript
// Terminal appointments sync to server
POST /api/appointments/sync
{
  visitNumber: "V-001-20240115",  // Dedup key
  patientId: 42,
  doctorPhone: "+998...",         // Resolve server-side
  items: [...],
  createdAt: "2024-01-15T10:30:00Z"
}

// Server dedup:
const existing = await prisma.appointment.findFirst({
  where: { clinicId, visitNumber }
});
if (existing) return { synced: true };
```

---

## Summary: Architecture Strengths to Replicate

| Pattern | Where | Why It Works |
|---------|-------|-------------|
| `storeId` on every entity + `@@index([storeId])` | Prisma schema | Zero cross-tenant data leaks; performant queries |
| Guard chain: JWT → Store → Roles | NestJS middleware | Tenant scoping enforced before controller runs |
| `storeId` from guard, not user input | Service layer | Users can't spoof another tenant's ID |
| `@@unique([storeId, businessKey])` | Schema | Per-tenant uniqueness without global collision |
| Idempotent sync by stable business key | Sync service | Safe retries across unreliable networks |
| `storeId: null` for platform admin | User model | SUPER_ADMIN cleanly separated from tenant users |
| `scheduledDeleteAt` soft delete | Store model | 30-day recovery window before purge |
| `UserSession` revocation | Auth module | Instant token invalidation without blacklist |
| Baked `STORE_ID` in Electron build | electron-vite | Terminal can never be misconfigured to wrong store |

---

*Generated: 2026-05-12 from production source code*
