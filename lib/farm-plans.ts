// Token Radar v3: farm plans netted to the dollar.
//
// Every board row carries an 8-step plan. Each step names what to do, what it costs
// and how long it takes; the plan closes with a netting line computed from that
// row's own numbers: deposit + gas = total cost, implied value, cost as a share of
// implied value, and the breakeven airdrop share (total cost / implied value).
//
// NOTHING here invents an airdrop: no step promises a token, a percentage or a
// payout. The breakeven share is arithmetic, not a forecast: it is the share of the
// fitted implied value a future airdrop would have to be worth for the plan's cost
// to break even. Deposit tiers and gas figures are PLANNING estimates, labelled
// "est." in the steps; the README's limitations section says so too.
//
// Templates differ per category family (12 archetypes): a DEX plan swaps and
// provides liquidity, a lending plan supplies and borrows, a bridge plan moves
// assets, and so on. The category, chain, TVL tier and age of the row pick the
// template and fill its numbers, so two rows never share a plan unless they share
// a category family, a chain and a deposit tier.

import { fmtCompact, fmtUsd, type Protocol } from './snapshot.ts';

/** Planning gas estimate per transaction on a chain, in dollars. Labelled "est." wherever shown. */
export function gasPerTxUsd(chain: string): number {
  const table: Record<string, number> = {
    Ethereum: 6.0,
    Solana: 0.05,
    Base: 0.35,
    Arbitrum: 0.35,
    Optimism: 0.35,
    'BNB Chain': 0.25,
    BSC: 0.25,
    Polygon: 0.1,
    Avalanche: 0.5,
    'zkSync Era': 0.3,
    Linea: 0.3,
    Scroll: 0.3,
    Blast: 0.2,
    Mode: 0.2,
    Gnosis: 0.1,
    Fantom: 0.3,
    Tron: 0.5,
    Aptos: 0.05,
    Sui: 0.05,
    NEAR: 0.05,
    Near: 0.05,
    Cosmos: 0.1,
    Sei: 0.05,
    Hyperliquid: 0.05,
  };
  if (chain in table) return table[chain]!;
  const lower = chain.toLowerCase();
  if (lower.includes('ethereum')) return 6.0;
  if (lower.includes('solana') || lower.includes('aptos') || lower.includes('sui')) return 0.05;
  if (lower.includes('base') || lower.includes('arbitrum') || lower.includes('optimism') || lower.includes('zksync') || lower.includes('linea') || lower.includes('scroll')) return 0.35;
  if (lower.includes('bnb') || lower.includes('bsc') || lower.includes('binance')) return 0.25;
  return 1.0;
}

/** Planning deposit tier from TVL: the bigger the protocol, the bigger the position a farm plan sizes. */
export function depositTierUsd(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 5000;
  if (tvlUsd >= 500_000_000) return 2000;
  if (tvlUsd >= 100_000_000) return 500;
  if (tvlUsd >= 50_000_000) return 250;
  return 100;
}

export interface PlanContext {
  name: string;
  category: string;
  chain: string;
  chains: string[];
  tvlUsd: number;
  deposit: number;
  gas: number;
  wrapped: boolean;
}

export interface FarmPlan {
  steps: string[];
  depositUsd: number;
  gasUsd: number;
  totalCostUsd: number;
  txCount: number;
  breakevenSharePct: number;
}

type StepFn = (c: PlanContext) => string;

interface Archetype {
  label: string;
  /** Transactions per action step (7 steps); the netting step costs no transaction. */
  txs: number[];
  steps: StepFn[];
}

const money = (n: number): string => `$${n.toFixed(2)}`;

