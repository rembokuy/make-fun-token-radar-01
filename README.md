# Token Radar: fitted launch pricing, walk-forward-tested, 8-step farm plans netted to the dollar, every one of 758 protocols accounted for

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rembokuy/make-fun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rembokuy/make-fun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Which pre-token protocol is worth farming next, and what do you do about it? This radar answers with a fitted model instead of a TVL table: it ranks all 289 rankable pre-token protocols by a launch value fitted from the 128 live-token peers that already trade, validates the fit walk-forward and leave-one-out, and gives every row an 8-step farm plan that is costed and netted to the dollar. Every one of the snapshot's 758 protocols is accounted for — 289 ranked, 416 live-token set aside in their own view, 53 excluded with their reasons — and the watchlist is covered 40/40. The fitted model beats the transparent median-multiple baseline on leave-one-out (median absolute log error 1.36 vs 1.71), and the board shows its uncertainty instead of hiding it: rank ranges from 200 bootstrap refits, median width 201 ranks, with 222 rows flagged wider than half the board.

## What it covers

Snapshot 2026-11-14 (DefiLlama protocols at or above $5M TVL, floor $50M). Counted by the program, not by hand: 758 protocols = 289 ranked pre-token + 416 live-token (402 non-CEX + 14 CEX) + 53 excluded (42 CEX + 11 versioned names). The board ranks every pre-token protocol except the CEX and versioned ones; 91 of the 289 rows are wrapped, staked or bridged products of a token that already trades, and those rows are flagged — their plans price the underlying exposure, not a launch of their own. Top fitted values: Coinbase Bridge $132,773,721 (flagged bridge), top non-wrapped Anemoy Capital $76,063,230, top watchlist Steakhouse Financial $75,378,591.

## Value model: fitted launch pricing

`log(market cap) ~ log(TVL) + log(TVL)^2 + age + age-missing + log(1 + chains) + 7-day TVL change + category effects`, fit by ordinary least squares on the 128 live peers with a market cap and a TVL. Category effects only for categories with at least 8 live peers; thinner categories pool into the intercept. A pre-token protocol's implied value is `exp(predicted log market cap)`. Every row also shows its category-median multiple value beside the fitted value, so the fit can be checked against the simple baseline at a glance. Global median multiple 0.2138.

Measured fit (not asserted): R² 0.2599; median absolute log error 1.1831; median absolute percentage error 85.9%. Walk-forward — fit on protocols listed on or before 2024-02-18 (48 peers), tested on the 47 listed after — median absolute log error 1.1663, median absolute percentage error 88.8%. Leave-one-out (128 refits): median absolute log error 1.3601, median absolute percentage error 89.4%, against 1.7104 / 92.6% for the median-multiple baseline on the same check. Rank ranges come from 200 deterministic bootstrap refits (seed 20261114, specification fixed from the full training set).

One fitted coefficient deserves a plain reading: the 7-day TVL change enters with a large negative coefficient (−4.25 on the clipped change). In this snapshot, explosive short-term TVL growth is associated with a lower sustainable market cap — mercenary inflows, not durable value. The model does not reward a one-week spike; it prices the protocol as if the spike will not stick.

## Farm plans, netted to the dollar

Every row carries 8 steps from a template of its category family (DEX, lending, yield, bridge, derivatives, staking, stablecoin, RWA, consumer, privacy, infra, general), filled with the row's own chain, TVL tier and name. Deposit tiers by TVL ($100–$5,000) plus estimated gas per transaction by chain; median plan cost $166. Each plan closes with a netting line from the row's own numbers: total cost, implied value, cost as a percentage of implied value, and the breakeven airdrop share (cost ÷ implied value). No airdrop is promised anywhere — the breakeven share is arithmetic, not a forecast.

## What this does not claim

The implied value is a comps fit, not a prediction that a token launches, when it launches, or what it lists at. The fit is weak in absolute terms (R² 0.26; a typical prediction is off by ~86% in percentage terms) because market-cap/TVL multiples in this snapshot span orders of magnitude; the claim is only that the fitted model beats the median baseline out of sample, and the board shows the resulting rank uncertainty on every row. Categories with fewer than 8 live peers have no category effect. 33 of the 128 training peers carry no listing date, so the walk-forward test covers the dated 95 only. Gas figures are planning estimates at typical fees, not quotes.

## Run it

Node 22, standard library only, no network at run time:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Two runs write identical bytes. The program writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` (via `vendor/makefun-board.ts`). Open `out/dashboard/index.html` — the board is sortable and filterable, every row opens a detail view with its plan, and the live and excluded views sit below it. Take the three screenshots from the rendered page: the board, a protocol's detail view, and a filtered view.

## License

MIT — see [LICENSE](LICENSE). SPDX-License-Identifier: MIT.
