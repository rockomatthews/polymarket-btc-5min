export type Spot = {
  source: string;
  price: number;
  ts: number;
};

export async function fetchBtcSpotUsd(): Promise<Spot> {
  // Coinbase spot is simple and reliable.
  const url = "https://api.coinbase.com/v2/prices/BTC-USD/spot";
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`coinbase spot failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as any;
  const price = Number(j?.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error("invalid coinbase spot");
  return { source: "coinbase", price, ts: Date.now() };
}
