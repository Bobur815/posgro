import { ipcMain } from "electron";
import { ScaleSyncService } from "../scale/scale-sync.service";
import { getPrismaClient } from "../database/sqlite-client";

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

  /** Load persisted scale config from DB on startup */
  ipcMain.handle("scale:getConfig", async () => {
    const prisma = getPrismaClient();
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ["scale_ip", "scale_port"] } },
    });
    const map = Object.fromEntries(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
    return {
      ip: map["scale_ip"] ?? "192.168.1.87",
      // ⚠️  VERIFY_LATER: default port
      port: parseInt(map["scale_port"] ?? "8080", 10),
    };
  });
}
