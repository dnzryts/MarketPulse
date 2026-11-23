/* MarketPulse core: networking, formatting, watchlist, stock detail, news. */
{
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DEFAULT = ['^GSPC','^IXIC','^STI','^NSEI','NVDA','AAPL','D05.SI','RELIANCE.NS','TCS.NS'];
const NAMES = {'^GSPC':'S&P 500','^IXIC':'Nasdaq Composite','^NDX':'Nasdaq-100','^DJI':'Dow Jones','^STI':'Straits Times Index','^NSEI':'Nifty 50','^BSESN':'BSE Sensex','^HSI':'Hang Seng','^N225':'Nikkei 225'};
const RANGES = [['1D','1d','5m'],['5D','5d','30m'],['1M','1mo','1d'],['6M','6mo','1d'],['1Y','1y','1wk'],['5Y','5y','1mo']];
const TOPICS = [['Top markets','stock market'],['My watchlist',null],['SGX','Singapore stocks SGX STI'],['NASDAQ','Nasdaq stocks'],['NSE','NSE Nifty Sensex stocks'],['Tech & AI','tech stocks AI chips'],['Economy','Federal Reserve inflation economy']];

const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const MP = window.MP = {$, esc, store, NAMES};
let watch = store.get('mp.watch', DEFAULT.slice());
const quotes = MP.quotes = {};
let editing = false, current = null, range = '1D', topic = 0, lastUpdate = null, busy = 0, prevView = 'home';

/* ---------- network: native bridge in the app, fetch() elsewhere ---------- */
const pending = {}; let seq = 0;
window.__nativeResolve = (id, ok, status, body) => {
  const p = pending[id]; if (!p) return; delete pending[id];
  if (ok) p.res(body);
  else { const e = new Error(status ? 'HTTP ' + status : body || 'Network error'); e.status = status; e.body = body; p.rej(e); }
};
function http(url, opt = {}){
  const method = opt.method || 'GET', timeout = opt.timeout || 30000;
  if (window.Native && Native.request){
    return new Promise((res, rej) => {
      const id = 'r' + (++seq); pending[id] = {res, rej};
      Native.request(id, method, url, JSON.stringify(opt.headers || {}), opt.body || '');
      setTimeout(() => { if (pending[id]){ delete pending[id]; rej(new Error('Timed out')); } }, timeout);
    });
  }
  return fetch(url, {method, headers: opt.headers, body: opt.body}).then(async r => {
    const t = await r.text(); if (!r.ok){ const e = new Error('HTTP ' + r.status); e.status = r.status; e.body = t; throw e; } return t;
  });
}
MP.http = http;
async function yahoo(path){
  try { return JSON.parse(await http('https://query1.finance.yahoo.com' + path)); }
  catch(e){ return JSON.parse(await http('https://query2.finance.yahoo.com' + path)); }
}
MP.yahoo = yahoo;
function setBusy(d){ busy += d; $('#refresh').classList.toggle('spin', busy > 0); }
MP.setBusy = setBusy;

async function chart(sym, r = '1d', iv = '5m'){
  const j = await yahoo('/v8/finance/chart/' + encodeURIComponent(sym) + '?range=' + r + '&interval=' + iv + '&includePrePost=false');
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || 'No data');
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const ts = res.timestamp || [], cl = q.close || [];
  const pts = [], bars = [];
  for (let i = 0; i < ts.length; i++) if (cl[i] != null){
    pts.push([ts[i], cl[i]]);
    bars.push({t: ts[i], o: q.open ? q.open[i] : null, h: q.high && q.high[i] != null ? q.high[i] : cl[i], l: q.low && q.low[i] != null ? q.low[i] : cl[i], c: cl[i], v: q.volume ? q.volume[i] || 0 : 0});
  }
  return {meta: res.meta || {}, pts, bars};
}
MP.chart = chart;

