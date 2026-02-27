import { runScannerOnce } from "./scanner";
import { log } from "./logger";

async function main() {
  const alerts = await runScannerOnce();

  if (!alerts.length) {
    log.info("no alerts");
    return;
  }

  log.info({ alerts: alerts.length }, "alerts");
  for (const a of alerts.slice(0, 10)) {
    log.info(`${a.question} (${a.marketSlug}) :: ${a.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
