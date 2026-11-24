/* AI analyst: a Claude agent that researches with the app's own data tools plus web search. */
{
const MP = window.MP, {$, esc, store} = MP;
const API = 'https://api.anthropic.com/v1/messages';
const MAX_STEPS = 12;

const TOOLS = [
  {name: 'scan_market', description: 'Run the breakout scanner on a market and return the highest-scoring stocks with technical signals (price, 1-day change, distance to 20-day high, breakout flag, volume ratio vs 20-day average, RSI14, 20/50-day averages, 1M/3M returns) and 48-hour news buzz (headline count, tone, top headlines). Scores 0-100 are heuristics, not forecasts.',
    input_schema: {type: 'object', properties: {market: {type: 'string', enum: ['SGX', 'NASDAQ', 'NSE']}, limit: {type: 'integer', description: 'Rows to return, default 10, max 25'}, sort: {type: 'string', enum: ['score', 'volume', 'news', 'weakest'], description: 'Ranking, default score'}}, required: ['market']}},
  {name: 'analyze_stock', description: 'Full technical and news read on one stock or index: price, change, 20-day high/low, breakout/breakdown flags, volume ratio, RSI14, 20/50-day averages, 1W/1M/3M returns, 52-week range, breakout score, and recent headlines with tone. Use Yahoo Finance symbols: SGX ends in .SI (DBS = D05.SI), NSE ends in .NS (Reliance = RELIANCE.NS), NASDAQ is plain (NVDA).',
    input_schema: {type: 'object', properties: {symbol: {type: 'string'}}, required: ['symbol']}},
  {name: 'get_news', description: 'Latest headlines from Google News for a query, with source, publish time, a keyword-based tone score (positive > 0, negative < 0) and any SGX/NASDAQ/NSE tickers detected.',
    input_schema: {type: 'object', properties: {query: {type: 'string'}, days: {type: 'integer', description: 'Look-back window in days, default 3, max 30'}}, required: ['query']}},
  {name: 'find_symbol', description: 'Look up Yahoo Finance symbols by company name or ticker.',
    input_schema: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']}},
  {name: 'get_user_lists', description: "The user's watchlist, wishlist (stocks they want to buy, with target prices), active price alerts and portfolio (holdings, average cost, P&L in their base currency).",
    input_schema: {type: 'object', properties: {}}},
  {name: 'backtest_score', description: 'Historical test of the breakout score for a market (about 2 years, technical part only): for score buckets 70+, 50-69, 30-49, under 30, the average return vs the index and how often stocks beat the index over 5, 10 and 20 trading days. Use it to say how much to trust the score.',
    input_schema: {type: 'object', properties: {market: {type: 'string', enum: ['SGX', 'NASDAQ', 'NSE']}}, required: ['market']}},
  {name: 'get_events', description: 'Upcoming earnings (results) dates, ex-dividend and dividend payment dates for the user\'s stocks, or for given symbols, plus dividend yield and P/E.',
    input_schema: {type: 'object', properties: {symbols: {type: 'array', items: {type: 'string'}, description: 'Optional Yahoo symbols; default = the user\'s stocks'}, days: {type: 'integer', description: 'Look-ahead window, default 60'}}}}
];
const r2 = n => n == null || isNaN(n) ? null : Math.round(n * 100) / 100;
function compact(r){
  return {symbol: r.symbol, name: r.name, score: r.score, label: r.label, price: r2(r.price), currency: r.currency, chg1d_pct: r2(r.chg1d),
    high20: r2(r.hi20), low20: r2(r.lo20), pct_from_20d_high: r2(r.distHi20), breakout_20d: r.breakout, breakdown_20d: r.breakdown,
    volume_vs_20d_avg: r2(r.volRatio), rsi14: r2(r.rsi14), sma20: r2(r.sma20), sma50: r2(r.sma50), ret_1w_pct: r2(r.ret5), ret_1m_pct: r2(r.ret20), ret_3m_pct: r2(r.ret60),
    high52: r2(r.hi52), low52: r2(r.lo52), sector: r.sector || null, vs_index_1m_pct: r2(r.rs20), vs_index_3m_pct: r2(r.rs60), signals: r.tags.map(t => t[0]), news_48h: r.news || null, data_as_of: new Date(r.asOf * 1000).toISOString()};
}
const RUN = {
  async scan_market({market, limit = 10, sort = 'score'}, step){
    step('Scanning ' + market + '…');
    const res = await MP.scan(market);
    let rows = res.rows.slice();
    if (sort === 'volume') rows.sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0));
    if (sort === 'news') rows.sort((a, b) => ((b.news && b.news.count) || 0) - ((a.news && a.news.count) || 0));
    if (sort === 'weakest') rows.sort((a, b) => a.score - b.score);
    return {market, scanned_at: new Date(res.at).toISOString(), stocks_scanned: res.rows.length, results: rows.slice(0, Math.min(25, limit)).map(compact)};
  },
  async analyze_stock({symbol}, step){
    step('Analysing ' + symbol + '…');
    const r = await MP.analyze(symbol.toUpperCase(), true);
    if (MP.recordAnalysis) MP.recordAnalysis(r, 'ai');
    let headlines = [];
    try { headlines = (await MP.fetchNews(MP.newsQuery(r.symbol), 7)).slice(0, 8).map(n => ({title: n.title, source: n.src, published: new Date(n.t).toISOString(), tone: n.tone})); } catch(e){}
    return {...compact(r), headlines_7d: headlines};
  },
  async get_news({query, days = 3}, step){
    step('Reading news: ' + query);
    const items = await MP.fetchNews(query, Math.max(1, Math.min(30, days)));
    return items.slice(0, 15).map(n => ({title: n.title, source: n.src, published: new Date(n.t).toISOString(), tone: n.tone, tickers: n.syms}));
  },
  async find_symbol({query}, step){ step('Looking up ' + query); return await MP.searchSymbols(query); },
  async get_user_lists(){ return {watchlist: MP.getWatch(), wishlist: MP.getWish ? MP.getWish() : [], alerts: MP.getAlerts ? MP.getAlerts() : [], portfolio: MP.portfolioSummary ? MP.portfolioSummary() : null}; },
  async backtest_score({market}, step){ step('Backtesting the score on ' + market + ' (about a minute)…'); const r = await MP.backtest(market); const rd = x => x == null ? null : Math.round(x * 10) / 10; return {...r, buckets: r.buckets.map(b => ({bucket: b.bucket, horizons: b.horizons.map(h => ({days: h.days, n: h.n, avg_return_pct: rd(h.avg_return_pct), avg_vs_index_pct: rd(h.avg_vs_index_pct), beat_index_pct: rd(h.beat_index_pct)}))})), all: r.all.map(h => ({days: h.days, n: h.n, avg_vs_index_pct: rd(h.avg_vs_index_pct), beat_index_pct: rd(h.beat_index_pct)}))}; },
  async get_events({symbols, days = 60}, step){
    step('Checking results and dividend dates…');
    if (!symbols || !symbols.length) return await MP.upcomingEvents(days);
    const out = [];
    for (const s of symbols.slice(0, 15)){ try { const v = await MP.stockEvents(s.toUpperCase()); out.push({symbol: s.toUpperCase(), events: v.ev.map(e => ({event: e.kind, date: new Date(e.t).toISOString().slice(0, 10), estimated: !!e.est, detail: e.detail})), dividend_yield: v.facts.yield, pe_trailing: v.facts.pe, pe_forward: v.facts.fpe, market_cap: v.facts.cap}); } catch(e){ out.push({symbol: s, error: e.message}); } }
    return out;
  }
};

