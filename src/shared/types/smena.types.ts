export interface Smena {
  id: string;
  terminalId: string;
  cashierId: string;
  cashierName: string;
  status: 'OPEN' | 'CLOSED';
  initialCash: number;
  finalCash: number | null;
  zReportNumber: number;
  openedAt: string;
  closedAt: string | null;
  synced: boolean;
  regosZReportId?: number | null;
  stats?: SmenaStats;
  fiscal?: SmenaFiscalStats;
  movements?: SmenaMovement[];
}

/** Per-smena fiscalization aggregates (REGOS:VCR), derived from local sales. */
export interface SmenaFiscalStats {
  fiscalizedCount: number;
  fiscalizedAmount: number;
  pendingCount: number;
  failedCount: number;
}

export interface SmenaMovement {
  id: string;
  smenaId: string;
  type: 'PAY_IN' | 'PAY_OUT';
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface SmenaStats {
  cashSalesCount: number;
  cashSalesAmount: number;
  cardSalesCount: number;
  cardSalesAmount: number;
  /**
   * Click, as a part of the card (cashless) figures above — never added to them again. Optional:
   * a LAN main on an older build sends stats without it.
   */
  clickSalesCount?: number;
  clickSalesAmount?: number;
  totalRevenue: number;
  totalDiscounts: number;
  returnCount: number;
  returnAmount: number;
  payInTotal: number;
  payOutTotal: number;
}
