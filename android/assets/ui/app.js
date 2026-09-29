'use strict';
/* היט דיינע אויגן – the app's own screens. All data comes live from the website through the
   Native bridge (MainActivity.Bridge); nothing is stored on any server of ours. */

const API = 'https://api.app.hitdanoigen.com';
const SITE = 'https://hitdanoigen.com';
const APP = 'https://app.hitdanoigen.com';
const N = window.Native;

const LEVELS = [
  { d: 1, n: 'דרך המסילה' }, { d: 3, n: 'חזק חזק' }, { d: 7, n: 'הכובש את יצרו' },
  { d: 14, n: "עבד ה'" }, { d: 30, n: 'גבור כח עושה דברו' }, { d: 50, n: 'ירא שמים' },
  { d: 70, n: "אוהב ה'" }, { d: 90, n: 'צדיק' }, { d: 180, n: 'צדיק גמור' }, { d: 365, n: 'בעל תשובה' },
];

const state = {
  tab: 'home',
  dash: null, user: null, prog: null, homeAt: 0,
  chart: { seg: 'c90', c90: null, woh: null, q: '' },
  journal: null,
  update: null,
};

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}

let rid = 0;
const pending = {};
window.onHttp = (id, status, body) => {
  const p = pending[id];
  delete pending[id];
  if (p) p({ status, body, ok: status >= 200 && status < 300, json() { try { return JSON.parse(body); } catch { return null; } } });
};
function http(method, url, body) {
  return new Promise((res) => {
    const id = ++rid;
    pending[id] = res;
    N.http(id, method, url, body == null ? '' : JSON.stringify(body));
  });
}
async function api(path, method = 'GET', body) {
  const r = await http(method, API + path, body);
  if (r.status === 401) { expired(); throw new Error('auth'); }
  if (!r.ok) throw new Error(r.status === 0 ? 'offline' : 'http ' + r.status);
  return r.json();
}
async function site(path) {
  const r = await http('GET', SITE + path);
  if (!r.ok) throw new Error(r.status === 0 ? 'offline' : 'http ' + r.status);
  return new DOMParser().parseFromString(r.body, 'text/html');
}
const errText = (e) => (e && e.message === 'offline'
  ? 'קיין אינטערנעט פארבינדונג. פרוביר נאכאמאל.'
  : 'עפעס איז נישט געגאנגען. פרוביר נאכאמאל.');

const pad = (n) => String(n).padStart(2, '0');
/** A warm line for the top of the counter card. */
function cheer(days) {
  if (days < 1) return 'יעדער גרויסער וועג הייבט זיך אן מיט איין שריט 💪';
  if (days < 3) return 'שיין אנגעהויבן! האלט אן ווייטער 🌱';
  if (days < 7) return 'דו גייסט גוט – יעדער טאג איז א געווינס ⭐';
  if (days < 30) return 'א גאנצע וואך און מער – שטארק! 🔥';
  if (days < 90) return 'דו ביסט אויפ\'ן וועג צום וואנט פון כבוד 🏆';
  if (days < 365) return 'א צדיק! דו בויסט א נייע לעבן 👑';
  return 'בעל תשובה – א גאנץ יאר און מער! מזל טוב 🎉';
}

/** 12-hour clock: 9:25 PM */
const fmt12 = (d) => `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const fmtGreg = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function fmtHeb(d) {
  try { return new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
  catch { return ''; }
}
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'א גוטע נאכט' : h < 12 ? 'גוט מארגן' : h < 17 ? 'א גוטן טאג' : 'א גוטן אווענט';
}
const levelFor = (days) => { let l = 0; LEVELS.forEach((x, i) => { if (days >= x.d) l = i + 1; }); return l; };
const awardImg = (lvl) => (lvl ? `${SITE}/media/com_chart/images/img/awards/small/award-${LEVELS[lvl - 1].d}.jpg` : '');
function nextGoal(days) {
  const next = LEVELS.find((x) => x.d > days);
  if (next) {
    const prev = [...LEVELS].reverse().find((x) => x.d <= days)?.d || 0;
    return { at: next.d, label: `שטאפל ${LEVELS.indexOf(next) + 1} – ${next.n}`, pct: (days - prev) / (next.d - prev) };
  }
  const years = Math.floor(days / 365) + 1;
  return { at: years * 365, label: years === 1 ? 'א יאר' : `${years} יאר ריין`, pct: (days % 365) / 365 };
}

/* ---------------- icons ---------------- */
const I = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  forum: '<path d="M17 8h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/><path d="M15 3H5a2 2 0 0 0-2 2v11l4-4h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  plan: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  play: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  sos: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  widget: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"/>',
  chev: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${I[n]}</svg>`;
const LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="146.73 0 23.92 31.29"><path fill="#8b62ff" d="M165.271 9.345V6.87a6.871 6.871 0 1 0-13.745 0v2.886a11.95 11.95 0 0 0-4.796 9.572c0 6.595 5.365 11.96 11.961 11.96 6.594 0 11.961-5.366 11.961-11.96 0-4.167-2.142-7.842-5.381-9.984M154.104 6.87a4.27 4.27 0 0 1 1.257-3.037 4.298 4.298 0 0 1 7.006 1.394c.216.522.327 1.08.326 1.644v1.185a11.9 11.9 0 0 0-4.002-.69c-1.624 0-3.174.325-4.588.916v-1.41zm4.588 21.726c-5.112 0-9.268-4.158-9.268-9.268s4.158-9.268 9.268-9.268 9.268 4.158 9.268 9.268-4.158 9.268-9.268 9.268"/><path fill="#8b62ff" d="M156.73 13.964a2.87 2.87 0 0 1 1.683 2.082 2.87 2.87 0 0 1-.772 2.562 2.867 2.867 0 0 1-3.81.238 2.9 2.9 0 0 1-.846-1.089 5.74 5.74 0 0 0 .878 5.076 5.72 5.72 0 0 0 4.601 2.315 5.73 5.73 0 0 0 5.506-4.16 5.74 5.74 0 0 0-.734-4.73 5.73 5.73 0 0 0-6.507-2.296z"/></svg>')}`;

/* ---------------- boot ---------------- */
function boot() {
  if (!N.isLoggedIn()) return showLogin();
  showApp();
  const a = N.takeAction();
  if (a) window.onNativeAction(a);
}

window.onNativeAction = (a) => {
  if (a === 'setback') { go('home'); setbackSheet(); }
};
window.onResumeApp = () => {
  // came back from signing up (or logging in) on the website: the app picked up the login
  if (N.isLoggedIn() && $('#nav')?.classList.contains('hidden') && !$('#chat') && $('.login')) { showApp(); toast('ברוך הבא! דו ביסט איינגעלאגט'); return; }
  if (!N.isLoggedIn() || !$('#nav') || $('#nav').classList.contains('hidden')) return;
  if (state.tab === 'home' && Date.now() - state.homeAt > 5 * 60_000) loadHome(true);
  if (typeof refreshUnread === 'function') refreshUnread();
  if (state.tab === 'home' && state.dash && $('#bBook')) $('#bBook').outerHTML = handbookCard(), $('#bBook') && ($('#bBook').onclick = () => N.openHandbook());
};
window.onBack = () => {
  if ($('#modal')) { closeModal(); return true; }
  if (window.overlayBack && window.overlayBack()) return true;
  if (state.tab !== 'home' && N.isLoggedIn()) { go('home'); return true; }
  return false;
};

