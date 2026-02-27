import { autoPickMarkets } from "./markets";
import { bestAsk, fetchBook } from "./orderbook";
import { log } from "./logger";

export type Alert = {
  marketSlug: string;
  question: string;
  bestYes: number | null;
  bestNo: number | null;
  spread: number | null;
  reason: string;
};

function clobHost() {
  return process.env.CLOB_HOST || "https://clob.polymarket.com";
}

export async function runScannerOnce(): Promise<Alert[]> {
  const host = clobHost();
  const markets = await autoPickMarkets(host, Number(process.env.MARKET_COUNT || "20"));

  const alerts: Alert[] = [];

  for (const m of markets) {
    try {
      const yes = m.tokens.find((t) => t.outcome.toUpperCase() === "YES");
      const no = m.tokens.find((t) => t.outcome.toUpperCase() === "NO");
      if (!yes || !no) continue;

      const [yesBook, noBook] = await Promise.all([
        fetchBook(host, yes.token_id),
        fetchBook(host, no.token_id),
      ]);

      const yesAsk = bestAsk(yesBook);
      const noAsk = bestAsk(noBook);
      const bestYes = yesAsk ? yesAsk.price : null;
      const bestNo = noAsk ? noAsk.price : null;

      // Placeholder mispricing metric: YES ask + NO ask should be ~1.
      const spread = bestYes !== null && bestNo !== null ? bestYes + bestNo : null;

      const EDGE_REQUIRED = Number(process.env.EDGE_REQUIRED || "0.01");
      if (spread !== null && spread < 1 - EDGE_REQUIRED) {
        alerts.push({
          marketSlug: m.market_slug,
          question: m.question,
          bestYes,
          bestNo,
          spread,
          reason: `cheap-box: yes+no=${spread.toFixed(4)} < ${(1 - EDGE_REQUIRED).toFixed(4)}`,
        });
      }
    } catch (e: any) {
      log(`scanner error market=${m?.market_slug}: ${e?.message || e}`);
    }
  }

  return alerts;
}
