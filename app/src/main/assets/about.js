/* App version, What's new (rendered from the bundled CHANGELOG.md) and the post-update note. */
{
const MP = window.MP, {$, esc, store} = MP;
const N = () => window.Native || null;

MP.version = () => {
  try { const v = N() && N().appVersion ? JSON.parse(N().appVersion()) : null; if (v && v.name) return v; } catch(e){}
  return {name: 'dev', code: 0};
};
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++){ const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };

/* ---------- changelog ---------- */
function source(){ try { return N() && N().readAsset ? N().readAsset('CHANGELOG.md') : (window.__changelog || null); } catch(e){ return null; } }
function parse(md){
  const out = []; let rel = null, grp = null;
  for (const line of (md || '').split('\n')){
    let m;
    if ((m = line.match(/^##\s+\[([^\]]+)\]\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?/))){ rel = {v: m[1], date: m[2] || '', groups: []}; out.push(rel); grp = null; }
    else if (rel && (m = line.match(/^###\s+(.+)/))){ grp = {title: m[1].trim(), items: []}; rel.groups.push(grp); }
    else if (rel && (m = line.match(/^\s*[-*]\s+(.+)/))){ if (!grp){ grp = {title: 'Changes', items: []}; rel.groups.push(grp); } grp.items.push(m[1]); }
  }
  return out;
}
MP.changelog = () => parse(source());
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString([], {day: 'numeric', month: 'short', year: 'numeric'}) : '';
const TAG = {Added: 'good', Changed: '', Fixed: 'hot', Removed: 'bad', Security: 'bad'};

function renderWhatsNew(){
  const v = MP.version(), rels = MP.changelog(), el = $('#wn-list');
  $('#wn-ver').textContent = v.name === 'dev' ? 'Development build' : `You have version ${v.name} (build ${v.code})`;
  if (!rels.length){ el.innerHTML = '<div class="empty">The changelog isn\'t available in this build.</div>'; return; }
  el.innerHTML = rels.map(r => `<div class="rel${r.v === v.name ? ' cur' : ''}">
      <div class="rel-h"><b>Version ${esc(r.v)}</b>${r.v === v.name ? '<span class="tag good">Installed</span>' : ''}<span class="nm">${esc(fmtDate(r.date))}</span></div>
      ${r.groups.map(g => `<div class="rel-g"><span class="tag ${TAG[g.title] ?? ''}">${esc(g.title)}</span><ul>${g.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul></div>`).join('')}
    </div>`).join('');
}
MP.showWhatsNew = () => { MP.show('whatsnew'); renderWhatsNew(); window.scrollTo(0, 0); };
$('#wn-back').addEventListener('click', () => MP.show('profile'));
const hb = window.handleBack;
window.handleBack = () => { if ($('#v-whatsnew').classList.contains('on') && $('#modal').hidden){ MP.show('profile'); return true; } return hb(); };

/* ---------- Profile → About ---------- */
function renderAbout(){
  const v = MP.version(), rels = MP.changelog(), cur = rels.find(r => r.v === v.name);
  $('#ab-ver').textContent = v.name === 'dev' ? 'Development build' : `${v.name} (build ${v.code})`;
  $('#ab-date').textContent = cur && cur.date ? 'Released ' + fmtDate(cur.date) : v.updated ? 'Installed ' + new Date(v.updated).toLocaleDateString() : '';
  $('#ab-news').textContent = cur && cur.groups[0] && cur.groups[0].items[0] ? cur.groups[0].items[0] : 'See the full list of changes.';
}
const prevProfile = MP.onProfileShow;
MP.onProfileShow = () => { prevProfile && prevProfile(); renderAbout(); };
$('#ab-open').addEventListener('click', MP.showWhatsNew);

/* ---------- note after an update ---------- */
setTimeout(() => {
  const v = MP.version(); if (v.name === 'dev') return;
  const seen = store.get('mp.seenVersion', null);
  const upgraded = seen ? cmp(v.name, seen) > 0 : !!(localStorage.getItem('mp.watch') || localStorage.getItem('mp.profile') || localStorage.getItem('mp.port'));
  store.set('mp.seenVersion', v.name);
  if (upgraded) MP.toast(`Updated to version ${v.name}`, MP.showWhatsNew, "What's new");
}, 3200);
}
