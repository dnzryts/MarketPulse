/* Swipe between screens, swipe back from detail pages, pull to refresh, animated tab indicator. */
{
const MP = window.MP, {$} = MP, ORDER = MP.ORDER;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Gestures that start on these belong to the element itself (carousels, charts, row swipes, inputs).
// Rows with swipe-to-delete keep left swipes; a right swipe on them still changes screen.
const OWN = '.wallet,.hscroll,.chips,.mentions,.ranges,.seg,.subnav,.fig,table,input,textarea,select,.sheet,.toast,nav,header';
const current = () => ((document.querySelector('.view.on') || {}).id || '').slice(2);

// Once a screen's entrance animation ends, freeze it so a drag can't replay it.
document.addEventListener('animationend', e => { if (e.target.classList && e.target.classList.contains('view')) e.target.classList.add('done'); });

/* ---------- tab indicator ---------- */
MP.onViewChange = (v, tab) => {
  const i = ORDER.indexOf(tab), pill = $('#navpill');
  pill.style.opacity = i < 0 ? 0 : 1;
  if (i >= 0) pill.style.transform = `translateX(${i * 100}%)`;
};
MP.onViewChange(current(), current());

/* ---------- horizontal swipe ---------- */
let g = null;
const ptr = $('#ptr');
document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || !$('#modal').hidden || e.target.closest(OWN)){ g = null; return; }
  const t = e.touches[0], v = current(), el = $('#v-' + v);
  g = {x: t.clientX, y: t.clientY, t: performance.now(), v, el, mode: null, dx: 0, dy: 0, top: window.scrollY <= 0, onRow: !!e.target.closest('.sw')};
}, {passive: true});

document.addEventListener('touchmove', e => {
  if (!g) return;
  const t = e.touches[0]; g.dx = t.clientX - g.x; g.dy = t.clientY - g.y;
  if (!g.mode){
    if (Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6){ if (g.onRow && g.dx < 0){ g = null; return; } g.mode = 'h'; }
    else if (g.dy > 14 && g.top && ORDER.includes(g.v) && Math.abs(g.dy) > Math.abs(g.dx) * 1.6) g.mode = 'pull';
    else if (Math.abs(g.dy) > 14){ g = null; return; }
    else return;
  }
  if (g.mode === 'h'){
    const i = ORDER.indexOf(g.v), canNext = i >= 0 && i < ORDER.length - 1, canPrev = i > 0 || i < 0;
    const allowed = g.dx < 0 ? canNext : canPrev;
    const d = allowed ? g.dx * .45 : g.dx * .12;          // rubber band at the ends
    if (!reduced){ g.el.classList.add('dragging'); g.el.style.transform = `translateX(${d}px)`; g.el.style.opacity = String(1 - Math.min(.4, Math.abs(d) / 500)); }
  } else if (g.mode === 'pull'){
    const d = Math.min(90, g.dy * .5);
    ptr.style.opacity = Math.min(1, d / 50); ptr.style.transform = `translateY(${d - 40}px) rotate(${d * 4}deg)`;
  }
}, {passive: true});

function settle(el){
  el.classList.remove('dragging'); el.classList.add('settle');
  el.style.transform = ''; el.style.opacity = '';
  setTimeout(() => el.classList.remove('settle'), 260);
}
function goTab(name){ const b = document.querySelector(`nav [data-tab="${name}"]`); if (b) b.click(); }

document.addEventListener('touchend', () => {
  if (!g) return;
  const s = g; g = null;
  if (s.mode === 'h'){
    const fast = Math.abs(s.dx) / Math.max(1, performance.now() - s.t) > .45 && Math.abs(s.dx) > 36;
    const far = Math.abs(s.dx) > Math.min(110, window.innerWidth * .22);
    const i = ORDER.indexOf(s.v);
    let target = null;
    if (fast || far){
      if (i >= 0) target = s.dx < 0 ? ORDER[i + 1] : ORDER[i - 1];
      else if (s.dx > 0) target = 'back';              // detail, alerts, profile: swipe right = back
    }
    if (target){
      s.el.classList.remove('dragging'); s.el.style.transform = ''; s.el.style.opacity = '';
      if (target === 'back') window.handleBack(); else { goTab(target); window.scrollTo(0, 0); }
      hint(true);
    } else settle(s.el);
  } else if (s.mode === 'pull'){
    if (s.dy * .5 > 60){
      ptr.classList.add('go'); ptr.style.transform = 'translateY(20px)';
      $('#refresh').click();
      setTimeout(() => { ptr.classList.remove('go'); ptr.style.opacity = 0; ptr.style.transform = ''; }, 1200);
    } else { ptr.style.opacity = 0; ptr.style.transform = ''; }
  }
}, {passive: true});
document.addEventListener('touchcancel', () => { if (g && g.el) settle(g.el); g = null; ptr.style.opacity = 0; ptr.style.transform = ''; }, {passive: true});

/* ---------- one-time tip ---------- */
function hint(used){
  if (MP.store.get('mp.swipeTip', false)) return;
  MP.store.set('mp.swipeTip', true);
  if (!used) MP.toast('Tip: swipe left or right to switch screens, pull down to refresh');
}
setTimeout(() => hint(false), 2500);
}
