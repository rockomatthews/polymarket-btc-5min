import { Wallet } from "ethers";
import { ClobClient } from "@polymarket/clob-client";
import { loadEnv } from "./env.js";

(async () => {
  const env = loadEnv();
  const signer = new Wallet(env.PRIVATE_KEY);
  const base = new ClobClient(env.CLOB_HOST, env.CHAIN_ID, signer);

  const creds = await base.createOrDeriveApiKey();
  // Print in a copy/paste friendly way.
  console.log("Derived CLOB API credentials:\n");
  console.log(`CLOB_API_KEY=${creds.key}`);
  console.log(`CLOB_API_SECRET=${creds.secret}`);
  console.log(`CLOB_API_PASSPHRASE=${creds.passphrase}`);
})();
