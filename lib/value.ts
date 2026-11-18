// Token Radar v3 — the value: what a launch would be worth if the protocol's
// record stayed as it is.
//   value = 10^a · TVL^b · sector · (1 + growth over the market)^b · age factor · kinship
// a, b, the sector effects and the age slope are all fitted on the snapshot's own
// traded tokens (see lib/fit.ts). No protocol is priced by name.

import { ageDays, clamp, log10, type SnapshotProtocol } from './snapshot.ts';
import { MODEL_CONSTANTS, excessGrowth, sectorOf } from './comps.ts';
import { ageFactor, type Fit } from './fit.ts';

export interface Priced {
  value: number;
  curve: number;
  factors: Array<{ name: string; mult: number }>;
  sector: string;
  age: number | null;
  excess: number;
}

export function impliedValue(
  p: SnapshotProtocol,
  fit: Fit,
  ctx: { asOf: string; marketWeek: number; kin: 'token' | 'parent' | null },
): Priced {
  const sector = sectorOf(p.category);
  const age = ageDays(ctx.asOf, p.listed_at);
  const excess = excessGrowth(p.change_7d, ctx.marketWeek);
  const curve = Math.pow(10, fit.a + fit.b * log10(p.tvl_usd));
  const kinship =
    ctx.kin === 'token'
      ? MODEL_CONSTANTS.kinToken
      : ctx.kin === 'parent'
        ? Math.pow(2, fit.b - 1)
        : 1;
  const factors = [
    { name: 'Sector', mult: Math.pow(10, fit.sector[sector] ?? 0) },
    { name: 'Momentum', mult: Math.pow(1 + excess, fit.b) },
    { name: 'Time with no token', mult: ageFactor(fit, age) },
    { name: 'Kinship', mult: kinship },
  ];
  const value = factors.reduce((v, f) => v * f.mult, curve);
  return { value: Math.max(1, Math.round(value)), curve, factors, sector, age, excess };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** The board's tier for a row: watchlist, shared family, or early below the floor. */
export function tierOf(listed: boolean, family: 'token' | 'parent' | null): string {
  if (listed) return 'watchlist';
  if (family === 'parent') return 'shared';
  return 'early';
}

export { clamp };
