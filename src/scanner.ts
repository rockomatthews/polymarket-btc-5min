import { autoPickMarkets } from "./markets";
import { bestAsk, fetchBook } from "./orderbook";
import { log } from "./logger";
import { computeSigmaAnnFromSpot, evaluateMarket, type SieveOpp } from "./sieve";
import { loadState } from "./state";

export type Alert = {
  marketSlug: string;
  question: string;
  bestYes: number | null;
  bestNo: number | null;
  spread: number | null;
  reason: string;
  side?: string;
  edgeNet?: number;
  pFairYes?: number;
  strike?: number;
  dtSec?: number;
  sigmaAnn?: number;
};

function clobHost() {
  return process.env.CLOB_HOST || "https://clob.polymarket.com";
}

export async function runScannerOnce(): Promise<Alert[]> {
  const host = clobHost();
  const markets = await autoPickMarkets(host, Number(process.env.MARKET_COUNT || "40"));

  // Spot + vol
  const state = loadState();
  const latest = state.spotHistory?.[state.spotHistory.length - 1];
  const spot = latest?.price || null;
  if (!spot) {
    log.warn("no spot price available; skipping scan");
    return [];
  }

  const sigma =
    computeSigmaAnnFromSpot(state, Number(process.env.SIGMA_WINDOW_MS || String(60 * 60 * 1000))) ||
    Number(process.env.SIGMA_FALLBACK || "0.8");

  const opps: SieveOpp[] = [];

  for (const m of markets) {
    try {
      const yes = m.tokens.find((t) => t.outcome.toUpperCase() === "YES");
      const no = m.tokens.find((t) => t.outcome.toUpperCase() === "NO");
      if (!yes || !no) continue;

      const [yesBook, noBook] = await Promise.all([
        fetchBook(host, yes.token_id),
        fetchBook(host, no.token_id),
      ]);

      const yesAskTop = bestAsk(yesBook);
      const noAskTop = bestAsk(noBook);
      const yesAsk = yesAskTop ? yesAskTop.price : null;
      const noAsk = noAskTop ? noAskTop.price : null;

      const opp = evaluateMarket({
        market: m,
        yesAsk,
        noAsk,
        spot,
        sigmaAnn: sigma,
        nowMs: Date.now(),
      });

      if (opp) opps.push(opp);
    } catch (e: any) {
      log(`scanner error market=${m?.market_slug}: ${e?.message || e}`);
    }
  }

  opps.sort((a, b) => b.edgeNet - a.edgeNet);

  return opps.slice(0, Number(process.env.TOP_N || "10")).map((o) => {
    const bestYes = o.side === "BUY_YES" ? o.entryPrice : null;
    const bestNo = o.side === "BUY_NO" ? o.entryPrice : null;
    const spread = bestYes !== null && bestNo !== null ? bestYes + bestNo : null;
    return {
      marketSlug: o.marketSlug,
      question: o.question,
      bestYes,
      bestNo,
      spread,
      side: o.side,
      edgeNet: o.edgeNet,
      pFairYes: o.pFairYes,
      strike: o.strike,
      dtSec: o.dtSec,
      sigmaAnn: o.sigmaAnn,
      reason: o.reason,
    };
  });
}
