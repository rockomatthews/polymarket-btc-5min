import { ClobClient, Side, OrderType, type ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { loadEnv } from "./env.js";

export type Clob = {
  client: ClobClient;
  host: string;
};

export async function makeClob(): Promise<Clob> {
  const env = loadEnv();

  const signer = new Wallet(env.PRIVATE_KEY);
  const host = env.CLOB_HOST;

  // If creds provided, use them. Otherwise derive.
  const base = new ClobClient(host, env.CHAIN_ID, signer);

  let creds: ApiKeyCreds;
  if (env.CLOB_API_KEY && env.CLOB_API_SECRET && env.CLOB_API_PASSPHRASE) {
    creds = {
      key: env.CLOB_API_KEY,
      secret: env.CLOB_API_SECRET,
      passphrase: env.CLOB_API_PASSPHRASE,
    };
  } else {
    creds = await base.createOrDeriveApiKey();
  }

  const client = new ClobClient(host, env.CHAIN_ID, signer, creds, env.SIGNATURE_TYPE, env.FUNDER_ADDRESS);
  return { client, host };
}

export { Side, OrderType };
