import type { LocalState } from "./state";
import type { Market } from "./markets";

export type ParsedBarrier = {
  direction: "above" | "below";
  strike: number;
};

export function parseBtcBarrier(question: string): ParsedBarrier | null {
  const q = (question || "").toLowerCase();

  // Must mention BTC + a $ strike
  if (!q.includes("btc") && !q.includes("bitcoin")) return null;

  const mStrike = q.match(/\$\s*([0-9]{2,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
  if (!mStrike) return null;
  const strike = Number(String(mStrike[1]).replace(/,/g, ""));
  if (!Number.isFinite(strike) || strike <= 0) return null;

  const isAbove = /\b(above|over|greater than|at or above|>=)\b/.test(q);
  const isBelow = /\b(below|under|less than|at or below|<=)\b/.test(q);
  if (isAbove === isBelow) {
    // ambiguous
    return null;
  }

  return { direction: isAbove ? "above" : "below", strike };
}

function std(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function computeSigmaAnnFromSpot(state: LocalState, windowMs: number) {
  const arr = state.spotHistory || [];
  const cutoff = Date.now() - windowMs;
  const samples = arr.filter((s) => s.ts >= cutoff).slice(-2000);
  if (samples.length < 5) return null;

  const rets: number[] = [];
  const dts: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a?.price || !b?.price) continue;
    if (b.ts <= a.ts) continue;
    const r = Math.log(b.price / a.price);
    rets.push(r);
    dts.push((b.ts - a.ts) / 1000);
  }

  const s = std(rets);
  if (s === null) return null;

  // scale by typical dt
  dts.sort((x, y) => x - y);
  const dt = dts[Math.floor(dts.length / 2)] || 60;

  const secPerYear = 365 * 24 * 60 * 60;
  const sigmaAnn = s * Math.sqrt(secPerYear / dt);

  const min = Number(process.env.SIGMA_MIN || "0.2");
  const max = Number(process.env.SIGMA_MAX || "2.0");
  return Math.max(min, Math.min(max, sigmaAnn));
}

// Standard normal CDF approximation (Abramowitz-Stegun)
function normCdf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x) / Math.sqrt(2);
  // erf approximation
  const t = 1 / (1 + 0.3275911 * abs);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-abs * abs);
  return 0.5 * (1 + sign * erf);
}

export function fairProbAbove(opts: { spot: number; strike: number; sigmaAnn: number; dtSec: number }) {
  const { spot: S, strike: K, sigmaAnn, dtSec } = opts;
  if (dtSec <= 0) return S >= K ? 1 : 0;
  const secPerYear = 365 * 24 * 60 * 60;
  const tau = dtSec / secPerYear;
  const vol = sigmaAnn * Math.sqrt(tau);
  if (vol <= 0) return S >= K ? 1 : 0;

  const x = (Math.log(K / S) + 0.5 * sigmaAnn * sigmaAnn * tau) / vol;
  return 1 - normCdf(x);
}

export type SieveOpp = {
  marketSlug: string;
  question: string;
  side: "BUY_YES" | "BUY_NO";
  edgeNet: number;
  pFairYes: number;
  entryPrice: number;
  dtSec: number;
  strike: number;
  sigmaAnn: number;
  reason: string;
};

export function computeCostBuffer(m: Market) {
  const fee = Number(m.taker_base_fee ?? 0);
  const extra = Number(process.env.SLIPPAGE_BUFFER || "0.002");
  return fee + extra;
}

export function evaluateMarket(opts: {
  market: Market;
  yesAsk: number | null;
  noAsk: number | null;
  spot: number;
  sigmaAnn: number;
  nowMs: number;
}): SieveOpp | null {
  const { market: m, yesAsk, noAsk, spot, sigmaAnn, nowMs } = opts;
  if (!m.end_date_iso) return null;

  const parsed = parseBtcBarrier(m.question);
  if (!parsed) return null;

  const resolveMs = Date.parse(m.end_date_iso);
  if (!Number.isFinite(resolveMs)) return null;
  const dtSec = Math.floor((resolveMs - nowMs) / 1000);

  const dtMin = Number(process.env.DT_MIN_SEC || "60");
  const dtMax = Number(process.env.DT_MAX_SEC || "900");
  if (dtSec < dtMin || dtSec > dtMax) return null;

  const pAbove = fairProbAbove({ spot, strike: parsed.strike, sigmaAnn, dtSec });
  const pFairYes = parsed.direction === "above" ? pAbove : 1 - pAbove;

  const EDGE_MIN = Number(process.env.EDGE_MIN || "0.015");
  const spreadMax = Number(process.env.SPREAD_MAX || "0.08");

  // Basic spread sanity using YES book
  // (We only have asks here; spread handled upstream if needed.)

  const cost = computeCostBuffer(m);

  const cands: Array<{ side: "BUY_YES" | "BUY_NO"; edgeNet: number; entryPrice: number; reason: string }> = [];

  if (yesAsk !== null) {
    const edgeNet = pFairYes - yesAsk - cost;
    cands.push({
      side: "BUY_YES",
      edgeNet,
      entryPrice: yesAsk,
      reason: `p_fair_yes=${pFairYes.toFixed(3)} yes_ask=${yesAsk.toFixed(3)} cost=${cost.toFixed(3)}`,
    });
  }

  if (noAsk !== null) {
    const pNoFair = 1 - pFairYes;
    const edgeNet = pNoFair - noAsk - cost;
    cands.push({
      side: "BUY_NO",
      edgeNet,
      entryPrice: noAsk,
      reason: `p_fair_no=${pNoFair.toFixed(3)} no_ask=${noAsk.toFixed(3)} cost=${cost.toFixed(3)}`,
    });
  }

  if (!cands.length) return null;
  const best = cands.sort((a, b) => b.edgeNet - a.edgeNet)[0];

  // Filter by edge
  if (best.edgeNet < EDGE_MIN) return null;

  // If we have both asks, avoid ultra-wide markets
  if (yesAsk !== null && noAsk !== null) {
    const sum = yesAsk + noAsk;
    // if sum is crazy high, spreads/fees likely dominate
    if (sum > 1 + spreadMax) return null;
  }

  return {
    marketSlug: m.market_slug,
    question: m.question,
    side: best.side,
    edgeNet: best.edgeNet,
    pFairYes,
    entryPrice: best.entryPrice,
    dtSec,
    strike: parsed.strike,
    sigmaAnn,
    reason: `${best.side} edge_net=${best.edgeNet.toFixed(3)} dt=${dtSec}s strike=${parsed.strike} ${best.reason}`,
  };
}