/* ---------------- login ---------------- */
function showLogin(msg) {
  $('#nav').classList.add('hidden');
  const user = N.username() || '';
  view().innerHTML = `
    <div class="login">
      <img class="logo" src="${LOGO}" alt="">
      <h1>היט דיינע אויגן</h1>
      <p class="sub">לאג זיך איין מיט דיין יוזער-נעים און פאסווארט פונעם וועבזייטל</p>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
      <div id="lerr" class="err hidden"></div>
      <label class="field"><span>יוזער-נעים</span>
        <input id="lu" class="input" autocomplete="username" autocapitalize="off" spellcheck="false" dir="auto" value="${esc(user)}"></label>
      <label class="field"><span>פאסווארט</span>
        <div class="pw"><input id="lp" class="input" type="password" autocomplete="current-password" dir="ltr">
        <button id="eye" type="button" aria-label="ווייז">${icon('eye')}</button></div></label>
      <label class="check"><input id="lr" type="checkbox" checked>
        <span>בלייב איינגעלאגט<br><span class="muted small">דער פאסווארט ווערט געהאלטן ענקריפטעד נאר אויף דעם פאון, כדי די עפפ זאל זיך קענען אליין ריפרעשן.</span></span></label>
      <button id="lb" class="btn">לאג איין</button>
      <button class="btn line" id="lSign" style="margin-top:12px">נייע אקאונט? שרייב זיך איין</button>
      <p class="center small" style="margin-top:14px"><a href="#" id="lf">פארגעסן פאסווארט?</a></p>
    </div>`;
  const pw = $('#lp');
  $('#eye').onclick = () => { const s = pw.type === 'password'; pw.type = s ? 'text' : 'password'; $('#eye').innerHTML = icon(s ? 'eyeOff' : 'eye'); };
  $('#lf').onclick = (e) => { e.preventDefault(); N.openWeb(SITE + '/login', 'לאג איין'); };
  $('#lSign').onclick = () => N.signup();
  const submit = () => {
    const u = $('#lu').value.trim(), p = pw.value;
    if (!u || !p) { lerr('שרייב אריין יוזער-נעים און פאסווארט'); return; }
    $('#lb').disabled = true;
    $('#lb').innerHTML = '<span class="spinner" style="margin:0;width:22px;height:22px;border-width:3px"></span> מען לאגט איין...';
    N.login(u, p, $('#lr').checked);
  };
  $('#lb').onclick = submit;
  pw.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  if (!user) $('#lu').focus();
}
function lerr(m) { const e = $('#lerr'); e.textContent = m; e.classList.remove('hidden'); }
window.onLogin = (ok, err) => {
  if (ok) { state.dash = null; showApp(); toast('ברוך הבא!'); return; }
  const map = {
    bad_login: 'יוזער-נעים אדער פאסווארט איז נישט ריכטיג.',
    timeout: 'דער וועבזייטל ענטפערט נישט. קוק דעם אינטערנעט און פרוביר נאכאמאל.',
    busy: 'א מאמענט... פרוביר נאכאמאל.',
    need_login: 'לאג זיך איין נאכאמאל.',
  };
  lerr(map[err] || err || map.bad_login);
  const b = $('#lb');
  if (b) { b.disabled = false; b.textContent = 'לאג איין'; }
};
function expired() {
  if (expired.shown) return;
  expired.shown = true;
  showLogin('דיין לאגין איז אויסגעגאנגען – לאג זיך איין נאכאמאל.');
}

/* ---------------- shell / nav ---------------- */
const TABS = [
  { id: 'home', t: 'האום', i: 'home' },
  { id: 'chart', t: 'טשארט', i: 'chart' },
  { id: 'forum', t: 'טשעטס', i: 'chat' },
  { id: 'more', t: 'מער', i: 'more' },
];
function showApp() {
  expired.shown = false;
  const nav = $('#nav');
  nav.classList.remove('hidden');
  const tab = (t) => `<button data-t="${t.id}"><span class="pill">${icon(t.i)}</span>${t.t}</button>`;
  nav.innerHTML = tab(TABS[0]) + tab(TABS[1])
    + `<button class="fab-slot" id="fab" aria-label="אפדעיט דעם טשארט"><span class="fab">${icon('check')}</span><span class="fab-t">אפדעיט</span></button>`
    + tab(TABS[2]) + tab(TABS[3]);
  nav.querySelectorAll('button[data-t]').forEach((b) => (b.onclick = () => go(b.dataset.t)));
  $('#fab').onclick = () => { $('#fabBubble')?.remove(); updateSheet2(); };
  paintFab();
  go(state.tab || 'home');
  maybeCheckUpdate();
}
function go(tab) {
  state.tab = tab;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  window.scrollTo(0, 0);
  stopClock();
  document.body.classList.remove('wa');
  ({ home: renderHome, chart: renderChart, forum: renderForum, more: renderMore })[tab]();
}

/* ---------------- home ---------------- */
async function loadHome(quiet) {
  try {
    const [dash, user, prog] = await Promise.all([
      api('/dashboard'), api('/auth/user'), api('/dashboard/progress-dynamics?period=all-time'),
    ]);
    Object.assign(state, { dash, user, prog, homeAt: Date.now() });
    paintFab();
    if (state.tab === 'home') renderHome();
  } catch (e) {
    if (e.message !== 'auth' && !quiet && state.tab === 'home') {
      view().innerHTML = `<div class="page-title">האום</div><div class="card center"><p>${errText(e)}</p>
        <button class="btn ghost" id="retry">${icon('refresh')} פרוביר נאכאמאל</button></div>`;
      $('#retry').onclick = () => { view().innerHTML = '<div class="spinner"></div>'; loadHome(); };
    }
  }
}

/** Updated today? (server flag, or the last check-in happened on today's date here) */
function doneToday() {
  const d = state.dash;
  if (!d) return null;
  // the site's own flag (a new account has an "updated" date from signing up, which doesn't count)
  return !!d.stats?.checkInCompleted;
}

let bubbleShown = false;
/** Green outline when updated today; otherwise a speech bubble above it (once per app start). */
function paintFab() {
  const fab = $('#fab');
  if (!fab) return;
  const done = doneToday();
  if (done === null) return;
  fab.classList.toggle('done', done);
  fab.querySelector('.fab-t').textContent = done ? 'אפדעיטעד' : 'אפדעיט';
  const old = $('#fabBubble');
  if (done) { old?.remove(); return; }
  if (bubbleShown || old) return;
  bubbleShown = true;
  const b = document.createElement('button');
  b.id = 'fabBubble';
  b.className = 'fab-bubble';
  b.innerHTML = 'נאכנישט אפדעיטעד היינט <b>👇</b>';
  b.onclick = () => { b.remove(); updateSheet2(); };
  document.body.appendChild(b);
}

function streakStart() {
  const s = state.user?.userData?.streakStartDate;
  return s ? new Date(s) : null;
}

