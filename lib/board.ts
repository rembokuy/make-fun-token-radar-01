// Token Radar v3 — the radar: who has a token, who is set aside and why, then the
// rest ranked by value. Every protocol in the snapshot lands in exactly one group,
// and the ledger prints the count of each: 758 in, 758 accounted for.
// The page's proof it shows what board.json holds: each row carries a digest of
// its plan strings, and the page recomputes it from the steps it renders.

import { allocate, type Allocator } from './allocator.ts';
import { buildComps, houseRule, marketWeekOf, MODEL_CONSTANTS, sectorOf, stem, tokenStatus } from './comps.ts';
import { attachBlind, backtest, fitCurve, predictLog, rangeTest, type Backtest, type Fit, type RangeTest } from './fit.ts';
import { farmPlan, stepStrings, type FarmPlan } from './plans.ts';
import { capitalFor, impliedValue, tierOf } from './value.ts';
import { digest, log10, median, mulberry32, type Snapshot, type SnapshotProtocol } from './snapshot.ts';

export interface BoardRowPlan {
  play: string;
  label: string;
  chain: string;
  hold_days: number;
  weeks: number;
  capital_usd: number;
  slice_usd: number;
  fees_usd: number;
  forgone_usd: number;
  net_usd: number;
  minutes: number;
  per_hour_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  breakeven_usd: number | null;
  digest: string;
  steps: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  tier: string;
  kin: string | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  curve_usd: number;
  factors: Array<{ name: string; mult: number }>;
  spread: number;
  rank_low: number;
  rank_high: number;
  plan: BoardRowPlan;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface AsideRow {
  name: string;
  category: string | null;
  tvl: number;
  reason: string;
  kin: string | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: {
    a: number;
    b: number;
    sector: Record<string, number>;
    age_slope: number;
    age_ref: number;
    comps: number;
    skipped: number;
  };
  validation: Backtest & { ranges: RangeTest };
  allocator: Allocator;
  ledger: Array<[string, number, string]>;
  counts: { protocols: number; watchlist: number; ranked: number; aside: number; onRecord: number; traded: number };
  rows: BoardRow[];
  live: LiveRow[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function planToRow(plan: FarmPlan): BoardRowPlan {
  const steps = stepStrings(plan);
  return {
    play: plan.play,
    label: plan.label,
    chain: plan.chain,
    hold_days: plan.hold,
    weeks: plan.weeks,
    capital_usd: plan.capital,
    slice_usd: round2(plan.slice),
    fees_usd: round2(plan.fees),
    forgone_usd: round2(plan.forgone),
    net_usd: round2(plan.net),
    minutes: plan.minutes,
    per_hour_usd: round2(plan.perHour),
    verdict: plan.verdict,
    breakeven_usd: plan.breakEven === null ? null : round2(plan.breakEven),
    digest: digest(steps),
    steps,
  };
}

/** Rank ranges from seeded bootstrap refits: each row's rank across refits, p10–p90. */
function rankRanges(
  priced: Array<{ slug: string; p: SnapshotProtocol; kin: 'token' | 'parent' | null }>,
  usable: Parameters<typeof fitCurve>[0],
  fit: Fit,
  marketWeek: number,
  asOf: string,
): Map<string, [number, number]> {
  const rng = mulberry32(MODEL_CONSTANTS.bootstrapSeed);
  const ranks = new Map<string, number[]>();
  for (let r = 0; r < MODEL_CONSTANTS.bootstrapRefits; r++) {
    const sample = Array.from({ length: usable.length }, () => usable[Math.floor(rng() * usable.length)]!);
    const refit = fitCurve(sample, 3);
    const values = priced.map(({ slug, p, kin }) => ({ slug, v: impliedValue(p, refit, { asOf, marketWeek, kin }).value }));
    values.sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
    values.forEach((row, i) => {
      const list = ranks.get(row.slug) ?? [];
      list.push(i + 1);
      ranks.set(row.slug, list);
    });
  }
  const out = new Map<string, [number, number]>();
  for (const [slug, list] of ranks) {
    const s = [...list].sort((a, b) => a - b);
    const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
    out.set(slug, [q(0.1), q(0.9)]);
  }
  return out;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const marketWeek = marketWeekOf(snapshot);
  const tokens = buildComps(snapshot, marketWeek);
  const usable = tokens.filter((c) => !c.skip);
  const fit = fitCurve(usable, 3);
  const tests = backtest(usable);
  attachBlind(usable);
  const ranges = rangeTest(usable);

  const watched = new Set(snapshot.watchlist);
  const stems: Record<string, string> = {};
  for (const p of snapshot.protocols) {
    if (tokenStatus(p) !== 'none') stems[stem(p.name)] = p.symbol ?? p.gecko_id ?? '';
  }

  const priced: Array<{ slug: string; p: SnapshotProtocol; kin: 'token' | 'parent' | null }> = [];
  const aside: AsideRow[] = [];
  let onRecord = 0;
  for (const p of snapshot.protocols) {
    const listed = watched.has(p.slug);
    const kin = stems[stem(p.name)] ?? null;
    if (tokenStatus(p) !== 'none' && !listed) {
      if (tokenStatus(p) === 'on-record') onRecord++;
      continue;
    }
    const reason = listed ? null : houseRule(p) ?? (kin ? 'Kin of a token' : null);
    if (reason !== null) {
      aside.push({ name: p.name, category: p.category, tvl: p.tvl_usd, reason, kin });
      continue;
    }
    const family: 'token' | 'parent' | null = kin ? 'token' : !listed && p.tvl_usd >= snapshot.floor_usd ? 'parent' : null;
    priced.push({ slug: p.slug, p, kin: family });
  }
  aside.sort((a, b) => b.tvl - a.tvl);

  const scored = priced.map(({ slug, p, kin }) => {
    const v = impliedValue(p, fit, { asOf: snapshot.as_of, marketWeek, kin });
    const young = v.age !== null && v.age < MODEL_CONSTANTS.youngDays && ranges.nYoung > 0;
    const spread = young ? ranges.young : ranges.seasoned;
    return { slug, p, kin, v, young, spread };
  });
  scored.sort((a, b) => b.v.value - a.v.value || (a.slug < b.slug ? -1 : 1));

  const rangesBySlug = rankRanges(priced, usable, fit, marketWeek, snapshot.as_of);
  const rows: BoardRow[] = scored.map((s, i) => {
    const plan = farmPlan({
      slug: s.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl: s.p.tvl_usd,
      value: s.v.value,
      age: s.v.age,
      capital: capitalFor(s.p.tvl_usd),
    });
    const [rankLow, rankHigh] = rangesBySlug.get(s.slug) ?? [i + 1, i + 1];
    return {
      rank: i + 1,
      slug: s.slug,
      name: s.p.name,
      category: s.p.category,
      sector: s.v.sector,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      age_days: s.v.age,
      tier: tierOf(watched.has(s.slug), s.kin),
      kin: stems[stem(s.p.name)] ?? null,
      implied_value_usd: s.v.value,
      implied_low_usd: Math.max(1, Math.round(s.v.value / s.spread)),
      implied_high_usd: Math.round(s.v.value * s.spread),
      curve_usd: Math.round(s.v.curve),
      factors: s.v.factors.map((f) => ({ name: f.name, mult: round4(f.mult) })),
      spread: round4(s.spread),
      rank_low: rankLow,
      rank_high: rankHigh,
      plan: planToRow(plan),
    };
  });

  const allocator = allocate(
    rows.map((r) => ({ rank: r.rank, slug: r.slug, name: r.name, plan: { verdict: r.plan.verdict, capital: r.plan.capital_usd, net: r.plan.net_usd, fees: r.plan.fees_usd, minutes: r.plan.minutes, play: r.plan.play } })),
  );

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => tokenStatus(p) !== 'none' && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));

  const ruled = ['Bridge', 'Liquid staking', 'Exchange custody', 'Versioned listing', 'Wrapped or staked', 'Kin of a token'];
  const ledger: Array<[string, number, string]> = [
    ['Ranked', rows.length, 'records no token; no rule sets it aside'],
    ['Token trades', tokens.length, 'a market cap: comparables, never ranked'],
    ['Token on record', onRecord, 'a ticker or CoinGecko id, no cap'],
    ...ruled.map((g): [string, number, string] => [
      g,
      aside.filter((a) => a.reason === g).length,
      g === 'Kin of a token' ? 'its name stem carries a token on record' : 'the house rule, applied below its floor',
    ]),
  ];

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_CONSTANTS.version,
    model: {
      a: round4(fit.a),
      b: round4(fit.b),
      sector: Object.fromEntries(Object.entries(fit.sector).map(([k, v]) => [k, round4(v)])),
      age_slope: round4(fit.ageSlope),
      age_ref: round4(fit.ageRef),
      comps: usable.length,
      skipped: tokens.length - usable.length,
    },
    validation: { ...tests, ranges },
    allocator,
    ledger,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      ranked: rows.length,
      aside: aside.length,
      onRecord,
      traded: tokens.length,
    },
    rows,
    live,
  };
  return { board: rows, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.plan.steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

export { log10, median, predictLog, sectorOf };
