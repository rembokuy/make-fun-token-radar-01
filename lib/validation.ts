// Token Radar v3: validation the model has to survive, not just fit.
//
// Three checks, all measured on the live-token peers and reported with their real
// numbers in the dashboard and the README:
//
//   1. walk-forward: fit on protocols listed before a cutoff date, test on the ones
//      listed after it. A model that only memorises the past fails here.
//   2. leave-one-out: refit without each peer in turn and predict the held-out one.
//      No protocol gets to grade its own homework.
//   3. rank ranges: 200 deterministic bootstrap refits (seeded PRNG, fixed seed) re-rank
//      the whole board; each row reports its rank range. Wide ranges are shown as
//      uncertainty, never hidden.
//
// All three are deterministic: the same snapshot always gives the same numbers.

import type { Protocol } from './snapshot.ts';
import { fitModel, fittedImpliedValue, topCategories, type FittedModel } from './fitted-model.ts';
import { median } from './peers.ts';

/** Deterministic PRNG (mulberry32): same seed, same stream, every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WalkForwardResult {
  cutoff: string;
  nTrain: number;
  nTest: number;
  medAeLog: number;
  medAbsPctErr: number;
}

/**
 * Walk-forward test. Peers with a listing date are split at their median listing
 * date: fit on the earlier half, test on the later half. Peers with no listing date
 * are left out of this check (the report says how many).
 */
export function walkForward(peers: Protocol[], asOf: string): WalkForwardResult {
  const dated = peers.filter((p) => p.listed_at !== null).sort((a, b) => a.listed_at!.localeCompare(b.listed_at!));
  if (dated.length < 20) throw new Error('walk-forward: fewer than 20 dated peers');
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const train = dated.filter((p) => p.listed_at! <= cutoff);
  const test = dated.filter((p) => p.listed_at! > cutoff);
  const model = fitModel(train, asOf);
  const errors = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, fittedImpliedValue(model, p, asOf)))));
  const pct = test.map((p) => Math.abs(fittedImpliedValue(model, p, asOf) - p.mcap_usd!) / p.mcap_usd!);
  return { cutoff, nTrain: train.length, nTest: test.length, medAeLog: median(errors), medAbsPctErr: median(pct) };
}

export interface LeaveOneOutResult {
  n: number;
  medAeLog: number;
  medAbsPctErr: number;
}

/**
 * The transparent baseline's leave-one-out score: predict each held-out peer by
 * its category median multiple (global median when the category is too thin),
 * medians computed without the held-out peer. The fitted model has to beat this
 * number to earn its keep, and the report says both numbers.
 */
export function baselineLeaveOneOut(peers: Protocol[]): LeaveOneOutResult {
  const logErrors: number[] = [];
  const pctErrors: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const rest = peers.filter((_, j) => j !== i);
    const held = peers[i]!;
    const catMults = rest.filter((p) => p.category === held.category).map((p) => p.mcap_usd! / p.tvl_usd);
    const mult = catMults.length >= 3 ? median(catMults) : median(rest.map((p) => p.mcap_usd! / p.tvl_usd));
    const predicted = held.tvl_usd * mult;
    logErrors.push(Math.abs(Math.log(held.mcap_usd!) - Math.log(predicted)));
    pctErrors.push(Math.abs(predicted - held.mcap_usd!) / held.mcap_usd!);
  }
  return { n: peers.length, medAeLog: median(logErrors), medAbsPctErr: median(pctErrors) };
}

/** Leave-one-out: refit without each peer, predict the held-out peer. */
export function leaveOneOut(peers: Protocol[], asOf: string): LeaveOneOutResult {
  const logErrors: number[] = [];
  const pctErrors: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const rest = peers.filter((_, j) => j !== i);
    const model = fitModel(rest, asOf);
    const held = peers[i]!;
    const predicted = fittedImpliedValue(model, held, asOf);
    logErrors.push(Math.abs(Math.log(held.mcap_usd!) - Math.log(predicted)));
    pctErrors.push(Math.abs(predicted - held.mcap_usd!) / held.mcap_usd!);
  }
  return { n: peers.length, medAeLog: median(logErrors), medAbsPctErr: median(pctErrors) };
}

export interface RankRange {
  slug: string;
  lo: number;
  hi: number;
  median: number;
  width: number;
}

/**
 * Rank ranges from deterministic bootstrap refits. Each refit resamples the
 * training peers with replacement (seeded), refits, and re-ranks the rankable
 * board by fitted value (ties: TVL desc, slug asc). Returns each row's lowest,
 * highest and median rank across refits. A row whose range spans half the board
 * is an honest "we do not know where this belongs", not a precise-looking rank.
 */
export function rankRanges(
  peers: Protocol[],
  rankable: Protocol[],
  asOf: string,
  refits = 200,
  seed = 20261114,
): RankRange[] {
  const rng = mulberry32(seed);
  // The specification is fixed once, from the full training set: a resample must
  // not change which categories get dummies, or the ranges would measure
  // specification churn instead of parameter uncertainty.
  const fixedCats = topCategories(peers);
  const ranksBySlug = new Map<string, number[]>();
  for (const p of rankable) ranksBySlug.set(p.slug, []);
  for (let r = 0; r < refits; r++) {
    const sample: Protocol[] = [];
    for (let i = 0; i < peers.length; i++) sample.push(peers[Math.floor(rng() * peers.length)]!);
    let model: FittedModel;
    try {
      model = fitModel(sample, asOf, fixedCats);
    } catch {
      continue; // a degenerate resample (a category vanishing) skips, it never fakes a rank
    }
    const scored = rankable
      .map((p) => ({ slug: p.slug, value: fittedImpliedValue(model, p, asOf), tvl: p.tvl_usd }))
      .sort((a, b) => b.value - a.value || b.tvl - a.tvl || a.slug.localeCompare(b.slug));
    scored.forEach((row, i) => ranksBySlug.get(row.slug)!.push(i + 1));
  }
  const out: RankRange[] = [];
  for (const p of rankable) {
    const ranks = [...(ranksBySlug.get(p.slug) ?? [])].sort((a, b) => a - b);
    if (ranks.length === 0) {
      out.push({ slug: p.slug, lo: 0, hi: 0, median: 0, width: 0 });
      continue;
    }
    const lo = ranks[0]!;
    const hi = ranks[ranks.length - 1]!;
    out.push({ slug: p.slug, lo, hi, median: median(ranks), width: hi - lo });
  }
  return out;
}
