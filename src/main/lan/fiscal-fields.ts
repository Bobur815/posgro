/**
 * A receipt's fiscal state — the columns a fiscalization writes. The main answers a satellite's
 * "fiscalize this receipt" with them, and the satellite copies them onto the receipt it keeps, so
 * its history's badge and button follow without waiting for anything else to refresh it.
 */
export const FISCAL_FIELDS = {
  fiscalStatus: true,
  fiscalAttempts: true,
  fiscalError: true,
  regosReceiptId: true,
  regosFiscalSign: true,
  regosQrCodeUrl: true,
  regosTerminalId: true,
  regosReceiptNo: true,
  regosFiscalAt: true,
} as const;