function renderHome() {
  if (!state.dash) {
    view().innerHTML = `<div class="skel" style="height:330px;margin:12px 0 14px;border-radius:28px"></div>
      <div class="skel" style="height:150px;margin-bottom:12px"></div><div class="skel" style="height:160px"></div>`;
    loadHome();
    return;
  }
  const { dash, user, prog } = state;
  const st = dash.stats || {};
  const start = streakStart();
  const days = start ? Math.max(0, Math.floor((Date.now() - start) / 86400000)) : st.cleanDaysStreak || 0;
  const lvl = levelFor(days);
  const goal = nextGoal(days);
  const name = user?.displayName || user?.username || N.username() || '';
  const done = !!st.checkInCompleted;
  const upd = dash.dailyCheckIn?.updatedAt ? new Date(dash.dailyCheckIn.updatedAt) : null;
  const lb = dash.leaderboard || {};

  view().innerHTML = `
    ${state.update?.available ? `<button class="banner" id="updBanner" style="width:100%">${icon('download')} <span class="grow">א נייע ווערזשן (${esc(state.update.latest)}) איז גרייט</span>${icon('chev')}</button>` : ''}
    <button class="staff-home hidden" id="staffHome"><span class="sp-av">ש</span><span class="grow"><b></b><span>דריק צו לייענען</span></span>${icon('chev')}</button>
    <header class="home-top">
      <div class="grow">
        <div class="ht-hello">${greeting()},</div>
        <div class="ht-name">${esc(name)}</div>
      </div>
      <button class="me-ring" id="meBadge" aria-label="מיין פראפיל" style="--p:${Math.round(goal.pct * 100)}">
        <span><b class="num">${days}</b><i>${lvl ? esc(LEVELS[lvl - 1].n) : 'טעג'}</i></span>
      </button>
    </header>
    <section class="hero hero2">
      <span class="blob b1"></span><span class="blob b2"></span>
      <div class="cheer">${esc(cheer(days))}</div>
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" class="ring-bg"/>
          <circle cx="60" cy="60" r="52" class="ring-fg" pathLength="100" style="stroke-dasharray:${Math.max(2, Math.round(goal.pct * 100))} 100"/>
        </svg>
        <div class="ring-in">
          <div class="days num" id="cDays">${days}</div>
          <div class="days-label">${days === 1 ? 'טאג ריין' : 'טעג ריין'}</div>
        </div>
      </div>
      <div class="clock2 num">
        <span><b id="cH">00</b> שעות</span><span><b id="cM">00</b> מינוט</span><span><b id="cS">00</b> סעק</span>
      </div>
      <div class="next">
        ${goal.at ? `<img src="${awardImg(Math.min(LEVELS.length, lvl + 1))}" alt="" onerror="this.style.visibility='hidden'">` : ''}
        <div class="grow">
          <div class="t">${lvl ? `שטאפל ${lvl} · ${esc(LEVELS[lvl - 1].n)}` : 'דיין רייזע הייבט זיך אן! 🌱'}</div>
          <div class="s">נאך <b>${goal.at - days}</b> ${goal.at - days === 1 ? 'טאג' : 'טעג'} ביז ${esc(goal.label)} 🎯</div>
          <div class="bar"><i style="width:${Math.max(3, Math.round(goal.pct * 100))}%"></i></div>
        </div>
      </div>
      ${start ? `<div class="since">🗓️ זינט ${esc(fmtHeb(start))} · <span class="ltr">${esc(fmtGreg(start))}</span></div>` : ''}
    </section>

    <section class="card checkin">
      <h3>${days >= 90 ? 'וואנט פון כבוד' : '90-טעג טשארט'}</h3>
      ${done ? `<div class="done-chip">${icon('check')} אפדעיטעד היינט${upd ? ' <span class="ltr">' + fmt12(upd) + '</span>' : ''}</div>`
        : '<p>ביסטו נאך אלץ ריין? אפדעיט דיין טשארט פאר היינט.</p>'}
      <div class="ci-tiles">
        <button class="ci-tile clean${done ? ' done' : ''}" id="bClean">
          <span class="ci-ic">${done ? '✅' : '💪'}</span><b>איך בין נאך אלץ ריין</b><span>${done ? 'שוין אפדעיטעד – נאכאמאל?' : 'אפדעיט דעם טשארט'}</span>
        </button>
        <button class="ci-tile fall" id="bFall">
          <span class="ci-ic">🌱</span><b>איך האב געהאט א דורכפאל</b><span>הייב אן פון דאס נייע</span>
        </button>
      </div>
      <div class="ci-links">
        <button id="ciDiary">📔 טאג-בוך</button>
        <button id="ciChart">📊 טשארט</button>
        <button id="ciRemind">🔔 רימיינדערס</button>
      </div>
    </section>

    <div class="section-title">סטאטיסטיקס</div>
    <div class="stats">
      <div class="stat"><b class="num">${prog?.victories ?? st.cleanDaysCount ?? 0}</b><span>ריינע טעג אינגאנצן</span></div>
      <div class="stat"><b class="num">${prog?.longestStreak ?? 0}</b><span>לענגסטע טעג ריין</span></div>
      <div class="stat"><b class="num">${prog?.successRate ?? st.successRate ?? 0}%</b><span>סוקסעס ראטע</span></div>
      <div class="stat"><b class="num">${prog?.setbacks ?? 0}</b><span>דורכפעלער</span></div>
    </div>

    ${lb.userList?.length ? `
    <div class="section-title">טשארט</div>
    <section class="card">
      <div class="row" style="margin-bottom:8px"><div class="grow"><div class="muted small">דיין פלאץ</div>
        <div class="rank-big num">#${esc(lb.rank)}</div><div class="muted small">פון ${esc(lb.usersCount)} מיטגלידער</div></div>
        <button class="btn sm ghost" id="bWall">${icon('star')} וואנט פון כבוד</button></div>
      ${lb.userList.slice(0, 5).map((u, i) => `<div class="lb-row"><span class="lb-n">${i + 1}</span><span class="grow">${esc(u.username)}</span><b class="num">${u.currentStreak}</b><span class="muted small">טעג</span></div>`).join('')}
    </section>` : ''}

    ${handbookCard()}

    <section class="card ai-card"><div class="row" style="margin-bottom:10px"><span style="font-size:22px">🤖</span>
      <b class="grow">AI געהילף</b><span class="muted small">רעד יעצט, ענטפערט גלייך</span></div>
      <div id="aiHome" class="ai-list"><div class="skel" style="height:64px"></div></div></section>

    ${!N.hasWidget() && N.canPinWidget() ? `
    <button class="card row" id="bWidget" style="width:100%;text-align:right">
      <span class="ic" style="width:42px;height:42px;border-radius:14px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center">${icon('widget')}</span>
      <span class="grow"><b>לייג צו א ווידזשעט</b><br><span class="muted small">זע דיינע טעג און אפדעיט דעם טשארט גלייך פון די האום-סקרין</span></span>${icon('chev')}
    </button>` : ''}
    <div class="pull">דאטא גלייך פון די וועבזייטל · <a href="#" id="bRefresh">ריפרעש</a></div>`;

  $('#bClean').onclick = () => checkInClean();
  $('#meBadge').onclick = () => profileMenu();
  $('#staffHome').onclick = () => N.openStaff();
  paintStaff();
  $('#bFall').onclick = () => setbackSheet();
  $('#ciDiary').onclick = () => { state.chart.seg = 'diary'; go('chart'); };
  $('#ciChart').onclick = () => { state.chart.seg = days >= 90 ? 'woh' : 'c90'; go('chart'); };
  $('#ciRemind').onclick = () => { go('more'); setTimeout(() => $('#rOn')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); };
  $('#bWall') && ($('#bWall').onclick = () => { state.chart.seg = 'woh'; go('chart'); });
  $('#bWidget') && ($('#bWidget').onclick = () => N.pinWidget());
  $('#bBook') && ($('#bBook').onclick = () => N.openHandbook());
  loadBots().then((bots) => {
    const box = $('#aiHome');
    if (!box) return;
    if (!bots.length) { box.closest('.ai-card').remove(); return; }
    box.innerHTML = aiButtons(bots);
    bindAi(box);
  });
  $('#updBanner') && ($('#updBanner').onclick = () => updateSheet());
  $('#bRefresh').onclick = (e) => { e.preventDefault(); toast('ריפרעשט...'); loadHome(); };
  startClock(start);
}

function handbookCard() {
  let h = {};
  try { h = JSON.parse(N.handbookInfo()); } catch {}
  const sub = h.read && h.pages
    ? `ווייטער לייענען – בלאט ${h.page} פון ${h.pages}${h.marks ? ` · ★ ${h.marks}` : ''}`
    : 'עצות און חיזוק פונעם 90-טעג פראגראם – לייען אויפן פאון';
  const pct = h.read && h.pages ? Math.round((h.page / h.pages) * 100) : 0;
  return `<button class="card row" id="bBook" style="width:100%;text-align:right">
      <span style="width:46px;height:46px;border-radius:14px;background:var(--accent-soft);display:grid;place-items:center;font-size:24px;flex:none">📖</span>
      <span class="grow"><b>האנטבוך</b><br><span class="muted small">${esc(sub)}</span>
        ${pct ? `<span class="bar" dir="rtl" style="background:var(--accent-soft);display:flex;justify-content:flex-start;margin-top:6px"><i style="width:${pct}%;background:var(--accent);margin-left:auto"></i></span>` : ''}</span>${icon('chev')}
    </button>`;
}

let clockT = 0;
function startClock(start) {
  stopClock();
  if (!start) return;
  const tick = () => {
    const ms = Date.now() - start;
    if (!$('#cDays')) return stopClock();
    const d = Math.floor(ms / 86400000), rest = ms % 86400000;
    $('#cDays').textContent = d;
    $('#cH').textContent = pad(Math.floor(rest / 3600000));
    $('#cM').textContent = pad(Math.floor((rest % 3600000) / 60000));
    $('#cS').textContent = pad(Math.floor((rest % 60000) / 1000));
  };
  tick();
  clockT = setInterval(tick, 1000);
}
function stopClock() { clearInterval(clockT); clockT = 0; }

