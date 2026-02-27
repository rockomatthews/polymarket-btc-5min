import { loadEnv } from "./env.js";
import { makeClob } from "./clob.js";
import { autoPickMarkets } from "./markets.js";

(async () => {
  const env = loadEnv();
  const { client, host } = await makeClob();

  console.log(`Connected to: ${host}`);
  console.log(`Funder: ${env.FUNDER_ADDRESS}`);

  // Light ping by fetching a couple markets.
  const markets = await autoPickMarkets(host, 3);
  console.log(`Auto-picked ${markets.length} markets:`);
  for (const m of markets) {
    console.log(`- ${m.market_slug} (tick=${m.minimum_tick_size}, minSize=${m.minimum_order_size})`);
  }

  // Optional: print a derived address from the signer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signerAddr = (client as any).signer?.address;
  if (signerAddr) console.log(`Signer address: ${signerAddr}`);
})();
