// Token Radar v3: assembling the board.
//
// buildRadar takes the classified snapshot, the fitted model and the rank ranges,
// and returns the board (one row per rankable pre-token protocol, ranked by fitted
// implied value), the live view, the exclusion list, and every measured number the
// dashboard and the README report. dataScript serialises the same object the page
// reads as data.js.
//
// Gate shape, enforced here before anything is written (boardIssue mirrors the
// scorer's own checks): 100–4000 rows, ranks exactly 1..N, implied values positive
// whole dollars and non-increasing with rank, every watchlist slug present, farm
// steps 3–12 strings of 20–600 characters, slugs unique and from the snapshot.

import {
  classify,
  fmtUsd,
  isWrappedProduct,
  type Classification,
  type Protocol,
  type Snapshot,
} from './snapshot.ts';
import { globalMultiple, medianImpliedValue, peerMultipleTable, trainingPeers } from './peers.ts';
import { fittedImpliedValue, fitModel, type FittedModel } from './fitted-model.ts';
import { leaveOneOut, baselineLeaveOneOut, rankRanges, walkForward } from './validation.ts';
import { planFor } from './farm-plans.ts';
import { liveRows, type LiveRow } from './live-rows.ts';

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  watchlist: boolean;
  fitted_value_usd: number;
  median_value_usd: number;
  rank_lo: number;
  rank_hi: number;
  rank_median: number;
  rank_range_wide: boolean;
  wrapped_product: boolean;
  deposit_usd: number;
  farm_cost_usd: number;
  breakeven_share_pct: number;
}

export interface RadarMetrics {
  modelVersion: string;
  nTrainingPeers: number;
  r2: number;
  rmseLog: number;
  medAeLog: number;
  medAbsPctErr: number;
  walkForwardCutoff: string;
  walkForwardNTrain: number;
  walkForwardNTest: number;
  walkForwardMedAeLog: number;
  walkForwardMedAbsPctErr: number;
  looMedAeLog: number;
  looMedAbsPctErr: number;
  baselineLooMedAeLog: number;
  baselineLooMedAbsPctErr: number;
  globalMultiple: number;
  medianFarmCostUsd: number;
  topImpliedValueUsd: number;
  tiesNudged: number;
  wideRankRanges: number;
  refits: number;
  peerTable: { category: string; peers: number; medianMultiple: number }[];
  featureNames: string[];
  beta: number[];
  topCategories: string[];
}

export interface Radar {
  asOf: string;
  floorUsd: number;
  accounting: {
    total: number;
    ranked: number;
    live: number;
    liveNonCex: number;
    liveCex: number;
    excluded: number;
    watchlist: number;
    watchlistCovered: number;
  };
  metrics: RadarMetrics;
  board: BoardRow[];
  live: LiveRow[];
  excluded: Classification['excluded'];
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function buildRadar(snapshot: Snapshot): Radar {
  const cls = classify(snapshot);
  if (cls.watchlistMissing.length > 0) {
    throw new Error(`board would miss watchlist slugs: ${cls.watchlistMissing.join(', ')}`);
  }
  const peers = trainingPeers(snapshot.protocols);
  const model: FittedModel = fitModel(peers, snapshot.as_of);
  const wf = walkForward(peers, snapshot.as_of);
  const loo = leaveOneOut(peers, snapshot.as_of);
  const baseline = baselineLeaveOneOut(peers);
  const ranges = rankRanges(peers, cls.rankable, snapshot.as_of, 200, 20261114);
  const rangeBySlug = new Map(ranges.map((r) => [r.slug, r]));
  const global = globalMultiple(peers);
  const watchlistSet = new Set(snapshot.watchlist);

  // Rank by fitted implied value; ties break by TVL, then slug (deterministic).
  const scored = cls.rankable
    .map((p) => ({
      p,
      fitted: fittedImpliedValue(model, p, snapshot.as_of),
      medianValue: medianImpliedValue(p, peers, global),
    }))
    .sort((a, b) => b.fitted - a.fitted || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));

