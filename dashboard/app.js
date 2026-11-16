// Token Radar dashboard: renders window.RADAR (written by main.ts) with no
// network. Sortable board, filters, a Live-token tab and a detail view per
// protocol. Deep links: #detail=<slug>, #cat=<category>, #q=<text>, #tab=live.
(function () {
  'use strict';
  var D = window.RADAR;
  var body = document.body;
  if (!D || !D.rows) { body.insertAdjacentHTML('beforeend', '<p style="padding:20px">Radar data failed to load.</p>'); return; }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function full(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(v) {
    if (v == null) return '—';
    var c = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
    return '<span class="' + c + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function age(v) { return v == null ? '—' : v >= 365 ? (v / 365).toFixed(1) + 'y' : v + 'd'; }

  // ---- header stats -------------------------------------------------------
  $('st-watch').textContent = D.watchlist_size;
  $('st-board').textContent = D.board_size;
  $('st-early').textContent = D.early_size;
  $('st-live').textContent = D.live_size;
  $('st-asof').textContent = D.as_of;
  $('ft-asof').textContent = D.as_of;
  $('m-global').textContent = D.global_multiple.toFixed(4);

  // ---- filter controls ----------------------------------------------------
  var cats = [], chains = [];
  D.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { $('f-cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
  chains.forEach(function (c) { $('f-chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });

  var state = { sort: 'rank', dir: 1, lsort: 'mcap_usd', ldir: -1, tab: 'board' };
  function filtered() {
    var q = $('f-q').value.trim().toLowerCase();
    var cat = $('f-cat').value, ch = $('f-chain').value;
    var min = parseFloat($('f-tvl').value) || 0, wo = $('f-watch').checked;
    return D.rows.filter(function (r) {
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (r.tvl_usd < min) return false;
      if (wo && !r.watchlist) return false;
      return true;
    });
  }
  function cmp(a, b, key) {
    var x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string') return x < y ? -1 : x > y ? 1 : 0;
    return x - y;
  }
  function sorted(rows) {
    var k = state.sort, d = state.dir;
    return rows.slice().sort(function (a, b) { return cmp(a, b, k) * d || (a.rank - b.rank); });
  }

  // ---- board render -------------------------------------------------------
  function renderBoard() {
    var rows = sorted(filtered());
    $('count').textContent = rows.length + ' of ' + D.board_size + ' protocols shown · ranked by implied value';
    $('rows').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td><td class="num val">' + full(r.implied_value_usd) + '</td></tr>';
    }).join('') || '<tr><td colspan="8">No protocols match these filters.</td></tr>';
    document.querySelectorAll('#board th').forEach(function (th) {
      th.classList.toggle('on', th.getAttribute('data-sort') === state.sort);
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.getAttribute('data-sort') === state.sort ? (state.dir === 1 ? ' ▲' : ' ▼') : '');
    });
  }

  // ---- live render --------------------------------------------------------
  function renderLive() {
    var rows = D.live.slice().sort(function (a, b) { return cmp(a, b, state.lsort) * state.ldir || (b.mcap_usd - a.mcap_usd); });
    $('live-rows').innerHTML = rows.map(function (r) {
      return '<tr><td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + full(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_tvl == null ? '—' : r.mcap_tvl.toFixed(2) + '×') + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
  }

  // ---- detail view --------------------------------------------------------
  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return false;
    var base = r.tvl_usd * r.peer_multiple;
    var afterGrowth = base * r.growth_multiplier;
    var afterMat = afterGrowth * r.maturity_multiplier;
    var peerNote = r.peer_fallback
      ? 'fewer than 3 live peers in ' + r.peer_category + ' — global median used'
      : r.peer_count + ' live peers in ' + r.peer_category;
    $('d-title').textContent = '#' + r.rank + ' · ' + r.name;
    $('d-body').innerHTML =
      '<div class="facts"><span>Category: ' + esc(r.category || '—') + '</span><span>Chains: ' + esc(r.chains.join(', ') || '—') + '</span>' +
      '<span>TVL ' + full(r.tvl_usd) + '</span><span>7d ' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</span>' +
      '<span>Age ' + (r.age_days == null ? 'unknown (365d assumed)' : r.age_days + ' days') + '</span>' +
      '<span>Listed ' + esc(r.listed_at || '—') + '</span>' + (r.watchlist ? '<span>On the watchlist</span>' : '<span>Early find below the $50M floor</span>') + '</div>' +
      '<h3>Model breakdown — implied value ' + full(r.implied_value_usd) + '</h3>' +
      '<table class="math"><tbody>' +
      '<tr><td>TVL × peer multiple (' + r.peer_multiple.toFixed(4) + '×, ' + esc(peerNote) + ')</td><td class="num">' + full(r.tvl_usd) + ' × ' + r.peer_multiple.toFixed(4) + ' = ' + full(base) + '</td></tr>' +
      '<tr><td>× growth (' + r.growth_multiplier.toFixed(4) + '× from 7d change)</td><td class="num">' + full(afterGrowth) + '</td></tr>' +
      '<tr><td>× maturity (' + r.maturity_multiplier.toFixed(4) + '× from age)</td><td class="num">' + full(afterMat) + '</td></tr>' +
      '<tr><td>× chain (' + r.chain_multiplier.toFixed(2) + '× from ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td class="num">' + full(afterMat * r.chain_multiplier) + '</td></tr>' +
      '<tr class="total"><td>Implied value (rounded)</td><td class="num">' + full(r.implied_value_usd) + '</td></tr>' +
      '</tbody></table>' +
      '<h3>How to farm it — 6 steps</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">Data as of ' + esc(D.as_of) + ' · source DefiLlama · ' + esc(r.name) + ' records no token in this snapshot. Implied value is this radar&rsquo;s own claim.</p>';
    $('detail').hidden = false;
    return true;
  }
  function closeDetail() { $('detail').hidden = true; $('d-title').textContent = ''; $('d-body').innerHTML = ''; }

  // ---- peer table ---------------------------------------------------------
  $('peer-rows').innerHTML = D.peer_multiples.map(function (p) {
    return '<tr><td>' + esc(p.category) + '</td><td class="num">' + p.multiple.toFixed(4) + '×</td><td class="num">' + p.peers + '</td></tr>';
  }).join('');

  // ---- events -------------------------------------------------------------
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' || k === 'name' || k === 'category' || k === 'chains' ? 1 : -1; }
      renderBoard();
    });
  });
  document.querySelectorAll('#live th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-lsort');
      if (state.lsort === k) state.ldir = -state.ldir; else { state.lsort = k; state.ldir = k === 'name' || k === 'category' || k === 'chains' ? 1 : -1; }
      renderLive();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    if (openDetail(tr.getAttribute('data-slug'))) { location.hash = 'detail=' + tr.getAttribute('data-slug'); $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  ['f-q', 'f-cat', 'f-chain', 'f-tvl', 'f-watch'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  $('f-reset').addEventListener('click', function () {
    $('f-q').value = ''; $('f-cat').value = ''; $('f-chain').value = ''; $('f-tvl').value = '0'; $('f-watch').checked = false;
    renderBoard();
  });
  function setTab(tab) {
    state.tab = tab;
    $('tab-board').classList.toggle('on', tab === 'board');
    $('tab-live').classList.toggle('on', tab === 'live');
    $('view-board').hidden = tab !== 'board';
    $('view-live').hidden = tab !== 'live';
    if (tab === 'live') renderLive();
  }
  $('tab-board').addEventListener('click', function () { setTab('board'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });
  $('d-close').addEventListener('click', function () { closeDetail(); history.replaceState(null, '', location.pathname + location.search); });

  // ---- deep links ---------------------------------------------------------
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('tab') === 'live') setTab('live');
  if (hash.get('cat')) $('f-cat').value = hash.get('cat');
  if (hash.get('q')) $('f-q').value = hash.get('q');
  if (hash.get('watch') === '1') $('f-watch').checked = true;
  renderBoard();
  if (hash.get('detail') && openDetail(hash.get('detail'))) $('detail').scrollIntoView({ block: 'start' });

  // ---- scripted self-test (?selftest=1): sorting, filters, detail --------
  var params = new URLSearchParams(location.search);
  if (params.get('selftest') === '1') {
    var out = [];
    function check(name, ok) { out.push((ok ? 'PASS ' : 'FAIL ') + name); }
    check('rows=200', D.rows.length === 200);
    check('live=24', D.live.length === 24);
    check('watchlist=40', D.watchlist_size === 40);
    var srt = sorted(D.rows.slice());
    check('sorted-by-implied-desc', srt.every(function (r, i) { return i === 0 || r.implied_value_usd <= srt[i - 1].implied_value_usd; }));
    $('f-cat').value = 'Lending'; renderBoard();
    var n1 = document.querySelectorAll('#rows tr[data-slug]').length;
    check('category-filter-narrows', n1 > 0 && n1 < 200);
    $('f-cat').value = ''; $('f-q').value = D.rows[0].name.slice(0, 4); renderBoard();
    check('search-finds-rows', document.querySelectorAll('#rows tr[data-slug]').length >= 1);
    $('f-q').value = ''; renderBoard();
    var top = D.rows[0].slug;
    check('detail-opens', openDetail(top) && !$('detail').hidden && $('d-body').textContent.indexOf('Implied value') >= 0);
    check('detail-math', $('d-body').textContent.indexOf('peer multiple') >= 0);
    setTab('live'); check('live-tab-renders', document.querySelectorAll('#live-rows tr').length === 24);
    setTab('board');
    var fails = out.filter(function (l) { return l.indexOf('FAIL') === 0; }).length;
    document.title = 'SELFTEST ' + (fails === 0 ? 'PASS' : 'FAIL') + ' ' + (out.length - fails) + '/' + out.length;
    var div = document.createElement('div');
    div.id = 'selftest'; div.textContent = out.join(' | ');
    body.appendChild(div);
  }
})();
