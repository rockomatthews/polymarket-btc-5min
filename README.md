# polymarket-btc-5min

5-minute Polymarket **BTC mispricing scanner** (alerts first; execution later behind explicit go-live).

## Goal
Find short-expiry BTC markets where implied price/probability is meaningfully out of line with spot movement, with a *fast, legible* alert loop.

## What it does (MVP)
- Pulls active Polymarket CLOB markets (config/watchlist)
- Samples orderbooks
- Produces an alert when a market is “offside” by a configured threshold

## Safety
- **Alerts only** by default.
- No execution until you explicitly enable it.

## Setup
```bash
cd business/polymarket-btc-5min
npm i
cp .env.example .env
```

## Run
```bash
npm run dev
```
