/* AssureX — ML Analytics Workspace.
   Reads the claims the Analytics page already loaded (no extra Firestore queries)
   and renders any number of charts. Nothing is invented: a chart with no real
   data says so. Layout is a UI preference kept in localStorage only. */
(function () {
  'use strict';
  var KEY = 'assurexMlLayout', P = ['#7a8cff', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171'];
  var rows = [], charts = [], filt = { range: 'all', product: '', status: '', minConf: 0 }, updated = null, seq = 0, root;
  var DIMS = { date: 'Month', status: 'Claim status', product: 'Product', damage: 'Damage category', decision: 'Decision' };
  var TYPES = { bar: 'Bar', line: 'Line', area: 'Area', donut: 'Donut', hist: 'Confidence distribution', compare: 'Model comparison' };
  var PRESETS = {
    'Claims overview': [['bar', 'status', 'count'], ['line', 'date', 'count'], ['bar', 'product', 'count'], ['donut', 'decision', 'count']],
    'ML overview': [['hist', '', 'count'], ['compare', '', 'conf'], ['line', 'date', 'conf']],
    'Executive overview': [['line', 'date', 'count'], ['donut', 'status', 'count'], ['hist', '', 'count'], ['compare', '', 'conf'], ['bar', 'damage', 'count']]
  };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var debounce = function (f, t) { var h; return function () { clearTimeout(h); h = setTimeout(f, t); }; };

  /* ---------- data (real fields only) ---------- */
  function norm(c) {
    var ops = window.AssureXOperations, cmp = ops && ops.compareModels ? ops.compareModels(c) : null;
    var py = cmp && cmp.python && isFinite(cmp.python.confidence) ? cmp.python.confidence : null;
    var tm = cmp && cmp.teachableMachine && isFinite(cmp.teachableMachine.confidence) ? cmp.teachableMachine.confidence : null;
    var t = c.createdAt, d = t ? (t.toDate ? t.toDate() : new Date(t)) : null;
    return {
      d: d && !isNaN(d) ? d : null,
      status: String(c.status || c.claimStatus || c.validationStatus || 'Unknown'),
      product: String(c.productName || (c.product && c.product.name) || c.productId || 'Unspecified'),
      damage: String(c.damageCategory || c.damage || c.faultDescription || 'Unspecified').slice(0, 40),
      decision: String(c.finalDecision || c.reviewDecision || c.predictedDecision || c.prediction || 'Pending'),
      py: py, tm: tm, cf: py != null && tm != null ? Math.max(py, tm) : (py != null ? py : tm)
    };
  }
  function view() {
    var now = Date.now(), y = new Date().getFullYear(), days = { '7': 7, '30': 30, '90': 90 };
    return rows.filter(function (r) {
      if (filt.range !== 'all') {
        if (!r.d) return false;
        if (filt.range === 'year') { if (r.d.getFullYear() !== y) return false; }
        else if ((now - r.d) / 864e5 > days[filt.range]) return false;
      }
      if (filt.product && r.product !== filt.product) return false;
      if (filt.status && r.status !== filt.status) return false;
      if (filt.minConf && !(r.cf != null && r.cf * 100 >= filt.minConf)) return false;
      return true;
    });
  }
  function group(d, dim, met) {
    var m = {};
    d.forEach(function (r) {
      var k = dim === 'date' ? (r.d ? r.d.toISOString().slice(0, 7) : null) : r[dim];
      if (k == null) return;
      var g = m[k] || (m[k] = { n: 0, s: 0, c: 0 }); g.n++;
      if (r.cf != null) { g.s += r.cf; g.c++; }
    });
    var out = Object.keys(m).map(function (k) { var g = m[k]; return { k: k, v: met === 'conf' ? (g.c ? g.s / g.c * 100 : null) : g.n }; })
      .filter(function (x) { return x.v != null; });
    return dim === 'date' ? out.sort(function (a, b) { return a.k < b.k ? -1 : 1; }) : out.sort(function (a, b) { return b.v - a.v; }).slice(0, 12);
  }
  function metOf(c) { return c.type === 'compare' ? 'conf' : c.type === 'hist' ? 'count' : c.met; }
  function dataOf(c, d) {
    if (c.type === 'hist') {
      var b = []; for (var i = 0; i < 10; i++) b.push({ k: i * 10 + '-' + (i + 1) * 10 + '%', v: 0 });
      var n = 0; d.forEach(function (r) { if (r.cf != null) { b[Math.min(9, Math.floor(r.cf * 10))].v++; n++; } });
      return n ? b : [];
    }
    if (c.type === 'compare') {
      var a = d.filter(function (r) { return r.py != null; }), t = d.filter(function (r) { return r.tm != null; });
      var av = function (x, f) { return x.reduce(function (s, r) { return s + r[f]; }, 0) / x.length * 100; };
      return a.length && t.length ? [{ k: 'Python', v: av(a, 'py'), n: a.length }, { k: 'Teachable M.', v: av(t, 'tm'), n: t.length }] : [];
    }
    return group(d, c.dim, c.met);
  }

  /* ---------- SVG renderers ---------- */
  var fmt = function (v, m) { return m === 'conf' ? v.toFixed(0) + '%' : String(Math.round(v)); };
  var svg = function (inner, label) {
    return '<svg viewBox="0 0 400 200" role="img" aria-label="' + esc(label) + '"><defs><linearGradient id="mlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a8cff"/><stop offset="1" stop-color="#5b6cff" stop-opacity=".45"/></linearGradient></defs>' + inner + '</svg>';
  };
  function bars(d, m, label) {
    var W = 400, H = 200, pb = 34, mx = Math.max.apply(null, d.map(function (x) { return x.v; })) || 1, bw = (W - 16) / d.length;
    return svg(d.map(function (x, i) {
      var h = (H - pb - 18) * x.v / mx, bx = 8 + i * bw + bw * .15, cx = bx + bw * .35, k = x.k.length > 9 ? x.k.slice(0, 8) + '…' : x.k;
      return '<g><title>' + esc(x.k) + ': ' + fmt(x.v, m) + (x.n ? ' (n=' + x.n + ')' : '') + '</title><rect x="' + bx + '" y="' + (H - pb - h) + '" width="' + bw * .7 + '" height="' + h + '" rx="5" fill="url(#mlg)"/><text x="' + cx + '" y="' + (H - pb - h - 4) + '" text-anchor="middle" class="v">' + fmt(x.v, m) + '</text><text x="' + cx + '" y="' + (H - 14) + '" text-anchor="middle" class="l">' + esc(k) + '</text></g>';
    }).join(''), label);
  }
  function line(d, m, area, label) {
    if (d.length < 2) return null;
    var W = 400, H = 200, p = 24, mx = Math.max.apply(null, d.map(function (x) { return x.v; })) || 1;
    var pts = d.map(function (x, i) { return [p + i * (W - 2 * p) / (d.length - 1), H - 34 - (H - 64) * x.v / mx]; });
    var path = pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
    return svg((area ? '<path d="' + path + 'L' + pts[pts.length - 1][0] + ' ' + (H - 34) + 'L' + p + ' ' + (H - 34) + 'Z" fill="url(#mlg)" opacity=".7"/>' : '') +
      '<path d="' + path + '" fill="none" stroke="#7a8cff" stroke-width="2.5" stroke-linejoin="round"/>' +
      pts.map(function (q, i) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4.5" fill="#22d3ee"><title>' + esc(d[i].k) + ': ' + fmt(d[i].v, m) + '</title></circle>'; }).join('') +
      '<text x="' + p + '" y="192" class="l">' + esc(d[0].k) + '</text><text x="' + (W - p) + '" y="192" text-anchor="end" class="l">' + esc(d[d.length - 1].k) + '</text>', label);
  }
  function donut(d, label) {
    if (d.length < 2 || d.length > 6) return null;
    var tot = d.reduce(function (a, x) { return a + x.v; }, 0), a = -Math.PI / 2, R = 72, r = 46, cx = 100, cy = 100, out = '';
    var pt = function (t, q) { return (cx + q * Math.cos(t)).toFixed(1) + ',' + (cy + q * Math.sin(t)).toFixed(1); };
    d.forEach(function (x, i) {
      var b = a + x.v / tot * 2 * Math.PI - .001, l = b - a > Math.PI ? 1 : 0;
      out += '<path d="M' + pt(a, R) + ' A' + R + ' ' + R + ' 0 ' + l + ' 1 ' + pt(b, R) + ' L' + pt(b, r) + ' A' + r + ' ' + r + ' 0 ' + l + ' 0 ' + pt(a, r) + 'Z" fill="' + P[i] + '"><title>' + esc(x.k) + ': ' + x.v + ' (' + Math.round(x.v * 100 / tot) + '%)</title></path>';
      a = b + .001;
    });
    out += '<text x="100" y="105" text-anchor="middle" class="v" style="font-size:16px">' + tot + '</text>';
    out += d.map(function (x, i) { return '<rect x="200" y="' + (34 + i * 22) + '" width="11" height="11" rx="3" fill="' + P[i] + '"/><text x="217" y="' + (43 + i * 22) + '" class="l">' + esc(x.k.slice(0, 18)) + ' · ' + Math.round(x.v * 100 / tot) + '%</text>'; }).join('');
    return svg(out, label);
  }
  function draw(c, d) {
    if (!rows.length) return '<p class="mlempty">No claims loaded yet.</p>';
    if (!d.length) return '<p class="mlempty">No data available for the selected filters.</p>';
    var dat = dataOf(c, d), m = metOf(c), html = null;
    if (!dat.length) return '<p class="mlempty">' + (c.type === 'hist' || c.type === 'compare' || c.met === 'conf' ? 'No model confidence values are stored on these claims.' : 'Not enough data available for this visualization.') + '</p>';
    if (c.type === 'bar' || c.type === 'hist' || c.type === 'compare') html = bars(dat, m, c.title);
    else if (c.type === 'line' || c.type === 'area') html = line(dat, m, c.type === 'area', c.title);
    else if (c.type === 'donut') html = donut(dat, c.title);
    if (!html) return '<p class="mlempty">' + (c.type === 'donut' ? 'A donut needs 2–6 categories. Use a bar chart for this field.' : 'At least two data points are needed for a trend.') + '</p>';
    if (c.type === 'compare') html += '<p class="mlnote">Python n=' + dat[0].n + ' · Teachable Machine n=' + dat[1].n + ' · shown side by side, not ranked</p>';
    return html;
  }

  /* ---------- workspace UI ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(charts.map(function (c) { return { type: c.type, dim: c.dim, met: c.met, title: c.title }; }))); } catch (e) {} }
  function title(t, dim, met) { return t === 'hist' ? 'AI confidence distribution' : t === 'compare' ? 'Model comparison — average confidence' : (met === 'conf' ? 'Avg AI confidence' : 'Claims') + ' by ' + DIMS[dim].toLowerCase(); }
  function addChart(t, dim, met, ttl) { charts.push({ id: ++seq, type: t, dim: dim, met: met, title: ttl || title(t, dim, met) }); }
  function paint(c) { var el = $('[data-id="' + c.id + '"] .mlbody', root); if (el && el._on) el.innerHTML = draw(c, view()); }
  var lazy = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { var b = e.target; lazy.unobserve(b); b._on = 1; var c = charts.filter(function (x) { return x.id == b.parentNode.dataset.id; })[0]; if (c) b.innerHTML = draw(c, view()); } });
  }, { rootMargin: '200px' }) : null;

  function renderAll() {
    var g = $('.mlgrid', root); g.innerHTML = '';
    if (!charts.length) g.innerHTML = '<p class="mlempty">No visualizations yet. Choose a preset or add one.</p>';
    charts.forEach(function (c) {
      var a = document.createElement('article'); a.className = 'mlcard' + (c.type === 'line' || c.type === 'area' ? ' wide' : ''); a.dataset.id = c.id;
      a.innerHTML = '<header><h3>' + esc(c.title) + '</h3><div><button data-a="l" aria-label="Move earlier">‹</button><button data-a="r" aria-label="Move later">›</button><button data-a="x" aria-label="Expand chart">↗</button><button data-a="csv">CSV</button><button data-a="rm" aria-label="Remove chart">×</button></div></header><div class="mlbody"><div class="mlskel"></div></div>';
      g.appendChild(a); var b = $('.mlbody', a);
      if (lazy) lazy.observe(b); else { b._on = 1; b.innerHTML = draw(c, view()); }
    });
    save();
  }
  var refresh = debounce(function () { charts.forEach(paint); $('#mlCount', root).textContent = view().length + ' of ' + rows.length + ' claims'; }, 150);
  function csv(c) {
    var d = dataOf(c, view()); if (!d.length) return;
    var t = 'Label,Value\r\n' + d.map(function (x) { return '"' + String(x.k).replace(/"/g, '""') + '",' + x.v; }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'assurex-' + c.type + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function overlay(html) {
    var o = document.createElement('div'); o.className = 'mlov'; o.innerHTML = '<div class="mlpanel" role="dialog" aria-modal="true">' + html + '</div>'; document.body.appendChild(o);
    var close = function () { document.removeEventListener('keydown', esch); o.remove(); }, esch = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esch); o.addEventListener('click', function (e) { if (e.target === o || e.target.dataset.close) close(); });
    if (window.gsap) gsap.from($('.mlpanel', o), { y: 28, scale: .96, autoAlpha: 0, duration: .3, ease: 'power3.out' });
    return { el: o, close: close };
  }
  function expand(c) {
    overlay('<header><h3>' + esc(c.title) + '</h3><button data-close="1" aria-label="Close">×</button></header><div class="mlbig">' + draw(c, view()) + '</div><footer><span>' + view().length + ' claims in current filters</span><button class="mlbtn" data-c>Export CSV</button></footer>')
      .el.querySelector('[data-c]').onclick = function () { csv(c); };
  }
  function addDialog() {
    var hasDate = rows.some(function (r) { return r.d; }), hasConf = rows.some(function (r) { return r.cf != null; });
    var o = overlay('<header><h3>Add visualization</h3><button data-close="1" aria-label="Close">×</button></header><div class="mlform"><label>Chart type<select id="mlT">' +
      Object.keys(TYPES).filter(function (k) { return hasConf || (k !== 'hist' && k !== 'compare'); }).map(function (k) { return '<option value="' + k + '">' + TYPES[k] + '</option>'; }).join('') +
      '</select></label><label>Group by<select id="mlD">' + Object.keys(DIMS).filter(function (k) { return k !== 'date' || hasDate; }).map(function (k) { return '<option value="' + k + '">' + DIMS[k] + '</option>'; }).join('') +
      '</select></label><label>Metric<select id="mlM"><option value="count">Claim count</option>' + (hasConf ? '<option value="conf">Average AI confidence</option>' : '') + '</select></label><button class="mlbtn" id="mlOk">Create visualization</button></div>');
    var T = $('#mlT', o.el), D = $('#mlD', o.el);
    T.onchange = function () { var t = T.value; D.disabled = t === 'hist' || t === 'compare'; if ((t === 'line' || t === 'area') && hasDate) D.value = 'date'; };
    $('#mlOk', o.el).onclick = function () { addChart(T.value, D.value, $('#mlM', o.el).value); o.close(); renderAll(); };
  }
  function loadPreset(name) { charts = []; PRESETS[name].forEach(function (p) { if ((p[0] !== 'hist' && p[0] !== 'compare' && p[2] !== 'conf') || rows.some(function (r) { return r.cf != null; })) addChart(p[0], p[1] || 'status', p[2]); }); renderAll(); }
  function fillFilters() {
    var uniq = function (f) { return Array.from(new Set(rows.map(function (r) { return r[f]; }))).sort(); };
    var opt = function (a) { return '<option value="">All</option>' + a.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join(''); };
    $('#mlP', root).innerHTML = opt(uniq('product')); $('#mlS', root).innerHTML = opt(uniq('status'));
  }
  function stamp() { $('#mlUp', root).textContent = updated ? 'Updated ' + updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…'; }
  function onData() {
    rows = (window.AssureXClaims || []).map(norm); updated = new Date(); fillFilters(); stamp();
    if (!charts.length) { var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} if (saved && saved.length) saved.forEach(function (s) { addChart(s.type, s.dim, s.met, s.title); }); else loadPreset('Claims overview'); renderAll(); }
    else charts.forEach(paint);
    $('#mlCount', root).textContent = view().length + ' of ' + rows.length + ' claims';
  }

  function mount() {
    var host = $('[data-page="analytics"]'); if (!host) return;
    var st = document.createElement('style');
    st.textContent = '#mlWorkspace{margin-top:28px}#mlWorkspace h2{margin:0 0 4px}.mlbar{position:sticky;top:8px;z-index:20;display:flex;flex-wrap:wrap;gap:10px;align-items:end;padding:12px 14px;margin:14px 0;border-radius:18px;background:var(--surface-solid,#0c1324);border:1px solid var(--border,rgba(255,255,255,.1))}.mlbar label{display:grid;gap:4px;font-size:11px;color:var(--text-2)}.mlbar select,.mlform select{padding:8px 10px;border-radius:10px;min-width:110px}.mlbtn{border:0;border-radius:12px;padding:10px 16px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(120deg,#5b6cff,#8a5cff)}.mlbtn.ghost{background:transparent;border:1px solid var(--border-strong,rgba(255,255,255,.18));color:var(--text)}.mlmeta{margin-left:auto;font-size:12px;color:var(--text-2);text-align:right}' +
      '.mlgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:16px}.mlcard{border-radius:20px;padding:16px;background:var(--surface-solid,#0c1324);border:1px solid var(--border,rgba(255,255,255,.1));content-visibility:auto;contain-intrinsic-size:280px}.mlcard.wide{grid-column:span 2}@media(max-width:760px){.mlcard.wide{grid-column:auto}}.mlcard header,.mlpanel header,.mlpanel footer{display:flex;justify-content:space-between;gap:10px;align-items:center}.mlcard h3,.mlpanel h3{margin:0;font-size:14px}.mlcard header div{display:flex;gap:4px}.mlcard button,.mlpanel header button{border:1px solid var(--border,rgba(255,255,255,.12));background:transparent;color:var(--text-2);border-radius:8px;min-width:28px;height:28px;cursor:pointer;font-size:12px}.mlcard button:hover{color:var(--text);border-color:#7a8cff}.mlbody svg{width:100%;height:auto;margin-top:10px}.mlbody .v{font:700 10px Inter,sans-serif;fill:var(--text)}.mlbody .l{font:10px Inter,sans-serif;fill:var(--text-2)}.mlempty,.mlnote{color:var(--text-2);font-size:13px;padding:34px 8px;text-align:center}.mlnote{padding:0;font-size:11px}.mlskel{height:170px;margin-top:10px;border-radius:12px;background:linear-gradient(90deg,rgba(122,140,255,.08),rgba(122,140,255,.2),rgba(122,140,255,.08));background-size:200% 100%;animation:mlsk 1.2s linear infinite}@keyframes mlsk{to{background-position:-200% 0}}' +
      '.mlov{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:20px;background:rgba(3,6,16,.6)}@media(min-width:901px){.mlov{left:302px}}.mlpanel{width:min(920px,100%);max-height:90vh;overflow:auto;padding:22px;border-radius:24px;background:var(--surface-solid,#0c1324);border:1px solid var(--border-strong,rgba(255,255,255,.16));box-shadow:0 40px 90px -24px rgba(0,0,0,.7)}.mlbig{padding:10px 0}.mlpanel footer{margin-top:10px;color:var(--text-2);font-size:12px}.mlform{display:grid;gap:14px;margin-top:16px}.mlform label{display:grid;gap:6px;font-size:12px}';
    document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'mlWorkspace';
    root.innerHTML = '<h2>ML Intelligence</h2><p class="mlmeta" style="text-align:left;margin:0">Charts are built only from claims already stored in AssureX.</p>' +
      '<div class="mlbar" role="toolbar" aria-label="Analytics filters"><label>Date<select id="mlR"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="year">This year</option></select></label>' +
      '<label>Product<select id="mlP"></select></label><label>Status<select id="mlS"></select></label><label>Min. confidence<select id="mlC"><option value="0">Any</option><option value="50">50%+</option><option value="70">70%+</option><option value="90">90%+</option></select></label>' +
      '<button class="mlbtn ghost" id="mlReset">Reset</button><label>Preset<select id="mlPre"><option value="">Choose…</option>' + Object.keys(PRESETS).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label>' +
      '<button class="mlbtn" id="mlAdd">+ Add visualization</button><div class="mlmeta"><div id="mlCount"></div><span id="mlUp"></span> <button class="mlbtn ghost" id="mlRef" style="padding:4px 10px">↻ Refresh</button></div></div><div class="mlgrid" aria-live="polite"></div>';
    host.appendChild(root); stamp();
    var on = function (id, ev, f) { $(id, root).addEventListener(ev, f); };
    on('#mlR', 'change', function (e) { filt.range = e.target.value; refresh(); });
    on('#mlP', 'change', function (e) { filt.product = e.target.value; refresh(); });
    on('#mlS', 'change', function (e) { filt.status = e.target.value; refresh(); });
    on('#mlC', 'change', function (e) { filt.minConf = +e.target.value; refresh(); });
    on('#mlReset', 'click', function () { filt = { range: 'all', product: '', status: '', minConf: 0 }; ['#mlR', '#mlP', '#mlS', '#mlC'].forEach(function (s) { $(s, root).selectedIndex = 0; }); refresh(); });
    on('#mlPre', 'change', function (e) { if (e.target.value) loadPreset(e.target.value); e.target.selectedIndex = 0; });
    on('#mlAdd', 'click', addDialog);
    on('#mlRef', 'click', function () { if (window.AssureXReloadClaims) window.AssureXReloadClaims(); });
    $('.mlgrid', root).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      var id = +b.closest('.mlcard').dataset.id, i = charts.findIndex(function (c) { return c.id === id; }), c = charts[i], a = b.dataset.a;
      if (a === 'x') return expand(c); if (a === 'csv') return csv(c);
      if (a === 'rm') charts.splice(i, 1);
      else { var j = a === 'l' ? i - 1 : i + 1; if (j < 0 || j >= charts.length) return; charts.splice(i, 1); charts.splice(j, 0, c); }
      renderAll();
    });
    window.addEventListener('assurex-claims-loaded', onData);
    if (window.AssureXClaims) onData();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