/** Shared closing line: the netting. Built from the row's own numbers, never from a forecast. */
function nettingStep(c: PlanContext, total: number, gasTotal: number, txs: number, implied: number): string {
  const pct = (total / implied) * 100;
  const flag = c.wrapped
    ? ` Wrapper flag: ${c.name} is a wrapped, staked or bridged product of a token that already trades, so there is no launch of its own to farm; this plan prices the underlying exposure, not a new token.`
    : '';
  return (
    `Net: deposit ${fmtUsd(c.deposit)} + gas ${money(gasTotal)} (${txs} tx × ${money(c.gas)} est.) = ${fmtUsd(total)} total. ` +
    `Implied value ${fmtUsd(implied)}; cost is ${pct.toFixed(3)}% of implied value, so the breakeven airdrop share is ${pct.toFixed(3)}% — ` +
    `the plan only pays for itself if a future airdrop is worth at least ${fmtUsd(total)}. No airdrop is promised.${flag}`
  );
}

function wrapperFirstStep(c: PlanContext): string {
  return (
    `Flag first: ${c.name} is a wrapped, staked or bridged product of a token that already trades, so there is no launch of its own to farm. ` +
    `Farm the underlying protocol on ${c.chain} instead, sizing a ${fmtUsd(c.deposit)} planning deposit; keep ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes to set up.`
  );
}

function archetypeFor(category: string | null): Archetype {
  const cat = category ?? '';
  if (/dex/i.test(cat)) return DEX;
  if (/lend/i.test(cat)) return LENDING;
  if (/yield/i.test(cat)) return YIELD;
  if (/bridge|cross chain/i.test(cat)) return BRIDGE;
  if (/derivat|option|perp|future/i.test(cat)) return DERIVATIVES;
  if (/stak|restak/i.test(cat)) return STAKING;
  if (/cdp|stable|basis/i.test(cat)) return STABLE;
  if (/rwa|real world/i.test(cat)) return RWA;
  if (/gam|nft|social|prediction|sport|betting/i.test(cat)) return CONSUMER;
  if (/privacy/i.test(cat)) return PRIVACY;
  if (/oracle|infra|interoperab|launchpad|wallet|ai\b/i.test(cat)) return INFRA;
  return GENERIC;
}

const DEX: Archetype = {
  label: 'DEX',
  txs: [2, 3, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit in the chain's native asset plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: swap ${fmtUsd(Math.round(c.deposit * 0.4))} through ${c.name}'s pools on ${c.chain} in 2 trades, keeping slippage under 0.5%; each swap costs about ${money(c.gas)} in gas (est.). About 20 minutes.`,
    (c) => `Week 1–2: add ${fmtUsd(Math.round(c.deposit * 0.6))} as liquidity to the protocol's deepest pool and hold the LP position; minting the position costs about ${money(c.gas * 2)} in gas (est.). About 15 minutes.`,
    (c) => `Week 2: route one trade a week through ${c.name} instead of another DEX, so the wallet shows repeat router use; one swap, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: rebalance the LP position once a week — remove a slice, re-add it at the current range — 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: vote or signal in ${c.name}'s governance/forum if a proposal is live, from the same wallet; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: wind the LP position down in two steps and consolidate back to the native asset; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. Keep the history, not the position.`,
  ],
};

