import { loadEnv } from "./env.js";
import { log } from "./logger.js";
import { makeClob, OrderType, Side } from "./clob.js";
import { autoPickMarkets, fetchMarkets, type Market } from "./markets.js";
import { bestAsk, fetchBook } from "./orderbook.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findMarketsBySlugs(host: string, slugs: string[]): Promise<Market[]> {
  const want = new Set(slugs);
  const found: Market[] = [];

  let cursor: string | undefined;
  for (let i = 0; i < 50 && found.length < want.size; i++) {
    const page = await fetchMarkets(host, cursor, 200);
    cursor = page.next_cursor;

    for (const m of page.data) {
      if (want.has(m.market_slug)) {
        found.push(m);
        want.delete(m.market_slug);
      }
    }

    if (!cursor) break;
  }

  if (want.size) {
    log.warn({ missing: [...want] }, "Some MARKET_SLUGS were not found via /markets");
  }
  return found;
}

(async () => {
  const env = loadEnv();
  const { client, host } = await makeClob();

  log.info(
    {
      dryRun: env.DRY_RUN,
      maxTotalUsd: env.MAX_TOTAL_USD,
      maxUsdPerTrade: env.MAX_USD_PER_TRADE,
      edgeRequired: env.EDGE_REQUIRED,
      pollMs: env.POLL_MS,
    },
    "bot starting",
  );

  const markets = env.MARKET_SLUGS.length
    ? await findMarketsBySlugs(host, env.MARKET_SLUGS)
    : await autoPickMarkets(host, 8);

  if (!markets.length) {
    throw new Error("No markets selected. Set MARKET_SLUGS or try again.");
  }

  log.info(
    {
      count: markets.length,
      slugs: markets.map((m) => m.market_slug),
    },
    "watching markets",
  );

  let spentUsd = 0;

  while (true) {
    try {
      for (const m of markets) {
        if (spentUsd >= env.MAX_TOTAL_USD) {
          log.warn({ spentUsd }, "MAX_TOTAL_USD reached; stopping bot loop");
          return;
        }

        if (!m.active || m.closed || m.archived || !m.accepting_orders || !m.enable_order_book) {
          continue;
        }
        if (m.tokens.length !== 2) continue;

        const [t0, t1] = m.tokens;

        // Fetch both books.
        const [b0, b1] = await Promise.all([fetchBook(host, t0.token_id), fetchBook(host, t1.token_id)]);
        const a0 = bestAsk(b0);
        const a1 = bestAsk(b1);
        if (!a0 || !a1) continue;

        const sum = a0.price + a1.price;
        const edge = 1 - sum;

        if (edge <= env.EDGE_REQUIRED) continue;

        // Sizing: cap by per-trade USD and top-of-book sizes.
        const maxSizeByUsd = env.MAX_USD_PER_TRADE / sum;
        const size = Math.floor(Math.min(maxSizeByUsd, a0.size, a1.size));

        if (size <= 0) continue;
        if (size < m.minimum_order_size) {
          log.debug(
            { slug: m.market_slug, size, min: m.minimum_order_size },
            "opportunity but below minimum_order_size",
          );
          continue;
        }

        const estCost = size * sum;
        if (spentUsd + estCost > env.MAX_TOTAL_USD) {
          continue;
        }

        log.warn(
          {
            slug: m.market_slug,
            question: m.question,
            outcomes: [t0.outcome, t1.outcome],
            prices: [a0.price, a1.price],
            sum,
            edge,
            size,
            estCost,
            dryRun: env.DRY_RUN,
          },
          "BOX_ARB signal",
        );

        if (env.DRY_RUN) {
          continue;
        }

        // IMPORTANT: This is not atomic. If one leg fills and the other doesn't, you have exposure.
        // We keep size small by default to limit risk.
        const orderOpts = { tickSize: String(m.minimum_tick_size), negRisk: m.neg_risk };

        // Place both legs at best ask.
        const o0 = await client.createAndPostOrder(
          { tokenID: t0.token_id, price: a0.price, side: Side.BUY, size },
          orderOpts,
          OrderType.GTC,
        );

        const o1 = await client.createAndPostOrder(
          { tokenID: t1.token_id, price: a1.price, side: Side.BUY, size },
          orderOpts,
          OrderType.GTC,
        );

        spentUsd += estCost;
        log.info({ spentUsd, o0, o1 }, "orders posted");

        // Cooldown a bit after trading to reduce rapid-fire spam.
        await sleep(2_000);
      }
    } catch (err) {
      log.error({ err }, "loop error (continuing)");
      await sleep(2_000);
    }

    await sleep(env.POLL_MS);
  }
})();
