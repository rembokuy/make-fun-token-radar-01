// Token Radar v3: the fitted launch-pricing model.
//
// The board's implied value is FITTED, not a median multiple. On the live-token
// peers (protocols whose token already trades, with a market cap and a TVL in the
// snapshot) we fit ordinary least squares:
//
//   log(market cap) ~ log(TVL) + log(TVL)^2 + age + age-missing + log(1 + chains)
//                     + 7-day TVL change + category effects
//
// Age is years since DefiLlama began tracking the protocol; the 7-day change is
// clipped to [-50%, +200%] so one wild week cannot drag the fit; category effects
// are dummies only for categories with at least 8 live peers (thinner categories
// pool into the intercept, which the limitations section says plainly). A pre-token
// protocol's implied value is exp(predicted log market cap): what its token would
// be worth if it launched at the comps' fitted pricing, given its own TVL, growth,
// age, chains and category. The fit is deterministic, standard library only, and
// its quality is measured in lib/validation.ts, never asserted.

import { ageYears, type Protocol } from './snapshot.ts';
import { mean, median } from './peers.ts';

export interface FittedModel {
  beta: number[];
  featureNames: string[];
  meanLnTvl: number;
  topCategories: string[];
  n: number;
  r2: number;
  rmseLog: number;
  medAeLog: number;
  medAbsPctErr: number;
  /** Training log-market-cap values, for the fit-quality line in the dashboard. */
  trainLogMcap: number[];
}

function clipChange(change7d: number | null): number {
  const c = change7d ?? 0;
  return Math.max(-50, Math.min(200, c)) / 100;
}

/** Feature vector for one protocol, given the fit's centering and category list. */
export function features(p: Protocol, asOf: string, meanLnTvl: number, topCategories: string[]): number[] {
  const lnTvl = Math.log(p.tvl_usd);
  const age = ageYears(p, asOf);
  const row: number[] = [
    1,
    lnTvl,
    (lnTvl - meanLnTvl) * (lnTvl - meanLnTvl),
    age ?? 0,
    age === null ? 1 : 0,
    Math.log(1 + p.chains.length),
    clipChange(p.change_7d),
  ];
  for (const cat of topCategories) row.push(p.category === cat ? 1 : 0);
  return row;
}

function featureNames(topCategories: string[]): string[] {
  return [
    'intercept',
    'log(TVL)',
    'log(TVL)^2 (centred)',
    'age_years',
    'age_missing',
    'log(1 + chains)',
    'change_7d_clipped',
    ...topCategories.map((c) => `cat:${c}`),
  ];
}

/**
 * Solve a small dense linear system by Gauss-Jordan elimination with partial
 * pivoting. Throws when the matrix is (numerically) singular, so a degenerate
 * fit fails loudly instead of silently returning nonsense.
 */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) throw new Error('fitted model: singular design matrix');
    if (pivot !== col) {
      const tmp = m[col]!;
      m[col] = m[pivot]!;
      m[pivot] = tmp;
    }
    const div = m[col]![col]!;
    for (let j = col; j <= n; j++) m[col]![j]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) m[r]![j]! -= factor * m[col]![j]!;
    }
  }
  return m.map((row) => row[n]!);
}

/** Ordinary least squares: beta = (X'X)^-1 X'y, via the normal equations. */
export function ols(rows: number[][], y: number[]): number[] {
  const k = rows[0]!.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    for (let a = 0; a < k; a++) {
      xty[a]! += row[a]! * y[i]!;
      for (let b = 0; b < k; b++) xtx[a]![b]! += row[a]! * row[b]!;
    }
  }
  // A whisper of ridge (1e-8 on the diagonal) keeps near-collinear dummies stable
  // without moving any coefficient by a measurable amount.
  for (let a = 0; a < k; a++) xtx[a]![a]! += 1e-8;
  return solveLinear(xtx, xty);
}

/** Categories with at least `minPeers` training peers, most peers first, ties by name. */
export function topCategories(peers: Protocol[], minPeers = 8): string[] {
  const counts = new Map<string, number>();
  for (const p of peers) {
    if (p.category === null) continue;
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minPeers)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

/** Fit the model on the training peers and measure its in-sample fit honestly.
 * `fixedCategories` pins the dummy set (used by the bootstrap rank ranges, so a
 * resample cannot change the specification mid-measurement); without it the
 * categories are selected from the peers given. */
export function fitModel(peers: Protocol[], asOf: string, fixedCategories?: string[]): FittedModel {
  if (peers.length < 30) throw new Error(`fitted model: only ${peers.length} training peers, need at least 30`);
  const meanLnTvl = mean(peers.map((p) => Math.log(p.tvl_usd)));
  const cats = fixedCategories ?? topCategories(peers);
  const rows = peers.map((p) => features(p, asOf, meanLnTvl, cats));
  const y = peers.map((p) => Math.log(p.mcap_usd!));
  const beta = ols(rows, y);
  const predicted = rows.map((row) => row.reduce((s, v, i) => s + v * beta[i]!, 0));
  const residuals = y.map((v, i) => v - predicted[i]!);
  const yMean = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - yMean) * (v - yMean), 0);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const absPct = peers.map((p, i) => Math.abs(Math.exp(predicted[i]!) - p.mcap_usd!) / p.mcap_usd!);
  return {
    beta,
    featureNames: featureNames(cats),
    meanLnTvl,
    topCategories: cats,
    n: peers.length,
    r2: 1 - ssRes / ssTot,
    rmseLog: Math.sqrt(ssRes / y.length),
    medAeLog: median(residuals.map((r) => Math.abs(r))),
    medAbsPctErr: median(absPct),
    trainLogMcap: y,
  };
}

/** Predicted log market cap for one protocol under a fitted model. */
export function predictLogMcap(model: FittedModel, p: Protocol, asOf: string): number {
  const row = features(p, asOf, model.meanLnTvl, model.topCategories);
  return row.reduce((s, v, i) => s + v * model.beta[i]!, 0);
}

/** Fitted implied launch value in whole dollars: exp(predicted log market cap). */
export function fittedImpliedValue(model: FittedModel, p: Protocol, asOf: string): number {
  return Math.max(1, Math.round(Math.exp(predictLogMcap(model, p, asOf))));
}