/* ---------- formatting ---------- */
const nf = (n, d = 2) => n == null || isNaN(n) ? '–' : Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const big = n => n == null ? '–' : n >= 1e12 ? nf(n/1e12) + 'T' : n >= 1e9 ? nf(n/1e9) + 'B' : n >= 1e6 ? nf(n/1e6) + 'M' : n >= 1e3 ? nf(n/1e3, 1) + 'K' : String(n);
const dp = p => p != null && p < 1 ? 4 : 2;
const pct = n => n == null || isNaN(n) ? '–' : (n >= 0 ? '+' : '−') + nf(Math.abs(n)) + '%';
function prevClose(m){ return m.previousClose ?? m.chartPreviousClose; }
function change(m){ const p = m.regularMarketPrice, c = prevClose(m); if (p == null || c == null) return null; return {abs: p - c, pct: (p - c) / c * 100}; }
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + nf(Math.abs(n));
function ago(t){
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
Object.assign(MP, {nf, big, dp, pct, ago, change, prevClose});

/* ---------- universe lookups, ticker detection, headline tone ---------- */
const BY_SYM = {}; const ALIASES = [];
for (const [mk, u] of Object.entries(window.UNIVERSE || {})) for (const e of u.list){
  BY_SYM[e[0]] = {sym: e[0], name: e[1], market: mk};
  for (const a of e.slice(2)) ALIASES.push({sym: e[0], re: new RegExp('(?<![A-Za-z0-9])' + a.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&') + '(?![A-Za-z0-9])')});
}
MP.BY_SYM = BY_SYM;
const displayName = (sym, m) => NAMES[sym] || (BY_SYM[sym] && BY_SYM[sym].name) || (m && (m.shortName || m.longName)) || sym;
MP.displayName = displayName;
function detect(text){ const out = new Set(); for (const a of ALIASES) if (a.re.test(text)) out.add(a.sym); return [...out]; }
MP.detect = detect;
const POS = /\b(surge[sd]?|soar(s|ed|ing)?|jump(s|ed)?|rall(y|ies|ied)|beat(s)?|record high|all-time high|upgrade[sd]?|outperform|raises?d? (guidance|forecast|outlook|target)|wins?|won|contract|order win|approv(al|ed|es)|breakout|strong|gains?|climbs?|rises?|rose|boost(s|ed)?|buyback|dividend (hike|increase)|bullish|top pick|expan(d|ds|sion)|profit (rises|jumps|up))\b/i;
const POSG = new RegExp(POS.source, 'gi');
const NEGG = /\b(plunge[sd]?|slump(s|ed)?|tumble[sd]?|crash(es|ed)?|sink(s)?|sank|fall(s|ing)?|fell|drop(s|ped)?|slide[sd]?|miss(es|ed)?|downgrade[sd]?|cuts?|slash(es|ed)?|lawsuit|sued|probe|investigation|fraud|loss(es)?|warn(s|ing)?|weak(er)?|delay(s|ed)?|recall|bearish|sell-?off|default|resign(s|ed|ation)?|fine[sd]?|penalty|halt(s|ed)?)\b/gi;
function tone(text){ const p = (text.match(POSG) || []).length, n = (text.match(NEGG) || []).length; return p - n; }
MP.tone = tone;

/* ---------- news ---------- */
async function fetchNews(query, days = 7){
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + ' when:' + days + 'd') + '&hl=en-SG&gl=SG&ceid=SG:en';
  const xml = new DOMParser().parseFromString(await http(url), 'text/xml');
  return [...xml.querySelectorAll('item')].map(it => {
    const g = t => (it.querySelector(t) || {}).textContent || '';
    const src = g('source'); let title = g('title');
    if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    return {title, link: g('link'), src, t: Date.parse(g('pubDate')) || 0, tone: tone(title), syms: detect(title)};
  }).filter(n => n.title && n.link.startsWith('https://'));
}
MP.fetchNews = fetchNews;
function newsQuery(sym){
  const n = displayName(sym, quotes[sym] && quotes[sym].meta);
  if (sym.startsWith('^')) return n;
  const clean = n.replace(/,? (Inc|Corp|Corporation|Ltd|Limited|Holdings|Group|plc|N\.V\.)\.?$/i, '').replace(/\s*\(.*\)$/, '');
  return '"' + clean + '" OR ' + sym.replace(/\..*$/, '') + ' stock';
}
MP.newsQuery = newsQuery;
function newsHTML(items){
  return items.length ? items.map(n => `<a href="${esc(n.link)}" data-link="${esc(n.link)}"><div class="h">${esc(n.title)}</div><div class="m"><span class="dot ${n.tone > 0 ? 'pos' : n.tone < 0 ? 'neg' : ''}"></span>${esc(n.src || 'News')}${n.t ? ' · ' + ago(n.t) : ''}${n.syms.slice(0, 3).map(s => ` <span class="tag">${esc(s.replace(/\.(SI|NS)$/, ''))}</span>`).join('')}</div></a>`).join('')
    : '<div class="empty">No recent headlines found.</div>';
}
async function loadNews(sel, query, limit = 25){
  const el = $(sel); el.innerHTML = '<div class="empty">Loading headlines…</div>';
  if (sel === '#newslist') $('#mentions').innerHTML = '';
  try {
    let items;
    if (query === null){
      const syms = watch.slice(0, 10);
      if (!syms.length){ el.innerHTML = '<div class="empty">Add stocks to your watchlist to see their news here.</div>'; return; }
      const all = await Promise.all(syms.map(s => fetchNews(newsQuery(s)).then(r => r.slice(0, 6)).catch(() => [])));
      const seen = new Set(); items = all.flat().filter(n => !seen.has(n.title) && seen.add(n.title));
    } else items = await fetchNews(query);
    items.sort((a, b) => b.t - a.t); items = items.slice(0, limit);
    el.innerHTML = newsHTML(items);
    if (sel === '#newslist') renderMentions(items);
  } catch(e){ el.innerHTML = `<div class="err">Couldn't load news (${esc(e.message)}). Check your connection and tap refresh.</div>`; }
}
function renderMentions(items){
  const m = {};
  for (const n of items) for (const s of n.syms){ (m[s] = m[s] || {n: 0, tone: 0}); m[s].n++; m[s].tone += n.tone; }
  const list = Object.entries(m).sort((a, b) => b[1].n - a[1].n || Math.abs(b[1].tone) - Math.abs(a[1].tone)).slice(0, 15);
  $('#mentions').innerHTML = list.length ? list.map(([s, v]) => `<button data-open="${esc(s)}"><b>${esc(s.replace(/\.(SI|NS)$/, ''))}</b><span><span class="dot ${v.tone > 0 ? 'pos' : v.tone < 0 ? 'neg' : ''}"></span> ${v.n} headline${v.n > 1 ? 's' : ''} · ${v.tone > 0 ? 'positive' : v.tone < 0 ? 'negative' : 'neutral'}</span></button>`).join('')
    : '<span class="note" style="margin:0">No SGX, NASDAQ or NSE names from the scan lists in these headlines.</span>';
}
$('#mentions').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openDetail(b.dataset.open, 'news'); });
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]'); if (!a) return;
  if (window.Native && Native.openUrl){ e.preventDefault(); Native.openUrl(a.dataset.link); }
  else { a.target = '_blank'; a.rel = 'noopener'; }
});
function renderTopics(){ $('#topics').innerHTML = TOPICS.map((t, i) => `<button class="${i === topic ? 'on' : ''}" data-t="${i}">${esc(t[0])}</button>`).join(''); }
$('#topics').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; topic = +b.dataset.t; $('#nq').value = ''; renderTopics(); loadNews('#newslist', TOPICS[topic][1]); });
$('#nq').addEventListener('keydown', e => { if (e.key === 'Enter'){ const v = $('#nq').value.trim(); if (!v) return; topic = -1; renderTopics(); $('#nq').blur(); loadNews('#newslist', v); } });

