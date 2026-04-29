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
  stats?: SmenaStats;
  movements?: SmenaMovement[];
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
  totalRevenue: number;
  totalDiscounts: number;
  returnCount: number;
  returnAmount: number;
  payInTotal: number;
  payOutTotal: number;
}
