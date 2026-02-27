import { runScannerOnce } from "./scanner";
import { log } from "./logger";
import { fetchBtcSpotUsd } from "./spot";
import { loadState, pushSpotSample, saveState, spotReturnBps } from "./state";

async function main() {
  // 1) sample spot BTC
  const state = loadState();
  try {
    const spot = await fetchBtcSpotUsd();
    pushSpotSample(state, { ts: spot.ts, price: spot.price });
    saveState(state);
  } catch (e: any) {
    log.warn({ err: e?.message || e }, "spot sample failed");
  }

  const ret60 = spotReturnBps(state, 60_000);
  const ret300 = spotReturnBps(state, 300_000);

  // 2) scan Polymarket for pricing anomalies
  const alerts = await runScannerOnce();

  if (!alerts.length) {
    log.info({ ret60_bps: ret60, ret300_bps: ret300 }, "no alerts");
    return;
  }

  log.info({ alerts: alerts.length, ret60_bps: ret60, ret300_bps: ret300 }, "alerts");
  for (const a of alerts.slice(0, 10)) {
    log.info(`${a.question} (${a.marketSlug}) :: ${a.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
