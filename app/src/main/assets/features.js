/* Dashboard, wishlist, analysed history, alerts & notifications, profile, theme, lock, swipe, toasts. */
{
const MP = window.MP, {$, esc, store, nf, pct, dp} = MP;
const N = () => window.Native || null;
const U = window.UNIVERSE;
const INDEX = {SGX: '^STI', NASDAQ: '^IXIC', NSE: '^NSEI'};
const today = () => new Date().toISOString().slice(0, 10);
const short = s => s.replace(/^\^/, '').replace(/\.(SI|NS)$/, '');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- toast & modal ---------- */
let toastT;
MP.toast = (msg, undo) => {
  const t = $('#toast'); $('#toast-t').textContent = msg;
  const b = $('#toast-b'); b.hidden = !undo; b.onclick = () => { t.hidden = true; undo && undo(); };
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, undo ? 5000 : 3000);
};
MP.modal = ({title, fields, ok = 'Save'}) => new Promise(res => {
  $('#m-title').textContent = title; $('#m-ok').textContent = ok;
  $('#m-body').innerHTML = fields.map(f => `<label class="field"><span>${esc(f.label)}</span>${f.type === 'select'
    ? `<select id="mf-${f.id}">${f.options.map(o => `<option value="${esc(o[0])}"${o[0] === f.value ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
    : `<input id="mf-${f.id}" type="${f.type === 'number' ? 'text' : 'text'}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"${f.upper ? ' autocapitalize="characters"' : ''}>`}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`).join('');
  const m = $('#modal'); m.hidden = false;
  const first = m.querySelector('input,select'); if (first) setTimeout(() => first.focus(), 50);
  const done = v => { m.hidden = true; $('#m-form').onsubmit = null; $('#m-cancel').onclick = null; res(v); };
  $('#m-cancel').onclick = () => done(null);
  $('#m-form').onsubmit = e => { e.preventDefault(); const v = {}; for (const f of fields) v[f.id] = $('#mf-' + f.id).value.trim(); done(v); };
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#m-cancel').click(); });
const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return isFinite(v) ? v : null; };

/* ---------- theme ---------- */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const t = store.get('mp.theme', 'system'), root = document.documentElement;
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && mq.matches);
  if (N() && N().setDarkBars) N().setDarkBars(dark);
  document.querySelectorAll('#s-theme button').forEach(b => b.classList.toggle('on', b.dataset.v === t));
}
mq.addEventListener('change', applyTheme);
$('#s-theme').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; store.set('mp.theme', b.dataset.v); applyTheme(); });

