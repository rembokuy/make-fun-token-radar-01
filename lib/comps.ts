// Token Radar v3 — the comparables: the traded tokens the size curve is fitted on.
// One comparable per token that trades. Listings that share a ticker and a name stem
// are one family whose TVL is summed (a token listed twice is not two markets).
// A cap within 2% of TVL is a deposit receipt, not a launch: no comparable.
// Chains, exchanges and staked assets price something else: no comparable either.

import { ageDays, clamp, log10, median, type Snapshot, type SnapshotProtocol } from './snapshot.ts';

/** 'trades': a market cap. 'on-record': a ticker or CoinGecko id, no cap. 'none': neither. */
export function tokenStatus(p: SnapshotProtocol): 'trades' | 'on-record' | 'none' {
  if (p.mcap_usd !== null && p.mcap_usd > 0) return 'trades';
  if (p.gecko_id !== null || p.symbol !== null) return 'on-record';
  return 'none';
}

export const HOUSE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The house's own watchlist rule, reused to sort protocols below its floor. */
export function houseRule(p: SnapshotProtocol): string | null {
  const at = HOUSE_CATEGORIES.indexOf(p.category ?? '');
  if (at >= 0) return at < 2 ? 'Bridge' : at < 5 ? 'Liquid staking' : 'Exchange custody';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'Exchange custody';
  if (VERSIONED.test(p.name)) return 'Versioned listing';
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped or staked';
  return null;
}

// Six sectors: DefiLlama's forty categories leave most with one comparable or none.
const SECTORS: Record<string, string> = {
  Vaults: 'Risk Curators|Onchain Capital Allocator|Yield|Yield Aggregator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault',
  Dollars: 'Basis Trading|CDP|CDP Manager|Stablecoin Wrapper|Dual-Token Stablecoin|CeDeFi',
  RWA: 'RWA|RWA Lending',
  Lending: 'Lending|Uncollateralized Lending|Collateral Markets|Collateral Management',
  Trading: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|OTC Marketplace|NFT Marketplace|Launchpad',
};

export function sectorOf(category: string | null): string {
  if (category === null) return 'Network';
  for (const [sector, list] of Object.entries(SECTORS)) {
    if (list.split('|').indexOf(category) >= 0) return sector;
  }
  return 'Network';
}

/** First lower-case word of a name: the stem families and kinship are read from. */
export function stem(name: string): string {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? '';
}

export interface Comparable {
  name: string;
  symbol: string;
  sector: string;
  tvl: number;
  mcap: number;
  members: number;
  age: number | null;
  excess: number;
  x: number;
  y: number;
  skip: string | null;
}

export const MODEL_CONSTANTS = {
  version: 'robust-curve-4',
  /** Zero-effect comparables pulling each sector's effect toward the curve. */
  pseudoComps: 3,
  /** A cap within 2% of TVL is a deposit receipt, not a launch. */
  receiptBand: 0.02,
  /** A week's growth over the market, carried forward at most ±35%. */
  growthCap: 0.35,
  /** A third of the fitted age slope: newer tokens trade richer, but the blind test barely gains. */
  ageShare: 0.3,
  /** So the age tilt stays slight. */
  ageClamp: [0.85, 1.2] as [number, number],
  /** Under 18 months on record, blind prices miss far wider: those rows get a wider range. */
  youngDays: 540,
  /** A watchlist row whose name stem already carries a token on record. */
  kinToken: 0.3,
  /** Airdrop share of a launch a farm position is assumed to catch. */
  airdropShare: 0.1,
  /** T-bill yield the ticket gives up while it farms. */
  tbill: 0.04,
  /** Points already earned count at most a year of dollar-days. */
  pointsWindow: 365,
  /** Bootstrap refits for the rank ranges, seeded so they reproduce. */
  bootstrapRefits: 100,
  bootstrapSeed: 20261119,
  /** The allocator's budget. */
  allocatorBudget: 1000,
};

/** A week's TVL growth read against the market's (this snapshot's median protocol shrank). */
export function excessGrowth(change7d: number | null, marketWeek: number): number {
  if (change7d === null) return 0;
  return clamp((1 + change7d / 100) / (1 + marketWeek / 100) - 1, -MODEL_CONSTANTS.growthCap, MODEL_CONSTANTS.growthCap);
}

/** One comparable per token that trades, with its family TVL summed. */
export function buildComps(snapshot: Snapshot, marketWeek: number): Comparable[] {
  const tickers = snapshot.protocols.filter((p) => tokenStatus(p) === 'on-record' && p.symbol !== null);
  const sameFamily = (s: string, t: string): boolean =>
    t === s || (Math.min(t.length, s.length) > 3 && (t.indexOf(s) === 0 || s.indexOf(t) === 0));
  return snapshot.protocols
    .filter((p) => tokenStatus(p) === 'trades')
    .map((p) => {
      const own = stem(p.name);
      let tvl = p.tvl_usd;
      let members = 1;
      for (const q of tickers) {
        if (q.symbol === p.symbol && sameFamily(own, stem(q.name))) {
          tvl += q.tvl_usd;
          members++;
        }
      }
      let skip: string | null = null;
      if (HOUSE_CATEGORIES.indexOf(p.category ?? '') >= 0) skip = 'prices a chain, exchange or staked asset';
      else if (Math.abs((p.mcap_usd ?? 0) / tvl - 1) < MODEL_CONSTANTS.receiptBand) skip = 'receipt token: cap equals TVL';
      return {
        name: p.name,
        symbol: p.symbol ?? p.gecko_id ?? '',
        sector: sectorOf(p.category),
        tvl,
        mcap: p.mcap_usd ?? 0,
        members,
        age: ageDays(snapshot.as_of, p.listed_at),
        excess: excessGrowth(p.change_7d, marketWeek),
        x: log10(tvl),
        y: log10(p.mcap_usd ?? 1),
        skip,
      };
    });
}

/** The market's week: the median protocol's 7-day TVL change. */
export function marketWeekOf(snapshot: Snapshot): number {
  return median(snapshot.protocols.filter((p) => p.change_7d !== null).map((p) => p.change_7d as number));
}
