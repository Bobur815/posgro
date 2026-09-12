import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

/**
 * Exactly the columns a store may be read back as.
 *
 * An allowlist, not a "select everything then delete the secret": these rows are rendered by the
 * dashboard AND handed to a store's own ADMIN through `GET /stores/:id`, so a new sensitive column
 * must be invisible here by default rather than leak until someone remembers to strip it.
 *
 * `superAdminPassword` is the one deliberately missing field — see `hasSuperAdminPassword` below.
 */
const STORE_FIELDS = {
  id: true,
  name: true,
  address: true,
  phone: true,
  active: true,
  aiPlan: true,
  balance: true,
  subscriptionPlan: true,
  subscriptionExpiresAt: true,
  settings: true,
  scheduledDeleteAt: true,
  mode: true,
  posAdminLocked: true,
  createdAt: true,
  updatedAt: true,
} as const;

const STORE_COUNTS = {
  _count: {
    select: {
      users: true,
      products: true,
      sales: true,
      terminalHeartbeats: true,
    },
  },
} as const;

/** A new store admin's password when the phone has no account yet. */
const DEFAULT_ADMIN_PASSWORD = "123456";

/** What the dashboard needs to know about the override password: whether there is one. */
type StoreRow = { superAdminPassword?: string | null };
function withPasswordFlag<T extends StoreRow>(store: T) {
  const { superAdminPassword, ...rest } = store;
  return { ...rest, hasSuperAdminPassword: Boolean(superAdminPassword) };
}

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const stores = await this.prisma.store.findMany({
      orderBy: { createdAt: "desc" },
      select: { ...STORE_FIELDS, ...STORE_COUNTS, superAdminPassword: true },
    });
    return stores.map(withPasswordFlag);
  }

  async findById(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      select: { ...STORE_FIELDS, ...STORE_COUNTS, superAdminPassword: true },
    });

    if (!store) {
      throw new NotFoundException("Store not found");
    }

    return withPasswordFlag(store);
  }

  private async generateStoreId(): Promise<string> {
    const existing = await this.prisma.store.findMany({ select: { id: true } });
    const usedIds = new Set(existing.map((s) => s.id));

    let digits = 4;
    let min = 1000;
    let max = 9999;

    while (true) {
      for (let id = min; id <= max; id++) {
        const candidate = String(id);
        if (!usedIds.has(candidate)) return candidate;
      }
      // All N-digit IDs taken — expand to next digit length
      digits++;
      min = Math.pow(10, digits - 1);
      max = Math.pow(10, digits) - 1;
    }
  }

  /**
   * The accounts a phone number already has, newest first — one per store, since users are per
   * store. Refuses a super admin's phone: at login the super admin account wins by phone
   * (users.service.ts findByPhoneAndStore), so a store account under it could never be signed in to.
   */
  private async accountsForPhone(phone: string) {
    const accounts = await this.prisma.user.findMany({
      where: { phone },
      orderBy: { updatedAt: "desc" },
      select: { id: true, storeId: true, role: true, active: true, password: true },
    });
    if (accounts.some((a) => a.role === UserRole.SUPER_ADMIN)) {
      throw new ConflictException("This phone number belongs to a super admin");
    }
    return accounts;
  }

  /**
   * The password hash a new admin account starts with. One owner with several stores has one
   * account in each, under one phone: a new account takes the hash of the one that phone already
   * has, so the owner's own password opens every store at the dashboard's single login
   * (auth.service.ts loginAcrossStores). A phone new to the system gets the default.
   */
  private async startingPassword(accounts: Array<{ role: UserRole; active: boolean; password: string }>) {
    const source =
      accounts.find((a) => a.active && a.role === UserRole.ADMIN) ??
      accounts.find((a) => a.active) ??
      accounts[0];
    return source ? source.password : bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  }

  async create(createStoreDto: CreateStoreDto) {
    const id = await this.generateStoreId();

    // No uniqueness on the phone: one owner's stores share it, and the admin account made below is
    // one more account of the same person (see startingPassword).
    const hashedPassword = createStoreDto.phone
      ? await this.startingPassword(await this.accountsForPhone(createStoreDto.phone))
      : null;

    // Wrap both creates in a transaction so no orphaned store is left if user creation fails
    const store = await this.prisma.$transaction(async (tx) => {
      const s = await tx.store.create({
        data: {
          id,
          name: createStoreDto.name,
          address: createStoreDto.address,
          phone: createStoreDto.phone,
          settings: createStoreDto.settings
            ? JSON.stringify(createStoreDto.settings)
            : null,
          active: true,
          // Both fall back to the schema defaults (ONLINE / false) when the caller omits them.
          ...(createStoreDto.mode !== undefined && { mode: createStoreDto.mode }),
          ...(createStoreDto.posAdminLocked !== undefined && {
            posAdminLocked: createStoreDto.posAdminLocked,
          }),
          // Hashed on the way in; the plaintext never touches a column or a log.
          ...(createStoreDto.superAdminPassword
            ? {
                superAdminPassword: await bcrypt.hash(
                  createStoreDto.superAdminPassword,
                  10,
                ),
              }
            : {}),
        },
      });

      if (createStoreDto.phone && hashedPassword) {
        await tx.user.create({
          data: {
            storeId: s.id,
            phone: createStoreDto.phone,
            password: hashedPassword,
            role: UserRole.ADMIN,
            nameUz: "Administrator",
            nameRu: "Администратор",
            active: true,
          },
        });
      }

      return s;
    });

    // Read back through findById rather than returning the transaction's row: that row is the
    // whole record, hash included, and this response goes straight to the dashboard.
    return this.findById(store.id);
  }

  /**
   * Make `phone` this store's admin.
   *
   * An account it already has here is reset to the default password — that is what this is for, a
   * forgotten password. A phone with accounts only in other stores gets one here with their
   * password (see startingPassword), so the owner's one sign-in covers this store too.
   */
  async resetAdminUser(storeId: string, phone: string) {
    await this.findById(storeId);

    const accounts = await this.accountsForPhone(phone);
    const here = accounts.find((a) => a.storeId === storeId);

    if (here) {
      return this.prisma.user.update({
        where: { id: here.id },
        data: {
          role: UserRole.ADMIN,
          password: await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10),
          active: true,
        },
        select: { id: true, phone: true, role: true, nameRu: true },
      });
    }

    return this.prisma.user.create({
      data: {
        storeId,
        phone,
        password: await this.startingPassword(accounts),
        role: UserRole.ADMIN,
        nameUz: "Administrator",
        nameRu: "Администратор",
        active: true,
      },
      select: { id: true, phone: true, role: true, nameRu: true },
    });
  }

  async update(id: string, updateStoreDto: UpdateStoreDto) {
    await this.findById(id);

    const data: Record<string, unknown> = {};

    if (updateStoreDto.name !== undefined) data.name = updateStoreDto.name;
    if (updateStoreDto.address !== undefined)
      data.address = updateStoreDto.address;
    if (updateStoreDto.phone !== undefined) data.phone = updateStoreDto.phone;
    if (updateStoreDto.active !== undefined)
      data.active = updateStoreDto.active;
    if (updateStoreDto.aiPlan !== undefined) data.aiPlan = updateStoreDto.aiPlan;
    if (updateStoreDto.subscriptionPlan !== undefined) data.subscriptionPlan = updateStoreDto.subscriptionPlan;
    if (updateStoreDto.subscriptionExpiresAt !== undefined) {
      data.subscriptionExpiresAt = updateStoreDto.subscriptionExpiresAt
        ? new Date(updateStoreDto.subscriptionExpiresAt)
        : null;
    }
    if (updateStoreDto.mode !== undefined) data.mode = updateStoreDto.mode;
    if (updateStoreDto.posAdminLocked !== undefined)
      data.posAdminLocked = updateStoreDto.posAdminLocked;
    if (updateStoreDto.settings !== undefined) {
      data.settings = JSON.stringify(updateStoreDto.settings);
    }
    // Three distinct intents, so the empty string is meaningful rather than ignored:
    //   undefined -> leave the current password alone (the dashboard sends a blank field)
    //   ""        -> clear it, turning the terminal gate off
    //   a value   -> replace it
    if (updateStoreDto.superAdminPassword !== undefined) {
      data.superAdminPassword = updateStoreDto.superAdminPassword
        ? await bcrypt.hash(updateStoreDto.superAdminPassword, 10)
        : null;
    }

    await this.prisma.store.update({ where: { id }, data });
    // Read back through findById so the response cannot carry the hash.
    return this.findById(id);
  }

  async activate(id: string) {
    await this.findById(id);

    await this.prisma.store.update({
      where: { id },
      data: { active: true },
    });

    return { success: true };
  }

  async delete(id: string) {
    await this.findById(id);

    const scheduledDeleteAt = new Date();
    scheduledDeleteAt.setDate(scheduledDeleteAt.getDate() + 30);

    await this.prisma.store.update({
      where: { id },
      data: { active: false, scheduledDeleteAt },
    });

    return { success: true, scheduledDeleteAt };
  }

  async cancelDelete(id: string) {
    await this.findById(id);

    await this.prisma.store.update({
      where: { id },
      data: { active: true, scheduledDeleteAt: null },
    });

    return { success: true };
  }

  async purgeExpired() {
    const expired = await this.prisma.store.findMany({
      where: { scheduledDeleteAt: { lte: new Date() } },
      select: { id: true },
    });

    for (const { id } of expired) {
      await this.prisma.$transaction([
        this.prisma.terminalHeartbeat.deleteMany({ where: { storeId: id } }),
        this.prisma.systemSetting.deleteMany({ where: { storeId: id } }),
        this.prisma.supplierTransaction.deleteMany({ where: { storeId: id } }),
        this.prisma.inventoryArrival.deleteMany({ where: { storeId: id } }),
        this.prisma.sale.deleteMany({ where: { storeId: id } }),
        // UserSessions cascade-delete with User (onDelete: Cascade on userId)
        this.prisma.product.deleteMany({ where: { storeId: id } }),
        this.prisma.supplier.deleteMany({ where: { storeId: id } }),
        this.prisma.category.deleteMany({ where: { storeId: id } }),
        this.prisma.user.deleteMany({ where: { storeId: id } }),
        this.prisma.store.delete({ where: { id } }),
      ]);
    }

    return { purged: expired.length };
  }

  async deactivate(id: string) {
    await this.findById(id);

    await this.prisma.store.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  async addCredits(id: string, amount: number) {
    await this.findById(id);

    const updated = await this.prisma.store.update({
      where: { id },
      data: { balance: { increment: amount } },
      select: { id: true, balance: true },
    });

    return { success: true, balance: Number(updated.balance) };
  }

  async getStats(id: string) {
    const store = await this.findById(id);

    // Get total revenue for this store
    const salesAgg = await this.prisma.sale.aggregate({
      where: { storeId: id },
      _sum: { finalAmount: true },
      _count: true,
    });

    const productsCount = await this.prisma.product.count({
      where: { storeId: id, active: true },
    });

    const usersCount = await this.prisma.user.count({
      where: { storeId: id, active: true },
    });

    return {
      store,
      stats: {
        totalRevenue: salesAgg._sum.finalAmount || 0,
        totalSales: salesAgg._count,
        productsCount,
        usersCount,
      },
    };
  }
}
