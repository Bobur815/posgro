import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import { USER_ROLES } from '@shared/constants';
import { UserRole } from '@prisma/client';
import { DASHBOARD_STORE_SELECT } from '../auth/dashboard-access';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId: string) {
    return this.prisma.user.findMany({
      // Staff only: nasiya customers share this table but are not people who work here.
      where: { storeId, role: { not: UserRole.CLIENT } },
      select: {
        id: true,
        storeId: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        // Staff can run a tab for their own store, so what a cashier owes belongs beside their
        // name here, the way it does on the terminal's own Users screen.
        debt: true,
        debtDueDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllStores() {
    // For SUPER_ADMIN: get users across all stores. Staff only, as above.
    return this.prisma.user.findMany({
      where: { role: { not: UserRole.CLIENT } },
      select: {
        id: true,
        storeId: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        createdAt: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        storeId: true,
        phone: true,
        password: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        createdAt: true,
        // Joined rather than fetched separately: `validateUser` runs on every authenticated
        // request and needs the store's state to keep a deactivated shop out. Pulling it in here
        // costs no extra round trip.
        store: { select: DASHBOARD_STORE_SELECT },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Everything a terminal needs to rebuild its user table, debtors included.
   *
   * Unlike the staff listings above this one keeps CLIENT rows: a till that is set up fresh, or
   * reinstalled, has to know who owes the shop money. The balance rides along for the same
   * reason — it is the only way a new terminal inherits one.
   */
  async findAllForSync(storeId: string) {
    return this.prisma.user.findMany({
      where: { storeId },
      select: {
        id: true,
        phone: true,
        password: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        debt: true,
        debtDueDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Who a phone number belongs to, for the Telegram bot's identity check.
   *
   * CLIENT is excluded: a debtor's phone is in this table so the shop can chase them, and it must
   * not open a bot session that reports the store's takings to them.
   */
  async findByPhoneAnyStore(phone: string) {
    return this.prisma.user.findFirst({
      where: { phone, active: true, role: { not: UserRole.CLIENT } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByPhoneAndStore(phone: string, storeId?: string) {
    // First try to find SUPER_ADMIN (has no storeId)
    const superAdmin = await this.prisma.user.findFirst({
      where: {
        phone,
        role: UserRole.SUPER_ADMIN,
        storeId: null,
      },
    });

    if (superAdmin) {
      return superAdmin;
    }

    // If storeId is provided, find user within that store
    if (storeId) {
      const user = await this.prisma.user.findUnique({
        where: {
          storeId_phone: { storeId, phone },
        },
      });
      // A nasiya customer is a record, not an account. Excluded at the lookup rather than at each
      // caller, so no present or future login path can find one to compare a password against.
      return user && user.role === UserRole.CLIENT ? null : user;
    }

    return null;
  }

  /**
   * Every store account a phone number has — one row per store, since users are per store — with
   * the state of its store. For a login that names no store (the web dashboard), which keeps the
   * accounts the password opens. Capped: each one costs a bcrypt compare.
   */
  async findStoreAccountsByPhone(phone: string) {
    return this.prisma.user.findMany({
      // CLIENT is excluded for the same reason SUPER_ADMIN is handled apart: a nasiya customer
      // is a record of who owes the shop money, not an account anyone signs in with.
      where: {
        phone,
        storeId: { not: null },
        role: { notIn: [UserRole.SUPER_ADMIN, UserRole.CLIENT] },
      },
      include: { store: { select: { id: true, name: true, ...DASHBOARD_STORE_SELECT } } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  async create(createUserDto: CreateUserDto, storeId: string) {
    // Check if user already exists in this store
    const existing = await this.prisma.user.findUnique({
      where: {
        storeId_phone: { storeId, phone: createUserDto.phone },
      },
    });

    if (existing) {
      throw new ConflictException('Phone number already exists in this store');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        storeId,
        phone: createUserDto.phone,
        password: hashedPassword,
        role: createUserDto.role || USER_ROLES.USER,
        nameUz: createUserDto.nameUz,
        nameRu: createUserDto.nameRu,
        active: true,
      },
      select: {
        id: true,
        storeId: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        createdAt: true,
      },
    });

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, storeId: string) {
    const user = await this.findById(id);

    // Ensure user belongs to the store
    if (user.storeId !== storeId) {
      throw new NotFoundException('User not found');
    }

    const data: Record<string, unknown> = {};

    if (updateUserDto.nameUz) data.nameUz = updateUserDto.nameUz;
    if (updateUserDto.nameRu) data.nameRu = updateUserDto.nameRu;
    if (updateUserDto.role) data.role = updateUserDto.role;
    if (updateUserDto.active !== undefined) data.active = updateUserDto.active;

    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        storeId: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        createdAt: true,
      },
    });
  }

  async activate(id: string, storeId: string) {
    const user = await this.findById(id);
    if (user.storeId !== storeId) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { active: true },
    });

    return { success: true };
  }

  async deactivate(id: string, storeId: string) {
    const user = await this.findById(id);
    if (user.storeId !== storeId) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  async upsertBulk(
    users: {
      id: string;
      phone: string;
      password: string;
      nameUz: string;
      nameRu: string;
      role?: string;
      active?: boolean;
      debt?: number;
      debtDueDate?: string | null;
    }[],
    storeId: string,
  ) {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const u of users) {
      try {
        const existing = await this.prisma.user.findUnique({
          where: { storeId_phone: { storeId, phone: u.phone } },
        });

        if (existing) {
          await this.prisma.user.update({
            where: { id: existing.id },
            data: {
              nameUz: u.nameUz,
              nameRu: u.nameRu,
              role: (u.role as any) || existing.role,
              active: u.active ?? existing.active,
              // The till owns the balance; this row is a mirror of it. Absent means an older
              // terminal that does not know about nasiya, and its silence must not zero a
              // balance another terminal reported.
              ...(u.debt !== undefined ? { debt: u.debt } : {}),
              ...(u.debtDueDate !== undefined
                ? { debtDueDate: u.debtDueDate ? new Date(u.debtDueDate) : null }
                : {}),
            },
          });
          updated++;
        } else {
          await this.prisma.user.create({
            data: {
              id: u.id,
              storeId,
              phone: u.phone,
              password: u.password,
              nameUz: u.nameUz,
              nameRu: u.nameRu,
              role: (u.role as any) || 'USER',
              active: u.active ?? true,
              debt: u.debt ?? 0,
              debtDueDate: u.debtDueDate ? new Date(u.debtDueDate) : null,
            },
          });
          created++;
        }
      } catch (err) {
        errors.push(`phone=${u.phone}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return { created, updated, errors };
  }

  async updatePassword(id: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  async delete(id: string, storeId: string) {
    const user = await this.findById(id);
    if (user.storeId !== storeId) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { success: true };
  }
}
