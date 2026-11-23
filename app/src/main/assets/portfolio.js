/* Portfolio: holdings from buy/sell trades, unrealised and realised P&L, converted to a base currency. */
{
const MP = window.MP, {$, esc, store, nf, pct, dp} = MP;
const short = s => s.replace(/^\^/, '').replace(/\.(SI|NS)$/, '');
const CUR = {SGD: 'S$', USD: 'US$', INR: '₹'};
const money = (v, c, d = 2) => v == null || isNaN(v) ? '–' : (v < 0 ? '−' : '') + (CUR[c] || (c ? c + ' ' : '')) + nf(Math.abs(v), d);
const signed = (v, c) => v == null || isNaN(v) ? '–' : (v >= 0 ? '+' : '−') + (CUR[c] || '') + nf(Math.abs(v));

const load = () => store.get('mp.port', {holdings: {}, trades: [], realised: {}});
const save = p => { store.set('mp.port', p); render(); if (MP.onPortfolioChange) MP.onPortfolioChange(); };
const base = () => store.get('mp.baseCur', 'SGD');

/* ---------- FX ---------- */
const fx = {};
const fxSym = (from, to) => from + to + '=X';
async function loadFx(){
  const b = base(), curs = new Set(Object.values(load().holdings).map(h => h.currency).filter(c => c && c !== b));
  await Promise.all([...curs].map(async c => {
    try { const r = await MP.chart(fxSym(c, b), '1d', '1d'); fx[c + b] = {rate: r.meta.regularMarketPrice, prev: MP.prevClose(r.meta)}; } catch(e){}
  }));
}
const rate = (c, prev) => { const b = base(); if (!c || c === b) return 1; const f = fx[c + b]; return f ? (prev ? f.prev || f.rate : f.rate) : null; };

/* ---------- maths ---------- */
function positions(){
  const p = load(), out = [];
  for (const [sym, h] of Object.entries(p.holdings)){
    if (h.qty <= 0) continue;
    const q = MP.quotes[sym], m = q && q.meta, price = m && m.regularMarketPrice, prev = m && MP.prevClose(m);
    const cur = (m && m.currency) || h.currency, value = price != null ? price * h.qty : null, costV = h.cost * h.qty;
    out.push({sym, name: h.name || MP.displayName(sym, m), qty: h.qty, cost: h.cost, currency: cur, price, value, costV,
      pnl: value != null ? value - costV : null, pnlPct: value != null && costV ? (value / costV - 1) * 100 : null,
      day: price != null && prev ? (price - prev) * h.qty : null, dayPct: price != null && prev ? (price / prev - 1) * 100 : null,
      market: /\.SI$/.test(sym) ? 'SGX' : /\.NS$/.test(sym) ? 'NSE' : 'US', sector: (window.SECTORS || {})[sym] || 'Other'});
  }
  return out.sort((a, b) => (b.value || 0) * (rate(b.currency) || 0) - (a.value || 0) * (rate(a.currency) || 0));
}
function summary(){
  const ps = positions(), b = base(); let value = 0, cost = 0, day = 0, missing = 0;
  for (const x of ps){
    const r = rate(x.currency); if (r == null || x.value == null){ missing++; continue; }
    value += x.value * r; cost += x.costV * r; day += (x.day || 0) * r;
  }
  let realised = 0; for (const [c, v] of Object.entries(load().realised)){ const r = rate(c); if (r != null) realised += v * r; }
  return {ps, base: b, value, cost, day, dayPct: value - day ? day / (value - day) * 100 : 0, pnl: value - cost, pnlPct: cost ? (value / cost - 1) * 100 : 0, realised, missing};
}
MP.portfolioSummary = () => {
  const s = summary();
  return {base_currency: s.base, total_value: Math.round(s.value * 100) / 100, unrealised_pnl: Math.round(s.pnl * 100) / 100, unrealised_pnl_pct: Math.round(s.pnlPct * 100) / 100, realised_pnl: Math.round(s.realised * 100) / 100,
    holdings: s.ps.map(x => ({symbol: x.sym, qty: x.qty, avg_cost: x.cost, currency: x.currency, price: x.price, pnl_pct: x.pnlPct != null ? Math.round(x.pnlPct * 100) / 100 : null}))};
};
MP.portfolioCard = () => { const s = summary(); return s.ps.length ? s : null; };
MP.holding = sym => { const h = load().holdings[sym]; return h && h.qty > 0 ? h : null; };

/* ---------- trades ---------- */
const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return isFinite(v) ? v : null; };
async function trade(side, sym){
  const p = load(), held = Object.keys(p.holdings).filter(s => p.holdings[s].qty > 0);
  if (side === 'sell' && !held.length){ MP.toast('You have no holdings to sell.'); return; }
  const s0 = sym || (side === 'sell' ? held[0] : '');
  const m0 = s0 && MP.quotes[s0] && MP.quotes[s0].meta;
  const fields = [
    side === 'sell' ? {id: 'sym', label: 'Stock', type: 'select', value: s0, options: held.map(s => [s, short(s) + ' · ' + p.holdings[s].qty + ' shares'])}
                    : {id: 'sym', label: 'Symbol', value: s0, placeholder: 'e.g. D05.SI, NVDA, INFY.NS', upper: true},
    {id: 'qty', label: 'Shares', type: 'number', value: side === 'sell' && s0 ? p.holdings[s0].qty : '', placeholder: 'e.g. 100'},
    {id: 'price', label: 'Price per share', type: 'number', value: m0 ? String(m0.regularMarketPrice) : '', hint: 'In the stock\'s own currency. Defaults to the latest price.'},
    {id: 'fee', label: 'Fees (optional)', type: 'number', value: '', placeholder: '0'}];
  const v = await MP.modal({title: side === 'buy' ? 'Record a buy' : 'Record a sell', ok: side === 'buy' ? 'Add buy' : 'Add sell', fields});
  if (!v) return;
  const S = v.sym.toUpperCase(), q = num(v.qty), fee = num(v.fee) || 0;
  if (!S || !q || q <= 0){ MP.toast('Enter a symbol and a number of shares.'); return; }
  if (!MP.quotes[S]) await MP.loadQuote(S);
  const m = MP.quotes[S] && MP.quotes[S].meta;
  if (!m){ MP.toast("Couldn't find " + S + '. Check the symbol.'); return; }
  const price = num(v.price) ?? m.regularMarketPrice;
  const P = load(), h = P.holdings[S] || {qty: 0, cost: 0, name: MP.displayName(S, m), currency: m.currency};
  if (side === 'buy'){
    h.cost = (h.cost * h.qty + price * q + fee) / (h.qty + q); h.qty += q;
  } else {
    if (q > h.qty + 1e-9){ MP.toast('You only hold ' + h.qty + ' shares.'); return; }
    const gain = (price - h.cost) * q - fee; P.realised[h.currency] = (P.realised[h.currency] || 0) + gain; h.qty -= q;
    MP.toast(`Realised ${signed(gain, h.currency)} on ${short(S)}`);
  }
  P.holdings[S] = h;
  P.trades.unshift({t: Date.now(), sym: S, side, qty: q, price, fee, currency: h.currency});
  P.trades = P.trades.slice(0, 300);
  save(P); await loadFx(); render();
  if (side === 'buy') MP.toast(`Added ${q} ${short(S)} at ${money(price, h.currency)}`);
  if (MP.current && MP.current() === S) renderPosition(S);
}
MP.trade = trade;

