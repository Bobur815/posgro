import { useCallback, useEffect, useState } from "react";
import { labelPrinter } from "../api/ipc-client";
import type {
  LabelPrinterConfig,
  LabelPrinterErrorCode,
  LabelPrinterResult,
  SerialPortInfo,
} from "@shared/types/label-printer.types";

/** i18n key for a failed print — each one tells the cashier what to do about it. */
export function labelPrinterErrorKey(code: LabelPrinterErrorCode): string {
  switch (code) {
    case "PORT_NOT_FOUND":
      return "labelPrinter.errPortNotFound";
    case "PORT_BUSY":
      return "labelPrinter.errPortBusy";
    case "WRITE_FAILED":
      return "labelPrinter.errWriteFailed";
  }
}

/** The COM-port label printer's settings, its port list, and a test print. */
export function useLabelPrinter() {
  const [config, setConfig] = useState<LabelPrinterConfig | null>(null);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);

  const refreshPorts = useCallback(async () => {
    setPortsLoading(true);
    try {
      setPorts((await labelPrinter.listPorts()) ?? []);
    } catch (err) {
      console.error("Failed to list COM ports:", err);
      setPorts([]);
    } finally {
      setPortsLoading(false);
    }
  }, []);

  useEffect(() => {
    labelPrinter
      .getConfig()
      ?.then((c) => setConfig(c))
      .catch((err) => console.error("Failed to load label printer config:", err));
    void refreshPorts();
  }, [refreshPorts]);

  const save = useCallback(async (next: LabelPrinterConfig) => {
    const saved = await labelPrinter.setConfig(next);
    if (saved) setConfig(saved);
    return saved;
  }, []);

  const testPrint = useCallback(
    async (): Promise<LabelPrinterResult> =>
      (await labelPrinter.testPrint()) ?? {
        ok: false,
        code: "WRITE_FAILED",
        message: "no IPC",
      },
    [],
  );

  return { config, ports, portsLoading, refreshPorts, save, testPrint };
}
