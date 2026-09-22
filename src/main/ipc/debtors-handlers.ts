import { ipcMain } from "electron";
import { getAppConfig } from "../config/app-config";
import { getCurrentUser } from "./auth-handlers";
import { isSatellite } from "../lan/role";
import * as satellite from "../lan/satellite-ops";
import {
  adjustDebt,
  createDebtor,
  debtorLedger,
  debtorSale,
  listDebtors,
  recordDebtPayment,
  unpaidSales,
  updateDebtor,
  type DebtorEdit,
  type DebtorListOptions,
  type DebtPayment,
  type NewDebtor,
} from "../sales/debtors";

/**
 * Nasiya: the people who owe the shop money, and what they have paid.
 *
 * The boundary only — who may do what — around `sales/debtors.ts`, which does the work. On a main
 * or a standalone till it runs here, on this database. On a satellite, whose database holds no
 * users, every call goes to the main (`lan/satellite-ops.ts`), which checks the person's session
 * and role itself: a satellite can add a customer, take a payment, edit a due date and read the
 * history there, all in the main's one book.
 */

/** `getPrismaClient()` is `any` (a runtime require), so rows are shaped where they are read. */
const ipcSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value));

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
  ipcMain.handle("debtors:list", async (_event, opts?: DebtorListOptions) => {
    requireStaff();
    return ipcSafe(
      (await isSatellite()) ? await satellite.listDebtors(opts ?? {}) : await listDebtors(opts ?? {}),
    );
  });

  ipcMain.handle("debtors:create", async (_event, data: NewDebtor) => {
    requireStaff();
    return ipcSafe((await isSatellite()) ? await satellite.createDebtor(data) : await createDebtor(data));
  });

  ipcMain.handle("debtors:update", async (_event, id: string, data: DebtorEdit) => {
    requireAdmin();
    return ipcSafe(
      (await isSatellite()) ? await satellite.updateDebtor(id, data) : await updateDebtor(id, data),
    );
  });

  /** The ledger behind one balance, newest first, with the stored total and the derived one. */
  ipcMain.handle("debtors:getLedger", async (_event, userId: string) => {
    requireStaff();
    return ipcSafe((await isSatellite()) ? await satellite.debtorLedger(userId) : await debtorLedger(userId));
  });

  /** The credit sales this person has not finished paying for, oldest first. */
  ipcMain.handle("debtors:getUnpaidSales", async (_event, userId: string) => {
    requireStaff();
    return ipcSafe((await isSatellite()) ? await satellite.unpaidSales(userId) : await unpaidSales(userId));
  });

  /** One receipt on this person's tab, with its lines — wherever it was rung up. */
  ipcMain.handle("debtors:getSale", async (_event, userId: string, saleId: string) => {
    requireStaff();
    return ipcSafe(
      (await isSatellite()) ? await satellite.debtorSale(userId, saleId) : await debtorSale(userId, saleId),
    );
  });

  /** Take money off a debt: see `recordDebtPayment`. Cash goes into this till's shift. */
  ipcMain.handle("debtors:recordPayment", async (_event, data: DebtPayment) => {
    const staff = requireStaff();
    return ipcSafe(
      (await isSatellite())
        ? await satellite.recordDebtPayment(data)
        : await recordDebtPayment(data, staff.id, getAppConfig().terminalId),
    );
  });

  /** Correct a balance by hand — admin only, and it never fiscalizes anything. */
  ipcMain.handle("debtors:adjust", async (_event, data: { userId: string; amount: number; note?: string }) => {
    const admin = requireAdmin();
    return ipcSafe((await isSatellite()) ? await satellite.adjustDebt(data) : await adjustDebt(data, admin.id));
  });
}
