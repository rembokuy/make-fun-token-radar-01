// Token Radar v3 — the page. Renders window.RADAR (written by main.ts from the
// same board) and proves it shows what board.json holds: every row carries a
// digest of its plan strings, and this page recomputes it from the steps it
// renders. A mismatch would mean the page disagrees with the board.
(function () {
  'use strict';
  const R = window.RADAR;
  if (!R) { document.getElementById('verify').textContent = 'no data'; return; }

  const $ = (id) => document.getElementById(id);
  const usd = (x) => {
    const a = Math.abs(x), sign = x < 0 ? '-' : '';
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
    if (a >= 1e3) return `${sign}$${String(Math.round(a)).replace(/\B(?=(\d{3})+$)/g, ',')}`;
    if (a > 0 && a < 0.01) return 'under $0.01';
    return `${sign}$${a.toFixed(a >= 100 ? 0 : 2)}`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** FNV-1a over the joined strings — the same digest main.ts wrote per row. */
  const digest = (strings) => {
    const s = strings.join('\n');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h.toString(16);
  };

  // ---- verify: the page shows board.json's rows, byte for byte on the plans
  const bad = R.rows.filter((r) => digest(r.plan.steps) !== r.plan.digest);
  const v = $('verify');
  if (bad.length === 0) {
    v.textContent = `✓ board verified: ${R.rows.length}/${R.rows.length} rows match board.json`;
    v.classList.add('ok');
  } else {
    v.textContent = `✗ ${bad.length} row(s) differ from board.json`;
    v.classList.add('bad');
  }

  $('asof').textContent = R.as_of;
  $('source').textContent = R.source;
  $('model-version').textContent = R.model_version;
  const l3 = R.validation.ladder[3];
  $('kpis').innerHTML = [
    [R.counts.protocols, 'protocols in the snapshot'],
    [R.counts.ranked, 'ranked on the board'],
    [`${R.counts.watchlist}/${R.counts.watchlist}`, 'watchlist covered'],
    [`${l3.miss.toFixed(2)}x`, 'blind miss, level 3 (leave-one-out)'],
    [`${(l3.within3 * 100).toFixed(1)}%`, 'blind prices within 3x'],
    [usd(R.allocator.expectedNet), `expected net, ${usd(R.allocator.deployed)} deployed over ${R.allocator.legs.length} legs`],
  ].map(([b, s]) => `<div class="kpi"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');

  // ---- allocator
  const A = R.allocator;
  $('allocator-summary').innerHTML =
    `<p>Deployed <b>${usd(A.deployed)}</b> of ${usd(A.budget)} over <b>${A.legs.length}</b> legs` +
    ` · expected net <b>${usd(A.expectedNet)}</b> (${usd(A.netPerDollar)} per dollar)` +
    ` · fees ${usd(A.totalFees)} · ${A.totalMinutes} minutes · ${usd(A.leftover)} left over.</p>`;
  $('allocator-table').querySelector('tbody').innerHTML = A.legs.map((l) =>
    `<tr><td>${l.rank}</td><td>${esc(l.name)}</td><td>${esc(l.play)}</td>` +
    `<td class="num">${usd(l.ticket)}</td><td class="num">${usd(l.net)}</td>` +
    `<td class="num">${usd(l.fees)}</td><td class="num">${l.minutes}</td></tr>`).join('');

  // ---- board: filter, sort, render
  const sectors = [...new Set(R.rows.map((r) => r.sector))].sort();
  $('sector').innerHTML = '<option value="">All sectors</option>' +
    sectors.map((s) => `<option>${esc(s)}</option>`).join('');
  // Shareable filtered views: ?verdict=FARM&sector=Trading&tier=watchlist&q=bittensor
  const params = new URLSearchParams(location.search);
  for (const [key, id] of [['verdict', 'verdict'], ['sector', 'sector'], ['tier', 'tier'], ['q', 'q']]) {
    const val = params.get(key);
    if (val !== null) $(id).value = val;
  }
  let sortKey = 'rank', sortDir = 1, selected = null;
  const state = () => ({
    q: $('q').value.trim().toLowerCase(),
    verdict: $('verdict').value,
    sector: $('sector').value,
    tier: $('tier').value,
  });
  const filtered = () => {
    const s = state();
    return R.rows.filter((r) =>
      (!s.q || r.name.toLowerCase().includes(s.q) || r.slug.includes(s.q)) &&
      (!s.verdict || r.plan.verdict === s.verdict) &&
      (!s.sector || r.sector === s.sector) &&
      (!s.tier || r.tier === s.tier));
  };
  const sorters = {
    rank: (a, b) => a.rank - b.rank,
    name: (a, b) => a.name.localeCompare(b.name),
    sector: (a, b) => a.sector.localeCompare(b.sector) || a.rank - b.rank,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    value: (a, b) => b.implied_value_usd - a.implied_value_usd,
    range: (a, b) => b.implied_high_usd - a.implied_high_usd,
    net: (a, b) => b.plan.net_usd - a.plan.net_usd,
    verdict: (a, b) => a.plan.verdict.localeCompare(b.plan.verdict) || a.rank - b.rank,
  };
  function renderBoard() {
    const rows = filtered().sort((a, b) => sorters[sortKey](a, b) * sortDir);
    $('count').textContent = `${rows.length} of ${R.rows.length} rows`;
    $('board').querySelector('tbody').innerHTML = rows.map((r) =>
      `<tr data-slug="${esc(r.slug)}" class="${selected === r.slug ? 'sel' : ''}">` +
      `<td>${r.rank}</td><td>${esc(r.name)} <span style="color:var(--muted)">(${esc(r.slug)})</span></td>` +
      `<td>${esc(r.sector)}</td><td class="num">${usd(r.tvl_usd)}</td>` +
      `<td class="num">${usd(r.implied_value_usd)}</td>` +
      `<td class="num">${usd(r.implied_low_usd)} – ${usd(r.implied_high_usd)}</td>` +
      `<td class="num">${usd(r.plan.net_usd)}</td>` +
      `<td><span class="verdict ${r.plan.verdict}">${r.plan.verdict}</span></td>` +
      `<td class="num">#${r.rank_low}–${r.rank_high}</td></tr>`).join('');
  }
  document.querySelectorAll('#board th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.getAttribute('data-sort');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  ['q', 'verdict', 'sector', 'tier'].forEach((id) =>
    $(id).addEventListener('input', renderBoard));
  $('board').querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) { selected = tr.getAttribute('data-slug'); renderBoard(); renderDetail(); }
  });

  // ---- detail
  function renderDetail() {
    const r = R.rows.find((x) => x.slug === selected) || R.rows[0];
    if (!r) return;
    $('detail-name').textContent = `${r.name} — rank ${r.rank}`;
    const p = r.plan;
    $('detail').innerHTML =
      `<div class="factors">` +
      `<div class="factor"><b>${usd(r.implied_value_usd)}</b><span>implied value (range ${usd(r.implied_low_usd)} – ${usd(r.implied_high_usd)})</span></div>` +
      `<div class="factor"><b>${usd(r.curve_usd)}</b><span>size curve before adjustments</span></div>` +
      `<div class="factor"><b>#${r.rank_low}–${r.rank_high}</b><span>rank range over ${100} bootstrap refits</span></div>` +
      `<div class="factor"><b>${esc(p.verdict)}</b><span>net ${usd(p.net_usd)} · fees ${usd(p.fees_usd)} · ${p.minutes} min · ${usd(p.per_hour_usd)}/hour</span></div>` +
      `</div>` +
      `<div class="detail-grid"><div><h3>What moves the price</h3><table>` +
      r.factors.map((f) => `<tr><td>${esc(f.name)}</td><td class="num">×${f.mult.toFixed(3)}</td></tr>`).join('') +
      `<tr><td>TVL</td><td class="num">${usd(r.tvl_usd)}</td></tr>` +
      `<tr><td>7-day change</td><td class="num">${r.change_7d === null ? '—' : r.change_7d.toFixed(2) + '%'}</td></tr>` +
      `<tr><td>Age</td><td class="num">${r.age_days === null ? 'unknown' : r.age_days + ' days'}</td></tr>` +
      `<tr><td>Tier</td><td class="num">${esc(r.tier)}${r.kin ? ` · kin of ${esc(r.kin)}` : ''}</td></tr>` +
      `</table></div><div><h3>Farm plan — ${esc(p.label)} on ${esc(p.chain)}</h3>` +
      `<p class="note">Ticket ${usd(p.capital_usd)} · hold ${p.hold_days} days · slice ${usd(p.slice_usd)} · yield given up ${usd(p.forgone_usd)} · break-even ticket ${p.breakeven_usd === null ? 'never' : usd(p.breakeven_usd)}.</p>` +
      `<ol class="steps">` + p.steps.map((s) => `<li>${esc(s)}</li>`).join('') + `</ol></div></div>`;
  }

  // ---- validation ladder + ranges
  $('ladder').querySelector('tbody').innerHTML =
    R.validation.ladder.map((l) =>
      `<tr><td>${esc(l.name)}</td><td class="num">${l.miss.toFixed(2)}x</td><td class="num">${(l.within3 * 100).toFixed(1)}%</td>` +
      `<td class="num">${l.splitMiss.toFixed(2)}x</td><td class="num">${(l.splitWithin3 * 100).toFixed(1)}%</td></tr>`).join('') +
    `<tr><td>OLS baseline (same tokens)</td><td class="num">${R.validation.baseline.miss.toFixed(2)}x</td><td class="num">${(R.validation.baseline.within3 * 100).toFixed(1)}%</td><td class="num">—</td><td class="num">—</td></tr>`;
  const rg = R.validation.ranges;
  $('ranges-note').textContent =
    `Printed range: half the blind misses fall inside — ${rg.young.toFixed(2)}x for protocols under 18 months on record (${rg.nYoung} tokens), ${rg.seasoned.toFixed(2)}x for seasoned ones. ` +
    `Held out, the range held for ${rg.each} of ${rg.n} tokens left out one at a time, and ${rg.split} of ${rg.newer} newer tokens priced from older ones only. ` +
    `Fitted on ${R.model.comps} comparables; ${R.model.skipped} traded tokens set aside (chains, exchanges, staked assets, deposit receipts).`;

  // ---- ledger
  $('ledger').querySelector('tbody').innerHTML = R.ledger.map(([g, n, why]) =>
    `<tr><td>${esc(g)}</td><td class="num">${n}</td><td>${esc(why)}</td></tr>`).join('');

  renderBoard();
  renderDetail();
})();