/* ---------- UI ---------- */
const COLORS = ['#2fd17a', '#5b8def', '#e8a317', '#e8251a', '#a46be8', '#18b5c9', '#ff8fb1', '#9aa4ac'];
function render(){
  const el = $('#port'); if (!el) return;
  const s = summary(), b = s.base;
  if (!s.ps.length){
    el.innerHTML = `<div class="card"><h3>Track what you own</h3><p>Record your buys and sells to see your holdings, today's change and profit or loss, converted to ${esc(b)}.</p><button class="btn" data-trade="buy">Record a buy</button></div>`;
    $('#port-trades').innerHTML = ''; return;
  }
  // allocation by market
  const alloc = {}; for (const x of s.ps){ const r = rate(x.currency); if (r != null && x.value != null) alloc[x.market] = (alloc[x.market] || 0) + x.value * r; }
  const parts = Object.entries(alloc).sort((a, b2) => b2[1] - a[1]);
  const bySec = {}; for (const x of s.ps){ const r = rate(x.currency); if (r != null && x.value != null) bySec[x.sector] = (bySec[x.sector] || 0) + x.value * r; }
  const secs = Object.entries(bySec).sort((a, b2) => b2[1] - a[1]);
  const barHTML = list => `<div class="alloc">${list.map(([k, v], i) => `<i style="width:${(v / s.value * 100).toFixed(1)}%;background:${COLORS[i % COLORS.length]}" title="${esc(k)}"></i>`).join('')}</div>
    <div class="legend">${list.map(([k, v], i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(k)} ${nf(v / s.value * 100, 0)}%</span>`).join('')}</div>`;
  el.innerHTML = `<div class="psum">
      <div class="nm">Portfolio value</div>
      <div class="big" style="font-size:clamp(30px,9vw,40px)">${money(s.value, b)}</div>
      <div class="${s.day >= 0 ? 'up-t' : 'down-t'}" style="font-weight:700">${signed(s.day, b)} (${pct(s.dayPct)}) today</div>
      <div class="pgrid"><div><span>Unrealised P&amp;L</span><b class="${s.pnl >= 0 ? 'up-t' : 'down-t'}">${signed(s.pnl, b)} · ${pct(s.pnlPct)}</b></div><div><span>Realised P&amp;L</span><b class="${s.realised >= 0 ? 'up-t' : 'down-t'}">${signed(s.realised, b)}</b></div><div><span>Invested</span><b>${money(s.cost, b)}</b></div><div><span>Holdings</span><b>${s.ps.length}</b></div></div>
      ${s.missing ? `<p class="note" style="margin:8px 0 0">${s.missing} holding(s) left out until prices or exchange rates load.</p>` : ''}
    </div>
    <div class="ctrl"><button class="btn" data-trade="buy">+ Buy</button><button class="btn alt" data-trade="sell">− Sell</button></div>
    <div class="sec"><h2>By market</h2></div>${barHTML(parts)}
    <div class="sec"><h2>By sector</h2></div>${barHTML(secs)}
    <div class="sec"><h2>Holdings</h2></div>
    <div class="list">${s.ps.map(x => `<button class="row" data-open="${esc(x.sym)}" style="grid-template-columns:minmax(0,1fr) auto">
      <div><div class="sym">${esc(short(x.sym))} <span class="nm" style="display:inline">${esc(x.name)}</span></div><div class="nm">${nf(x.qty, x.qty % 1 ? 2 : 0)} @ ${money(x.cost, x.currency)} · today <span class="${(x.dayPct || 0) >= 0 ? 'up-t' : 'down-t'}">${pct(x.dayPct)}</span></div></div>
      <div class="px">${money(x.value, x.currency)}<br><span class="pill ${(x.pnl || 0) >= 0 ? 'up' : 'down'}">${pct(x.pnlPct)}</span></div></button>`).join('')}</div>
    <p class="note">Values in each stock's own currency; totals in ${esc(b)} at live exchange rates. Change the base currency in Profile.</p>`;
  const tr = load().trades;
  $('#port-trades').innerHTML = tr.length ? `<details class="card"><summary><b>Trade history (${tr.length})</b></summary><div class="inbox" style="margin-top:8px">${tr.slice(0, 60).map(t => `<div><b>${t.side === 'buy' ? 'Bought' : 'Sold'} ${nf(t.qty, t.qty % 1 ? 2 : 0)} ${esc(short(t.sym))} at ${money(t.price, t.currency)}</b><span>${new Date(t.t).toLocaleDateString()}${t.fee ? ' · fee ' + money(t.fee, t.currency) : ''}</span></div>`).join('')}</div></details>` : '';
}
MP.renderPortfolio = render;
document.addEventListener('click', e => {
  const t = e.target.closest('[data-trade]'); if (t){ trade(t.dataset.trade, t.dataset.sym || ''); return; }
  const o = e.target.closest('#port [data-open]'); if (o) MP.openDetail(o.dataset.open, 'markets');
});

