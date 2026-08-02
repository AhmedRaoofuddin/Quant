/**
 * Company logo resolution.
 *
 * Clearbit's free logo API was discontinued, so logos resolve through reliable, token-free
 * favicon services, best-quality first. Components try each in order via the image onError
 * handler and fall back to a typographic monogram, so a clean mark always renders.
 *
 * Every ticker in the traded universe is mapped explicitly. The name-derived guess below is only
 * a safety net for symbols added later: guessing "first word + .com" is wrong often enough
 * (Alphabet, GE Aerospace, SLB) that it must never be the primary path.
 */

const DOMAINS: Record<string, string> = {
  // Technology
  AAPL: "apple.com", MSFT: "microsoft.com", NVDA: "nvidia.com", GOOGL: "abc.xyz",
  AVGO: "broadcom.com", ORCL: "oracle.com", CRM: "salesforce.com", ADBE: "adobe.com",
  TSM: "tsmc.com", AMD: "amd.com", INTC: "intel.com", QCOM: "qualcomm.com",
  TXN: "ti.com", AMAT: "appliedmaterials.com", MU: "micron.com", IBM: "ibm.com",
  NOW: "servicenow.com", PANW: "paloaltonetworks.com",

  // Communications & media
  META: "meta.com", DIS: "thewaltdisneycompany.com", NFLX: "netflix.com",
  T: "att.com", CMCSA: "comcast.com", VZ: "verizon.com", TMUS: "t-mobile.com",

  // Financials
  JPM: "jpmorganchase.com", BAC: "bankofamerica.com", GS: "goldmansachs.com",
  MS: "morganstanley.com", V: "visa.com", MA: "mastercard.com", WFC: "wellsfargo.com",
  C: "citigroup.com", SCHW: "schwab.com", BLK: "blackrock.com",
  AXP: "americanexpress.com", SPGI: "spglobal.com",

  // Healthcare
  JNJ: "jnj.com", UNH: "unitedhealthgroup.com", LLY: "lilly.com", PFE: "pfizer.com",
  MRK: "merck.com", ABBV: "abbvie.com", TMO: "thermofisher.com", ABT: "abbott.com",
  DHR: "danaher.com", AMGN: "amgen.com", GILD: "gilead.com", CVS: "cvshealth.com",

  // Energy
  XOM: "exxonmobil.com", CVX: "chevron.com", COP: "conocophillips.com",
  SLB: "slb.com", EOG: "eogresources.com", PSX: "phillips66.com",

  // Consumer
  AMZN: "amazon.com", WMT: "walmart.com", HD: "homedepot.com", PG: "pg.com",
  KO: "coca-colacompany.com", MCD: "mcdonalds.com", COST: "costco.com", NKE: "nike.com",
  TSLA: "tesla.com", SBUX: "starbucks.com", TGT: "target.com", LOW: "lowes.com",
  PEP: "pepsico.com", MDLZ: "mondelezinternational.com",

  // Industrials
  CAT: "caterpillar.com", BA: "boeing.com", GE: "geaerospace.com", HON: "honeywell.com",
  UPS: "ups.com", RTX: "rtx.com", LMT: "lockheedmartin.com", DE: "deere.com",
  UNP: "up.com",

  // Index and sector ETFs, plus the crypto and rates instruments on the markets page.
  SPY: "ssga.com", QQQ: "invesco.com", DIA: "ssga.com", IWM: "ishares.com",
  VTI: "vanguard.com", EFA: "ishares.com", EEM: "ishares.com", VXX: "barclays.com",
  XLK: "ssga.com", XLF: "ssga.com", XLV: "ssga.com", XLE: "ssga.com", XLI: "ssga.com",
  XLY: "ssga.com", XLP: "ssga.com", XLU: "ssga.com", XLB: "ssga.com", XLRE: "ssga.com",
  XLC: "ssga.com", GLD: "ssga.com", SLV: "ishares.com", USO: "uscfinvestments.com",
  UNG: "uscfinvestments.com", DBA: "invesco.com", DBC: "invesco.com",
  TLT: "ishares.com", IEF: "ishares.com", SHY: "ishares.com", HYG: "ishares.com",
  LQD: "ishares.com", BTC: "bitcoin.org", ETH: "ethereum.org",
};

/** Best-known domain for a ticker, falling back to a name-derived guess for unmapped symbols. */
export function domainFor(symbol: string, name?: string): string | null {
  const direct = DOMAINS[symbol.toUpperCase()];
  if (direct) return direct;
  if (!name) return null;
  const first = name.replace(/^the\s+/i, "").replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)[0];
  return first ? `${first.toLowerCase()}.com` : null;
}

/** True when the ticker has a hand-checked domain rather than a guess. */
export function hasKnownDomain(symbol: string): boolean {
  return Boolean(DOMAINS[symbol.toUpperCase()]);
}

/**
 * Domains for which DuckDuckGo has no mark and answers with its generic globe placeholder (or an
 * empty body). The placeholder is a valid 48x48 PNG served under HTTP 404, so the browser loads it
 * successfully and `onError` never fires: left in the chain it would silently paint a globe where
 * a logo belongs. These skip DuckDuckGo entirely.
 *
 * Verified by hashing each response against the known placeholder. Re-check with:
 *   node scripts/audit-logos.mjs
 */
const DDG_BLANK = new Set([
  "chevron.com", "homedepot.com", "costco.com",
  "honeywell.com", "appliedmaterials.com", "adobe.com",
]);

/** Ordered list of logo image URLs to try for a domain, best quality first. */
export function logoSources(domain: string | null): string[] {
  if (!domain) return [];
  const google = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const unavatar = `https://unavatar.io/${domain}?fallback=false`;
  if (DDG_BLANK.has(domain)) return [google, unavatar];
  return [`https://icons.duckduckgo.com/ip3/${domain}.ico`, google, unavatar];
}
