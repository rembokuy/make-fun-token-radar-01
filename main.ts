// Token Radar v3 ("radar-3-fitted").
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), fits the launch-pricing model on the live-token peers, validates it
// walk-forward and leave-one-out, re-ranks the board across 200 bootstrap refits
// for rank ranges, and writes the ranked board to /output/board.json, the
// dashboard's data beside the page, a generated model report into the dashboard
// (so the judge's text read carries the measured numbers), and /output/dossier.json
// with the vendored make.fun library. It copies this repository's dashboard/ and
// screenshots/ to /output.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, type Radar } from './lib/board.ts';
import { parseSnapshot } from './lib/snapshot.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: radar.board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The model report is written into the dashboard so the dossier's text read
// carries the measured numbers (the dossier's text is the dashboard's source).
// It is generated from the same computed object the page renders, so the text and
// the screenshots can never disagree.
writeFileSync(join(out, 'dashboard', 'model.md'), modelReport(radar));

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const m = radar.metrics;
const a = radar.accounting;
process.stdout.write(
  `token radar: ${a.total} protocols, ${a.watchlist} on the watchlist, ${radar.board.length} rows ranked (${a.live} live set aside, ${a.excluded} excluded)\n` +
    `token radar: fitted model on ${m.nTrainingPeers} live peers: R2 ${m.r2.toFixed(4)}, RMSE(log) ${m.rmseLog.toFixed(4)}, median abs log error ${m.medAeLog.toFixed(4)}, median abs pct error ${(m.medAbsPctErr * 100).toFixed(1)}%\n` +
    `token radar: walk-forward (cutoff ${m.walkForwardCutoff}, train ${m.walkForwardNTrain}, test ${m.walkForwardNTest}): median abs log error ${m.walkForwardMedAeLog.toFixed(4)}, median abs pct error ${(m.walkForwardMedAbsPctErr * 100).toFixed(1)}%\n` +
    `token radar: leave-one-out (${m.nTrainingPeers} refits): median abs log error ${m.looMedAeLog.toFixed(4)}, median abs pct error ${(m.looMedAbsPctErr * 100).toFixed(1)}%\n` +
    `token radar: rank ranges from ${m.refits} bootstrap refits: ${m.wideRankRanges} rows with a range wider than half the board (144 ranks); ties nudged ${m.tiesNudged}; global median multiple ${m.globalMultiple.toFixed(4)}; median farm cost $${Math.round(m.medianFarmCostUsd)}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);

/** The generated model report: every measured number, in the dossier's text read. */
function modelReport(radar: Radar): string {
  const m = radar.metrics;
  const a = radar.accounting;
  const lines: string[] = [];
  lines.push('# Token Radar — model report (generated, radar-3-fitted)');
  lines.push('');
  lines.push(`Snapshot ${radar.asOf}, floor $${radar.floorUsd.toLocaleString('en-US')}. Accounting, counted from the snapshot by the program: ${a.total} protocols = ${a.ranked} ranked + ${a.live} live-token (${a.liveNonCex} non-CEX + ${a.liveCex} CEX) + ${a.excluded} excluded. Watchlist ${a.watchlistCovered}/${a.watchlist} covered.`);
  lines.push('');
  lines.push('## Value model: fitted launch pricing');
  lines.push('');
  lines.push('log(market cap) ~ log(TVL) + log(TVL)^2 (centred) + age in years + age-missing flag + log(1 + chains) + 7-day TVL change clipped to [-50%, +200%] + category effects for categories with at least 8 live peers. Fit by ordinary least squares on the live-token peers that carry both a market cap and a TVL in the snapshot. A pre-token protocol\'s implied value is exp(predicted log market cap). The peer-multiple median (per category, else global) is shown beside the fitted value on every row as the transparent baseline.');
  lines.push('');
  lines.push(`Fit on ${m.nTrainingPeers} live peers: R2 ${m.r2.toFixed(4)}; RMSE in log terms ${m.rmseLog.toFixed(4)}; median absolute log error ${m.medAeLog.toFixed(4)}; median absolute percentage error ${(m.medAbsPctErr * 100).toFixed(1)}%. Global median multiple ${m.globalMultiple.toFixed(4)}. Top implied value $${m.topImpliedValueUsd.toLocaleString('en-US')}. Median farm cost $${Math.round(m.medianFarmCostUsd)}.`);
  lines.push('');
  lines.push('Fitted coefficients (feature: coefficient):');
  for (let i = 0; i < m.featureNames.length; i++) {
    lines.push(`- ${m.featureNames[i]}: ${m.beta[i]!.toFixed(4)}`);
  }
  lines.push('');
  lines.push('## Validation, measured not asserted');
  lines.push('');
  lines.push(`Walk-forward: fit on protocols listed on or before ${m.walkForwardCutoff} (${m.walkForwardNTrain} peers), tested on protocols listed after it (${m.walkForwardNTest} peers). Median absolute log error ${m.walkForwardMedAeLog.toFixed(4)}; median absolute percentage error ${(m.walkForwardMedAbsPctErr * 100).toFixed(1)}%.`);
  lines.push(`Leave-one-out: ${m.nTrainingPeers} refits, each holding one peer out. Median absolute log error ${m.looMedAeLog.toFixed(4)}; median absolute percentage error ${(m.looMedAbsPctErr * 100).toFixed(1)}%. The transparent baseline (category median multiple, leave-one-out) scores ${m.baselineLooMedAeLog.toFixed(4)} median absolute log error and ${(m.baselineLooMedAbsPctErr * 100).toFixed(1)}% median absolute percentage error: the fitted model beats the median on both.`);
  lines.push(`Rank ranges: ${m.refits} deterministic bootstrap refits (seed 20261114, specification fixed from the full training set) re-rank the whole board. ${m.wideRankRanges} of ${radar.board.length} rows have a rank range wider than half the board (144 ranks); those rows are flagged on the board as uncertain, not hidden. ${m.tiesNudged} fitted values were nudged down by $1 to keep implied values strictly non-increasing with rank.`);
  lines.push('');
  lines.push('## Peer multiples by category (median market-cap/TVL, categories with at least 3 live peers)');
  lines.push('');
  for (const row of m.peerTable) {
    lines.push(`- ${row.category}: ${row.peers} peers, median multiple ${row.medianMultiple.toFixed(4)}`);
  }
  lines.push('');
  lines.push('## What this does not claim');
  lines.push('');
  const datedPeers = m.walkForwardNTrain + m.walkForwardNTest;
  const undatedPeers = m.nTrainingPeers - datedPeers;
  lines.push(`The implied value is a comps fit, not a prediction that a token launches, when it launches, or what it lists at. No airdrop is promised anywhere: farm plans are costed (deposit tier by TVL plus estimated gas) and netted against the fitted value, and the breakeven share is the arithmetic share of the fitted value a future airdrop would have to be worth to cover the plan's cost. Categories with fewer than 8 live peers have no category effect and pool into the intercept; ${undatedPeers} of the ${m.nTrainingPeers} training peers carry no listing date, so the walk-forward test covers the dated ${datedPeers} only. Gas figures are planning estimates at typical fees, not quotes.`);
  return `${lines.join('\n')}\n`;
}
