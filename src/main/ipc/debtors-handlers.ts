import { ipcMain } from "electron";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { getPrismaClient } from "../database/sqlite-client";
import { getAppConfig } from "../config/app-config";
import { getCurrentUser } from "./auth-handlers";
import { assertNotSatellite } from "../lan/satellite-guard";
import { isSatellite } from "../lan/role";
import * as satellite from "../lan/satellite-ops";
import { listDebtors, serializeDebtor } from "../sales/debtor-list";
import {
  allocatePayment,
  recomputeBalance,
  signedAmount,
} from "../sales/debt-ledger";
import { fiscalizeSettledSale } from "../sales/settle-sale";
import { addShiftMovement, currentShift } from "../sales/shifts";
import { isCashTender } from "../../shared/constants";

/**
 * Nasiya: the people who owe the shop money, and what they have paid.
 *
 * A debtor is any `User` with a balance, not a table of its own — because the person taking goods
 * on credit may equally BE staff (the requirement is explicit about that), and a second table
 * would mean two answers to "who is this phone number". CLIENT marks a customer record: someone
 * who exists only to run a tab, is refused at every login path, and is kept out of staff lists.
 * A cashier or an admin is listed here too, and can be given a tab like anyone else.
 *
 * The arithmetic all lives in `sales/debt-ledger.ts`; this file is the boundary — permissions,
 * shape, and the two side effects a payment has beyond the ledger: money in the drawer, and a
 * fiscal receipt for whatever the payment finished paying for.
 */

/** `getPrismaClient()` is `any` (a runtime require), so rows are shaped where they are read. */
const ipcSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const num = (v: unknown): number => Number(v ?? 0);

function serializeTxn(t: {
  id: string;
  type: string;
  amount: unknown;
  paymentMethod: string | null;
  saleId: string | null;
  settledAt: Date | null;
  dueDate: Date | null;
  note: string | null;
  createdBy: string;
  createdAt: Date;
}) {
  return { ...t, amount: num(t.amount) };
}