  // The gate needs implied values non-increasing with rank. Rounded fitted values
  // can tie on the dollar; nudge a tied value down by $1 per step (counted, and
  // immaterial against values in the millions). The fitted value stays on the row.
  let tiesNudged = 0;
  let prev = Number.POSITIVE_INFINITY;
  const board: BoardRow[] = scored.map((row, i) => {
    let implied = row.fitted;
    if (implied >= prev) {
      implied = prev - 1;
      tiesNudged++;
    }
    if (implied < 1) implied = 1;
    prev = implied;
    const wrapped = isWrappedProduct(row.p);
    const plan = planFor(row.p, implied, wrapped);
    const range = rangeBySlug.get(row.p.slug) ?? { lo: i + 1, hi: i + 1, median: i + 1, width: 0 };
    return {
      slug: row.p.slug,
      name: row.p.name,
      rank: i + 1,
      implied_value_usd: implied,
      farm_steps: plan.steps,
      category: row.p.category,
      chains: row.p.chains,
      tvl_usd: row.p.tvl_usd,
      watchlist: watchlistSet.has(row.p.slug),
      fitted_value_usd: row.fitted,
      median_value_usd: row.medianValue,
      rank_lo: range.lo,
      rank_hi: range.hi,
      rank_median: range.median,
      rank_range_wide: range.width > 144, // wider than half the board: genuinely uncertain, flagged not hidden
      wrapped_product: wrapped,
      deposit_usd: plan.depositUsd,
      farm_cost_usd: plan.totalCostUsd,
      breakeven_share_pct: Math.round(plan.breakevenSharePct * 1000) / 1000,
    };
  });

  const metrics: RadarMetrics = {
    modelVersion: 'radar-3-fitted',
    nTrainingPeers: peers.length,
    r2: model.r2,
    rmseLog: model.rmseLog,
    medAeLog: model.medAeLog,
    medAbsPctErr: model.medAbsPctErr,
    walkForwardCutoff: wf.cutoff,
    walkForwardNTrain: wf.nTrain,
    walkForwardNTest: wf.nTest,
    walkForwardMedAeLog: wf.medAeLog,
    walkForwardMedAbsPctErr: wf.medAbsPctErr,
    looMedAeLog: loo.medAeLog,
    looMedAbsPctErr: loo.medAbsPctErr,
    baselineLooMedAeLog: baseline.medAeLog,
    baselineLooMedAbsPctErr: baseline.medAbsPctErr,
    globalMultiple: global,
    medianFarmCostUsd: medianNumber(board.map((r) => r.farm_cost_usd)),
    topImpliedValueUsd: board[0]?.implied_value_usd ?? 0,
    tiesNudged,
    wideRankRanges: board.filter((r) => r.rank_range_wide).length,
    refits: 200,
    peerTable: peerMultipleTable(peers),
    featureNames: model.featureNames,
    beta: model.beta,
    topCategories: model.topCategories,
  };

  return {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    accounting: {
      total: cls.total,
      ranked: cls.rankableCount,
      live: cls.liveCount,
      liveNonCex: cls.liveNonCexCount,
      liveCex: cls.liveCexCount,
      excluded: cls.excludedCount,
      watchlist: cls.watchlistCount,
      watchlistCovered: snapshot.watchlist.length,
    },
    metrics,
    board,
    live: liveRows(snapshot.protocols),
    excluded: cls.excluded,
  };
}

/** The gate's own shape, checked before writing. Returns the first problem, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100 to 4000`;
  const slugs = new Set<string>();
  const snapshotSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!snapshotSlugs.has(row.slug)) return `row ${i + 1} names an invented slug: ${row.slug}`;
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
    if (typeof row.name !== 'string' || row.name.length === 0) return `row ${i + 1} has no name`;
    if (row.rank !== i + 1) return `row ${i + 1} has rank ${row.rank}, expected ${i + 1}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${i + 1} has implied value ${row.implied_value_usd}, not a positive whole number`;
    }
    if (row.implied_value_usd > 100_000_000_000_000) return `row ${i + 1} implied value exceeds the cap`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} implied value rises above rank ${i}`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${i + 1} has ${row.farm_steps.length} farm steps, outside 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${i + 1} has a farm step of ${len} characters, outside 20 to 600`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (board.length >= 2 && values.size === 1) return 'every implied value is the same: the board ranks nothing';
  return null;
}

/** The dashboard's data file: the same object the page renders, as one script. */
export function dataScript(radar: Radar): string {
  return `window.TOKEN_RADAR = ${JSON.stringify(radar)};\n`;
}

export { fmtUsd };
