// Token Radar v3 — the allocator: one budget, spread across the board.
// A reader with $1,000 should not put it all on rank 1. The allocator walks the
// FARM rows best-first by net per dollar, takes each row's own ticket (its deposit
// tier), and stops when the budget is spent. What it prints is the whole deployment:
// every leg, the expected net, the fees, the minutes, and the cash left over.
// It is a plan, not a promise: the nets are the model's own slices, netted the same
// way as every farm plan on the board.

import { MODEL_CONSTANTS } from './comps.ts';

export interface AllocatorLeg {
  rank: number;
  slug: string;
  name: string;
  play: string;
  ticket: number;
  net: number;
  fees: number;
  minutes: number;
  netPerDollar: number;
}

export interface Allocator {
  budget: number;
  deployed: number;
  leftover: number;
  legs: AllocatorLeg[];
  expectedNet: number;
  totalFees: number;
  totalMinutes: number;
  netPerDollar: number;
  farmRows: number;
  skippedForFit: number;
}

export interface AllocatableRow {
  rank: number;
  slug: string;
  name: string;
  plan: { verdict: string; capital: number; net: number; fees: number; minutes: number; play: string };
}

/** Walk the FARM rows best-first by net per dollar; take a row's whole ticket or skip it. */
export function allocate(rows: AllocatableRow[], budget: number = MODEL_CONSTANTS.allocatorBudget): Allocator {
  const farm = rows
    .filter((r) => r.plan.verdict === 'FARM' && r.plan.net > 0)
    .map((r) => ({ row: r, netPerDollar: r.plan.net / r.plan.capital }))
    .sort((a, b) => b.netPerDollar - a.netPerDollar || a.row.rank - b.row.rank);
  const legs: AllocatorLeg[] = [];
  let deployed = 0;
  let skippedForFit = 0;
  for (const { row, netPerDollar } of farm) {
    const ticket = row.plan.capital;
    if (deployed + ticket > budget) {
      skippedForFit++;
      continue;
    }
    deployed += ticket;
    legs.push({
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      play: row.plan.play,
      ticket,
      net: row.plan.net,
      fees: row.plan.fees,
      minutes: row.plan.minutes,
      netPerDollar,
    });
    if (deployed >= budget) break;
  }
  const expectedNet = legs.reduce((s, l) => s + l.net, 0);
  const totalFees = legs.reduce((s, l) => s + l.fees, 0);
  const totalMinutes = legs.reduce((s, l) => s + l.minutes, 0);
  return {
    budget,
    deployed,
    leftover: budget - deployed,
    legs,
    expectedNet,
    totalFees,
    totalMinutes,
    netPerDollar: deployed ? expectedNet / deployed : 0,
    farmRows: farm.length,
    skippedForFit,
  };
}