function requireStaff() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** Only an admin may forgive or hand-adjust a balance; any cashier may take a payment. */
function requireAdmin() {
  const user = requireStaff();
  if (user.role !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

export function setupDebtorsHandlers(): void {
  ipcMain.handle(
    "debtors:list",
    async (
      _event,
      opts?: {
        search?: string;
        withDebtOnly?: boolean;
        includeStaff?: boolean;
      },
    ) => {
      // A satellite holds no users: the people, and the ids a credit sale must name, are the main's.
      if (await isSatellite()) return ipcSafe(await satellite.listDebtors(opts ?? {}));
      requireStaff();
      return ipcSafe(await listDebtors(opts ?? {}));
    },
  );

  /**
   * Create a customer who can take goods on credit.
   *
   * The password column is NOT NULL and this account must never open a session, so it gets a
   * random hash nobody holds the plaintext of — belt and braces behind the role check that every
   * login path now makes.
   */
  ipcMain.handle(
    "debtors:create",
    async (
      _event,
      data: {
        nameRu: string;
        nameUz?: string;
        phone: string;
        debtDueDate?: string | null;
      },
    ) => {
      requireStaff();
      await assertNotSatellite();
      const prisma = getPrismaClient();

      const phone = String(data.phone ?? "").replace(/\D/g, "");
      if (!phone) throw new Error("debtors.errors.phone_required");
      const nameRu = String(data.nameRu ?? "").trim();
      if (!nameRu) throw new Error("debtors.errors.name_required");

      const clash = await prisma.user.findUnique({ where: { phone } });
      if (clash) throw new Error("debtors.errors.phone_taken");

      const config = await prisma.localConfig.findUnique({
        where: { id: "config" },
      });
      const debtor = await prisma.user.create({
        data: {
          phone,
          password: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
          role: "CLIENT",
          nameRu,
          // The bilingual fields are both required; a shop that only types one name should not
          // be made to type it twice.
          nameUz: String(data.nameUz ?? "").trim() || nameRu,
          active: true,
          storeId: config?.storeId ?? null,
          debtDueDate: data.debtDueDate ? new Date(data.debtDueDate) : null,
        },
      });

      return ipcSafe(serializeDebtor(debtor));
    },
  );

  ipcMain.handle(
    "debtors:update",
    async (
      _event,
      id: string,
      data: {
        nameRu?: string;
        nameUz?: string;
        phone?: string;
        debtDueDate?: string | null;
      },
    ) => {
      requireAdmin();
      await assertNotSatellite();
      const prisma = getPrismaClient();

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) throw new Error("debtors.errors.not_found");

      // Name and phone belong to whoever owns the account. For a customer that is this screen;
      // for a cashier it is the Users screen, and renaming a colleague from the debtors list
      // would be a surprising way to edit their record — worse, it would rename the account they
      // sign in with. The due date is debt business either way.
      const identityEditable = existing.role === "CLIENT";

      const update: Record<string, unknown> = {};
      if (data.nameRu && identityEditable) update.nameRu = data.nameRu.trim();
      if (data.nameUz && identityEditable) update.nameUz = data.nameUz.trim();
      if (data.phone && identityEditable)
        update.phone = data.phone.replace(/\D/g, "");
      // A customer's identity is edited here, so it has to reach the server before a pull may
      // overwrite it. The due date rides with the balance, which is always sent.
      if ("nameRu" in update || "nameUz" in update || "phone" in update) {
        update.synced = false;
      }
      if (data.debtDueDate !== undefined) {
        update.debtDueDate = data.debtDueDate
          ? new Date(data.debtDueDate)
          : null;
      }

      const debtor = await prisma.user.update({ where: { id }, data: update });
      return ipcSafe(serializeDebtor(debtor));
    },
  );

  /** The ledger behind one balance, newest first, with the stored total and the derived one. */
  ipcMain.handle("debtors:getLedger", async (_event, userId: string) => {
    requireStaff();
    const prisma = getPrismaClient();

    const debtor = await prisma.user.findUnique({ where: { id: userId } });
    if (!debtor) throw new Error("debtors.errors.not_found");

    const transactions = await prisma.debtTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return ipcSafe({
      debtor: serializeDebtor(debtor),
      // Both figures, deliberately: they are written together and should agree, and showing the
      // ledger's own sum is what turns "should" into something the screen can actually check.
      balance: num(debtor.debt),
      ledgerBalance: await recomputeBalance(prisma, userId),
      transactions: transactions.map(serializeTxn),
    });
  });

  /** The credit sales this person has not finished paying for, oldest first. */
  ipcMain.handle("debtors:getUnpaidSales", async (_event, userId: string) => {
    requireStaff();
    const prisma = getPrismaClient();

    const charges = await prisma.debtTransaction.findMany({
      where: { userId, type: "CHARGE", settledAt: null },
      orderBy: { createdAt: "asc" },
    });
    type SaleRow = { id: string; receiptNumber: string };
    const sales = (await prisma.sale.findMany({
      where: {
        id: {
          in: charges
            .map((c: { saleId: string | null }) => c.saleId)
            .filter(Boolean),
        },
      },
      select: {
        id: true,
        receiptNumber: true,
        finalAmount: true,
        createdAt: true,
      },
    })) as SaleRow[];
    const byId = new Map(sales.map((s) => [s.id, s]));

    return ipcSafe(
      charges.map(
        (c: {
          id: string;
          saleId: string | null;
          amount: unknown;
          createdAt: Date;
        }) => ({
          chargeId: c.id,
          saleId: c.saleId,
          amount: num(c.amount),
          createdAt: c.createdAt,
          receiptNumber: c.saleId
            ? (byId.get(c.saleId)?.receiptNumber ?? null)
            : null,
        }),
      ),
    );
  });

  /**
   * Take money off a debt.
   *
   * Three things happen, and the order matters. The ledger row and the balance move together in
   * one transaction. Cash lands in the drawer as a shift PAY_IN, because that is the only way an
   * X/Z report can account for money that arrived outside a sale. And every credit sale the
   * payment finished paying for is fiscalized now — the receipt REGOS never saw at the counter.
   *
   * `fiscalize: false` skips that last step: the till asks when a payment clears the whole
   * balance, and the shop may choose not to issue the receipts. Those sales stay DEFERRED_DEBT,
   * which no retry sweep selects, so nothing fiscalizes them later behind the cashier's back.
   */
  ipcMain.handle(
    "debtors:recordPayment",
    async (
      _event,
      data: {
        userId: string;
        amount: number;
        paymentMethod: string;
        note?: string;
        fiscalize?: boolean;
      },
    ) => {
      const staff = requireStaff();
      await assertNotSatellite();
      const prisma = getPrismaClient();

      const amount = Math.abs(Number(data.amount) || 0);
      if (amount <= 0) throw new Error("debtors.errors.amount_required");

      const debtor = await prisma.user.findUnique({
        where: { id: data.userId },
      });
      if (!debtor) throw new Error("debtors.errors.not_found");

      const tender = String(data.paymentMethod || "cash").toLowerCase();

      const settledSales = await prisma.$transaction(
        async (tx: typeof prisma) => {
          await tx.debtTransaction.create({
            data: {
              userId: data.userId,
              type: "PAYMENT",
              amount: signedAmount("PAYMENT", amount),
              paymentMethod: tender.toUpperCase(),
              note: data.note ?? null,
              createdBy: staff.id,
            },
          });
          await tx.user.update({
            where: { id: data.userId },
            data: { debt: { decrement: amount } },
          });
          // After the row above is written: the allocator reads the ledger, so the payment it is
          // settling with is the one just recorded.
          return allocatePayment(tx, data.userId);
        },
      );

      // Cash paid against a debt is money in the till that belongs to no sale in this shift.
      // Recording it as a PAY_IN is what keeps the drawer count right — the same movement a
      // cashier would otherwise have to enter by hand. A card payoff settles to the bank and
      // must not touch the drawer.
      if (isCashTender(tender)) {
        try {
          const shift = await currentShift(getAppConfig().terminalId);
          if (shift) {
            await addShiftMovement({
              smenaId: shift.id,
              type: "PAY_IN",
              amount,
              note: `Долг: ${debtor.nameRu}`,
            });
          }
        } catch (e) {
          console.error(
            "[debtors] could not record the payment in the shift:",
            e,
          );
        }
      }

      // Now that they have paid for them, those receipts can be fiscalized — unless the shop
      // chose not to.
      if (data.fiscalize !== false) {
        for (const saleId of settledSales) {
          await fiscalizeSettledSale(saleId, tender);
        }
      }

      const updated = await prisma.user.findUnique({
        where: { id: data.userId },
      });
      return ipcSafe({ debtor: serializeDebtor(updated), settledSales });
    },
  );

  /**
   * Correct a balance by hand — writing off a debt, or fixing a mistake.
   *
   * Signed as given, since that is the point: ADJUSTMENT is the only type that can move a balance
   * in either direction. Admin only, and it never fiscalizes anything: forgiving a debt is not
   * the customer paying for those goods.
   */
  ipcMain.handle(
    "debtors:adjust",
    async (_event, data: { userId: string; amount: number; note?: string }) => {
      const admin = requireAdmin();
      await assertNotSatellite();
      const prisma = getPrismaClient();

      const amount = signedAmount("ADJUSTMENT", Number(data.amount) || 0);
      if (amount === 0) throw new Error("debtors.errors.amount_required");

      await prisma.$transaction(async (tx: typeof prisma) => {
        await tx.debtTransaction.create({
          data: {
            userId: data.userId,
            type: "ADJUSTMENT",
            amount,
            note: data.note ?? null,
            createdBy: admin.id,
          },
        });
        await tx.user.update({
          where: { id: data.userId },
          data: { debt: { increment: amount } },
        });
      });

      const updated = await prisma.user.findUnique({
        where: { id: data.userId },
      });
      return ipcSafe(serializeDebtor(updated));
    },
  );
}
