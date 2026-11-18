# make-fun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rembokuy/make-fun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rembokuy/make-fun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks every protocol that records no token by the implied value of the token it may launch, and writes an offline dashboard with a sortable, filterable board, a detail view per protocol, a costed farm plan for each, and a $1,000 allocator that spreads the budget across the farms that pay.

The price comes off the market's own size curve, fitted robustly on the snapshot's traded tokens, then adjusted for sector, 7-day growth against the market, time with no token and kinship — every step tested on tokens it never saw, each left out and older-to-newer. The board ranks 192 protocols and accounts for all 758: 40 of 40 watchlist, 128 traded tokens kept apart as comparables, 288 on record, 150 set aside with their reason. The allocator deploys $850 of $1,000 over 17 FARM legs for an expected net of $23.30 — the honest answer is that most farms do not pay, and the board says so on every row.

No protocol name is special-cased. Implied values are the model's own estimate, not a forecast of a launch and not financial advice.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
# then open out/dashboard/index.html
```

## The model

Implied value = 10^a · TVL^b · sector · (1 + growth over the market)^b · age factor · kinship, with a = 3.3395 and b = 0.4772 fitted on 90 traded-token comparables (38 set aside: chains, exchanges, staked assets, deposit receipts). The curve is Theil-Sen — the median of every pairwise slope — so one 400x outlier cannot tilt it. Sector effects are shrunk toward the curve; momentum is the week's growth read against the market median, capped at ±35%; the age tilt is a third of the fitted slope, clamped to 0.85–1.20; a row whose name stem already carries a token is cut to 30%.

Blind test, leave-one-out miss (10 to the median absolute log error) and share within 3x:

| Level | Miss | Within 3x | Older → newer miss | Older → newer within 3x |
|---|---|---|---|---|
| One flat cap/TVL multiple | 4.82x | 38.9% | 4.45x | 42.4% |
| + size curve (TVL^b) | 3.51x | 43.3% | 2.73x | 51.5% |
| + sector | 2.92x | 53.3% | 2.52x | 54.5% |
| + 7-day growth, time with no token | 2.86x | 51.1% | 2.43x | 54.5% |

OLS on the same tokens misses 3.49x (44.4% within 3x). The printed range holds half the blind misses: 6.78x for protocols under 18 months on record, 2.73x for seasoned ones; held for 45 of 90 tokens left out one at a time and 18 of 33 newer tokens priced from older ones only. Rank ranges come from 100 seeded bootstrap refits. Levels 0–2 carry the gains; momentum and age help newer tokens a little and barely move the leave-one-out score — the board says so rather than hiding it.

## The farm plans

Ten plays by mechanism (vault, lend, yield dollar, CDP, tokenised asset, liquidity, perps, prediction, stake, network), each with its transactions, fees, yearly carry and minutes, run on the cheapest of the protocol's first three chains. Every row gets eight steps — fund, verify, enter, qualify, upkeep, stop rule, claim, exit — each with a dollar cost and minutes. A ticket's slice is its share of the implied value by dollar-days, netted against fees and the T-bill yield the ticket gives up. Verdicts: 17 FARM, 20 THIN, 155 SKIP, each with a break-even ticket and a net per hour.

## The allocator

One budget, spread across the board: the allocator walks the FARM rows best-first by net per dollar and takes each row's whole ticket until the $1,000 is spent. It deployed $850 over 17 legs — expected net $23.30, fees $21.31, 2,735 minutes, $150 left over because no more FARM row fits. The page shows every leg.

## The page

The board, the detail view, the allocator, the validation ladder and the ledger all render from the same data the program writes. Every row carries a digest of its plan strings, and the page recomputes it from the steps it shows: the header reads “board verified: 192/192 rows match board.json” when the page agrees with the board, and names the rows that differ when it does not.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0yy9qwk6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
