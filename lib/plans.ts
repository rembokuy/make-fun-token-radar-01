// Token Radar v3 — the farm plans: ten plays by mechanism, one per protocol.
// Each play names its hold, its transactions, its fees as a share of the ticket,
// its yearly carry and its minutes. A row's plan is eight steps, each with a dollar
// cost and minutes, netted against fees and the T-bill yield the ticket gives up.
//   slice = implied value × airdrop share × this ticket's dollar-days / everyone's.
//   Deposits already in count half the days the protocol has run with no token
//   (TVL grown in a straight line), a year at most.
//   net = slice − fees − forgone yield. FARM: net > 0. THIN: the slice covers fees.
//   Anything else is SKIP. No protocol is planned by name.

import { MODEL_CONSTANTS, sectorOf } from './comps.ts';
import { usd } from './snapshot.ts';

export interface Play {
  label: string;
  hold: number;
  tx: [number, number, number, number];
  pct: [number, number];
  carry: number;
  min: [number, number, number];
  enter: string;
  qualify: string;
  watch: string;
  stop: string;
  qualifyFirst?: boolean;
}

function play(
  label: string,
  hold: number,
  tx: [number, number, number, number],
  pct: [number, number],
  carry: number,
  min: [number, number, number],
  enter: string,
  qualify: string,
  watch: string,
  stop: string,
  extra?: { qualifyFirst?: boolean },
): Play {
  return { label, hold, tx, pct, carry, min, enter, qualify, watch, stop, ...extra };
}

export const PLAYS: Record<string, Play> = {
  vault: play(
    'Curated vault', 90, [2, 0, 0, 1], [0, 0], 0, [10, 5, 5],
    "Approve and deposit {C} USDC into {N}'s biggest vault on {chain}; leave the vault shares in this wallet.",
    "Open {N}'s points or referral page with this wallet in the first week, if one exists; do not move the deposit.",
    "check the vault's share price and TVL", 'the share price falls while its asset stays flat',
  ),
  lend: play(
    'Supply and borrow', 90, [2, 1, 0, 2], [0, 0], 0.0075, [10, 10, 5],
    'Approve and supply {C} USDC to {N} on {chain}.',
    'Borrow {C/4} of a stablecoin against it and keep it borrowed: both sides count. Near 3% a year; keep health above 2.',
    'check the health factor and the supply rate', 'health nears 1.5 or utilisation sticks at 100%',
  ),
  dollar: play(
    'Yield dollar', 90, [2, 1, 0, 2], [0.001, 0], 0, [10, 5, 5],
    "Mint or buy {C} of {N}'s dollar on {chain} with USDC, near 0.1% in fees.",
    "Stake it into its yield-bearing form inside {N}'s own app, where points accrue; a DEX pool does not count.",
    'check the peg and the backing report', 'it trades under $0.995 for a day or backing falls under 100%',
  ),
  cdp: play(
    'Mint against collateral', 90, [2, 1, 0, 2], [0, 0], 0.0167, [15, 5, 5],
    'Lock {C} of collateral on {N} on {chain} and mint {C/3} of its stablecoin: a 300% ratio, near 5% a year.',
    "Place the minted stablecoin in {N}'s savings or stability module, so the debt and the deposit both count.",
    'check the collateral ratio and the peg', 'the ratio drops under 200% or the stablecoin slips under $0.99',
  ),
  rwa: play(
    'Tokenised asset', 90, [2, 0, 0, 1], [0.002, 0], 0, [15, 20, 5],
    "Mint or buy {C} of {N}'s tokenised asset on {chain}, near 0.2% in fees; read the redemption notice first.",
    "Fill in {N}'s KYC or whitelist form with this wallet before funding it, if asked; allow 1 to 3 days.",
    'check NAV and the redemption queue', 'redemptions pause or NAV is marked down',
    { qualifyFirst: true },
  ),
  pool: play(
    'Liquidity and swaps', 60, [3, 0, 1, 1], [0, 0.0003], 0, [15, 5, 10],
    "Approve both tokens and add {C} to {N}'s deepest pool on {chain}, in its most liquid pair.",
    'Set a weekly reminder for one {C/10} swap through {N}’s own router (0.3% fee): programmes score fees and active weeks.',
    'make the swap and check the pool range', 'impermanent loss passes 2%',
  ),
  perps: play(
    'Margin and volume', 60, [2, 0, 2, 1], [0, 0.001], 0, [10, 5, 15],
    'Deposit {C} USDC as margin on {N} on {chain}.',
    'Set a weekly reminder for one round trip: open and close {C} of notional at 1x on a major pair, 0.05% taker fee each way.',
    'make the round trip and total fees and funding', 'fees and funding pass 3% of margin',
  ),
  market: play(
    'Prediction volume', 60, [2, 0, 2, 1], [0, 0.001], 0, [10, 5, 15],
    'Deposit {C} USDC on {N} on {chain}.',
    'Set a weekly reminder for one trade: buy then sell {C/4} of shares in a liquid market priced 0.20 to 0.80, with limit orders.',
    'make the trade and total the spread paid', 'spread and fees pass 3% of the deposit',
  ),
  stake: play(
    'Stake or restake', 90, [2, 1, 0, 2], [0, 0], 0, [10, 10, 5],
    'Stake or restake {C} of the asset {N} accepts on {chain}; note the unbonding period first.',
    "Delegate to an operator or pool inside {N}'s own app; keep the receipt token in this wallet.",
    "check the operator's status and reward rate", 'the operator is slashed or withdrawals queue over a week',
  ),
  network: play(
    'Use the network', 90, [2, 0, 1, 1], [0, 0], 0, [15, 5, 5],
    'Move {C} onto {N} on {chain} through its own bridge or app, so the activity is credited to this wallet.',
    'Set a weekly reminder for one real transfer, payment or contract call: networks count active weeks and actions.',
    'make the transaction and check the fee', 'the bridge pauses withdrawals',
  ),
};

