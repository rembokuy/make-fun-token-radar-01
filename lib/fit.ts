// Token Radar v3 — the fit: a robust size curve, tested blind two ways.
// Level 0: one flat cap/TVL multiple. 1: the size curve (Theil-Sen: the median of every
// pairwise slope, so one 400x outlier cannot tilt the curve). 2: + sector, each sector's
// residuals shrunk toward zero. 3: + 7-day growth against the market and time with no
// token. Every level is priced blind: each token left out in turn, and older tokens
// pricing newer ones. The ladder is the model's own report card, printed on the board.

import { clamp, log10, median } from './snapshot.ts';
import { MODEL_CONSTANTS, type Comparable } from './comps.ts';

export interface Fit {
  level: number;
  a: number;
  b: number;
  sector: Record<string, number>;
  ageSlope: number;
  ageRef: number;
}

/** Theil-Sen line: median slope, median intercept. */
export function theilSen(points: Array<[number, number]>): { a: number; b: number } {
  const slopes: number[] = [];
  points.forEach(([x1, y1], i) => {
    for (const [x2, y2] of points.slice(i + 1)) {
      if (x2 !== x1) slopes.push((y2 - y1) / (x2 - x1));
    }
  });
  const b = median(slopes);
  return { a: median(points.map(([x, y]) => y - b * x)), b };
}

/** Ordinary least squares, kept only as the baseline the robust fit must beat. */
export function ols(points: Array<[number, number]>): { a: number; b: number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) * (x - mx);
  }
  const b = sxx ? sxy / sxx : 1;
  return { a: my - b * mx, b };
}

export function ageFactor(fit: Fit, age: number | null): number {
  if (age === null || !fit.ageSlope) return 1;
  return clamp(
    Math.pow(10, fit.ageSlope * (log10(Math.max(age, 30)) - fit.ageRef)),
    MODEL_CONSTANTS.ageClamp[0],
    MODEL_CONSTANTS.ageClamp[1],
  );
}

/** The fit, by level. */
export function fitCurve(comps: Comparable[], level: number): Fit {
  if (level === 0) {
    return { level: 0, a: median(comps.map((c) => c.y - c.x)), b: 1, sector: {}, ageSlope: 0, ageRef: 0 };
  }
  const line = theilSen(comps.map((c): [number, number] => [c.x, c.y]));
  const fit: Fit = { level, a: line.a, b: line.b, sector: {}, ageSlope: 0, ageRef: 0 };
  if (level === 1) return fit;
  const left: Record<string, number[]> = {};
  for (const c of comps) {
    (left[c.sector] = left[c.sector] ?? []).push(c.y - fit.a - fit.b * c.x);
  }
  for (const [s, res] of Object.entries(left)) {
    fit.sector[s] = (res.length * median(res)) / (res.length + MODEL_CONSTANTS.pseudoComps);
  }
  if (level === 2) return fit;
  const dated = comps
    .filter((c) => c.age)
    .map((c): [number, number] => [log10(c.age as number), c.y - fit.a - fit.b * c.x - (fit.sector[c.sector] ?? 0)]);
  fit.ageSlope = theilSen(dated).b * MODEL_CONSTANTS.ageShare;
  fit.ageRef = median(dated.map(([lx]) => lx));
  return fit;
}

/** log10 of the cap a fit gives one comparable: the same sum impliedValue multiplies out. */
export function predictLog(fit: Fit, c: Pick<Comparable, 'x' | 'sector' | 'excess' | 'age'>): number {
  const base = fit.a + fit.b * c.x + (fit.sector[c.sector] ?? 0);
  if (fit.level < 3) return base;
  return base + fit.b * log10(1 + c.excess) + log10(ageFactor(fit, c.age));
}

export interface LevelScore {
  name: string;
  miss: number;
  within3: number;
  n: number;
  splitMiss: number;
  splitWithin3: number;
  splitN: number;
}

