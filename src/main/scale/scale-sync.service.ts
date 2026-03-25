import * as net from "net";
import { getPrismaClient } from "../database/sqlite-client";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ScaleConfig {
  ip: string;
  port: number;
  timeoutMs: number;
}

const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  ip: "192.168.1.20",
  // ⚠️  VERIFY_LATER: correct port after running RLS1000 software + Wireshark
  // Common Rongta ports to try: 8080, 3000, 502 (Modbus), 4196
  port: 8080,
  timeoutMs: 5000,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScalePlu {
  /** 6-digit zero-padded code matching internalCode in DB, e.g. "000042" */
  pluCode: string;
  nameRu: string;
  nameUz: string;
  /** Price per kg in local currency (e.g. 12000 UZS) */
  pricePerKg: number;
  unit: string;
}

export interface SyncResult {
  success: boolean;
  pluCode: string;
  error?: string;
}

export interface ConnectionStatus {
  reachable: boolean;
  ip: string;
  port: number;
  error?: string;
}

// ─── Protocol stub ────────────────────────────────────────────────────────────

/**
 * ⚠️  VERIFY_LATER: This is the ONLY function that needs to change once you
 * have the real TCP protocol.
 *
 * How to find the protocol:
 * 1. Install RLS1000 software from rongtatech.com
 * 2. Run Wireshark on your PC (filter: ip.addr == 192.168.1.20)
 * 3. Push one PLU via the RLS1000 software UI
 * 4. Inspect the captured TCP packets — that byte sequence IS the protocol
 * 5. Replace the body of this function with what you find
 *
 * Known candidates (from similar Rongta/label scale protocols):
 *   - JSON over HTTP POST to /api/plu  (most modern)
 *   - XML over TCP
 *   - Custom binary frame
 */
function buildPluPacket(plu: ScalePlu): Buffer {
  // ⚠️  STUB — replace with real protocol after Wireshark capture
  //
  // Example if HTTP POST over TCP (most likely):
  //   const body = JSON.stringify({ plu: plu.pluCode, name: plu.nameRu, price: plu.pricePerKg });
  //   const httpRequest = `POST /api/plu HTTP/1.1\r\nHost: 192.168.1.20\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`;
  //   return Buffer.from(httpRequest);
  //
  // For now: return an identifiable stub so you can see it in Wireshark
  const payload = JSON.stringify({
    _stub: true,
    pluCode: plu.pluCode,
    nameRu: plu.nameRu,
    pricePerKg: plu.pricePerKg,
    unit: plu.unit,
  });
  return Buffer.from(payload, "utf8");
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ScaleSyncService {
  private config: ScaleConfig;

  constructor(config?: Partial<ScaleConfig>) {
    this.config = { ...DEFAULT_SCALE_CONFIG, ...config };
  }

  updateConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Check if the scale TCP port is open and accepting connections. */
  async testConnection(): Promise<ConnectionStatus> {
    const { ip, port, timeoutMs } = this.config;
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ reachable: false, ip, port, error: "Connection timed out" });
      }, timeoutMs);

      socket.connect(port, ip, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ reachable: true, ip, port });
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ reachable: false, ip, port, error: err.message });
      });
    });
  }

  /** Send one PLU to the scale over TCP. */
  async syncProduct(plu: ScalePlu): Promise<SyncResult> {
    const { ip, port, timeoutMs } = this.config;
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ success: false, pluCode: plu.pluCode, error: "Timed out" });
      }, timeoutMs);

      socket.connect(port, ip, () => {
        const packet = buildPluPacket(plu);
        socket.write(packet, (err) => {
          clearTimeout(timer);
          socket.destroy();
          if (err) {
            resolve({ success: false, pluCode: plu.pluCode, error: err.message });
          } else {
            resolve({ success: true, pluCode: plu.pluCode });
          }
        });
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ success: false, pluCode: plu.pluCode, error: err.message });
      });
    });
  }

  /**
   * Sync all weighted products (productType != 'REGULAR', internalCode set)
   * to the scale. Returns results per PLU.
   */
  async syncAllWeightedProducts(): Promise<SyncResult[]> {
    const prisma = getPrismaClient();
    const products = await prisma.product.findMany({
      where: {
        active: true,
        NOT: { productType: "REGULAR" },
        internalCode: { not: null },
      },
    });

    const results: SyncResult[] = [];
    for (const product of products) {
      const plu: ScalePlu = {
        pluCode: product.internalCode!,
        nameRu: product.nameRu,
        nameUz: product.nameUz,
        pricePerKg: Number(product.price),
        unit: product.unit,
      };
      const result = await this.syncProduct(plu);
      results.push(result);
      // Small delay between PLUs to avoid flooding the scale
      await new Promise((r) => setTimeout(r, 100));
    }
    return results;
  }

  /** Sync a single product by its DB id. */
  async syncProductById(productId: number): Promise<SyncResult> {
    const prisma = getPrismaClient();
    const product = await prisma.product.findUnique({ where: { id: productId } });

    if (!product || !product.internalCode) {
      return {
        success: false,
        pluCode: String(productId),
        error: "Product not found or has no internalCode (PLU)",
      };
    }

    return this.syncProduct({
      pluCode: product.internalCode,
      nameRu: product.nameRu,
      nameUz: product.nameUz,
      pricePerKg: Number(product.price),
      unit: product.unit,
    });
  }
}