/* ---------- sparkline ---------- */
function spark(pts, base, up){
  if (!pts || pts.length < 2) return '<svg class="spark"></svg>';
  const W = 72, H = 32, ys = pts.map(p => p[1]).concat(base != null ? [base] : []);
  const lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
  const x = i => (i / (pts.length - 1)) * W, y = v => H - 2 - ((v - lo) / sp) * (H - 4);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('');
  const b = base != null ? `<line x1="0" x2="${W}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="2 3"/>` : '';
  return `<svg class="spark ${up ? 'up-t' : 'down-t'}" viewBox="0 0 ${W} ${H}">${b}<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

/* ---------- watchlist ---------- */
const delBtn = sym => `<span class="del" role="button" aria-label="Remove ${esc(sym)}" data-del="${esc(sym)}">−</span>`;
function renderWatch(){
  const el = $('#watch');
  if (!watch.length){ el.innerHTML = '<div class="empty">Your watchlist is empty. Search above to add a stock.</div>'; return; }
  el.innerHTML = watch.map(sym => {
    const q = quotes[sym];
    if (q && q.err) return `<div class="row"><div><div class="sym">${esc(sym)}</div><div class="nm down-t">Couldn't load (${esc(q.err)})</div></div><div></div>${editing ? delBtn(sym) : '<div></div>'}</div>`;
    if (!q) return `<div class="row"><div><div class="sym">${esc(sym)}</div><div class="skel" style="width:60%;margin-top:6px"></div></div><div></div><div class="skel" style="width:70px;height:28px"></div></div>`;
    const m = q.meta, c = change(m), up = c && c.abs >= 0;
    const right = editing ? delBtn(sym) : `<div class="px">${nf(m.regularMarketPrice, dp(m.regularMarketPrice))}<br><span class="pill ${c ? (up ? 'up' : 'down') : ''}">${c ? pct(c.pct) : '–'}</span></div>`;
    return `<div class="sw" data-key="${esc(sym)}"><div class="sw-bg">Remove</div><button class="row" data-sym="${esc(sym)}"><div><div class="sym">${esc(sym.replace(/^\^/, ''))}</div><div class="nm">${esc(displayName(sym, m))}</div></div>${spark(q.pts, prevClose(m), up)}${right}</button></div>`;
  }).join('');
}
async function loadQuote(sym){
  try { quotes[sym] = await chart(sym); }
  catch(e){ if (!quotes[sym] || quotes[sym].err) quotes[sym] = {err: e.message}; }
}
MP.loadQuote = loadQuote;
async function refreshAll(){
  setBusy(1);
  const extra = (MP.extraSymbols ? MP.extraSymbols() : []).filter(s => !watch.includes(s));
  await Promise.all(watch.concat(extra).map(loadQuote));
  setBusy(-1);
  lastUpdate = Date.now(); stamp();
  renderWatch();
  if (current) renderDetailHead();
  if (MP.onQuotes) MP.onQuotes();
}
MP.refreshAll = refreshAll;
MP.lastUpdate = () => lastUpdate;
function stamp(){ $('#upd').textContent = lastUpdate ? 'Updated ' + new Date(lastUpdate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''; }
$('#watch').addEventListener('click', e => {
  const d = e.target.closest('[data-del]');
  if (d){ MP.removeWatch(d.dataset.del); return; }
  const r = e.target.closest('[data-sym]'); if (r && !editing) openDetail(r.dataset.sym, 'markets');
});
function setWatch(w){ watch = w; store.set('mp.watch', watch); renderWatch(); if (MP.onWatchChange) MP.onWatchChange(); }
MP.setWatch = setWatch;
MP.removeWatch = sym => {
  const before = watch.slice(); setWatch(watch.filter(x => x !== sym));
  if (MP.toast) MP.toast('Removed ' + sym.replace(/^\^/, ''), () => setWatch(before));
};
MP.getWatch = () => watch.slice();
MP.resetWatch = () => { setWatch(DEFAULT.slice()); refreshAll(); };
$('#edit').addEventListener('click', () => { editing = !editing; $('#edit').textContent = editing ? 'Done' : 'Edit'; renderWatch(); });

let st;
$('#q').addEventListener('input', () => { clearTimeout(st); st = setTimeout(suggest, 300); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter'){ const v = $('#q').value.trim().toUpperCase(); if (v) addSym(v); } });
async function searchSymbols(v){
  const j = await yahoo('/v1/finance/search?q=' + encodeURIComponent(v) + '&quotesCount=7&newsCount=0&enableFuzzyQuery=true');
  return (j.quotes || []).filter(q => q.symbol).map(q => ({symbol: q.symbol, name: q.shortname || q.longname || '', exchange: q.exchDisp || '', type: q.quoteType || ''}));
}
MP.searchSymbols = searchSymbols;
async function suggest(){
  const v = $('#q').value.trim(), box = $('#sugg');
  if (!v){ box.hidden = true; return; }
  const fallback = `<button data-add="${esc(v.toUpperCase())}"><b>${esc(v.toUpperCase())}</b><span>Add this symbol</span></button>`;
  try {
    const qs = await searchSymbols(v);
    if ($('#q').value.trim() !== v) return;
    box.innerHTML = qs.length ? qs.map(q => `<button data-add="${esc(q.symbol)}"><b>${esc(q.symbol)}</b><span>${esc(q.name)}</span><em>${esc(q.exchange || q.type)}</em></button>`).join('') : fallback;
  } catch(e){ box.innerHTML = fallback; }
  box.hidden = false;
}
$('#sugg').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) addSym(b.dataset.add); });
document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#sugg').hidden = true; });
async function addSym(sym){
  $('#sugg').hidden = true; $('#q').value = ''; $('#q').blur();
  if (!watch.includes(sym)) setWatch([sym].concat(watch));
  await loadQuote(sym); renderWatch();
}