/* position card on the stock page */
function renderPosition(sym){
  const el = $('#position'); if (!el) return;
  const h = MP.holding(sym);
  if (sym.startsWith('^')){ el.innerHTML = ''; return; }
  if (!h){ el.innerHTML = `<div class="ctrl"><button class="btn alt" data-trade="buy" data-sym="${esc(sym)}">Record a buy of ${esc(short(sym))}</button></div>`; return; }
  const m = MP.quotes[sym] && MP.quotes[sym].meta, price = m && m.regularMarketPrice, value = price != null ? price * h.qty : null, pnl = value != null ? value - h.cost * h.qty : null;
  el.innerHTML = `<div class="sig"><div class="bar" style="margin:0 0 6px"><h2>Your position</h2></div>
    <div class="stats" style="margin:0"><div><span>Shares</span><b>${nf(h.qty, h.qty % 1 ? 2 : 0)}</b></div><div><span>Avg cost</span><b>${money(h.cost, h.currency)}</b></div><div><span>Value</span><b>${money(value, h.currency)}</b></div><div><span>P&amp;L</span><b class="${(pnl || 0) >= 0 ? 'up-t' : 'down-t'}">${signed(pnl, h.currency)} · ${pct(pnl != null ? pnl / (h.cost * h.qty) * 100 : null)}</b></div></div>
    <div class="ctrl" style="margin-top:10px"><button class="btn alt" data-trade="buy" data-sym="${esc(sym)}">+ Buy more</button><button class="btn alt" data-trade="sell" data-sym="${esc(sym)}">− Sell</button></div></div>`;
}
MP.renderPosition = renderPosition;

/* base currency in Profile */
const bc = $('#s-base');
if (bc){ bc.addEventListener('change', async () => { store.set('mp.baseCur', bc.value); await loadFx(); render(); if (MP.onPortfolioChange) MP.onPortfolioChange(); }); }
MP.onBaseShow = () => { if (bc) bc.value = base(); };

MP.portfolioSymbols = () => { const p = load(); return Object.keys(p.holdings).filter(s => p.holdings[s].qty > 0); };
MP.loadFx = loadFx;
loadFx().then(render);
}
