export type Market = {
  question: string;
  market_slug: string;
  closed: boolean;
  active: boolean;
  archived: boolean;
  accepting_orders: boolean;
  enable_order_book: boolean;
  minimum_order_size: number;
  minimum_tick_size: number;
  neg_risk: boolean;
  maker_base_fee: number;
  taker_base_fee: number;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
};

export type MarketsResponse = {
  data: Market[];
  next_cursor?: string;
};

export async function fetchMarkets(host: string, cursor?: string, limit = 200): Promise<MarketsResponse> {
  const url = new URL("/markets", host);
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("next_cursor", cursor);

  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`markets fetch failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as MarketsResponse;
}

export async function autoPickMarkets(host: string, targetCount = 8): Promise<Market[]> {
  const picked: Market[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20 && picked.length < targetCount; i++) {
    const page = await fetchMarkets(host, cursor, 200);
    cursor = page.next_cursor;

    for (const m of page.data) {
      if (picked.length >= targetCount) break;
      if (!m.active) continue;
      if (m.closed) continue;
      if (m.archived) continue;
      if (!m.accepting_orders) continue;
      if (!m.enable_order_book) continue;
      // Basic sanity: binary markets only (YES/NO)
      if (m.tokens.length !== 2) continue;
      picked.push(m);
    }

    if (!cursor) break;
  }

  return picked;
}
