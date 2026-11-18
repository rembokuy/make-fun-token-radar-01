// Token Radar (radar-3-fitted): the page. Renders window.TOKEN_RADAR (data.js) into
// the KPI strip, the sortable/filterable board, the detail view, the live view, the
// exclusion list and the model section. No network: every number comes from data.js.
(function () {
  const R = window.TOKEN_RADAR;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const compact = (n) => {
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  };
  const pct = (n) => (n * 100).toFixed(1) + '%';

  // Accounting line + KPI strip (the numbers the screenshots must show).
  const a = R.accounting, m = R.metrics;
  $('accounting').textContent =
    a.total + ' protocols accounted for: ' + a.ranked + ' ranked + ' + a.live + ' live-token (' +
    a.liveNonCex + ' non-CEX + ' + a.liveCex + ' CEX) + ' + a.excluded + ' excluded. Watchlist ' +
    a.watchlistCovered + '/' + a.watchlist + ' covered.';
  const kpis = [
    [a.total + '/' + a.total, 'protocols accounted for'],
    [String(a.ranked), 'pre-token protocols ranked'],
    [a.watchlistCovered + '/' + a.watchlist, 'watchlist covered'],
    [m.r2.toFixed(3), 'fitted model R² (' + m.nTrainingPeers + ' live peers)'],
    [m.walkForwardMedAeLog.toFixed(3), 'walk-forward median abs log error'],
    [m.looMedAeLog.toFixed(3), 'leave-one-out median abs log error'],
    [m.globalMultiple.toFixed(4), 'global median multiple (mcap/TVL)'],
    [usd(m.medianFarmCostUsd), 'median farm cost (deposit + gas)'],
  ];
  $('kpis').innerHTML = kpis.map(([b, s]) => '<div class="kpi"><b>' + b + '</b><span>' + esc(s) + '</span></div>').join('');

  // Category filter options, most rows first.
  const catCount = {};
  R.board.forEach((r) => { catCount[r.category || 'Uncategorised'] = (catCount[r.category || 'Uncategorised'] || 0) + 1; });
  Object.keys(catCount).sort((x, y) => catCount[y] - catCount[x]).forEach((c) => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c + ' (' + catCount[c] + ')';
    $('cat').appendChild(o);
  });

  // Board state: filters + sorting.
  const params = new URLSearchParams(location.search);
  let sortKey = 'rank', sortDir = 1;
  function currentRows() {
    const q = $('q').value.trim().toLowerCase();
    const cat = $('cat').value, minTvl = +$('minTvl').value;
    let rows = R.board.filter((r) => {
      if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
      if (cat && (r.category || 'Uncategorised') !== cat) return false;
      if (r.tvl_usd < minTvl) return false;
      if ($('watchOnly').checked && !r.watchlist) return false;
      if ($('wideOnly').checked && !r.rank_range_wide) return false;
      return true;
    });
    const key = sortKey;
    rows = rows.slice().sort((x, y) => {
      const vx = x[key], vy = y[key];
      const c = typeof vx === 'string' ? vx.localeCompare(vy) : vx - vy;
      return c * sortDir;
    });
    return rows;
  }
  function renderBoard() {
    const rows = currentRows();
    $('rows').innerHTML = rows.map((r) => {
      const range = r.rank_lo === r.rank_hi ? '#' + r.rank_lo : '#' + r.rank_lo + '–' + r.rank_hi;
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td><td><b>' + esc(r.name) + '</b>' +
        (r.watchlist ? '<span class="badge">watchlist</span>' : '') +
        (r.wrapped_product ? '<span class="flag" title="Wrapped, staked or bridged product"> ⚑wrapped</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + compact(r.tvl_usd) + '</td><td class="num"><b>' + compact(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + compact(r.median_value_usd) + '</td>' +
        '<td class="num' + (r.rank_range_wide ? ' wide' : '') + '">' + range + '</td>' +
        '<td class="num">' + usd(r.farm_cost_usd) + '</td><td class="num">' + r.breakeven_share_pct.toFixed(3) + '%</td></tr>';
    }).join('');
    $('count').textContent = rows.length + ' of ' + R.board.length + ' ranked protocols shown.';
    document.querySelectorAll('#rows tr').forEach((tr) => {
      tr.addEventListener('click', () => showDetail(tr.getAttribute('data-slug')));
    });
  }
  document.querySelectorAll('#board th').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.getAttribute('data-sort');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  ['q', 'cat', 'minTvl', 'watchOnly', 'wideOnly'].forEach((id) => {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  $('reset').addEventListener('click', () => {
    $('q').value = ''; $('cat').value = ''; $('minTvl').value = '0';
    $('watchOnly').checked = false; $('wideOnly').checked = false;
    sortKey = 'rank'; sortDir = 1; renderBoard();
  });

  // Detail view: one protocol, its fitted vs median value, its rank range, its 8-step plan.
  // Chains are shortened to the first three (some protocols list a dozen).
  const chainList = (chains) => chains.length <= 3 ? chains.join(', ') : chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3) + ' more';
  function showDetail(slug) {
    const r = R.board.find((x) => x.slug === slug);
    if (!r) return;
    const wideNote = r.rank_range_wide
      ? ' <b class="wide">Wide rank range — this rank is uncertain: across 200 refits the row lands anywhere from #' + r.rank_lo + ' to #' + r.rank_hi + '.</b>'
      : ' Rank range across 200 refits: #' + r.rank_lo + '–' + r.rank_hi + '.';
    const steps = r.farm_steps.map((s, i) => {
      if (i === r.farm_steps.length - 1) return '<p class="net">' + esc(s) + '</p>';
      return '<li>' + esc(s) + '</li>';
    });
    const body = steps.slice(0, -1).join('');
    $('detail').innerHTML =
      '<button type="button" id="closeDetail">← Back to the board</button>' +
      '<h3>' + esc(r.name) + ' <span class="meta">#' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(chainList(r.chains)) + '</span></h3>' +
      '<p class="meta">TVL ' + usd(r.tvl_usd) + ' · Implied value (fitted) <b>' + usd(r.implied_value_usd) + '</b> · Median comp ' + usd(r.median_value_usd) +
      ' · Farm cost ' + usd(r.farm_cost_usd) + ' (' + usd(r.deposit_usd) + ' deposit) · Breakeven share ' + r.breakeven_share_pct.toFixed(3) + '%.' + wideNote +
      (r.wrapped_product ? ' <span class="flag">Wrapped, staked or bridged product — no launch of its own; the plan prices the underlying exposure.</span>' : '') + '</p>' +
      '<ol>' + body + '</ol>' + steps[steps.length - 1];
    $('detail').hidden = false;
    $('closeDetail').addEventListener('click', () => { $('detail').hidden = true; });
    $('detail').scrollIntoView();
  }

  // Model section: the formula, the measured fit, the validation, the limits.
  const peerLines = m.peerTable.slice(0, 12).map((p) => p.category + ' (' + p.peers + ' peers, ×' + p.medianMultiple.toFixed(2) + ')').join('; ');
  $('modelBody').innerHTML =
    '<p><code>log(market cap) ~ log(TVL) + log(TVL)² + age + age-missing + log(1 + chains) + 7d change + category effects</code> — ordinary least squares on ' + m.nTrainingPeers + ' live-token peers with a market cap and a TVL. Implied value = exp(predicted log market cap).</p>' +
    '<p>Fit: R² ' + m.r2.toFixed(4) + ' · RMSE (log) ' + m.rmseLog.toFixed(4) + ' · median absolute log error ' + m.medAeLog.toFixed(4) + ' · median absolute percentage error ' + pct(m.medAbsPctErr) + '.</p>' +
    '<p>Walk-forward (fit before ' + m.walkForwardCutoff + ', ' + m.walkForwardNTrain + ' peers; tested after, ' + m.walkForwardNTest + ' peers): median absolute log error ' + m.walkForwardMedAeLog.toFixed(4) + ' · median absolute percentage error ' + pct(m.walkForwardMedAbsPctErr) + '.</p>' +
    '<p>Leave-one-out (' + m.nTrainingPeers + ' refits): median absolute log error ' + m.looMedAeLog.toFixed(4) + ' · median absolute percentage error ' + pct(m.looMedAbsPctErr) + '. The median-multiple baseline scores ' + m.baselineLooMedAeLog.toFixed(4) + ' on the same check — the fit beats the median.</p>' +
    '<p>Rank ranges come from ' + m.refits + ' bootstrap refits; ' + m.wideRankRanges + ' rows have a range wider than half the board (144 ranks) and are flagged, not hidden.</p>' +
    '<p>Peer multiples (median mcap/TVL, largest categories): ' + esc(peerLines) + '. Global median multiple ' + m.globalMultiple.toFixed(4) + '.</p>' +
    '<p><b>Limits, stated plainly:</b> the implied value is a comps fit, not a prediction that a token launches. No airdrop is promised; the breakeven share is arithmetic (plan cost ÷ fitted value). Categories with fewer than 8 live peers have no category effect. Gas figures are planning estimates, not quotes.</p>';

  // Live view + exclusion list.
  $('liveRows').innerHTML = R.live.map((p) =>
    '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') + '</td><td>' + esc(p.chains.slice(0, 2).join(', ')) + '</td>' +
    '<td class="num">' + compact(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd === null ? '—' : compact(p.mcap_usd)) + '</td>' +
    '<td class="num">' + (p.multiple === null ? '—' : '×' + p.multiple.toFixed(2)) + '</td>' +
    '<td class="num">' + (p.change_7d === null ? '—' : (p.change_7d > 0 ? '+' : '') + p.change_7d.toFixed(1) + '%') + '</td></tr>'
  ).join('');
  $('excludedRows').innerHTML = R.excluded.map((p) =>
    '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') + '</td><td class="num">' + compact(p.tvl_usd) + '</td><td>' + esc(p.reason) + '</td></tr>'
  ).join('');

  // Deep links for the screenshots: ?view=detail&slug=… or ?view=filtered&cat=…&q=…
  if (params.get('cat')) { $('cat').value = params.get('cat'); }
  if (params.get('q')) { $('q').value = params.get('q'); }
  if (params.get('watch') === '1') { $('watchOnly').checked = true; }
  renderBoard();
  if (params.get('view') === 'detail' && params.get('slug')) showDetail(params.get('slug'));
})();
