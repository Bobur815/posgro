// A receipt the asl-belgisi circulation gate keeps from REGOS carries its reason in fiscalError,
// worded by describeMarkingBlock() in src/main/fiscal/marking-gate.ts (Russian, like every other
// fiscalError). The screens show it in the UI language instead; change both together.

const PREFIX = "Код маркировки вне оборота: ";
const SUFFIX = ". Отредактируйте чек";

/** The "barcode (status), …" part of a marking-block error, or null for any other error. */
export function markingBlockCodes(fiscalError: string | null | undefined): string | null {
  if (!fiscalError?.startsWith(PREFIX)) return null;
  const rest = fiscalError.slice(PREFIX.length);
  return rest.endsWith(SUFFIX) ? rest.slice(0, -SUFFIX.length) : rest;
}