/* ---------------- check-in ---------------- */
async function checkInClean() {
  const b = $('#bClean');
  if (b) { b.disabled = true; b.innerHTML = '<span class="spinner" style="margin:0;width:22px;height:22px"></span>'; }
  try {
    const r = await api('/daily-check-in', 'POST', { isSetback: false });
    N.checkedIn(false);
    const streak = r?.cleanDaysStreak ?? state.dash?.stats?.cleanDaysStreak;
    const lvlUp = r?.levelAchieved;
    const rankTxt = r?.rank ? `<br>דו ביסט יעצט #${esc(r.rank)}${r.prevRank && r.prevRank > r.rank ? ` (ארויף פון #${esc(r.prevRank)})` : ''}` : '';
    openModal(`
      <div class="celebrate">🎉</div>
      <h2>${streak != null ? esc(streak) + ' טעג ריין!' : 'אפדעיטעד!'}</h2>
      <p>דיין טשארט איז אפדעיטעד פאר היינט.${lvlUp ? `<br><b>מזל טוב! דו ביסט ארויף צו שטאפל ${esc(lvlUp)}</b>` : ''}${rankTxt}<br>האלט אן ווייטער!</p>
      <button class="btn" data-close>שיין!</button>`);
    loadHome(true);
  } catch (e) {
    if (e.message !== 'auth') toast(errText(e));
    if (b) { b.disabled = false; b.innerHTML = icon('check') + ' איך בין נאך אלץ ריין'; }
  }
}

/** The big center button: one sheet with "still clean" / "had a fall". */
function updateSheet2() {
  const st = state.dash?.stats || {};
  const start = streakStart();
  const days = start ? Math.max(0, Math.floor((Date.now() - start) / 86400000)) : st.cleanDaysStreak;
  openModal(`
    <h2>${days != null ? esc(days) + ' טעג ריין' : 'אפדעיט דעם טשארט'}</h2>
    <p>${st.checkInCompleted ? '✓ דו האסט שוין אפדעיטעד היינט.' : 'ביסטו נאך אלץ ריין היינט?'}<br>
      <span class="small">${days >= 90 ? 'דאס אפדעיט דיין וואנט פון כבוד' : 'דאס אפדעיט דיין 90-טעג טשארט'}</span></p>
    <div class="btns">
      <button class="btn big-clean" id="u2Clean">${icon('check')} איך בין נאך אלץ ריין</button>
      <button class="btn red" id="u2Fall">איך האב געהאט א דורכפאל</button>
      <button class="btn line" data-close>צוריק</button>
    </div>`);
  $('#u2Clean').onclick = () => { closeModal(); checkInClean(); };
  $('#u2Fall').onclick = () => setbackSheet();
}

function setbackSheet() {
  const now = new Date();
  const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  openModal(`
    <h2>א דורכפאל</h2>
    <p>עס איז שווער, אבער וויכטיג איז אויפצושטיין און גיין ווייטער. יעדער ריינער טאג וואס דו האסט שוין געהאט בלייבט דיינער.</p>
    <label class="field"><span>ווען איז עס געשען?</span>
      <input id="sbDate" class="input" type="datetime-local" dir="ltr" value="${local(now)}" max="${local(now)}"></label>
    <label class="field"><span>וואספארא שטרויכלונגען/סיטואציעס טראכסטו האט צוגעברענגט דעם דורכפאל?</span>
      <textarea id="sbWhy" class="input" rows="3" dir="auto" placeholder="למשל: מיד, אליין, צו שפעט אין די נאכט…"></textarea></label>
    <label class="field"><span>וואספארא שריט וועסטו אונטערנעמען צו פארמיידן ווייטערדיגע דורכפעלער?</span>
      <textarea id="sbPlan" class="input" rows="3" dir="auto" placeholder="למשל: קיין פאון אין בעט, רופן א חבר…"></textarea></label>
    <div id="sbErr" class="err hidden"></div>
    <div class="btns">
      <button class="btn" id="sbGo">באשטעטיג</button>
      <button class="btn line" data-close>צוריק</button>
    </div>`);
  $('#sbGo').onclick = async () => {
    const v = $('#sbDate').value;
    const d = v ? new Date(v) : new Date();
    const why = $('#sbWhy').value.trim(), plan = $('#sbPlan').value.trim();
    const err = (m) => { const e = $('#sbErr'); e.textContent = m; e.classList.remove('hidden'); };
    if (d > new Date()) { err('די צייט קען נישט זיין אין די פיוטשער'); return; }
    if (!why || !plan) { err('ביטע ענטפער אויף ביידע פראגעס – דאס העלפט דיר דעם קומענדיגן מאל.'); return; }
    $('#sbGo').disabled = true;
    try {
      await api('/daily-check-in', 'POST', { isSetback: true, setbackDate: d.toISOString() });
      N.checkedIn(true);
      saveFallToChart(d, why, plan); // the 90-day chart keeps the answers in the diary, like the site
      openModal(`
        <div class="celebrate">💪</div>
        <h2>א נייער אנהויב</h2>
        <p>דיינע נייע ריינע טעג הייבן זיך אן יעצט. דו ביסט נישט אליין – רעד מיט איינעם, דאס העלפט.</p>
        <div class="btns">
          <button class="btn" id="sbPlan">${icon('plan')} מאך א פלאן</button>
          <a class="btn ghost" href="tel:+17185676100">${icon('phone')} רוף דעם האטליין</a>
          <button class="btn line" data-close>פארמאכן</button>
        </div>`);
      $('#sbPlan').onclick = () => { closeModal(); N.openWeb(APP + '/plan', 'מיין פלאן'); };
      loadHome(true);
    } catch (e) {
      if (e.message !== 'auth') toast(errText(e));
      $('#sbGo').disabled = false;
    }
  };
}

/** Same request as the site's own "update chart – fall" form, so the answers land in the diary. */
async function saveFallToChart(d, why, plan) {
  const ymd = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const fields = {
    timezone: String(new Date().getTimezoneOffset() * 60), status: 'fall',
    last_fall: ymd(d), clean_since: ymd(new Date()), situation: why, prevent: plan, user: '', ajax: 'true',
  };
  const body = Object.entries(fields).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const r = await new Promise((res) => { const id = ++rid; pending[id] = res; N.httpForm(id, SITE + '/90days/profile?view=profile&task=updateProfile&ajax=1&from=chart', body); });
  let j = null;
  try { j = JSON.parse(r.body); } catch {}
  if (!r.ok || (j && j.errors && Object.values(j.errors).some(Boolean))) toast('דער טאג-בוך האט נישט אנגענומען די ענטפערס – זיי זענען נישט געהיטן');
  state.journal = null;
}

/* ---------------- profile menu (like the site's top bar) ---------------- */
function profileMenu() {
  const u = state.user || {};
  const start = streakStart();
  const days = start ? Math.max(0, Math.floor((Date.now() - start) / 86400000)) : state.dash?.stats?.cleanDaysStreak || 0;
  const lvl = levelFor(days);
  openModal(`
    <div class="pm-head"><span class="pm-days">${days}</span>
      <div><b>${esc(u.username || N.username() || '')}</b><div class="muted small">${lvl ? esc(LEVELS[lvl - 1].n) : ''}</div></div></div>
    <div class="list" style="margin:0">
      <button class="item" data-pm="account"><span class="ic">${icon('users')}</span><span class="grow t">מיין קאנטע</span></button>
      <button class="item" data-pm="settings"><span class="ic">${icon('gear')}</span><span class="grow t">סעטינגס</span></button>
      <button class="item" data-pm="donate"><span class="ic">${icon('heart')}</span><span class="grow t">העלפט אונז</span></button>
      <button class="item" data-pm="out"><span class="ic" style="background:var(--red-soft);color:var(--red)">${icon('out')}</span><span class="grow t" style="color:var(--red)">לאג ארויס</span></button>
    </div>`);
  document.querySelectorAll('#modal [data-pm]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.pm;
    closeModal();
    if (a === 'account') N.openWeb(APP + '/settings/profile', 'מיין קאנטע');
    else if (a === 'settings') go('more');
    else if (a === 'donate') N.openWeb(SITE + '/donate', 'העלפט אונז');
    else { go('more'); setTimeout(() => $('#bOut')?.click(), 50); }
  }));
}

/* ---------------- messages from the staff (the site's messenger) ---------------- */
state.staffUnread = 0;
window.onStaffUnread = (n) => {
  const before = state.staffUnread;
  state.staffUnread = n;
  paintStaff();
  if (n > before && n > 0) staffPopup(n);
};
function paintStaff() {
  const n = state.staffUnread;
  const pill = document.querySelector('#nav button[data-t="more"] .pill');
  if (pill) {
    let s = pill.querySelector('.nav-badge');
    if (!n) s?.remove();
    else { if (!s) { s = document.createElement('span'); s.className = 'nav-badge'; pill.appendChild(s); } s.textContent = n > 99 ? '99+' : n; }
  }
  const row = $('#staffCount');
  if (row) row.innerHTML = n ? `<span class="wa-badge">${n}</span>` : '';
  const home = $('#staffHome');
  if (home) home.classList.toggle('hidden', !n), n && (home.querySelector('b').textContent = n === 1 ? '1 נייע מעסעדזש פון שטאב' : `${n} נייע מעסעדזשעס פון שטאב`);
}
/** Like the site: a small card pops up at the bottom when the staff writes. */
function staffPopup(n) {
  $('#staffPop')?.remove();
  const p = document.createElement('button');
  p.id = 'staffPop';
  p.className = 'staff-pop';
  p.innerHTML = `<span class="sp-av">ש</span><span class="grow"><b>${n === 1 ? 'א נייע מעסעדזש פון שטאב' : n + ' נייע מעסעדזשעס פון שטאב'}</b><span>דריק צו לייענען און ענטפערן</span></span><span class="sp-x" data-x>✕</span>`;
  p.onclick = (e) => { p.remove(); if (!e.target.closest('[data-x]')) N.openStaff(); };
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 12000);
}

/* ---------------- modal ---------------- */
function openModal(html) {
  closeModal();
  const m = document.createElement('div');
  m.id = 'modal';
  m.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModal(); };
  document.body.appendChild(m);
}
function closeModal() { $('#modal')?.remove(); }