/* ---------- profile ---------- */
MP.profile = () => store.get('mp.profile', {name: '', markets: ['SGX', 'NASDAQ', 'NSE']});
const initials = n => (n || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
function renderMe(){
  const p = MP.profile(), i = initials(p.name);
  $('#me').textContent = i; $('#p-av').textContent = i;
  $('#p-name').textContent = p.name || 'Investor';
  $('#p-sub').textContent = (p.markets.length ? p.markets : ['No markets']).join(' · ');
}
$('#s-name').addEventListener('change', () => { const p = MP.profile(); p.name = $('#s-name').value.trim(); store.set('mp.profile', p); renderMe(); renderHome(); });
$('#s-mk').addEventListener('change', () => { const p = MP.profile(); p.markets = [...document.querySelectorAll('#s-mk input:checked')].map(i => i.value); store.set('mp.profile', p); renderMe(); renderHome(); });
$('#me').addEventListener('click', () => MP.show('profile'));

/* ---------- lock & notifications ---------- */
window.onLockChanged = (on, msg) => { $('#s-lock').checked = !!on; if (msg) MP.toast(msg); else MP.toast(on ? 'Fingerprint lock is on' : 'Fingerprint lock is off'); };
$('#s-lock').addEventListener('change', e => {
  const want = e.target.checked; e.target.checked = !want; // wait for the system prompt to confirm
  if (N() && N().setLock) N().setLock(want); else MP.toast('Fingerprint lock works in the Android app.');
});
const notifAllowed = () => N() && N().notificationsAllowed ? N().notificationsAllowed() : false;
window.onNotifyPermission = ok => { store.set('mp.notif', ok); $('#s-notif').checked = ok; renderNotifWarn(); MP.toast(ok ? 'Notifications are on' : 'Notifications are blocked. Allow them in Android settings.'); };
$('#s-notif').addEventListener('change', e => {
  if (e.target.checked){ e.target.checked = false; if (N() && N().requestNotifications) N().requestNotifications(); else MP.toast('Notifications work in the Android app.'); }
  else { store.set('mp.notif', false); MP.toast('In-app only. To fully stop alerts, switch them off below or in Android settings.'); }
});
$('#s-brk').addEventListener('change', e => store.set('mp.brk', e.target.checked));

/* ---------- AI settings ---------- */
$('#s-key').addEventListener('change', () => { store.set('mp.key', $('#s-key').value.trim()); MP.toast('API key saved'); if (MP.onAnalystShow) MP.onAnalystShow(); });
$('#s-model').addEventListener('change', () => store.set('mp.model', $('#s-model').value));
$('#s-web').addEventListener('change', () => store.set('mp.web', $('#s-web').checked));
$('#s-clear').addEventListener('click', () => { MP.clearChat(); MP.toast('Chat cleared'); });
$('#s-reset').addEventListener('click', () => { MP.resetWatch(); MP.toast('Watchlist reset'); });
$('#s-hist').addEventListener('click', () => { store.set('mp.done', []); renderDone(); MP.toast('History cleared'); });

MP.onProfileShow = () => {
  const p = MP.profile();
  $('#s-name').value = p.name || '';
  $('#s-mk').innerHTML = Object.keys(U).map(k => `<label><input type="checkbox" value="${k}"${p.markets.includes(k) ? ' checked' : ''}>${k}</label>`).join('');
  $('#s-lock').checked = !!(N() && N().isLockOn && N().isLockOn());
  if (N() && N().lockAvailable && !N().lockAvailable()) $('#lock-note').textContent = 'Set up a fingerprint or screen lock on your phone to use this.';
  $('#s-notif').checked = notifAllowed() && store.get('mp.notif', true);
  $('#s-brk').checked = store.get('mp.brk', true);
  $('#s-key').value = store.get('mp.key', '');
  $('#s-model').value = store.get('mp.model', 'claude-sonnet-5-5');
  $('#s-web').checked = store.get('mp.web', true);
  applyTheme(); renderMe();
};

/* ---------- swipe to delete ---------- */
function swipe(container, onDelete){
  let row = null, wrap = null, x0 = 0, y0 = 0, dx = 0, dragging = false, moved = false;
  container.addEventListener('pointerdown', e => {
    wrap = e.target.closest('.sw'); if (!wrap || e.pointerType === 'mouse' && e.button) return;
    row = wrap.children[1]; x0 = e.clientX; y0 = e.clientY; dx = 0; dragging = false; moved = false;
  });
  container.addEventListener('pointermove', e => {
    if (!row) return;
    const ddx = e.clientX - x0, ddy = e.clientY - y0;
    if (!dragging){ if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5 && ddx < 0){ dragging = true; wrap.classList.add('drag'); try { row.setPointerCapture(e.pointerId); } catch(_){} } else if (Math.abs(ddy) > 12){ row = null; return; } else return; }
    moved = true; dx = Math.min(0, ddx); row.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!row) return;
    wrap.classList.remove('drag');
    if (dragging && dx < -Math.min(110, row.offsetWidth * .3)){
      row.style.transform = 'translateX(-100%)'; const key = wrap.dataset.key;
      setTimeout(() => onDelete(key), reduced ? 0 : 180);
    } else row.style.transform = '';
    row = null; dragging = false;
  };
  container.addEventListener('pointerup', end); container.addEventListener('pointercancel', end);
  container.addEventListener('click', e => { if (moved){ e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}
swipe($('#watch'), sym => MP.removeWatch(sym));

/* ---------- alerts (stored natively so the background job can read them) ---------- */
function getAlerts(){ try { return N() && N().getAlerts ? JSON.parse(N().getAlerts()) : store.get('mp.alerts', []); } catch(e){ return []; } }
function saveAlerts(a){ if (N() && N().saveAlerts) N().saveAlerts(JSON.stringify(a)); else store.set('mp.alerts', a); }
MP.getAlerts = () => getAlerts().map(a => ({symbol: a.sym, type: a.type, value: a.value, active: a.active, source: a.src || 'manual'}));
function getInbox(){ try { return N() && N().getTriggered ? JSON.parse(N().getTriggered()) : store.get('mp.inbox', []); } catch(e){ return []; } }
function pushInbox(title, body){
  if (N() && N().notify){ if (notifAllowed()) N().notify(title, body); else MP.toast(title); }
  else { const l = store.get('mp.inbox', []); l.unshift({t: Date.now(), title, body}); store.set('mp.inbox', l.slice(0, 50)); MP.toast(title); }
  renderBadge();
}
const TYPES = [['above', 'Price rises above'], ['below', 'Price falls below'], ['move', 'Moves more than (% in a day)']];
const describe = a => a.type === 'move' ? `Moves ±${nf(a.value, 1)}% in a day` : (a.type === 'above' ? 'Above ' : a.src === 'wish' ? 'Buy target ' : 'Below ') + nf(a.value, dp(a.value));
async function newAlert(sym){
  const q = sym && MP.quotes[sym] && MP.quotes[sym].meta, p = q && q.regularMarketPrice;
  const v = await MP.modal({title: 'New price alert', ok: 'Create alert', fields: [
    {id: 'sym', label: 'Symbol', value: sym || '', placeholder: 'e.g. D05.SI, NVDA, RELIANCE.NS', upper: true},
    {id: 'type', label: 'Notify me when', type: 'select', value: 'above', options: TYPES},
    {id: 'value', label: 'Price or %', type: 'number', value: p ? nf(p * 1.05, dp(p)).replace(/,/g, '') : '', hint: p ? 'Current price ' + nf(p, dp(p)) : 'For daily moves enter a percentage, e.g. 5'}]});
  if (!v) return;
  const s = v.sym.toUpperCase(), val = num(v.value);
  if (!s || val == null || val <= 0){ MP.toast('Enter a symbol and a positive number.'); return; }
  const a = getAlerts(); a.unshift({id: 'a' + Date.now(), sym: s, name: MP.displayName(s), type: v.type, value: val, active: true, src: 'manual', created: Date.now()});
  saveAlerts(a); renderAlerts(); MP.toast('Alert created for ' + short(s));
  ensureNotifications();
}
function ensureNotifications(){ if (N() && N().requestNotifications && !notifAllowed()) N().requestNotifications(); }
function renderNotifWarn(){
  $('#notif-warn').innerHTML = N() && N().notificationsAllowed && !notifAllowed()
    ? '<div class="card"><h3>Notifications are off</h3><p>Allow notifications so alerts can reach you when the app is closed.</p><button class="btn" id="notif-on">Allow notifications</button></div>' : '';
  const b = $('#notif-on'); if (b) b.onclick = () => N().requestNotifications();
}
function renderAlerts(){
  const a = getAlerts();
  $('#alerts').innerHTML = a.length ? a.map(x => `<div class="sw" data-key="${esc(x.id)}"><div class="sw-bg">Delete</div><div class="al">
      <div><span class="sym">${esc(short(x.sym))}</span> <span class="nm" style="display:inline">${esc(x.name || '')}</span><div class="nm">${esc(describe(x))}${x.firedAt ? ' · fired ' + MP.ago(x.firedAt) : ''}${x.src === 'wish' ? ' · from wishlist' : ''}</div></div>
      <label class="switch" aria-label="Alert on"><input type="checkbox" data-tog="${esc(x.id)}"${x.active ? ' checked' : ''}><i></i></label></div></div>`).join('')
    : '<div class="empty">No alerts yet. Tap <b>+ New alert</b>, or set one from any stock page.</div>';
  const inbox = getInbox();
  $('#inbox').innerHTML = inbox.length ? inbox.slice(0, 30).map(i => `<div><b>${esc(i.title)}</b><span>${esc(i.body)} · ${MP.ago(i.t)}</span></div>`).join('') : '<div class="empty">Triggered alerts will appear here.</div>';
  renderNotifWarn(); renderBadge();
}
$('#alerts').addEventListener('change', e => {
  const id = e.target.dataset.tog; if (!id) return;
  const a = getAlerts(), x = a.find(y => y.id === id); if (!x) return;
  x.active = e.target.checked; if (x.active) delete x.firedAt; saveAlerts(a);
});
swipe($('#alerts'), id => {
  const before = getAlerts(); saveAlerts(before.filter(x => x.id !== id)); renderAlerts();
  MP.toast('Alert deleted', () => { saveAlerts(before); renderAlerts(); });
});
$('#al-add').addEventListener('click', () => newAlert(''));
$('#inbox-clear').addEventListener('click', () => { if (N() && N().clearTriggered) N().clearTriggered(); else store.set('mp.inbox', []); renderAlerts(); renderHome(); });
function renderBadge(){
  const seen = store.get('mp.seen', 0), n = getInbox().filter(i => i.t > seen).length, b = $('#badge');
  b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
}
MP.onAlertsShow = () => { renderAlerts(); store.set('mp.seen', Date.now()); renderBadge(); if (N() && N().checkAlertsNow) N().checkAlertsNow(); };
window.onAlertsChecked = () => { if ($('#v-alerts').classList.contains('on')) renderAlerts(); renderBadge(); };
window.openAlerts = () => MP.show('alerts');
$('#bell').addEventListener('click', () => MP.show('alerts'));

/* ---------- wishlist ---------- */
const getWish = () => store.get('mp.wish', []);
MP.getWish = () => getWish().map(w => ({symbol: w.sym, name: w.name, target_price: w.target, note: w.note, added: new Date(w.added).toISOString().slice(0, 10), price_when_added: w.priceAtAdd}));
function setWish(w){ store.set('mp.wish', w); syncWishAlerts(); renderWish(); renderHome(); }
function syncWishAlerts(){
  const wish = getWish(), a = getAlerts().filter(x => x.src !== 'wish' || wish.some(w => 'wish-' + w.sym === x.id));
  for (const w of wish){
    const id = 'wish-' + w.sym, ex = a.find(x => x.id === id);
    if (ex){ if (ex.value !== w.target){ ex.value = w.target; ex.active = true; delete ex.firedAt; } }
    else a.push({id, sym: w.sym, name: w.name, type: 'below', value: w.target, active: true, src: 'wish', created: Date.now()});
  }
  saveAlerts(a);
}
async function addWish(sym){
  const q = sym && MP.quotes[sym] && MP.quotes[sym].meta, p = q && q.regularMarketPrice;
  const ex = getWish().find(w => w.sym === sym);
  const v = await MP.modal({title: ex ? 'Edit wishlist target' : 'Add to wishlist', ok: ex ? 'Save' : 'Add', fields: [
    {id: 'sym', label: 'Symbol', value: sym || '', placeholder: 'e.g. D05.SI, NVDA, INFY.NS', upper: true},
    {id: 'target', label: 'Buy target price', type: 'number', value: ex ? ex.target : p ? nf(p * .95, dp(p)).replace(/,/g, '') : '', hint: p ? 'Current price ' + nf(p, dp(p)) + '. You\'ll be notified when it falls to your target.' : "You'll be notified when the price falls to your target."},
    {id: 'note', label: 'Note (optional)', value: ex ? ex.note : '', placeholder: 'Why you want it'}]});
  if (!v) return;
  const s = v.sym.toUpperCase(), t = num(v.target);
  if (!s || t == null || t <= 0){ MP.toast('Enter a symbol and a target price.'); return; }
  if (!MP.quotes[s]) await MP.loadQuote(s);
  const m = MP.quotes[s] && MP.quotes[s].meta;
  if (!m){ MP.toast("Couldn't find " + s + '. Check the symbol.'); return; }
  const w = getWish().filter(x => x.sym !== s);
  w.unshift({sym: s, name: MP.displayName(s, m), target: t, note: v.note, added: ex ? ex.added : Date.now(), priceAtAdd: ex ? ex.priceAtAdd : m.regularMarketPrice});
  setWish(w); MP.toast((ex ? 'Updated ' : 'Added ') + short(s) + ' to your wishlist'); ensureNotifications();
  if (MP.current() === s) $('#d-wish').textContent = 'Edit target';
}
function renderWish(){
  const w = getWish();
  $('#wish').innerHTML = w.length ? w.map(x => {
    const m = MP.quotes[x.sym] && MP.quotes[x.sym].meta, p = m && m.regularMarketPrice;
    const gap = p ? (p / x.target - 1) * 100 : null, hit = p != null && p <= x.target;
    const prog = p && x.priceAtAdd > x.target ? Math.max(0, Math.min(100, (x.priceAtAdd - p) / (x.priceAtAdd - x.target) * 100)) : hit ? 100 : 0;
    return `<div class="sw" data-key="${esc(x.sym)}"><div class="sw-bg">Remove</div><button class="row" data-open="${esc(x.sym)}" style="grid-template-columns:minmax(0,1fr) auto">
      <div><div class="sym">${esc(short(x.sym))} ${hit ? '<span class="tag good">At target</span>' : ''}</div><div class="nm">${esc(x.name)}${x.note ? ' · ' + esc(x.note) : ''}</div>
      <div class="tgt"><i style="width:${prog.toFixed(0)}%"></i></div></div>
      <div class="px">${p ? nf(p, dp(p)) : '–'}<br><span class="nm">Target ${nf(x.target, dp(x.target))}${gap != null && !hit ? ' · ' + nf(gap, 1) + '% away' : ''}</span></div></button></div>`;
  }).join('') : '<div class="empty">Your wishlist is empty. Add stocks you want to buy, with the price you\'d pay.</div>';
}
$('#wish').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) MP.openDetail(b.dataset.open, 'markets'); });
swipe($('#wish'), sym => { const before = getWish(); setWish(before.filter(x => x.sym !== sym)); MP.toast('Removed ' + short(sym) + ' from wishlist', () => setWish(before)); });
$('#wish-add').addEventListener('click', () => addWish(''));

