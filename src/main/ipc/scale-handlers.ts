import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { ScaleSyncService } from "../scale/scale-sync.service";
import { getPrismaClient } from "../database/sqlite-client";
import { buildRongtaTxp, type TxpExportResult } from "../../shared/utils/rongta-txp";

/** Where the RLS1000 software installs itself; its PLU manager opens files from here. */
const RLS_DIR = "C:\\RLS";
const TXP_FILE = "posgro-plu.TXP";

// Shared service instance (one TCP connection pool for the whole app)
let scaleSyncService: ScaleSyncService | null = null;

function getScaleService(): ScaleSyncService {
  if (!scaleSyncService) {
    scaleSyncService = new ScaleSyncService();
  }
  return scaleSyncService;
}

export function setupScaleHandlers(): void {
  /** Test TCP connectivity to the scale */
  ipcMain.handle("scale:testConnection", async () => {
    return getScaleService().testConnection();
  });

  /** Push one weighted product to the scale by DB product id */
  ipcMain.handle("scale:syncProduct", async (_event, productId: number) => {
    return getScaleService().syncProductById(productId);
  });

  /** Push all weighted products to the scale */
  ipcMain.handle("scale:syncAll", async () => {
    return getScaleService().syncAllWeightedProducts();
  });

  /** Update scale IP/port from the settings page */
  ipcMain.handle(
    "scale:updateConfig",
    async (_event, ip: string, port: number) => {
      // Persist to DB so it survives restarts
      const prisma = getPrismaClient();
      await prisma.systemSetting.upsert({
        where: { key: "scale_ip" },
        update: { value: ip },
        create: { key: "scale_ip", value: ip },
      });
      await prisma.systemSetting.upsert({
        where: { key: "scale_port" },
        // ⚠️  VERIFY_LATER: replace default port once protocol is confirmed
        update: { value: String(port) },
        create: { key: "scale_port", value: String(port) },
      });
      getScaleService().updateConfig({ ip, port });
      return { success: true };
    },
  );

  /**
   * Write every active per-kg product to a .TXP file for the RLS1000 PLU manager
   * (Import from TXP file → Download). See rongta-txp.ts for the format.
   */
  ipcMain.handle("scale:exportTxp", async (): Promise<TxpExportResult> => {
    const prisma = getPrismaClient();
    const [products, coded] = await Promise.all([
      prisma.product.findMany({
        where: { active: true, unit: { in: ["кг", "kg"] } },
        select: { id: true, storeProductCode: true, internalCode: true, nameUz: true, price: true },
      }),
      prisma.product.findMany({
        where: { active: true, storeProductCode: { not: null } },
        select: { storeProductCode: true },
      }),
    ]);
    type Row = {
      id: number;
      storeProductCode: number | null;
      internalCode: string | null;
      nameUz: string;
      price: { toNumber(): number };
    };
    const built = buildRongtaTxp(
      products.map((p: Row) => ({ ...p, price: p.price.toNumber() })),
      new Set(coded.map((c: { storeProductCode: number }) => c.storeProductCode)),
    );

    // Always the same file, so the PLU manager's "Import from TXP file" can just re-open it.
    // writeFile creates it on the first export and overwrites it after that.
    const filePath = path.join(fs.existsSync(RLS_DIR) ? RLS_DIR : app.getPath("documents"), TXP_FILE);
    // The builder guarantees ASCII, so this is byte-identical in GBK, cp1251 or UTF-8.
    await fs.promises.writeFile(filePath, built.text, "latin1");
    return { path: filePath, exported: built.exported, skipped: built.skipped };
  });

  /** Load persisted scale config from DB on startup */
  ipcMain.handle("scale:getConfig", async () => {
    const prisma = getPrismaClient();
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ["scale_ip", "scale_port"] } },
    });
    const map = Object.fromEntries(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
    return {
      ip: map["scale_ip"] ?? "192.168.1.20",
      // ⚠️  VERIFY_LATER: default port
      port: parseInt(map["scale_port"] ?? "8080", 10),
    };
  });
}