/* ---------------- chart / wall of honor ---------------- */
function parseChart(doc) {
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const rows = [...doc.querySelectorAll('tr.user-row')];
  const meRow = rows.find((r) => r.classList.contains('first-line-user'));
  const meId = meRow ? meRow.id.replace('first-line-', '') : null;
  return rows
    .filter((r) => r === meRow || r.id !== meId)
    .map((tr) => {
      const q = (s) => txt(tr.querySelector(s));
      const upd = [...tr.querySelectorAll('.current-streak-block .parameter-title')].map(txt).find((t) => /אפדעיט/.test(t)) || '';
      const img = tr.querySelector('.award-wrapper img')?.getAttribute('src');
      const forum = tr.querySelector('.forum-link a[id^="a-link-forum-thread"]');
      return {
        pos: q('.number-block'),
        name: q('.username'),
        gender: q('.gender'),
        status: q('.maried-status'),
        longest: q('.recent-streak'),
        total: q('.accumulative-past'),
        current: q('.chart-last-update'),
        updated: upd.replace(/^לעצטע אפדעיט:\s*/, ''),
        began: q('.began-journey'),
        level: q('.wrapper-level .level').replace(/:$/, ''),
        levelName: q('.wrapper-level .parameter-value'),
        img: img ? (img.startsWith('http') ? img : SITE + img) : '',
        // my own row carries my chart settings
        myForumLink: forum && !forum.classList.contains('hide-block') && forum.getAttribute('href') !== '/' ? forum.getAttribute('href') : '',
        streakOnForum: /נישט/.test(txt(tr.querySelector('#edit-forum-current-streak'))),
        isPublic: tr.querySelector('#edit-info-visible') ? !tr.querySelector('#edit-info-visible').classList.contains('private-access') : null,
        forum: forum && !forum.classList.contains('hide-block') && forum.getAttribute('href') !== '/' ? forum.href : null,
        me: tr === meRow,
      };
    });
}

async function loadChart(seg, force) {
  const c = state.chart;
  if (c[seg] && !force && Date.now() - c[seg].at < 10 * 60_000) return;
  const doc = await site(seg === 'woh' ? '/90days/wall-of-honour' : '/90days');
  c[seg] = { rows: parseChart(doc), at: Date.now() };
}

function renderChart() {
  const c = state.chart;
  view().innerHTML = `
    <div class="page-title">טשארט</div>
    <div class="seg"><button data-s="c90">90-טעג טשארט</button><button data-s="woh">וואנט פון כבוד</button><button data-s="diary">טאג-בוך</button></div>
    <input class="search" id="q" placeholder="זוך א נאמען..." value="${esc(c.q)}" dir="auto">
    <div id="clist"><div class="spinner"></div></div>
    <div class="btns" style="margin-top:6px">
      <button class="btn line" id="cWeb">${icon('globe')} עפן דעם טשארט אויפ'ן וועבזייטל</button>
      <button class="btn line" id="cRules">וויאזוי דאס ארבעט</button>
    </div>`;
  document.querySelectorAll('.seg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.s === c.seg);
    b.onclick = () => { c.seg = b.dataset.s; renderChart(); };
  });
  if (c.seg === 'diary') {
    $('#q').remove();
    $('#cWeb').parentElement.remove();
    $('#clist').id = 'jbody';
    return renderJournal(true);
  }
  $('#q').oninput = (e) => { c.q = e.target.value; drawChartList(); };
  $('#cWeb').onclick = () => N.openWeb(SITE + (c.seg === 'woh' ? '/90days/wall-of-honour' : '/90days'), c.seg === 'woh' ? 'וואנט פון כבוד' : '90-טעג טשארט');
  $('#cRules').onclick = () => N.openWeb(SITE + '/90days/rules', 'וויאזוי דאס ארבעט');
  const seg = c.seg;
  loadChart(seg).then(() => { if (state.tab === 'chart' && c.seg === seg) drawChartList(); })
    .catch((e) => { if (state.tab === 'chart') $('#clist').innerHTML = `<div class="card center"><p>${errText(e)}</p><button class="btn ghost" onclick="renderChart()">פרוביר נאכאמאל</button></div>`; });
}

function personRow(p) {
  const fresh = /היינט|נעכטן/.test(p.updated);
  return `<div class="person${p.me ? ' me' : ''}">
    <span class="pos num">${esc(p.pos)}</span>
    ${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : ''}
    <div class="grow">
      <div class="name">${esc(p.name)} ${p.me ? '<span class="tag">דו</span>' : ''}</div>
      <div class="meta">${esc([p.levelName, p.status].filter(Boolean).join(' · '))}</div>
      <div class="meta ${fresh ? 'fresh' : 'stale'}">אפדעיט: ${esc(p.updated || '—')}</div>
      ${p.longest ? `<div class="meta">לענגסטע: ${esc(p.longest)} · סך הכל: ${esc(p.total)}</div>` : ''}
    </div>
    <div class="cur"><b class="num">${esc((p.current.match(/\d+/) || [''])[0])}</b><span>טעג</span></div>
  </div>`;
}

function drawChartList() {
  const c = state.chart;
  const data = c[c.seg];
  const box = $('#clist');
  if (!data || !box) return;
  const q = c.q.trim().toLowerCase();
  const rows = data.rows.filter((p) => !q || p.name.toLowerCase().includes(q));
  const me = data.rows.find((p) => p.me);
  let html = '';
  if (me && !q) {
    html += `<div class="section-title">דיין שורה</div><div class="list me-card">${personRow(me)}
      ${me.began ? `<div class="item small muted" style="display:block">${esc(me.began)}</div>` : ''}
      <div class="row-opts">
        <button data-o="link">🔗 ${me.myForumLink ? 'טויש פארום-לינק' : 'לייג צו דיין פארום-לינק'}</button>
        <button data-o="streak">${me.streakOnForum ? '🔥 שטרעקע אויפ\'ן פארום: אן' : '🚫 שטרעקע אויפ\'ן פארום: אויס'}</button>
        <button data-o="public">${me.isPublic !== false ? '👁️ פובליק' : '🔒 פריוואט'}</button>
        <button data-o="reset" class="danger">🔄 ריסעט</button>
      </div></div>`;
  }
  const others = rows.filter((p) => !p.me || q);
  html += `<div class="section-title">${c.seg === 'woh' ? 'וואנט פון כבוד' : '90-טעג טשארט'} · ${others.length}</div>`;
  html += others.length ? `<div class="list">${others.slice(0, 400).map(personRow).join('')}</div>` : '<div class="card center muted">קיינער נישט געפונען</div>';
  box.innerHTML = html;
  // the same options the site shows on your row, one tap each
  box.querySelectorAll('.row-opts [data-o]').forEach((b) => (b.onclick = async () => {
    const o = b.dataset.o;
    if (o === 'link') return forumLinkSheet(me);
    if (o === 'reset') return resetChart();
    b.disabled = true;
    try {
      if (o === 'streak') {
        await chartCall('POST', '/90days/profile?view=profile&task=editForumCurrentStreak&TOKEN=1&user=', 'do_not_display_current_streak=' + (me.streakOnForum ? 1 : 0));
        me.streakOnForum = !me.streakOnForum;
        toast(me.streakOnForum ? 'דיין שטרעקע ווייזט זיך אויפ\'ן פארום' : 'דיין שטרעקע ווייזט זיך נישט אויפ\'ן פארום');
      } else {
        await chartCall('GET', `/90days/profile?view=profile&task=editInformationHide&TOKEN=1&user=&hide=${me.isPublic !== false ? 1 : 0}`);
        me.isPublic = me.isPublic === false;
        toast(me.isPublic ? 'פובליק – אנדערע זעען דיין אינפארמאציע' : 'פריוואט – דיין אינפארמאציע איז באהאלטן');
      }
      drawChartList();
    } catch (e) { toast(errText(e)); b.disabled = false; }
  }));
  // tap your medal to see it big (like "דריק צו פארגרעסערן בילד")
  const medal = box.querySelector('.me-card .person img');
  if (medal) medal.onclick = () => {
    const small = medal.getAttribute('src');
    openModal(`<div class="center"><img class="big-medal" src="${esc(small.replace('/small/', '/large/'))}" onerror="this.onerror=null;this.src='${esc(small)}'"
      alt=""><h2 style="margin-top:12px">${esc(me.level)}: ${esc(me.levelName)}</h2><p>${esc(me.current)}</p></div>`);
  };
}