function system(){
  const p = MP.profile ? MP.profile() : {};
  return `You are MarketPulse Analyst, a market research assistant inside a mobile app, covering SGX (Singapore), NASDAQ (US) and NSE (India).
Today is ${new Date().toDateString()}; the user's time zone is ${Intl.DateTimeFormat().resolvedOptions().timeZone}.${p.name ? ' The user is ' + p.name + '.' : ''}${p.markets && p.markets.length ? ' Their focus markets: ' + p.markets.join(', ') + '.' : ''}
How to work:
- Get facts from tools; never invent prices, figures or news. Use scan_market to find candidates, analyze_stock for detail, get_news for headlines, and web search for context (earnings, guidance, deals, regulation, analyst actions, macro).
- A "breakout" candidate has price at or above its 20-day high on above-average volume with a supportive trend; stocks "in the news" with strong headline flow are worth checking for catalysts.
- You cannot predict prices. Frame outlooks as scenarios with rough likelihoods (e.g. "more likely than not", "low probability") and say what would confirm or invalidate each: key levels such as breakout level, support and stop/invalidation.
- Separate data from your interpretation. Mention risks (overbought RSI, low volume, negative news, market-wide selloff). Note data may be delayed.
- Write for a phone: short headings, bullets, compact tables of at most 5 columns, tickers in bold. Lead with the answer. End with one line: "Research only, not financial advice."`;
}

