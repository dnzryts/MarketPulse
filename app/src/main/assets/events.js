/* Earnings and dividend calendar for your stocks (watchlist, wishlist, portfolio). */
{
const MP = window.MP, {$, esc, store, nf} = MP;
const short = s => s.replace(/^\^/, '').replace(/\.(SI|NS)$/, '');
const DAY = 864e5, TTL = 12 * 3600e3;
const cacheKey = 'mp.ev';

function mySymbols(){
  const s = new Set([].concat(MP.portfolioSymbols ? MP.portfolioSymbols() : [], MP.getWatch(), MP.getWish ? MP.getWish().map(w => w.symbol) : []));
  return [...s].filter(x => !x.startsWith('^') && !/=X$/.test(x)).slice(0, 40);
}
function parse(sym, j){
  const r = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0]; if (!r) throw new Error('No data');
  const ce = r.calendarEvents || {}, sd = r.summaryDetail || {}, ev = [];
  const er = (ce.earnings && ce.earnings.earningsDate) || [];
  if (er.length){
    const a = er[0].raw * 1000, b = er.length > 1 ? er[er.length - 1].raw * 1000 : null;
    ev.push({t: a, end: b && b - a > DAY ? b : null, kind: 'Earnings', est: !!(b && b - a > DAY) || !!(ce.earnings && ce.earnings.isEarningsDateEstimate),
      detail: ce.earnings && ce.earnings.earningsAverage && ce.earnings.earningsAverage.fmt ? 'EPS est. ' + ce.earnings.earningsAverage.fmt : ''});
  }
  if (ce.exDividendDate && ce.exDividendDate.raw) ev.push({t: ce.exDividendDate.raw * 1000, kind: 'Ex-dividend', detail: sd.dividendRate && sd.dividendRate.fmt ? 'Annual dividend ' + sd.dividendRate.fmt : ''});
  if (ce.dividendDate && ce.dividendDate.raw) ev.push({t: ce.dividendDate.raw * 1000, kind: 'Dividend paid', detail: ''});
  return {at: Date.now(), ev, facts: {yield: sd.dividendYield && sd.dividendYield.fmt, pe: sd.trailingPE && sd.trailingPE.fmt, fpe: sd.forwardPE && sd.forwardPE.fmt, cap: sd.marketCap && sd.marketCap.fmt}};
}
async function getOne(sym, fresh){
  const c = store.get(cacheKey, {});
  if (!fresh && c[sym] && Date.now() - c[sym].at < TTL) return c[sym];
  const v = parse(sym, await MP.summary(sym, 'calendarEvents,summaryDetail'));
  const c2 = store.get(cacheKey, {}); c2[sym] = v; store.set(cacheKey, c2);
  return v;
}
MP.stockEvents = getOne;
async function loadAll(fresh, onStep){
  const syms = mySymbols(), out = []; let done = 0, fails = 0;
  const q = syms.slice();
  await Promise.all(Array.from({length: 4}, async () => { while (q.length){ const s = q.shift(); try { const v = await getOne(s, fresh); v.ev.forEach(e => out.push({...e, sym: s})); } catch(e){ fails++; } onStep && onStep(++done, syms.length); } }));
  return {events: out.sort((a, b) => a.t - b.t), fails, total: syms.length};
}
MP.upcomingEvents = async (days = 60) => {
  const r = await loadAll(false), now = Date.now() - DAY;
  return r.events.filter(e => e.t >= now && e.t <= Date.now() + days * DAY).map(e => ({symbol: e.sym, event: e.kind, date: new Date(e.t).toISOString().slice(0, 10), estimated: !!e.est, detail: e.detail}));
};

