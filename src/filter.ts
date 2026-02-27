export type FilterConfig = {
  requireOrderbook?: boolean;
  keywords?: string[];
  negativeKeywords?: string[];
  minScore?: number;
};

const DEFAULT_KEYWORDS = [
  "btc",
  "bitcoin",
  "5 minute",
  "5-minute",
  "five minute",
  "next 5",
  "next five",
  "in the next 5",
  "in the next five",
  "within 5",
  "within five",
];

const DEFAULT_NEGATIVE = [
  "eth",
  "ethereum",
  "sol",
  "solana",
  "doge",
  "politics",
  "election",
  "nba",
  "nfl",
];

function norm(s: string) {
  return String(s || "").toLowerCase();
}

export function scoreMarketText(text: string, cfg?: FilterConfig) {
  const t = norm(text);
  const keywords = (cfg?.keywords?.length ? cfg.keywords : DEFAULT_KEYWORDS).map(norm);
  const negative = (cfg?.negativeKeywords?.length ? cfg.negativeKeywords : DEFAULT_NEGATIVE).map(norm);

  let score = 0;

  for (const k of keywords) {
    if (t.includes(k)) {
      // weighted: btc/bitcoin more important
      if (k === "btc" || k === "bitcoin") score += 4;
      else if (k.includes("5")) score += 3;
      else score += 1;
    }
  }

  for (const nk of negative) {
    if (t.includes(nk)) score -= 3;
  }

  // Bonus for patterns that strongly indicate a short-expiry price move question
  if (t.includes("in the next") && (t.includes("minute") || t.includes("minutes"))) score += 2;
  if ((t.includes("above") || t.includes("below")) && (t.includes("$") || t.match(/\b\d{2,6}\b/))) score += 1;

  return score;
}

export function isLikelyBtc5MinMarket(opts: {
  question: string;
  slug: string;
  cfg?: FilterConfig;
}) {
  const minScore = opts.cfg?.minScore ?? 7;
  const combined = `${opts.question} ${opts.slug}`;
  return scoreMarketText(combined, opts.cfg) >= minScore;
}
