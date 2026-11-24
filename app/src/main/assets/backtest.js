/* Backtest: replay ~2 years of daily prices and check whether high breakout scores led to better returns.
   Uses the technical part of the score only (old news isn't available), sampled every 3 trading days. */
{
const MP = window.MP, {$, esc, store, nf, pct} = MP;
const U = window.UNIVERSE;
const HORIZONS = [5, 10, 20];
const BUCKETS = [['70+', 70, 101], ['50–69', 50, 70], ['30–49', 30, 50], ['Under 30', 0, 30]];
const key = m => 'mp.bt.' + m;
const dkey = t => new Date(t * 1000).toISOString().slice(0, 10);

async function run(market, onProgress){
  const u = U[market];
  const idx = await MP.chart(u.index, '2y', '1d');
  const ic = idx.bars.map(b => b.c), ipos = {}; idx.bars.forEach((b, i) => ipos[dkey(b.t)] = i);
  const acc = BUCKETS.map(() => HORIZONS.map(() => ({n: 0, ret: 0, ex: 0, win: 0})));
  const all = HORIZONS.map(() => ({n: 0, ret: 0, ex: 0, win: 0}));
  let done = 0, used = 0;
  const list = u.list.slice(), q = list.slice();
  await Promise.all(Array.from({length: 5}, async () => { while (q.length){ const e = q.shift(); try {
    const d = await MP.chart(e[0], '2y', '1d'), bars = d.bars, n = bars.length;
    if (n < 120) throw 0;
    used++;
    for (let t = 60; t + 20 < n; t += 3){
      const j = ipos[dkey(bars[t].t)]; if (j == null || j < 61 || j + 20 >= ic.length) continue;
      const x = MP.indicators(bars.slice(0, t + 1), null);
      const s = MP.techScore(MP.withRS(x, {ret20: (ic[j] / ic[j - 20] - 1) * 100, ret60: (ic[j] / ic[j - 60] - 1) * 100})).score;
      const b = BUCKETS.findIndex(B => s >= B[1] && s < B[2]);
      HORIZONS.forEach((k, h) => {
        const r = bars[t + k].c / bars[t].c - 1, ir = ic[j + k] / ic[j] - 1, ex = r - ir;
        for (const a of [acc[b][h], all[h]]){ a.n++; a.ret += r; a.ex += ex; if (ex > 0) a.win++; }
      });
    }
  } catch(err){} onProgress && onProgress(++done / list.length); } }));
  const fin = a => ({n: a.n, avg_return_pct: a.n ? a.ret / a.n * 100 : null, avg_vs_index_pct: a.n ? a.ex / a.n * 100 : null, beat_index_pct: a.n ? a.win / a.n * 100 : null});
  const res = {market, at: Date.now(), stocks: used, from: dkey(idx.bars[0].t), to: dkey(idx.bars[idx.bars.length - 1].t),
    buckets: BUCKETS.map((B, i) => ({bucket: B[0], horizons: HORIZONS.map((k, h) => ({days: k, ...fin(acc[i][h])}))})),
    all: HORIZONS.map((k, h) => ({days: k, ...fin(all[h])}))};
  store.set(key(market), res);
  return res;
}
MP.backtest = async (market, fresh) => { const c = store.get(key(market), null); if (!fresh && c && Date.now() - c.at < 24 * 3600e3) return c; return run(market); };

function verdict(r){
  const top = r.buckets[0].horizons[2], base = r.all[2];
  if (!top.n || top.n < 30) return {cls: '', text: 'Too few 70+ readings in this period to judge the score yet.'};
  const edge = top.beat_index_pct - base.beat_index_pct;
  if (edge >= 3 && top.avg_vs_index_pct > 0) return {cls: 'up-t', text: `The score has an edge here: stocks scoring 70+ beat the index ${nf(top.beat_index_pct, 0)}% of the time over 20 days, versus ${nf(base.beat_index_pct, 0)}% for all readings.`};
  if (edge <= -3) return {cls: 'down-t', text: `High scores did worse than average here (${nf(top.beat_index_pct, 0)}% vs ${nf(base.beat_index_pct, 0)}% beating the index over 20 days). Breakouts in this market tended to fade: be cautious with 70+ picks.`};
  return {cls: '', text: `No clear edge: 70+ scores beat the index ${nf(top.beat_index_pct, 0)}% of the time over 20 days, close to the ${nf(base.beat_index_pct, 0)}% average. Treat the score as a shortlist, not a signal.`};
}
let busy = false;
MP.renderBacktest = async (market, el) => {
  const c = store.get(key(market), null);
  const draw = r => {
    const v = verdict(r);
    el.innerHTML = `<div class="card"><h3 class="${v.cls}">${esc(v.text)}</h3>
      <p style="margin:6px 0 0">${r.stocks} ${esc(U[market].label)} stocks, ${esc(r.from)} to ${esc(r.to)}, sampled every 3 trading days. Returns are price only, before costs, compared with ${esc(MP.displayName(U[market].index))}.</p></div>
      <div class="scroll"><table class="bt"><thead><tr><th>Score</th><th>5 days</th><th>10 days</th><th>20 days</th></tr></thead><tbody>
      ${r.buckets.concat([{bucket: 'All', horizons: r.all}]).map(b => `<tr${b.bucket === 'All' ? ' class="tot"' : ''}><td><b>${esc(b.bucket)}</b><br><span class="nm">${b.horizons[0].n.toLocaleString()} readings</span></td>${b.horizons.map(h => h.n ? `<td><b class="${h.avg_vs_index_pct >= 0 ? 'up-t' : 'down-t'}">${pct(h.avg_vs_index_pct)}</b><br><span class="nm">beat ${nf(h.beat_index_pct, 0)}%</span></td>` : '<td>–</td>').join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="note">Each cell: average return compared with the index, and how often the stock beat the index over that many trading days. News buzz isn't included because past headlines aren't available. Past results don't guarantee future ones.</p>
      <div class="ctrl"><button class="btn alt" id="bt-run">Run again (${esc(new Date(r.at).toLocaleDateString())})</button></div>`;
    $('#bt-run').onclick = () => go(true);
  };
  const go = async fresh => {
    if (busy) return; busy = true; MP.setBusy(1);
    el.innerHTML = '<div class="empty">Replaying two years of prices… <b id="bt-p">0%</b><br><span class="nm">About a minute; keep the app open.</span></div>';
    try { const r = fresh ? await run(market, p => { const x = $('#bt-p'); if (x) x.textContent = Math.round(p * 100) + '%'; }) : await MP.backtest(market); draw(r); }
    catch(e){ el.innerHTML = `<div class="err">Backtest failed (${esc(e.message || 'no data')}). Check your connection and try again.</div>`; }
    busy = false; MP.setBusy(-1);
  };
  if (c) draw(c);
  else el.innerHTML = `<div class="card"><h3>Does the breakout score work?</h3><p>Replay about two years of ${esc(U[market].label)} prices: every few days, score each stock as the app would have, then check how it did over the next 5, 10 and 20 trading days against the index.</p><button class="btn" id="bt-go">Run the backtest</button></div>`;
  const g = $('#bt-go'); if (g) g.onclick = () => go(true);
};
}