export interface Backtest {
  ladder: LevelScore[];
  older: number;
  newer: number;
  baseline: { miss: number; within3: number; n: number };
}

const LEVEL_NAMES = [
  'One flat cap/TVL multiple',
  '+ size curve (TVL^b)',
  '+ sector',
  '+ 7-day growth, time with no token',
];

const isOlder = (c: Comparable): boolean => !c.age || c.age >= 900;
const without = <T>(list: T[], i: number): T[] => list.filter((_, j) => j !== i);

function scoreOf(errors: number[]): { miss: number; within3: number; n: number } {
  const abs = errors.map(Math.abs);
  return {
    miss: Math.pow(10, median(abs)),
    within3: abs.filter((e) => e <= log10(3)).length / abs.length,
    n: abs.length,
  };
}

/** Every traded token priced blind at each level, two ways: left out against the
 *  others, and newer tokens priced by a fit on older tokens only. Plus the OLS
 *  baseline the robust curve must beat on the same tokens. */
export function backtest(comps: Comparable[]): Backtest {
  const [older, newer] = [comps.filter(isOlder), comps.filter((c) => !isOlder(c))];
  const ladder = LEVEL_NAMES.map((name, level) => {
    const errors = comps.map((c, i) => c.y - predictLog(fitCurve(without(comps, i), level), c));
    const early = fitCurve(older, level);
    const split = newer.map((c) => c.y - predictLog(early, c));
    const s = scoreOf(errors);
    const sp = scoreOf(split);
    return { name, miss: s.miss, within3: s.within3, n: s.n, splitMiss: sp.miss, splitWithin3: sp.within3, splitN: sp.n };
  });
  const olsErrors = comps.map((c, i) => {
    const line = ols(without(comps, i).map((d): [number, number] => [d.x, d.y]));
    return c.y - (line.a + line.b * c.x);
  });
  return { ladder, older: older.length, newer: newer.length, baseline: scoreOf(olsErrors) };
}

export interface RangeTest {
  young: number;
  seasoned: number;
  nYoung: number;
  each: number;
  n: number;
  split: number;
  newer: number;
}

/** The printed range: half the blind misses of tokens like it (under or over 18
 *  months on record) fall inside. Then tested on tokens it never saw: each left
 *  out against the others' misses, and older-to-newer. */
export function rangeTest(comps: Comparable[]): RangeTest {
  const blindOf = (c: Comparable): number => Math.abs(c.y - log10(c.blind ?? 1));
  const isYoung = (c: Comparable): boolean => c.age !== null && c.age < MODEL_CONSTANTS.youngDays;
  const young = comps.filter(isYoung);
  const seasoned = comps.filter((c) => !isYoung(c));
  const each = comps.filter((c) => {
    const peers = (isYoung(c) ? young : seasoned).filter((o) => o !== c);
    return blindOf(c) <= median(peers.map(blindOf));
  }).length;
  const [older, newer] = [comps.filter(isOlder), comps.filter((c) => !isOlder(c))];
  const fitOld = fitCurve(older, 3);
  const width = median(older.map((c, i) => Math.abs(c.y - predictLog(fitCurve(without(older, i), 3), c))));
  return {
    young: Math.pow(10, median(young.map(blindOf))),
    seasoned: Math.pow(10, median(seasoned.map(blindOf))),
    nYoung: young.length,
    each,
    n: comps.length,
    split: newer.filter((c) => Math.abs(c.y - predictLog(fitOld, c)) <= width).length,
    newer: newer.length,
  };
}

/** A comparable's blind price at level 3, kept on it for the range test. */
export function attachBlind(comps: Comparable[]): void {
  comps.forEach((c, i) => {
    const fit = fitCurve(without(comps, i), 3);
    (c as Comparable & { blind?: number }).blind = Math.pow(10, c.y - (c.y - predictLog(fit, c)));
  });
}