const LENDING: Archetype = {
  label: 'Lending',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: supply ${fmtUsd(Math.round(c.deposit * 0.7))} to ${c.name}'s largest lending market on ${c.chain}; the supply transaction costs about ${money(c.gas)} in gas (est.). About 15 minutes.`,
    (c) => `Week 1–2: borrow ${fmtUsd(Math.round(c.deposit * 0.25))} against the supply at under 50% loan-to-value, then repay half within the week; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
    (c) => `Week 2: supply a second, smaller asset (${fmtUsd(Math.round(c.deposit * 0.3))}) to a different market on ${c.name}; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: adjust the supply once a week — add ${fmtUsd(Math.round(c.deposit * 0.1))} or withdraw the same — so the position shows steady use; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: claim any supply incentives ${c.name} shows in its app and re-supply them; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: repay any open borrow in full, then withdraw the supply in two steps; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. Never leave a borrow open.`,
  ],
};

const YIELD: Archetype = {
  label: 'Yield',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: deposit ${fmtUsd(Math.round(c.deposit * 0.7))} into ${c.name}'s flagship vault on ${c.chain}; the deposit costs about ${money(c.gas)} in gas (est.). About 15 minutes.`,
    (c) => `Week 1–2: deposit ${fmtUsd(Math.round(c.deposit * 0.3))} into a second vault with a different strategy on ${c.name}; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Week 2: harvest the first vault's yield once and re-deposit it instead of withdrawing; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: harvest and compound weekly — claim yield, re-deposit it the same day — 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: compare ${c.name}'s vault APYs and move ${fmtUsd(Math.round(c.deposit * 0.2))} to the best-performing one; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Weeks 6–8: exit both vaults in two steps and consolidate; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. Count the harvested yield separately from the deposit.`,
  ],
};

const BRIDGE: Archetype = {
  label: 'Bridge',
  txs: [2, 3, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: bridge ${fmtUsd(Math.round(c.deposit * 0.5))} out of ${c.chain} through ${c.name} to a second chain, then bridge half back a day later; 2 transactions at ${money(c.gas)} each (est.), 30 minutes.`,
    (c) => `Week 1–2: bridge ${fmtUsd(Math.round(c.deposit * 0.3))} to a third chain ${c.name} supports and use it in one app there; one transaction, about ${money(c.gas)} gas (est.), 20 minutes.`,
    (c) => `Week 2: bridge a small ${fmtUsd(Math.round(c.deposit * 0.1))} amount during a busy hour, when ${c.name}'s fees are visible; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: make one bridge a week, alternating direction and destination chain; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: try ${c.name}'s fastest route option once and note the fee difference against the cheapest; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: bring all bridged funds home to ${c.chain} in two steps; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. Leave no dust on a chain you will not revisit.`,
  ],
};

const DERIVATIVES: Archetype = {
  label: 'Derivatives',
  txs: [2, 3, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes. Never farm perps with money you cannot lose.`,
    (c) => `Week 1: deposit ${fmtUsd(Math.round(c.deposit * 0.5))} as margin on ${c.name} and open a small 2x position worth ${fmtUsd(Math.round(c.deposit * 0.3))}; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
    (c) => `Week 1–2: close the first position, then open a second one in the opposite direction at the same size; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
    (c) => `Week 2: place one limit order on ${c.name} and let it fill or cancel it after 48 hours; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: trade once a week at 2x or less, never holding a position overnight without a stop; 2 transactions a week at ${money(c.gas)} each (est.), 20 minutes a week.`,
    (c) => `Week 4: add ${fmtUsd(Math.round(c.deposit * 0.2))} to the margin account and test a different market on ${c.name}; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Weeks 6–8: close every open position, withdraw the full margin in two steps; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. A farming loss is a cost, not a position to average down.`,
  ],
};

const STAKING: Archetype = {
  label: 'Staking',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: stake ${fmtUsd(Math.round(c.deposit * 0.7))} through ${c.name} on ${c.chain} and keep the receipt token in the same wallet; the stake costs about ${money(c.gas)} in gas (est.). About 15 minutes.`,
    (c) => `Week 1–2: use ${fmtUsd(Math.round(c.deposit * 0.3))} of the receipt token in one DeFi app on ${c.chain} (supply it, do not sell it); one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Week 2: restake or compound the first rewards ${c.name} shows, if the app offers it; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: top the stake up by ${fmtUsd(Math.round(c.deposit * 0.1))} once a week and re-check the receipt-token position; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: vote with the staked position in ${c.name}'s governance if a vote is live; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: unwind the DeFi leg first, then unstake in two steps and note the unstaking delay; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
  ],
};

