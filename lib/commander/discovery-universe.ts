import type { CommanderPrimaryMode } from "./types";

const AGGRESSIVE_POOL = [
  "NVDA", "AMD", "AVGO", "META", "AMZN", "TSLA", "NFLX", "SHOP", "UBER", "SNOW",
  "PLTR", "SMCI", "CRWD", "PANW", "MDB", "DDOG", "NET", "ZS", "NOW", "ADBE",
  "MSFT", "AAPL", "GOOGL", "TSM", "ASML", "MU", "ANET", "ARM", "COIN", "RBLX",
  "TWLO", "SQ", "PYPL", "MELI", "CELH", "NVO", "LLY", "VRTX", "DXCM", "ENPH",
  "ON", "KLAC", "LRCX", "AMAT", "TXN", "QCOM", "MRVL", "WDAY", "TEAM", "INTU",
  "CRM", "ORCL", "BABA", "PDD", "BIDU", "SE", "APP", "ABNB", "DAL", "UAL",
  "RCL", "CCL", "BKNG", "EXPE", "ALGN", "ISRG", "REGN", "MRNA", "BIIB", "GILD",
  "DIS", "CMCSA", "SONY", "EA", "TTWO", "ROKU", "FSLR", "RUN", "SEDG", "XPEV",
  "NIO", "LI", "RIVN", "LCID", "GM", "F", "DE", "CAT", "BA", "LULU",
  "COST", "WMT", "HD", "LOW", "TJX", "MCD", "SBUX", "NKE", "PINS", "DOCU",
];

const BALANCED_POOL = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "BRK.B", "JPM", "V", "MA",
  "UNH", "LLY", "JNJ", "PG", "XOM", "CVX", "HD", "COST", "WMT", "PEP",
  "KO", "ABBV", "MRK", "ADBE", "CRM", "ORCL", "AVGO", "QCOM", "TXN", "ASML",
  "TSM", "NVO", "SAP", "TMUS", "CMCSA", "MCD", "DIS", "ABT", "DHR", "AMGN",
  "ISRG", "LIN", "HON", "UPS", "RTX", "CAT", "DE", "GE", "UNP", "COP",
  "SPY", "QQQ", "DIA", "VTI", "VOO", "RSP", "SCHX", "IWB", "XLF", "XLK",
  "XLI", "XLV", "XLP", "XLE", "XLY", "XLU", "XLRE", "SMH", "SOXX", "IWM",
  "MDY", "EWJ", "EFA", "VGK", "MCHI", "ARKK", "USO", "GLD", "SLV", "TLT",
  "IEF", "SHY", "BIL", "HYG", "LQD", "AGG", "VNQ", "SCHD", "DGRO", "VIG",
  "JNK", "TIP", "DBC", "IYR", "FDN", "IGV", "VGT", "QUAL", "MTUM", "USMV",
];

const DEFENSIVE_POOL = [
  "XLP", "XLU", "XLV", "USMV", "SPLV", "QUAL", "DGRO", "VIG", "SCHD", "NOBL",
  "VTV", "IWD", "SPHD", "DVY", "HDV", "VYM", "VGV", "VOE", "IJH", "IWB",
  "JNJ", "PG", "KO", "PEP", "WMT", "COST", "MCD", "CL", "KMB", "MDT",
  "ABT", "MRK", "PFE", "BMY", "AMGN", "DHR", "GILD", "UNH", "CVS", "CI",
  "SO", "DUK", "NEE", "AEP", "D", "EXC", "SRE", "ED", "XEL", "PEG",
  "WM", "RSG", "AWK", "WEC", "ECL", "MMC", "CB", "AON", "ICE", "CME",
  "TLT", "IEF", "SHY", "BIL", "AGG", "LQD", "TIP", "IAU", "GLD", "XLRE",
  "O", "NNN", "DLR", "PLD", "PSA", "SPG", "VTR", "WELL", "EQIX", "AMT",
];