/* ---------------- my chart settings (native, no website) ---------------- */
async function chartToken() {
  const html = (await http('GET', SITE + '/90days/profile?tmpl=component&view=profile&layout=add_edit_forum_link')).body || '';
  const m = html.match(/([a-f0-9]{32})=1/);
  if (m) return m[1];
  // some accounts get a plain page here - every site page carries window.token
  const page = (await http('GET', SITE + '/90days')).body || '';
  const t = page.match(/window\.token\s*=\s*'([a-f0-9]{32})'/);
  if (!t) throw new Error('token');
  return t[1];
}
async function chartCall(method, path, body) {
  const tok = await chartToken();
  const url = SITE + path.replace('TOKEN', tok);
  const r = method === 'POST'
    ? await new Promise((res) => { const id = ++rid; pending[id] = res; N.httpForm(id, url, body); })
    : await http('GET', url);
  if (!r.ok) throw new Error(r.status === 0 ? 'offline' : 'http');
  try { return JSON.parse(r.body); } catch { return {}; }
}
function refreshChartAfterEdit() {
  state.chart.woh = null;
  state.chart.c90 = null;
  if (state.tab === 'chart') renderChart();
}

function chartSettings(me) {
  const link = me.myForumLink || '';
  openModal(`
    <h2>מיינע טשארט סעטינגס</h2>
    <div class="list" style="margin:8px 0 12px">
      <div class="item"><span class="ic">👁️</span><span class="grow"><span class="t">פובליק</span><div class="s">אנדערע קענען זען מיין אינפארמאציע אויפ'ן טשארט</div></span>
        <label class="switch"><input type="checkbox" id="csPublic" ${me.isPublic !== false ? 'checked' : ''}><i></i></label></div>
      <div class="item"><span class="ic">🔥</span><span class="grow"><span class="t">ווייז מיין שטרעקע אויפ'ן פארום</span><div class="s">נעבן דיינע מעלדונגען</div></span>
        <label class="switch"><input type="checkbox" id="csStreak" ${me.streakOnForum ? 'checked' : ''}><i></i></label></div>
      <button class="item" id="csLink"><span class="ic">🔗</span><span class="grow"><span class="t">מיין פארום-לינק</span><div class="s">${link ? esc(link.replace(/^https?:\/\//, '').slice(0, 48)) : 'נאך נישט צוגעלייגט – קלייב א טעמע'}</div></span>${icon('chev')}</button>
    </div>
    <button class="btn red" id="csReset">ריסעט מיין טשארט</button>
    <button class="btn line" data-close style="margin-top:10px">פארטיג</button>`);

  const toggle = (el, fn) => (el.onchange = async () => {
    const on = el.checked;
    el.disabled = true;
    try { await fn(on); toast('געהיטן ✓'); state.chart.woh = null; state.chart.c90 = null; }
    catch (e) { el.checked = !on; toast(errText(e)); }
    el.disabled = false;
  });
  toggle($('#csPublic'), (on) => chartCall('GET', `/90days/profile?view=profile&task=editInformationHide&TOKEN=1&user=&hide=${on ? 0 : 1}`));
  toggle($('#csStreak'), (on) => chartCall('POST', '/90days/profile?view=profile&task=editForumCurrentStreak&TOKEN=1&user=', 'do_not_display_current_streak=' + (on ? 0 : 1)));
  $('#csLink').onclick = () => forumLinkSheet(me);
  $('#csReset').onclick = () => resetChart();
}

function resetChart() {
  openModal(`
    <h2>ריסעט דעם טשארט?</h2>
    <p>דאס מעקט אויס דיין שטרעקע און רעקארד אויפ'ן 90-טעג טשארט און וואנט פון כבוד, און מען הייבט אן פון דאס נייע. מען קען דאס נישט צוריקמאכן.</p>
    <div class="btns"><button class="btn red" id="csResetYes">יא, ריסעט</button><button class="btn line" data-close>ניין, צוריק</button></div>`)
    || ($('#csResetYes').onclick = async () => {
      $('#csResetYes').disabled = true;
      try {
        await chartCall('GET', '/90days/profile/reset_info?ajax=true&TOKEN=1');
        closeModal();
        toast('דער טשארט איז ריסעט');
        refreshChartAfterEdit();
        // the site asks a few setup questions for the new chart
        N.openWeb(SITE + '/component/chart/profile/signup/step1', '90-טעג טשארט');
      } catch (e) { toast(errText(e)); $('#csResetYes').disabled = false; }
    });
}

/** Pick one of my own forum topics (or paste a link) as my forum link. */
async function forumLinkSheet(me) {
  openModal('<h2>מיין פארום-לינק</h2><div class="spinner"></div>');
  let mine = [];
  try { mine = parseTopics(await site('/forum/mylatest')).filter((t) => t.by && myName() && t.by.trim().toLowerCase() === myName()); }
  catch {}
  if (!mine.length) { try { mine = parseTopics(await site('/forum/mylatest')).slice(0, 15); } catch {} }
  openModal(`
    <h2>מיין פארום-לינק</h2>
    <p>קלייב דיין טעמע וואו דו שרייבסט וועגן דיין רייזע</p>
    ${mine.length ? `<div class="list" style="margin:0 0 12px">${mine.map((t, i) => `<button class="item" data-i="${i}"><span class="ic">💬</span><span class="grow"><span class="t">${esc(t.title)}</span><div class="s">${esc(t.cat || '')}</div></span></button>`).join('')}</div>` : ''}
    <label class="field"><span>אדער לייג אריין א לינק</span><input id="flUrl" class="input" dir="ltr" placeholder="https://hitdanoigen.com/forum?..." value="${esc(me.myForumLink || '')}"></label>
    <div class="btns">
      <button class="btn" id="flSave">היט אפ</button>
      ${me.myForumLink ? '<button class="btn red" id="flDel">נעם אראפ דעם לינק</button>' : ''}
      <button class="btn line" data-close>צוריק</button>
    </div>`);
  const save = async (url) => {
    try {
      await chartCall('GET', `/90days/profile?view=profile&task=saveForumLink&TOKEN=1&user=&forum_link=${encodeURIComponent(url)}`);
      closeModal();
      toast(url ? 'דער לינק איז געהיטן ✓' : 'דער לינק איז אראפגענומען');
      refreshChartAfterEdit();
    } catch (e) { toast(errText(e)); }
  };
  document.querySelectorAll('#modal [data-i]').forEach((b) => (b.onclick = () => {
    const t = mine[+b.dataset.i];
    save(`${SITE}/forum?func=view&catid=${t.catid}&id=${t.id}`);
  }));
  $('#flSave').onclick = () => {
    let u = $('#flUrl').value.trim();
    if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
    save(u);
  };
  $('#flDel') && ($('#flDel').onclick = () => save(''));
}