const STABLE: Archetype = {
  label: 'Stablecoin / CDP',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: lock ${fmtUsd(Math.round(c.deposit * 0.7))} of collateral in ${c.name} on ${c.chain} and mint ${fmtUsd(Math.round(c.deposit * 0.3))} of its stable asset; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
    (c) => `Week 1–2: use the minted ${fmtUsd(Math.round(c.deposit * 0.3))} in one lending market on ${c.chain} instead of selling it; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Week 2: repay ${fmtUsd(Math.round(c.deposit * 0.1))} of the minted amount to test the repay path; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: adjust the collateral ratio once a week — add or remove ${fmtUsd(Math.round(c.deposit * 0.1))} of collateral — keeping it above 200%; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: check ${c.name}'s peg and stability fee, and note both in your farm log; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: repay the minted amount in full, then unlock the collateral in two steps; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. Never leave a CDP open unattended.`,
  ],
};

const RWA: Archetype = {
  label: 'RWA',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; check whether ${c.name} needs identity verification first, then fund a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 45 minutes.`,
    (c) => `Week 1: buy ${fmtUsd(Math.round(c.deposit * 0.7))} of ${c.name}'s tokenised asset on ${c.chain} and hold it in the farming wallet; the purchase costs about ${money(c.gas)} in gas (est.). About 20 minutes.`,
    (c) => `Week 1–2: buy ${fmtUsd(Math.round(c.deposit * 0.3))} of a second asset class ${c.name} lists; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Week 2: claim or reinvest the first yield distribution ${c.name} pays on the holding; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: add ${fmtUsd(Math.round(c.deposit * 0.1))} to the holding once a week and record the yield each time; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: read ${c.name}'s latest attestation or reserve report and note the coverage ratio; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: sell the holdings back in two steps and withdraw; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. RWA exits can be slow — start the first sale early.`,
  ],
};

const CONSUMER: Archetype = {
  label: 'Consumer',
  txs: [2, 3, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: complete ${c.name}'s onboarding — profile, first quest or first match — and spend ${fmtUsd(Math.round(c.deposit * 0.2))} inside the app on ${c.chain}; 2 transactions at ${money(c.gas)} each (est.), 30 minutes.`,
    (c) => `Week 1–2: use ${c.name} three times in the second week (play, trade or post, as the app rewards) and collect the points it shows; one transaction, about ${money(c.gas)} gas (est.), 20 minutes.`,
    (c) => `Week 2: buy or mint one item inside ${c.name} for ${fmtUsd(Math.round(c.deposit * 0.2))} and keep it in the farming wallet; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Weeks 3–6: return three times a week and complete the daily or weekly task each time; 2 transactions a week at ${money(c.gas)} each (est.), 20 minutes a week.`,
    (c) => `Week 4: refer one real friend to ${c.name} through your own link, if the app offers referrals; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: sell or list the in-app item, then withdraw the remaining balance in two steps; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
  ],
};

const PRIVACY: Archetype = {
  label: 'Privacy',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes. Read ${c.name}'s compliance notes first.`,
    (c) => `Week 1: deposit ${fmtUsd(Math.round(c.deposit * 0.5))} into ${c.name}'s shielded pool on ${c.chain}; the deposit costs about ${money(c.gas)} in gas (est.). About 20 minutes.`,
    (c) => `Week 1–2: make one private transfer of ${fmtUsd(Math.round(c.deposit * 0.2))} inside ${c.name} to a second wallet you control; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Week 2: withdraw ${fmtUsd(Math.round(c.deposit * 0.1))} from the shielded pool to test the exit path; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: use the shielded balance once a week for a real payment or transfer; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: check ${c.name}'s anonymity set size and note it; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: withdraw the remaining shielded balance in two steps; 2 transactions at ${money(c.gas)} each (est.), 20 minutes. Keep records of every deposit and withdrawal.`,
  ],
};