const INCOME_POOL = [
  "SCHD", "VYM", "DVY", "HDV", "SPYD", "NOBL", "VIG", "DGRO", "DIVO", "JEPI",
  "JEPQ", "QYLD", "XYLD", "RYLD", "SPHD", "PFF", "BND", "LQD", "HYG", "TLT",
  "AGG", "TIP", "MUB", "VCIT", "SHY", "BIL", "BNDX", "EMB", "ANGL", "SJNK",
  "O", "NNN", "VICI", "WPC", "STAG", "MAIN", "ARCC", "BXSL", "HTGC", "PSEC",
  "XOM", "CVX", "COP", "EOG", "ENB", "TRP", "KMI", "OKE", "MPLX", "EPD",
  "T", "VZ", "IBM", "CSCO", "INTC", "AMGN", "ABBV", "BMY", "MRK", "PFE",
  "KO", "PEP", "PG", "CL", "KHC", "GIS", "SJM", "K", "MO", "PM",
  "BTI", "UL", "DEO", "MDLZ", "ED", "DUK", "SO", "AEP", "D", "NEE",
];

const OPTIONS_LIQUID_POOL = [
  "SPY", "QQQ", "IWM", "DIA", "XLF", "XLK", "XLE", "XLI", "XLP", "XLV",
  "TSLA", "NVDA", "AAPL", "MSFT", "AMZN", "META", "AMD", "GOOGL", "NFLX", "AVGO",
  "COIN", "SMCI", "PLTR", "UBER", "SHOP", "BA", "JPM", "BAC", "WFC", "GS",
  "DIS", "PFE", "UNH", "XOM", "CVX", "INTC", "CSCO", "ADBE", "CRM", "ORCL",
  "MU", "QCOM", "ARM", "TSM", "ASML", "BABA", "NIO", "RIVN", "F", "GM",
  "MARA", "RIOT", "PYPL", "SQ", "ABNB", "BKNG", "COST", "WMT", "MCD", "NKE",
  "GDX", "SLV", "GLD", "TLT", "HYG", "USO", "SMH", "SOXX", "ARKK", "TQQQ",
  "SQQQ", "UVXY", "VIXY", "XBI", "IYR", "VNQ", "KRE", "XHB", "IBIT", "BITO",
];

export const CRYPTO_DISCOVERY_POOL = [
  "BINANCE:BTCUSDT",
  "BINANCE:ETHUSDT",
  "BINANCE:SOLUSDT",
  "BINANCE:BNBUSDT",
  "BINANCE:XRPUSDT",
  "BINANCE:ADAUSDT",
  "BINANCE:DOGEUSDT",
  "BINANCE:AVAXUSDT",
  "BINANCE:LINKUSDT",
  "BINANCE:LTCUSDT",
  "BINANCE:MATICUSDT",
  "BINANCE:DOTUSDT",
] as const;

function sanitizeSymbol(s: string): string | null {
  const v = s.trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9.\-:]{1,24}$/.test(v)) return null;
  return v;
}

export function sanitizeSymbolList(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    const sym = sanitizeSymbol(raw);
    if (sym) out.add(sym);
  }
  return [...out];
}

export function discoveryPoolForPrimary(primaryMode: CommanderPrimaryMode): string[] {
  switch (primaryMode) {
    case "AGGRESSIVE_GROWTH":
      return AGGRESSIVE_POOL;
    case "DEFENSIVE":
      return DEFENSIVE_POOL;
    case "HIGHEST_INCOME":
      return INCOME_POOL;
    case "OPTIONS_FOCUS":
      return OPTIONS_LIQUID_POOL;
    case "CRYPTO_FOCUS":
      return [...CRYPTO_DISCOVERY_POOL];
    case "EARNINGS_PLAYS":
      return AGGRESSIVE_POOL;
    case "CUSTOM_MIX":
    case "BALANCED":
    default:
      return BALANCED_POOL;
  }
}

export function buildDiscoveryUniverse(input: {
  primaryMode: CommanderPrimaryMode;
  size: 10 | 25 | 50 | 100;
  optionsEnabled: boolean;
  cryptoEnabled: boolean;
}): string[] {
  const source =
    input.primaryMode === "OPTIONS_FOCUS"
      ? input.optionsEnabled
        ? OPTIONS_LIQUID_POOL
        : BALANCED_POOL
      : input.primaryMode === "CRYPTO_FOCUS"
        ? input.cryptoEnabled
          ? [...CRYPTO_DISCOVERY_POOL]
          : BALANCED_POOL
        : discoveryPoolForPrimary(input.primaryMode);
  return sanitizeSymbolList(source).slice(0, input.size);
}

export function isCryptoDiscoverySymbol(symbol: string): boolean {
  return (CRYPTO_DISCOVERY_POOL as readonly string[]).includes(symbol.toUpperCase());
}
