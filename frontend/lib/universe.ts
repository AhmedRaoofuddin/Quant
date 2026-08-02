/**
 * The traded universe as pure data.
 *
 * Kept separate from `marketdata.ts` because that module imports `node:fs` for its disk cache,
 * which makes it unimportable from a client component. Anything that only needs the symbol list
 * (logos, labels, sector colours) imports this instead.
 */

export interface UniverseMember { symbol: string; name: string; sector: string }

export const UNIVERSE: UniverseMember[] = [
  { symbol: "AAPL", name: "Apple", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer" },
  { symbol: "META", name: "Meta Platforms", sector: "Communications" },
  { symbol: "AVGO", name: "Broadcom", sector: "Technology" },
  { symbol: "ORCL", name: "Oracle", sector: "Technology" },
  { symbol: "CRM", name: "Salesforce", sector: "Technology" },
  { symbol: "ADBE", name: "Adobe", sector: "Technology" },
  { symbol: "JPM", name: "JPMorgan", sector: "Financials" },
  { symbol: "BAC", name: "Bank of America", sector: "Financials" },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials" },
  { symbol: "MS", name: "Morgan Stanley", sector: "Financials" },
  { symbol: "V", name: "Visa", sector: "Financials" },
  { symbol: "MA", name: "Mastercard", sector: "Financials" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare" },
  { symbol: "LLY", name: "Eli Lilly", sector: "Healthcare" },
  { symbol: "PFE", name: "Pfizer", sector: "Healthcare" },
  { symbol: "MRK", name: "Merck", sector: "Healthcare" },
  { symbol: "ABBV", name: "AbbVie", sector: "Healthcare" },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy" },
  { symbol: "CVX", name: "Chevron", sector: "Energy" },
  { symbol: "COP", name: "ConocoPhillips", sector: "Energy" },
  { symbol: "WMT", name: "Walmart", sector: "Consumer" },
  { symbol: "HD", name: "Home Depot", sector: "Consumer" },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer" },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer" },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer" },
  { symbol: "COST", name: "Costco", sector: "Consumer" },
  { symbol: "NKE", name: "Nike", sector: "Consumer" },
  { symbol: "CAT", name: "Caterpillar", sector: "Industrials" },
  { symbol: "BA", name: "Boeing", sector: "Industrials" },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials" },
  { symbol: "HON", name: "Honeywell", sector: "Industrials" },
  { symbol: "DIS", name: "Disney", sector: "Communications" },
  { symbol: "NFLX", name: "Netflix", sector: "Communications" },
  { symbol: "T", name: "AT&T", sector: "Communications" },
  // --- extended S&P large-cap coverage ---
  { symbol: "TSM", name: "TSMC", sector: "Technology" },
  { symbol: "AMD", name: "AMD", sector: "Technology" },
  { symbol: "INTC", name: "Intel", sector: "Technology" },
  { symbol: "QCOM", name: "Qualcomm", sector: "Technology" },
  { symbol: "TXN", name: "Texas Instruments", sector: "Technology" },
  { symbol: "AMAT", name: "Applied Materials", sector: "Technology" },
  { symbol: "MU", name: "Micron", sector: "Technology" },
  { symbol: "IBM", name: "IBM", sector: "Technology" },
  { symbol: "NOW", name: "ServiceNow", sector: "Technology" },
  { symbol: "PANW", name: "Palo Alto Networks", sector: "Technology" },
  { symbol: "WFC", name: "Wells Fargo", sector: "Financials" },
  { symbol: "C", name: "Citigroup", sector: "Financials" },
  { symbol: "SCHW", name: "Charles Schwab", sector: "Financials" },
  { symbol: "BLK", name: "BlackRock", sector: "Financials" },
  { symbol: "AXP", name: "American Express", sector: "Financials" },
  { symbol: "SPGI", name: "S&P Global", sector: "Financials" },
  { symbol: "TMO", name: "Thermo Fisher", sector: "Healthcare" },
  { symbol: "ABT", name: "Abbott", sector: "Healthcare" },
  { symbol: "DHR", name: "Danaher", sector: "Healthcare" },
  { symbol: "AMGN", name: "Amgen", sector: "Healthcare" },
  { symbol: "GILD", name: "Gilead", sector: "Healthcare" },
  { symbol: "CVS", name: "CVS Health", sector: "Healthcare" },
  { symbol: "SLB", name: "SLB", sector: "Energy" },
  { symbol: "EOG", name: "EOG Resources", sector: "Energy" },
  { symbol: "PSX", name: "Phillips 66", sector: "Energy" },
  { symbol: "TSLA", name: "Tesla", sector: "Consumer" },
  { symbol: "SBUX", name: "Starbucks", sector: "Consumer" },
  { symbol: "TGT", name: "Target", sector: "Consumer" },
  { symbol: "LOW", name: "Lowe's", sector: "Consumer" },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer" },
  { symbol: "MDLZ", name: "Mondelez", sector: "Consumer" },
  { symbol: "UPS", name: "UPS", sector: "Industrials" },
  { symbol: "RTX", name: "RTX", sector: "Industrials" },
  { symbol: "LMT", name: "Lockheed Martin", sector: "Industrials" },
  { symbol: "DE", name: "Deere", sector: "Industrials" },
  { symbol: "UNP", name: "Union Pacific", sector: "Industrials" },
  { symbol: "CMCSA", name: "Comcast", sector: "Communications" },
  { symbol: "VZ", name: "Verizon", sector: "Communications" },
  { symbol: "TMUS", name: "T-Mobile", sector: "Communications" },
];

const BY_SYMBOL = new Map(UNIVERSE.map((m) => [m.symbol, m]));

/** Name and sector for a ticker, so callers do not have to thread them through the tree. */
export function universeMember(symbol: string): UniverseMember | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}
