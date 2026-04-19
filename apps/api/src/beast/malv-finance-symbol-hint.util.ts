/** Best-effort symbol resolution for finance quotes from natural language. */
export function extractFinanceSymbolHint(userText: string): { symbol: string; label: string } {
  const t = userText;
  if (/\bBITCOIN\b|\bBTC\b/i.test(t)) return { symbol: "BTC", label: "Bitcoin" };
  if (/\bETHEREUM\b|\bETH\b/i.test(t)) return { symbol: "ETH", label: "Ethereum" };
  if (/\bSOL\b|\bSOLANA\b/i.test(t)) return { symbol: "SOL", label: "Solana" };
  const m = t.toUpperCase().match(/\b([A-Z]{2,5})\b/);
  const noise = new Set([
    "THE",
    "AND",
    "FOR",
    "YTD",
    "OHLC",
    "NYSE",
    "NASDAQ",
    "STOCK",
    "STOCKS",
    "PRICE",
    "NEWS",
    "LAST",
    "WEEK",
    "THIS",
    "THAT"
  ]);
  if (m?.[1] && !noise.has(m[1])) {
    return { symbol: m[1], label: m[1] };
  }
  return { symbol: "SPY", label: "S&P 500 ETF (proxy)" };
}