const PLAY_BY_CATEGORY: Record<string, string> = {
  Lending: 'lend',
  'Uncollateralized Lending': 'lend',
  'Collateral Markets': 'lend',
  CDP: 'cdp',
  'CDP Manager': 'cdp',
  Dexs: 'pool',
  'Prediction Market': 'market',
  Restaking: 'stake',
  'Staking Pool': 'stake',
  'Governance Incentives': 'stake',
  Insurance: 'stake',
};

const PLAY_BY_SECTOR: Record<string, string> = {
  Vaults: 'vault',
  Dollars: 'dollar',
  RWA: 'rwa',
  Lending: 'lend',
  Trading: 'perps',
  Network: 'network',
};

export function playOf(category: string | null): string {
  if (category !== null && PLAY_BY_CATEGORY[category]) return PLAY_BY_CATEGORY[category]!;
  return PLAY_BY_SECTOR[sectorOf(category)] ?? 'network';
}

// [gas per transaction, fee to fund the wallet from an exchange], in dollars.
const CHAIN_COST: Record<string, [number, number]> = {
  Ethereum: [2.5, 4],
  Bitcoin: [1.5, 2],
  Tron: [1, 1.5],
  Binance: [0.1, 0.3],
  Avalanche: [0.05, 0.5],
  Polygon: [0.01, 0.3],
  Solana: [0.005, 1],
  Sui: [0.005, 0.5],
  Aptos: [0.005, 0.5],
  Stellar: [0.001, 0.2],
  Algorand: [0.001, 0.2],
  Base: [0.03, 0.5],
  Arbitrum: [0.03, 0.5],
  Optimism: [0.03, 0.5],
  Ink: [0.03, 1],
  Monad: [0.01, 1],
  'Hyperliquid L1': [0.01, 1],
};

export function chainCost(chain: string): [number, number] {
  return CHAIN_COST[chain] ?? [0.05, 1.5];
}

/** A protocol's first three chains hold most of its TVL; the plan runs on the cheapest of them. */
export function farmChain(chains: string[]): string {
  return (
    chains.slice(0, 3).sort((a, b) => chainCost(a)[0] - chainCost(b)[0] || chains.indexOf(a) - chains.indexOf(b))[0] ??
    'its main chain'
  );
}

export interface FarmPlan {
  play: string;
  label: string;
  chain: string;
  hold: number;
  weeks: number;
  capital: number;
  share: number;
  ahead: number;
  steps: Array<[string, string, number, number]>;
  fees: number;
  minutes: number;
  forgone: number;
  slice: number;
  snapshotSlice: number;
  net: number;
  perHour: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  breakEven: number | null;
}

