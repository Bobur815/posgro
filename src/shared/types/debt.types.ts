/**
 * Nasiya — customers who take goods on credit.
 *
 * A debtor is a `User` with role CLIENT, not a table of its own: the person running a tab may be
 * a customer or a member of staff, and two tables would mean two answers to "whose phone number
 * is this". These are the shapes the IPC layer hands the renderer, with Decimals already turned
 * into numbers (see serializeDebtor in main/ipc/debtors-handlers.ts).
 */

export interface Debtor {
  id: string;
  phone: string;
  nameRu: string;
  nameUz: string;
  /** ADMIN/USER is a member of staff running a tab; CLIENT is a customer record. */
  role: string;
  /** Positive = they owe the shop. Negative = they have paid ahead. */
  debt: number;
  /** When the whole balance is due, if anything was agreed. */
  debtDueDate: string | Date | null;
  isActive: boolean;
  createdAt: string | Date;
}

/** CHARGE puts goods on the tab, PAYMENT takes money off it, ADJUSTMENT corrects it by hand. */
export type DebtTransactionType = 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';

export interface DebtTransaction {
  id: string;
  type: DebtTransactionType;
  /** Signed: + increases the debt, − reduces it. The sign is decided in the main process. */
  amount: number;
  paymentMethod: string | null;
  /** CHARGE rows only: the credit sale this came from. */
  saleId: string | null;
  /** CHARGE rows only: when payments finished covering it, and its receipt was fiscalized. */
  settledAt: string | Date | null;
  dueDate: string | Date | null;
  note: string | null;
  createdBy: string;
  createdAt: string | Date;
}

export interface DebtLedger {
  debtor: Debtor;
  /** The stored running balance. */
  balance: number;
  /** The same figure re-derived from the rows — shown beside it so the screen can check itself. */
  ledgerBalance: number;
  transactions: DebtTransaction[];
  /**
   * Whether a payment fiscalizes what it pays off — by the device of the terminal that keeps the
   * book, which for a satellite is its main. Absent from a build before satellites kept debts.
   */
  fiscalEnabled?: boolean;
}

/** A credit sale this person has not finished paying for. */
export interface UnpaidCreditSale {
  chargeId: string;
  saleId: string | null;
  amount: number;
  receiptNumber: string | null;
  createdAt: string | Date;
}
