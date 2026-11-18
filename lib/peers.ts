// Token Radar v3: the peer-multiple baseline.
//
// The fitted model (lib/fitted-model.ts) is the board's value model. This module
// keeps the simpler, transparent baseline beside it: for every live-token protocol,
// market cap divided by TVL. The board shows both numbers per row, so a reader can
// see where the fit agrees with the category median and where it does not. Nothing
// here is fitted: a median is a median.

import type { Protocol } from './snapshot.ts';

/** Live-token protocols with both a market cap and a TVL: the only peers a multiple can be read from. */
export function trainingPeers(protocols: Protocol[]): Protocol[] {
  return protocols.filter(
    (p) => p.gecko_id !== null || p.symbol !== null,
  ).filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Median of a non-empty number array (sorted copy, middle or mean of the two middles). */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of no values');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Mean of a number array. */
export function mean(values: number[]): number {
  if (values.length === 0) throw new Error('mean of no values');
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Median market-cap/TVL multiple of one category's live peers, or null when too thin to quote. */
export function categoryMultiple(peers: Protocol[], category: string | null, minPeers = 3): number | null {
  if (category === null) return null;
  const multiples = peers.filter((p) => p.category === category).map((p) => p.mcap_usd! / p.tvl_usd);
  if (multiples.length < minPeers) return null;
  return median(multiples);
}

/** Every category with at least `minPeers` live peers, with its peer count and median multiple. */
export function peerMultipleTable(peers: Protocol[], minPeers = 3): { category: string; peers: number; medianMultiple: number }[] {
  const byCategory = new Map<string, number[]>();
  for (const p of peers) {
    if (p.category === null) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(p.category, list);
  }
  const rows: { category: string; peers: number; medianMultiple: number }[] = [];
  for (const [category, multiples] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (multiples.length < minPeers) continue;
    rows.push({ category, peers: multiples.length, medianMultiple: median(multiples) });
  }
  return rows;
}

/** The global median multiple across all training peers. */
export function globalMultiple(peers: Protocol[]): number {
  return median(peers.map((p) => p.mcap_usd! / p.tvl_usd));
}

/** The multiple-implied value of a protocol: its TVL times its category median, else the global median. */
export function medianImpliedValue(p: Protocol, peers: Protocol[], global: number): number {
  const cat = categoryMultiple(peers, p.category);
  return Math.round(p.tvl_usd * (cat ?? global));
}
