# Token Radar — build the best token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rembokuy/make-fun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rembokuy/make-fun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A program + dashboard that finds pre-token protocols, ranks them by an
implied value, and shows how to farm each one. It reads a sealed DefiLlama
snapshot, never the network, and never a hand-kept list of names.

## What it is

- **Board:** 200 pre-token protocols ranked by implied value — all 40
  protocols on the snapshot's watchlist, plus the 160 highest-TVL pre-token
  protocols below the $50M floor. Live-token protocols are kept separate in
  the Live tab (top 24 by market cap), never mixed into the ranked board.
- **Model (radar-2-peer):** a peer-multiple value model computed from the
  snapshot's own live-token protocols.
- **Farm plans:** 6 concrete steps per protocol, each stating a cost and a
  time, derived from the protocol's own category, TVL, age and chains.

## The model

For each category, the **peer multiple** is the median of
`mcap_usd / tvl_usd` over the snapshot's live-token protocols in that
category (mcap and TVL both > 0). A category with fewer than 3 live peers
falls back to the global median across all live-token protocols.

```
implied FDV = TVL × peerMultiple × growthMult × maturityMult × chainMult
growthMult   = 1 + clamp(change_7d, -60, +120) / 100 × 0.5
maturityMult = 0.6 + min(age_days, 1095) / 1095 × 0.4   (unknown age = 365 days)
chainMult    = 1 + min(chains - 1, 3) × 0.05            (1.00 … 1.15)
```

The implied value is rounded to a whole dollar, minimum $1. Rows rank by
implied value descending, ties broken by slug ascending. Every multiplier is
stored per row in `board.json` and shown in the dashboard's detail view, so
any row's arithmetic can be reproduced from its TVL alone.

On the competition snapshot (2026-11-14, 758 protocols, 128 live-token
protocols with mcap and TVL > 0 — one protocol records a negative mcap and
is excluded) the global peer multiple is **0.2138**.
Category multiples range from 0.0125 (Onchain Capital Allocator, 2 peers —
falls back, so not used) to 1.2205 (Cross Chain Bridge, 4 peers); categories
actually used include Dexs 0.3424 (11 peers), Lending 0.1324 (15 peers),
RWA 0.2748 (9 peers) and Liquid Staking 0.0406 (9 peers). The dashboard
lists the full peer-multiple table.

## How to run locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Then serve the output directory and open the dashboard, e.g.:

```sh
cd out && python3 -m http.server 8000
# open localhost:8000/dashboard/ in a browser
```

The program writes `out/board.json` (`{rows}` — 200 ranked rows),
`out/data.js` (`window.RADAR`, the dashboard's dataset),
`out/dashboard/` (the static page), `out/screenshots/` and
`out/dossier.json`. It refuses to write output if the board gate fails
(watchlist coverage, ranks 1..n, sorted by implied value, farm steps of
20–600 characters, positive integer implied values). Runs are deterministic:
two runs on the same snapshot write byte-identical `board.json`, `data.js`
and `dossier.json`.

## The dashboard

A single static page, no framework, no network: sortable columns (rank,
protocol, category, chains, TVL, 7d change, age, implied value), filters
(text search, category, chain, minimum TVL, watchlist-only), a Live-token
tab, and a detail view per protocol with the full model breakdown, the farm
plan and the protocol facts. Deep links work too: `#detail=<slug>`,
`#cat=<category>`, `#q=<text>`, `#tab=live`.

## Board coverage

200 rows: the full 40-protocol watchlist plus 160 early pre-token protocols
below the $50M floor, chosen by TVL. Every row carries 6 farm steps. The
Live tab holds 24 live-token protocols by market cap.

## Layout

- `main.ts` — entrypoint: parses the snapshot, builds the board, enforces
  the gate, writes the outputs and the dossier.
- `lib/model.ts` — the peer-multiple model, farm plans, snapshot parsing
  and the board gate.
- `vendor/makefun-board.ts` — make.fun's dossier library (kit copy).
- `dashboard/` — `index.html`, `app.css`, `app.js` (static, no network).
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`.

## Notes

- "Records no token" means the snapshot carries no market cap, CoinGecko id
  or symbol for the protocol. It is DefiLlama's record, not proof that no
  token exists.
- Implied value is this radar's own claim, never a prediction that a token
  will be issued, and never financial advice. Farm steps never ask for a
  payment to claim anything.
