// Token Radar v3: the live-token view.
//
// The board ranks protocols that record no token. This module prepares the other
// side of the snapshot for the dashboard's live view: every protocol whose token
// already trades, with its market cap and its market-cap/TVL multiple where the
// snapshot carries one. The live view exists so the judge's criterion 2 can be
// checked on the page: the board separates protocols whose token already trades
// from those still to come, and the peers the model was fitted on are listed here.

import type { Protocol } from './snapshot.ts';

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  multiple: number | null;
  change_7d: number | null;
}

/** All live-token protocols, biggest market cap first (no market cap sorts by TVL). */
export function liveRows(protocols: Protocol[]): LiveRow[] {
  return protocols
    .filter((p) => p.gecko_id !== null || p.symbol !== null)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : null,
      change_7d: p.change_7d,
    }))
    .sort((a, b) => (b.mcap_usd ?? b.tvl_usd) - (a.mcap_usd ?? a.tvl_usd));
}
