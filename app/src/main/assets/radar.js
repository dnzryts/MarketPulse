/* Technical signals, breakout score, market scanner (Radar tab). */
{
const MP = window.MP, {$, esc, nf, pct, dp} = MP;
const U = window.UNIVERSE;
const sma = (a, k) => a.length >= k ? a.slice(-k).reduce((s, v) => s + v, 0) / k : null;
function rsi(c, k = 14){
  if (c.length <= k) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= k; i++){ const d = c[i] - c[i - 1]; d > 0 ? g += d : l -= d; }
  g /= k; l /= k;
  for (let i = k + 1; i < c.length; i++){ const d = c[i] - c[i - 1]; g = (g * (k - 1) + Math.max(d, 0)) / k; l = (l * (k - 1) + Math.max(-d, 0)) / k; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

/* Indicators from ~6 months of daily bars. */
function indicators(bars, meta){
  const n = bars.length; if (n < 25) throw new Error('Not enough history');
  const c = bars.map(b => b.c), last = c[n - 1];
  const prior = bars.slice(Math.max(0, n - 21), n - 1);
  const hi20 = Math.max(...prior.map(b => b.h)), lo20 = Math.min(...prior.map(b => b.l));
  const vAvg = prior.reduce((s, b) => s + b.v, 0) / prior.length;
  const s20 = sma(c, 20), s50 = sma(c, 50);
  const ret = k => n > k ? last / c[n - 1 - k] - 1 : null;
  const prevC = meta && (meta.previousClose ?? null) || c[n - 2];
  return {
    price: last, chg1d: (last / c[n - 2] - 1) * 100, prevClose: prevC,
    hi20, lo20, distHi20: (last / hi20 - 1) * 100, breakout: last > hi20, breakdown: last < lo20,
    volRatio: vAvg ? bars[n - 1].v / vAvg : null, avgVol20: vAvg,
    sma20: s20, sma50: s50, rsi14: rsi(c),
    ret5: ret(5) * 100, ret20: ret(20) * 100, ret60: ret(60) != null ? ret(60) * 100 : null,
    hi52: meta && meta.fiftyTwoWeekHigh, lo52: meta && meta.fiftyTwoWeekLow,
    currency: meta && meta.currency, asOf: bars[n - 1].t
  };
}
function techScore(x){
  let s = 0; const tags = [];
  if (x.breakout){ s += 30; tags.push(['20-day breakout', 'hot']); }
  else if (x.distHi20 > -3){ s += Math.round(15 * (1 + x.distHi20 / 3)); tags.push([x.distHi20 > -0.3 ? 'At 20D high' : nf(Math.abs(x.distHi20), 1) + '% below 20D high', '']); }
  if (x.volRatio != null){
    if (x.volRatio >= 1.2) s += Math.min(20, Math.round((x.volRatio - 1) * 15));
    if (x.volRatio >= 1.8) tags.push(['Volume ' + nf(x.volRatio, 1) + '×', 'hot']);
  }
  if (x.sma20 && x.sma50 && x.price > x.sma20 && x.sma20 > x.sma50){ s += 15; tags.push(['Uptrend', 'good']); }
  else if (x.sma50 && x.price > x.sma50) s += 7;
  else if (x.sma50 && x.price < x.sma50) tags.push(['Below 50D avg', '']);
  if (x.ret20 > 0) s += Math.min(15, Math.round(x.ret20));
  if (x.rsi14 != null){
    if (x.rsi14 >= 55 && x.rsi14 <= 75) s += 10;
    if (x.rsi14 > 78){ s -= 5; tags.push(['Overbought RSI ' + Math.round(x.rsi14), 'bad']); }
    if (x.rsi14 < 30) tags.push(['Oversold RSI ' + Math.round(x.rsi14), '']);
  }
  if (x.breakdown) tags.push(['20-day breakdown', 'bad']);
  return {score: Math.max(0, Math.min(90, s)), tags};
}
async function newsBuzz(sym){
  const e = MP.BY_SYM[sym], name = e ? e.name.replace(/\s*\(.*\)$/, '') : MP.displayName(sym);
  const q = '"' + name + '"' + (e && e.market === 'SGX' ? '' : ' stock');
  const items = await MP.fetchNews(q, 2);
  const recent = items.filter(n => Date.now() - n.t < 48 * 3600e3);
  const t = recent.reduce((s, n) => s + Math.sign(n.tone), 0);
  recent.sort((a, b) => Math.abs(b.tone) - Math.abs(a.tone) || b.t - a.t);
  return {count: recent.length, tone: t, top: recent.slice(0, 3).map(n => ({title: n.title, source: n.src, published: new Date(n.t).toISOString(), tone: n.tone}))};
}
function applyNews(r){
  if (!r.news) return;
  const {count, tone} = r.news;
  let add = count >= 10 ? 10 : count >= 5 ? 6 : count >= 2 ? 3 : 0;
  if (tone >= 2) add += 5; else if (tone <= -2) add -= 5;
  r.score = Math.max(0, Math.min(100, r.tech + add));
  if (count >= 5) r.tags.unshift(['In the news: ' + count, 'hot']);
  if (tone >= 2) r.tags.push(['Positive headlines', 'good']); else if (tone <= -2) r.tags.push(['Negative headlines', 'bad']);
}
const label = s => s >= 70 ? 'Breakout watch' : s >= 50 ? 'Building' : s >= 30 ? 'Neutral' : 'Weak';
MP.label = label;

/* Full analysis of one symbol (used by detail view and the AI analyst). */
const cache = {};
async function analyze(sym, withNews = true, fresh = false){
  const c = cache[sym];
  if (!fresh && c && Date.now() - c.at < 10 * 60e3 && (!withNews || c.r.news)) return c.r;
  const d = await MP.chart(sym, '6mo', '1d');
  const x = indicators(d.bars, d.meta), t = techScore(x);
  const r = {symbol: sym, name: MP.displayName(sym, d.meta), ...x, tech: t.score, score: t.score, tags: t.tags};
  if (withNews){ try { r.news = await newsBuzz(sym); applyNews(r); } catch(e){} }
  r.label = label(r.score);
  cache[sym] = {at: Date.now(), r};
  return r;
}
MP.analyze = analyze;

async function pool(items, n, fn, onStep){
  let i = 0, done = 0; const out = [];
  await Promise.all(Array.from({length: n}, async () => { while (i < items.length){ const k = i++; try { out[k] = await fn(items[k]); } catch(e){ out[k] = null; } onStep && onStep(++done, items.length); } }));
  return out;
}

/* Scan a market: technicals for every name, news buzz for the leaders. */
async function scan(market, onProgress, fresh = false){
  const key = 'mp.scan.' + market, prev = MP.store.get(key, null);
  if (!fresh && prev && Date.now() - prev.at < 15 * 60e3) return prev;
  const list = U[market].list;
  const rows = (await pool(list, 6, async e => {
    const d = await MP.chart(e[0], '6mo', '1d');
    const x = indicators(d.bars, d.meta), t = techScore(x);
    return {symbol: e[0], name: e[1], ...x, tech: t.score, score: t.score, tags: t.tags};
  }, (k, n) => onProgress && onProgress(k / n * .75))).filter(Boolean);
  rows.sort((a, b) => b.score - a.score);
  const leaders = rows.filter((r, i) => i < 12 || (r.volRatio || 0) >= 2);
  await pool(leaders, 4, async r => { r.news = await newsBuzz(r.symbol); applyNews(r); }, (k, n) => onProgress && onProgress(.75 + k / n * .25));
  rows.forEach(r => r.label = label(r.score));
  rows.sort((a, b) => b.score - a.score);
  const res = {market, at: Date.now(), rows, failed: list.length - rows.length};
  MP.store.set(key, res);
  if (MP.onScan) try { MP.onScan(res); } catch(e){}
  return res;
}
MP.scan = scan;

/* ---------- Radar UI ---------- */
let market = MP.store.get('mp.market', 'SGX'), filter = 'all', result = null, scanning = false;
const FILTERS = [['all', 'All'], ['brk', 'Breakouts'], ['vol', 'Volume surge'], ['news', 'In the news'], ['weak', 'Breaking down']];
function renderMkts(){ $('#mkts').innerHTML = Object.keys(U).map(k => `<button class="${k === market ? 'on' : ''}" data-m="${k}">${esc(U[k].label)}</button>`).join(''); }
function renderFilters(){ $('#rfilt').innerHTML = FILTERS.map(f => `<button class="${f[0] === filter ? 'on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join(''); }
const sClass = s => s >= 70 ? 's3' : s >= 50 ? 's2' : '';
function renderRadar(){
  const el = $('#radar');
  $('#radar-h').textContent = U[market].label + ' breakout radar';
  if (!result){ el.innerHTML = '<div class="empty">Tap <b>Scan now</b> to rank about ' + U[market].list.length + ' large ' + esc(U[market].label) + ' stocks by breakout signals and news buzz.</div>'; $('#radar-t').textContent = ''; return; }
  $('#radar-t').textContent = 'Scanned ' + new Date(result.at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  let rows = result.rows;
  if (filter === 'brk') rows = rows.filter(r => r.breakout || r.distHi20 > -2);
  if (filter === 'vol') rows = rows.filter(r => (r.volRatio || 0) >= 1.5).sort((a, b) => b.volRatio - a.volRatio);
  if (filter === 'news') rows = rows.filter(r => r.news && r.news.count >= 2).sort((a, b) => b.news.count - a.news.count);
  if (filter === 'weak') rows = rows.filter(r => r.breakdown || (r.sma50 && r.price < r.sma50 && r.ret20 < -5)).sort((a, b) => a.ret20 - b.ret20);
  el.innerHTML = rows.length ? rows.map(r => `<button class="rrow" data-open="${esc(r.symbol)}">
      <span class="score ${sClass(r.score)}">${r.score}</span>
      <span><span class="sym">${esc(r.symbol.replace(/\.(SI|NS)$/, ''))}</span> <span class="nm" style="display:inline">${esc(r.name)}</span>
        <span class="tags">${r.tags.slice(0, 4).map(t => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join('')}</span></span>
      <span class="px">${nf(r.price, dp(r.price))}<br><span class="${r.chg1d >= 0 ? 'up-t' : 'down-t'}" style="font-size:13px">${pct(r.chg1d)}</span></span></button>`).join('')
    : '<div class="empty">No stocks match this filter right now.</div>';
  if (result.failed) el.insertAdjacentHTML('beforeend', `<div class="empty" style="font-size:13px">${result.failed} symbol${result.failed > 1 ? 's' : ''} couldn't be loaded.</div>`);
}
async function runScan(fresh){
  if (scanning) return; scanning = true;
  const pb = $('#prog'), bar = pb.querySelector('i'); pb.hidden = false; bar.style.width = '2%';
  $('#scan').disabled = true; $('#scan').textContent = 'Scanning…'; MP.setBusy(1);
  const m = market;
  try { const r = await scan(m, p => { if (m === market) bar.style.width = Math.round(p * 100) + '%'; }, fresh); if (m === market) result = r; }
  catch(e){ $('#radar').innerHTML = `<div class="err">Scan failed (${esc(e.message)}).</div>`; }
  scanning = false; pb.hidden = true; $('#scan').disabled = false; $('#scan').textContent = 'Scan again'; MP.setBusy(-1);
  renderRadar();
}
MP.rescan = () => runScan(true);
MP.onRadarShow = () => { const m = MP.store.get('mp.market', market); if (m !== market && !scanning){ market = m; result = null; } renderMkts(); renderFilters(); if (!result){ const c = MP.store.get('mp.scan.' + market, null); if (c) result = c; } renderRadar(); if (!result || Date.now() - result.at > 15 * 60e3) runScan(false); };
$('#mkts').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b || scanning) return; market = b.dataset.m; MP.store.set('mp.market', market); result = MP.store.get('mp.scan.' + market, null); renderMkts(); renderRadar(); if (!result || Date.now() - result.at > 15 * 60e3) runScan(false); });
$('#rfilt').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; renderFilters(); renderRadar(); });
$('#radar').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) MP.openDetail(b.dataset.open, 'radar'); });
$('#scan').addEventListener('click', () => runScan(true));
$('#radar-ai').addEventListener('click', () => MP.askAnalyst && MP.askAnalyst(`Run the ${U[market].label} breakout scan and review the top candidates. For the 3–5 strongest setups, check their recent news (search the web if needed), explain what is driving each move, rate how likely the breakout is to hold, and give key levels: breakout level, support and invalidation. Also flag any names breaking down.`));