const fmtDay = t => new Date(t).toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'});
const rel = t => { const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY); return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : d > 0 ? 'in ' + d + ' days' : -d + ' days ago'; };
const KIND = {'Earnings': 'hot', 'Ex-dividend': 'good', 'Dividend paid': ''};
function evRow(e){
  return `<button class="row" data-open="${esc(e.sym)}" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="sym">${esc(short(e.sym))} <span class="tag ${KIND[e.kind] || ''}">${esc(e.kind)}${e.est ? ' (est.)' : ''}</span></div><div class="nm">${esc(MP.displayName(e.sym))}${e.detail ? ' · ' + esc(e.detail) : ''}</div></div><div class="px" style="font-size:14px">${esc(fmtDay(e.t))}<br><span class="nm">${esc(rel(e.t))}</span></div></button>`;
}
let loading = false;
async function renderCal(fresh){
  const el = $('#cal'); if (!el || loading) return; loading = true;
  if (!mySymbols().length){ el.innerHTML = '<div class="empty">Add stocks to your watchlist, wishlist or portfolio to see their results and dividend dates.</div>'; loading = false; return; }
  el.innerHTML = '<div class="empty">Loading results and dividend dates…</div>';
  const r = await loadAll(fresh, (k, n) => { el.innerHTML = `<div class="empty">Loading results and dividend dates… ${k}/${n}</div>`; });
  loading = false;
  const now = Date.now() - DAY, up = r.events.filter(e => e.t >= now && e.t <= Date.now() + 120 * DAY), past = r.events.filter(e => e.t < now && e.t > Date.now() - 14 * DAY).reverse();
  if (!r.events.length && r.fails){ el.innerHTML = `<div class="err">Couldn't load the calendar (${r.fails} of ${r.total} stocks failed). This needs the Android app and a connection; tap refresh to retry.</div>`; return; }
  const groups = {};
  for (const e of up){ const k = new Date(e.t).toLocaleDateString([], {month: 'long', year: 'numeric'}); (groups[k] = groups[k] || []).push(e); }
  el.innerHTML = (up.length ? Object.entries(groups).map(([m, es]) => `<div class="sec"><h2>${esc(m)}</h2></div><div class="list">${es.map(evRow).join('')}</div>`).join('') : '<div class="empty">No results or dividend dates in the next four months for your stocks.</div>')
    + (past.length ? `<div class="sec"><h2>Last two weeks</h2></div><div class="list">${past.map(evRow).join('')}</div>` : '')
    + (r.fails ? `<p class="note">${r.fails} of ${r.total} stocks had no calendar data.</p>` : '');
}
MP.renderCalendar = renderCal;
$('#cal') && $('#cal').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) MP.openDetail(b.dataset.open, 'news'); });

/* News sub-tabs */
function showNewsSub(s){
  document.querySelectorAll('#newsnav button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  $('#news-head').hidden = s !== 'head'; $('#news-cal').hidden = s !== 'cal';
  if (s === 'cal') renderCal(false);
}
$('#newsnav').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) showNewsSub(b.dataset.s); });
MP.showNewsSub = showNewsSub;

/* Home: next three events */
let homeTried = false;
MP.renderHomeEvents = async () => {
  const el = $('#home-ev'); if (!el) return;
  const c = store.get(cacheKey, {}), syms = mySymbols(), now = Date.now() - DAY, ev = [];
  for (const s of syms) if (c[s]) c[s].ev.forEach(e => { if (e.t >= now && e.t < Date.now() + 30 * DAY) ev.push({...e, sym: s}); });
  ev.sort((a, b) => a.t - b.t);
  el.innerHTML = ev.length ? ev.slice(0, 3).map(evRow).join('') : '<div class="empty">No results or dividends in the next 30 days. Open the calendar to check.</div>';
  if (!homeTried && syms.some(s => !c[s] || Date.now() - c[s].at > TTL) && !loading){ homeTried = true; loading = true; try { await loadAll(false); } catch(e){} loading = false; if (ev.length < 3) setTimeout(MP.renderHomeEvents, 0); }
};
$('#home-ev') && $('#home-ev').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) MP.openDetail(b.dataset.open, 'home'); });

/* Stock page: next dates + valuation */
MP.renderStockEvents = async sym => {
  const el = $('#d-events'); if (!el) return;
  if (sym.startsWith('^') || /=X$/.test(sym)){ el.innerHTML = ''; return; }
  el.innerHTML = '';
  try {
    const v = await getOne(sym); if (MP.current() !== sym) return;
    const next = v.ev.filter(e => e.t >= Date.now() - DAY);
    const cells = [['Next results', (n => n ? fmtDay(n.t) + (n.est ? ' (est.)' : '') : '–')(next.find(e => e.kind === 'Earnings'))], ['Ex-dividend', (n => n ? fmtDay(n.t) : '–')(next.find(e => e.kind === 'Ex-dividend'))],
      ['Dividend yield', v.facts.yield || '–'], ['P/E (trailing)', v.facts.pe || '–'], ['P/E (forward)', v.facts.fpe || '–'], ['Market cap', v.facts.cap || '–']];
    el.innerHTML = `<div class="stats">${cells.map(([k, x]) => `<div><span>${k}</span><b>${esc(x)}</b></div>`).join('')}</div>`;
  } catch(e){ el.innerHTML = ''; }
};
}
