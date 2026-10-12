import { ipcMain } from "electron";
import { getCurrentUser } from "./auth-handlers";
import {
  createWriteOff,
  getWriteOff,
  listWriteOffs,
  parseWriteOffInput,
} from "../write-offs/write-offs";

/**
 * Write-offs from the POS page (OFFLINE_ONLY store). The boundary only — who may call — around
 * `write-offs/write-offs.ts`, which refuses on an ONLINE store and on a satellite itself.
 *
 * Refusals come back as `{ ok: false, status, message, refusal? }` rather than a thrown error, so the
 * page can show the reason in the cashier's language (`refusal.code`).
 */

/** Prisma rows carry Decimal and Date; IPC needs plain JSON. */
const ipcSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function requireAdmin() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (user.role !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

export function setupWriteOffsHandlers(): void {
  ipcMain.handle(
    "writeOffs:list",
    async (_event, filters?: { search?: string; reason?: string; page?: number; limit?: number }) => {
      requireAdmin();
      return ipcSafe(await listWriteOffs(filters ?? {}));
    },
  );

  ipcMain.handle("writeOffs:get", async (_event, id: string) => {
    requireAdmin();
    return ipcSafe(await getWriteOff(id));
  });

  ipcMain.handle("writeOffs:create", async (_event, body: unknown) => {
    const user = requireAdmin();
    const input = parseWriteOffInput(body);
    if (typeof input === "string") return { ok: false, status: 400, message: input };
    return ipcSafe(await createWriteOff(input, { id: user.id }));
  });
}
