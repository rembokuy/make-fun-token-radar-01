// Token Radar v3 ("radar-3-fitted"): reading the sealed snapshot.
//
// The snapshot is the house's frozen DefiLlama fetch (2026-11-14): every protocol at
// or above $5,000,000 of TVL, ten fields each, plus the 40-slug watchlist. Nothing in
// this file invents a protocol, a value or a ranking: it only sorts the snapshot's
// own records into the groups the board, the live view and the exclusion list need.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Parse and lightly validate the snapshot JSON. Throws on a malformed file. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot is not an object');
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot.protocols is not an array');
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot.watchlist is not an array');
  if (typeof raw.floor_usd !== 'number') throw new Error('snapshot.floor_usd is not a number');
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string') throw new Error('snapshot protocol without slug/name');
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new Error(`snapshot protocol ${p.slug} without numeric tvl_usd`);
    if (!Array.isArray(p.chains)) throw new Error(`snapshot protocol ${p.slug} without chains array`);
  }
  return raw;
}

/** A protocol "records no token" when DefiLlama carries neither a CoinGecko id nor a symbol. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** The watchlist's version rule: a name ending in a version marker (V2, v2, 2.0, ...). */
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export function isVersioned(name: string): boolean {
  return VERSION_SUFFIX.test(name);
}

export type ExclusionReason = 'CEX' | 'versioned name';

/**
 * The board ranks every pre-token protocol except the two the house's own reading
 * sets aside: centralised exchanges (a CEX token is an exchange's business, not a
 * protocol launch) and versioned names (V2 of a protocol whose token already trades).
 * Everything else pre-token is rankable, watchlist or not: the floor is never the
 * whole board.
 */
export function exclusionReason(p: Protocol): ExclusionReason | null {
  if (p.category === 'CEX') return 'CEX';
  if (isVersioned(p.name)) return 'versioned name';
  return null;
}

/**
 * Wrapped, staked or bridged products of a token that already trades. They stay on
 * the board (the snapshot records no token for them) but their rows are flagged:
 * farming the wrapper is not farming a launch, so the plan points at the underlying
 * protocol instead and says so.
 */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
export function isWrappedProduct(p: Protocol): boolean {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** Whole years between the day DefiLlama began tracking a protocol and the snapshot date. */
export function ageYears(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const start = Date.parse(`${p.listed_at}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 86_400_000 / 365.25;
}

export interface Classification {
  total: number;
  watchlistCount: number;
  preTokenCount: number;
  liveCount: number;
  liveNonCexCount: number;
  liveCexCount: number;
  excludedCount: number;
  rankableCount: number;
  rankable: Protocol[];
  excluded: { slug: string; name: string; category: string | null; tvl_usd: number; reason: ExclusionReason }[];
  live: Protocol[];
  watchlistMissing: string[];
}

/** Split the snapshot into rankable / live / excluded, and count everything. */
export function classify(snapshot: Snapshot): Classification {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const rankable: Protocol[] = [];
  const excluded: Classification['excluded'] = [];
  const live: Protocol[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) {
      const reason = exclusionReason(p);
      if (reason !== null) excluded.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason });
      else rankable.push(p);
    } else {
      live.push(p);
    }
  }
  const watchlistMissing = snapshot.watchlist.filter((slug) => {
    const p = bySlug.get(slug);
    return p === undefined || !rankable.includes(p);
  });
  return {
    total: snapshot.protocols.length,
    watchlistCount: snapshot.watchlist.length,
    preTokenCount: snapshot.protocols.length - live.length,
    liveCount: live.length,
    liveNonCexCount: live.filter((p) => p.category !== 'CEX').length,
    liveCexCount: live.filter((p) => p.category === 'CEX').length,
    excludedCount: excluded.length,
    rankableCount: rankable.length,
    rankable,
    excluded,
    live,
    watchlistMissing,
  };
}

/** Format a whole-dollar amount with thousands separators, no decimals. */
export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Compact dollars: $534.7M, $12.3K, $1.2B. */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