/* ---------------- journal ---------------- */
async function loadJournal() {
  const [ci, doc] = await Promise.all([
    api('/daily-check-in'),
    site('/90days/90-day-log?view=diary&limit=0').catch(() => null),
  ]);
  const entries = [];
  if (doc) {
    doc.querySelectorAll('.matchGrid').forEach((g) => {
      const parts = [...g.querySelectorAll('div')]
        .filter((d) => !d.querySelector('div'))
        .map((d) => d.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (!parts.length) return;
      const when = parts[0].replace(/^דאטום:\s*/, '');
      const what = parts[1] || '';
      entries.push({ when, what, more: parts.slice(2).join('\n'), kind: /דורכפאל/.test(what) ? 'bad' : /ערשטע טאג/.test(what) ? 'start' : 'good' });
    });
  }
  state.journal = { ci, entries: entries.reverse(), at: Date.now() };
}

function renderJournal(inChart) {
  if (!inChart) view().innerHTML = '<div class="page-title">טאג-בוך</div><div id="jbody"><div class="spinner"></div></div>';
  const here = () => $('#jbody') && (state.tab === 'journal' || state.tab === 'chart');
  const draw = () => {
    const j = state.journal;
    const days = j.ci?.days || [];
    const map = {};
    days.forEach((d) => (map[d.date] = d.setback ? 'bad' : 'ok'));
    const today = new Date();
    const cells = [];
    const first = new Date(today);
    first.setDate(first.getDate() - 55);
    first.setDate(first.getDate() - first.getDay()); // start on Sunday
    for (let d = new Date(first); d <= today; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const isToday = d.toDateString() === today.toDateString();
      cells.push(`<div class="d ${map[key] || ''}${isToday ? ' today' : ''}" title="${key}">${d.getDate()}</div>`);
    }
    const ok = days.filter((d) => !d.setback).length, bad = days.filter((d) => d.setback).length;
    $('#jbody').innerHTML = `
      <section class="card">
        <div class="row" style="margin-bottom:12px"><b class="grow">לעצטע 8 וואכן</b><span class="muted small">${ok} ריין · ${bad} דורכפאל</span></div>
        <div class="cal">${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((x) => `<div class="h">${x}</div>`).join('')}${cells.join('')}</div>
        <div class="legend"><span><i style="background:var(--green)"></i>ריין</span><span><i style="background:var(--red)"></i>דורכפאל</span><span><i style="background:var(--line)"></i>נישט אפדעיטעד</span></div>
      </section>
      <button class="btn ghost" id="jApp" style="margin-bottom:12px">${icon('book')} מיין פריוואטער זשורנאל</button>
      <div class="section-title">מיין 90-טעג רייזע</div>
      ${j.entries.length ? `<div class="list">${j.entries.map((e) => `<div class="entry ${e.kind}"><div class="when">${esc(e.when)}</div><div class="what">${esc(e.what)}</div>${e.more ? `<div class="more">${esc(e.more)}</div>` : ''}</div>`).join('')}</div>`
        : '<div class="card center muted">נאך נישטא קיין איינטראגן</div>'}`;
    $('#jApp').onclick = () => N.openWeb(APP + '/journal', 'זשורנאל');
  };
  if (state.journal && Date.now() - state.journal.at < 5 * 60_000) return draw();
  loadJournal().then(() => { if (here()) draw(); })
    .catch((e) => { if (e.message !== 'auth' && here()) $('#jbody').innerHTML = `<div class="card center"><p>${errText(e)}</p><button class="btn ghost" onclick="renderChart()">פרוביר נאכאמאל</button></div>`; });
}

/* ---------------- more / settings ---------------- */
/** The site's "מער" menu. */
const SECTIONS = [
  { t: 'מאטיוואציע', e: '🏆', c: '#f59e0b', u: APP + '/motivation' },
  { t: 'פלאנירונג', e: '📝', c: '#3b82f6', u: APP + '/planning' },
  { t: 'קאנעקשן', e: '💬', c: '#10b981', u: APP + '/connection' },
  { t: 'מיני-קורסן', e: '🎓', c: '#14b8a6', u: APP + '/mini-courses' },
  { t: 'ווידעאס', e: '🎬', c: '#6366f1', u: APP + '/videos/categories' },
  { t: 'טולבאקס', e: '🧰', c: '#8b5cf6', u: APP + '/toolbox' },
  { t: 'פארום', e: '👥', c: '#f97316', go: () => go('forum') },
  { t: '90 טעג טשארט', e: '📊', c: '#a855f7', go: () => { state.chart.seg = 'c90'; go('chart'); } },
  { t: 'האנטבוך', e: '📖', c: '#ec4899', go: () => N.openHandbook() },
];

const LINKS = [
  { t: 'האנטבוך', s: 'לייען מיט בוקמארקס', i: 'book', u: 'handbook' },
  { t: 'פארום', s: 'רעדן מיט אנדערע, אנאנים', i: 'forum', u: SITE + '/forum' },
  { t: 'לייוו טשעט', s: 'כאפ א שמועס', i: 'chat', u: APP + '/chats' },
  { t: 'מאטיוואציע', s: 'וויזיע און ציל', i: 'star', u: APP + '/motivation' },
  { t: 'פלאנירונג', s: 'מיין פלאן', i: 'plan', u: APP + '/planning' },
  { t: 'קאנעקשן', s: 'חיזוק פון אנדערע', i: 'users', u: APP + '/connection' },
  { t: 'טולס', s: 'פאר שווערע מאמענטן', i: 'tool', u: APP + '/toolbox' },
  { t: 'אורגענט הילף', s: 'SOS', i: 'sos', u: APP + '/sos' },
  { t: 'דער גאנצער וועבזייטל', s: '', i: 'globe', u: APP + '/' },
  { t: 'אקאונט סעטינגס', s: 'פראפיל, אימעיל, פאסווארט', i: 'gear', u: APP + '/settings/profile' },
  { t: 'העלפט אונז', s: 'נדבה', i: 'heart', u: SITE + '/donate' },
];

function renderMore() {
  const s = JSON.parse(N.getSettings());
  const times = Array.isArray(s.times) && s.times.length ? s.times : ['21:00'];
  view().innerHTML = `
    <div class="page-title">מער</div>

    <div class="section-title">סעקיוריטי</div>
    <section class="card">
      <div class="row"><span class="grow"><b>לאק מיט פינגערפרינט / פעיס</b><br><span class="muted small">${N.lockAvailable()
        ? 'די עפפ וועט פרעגן פאר דיין פינגערפרינט, פעיס אדער PIN יעדעס מאל ווען דו עפנסט זי'
        : 'שטעל קודם צו א פינגערפרינט אדער פעיס אין די פאון סעטינגס'}</span></span>
        <label class="switch"><input type="checkbox" id="lockOn" ${N.lockEnabled() ? 'checked' : ''} ${N.lockAvailable() || N.lockEnabled() ? '' : 'disabled'}><i></i></label></div>
    </section>

    <div class="section-title">רימיינדערס</div>
    <section class="card">
      <div class="row"><span class="grow"><b>רימיינד מיך צו אפדעיטן</b><br><span class="muted small">דעם 90-טעג טשארט / וואנט פון כבוד</span></span>
        <label class="switch"><input type="checkbox" id="rOn" ${s.remind ? 'checked' : ''}><i></i></label></div>
      <div id="rBody" class="${s.remind ? '' : 'hidden'}">
        <div class="chips" id="rTimes">${times.map((t, i) => `<span class="chip"><input type="time" value="${esc(t)}" data-i="${i}"><button data-del="${i}" aria-label="אראפנעמען">✕</button></span>`).join('')}
          ${times.length < 4 ? '<button class="chip" id="rAdd" style="padding:6px 14px">+ צולייגן</button>' : ''}</div>
        <label class="check"><input type="checkbox" id="rSkip" ${s.skipIfDone !== false ? 'checked' : ''}><span>נישט דערמאנען אויב איך האב שוין אפדעיטעד היינט</span></label>
        <label class="check"><input type="checkbox" id="rShab" ${s.skipShabbos !== false ? 'checked' : ''}><span>נישט אויף שבת <span class="muted small">(פרייטאג פון 3 אזייגער ביז זונטאג)</span></span></label>
        <button class="btn sm line" id="rTest">${icon('bell')} שיק א טעסט</button>
        ${N.notifAllowed() ? '' : '<div class="warn">נאטיפיקעישאנס זענען אפ – טורן זיי אן אין די סעטינגס צו באקומען רימיינדערס.</div>'}
      </div>
    </section>

    <div class="section-title">ווידזשעט</div>
    <section class="card">
      <p style="margin:0 0 12px" class="muted small">דער ווידזשעט ווייזט דיינע ריינע טעג און לאזט דיר אפדעיטן דעם טשארט מיט איין דריק. ער ריפרעשט זיך אליין יעדע האלבע שעה.</p>
      ${N.canPinWidget() ? `<button class="btn ghost" id="wPin">${icon('widget')} ${N.hasWidget() ? 'עד נאך א ווידזשעט' : 'עד צום האום-סקרין'}</button>`
        : '<div class="note">האלט אן א ליידיגן פלאץ אויפ\'ן האום-סקרין ← ווידזשעטס ← היט דיינע אויגן.</div>'}
    </section>

    <div class="section-title">פראגראם</div>
    <div class="tiles">
      ${SECTIONS.map((x, i) => `<button class="tile" data-sec="${i}" style="--tc:${x.c}"><span class="ti">${x.e}</span><b>${x.t}</b></button>`).join('')}
    </div>

    <div class="section-title">וועבזייטל</div>
    <div class="list">${LINKS.map((l, i) => `<button class="item" data-l="${i}"><span class="ic">${icon(l.i)}</span><span class="grow"><span class="t">${l.t}</span>${l.s ? `<div class="s">${l.s}</div>` : ''}</span>${icon('chev')}</button>`).join('')}</div>

    <div class="section-title">הילף</div>
    <div class="list">
      <button class="item" id="bStaff"><span class="ic">${icon('chat')}</span><span class="grow"><span class="t">מעסעדזשעס פון שטאב</span><div class="s">פריוואטע מעסעדזשעס מיט די שטאב פון היט דיינע אויגן</div></span><span id="staffCount"></span></button>
      <a class="item" href="tel:+17185676100"><span class="ic">${icon('phone')}</span><span class="grow"><span class="t">האטליין</span><div class="s"><span class="ltr">(718) 567-6100</span></div></span></a>
      <a class="item" href="mailto:gye.yid@hitdanoigen.com"><span class="ic">${icon('mail')}</span><span class="grow"><span class="t">אימעיל</span><div class="s"><span class="ltr">gye.yid@hitdanoigen.com</span></div></span></a>
    </div>

    <div class="section-title">עפפ</div>
    <div class="list">
      <button class="item" id="uCheck"><span class="ic">${icon('download')}</span><span class="grow"><span class="t">טשעק פאר אפדעיטס</span><div class="s" id="uState">ווערזשן ${esc(N.version())}</div></span>${icon('chev')}</button>
      <button class="item" id="bOut"><span class="ic" style="background:var(--red-soft);color:var(--red)">${icon('out')}</span><span class="grow"><span class="t">לאג ארויס</span><div class="s">${esc(N.username() || '')}</div></span></button>
    </div>
    <p class="center muted small">א פריוואטע עפפ פאר hitdanoigen.com · אלע דאטא בלייבט אויפ'ן וועבזייטל</p>`;

  const save = () => {
    const ts = [...document.querySelectorAll('#rTimes input[type=time]')].map((x) => x.value).filter(Boolean);
    const next = { remind: $('#rOn').checked, times: ts.length ? ts : ['21:00'], skipIfDone: $('#rSkip').checked, skipShabbos: $('#rShab').checked };
    N.setSettings(JSON.stringify(next));
    return next;
  };
  $('#rOn').onchange = () => { save(); $('#rBody').classList.toggle('hidden', !$('#rOn').checked); toast($('#rOn').checked ? 'רימיינדערס זענען אן' : 'רימיינדערס זענען אפ'); };
  $('#lockOn').onchange = (e) => { const on = e.target.checked; e.target.checked = !on; N.setLock(on); };
  $('#rSkip').onchange = save;
  $('#rShab').onchange = save;
  document.querySelectorAll('#rTimes input[type=time]').forEach((x) => (x.onchange = () => { save(); toast('געהיטן'); }));
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const s2 = save();
    if (s2.times.length <= 1) { toast('מען דארף כאטש איין צייט'); return; }
    s2.times.splice(+b.dataset.del, 1);
    N.setSettings(JSON.stringify(s2));
    renderMore();
  }));
  $('#rAdd') && ($('#rAdd').onclick = () => { const s2 = save(); s2.times.push('08:00'); N.setSettings(JSON.stringify(s2)); renderMore(); });
  $('#rTest').onclick = () => { N.testReminder(); toast('א טעסט איז געשיקט'); };
  $('#wPin') && ($('#wPin').onclick = () => N.pinWidget());
  document.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { const l = LINKS[+b.dataset.l]; if (l.u === 'handbook') N.openHandbook(); else N.openWeb(l.u, l.t); }));
  $('#uCheck').onclick = () => updateSheet(true);
  document.querySelectorAll('[data-sec]').forEach((b) => (b.onclick = () => {
    const x = SECTIONS[+b.dataset.sec];
    if (x.go) return x.go();
    N.openWeb(x.u, x.t);
  }));
  $('#bStaff').onclick = () => N.openStaff();
  paintStaff();
  $('#bOut').onclick = () => {
    openModal(`
    <h2>לאג ארויס?</h2><p>דו וועסט דארפן אריינשרייבן דיין פאסווארט נאכאמאל. רימיינדערס ווערן אפגעשטעלט.</p>
    <div class="btns"><button class="btn red" id="bOutYes">לאג ארויס</button><button class="btn line" data-close>צוריק</button></div>`);
    $('#bOutYes').onclick = () => {
      N.logout();
      Object.assign(state, { dash: null, user: null, prog: null, journal: null, tab: 'home', chart: { seg: 'c90', c90: null, woh: null, q: '' } });
      closeModal();
      showLogin();
    };
  };
}

