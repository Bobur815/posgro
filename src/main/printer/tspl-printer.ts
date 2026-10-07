import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { getPrismaClient } from "../database/sqlite-client";
import {
  buildFullTSPL,
  toCP1251,
  type TsplLabelItem,
  type TsplPrintRequest,
} from "./tspl-builder";

export type { TsplLabelItem, TsplPrintRequest };

function sendRawToPrinter(printerName: string, data: Buffer): void {
  const stamp = Date.now();
  const tmpData = path.join(os.tmpdir(), `prtag_${stamp}.prn`);
  const tmpScript = path.join(os.tmpdir(), `rawprint_${stamp}.ps1`);

  fs.writeFileSync(tmpData, data);

  // Escape paths for PowerShell single-quoted strings
  const safePrinter = printerName.replace(/'/g, "''");
  const safeFile = tmpData.replace(/\\/g, "\\\\").replace(/'/g, "''");

  const ps = `
$printerName = '${safePrinter}'
$filePath = '${safeFile}'
$bytes = [System.IO.File]::ReadAllBytes($filePath)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA")]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr p);
  [DllImport("winspool.Drv")]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA")]
  public static extern int StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA d);
  [DllImport("winspool.Drv")]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv")]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")]
  public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    public string pDocName = "PriceTag";
    public string pOutputFile = null;
    public string pDataType = "RAW";
  }
}
"@
$handle = [IntPtr]::Zero
[RawPrint]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero) | Out-Null
$docInfo = New-Object RawPrint+DOCINFOA
[RawPrint]::StartDocPrinter($handle, 1, $docInfo) | Out-Null
[RawPrint]::StartPagePrinter($handle) | Out-Null
$gcHandle = [Runtime.InteropServices.GCHandle]::Alloc($bytes, 'Pinned')
$written = 0
[RawPrint]::WritePrinter($handle, $gcHandle.AddrOfPinnedObject(), $bytes.Length, [ref]$written) | Out-Null
$gcHandle.Free()
[RawPrint]::EndPagePrinter($handle) | Out-Null
[RawPrint]::EndDocPrinter($handle) | Out-Null
[RawPrint]::ClosePrinter($handle) | Out-Null
`;

  fs.writeFileSync(tmpScript, ps, "utf8");

  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${tmpScript}"`, {
      shell: "cmd.exe",
      stdio: "pipe",
    });
  } finally {
    try {
      fs.unlinkSync(tmpScript);
    } catch {}
    try {
      fs.unlinkSync(tmpData);
    } catch {}
  }
}

export async function printPriceTagsTSPL(req: TsplPrintRequest): Promise<void> {
  const prisma = getPrismaClient();
  const settingRows = await prisma.systemSetting.findMany({
    where: { key: { in: ["label_printer_name", "printer_name"] } },
  });
  const settingsMap = Object.fromEntries(
    settingRows.map((r: { key: string; value: string }) => [r.key, r.value]),
  );
  const printerName =
    settingsMap["label_printer_name"] ||
    settingsMap["printer_name"] ||
    process.env.PRINTER_NAME ||
    "";

  if (!printerName) {
    throw new Error(
      "No printer configured. Set a label printer in Price Tags settings.",
    );
  }

  const tspl = buildFullTSPL(req);
  const buf = toCP1251(tspl);
  sendRawToPrinter(printerName, buf);
}