/* ---------- analysed history ---------- */
MP.recordAnalysis = (r, kind) => {
  const l = store.get('mp.done', []), i = l.findIndex(x => x.sym === r.symbol), prev = i >= 0 ? l.splice(i, 1)[0] : null;
  const e = prev || {sym: r.symbol, first: Date.now()};
  if (r.score != null){ if (e.score != null && e.score !== r.score) e.prevScore = e.score; Object.assign(e, {name: r.name, score: r.score, label: r.label, price: r.price, chg: r.chg1d}); }
  if (r.ai) e.ai = r.ai;
  e.at = Date.now(); e.kind = kind === 'signals' && e.kind && e.kind !== 'signals' ? e.kind : kind;
  l.unshift(e); store.set('mp.done', l.slice(0, 60));
  if ($('#sub-done').classList.contains('on')) renderDone();
};
function renderDone(){
  const l = store.get('mp.done', []);
  $('#done').innerHTML = l.length ? l.map(x => `<button class="rrow" data-open="${esc(x.sym)}">
      <span class="score ${x.score >= 70 ? 's3' : x.score >= 50 ? 's2' : ''}">${x.score ?? '–'}</span>
      <span><span class="sym">${esc(short(x.sym))}</span> <span class="nm" style="display:inline">${esc(x.name || '')}</span>
      <span class="nm" style="display:block">${esc(x.label || '')}${x.prevScore != null ? ` · was ${x.prevScore}` : ''} · ${MP.ago(x.at)}${/ai/.test(x.kind || '') ? ' · AI analysed' : ''}</span>
      ${x.ai ? `<span class="nm" style="display:block;white-space:normal">${esc(x.ai.replace(/[#*|]/g, '').slice(0, 140))}…</span>` : ''}</span>
      <span class="px">${x.price != null ? nf(x.price, dp(x.price)) : ''}</span></button>`).join('')
    : '<div class="empty">Stocks you open or ask the analyst about will be listed here.</div>';
}
$('#done').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) MP.openDetail(b.dataset.open, 'markets'); });
$('#done-clear').addEventListener('click', () => { store.set('mp.done', []); renderDone(); });

/* ---------- Markets sub-tabs ---------- */
function showSub(s){
  document.querySelectorAll('#subnav button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  document.querySelectorAll('.sub').forEach(x => x.classList.toggle('on', x.id === 'sub-' + s));
  if (s === 'wish') renderWish(); if (s === 'done') renderDone();
}
$('#subnav').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) showSub(b.dataset.s); });
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g){ MP.show(g.dataset.go); window.scrollTo(0, 0); return; }
  const s = e.target.closest('[data-sub]'); if (s){ MP.show('markets'); showSub(s.dataset.sub); window.scrollTo(0, 0); }
});

/* ---------- detail page buttons ---------- */
MP.onDetailOpen = sym => { $('#d-wish').textContent = getWish().some(w => w.sym === sym) ? 'Edit target' : '+ Wishlist'; };
$('#d-wish').addEventListener('click', () => addWish(MP.current()));
$('#d-alert').addEventListener('click', () => newAlert(MP.current()));

/* ---------- breakout notifications from scans ---------- */
MP.onScan = res => {
  if (!store.get('mp.brk', true)) return;
  const mine = new Set(MP.getWatch().concat(getWish().map(w => w.sym))), sent = store.get('mp.brkSent', {}), d = today();
  for (const r of res.rows) if (r.score >= 70 && mine.has(r.symbol) && sent[r.symbol] !== d){
    sent[r.symbol] = d;
    pushInbox(`${short(r.symbol)} is on breakout watch (${r.score}/100)`, `${r.name}: ${r.tags.slice(0, 3).map(t => t[0]).join(', ')}. Price ${nf(r.price, dp(r.price))}.`);
  }
  store.set('mp.brkSent', sent);
  renderHome();
};

/* ---------- dashboard ---------- */
MP.extraSymbols = () => Object.values(INDEX).concat(getWish().map(w => w.sym));
function sparkPath(pts, W, H){
  if (!pts || pts.length < 2) return '';
  const ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
  return pts.map((p, i) => (i ? 'L' : 'M') + (i / (pts.length - 1) * W).toFixed(1) + ' ' + (H - 3 - (p[1] - lo) / sp * (H - 6)).toFixed(1)).join('');
}
function tick(el, to, d){
  if (reduced || !isFinite(to)){ el.textContent = nf(to, d); return; }
  const from = +(el.dataset.v || to * .985), t0 = performance.now(); el.dataset.v = to;
  const step = t => { const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3); el.textContent = nf(from + (to - from) * e, d); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function scans(){ return Object.keys(U).map(k => store.get('mp.scan.' + k, null)).filter(Boolean); }
function renderHome(){
  if (!$('#v-home')) return;
  const p = MP.profile(), h = new Date().getHours();
  $('#hello').textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (p.name ? ', ' + p.name.split(' ')[0] : '');
  const lu = MP.lastUpdate();
  $('#today').textContent = new Date().toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'long'}) + (lu ? ' · prices ' + new Date(lu).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '');
  const mk = (p.markets.length ? p.markets : Object.keys(U));
  const sc = {}; scans().forEach(s => sc[s.market] = s);
  // wallet cards
  const cards = mk.map(k => {
    const q = MP.quotes[INDEX[k]], m = q && q.meta, c = m && MP.change(m), top = sc[k] && sc[k].rows[0];
    return `<button class="wcard ${k.toLowerCase()}" data-card="${k}">
      <div class="wt"><span>${k} · ${esc(MP.displayName(INDEX[k]))}</span><span>${esc(U[k].currency)}</span></div>
      <div class="wv" data-num="${m ? m.regularMarketPrice : ''}">${m ? nf(m.regularMarketPrice) : '—'}</div>
      <div class="wc">${c ? (c.abs >= 0 ? '▲ ' : '▼ ') + pct(c.pct) + ' today' : 'Loading…'}</div>
      <svg class="ws" viewBox="0 0 300 46" preserveAspectRatio="none"><path d="${q ? sparkPath(q.pts, 300, 46) : ''}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <div class="wf"><span>${top ? 'Top pick: <b>' + esc(short(top.symbol)) + '</b> ' + top.score : 'Tap to scan for breakouts'}</span><span>${sc[k] ? 'Scanned ' + MP.ago(sc[k].at) : ''}</span></div></button>`;
  });
  const w = MP.getWatch().filter(s => !s.startsWith('^')).map(s => MP.quotes[s] && MP.quotes[s].meta && MP.change(MP.quotes[s].meta)).filter(Boolean);
  const upN = w.filter(c => c.pct >= 0).length;
  cards.push(`<button class="wcard mine" data-go="markets"><div class="wt"><span>My watchlist</span><span>${w.length} stocks</span></div>
    <div class="wv">${upN} <span style="font-size:18px;font-weight:700">up</span> · ${w.length - upN} <span style="font-size:18px;font-weight:700">down</span></div>
    <div class="wc">${w.length ? 'Average ' + pct(w.reduce((s, c) => s + c.pct, 0) / w.length) + ' today' : 'Add stocks to track them'}</div>
    <div class="wf" style="margin-top:auto"><span>${getWish().length} on wishlist</span><span>${getAlerts().filter(a => a.active).length} active alerts</span></div></button>`);
  const wl = $('#wallet'), keep = wl.scrollLeft;
  wl.innerHTML = cards.join(''); wl.scrollLeft = keep;
  wl.querySelectorAll('[data-num]').forEach(el => { const v = parseFloat(el.dataset.num); if (isFinite(v)) tick(el, v, 2); });
  $('#wdots').innerHTML = cards.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('');
  dots();
  // mood
  const rows = scans().flatMap(s => s.rows), above = rows.filter(r => r.sma50 && r.price > r.sma50).length;
  let moodPct, basis;
  if (rows.length){ moodPct = above / rows.length * 100; basis = `${above} of ${rows.length} scanned stocks are above their 50-day average`; }
  else if (w.length){ moodPct = upN / w.length * 100; basis = `${upN} of ${w.length} watchlist stocks are up today`; }
  const mood = moodPct == null ? 'Waiting for data' : moodPct >= 60 ? 'Bullish' : moodPct >= 40 ? 'Mixed' : 'Bearish';
  $('#mood').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="nm">Market mood</span><b>${mood}</b></div>
    <div class="mb"><i style="left:calc(${(moodPct ?? 50).toFixed(0)}% - 2px)"></i></div><div class="ml"><span>Bearish</span><span>Mixed</span><span>Bullish</span></div>
    <p class="note" style="margin:8px 0 0">${basis ? esc(basis) + '.' : 'Scan a market on the Radar tab to measure breadth.'}</p>`;
  // movers
  const mv = MP.getWatch().filter(s => !s.startsWith('^') && MP.quotes[s] && MP.quotes[s].meta).map(s => ({s, c: MP.change(MP.quotes[s].meta), m: MP.quotes[s].meta})).filter(x => x.c).sort((a, b) => Math.abs(b.c.pct) - Math.abs(a.c.pct)).slice(0, 8);
  $('#movers').innerHTML = mv.length ? mv.map(x => `<button class="mini" data-open="${esc(x.s)}"><b>${esc(short(x.s))}</b><span>${nf(x.m.regularMarketPrice, dp(x.m.regularMarketPrice))}</span><br><em class="${x.c.pct >= 0 ? 'up-t' : 'down-t'}">${pct(x.c.pct)}</em></button>`).join('') : '<span class="note" style="margin:0">Loading watchlist…</span>';
  // picks
  const picks = scans().filter(s => mk.includes(s.market)).flatMap(s => s.rows.map(r => ({...r, mk: s.market}))).filter(r => r.score >= 50).sort((a, b) => b.score - a.score).slice(0, 5);
  $('#picks').innerHTML = picks.length ? picks.map(r => `<button class="rrow" data-open="${esc(r.symbol)}"><span class="score ${r.score >= 70 ? 's3' : 's2'}">${r.score}</span>
      <span><span class="sym">${esc(short(r.symbol))}</span> <span class="nm" style="display:inline">${esc(r.name)} · ${r.mk}</span><span class="tags">${r.tags.slice(0, 3).map(t => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join('')}</span></span>
      <span class="px">${nf(r.price, dp(r.price))}<br><span class="${r.chg1d >= 0 ? 'up-t' : 'down-t'}" style="font-size:13px">${pct(r.chg1d)}</span></span></button>`).join('')
    : `<div class="empty">No scans yet. <button class="txtbtn" id="scan-all">Scan ${mk.join(', ')} now</button></div>`;
  const sa = $('#scan-all'); if (sa) sa.onclick = scanAll;
  // wishlist near target
  const nw = getWish().map(x => { const m = MP.quotes[x.sym] && MP.quotes[x.sym].meta; return {...x, p: m && m.regularMarketPrice}; }).filter(x => x.p).map(x => ({...x, gap: (x.p / x.target - 1) * 100})).sort((a, b) => a.gap - b.gap).slice(0, 3);
  $('#nearwish').innerHTML = nw.length ? nw.map(x => `<button class="row" data-open="${esc(x.sym)}" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="sym">${esc(short(x.sym))}</div><div class="nm">Target ${nf(x.target, dp(x.target))}</div></div><div class="px">${nf(x.p, dp(x.p))}<br><span class="nm">${x.gap <= 0 ? '<span class="up-t">At target</span>' : nf(x.gap, 1) + '% away'}</span></div></button>`).join('')
    : '<div class="empty">Add stocks you want to buy, with a target price, from any stock page.</div>';
  // recent alerts
  const ib = getInbox().slice(0, 3);
  $('#recent').innerHTML = ib.length ? ib.map(i => `<div><b>${esc(i.title)}</b><span>${esc(i.body)} · ${MP.ago(i.t)}</span></div>`).join('') : '<div class="empty">No alerts have fired yet.</div>';
  renderBadge();
}
function dots(){
  const wl = $('#wallet'), n = wl.children.length; if (!n) return;
  const i = Math.round(wl.scrollLeft / Math.max(1, wl.scrollWidth - wl.clientWidth) * (n - 1));
  [...$('#wdots').children].forEach((d, k) => d.classList.toggle('on', k === i));
}
$('#wallet').addEventListener('scroll', dots, {passive: true});
$('#wallet').addEventListener('click', e => { const c = e.target.closest('[data-card]'); if (c){ store.set('mp.market', c.dataset.card); MP.show('radar'); window.scrollTo(0, 0); } });
document.addEventListener('click', e => { const b = e.target.closest('#v-home [data-open]'); if (b) MP.openDetail(b.dataset.open, 'home'); });
let scanningAll = false;
async function scanAll(){
  if (scanningAll) return; scanningAll = true;
  const mk = MP.profile().markets.length ? MP.profile().markets : Object.keys(U);
  MP.setBusy(1);
  for (const k of mk){ $('#picks').innerHTML = `<div class="empty">Scanning ${k}…</div>`; try { await MP.scan(k); } catch(e){} }
  MP.setBusy(-1); scanningAll = false; renderHome();
}
$('#brief').addEventListener('click', () => MP.askAnalyst('Give me a morning brief for my focus markets: index moves, market mood, the top 3 breakout candidates in each market with what is driving them, notable news, how my watchlist and wishlist look, and what to watch today.'));
MP.onHomeShow = force => { renderHome(); if (force) scanAll(); };
MP.onQuotes = () => { if ($('#v-home').classList.contains('on')) renderHome(); if ($('#sub-wish').classList.contains('on')) renderWish(); };
MP.onWatchChange = () => { if ($('#v-home').classList.contains('on')) renderHome(); };

/* ---------- start ---------- */
const resume = window.onAppResume;
window.onAppResume = () => { resume && resume(); renderBadge(); if ($('#v-alerts').classList.contains('on')) renderAlerts(); };
applyTheme(); renderMe(); syncWishAlerts();
MP.show('home');
Promise.all(MP.extraSymbols().map(MP.loadQuote)).then(renderHome);
}