window.onLockSet = (on, ok) => {
  const x = $('#lockOn');
  if (x) x.checked = on;
  if (ok) toast(on ? 'לאק איז אן 🔒' : 'לאק איז אפ');
};

/* ---------------- updates ---------------- */
function checkUpdate() {
  return new Promise((res) => {
    const id = ++rid;
    pending[id] = (r) => res(r.json() || {});
    N.checkUpdate(id);
  });
}
async function maybeCheckUpdate() {
  let last = 0;
  try { last = +localStorage.getItem('updCheck') || 0; } catch {}
  if (Date.now() - last < 3 * 3600_000) return;
  try { localStorage.setItem('updCheck', String(Date.now())); } catch {}
  state.update = await checkUpdate();
  if (state.update.available && state.tab === 'home' && state.dash) renderHome();
  let seen = '';
  try { seen = localStorage.getItem('updSeen') || ''; } catch {}
  if (state.update.available && seen !== state.update.latest && !$('#modal')) {
    try { localStorage.setItem('updSeen', state.update.latest); } catch {}
    updateSheet(false);
  }
}
async function updateSheet(fresh) {
  if (fresh || !state.update) {
    const st = $('#uState');
    if (st) st.textContent = 'מען טשעקט...';
    state.update = await checkUpdate();
    if (st) st.textContent = `ווערזשן ${N.version()}`;
  }
  const u = state.update;
  if (u.error) { toast(u.error === 'no_releases' ? 'נישטא קיין אפדעיטס.' : 'קען נישט קוקן יעצט – פרוביר שפעטער'); return; }
  if (!u.available) { toast(`דו האסט די לעצטע ווערזשן (${u.current})`); return; }
  openModal(`
    <div class="upd-hero">🎉</div>
    <h2>א נייע ווערזשן איז גרייט! (${esc(u.latest)})</h2>
    <p>דו האסט יעצט ${esc(u.current)}.</p>
    ${u.notes ? `<div class="note" style="white-space:pre-line;text-align:right">${esc(u.notes.slice(0, 1200))}</div>` : ''}
    <div class="btns"><button class="btn" id="uGo">${icon('download')} דאונלאוד און אינסטאלירן</button><button class="btn line" data-close>שפעטער</button></div>`);
  $('#uGo').onclick = () => startUpdate(u);
}

const LATEST_APK = 'https://github.com/yoely0966/hitdanoigen-app/releases/latest/download/HitDaneOigen.apk';

/** Download + install inside the app, with progress; the browser is the fallback. */
function startUpdate(u) {
  openModal(`
    <h2>אפדעיט צו ${esc(u.latest)}</h2>
    <p id="upTxt">מען דאונלאודט…</p>
    <div class="upbar"><i id="upBar" style="width:0%"></i></div>
    <div id="upBtns" class="btns hidden" style="margin-top:16px">
      <button class="btn" id="upRetry">${icon('refresh')} פרוביר נאכאמאל</button>
      <button class="btn ghost" id="upWeb">${icon('globe')} דאונלאוד אין בראוזער</button>
      <button class="btn line" data-close>צוריק</button>
    </div>`);
  $('#upRetry').onclick = () => startUpdate(u);
  $('#upWeb').onclick = () => { closeModal(); N.openWeb(LATEST_APK, ''); };
  N.installUpdate(u.url);
}
const UPDATE_ERRORS = {
  perm: 'ערלויב די עפפ צו אינסטאלירן אפדעיטס (אין דעם סקרין וואס האט זיך געעפנט), קום צוריק און דרוק "פרוביר נאכאמאל".',
  aborted: 'דער אפדעיט איז אפגעזאגט געווארן.',
  conflict: 'דער טעלעפאן האט נישט אנגענומען דעם אפדעיט (אן אנדערע ווערזשן איז אינסטאלירט). דאונלאוד אין בראוזער.',
  storage: 'נישט גענוג פלאץ אויפ\'ן טעלעפאן.',
  incompatible: 'דער אפדעיט פאסט נישט פאר דעם טעלעפאן.',
  bad_file: 'דער דאונלאוד איז נישט אינגאנצן אנגעקומען.',
  incomplete: 'דער דאונלאוד איז איבערגעריסן געווארן.',
};
window.onUpdateProgress = (pct, st, err) => {
  const txt = $('#upTxt'), bar = $('#upBar'), btns = $('#upBtns');
  if (!txt) return;
  if (st === 'download') {
    txt.textContent = pct >= 0 ? `מען דאונלאודט… ${pct}%` : 'מען דאונלאודט…';
    if (pct >= 0) bar.style.width = pct + '%';
  } else if (st === 'install') {
    bar.style.width = '100%';
    txt.textContent = 'מען אינסטאלירט… דרוק "Update" אין דעם פענצטער וואס עפנט זיך.';
  } else {
    const key = st === 'perm' ? 'perm' : (err || '').split(':')[0];
    txt.textContent = UPDATE_ERRORS[key] || (/http_|Unable|timeout|resolve|connect|reset|failed to connect/i.test(err || '')
      ? 'קיין פארבינדונג צו GitHub. קוק דעם אינטערנעט און פרוביר נאכאמאל.'
      : 'דער אפדעיט האט נישט געקלאפט' + (err ? ` (${err})` : '') + '.');
    btns.classList.remove('hidden');
  }
};

/* ---------------- start ---------------- */
if (!N) {
  document.body.innerHTML = '<p style="padding:24px">די זייט ארבעט נאר אינעווייניג אין דער עפפ.</p>';
} else {
  window.addEventListener("DOMContentLoaded", boot);
}