const INFRA: Archetype = {
  label: 'Infra',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: call ${c.name}'s service with ${fmtUsd(Math.round(c.deposit * 0.3))} of usage — a query, a relay or a deployment, as the protocol sells it; the call costs about ${money(c.gas)} in gas (est.). About 20 minutes.`,
    (c) => `Week 1–2: stake or lock ${fmtUsd(Math.round(c.deposit * 0.4))} with ${c.name} if it runs a node or operator program; one transaction, about ${money(c.gas)} gas (est.), 20 minutes.`,
    (c) => `Week 2: use a second ${c.name} feature (a different feed, chain or tool) once; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Weeks 3–6: use ${c.name} once a week for a real task and keep the receipts; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: join ${c.name}'s operator or developer channel and answer one support question from your own use; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: unstake or close the position in two steps and stop the recurring usage; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
  ],
};

const GENERIC: Archetype = {
  label: 'General',
  txs: [2, 2, 2, 1, 2, 1, 1],
  steps: [
    (c) => `Set up: open a fresh wallet for ${c.name} on ${c.chain}; fund it with a ${fmtUsd(c.deposit)} planning deposit plus ${money(c.gas)} per transaction for gas (est.). Budget about 30 minutes.`,
    (c) => `Week 1: make a first ${fmtUsd(Math.round(c.deposit * 0.5))} deposit into ${c.name}'s main product on ${c.chain}; the deposit costs about ${money(c.gas)} in gas (est.). About 15 minutes.`,
    (c) => `Week 1–2: use a second feature of ${c.name} with ${fmtUsd(Math.round(c.deposit * 0.3))} — a different pool, market or tool; one transaction, about ${money(c.gas)} gas (est.), 15 minutes.`,
    (c) => `Week 2: complete one weekly task ${c.name} shows in its app and claim the points or rewards it lists; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 3–6: return once a week, use the product, and add ${fmtUsd(Math.round(c.deposit * 0.1))} to the position; 2 transactions a week at ${money(c.gas)} each (est.), 15 minutes a week.`,
    (c) => `Week 4: vote or comment in ${c.name}'s governance or community from the farming wallet, if one is live; one transaction, about ${money(c.gas)} gas (est.), 10 minutes.`,
    (c) => `Weeks 6–8: withdraw the position in two steps and consolidate back to the native asset; 2 transactions at ${money(c.gas)} each (est.), 20 minutes.`,
  ],
};

/** Build the 8-step, costed farm plan for one board row. */
export function planFor(p: Protocol, impliedValueUsd: number, wrapped: boolean): FarmPlan {
  const chain = p.chains[0] ?? 'Ethereum';
  const deposit = depositTierUsd(p.tvl_usd);
  const gas = gasPerTxUsd(chain);
  const ctx: PlanContext = {
    name: p.name,
    category: p.category ?? 'General',
    chain,
    chains: p.chains,
    tvlUsd: p.tvl_usd,
    deposit,
    gas,
    wrapped,
  };
  const arch = archetypeFor(p.category);
  const txCount = arch.txs.reduce((a, b) => a + b, 0);
  const gasTotal = txCount * gas;
  const total = deposit + gasTotal;
  const steps: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (i === 0 && wrapped) steps.push(wrapperFirstStep(ctx));
    else steps.push(arch.steps[i]!(ctx));
  }
  steps.push(nettingStep(ctx, total, gasTotal, txCount, impliedValueUsd));
  return {
    steps,
    depositUsd: deposit,
    gasUsd: gasTotal,
    totalCostUsd: total,
    txCount,
    breakevenSharePct: (total / impliedValueUsd) * 100,
  };
}

/** One-line summary of a plan's cost, for the KPI strip and the detail view. */
export function planSummary(plan: FarmPlan): string {
  return `${fmtUsd(plan.totalCostUsd)} total (${fmtUsd(plan.depositUsd)} deposit + ${fmtUsd(plan.gasUsd)} gas, ${plan.txCount} tx)`;
}

export { fmtCompact };