/* ---------- detail ---------- */
function openDetail(sym, from){
  current = sym; range = '1D'; prevView = from || prevView;
  show('detail');
  $('#backlbl').textContent = {home: 'Home', markets: 'Markets', radar: 'Radar', news: 'News', analyst: 'Analyst', alerts: 'Alerts'}[prevView] || 'Back';
  $('#d-sym').textContent = sym; $('#d-name').textContent = displayName(sym, quotes[sym] && quotes[sym].meta);
  $('#d-price').textContent = '–'; $('#d-chg').textContent = ''; $('#d-state').textContent = ''; $('#stats').innerHTML = '';
  $('#d-watch').textContent = watch.includes(sym) ? '✓ Watching' : '+ Watchlist';
  if (MP.onDetailOpen) MP.onDetailOpen(sym);
  renderDetailHead(); renderRanges(); loadRange(); loadNews('#d-news', newsQuery(sym), 12);
  if (MP.renderSignals) MP.renderSignals(sym, $('#signals'));
  window.scrollTo(0, 0);
}
MP.openDetail = openDetail;
MP.current = () => current;
$('#d-watch').addEventListener('click', () => {
  if (!current) return;
  if (watch.includes(current)){ setWatch(watch.filter(x => x !== current)); $('#d-watch').textContent = '+ Watchlist'; }
  else { setWatch([current].concat(watch)); $('#d-watch').textContent = '✓ Watching'; loadQuote(current).then(renderWatch); }
});
$('#d-ask').addEventListener('click', () => { if (current && MP.askAnalyst) MP.askAnalyst(`Analyse ${displayName(current)} (${current}): recent price action, technical signals, news flow and sentiment. Is it setting up for a breakout or breakdown? Give bull and bear scenarios with key price levels to watch.`, current); });
function marketState(m){
  const p = m.currentTradingPeriod && m.currentTradingPeriod.regular; if (!p) return '';
  const now = Date.now() / 1000, open = now >= p.start && now < p.end;
  const t = m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toLocaleString([], {weekday:'short', hour:'2-digit', minute:'2-digit'}) : '';
  return (open ? 'Market open' : 'Market closed') + (m.exchangeName ? ' · ' + (m.fullExchangeName || m.exchangeName) : '') + (t ? ' · as of ' + t : '');
}
function renderDetailHead(){
  const q = quotes[current]; if (!q || !q.meta) return;
  const m = q.meta, c = change(m);
  $('#d-name').textContent = displayName(current, m);
  $('#d-price').textContent = nf(m.regularMarketPrice, dp(m.regularMarketPrice)) + (m.currency && !current.startsWith('^') ? ' ' + m.currency : '');
  const ch = $('#d-chg');
  ch.className = 'chg ' + (c ? (c.abs >= 0 ? 'up-t' : 'down-t') : '');
  ch.textContent = c ? sign(c.abs) + ' (' + pct(c.pct) + ') today' : '';
  $('#d-state').textContent = marketState(m);
  const rows = [['Open', m.regularMarketOpen ?? (q.pts[0] && q.pts[0][1])], ['Prev close', prevClose(m)], ['Day high', m.regularMarketDayHigh], ['Day low', m.regularMarketDayLow], ['52-wk high', m.fiftyTwoWeekHigh], ['52-wk low', m.fiftyTwoWeekLow]];
  $('#stats').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${nf(v, dp(v))}</b></div>`).join('') +
    `<div><span>Volume</span><b>${big(m.regularMarketVolume)}</b></div><div><span>Exchange</span><b>${esc(m.exchangeName || '–')}</b></div>`;
}
function renderRanges(){ $('#ranges').innerHTML = RANGES.map(r => `<button class="${r[0] === range ? 'on' : ''}" data-r="${r[0]}">${r[0]}</button>`).join(''); }
$('#ranges').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; range = b.dataset.r; renderRanges(); loadRange(); });
let series = null, geo = null;
async function loadRange(){
  const sym = current, R = RANGES.find(r => r[0] === range);
  const svg = $('#chart'); $('#readout').hidden = true;
  if (range === '1D' && quotes[sym] && quotes[sym].pts){ series = {pts: quotes[sym].pts, base: prevClose(quotes[sym].meta), r: '1D'}; drawChart(); }
  else svg.innerHTML = '';
  setBusy(1);
  try {
    const r = await chart(sym, R[1], R[2]);
    if (sym !== current || R[0] !== range) return;
    if (range === '1D'){ quotes[sym] = r; renderDetailHead(); }
    series = {pts: r.pts, base: range === '1D' ? prevClose(r.meta) : null, r: range};
    drawChart();
  } catch(e){
    if (sym === current) svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="currentColor" font-size="14">Chart unavailable: ${esc(e.message)}</text>`;
  } finally { setBusy(-1); }
}
function drawChart(){
  const svg = $('#chart'), W = svg.clientWidth, H = svg.clientHeight;
  if (!series || series.pts.length < 2 || !W){ svg.innerHTML = W ? '<text x="50%" y="50%" text-anchor="middle" fill="currentColor" font-size="14">No chart data for this range</text>' : ''; geo = null; return; }
  const pts = series.pts, first = series.base ?? pts[0][1], last = pts[pts.length - 1][1], up = last >= first;
  const ys = pts.map(p => p[1]).concat(series.base != null ? [series.base] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys); const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
  const L = 8, R = W - 58, T = 34, B = H - 26;
  const x = i => L + (i / (pts.length - 1)) * (R - L), y = v => B - ((v - lo) / (hi - lo)) * (B - T);
  const col = up ? 'var(--up)' : 'var(--down)';
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('');
  let grid = '';
  for (let k = 0; k <= 3; k++){ const v = lo + (hi - lo) * (k + .5) / 4, yy = y(v);
    grid += `<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${R + 6}" y="${yy + 4}" font-size="11" fill="var(--mute)">${nf(v, v >= 1000 ? 0 : 2)}</text>`; }
  const fmtT = t => { const d = new Date(t * 1000); return series.r === '1D' ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : series.r === '5D' ? d.toLocaleDateString([], {weekday:'short'}) : d.toLocaleDateString([], {month:'short', year: series.r === '5Y' ? '2-digit' : undefined, day: series.r === '1M' ? 'numeric' : undefined}); };
  let xl = ''; if (W > 300) [0, .5, 1].forEach(f => { const i = Math.round(f * (pts.length - 1)); xl += `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="var(--mute)" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${esc(fmtT(pts[i][0]))}</text>`; });
  const base = series.base != null ? `<line x1="${L}" x2="${R}" y1="${y(series.base)}" y2="${y(series.base)}" stroke="var(--mute)" stroke-dasharray="3 4"/>` : '';
  svg.innerHTML = `<defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${base}<path d="${line}L${R} ${B}L${L} ${B}Z" fill="url(#ga)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>${xl}
    <g id="cur" style="display:none"><line id="cl" y1="${T - 6}" y2="${B}" stroke="var(--ink)" stroke-opacity=".5"/><circle id="cc" r="5" fill="${col}" stroke="var(--panel)" stroke-width="2"/></g>`;
  geo = {x, y, L, R, pts};
}
const chartRO = new ResizeObserver(() => { if (current) drawChart(); }); chartRO.observe($('#fig'));
function scrub(e){
  if (!geo) return;
  const r = $('#chart').getBoundingClientRect(), px = e.clientX - r.left;
  const i = Math.max(0, Math.min(geo.pts.length - 1, Math.round((px - geo.L) / (geo.R - geo.L) * (geo.pts.length - 1))));
  const p = geo.pts[i], cx = geo.x(i), cy = geo.y(p[1]);
  $('#cur').style.display = ''; $('#cl').setAttribute('x1', cx); $('#cl').setAttribute('x2', cx); $('#cc').setAttribute('cx', cx); $('#cc').setAttribute('cy', cy);
  const intra = /1D|5D/.test(series.r);
  $('#readout').hidden = false;
  $('#readout').innerHTML = '<b>' + nf(p[1], dp(p[1])) + '</b> · ' + esc(new Date(p[0] * 1000).toLocaleString([], {month:'short', day:'numeric', hour: intra ? '2-digit' : undefined, minute: intra ? '2-digit' : undefined}));
}
function endScrub(){ const c = $('#cur'); if (c) c.style.display = 'none'; $('#readout').hidden = true; }
const fig = $('#fig');
fig.addEventListener('pointerdown', scrub); fig.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) scrub(e); });
fig.addEventListener('pointerup', endScrub); fig.addEventListener('pointerleave', endScrub); fig.addEventListener('pointercancel', endScrub);
$('#back').addEventListener('click', () => { current = null; show(prevView); });

