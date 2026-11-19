// Pure maths that turns a tenant's own books (chart of accounts + general
// ledger totals) into the starting inputs of a valuation model, so the
// model begins from the company's real numbers rather than placeholders.
// No database access — the valuation service feeds it aggregated rows.

export interface AccountRow {
  code: string;
  name: string;
  type: string; // Asset | Liability | Equity | Revenue | Expense
  subGroup?: string;
}

/** debit − credit per account code. */
export type BalanceMap = Map<string, number>;

export interface CompanyFinancials {
  /** Revenue booked in the trailing twelve months. */
  revenueTtm: number;
  /** Operating expenses in the trailing twelve months (excl. D&A). */
  operatingCostTtm: number;
  /** Depreciation & amortisation booked in the trailing twelve months. */
  daTtm: number;
  /** (revenue − cash operating costs) ÷ revenue, in percent. null if no revenue. */
  ebitdaMarginPct: number | null;
  /** D&A as a percentage of revenue. null if no revenue. */
  daPct: number | null;
  totalAssets: number;
  totalLiabilities: number;
  /** Borrowings less cash and bank balances. Negative = net cash. */
  netDebt: number;
  borrowings: number;
  cash: number;
}

const DEBT = /loan|borrow|debt|overdraft|credit facility|debenture|mortgage/i;
const CASH = /\b(cash|bank|petty)\b/i;
const DA = /depreciation|amorti[sz]ation/i;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param accounts   the tenant's chart of accounts
 * @param ttm        debit − credit per code over the trailing twelve months
 * @param closing    debit − credit per code over all time (balance sheet)
 */
export function deriveCompanyFinancials(
  accounts: AccountRow[],
  ttm: BalanceMap,
  closing: BalanceMap,
): CompanyFinancials {
  let revenue = 0;
  let opCost = 0;
  let da = 0;
  let assets = 0;
  let liabilities = 0;
  let borrowings = 0;
  let cash = 0;

  for (const a of accounts) {
    const flow = ttm.get(a.code) ?? 0;
    const bal = closing.get(a.code) ?? 0;
    const label = `${a.name} ${a.subGroup ?? ''}`;
    switch (a.type) {
      case 'Revenue':
        revenue += -flow;
        break;
      case 'Expense':
        if (DA.test(a.name)) da += flow;
        else opCost += flow;
        break;
      case 'Asset':
        assets += bal;
        if (CASH.test(label)) cash += bal;
        break;
      case 'Liability':
        liabilities += -bal;
        if (DEBT.test(label)) borrowings += -bal;
        break;
    }
  }

  return {
    revenueTtm: r2(revenue),
    operatingCostTtm: r2(opCost),
    daTtm: r2(da),
    ebitdaMarginPct:
      revenue > 0 ? r2(((revenue - opCost) / revenue) * 100) : null,
    daPct: revenue > 0 ? r2((da / revenue) * 100) : null,
    totalAssets: r2(assets),
    totalLiabilities: r2(liabilities),
    netDebt: r2(borrowings - cash),
    borrowings: r2(borrowings),
    cash: r2(cash),
  };
}