function md(src){
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" data-link="${u}">${t}</a>`);
  const lines = src.split('\n'); let out = '', list = null, table = [];
  const flushList = () => { if (list){ out += `</${list}>`; list = null; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter(r => !/^\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim())));
    out += '<table>' + rows.map((r, i) => '<tr>' + r.map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('') + '</tr>').join('') + '</table>'; table = [];
  };
  for (const l of lines){
    if (/^\s*\|.*\|\s*$/.test(l)){ flushList(); table.push(l.trim()); continue; } else flushTable();
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))){ flushList(); out += `<h3>${inline(m[2])}</h3>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))){ if (list !== 'ul'){ flushList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ if (list !== 'ol'){ flushList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) flushList();
    else { flushList(); out += `<p>${inline(l)}</p>`; }
  }
  flushList(); flushTable();
  return out;
}

/* ---------- conversation ---------- */
let history = [];             // API messages for this session
let log = store.get('mp.chat', []);   // [{role, text}] shown in the UI
let running = false;
const QUICK = [
  ['SGX breakouts today', 'Which SGX stocks are breaking out or close to it today? Check what is driving them.'],
  ['NASDAQ stocks in the news', 'Which NASDAQ stocks have the strongest news flow in the last 48 hours, and is the news a positive or negative catalyst?'],
  ['NSE momentum leaders', 'Find the NSE large caps with the strongest momentum and volume right now, and tell me which setups look most likely to keep running.'],
  ['Review my watchlist', 'Review my watchlist and wishlist: which names have improving or deteriorating signals, and is anything near my wishlist target prices?'],
  ['Morning market brief', 'Give me a morning brief across SGX, NASDAQ and NSE: index moves, the top 3 breakout candidates in each, key news, and what to watch today.']
];
function render(){
  $('#keycard').hidden = !!store.get('mp.key', '');
  $('#quick').innerHTML = log.length ? '' : QUICK.map((q, i) => `<button data-q="${i}">${esc(q[0])}</button>`).join('');
  $('#chat').innerHTML = log.map(m => m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>` : `<div class="msg ai">${m.err ? `<p class="down-t">${esc(m.text)}</p>` : md(m.text)}</div>`).join('');
}
function save(){ store.set('mp.chat', log.slice(-40)); }
MP.clearChat = () => { history = []; log = []; save(); render(); };
MP.onAnalystShow = render;

async function callClaude(body){
  const key = store.get('mp.key', '');
  const headers = {'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'};
  if (!(window.Native && Native.request)) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  try { return JSON.parse(await MP.http(API, {method: 'POST', headers, body: JSON.stringify(body), timeout: 200000})); }
  catch(e){
    let msg = e.message;
    try { const j = JSON.parse(e.body); if (j.error && j.error.message) msg = j.error.message; } catch(_){}
    const err = new Error(e.status === 401 ? 'Your API key was rejected. Check it in Profile.' : e.status === 429 ? 'Rate limited by the API. Wait a moment and try again.' : msg);
    err.status = e.status; err.raw = msg; throw err;
  }
}