/* ---------- navigation ---------- */
let newsLoaded = false, lastView = 'home';
const ORDER = MP.ORDER = ['home', 'markets', 'radar', 'news', 'analyst'];
function show(v){
  const a = ORDER.indexOf(lastView), b = ORDER.indexOf(v);
  const dir = v === 'detail' || (lastView !== 'detail' && b < 0) ? 'from-right' : lastView === 'detail' || (a < 0 && b >= 0) ? 'from-left' : a !== b ? (b > a ? 'from-right' : 'from-left') : '';
  document.querySelectorAll('.view').forEach(s => { const on = s.id === 'v-' + v; s.classList.toggle('on', on); if (!on) s.classList.remove('from-left', 'from-right'); });
  const el = $('#v-' + v);
  if (el && dir && lastView !== v){ el.classList.remove('from-left', 'from-right', 'done'); void el.offsetWidth; el.classList.add(dir); }
  lastView = v;
  const tab = v === 'detail' ? prevView : v;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (v !== 'detail') prevView = v;
  if (MP.onViewChange) MP.onViewChange(v, tab);
  if (v === 'home' && MP.onHomeShow) MP.onHomeShow();
  if (v === 'alerts' && MP.onAlertsShow) MP.onAlertsShow();
  if (v === 'profile' && MP.onProfileShow) MP.onProfileShow();
  if (v === 'news' && !newsLoaded){ newsLoaded = true; renderTopics(); loadNews('#newslist', TOPICS[topic][1]); }
  if (v === 'radar' && MP.onRadarShow) MP.onRadarShow();
  if (v === 'analyst' && MP.onAnalystShow) MP.onAnalystShow();
}
MP.show = show;
MP.view = () => (document.querySelector('.view.on') || {}).id;
document.querySelector('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; current = null; prevView = b.dataset.tab; show(b.dataset.tab); window.scrollTo(0, 0); });
$('#refresh').addEventListener('click', () => {
  refreshAll();
  if (current){ loadRange(); loadNews('#d-news', newsQuery(current), 12); if (MP.renderSignals) MP.renderSignals(current, $('#signals'), true); }
  if ($('#v-news').classList.contains('on')) loadNews('#newslist', topic >= 0 ? TOPICS[topic][1] : $('#nq').value.trim() || 'stock market');
  if ($('#v-radar').classList.contains('on') && MP.rescan) MP.rescan();
  if ($('#v-home').classList.contains('on') && MP.onHomeShow) MP.onHomeShow(true);
});
window.handleBack = () => {
  if (!$('#modal').hidden){ $('#m-cancel').click(); return true; }
  if (!$('#sugg').hidden){ $('#sugg').hidden = true; return true; }
  if (current){ current = null; show(prevView); return true; }
  if (!$('#v-home').classList.contains('on')){ show('home'); return true; }
  return false;
};
window.onAppResume = () => { if (lastUpdate && Date.now() - lastUpdate > 30000) refreshAll(); };
setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 60000);
setInterval(stamp, 30000);

renderWatch();
refreshAll();
}