export interface PlanInput {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl: number;
  value: number;
  age: number | null;
  capital: number;
}

/** One row's plan: eight steps of [verb, what to do, dollars, minutes], then the sums. */
export function farmPlan(row: PlanInput, opts: { capital?: number; share?: number } = {}): FarmPlan {
  const C = opts.capital ?? row.capital;
  const share = opts.share ?? MODEL_CONSTANTS.airdropShare;
  const key = playOf(row.category);
  const how = PLAYS[key]!;
  const N = row.name;
  const chain = farmChain(row.chains);
  const [gas, fund] = chainCost(chain);
  const H = how.hold;
  const weeks = Math.round(H / 7);
  const fill = (t: string): string =>
    t
      .replace(/\{C(\/\d+)?\}/g, (_, d: string) => usd(d ? C / +d.slice(1) : C))
      .replace(/\{N\}/g, N)
      .replace(/\{chain\}/g, chain);
  const ahead = Math.min(row.age ?? MODEL_CONSTANTS.pointsWindow, MODEL_CONSTANTS.pointsWindow) / 2;
  const snapshotSlice = (row.value * share * C) / (row.tvl + C);
  const slice = snapshotSlice * (H / (ahead + H));
  const [txIn, txQualify, txWeek, txOut] = how.tx;
  const gasBudget = Math.max(1, Math.ceil(2 * gas * (txIn + txQualify + weeks * txWeek + txOut + 2)));
  const steps: Array<[string, string, number, number]> = [
    ['Fund', `Withdraw ${usd(C)} (USDC, or the asset it takes) and ${usd(gasBudget)} for gas from an exchange to a fresh wallet on ${chain}, used for this farm only.`, fund, 10],
    ['Verify', `Open ${N} from defillama.com/protocol/${row.slug}, not a search ad; check contracts, audits, that it still lists no token, and any points page.`, 0, 15],
    ['Enter', fill(how.enter), txIn * gas + how.pct[0] * C, how.min[0]],
    ['Qualify', fill(how.qualify), txQualify * gas + (how.carry * C * H) / 365, how.min[1]],
    ['Upkeep', `Each week for ${weeks} weeks, ${how.watch}; log it.`, weeks * (txWeek * gas + how.pct[1] * C), weeks * how.min[2]],
    ['Stop rule', `Leave early if ${how.stop}, TVL drops under ${usd(row.tvl * 0.7)} (-30%), or a token is announced with nothing for depositors.`, 0, 5],
    ['Claim', `If a token launches, claim only from ${N}'s own site, never pay to claim, then revoke approvals. At the implied ${usd(row.value)} this ticket's slice is about ${usd(slice)}.`, gas, 10],
    ['Exit', `After ${H} days or at the claim, unwind the position and send the funds back to the exchange.`, (txOut + 1) * gas, 10],
  ];
  if (how.qualifyFirst) steps.splice(2, 2, steps[3]!, steps[2]!);
  const fees = steps.reduce((s, st) => s + st[2], 0);
  const minutes = steps.reduce((s, st) => s + st[3], 0);
  const forgone = (C * MODEL_CONSTANTS.tbill * H) / 365;
  const net = slice - fees - forgone;
  const scaling = C * (how.pct[0] + weeks * how.pct[1] + (how.carry * H) / 365);
  const perDollar = (slice - scaling - forgone) / C;
  return {
    play: key,
    label: how.label,
    chain,
    hold: H,
    weeks,
    capital: C,
    share,
    ahead,
    steps,
    fees,
    minutes,
    forgone,
    slice,
    snapshotSlice,
    net,
    perHour: net / (minutes / 60),
    verdict: net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP',
    breakEven: perDollar > 0 ? (fees - scaling) / perDollar : null,
  };
}

/** The strings board.json carries: one a step, each with its cost and its time. */
export function stepStrings(plan: FarmPlan): string[] {
  return plan.steps.map(
    ([verb, what, dollars, min]) =>
      `${verb}: ${what} Cost: ${dollars ? usd(dollars) : 'nothing'}. Time: ${min} min${verb === 'Upkeep' ? ` over ${plan.hold} days` : ''}.`,
  );
}