async function send(text, sym){
  text = (text || '').trim(); if (!text || running) return;
  if (!store.get('mp.key', '')){ render(); $('#keycard').scrollIntoView({behavior: 'smooth'}); return; }
  running = true; $('#send').disabled = true;
  log.push({role: 'user', text}); render();
  const bubble = document.createElement('div'); bubble.className = 'msg ai';
  bubble.innerHTML = '<div class="steps"><div>Thinking…</div></div>'; $('#chat').appendChild(bubble);
  bubble.scrollIntoView({behavior: 'smooth', block: 'end'});
  const steps = bubble.querySelector('.steps');
  const step = s => { const d = document.createElement('div'); d.textContent = s; steps.appendChild(d); bubble.scrollIntoView({block: 'end'}); };
  const mark = history.length;
  history.push({role: 'user', content: text});
  let useWeb = store.get('mp.web', true), answer = '';
  try {
    for (let i = 0; i < MAX_STEPS; i++){
      const tools = TOOLS.slice(); if (useWeb) tools.push({type: 'web_search_20250305', name: 'web_search', max_uses: 5});
      let res;
      try { res = await callClaude({model: store.get('mp.model', 'claude-sonnet-5-5'), max_tokens: 4096, system: system(), tools, messages: history}); }
      catch(e){ if (useWeb && e.status === 400 && /web_search|tool/i.test(e.raw || '')){ useWeb = false; step('Web search unavailable on this key; continuing without it'); i--; continue; } throw e; }
      history.push({role: 'assistant', content: res.content});
      for (const b of res.content) if (b.type === 'server_tool_use' && b.name === 'web_search') step('Searching the web: ' + ((b.input && b.input.query) || ''));
      const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (res.stop_reason === 'pause_turn') continue;
      if (res.stop_reason === 'tool_use'){
        const calls = res.content.filter(b => b.type === 'tool_use');
        const results = await Promise.all(calls.map(async c => {
          try { const out = await RUN[c.name](c.input || {}, step); return {type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out)}; }
          catch(e){ return {type: 'tool_result', tool_use_id: c.id, content: 'Error: ' + e.message, is_error: true}; }
        }));
        history.push({role: 'user', content: results});
        continue;
      }
      answer = text; break;
    }
    if (!answer) answer = 'I ran out of research steps before finishing. Try a narrower question.';
    log.push({role: 'ai', text: answer});
    if (sym && MP.recordAnalysis) MP.recordAnalysis({symbol: sym, ai: answer.slice(0, 400)}, 'ai-summary');
  } catch(e){
    history.length = mark; // drop the failed exchange so the next question starts clean
    log.push({role: 'ai', text: e.message || 'Something went wrong.', err: true});
  }
  if (history.length > 30) history = [];
  save(); running = false; $('#send').disabled = false; render();
  const last = $('#chat').lastElementChild; if (last) last.scrollIntoView({behavior: 'smooth', block: 'start'});
}
/* AI headline sentiment: one quick call scores a batch of headlines. */
MP.aiSentiment = async items => {
  const cache = store.get('mp.aiTone', {}), todo = items.filter(n => !cache[n.title]).slice(0, 30);
  if (!todo.length) return 0;
  const universe = Object.entries(MP.BY_SYM).map(([s, e]) => s + '=' + e.name).join('; ');
  const prompt = `Rate how each headline is likely to affect the share price of the company it is about. Score -2 (very bearish) to 2 (very bullish), 0 if neutral or unclear.
Give a reason of at most 12 words, and list affected tickers using these Yahoo symbols where they match: ${universe}.
Reply with ONLY a JSON array, one object per headline: [{"i":0,"s":1,"why":"...","t":["NVDA"]}]
Headlines:
${todo.map((n, i) => i + '. ' + n.title + (n.src ? ' (' + n.src + ')' : '')).join('\n')}`;
  const res = await callClaude({model: 'claude-haiku-5-5', max_tokens: 2500, messages: [{role: 'user', content: prompt}]});
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/\[[\s\S]*\]/); if (!m) throw new Error('Unexpected AI reply');
  const arr = JSON.parse(m[0]); let k = 0;
  for (const o of arr){ const n = todo[o.i]; if (!n) continue; cache[n.title] = {s: Math.max(-2, Math.min(2, Math.round(+o.s || 0))), why: String(o.why || '').slice(0, 120), t: Array.isArray(o.t) ? o.t.map(String).slice(0, 4) : []}; k++; }
  const keys = Object.keys(cache); if (keys.length > 600) keys.slice(0, keys.length - 600).forEach(x => delete cache[x]);
  store.set('mp.aiTone', cache);
  return k;
};

MP.askAnalyst = (prompt, sym) => { MP.show('analyst'); setTimeout(() => send(prompt, sym), 50); };

$('#quick').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) send(QUICK[+b.dataset.q][1]); });
$('#send').addEventListener('click', () => { const v = $('#ask').value; $('#ask').value = ''; $('#ask').style.height = ''; send(v); });
$('#ask').addEventListener('input', () => { const t = $('#ask'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; });
$('#keybtn').addEventListener('click', () => MP.show('profile'));
render();
}