/* ---------- signals card on the detail view ---------- */
MP.renderSignals = async (sym, el, fresh) => {
  if (sym.startsWith('^')){ el.innerHTML = '<div class="empty">Signals are shown for individual stocks. Use Radar to scan this market.</div>'; return; }
  el.innerHTML = '<div class="empty">Reading signals…</div>';
  try {
    const r = await analyze(sym, true, fresh);
    if (MP.recordAnalysis) MP.recordAnalysis(r, 'signals');
    const C = 2 * Math.PI * 27, col = r.score >= 70 ? 'var(--hot)' : r.score >= 50 ? 'var(--ink)' : 'var(--mute)';
    const facts = [['RSI (14)', r.rsi14 != null ? Math.round(r.rsi14) : '–'], ['Volume vs 20D avg', r.volRatio != null ? nf(r.volRatio, 1) + '×' : '–'],
      ['20-day high', nf(r.hi20, dp(r.hi20))], ['20-day low', nf(r.lo20, dp(r.lo20))], ['50-day avg', nf(r.sma50, dp(r.sma50))], ['1M / 3M', pct(r.ret20) + ' / ' + pct(r.ret60)],
      ['News, 48h', r.news ? r.news.count + ' headlines' : '–'], ['Headline tone', r.news ? (r.news.tone > 0 ? 'Positive' : r.news.tone < 0 ? 'Negative' : 'Neutral') : '–']];
    el.innerHTML = `<div class="sig-top"><div class="gauge"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--line)" stroke-width="7"/><circle cx="32" cy="32" r="27" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(r.score / 100 * C).toFixed(1)} ${C.toFixed(1)}"/></svg><b>${r.score}</b></div>
      <div><h3>${esc(r.label)}</h3><p>Breakout score out of 100, from price, volume, trend, momentum and news. A signal to research, not a forecast.</p></div></div>
      <div class="tags">${r.tags.map(t => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join('')}</div>
      <div class="stats" style="margin:12px 0 0">${facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
  } catch(e){ el.innerHTML = `<div class="err">Signals unavailable (${esc(e.message)}).</div>`; }
};
}
