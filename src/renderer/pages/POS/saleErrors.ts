/**
 * Turn a sale IPC failure into a message for the cashier.
 *
 * The main process throws structured errors as a JSON string (see sales-handlers.ts), and Electron
 * wraps that in its own text: `Error invoking remote method '...': Error: {json}`. So the payload
 * is dug out from the first `{` rather than parsed directly.
 *
 * Shared by POSScreen (quick pay) and Checkout, which used to carry identical private copies —
 * meaning a new error code had to be added twice and was silently untranslated in whichever one
 * was missed.
 */
export function parseSaleError(
  err: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const message = err instanceof Error ? err.message : String(err);
  const jsonStart = message.indexOf("{");
  const jsonStr = jsonStart !== -1 ? message.slice(jsonStart) : "";
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.code === "PRODUCT_NOT_FOUND") {
      return t("errors.productNotFound", { id: parsed.productId });
    }
    if (parsed.code === "PRODUCT_INACTIVE") {
      return t("errors.productInactive", { name: parsed.name });
    }
    if (parsed.code === "INSUFFICIENT_STOCK") {
      return t("errors.insufficientStock", {
        name: parsed.name,
        available: parsed.available,
        requested: parsed.requested,
      });
    }
    if (parsed.code === "NO_SMENA_OPEN") {
      return t("smena.noOpenSmena");
    }
    // Editing a receipt the fiscal system already owns — the cashier needs to refund and re-ring,
    // so say that rather than leaking the raw guard.
    if (parsed.code === "SALE_ALREADY_FISCALIZED") {
      return t("errors.saleAlreadyFiscalized");
    }
    if (parsed.code === "SALE_HAS_PAYMENT") {
      return t("errors.saleHasPayment");
    }
    // A satellite that cannot reach its main terminal refuses to sell rather than selling from its
    // own copy of the stock; the cart stays as it is, so the cashier retries once the main is back.
    if (parsed.code === "MAIN_UNREACHABLE") {
      return t("errors.mainUnreachable");
    }
    if (parsed.code === "MAIN_SESSION_EXPIRED") {
      return t("errors.mainSessionExpired");
    }
    if (parsed.code === "DEVICE_UNPAIRED") {
      return t("errors.deviceUnpaired");
    }
    if (parsed.code === "MAIN_SUPERSEDED") {
      return t("errors.mainSuperseded");
    }
    // The main is handing its role to another till (§11.4) — seconds; the cart is kept.
    if (parsed.code === "MAIN_HANDING_OFF") {
      return t("errors.mainHandingOff");
    }
    if (parsed.code === "SATELLITE_READ_ONLY") {
      return t("errors.satelliteReadOnly");
    }
    // The till's license (src/main/license/): the store is past its days to pay, the till is overdue
    // to check in, or its clock is set back and every receipt would carry the wrong date.
    if (parsed.code === "SUBSCRIPTION_BLOCKED") {
      return t("auth.errors.subscription_blocked");
    }
    if (parsed.code === "LICENSE_CHECKIN_REQUIRED") {
      return t("auth.errors.license_checkin_required");
    }
    if (parsed.code === "CLOCK_BEHIND") {
      return t("license.clockBehind");
    }
  } catch {
    // not JSON, fall through
  }
  return message || t("common.error");
}
