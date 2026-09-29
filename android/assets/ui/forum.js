'use strict';
/* "Chats" tab in a WhatsApp-style look:
   - טשעטס:  the site's live chat (private conversations, GraphQL at api.chat.hitdanoigen.com)
   - גרופעס: the forum categories, like the site's forum index
   - טעמעס:  forum topics (recent / mine / unanswered / pinned)
   A forum topic opens like a group chat and the message box posts a real reply to the forum. */

const CHAT_API = 'https://api.chat.hitdanoigen.com/graphql';

const forum = {
  section: 'groups',  // groups | topics  (live chat opens from its own button)
  filter: 'recent',   // recent | mine | noreplies | pinned
  lists: {},          // topic lists by key -> { rows, at }
  cats: null,         // { groups:[{name, cats:[]}], at }
  convs: null,        // live-chat conversations { rows, at }
  online: [],
  me: null,           // live-chat user id
  unread: 0,
  q: '',
  thread: null,
  conv: null,
};
const FILTERS = [
  { id: 'recent', t: 'לעצטע', path: '/forum/recent' },
  { id: 'mine', t: 'מיינע', path: '/forum/mylatest' },
  { id: 'noreplies', t: 'אומגעענטפערט', path: '/forum/noreplies' },
  { id: 'pinned', t: '📌 אנגעהאנגענע', path: null },
];
const REACTIONS = [
  ['Like', '👍'], ['Heart', '❤️'], ['Clap', '👏'], ['Fire', '🔥'], ['Smile', '😊'], ['Love', '😍'], ['Think', '🤔'], ['Calm', '😌'], ['Dislike', '👎'],
];
const reactionEmoji = (r) => (REACTIONS.find((x) => x[0] === r) || [, ''])[1];

/* ---------- small helpers ---------- */
function httpForm(url, fields) {
  const body = Object.entries(fields).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return new Promise((res) => {
    const id = ++rid;
    pending[id] = res;
    N.httpForm(id, url, body);
  });
}
const qs = (url) => Object.fromEntries(new URL(url, SITE).searchParams);
const absUrl = (u) => (u ? new URL(u, SITE).href : '');

async function gql(query, variables = {}) {
  const r = await http('POST', CHAT_API, { query, variables });
  if (r.status === 0) throw new Error('offline');
  const j = r.json();
  if (!j) throw new Error('http ' + r.status);
  if (j.errors && !j.data) throw new Error(j.errors[0]?.message || 'gql');
  return j.data;
}

// pinned forum topics live on this phone (the forum itself has no "pin for me")
function loadPins() { try { return JSON.parse(localStorage.getItem('pins') || '{}'); } catch { return {}; } }
function savePins(p) { try { localStorage.setItem('pins', JSON.stringify(p)); } catch {} }
const isPinned = (t) => !!loadPins()[t.id];
function togglePin(t) {
  const p = loadPins();
  if (p[t.id]) delete p[t.id];
  else p[t.id] = { id: t.id, catid: t.catid, title: t.title, cat: t.cat || '', avatar: t.avatar || '', lastBy: t.lastBy || '', at: Date.now() };
  savePins(p);
  toast(p[t.id] ? '📌 אנגעהאנגען' : 'אראפגענומען');
  return !!p[t.id];
}

const COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774', '#c9a227'];
const colorOf = (name) => { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initial = (name) => (String(name || '?').trim().charAt(0) || '?');
function avatar(src, name, cls = 'wa-av', online) {
  const img = src && !/nophoto/i.test(src) ? `<img src="${esc(absUrl(src))}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="${cls}"><i style="background:${colorOf(name)}">${esc(initial(name))}</i>${img}${online ? '<b class="dot"></b>' : ''}</span>`;
}
function shortWhen(w) {
  if (/^היינט/.test(w)) return w.replace(/^היינט\s*/, '');
  if (/^נעכטן/.test(w)) return 'נעכטן';
  return w.replace(/\s*\d{1,2}:\d{2}\s*[AP]M$/i, '');
}
function isoWhen(iso, full) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return full ? 'נעכטן ' + hm : 'נעכטן';
  const s = `${d.getDate()}/${d.getMonth() + 1}${d.getFullYear() !== now.getFullYear() ? '/' + String(d.getFullYear()).slice(2) : ''}`;
  return full ? s + ' ' + hm : s;
}
function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'היינט';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'נעכטן';
  return `${fmtGreg(d)} · ${fmtHeb(d)}`;
}
/* ---------- rich text: @mentions and links ---------- */
function shortUrl(u) {
  try {
    const url = new URL(u);
    const p = url.searchParams;
    if (/hitdanoigen\.com$/.test(url.hostname)) {
      if (url.pathname.startsWith('/forum') && p.get('func') === 'view') return '💬 פארום טעמע';
      if (url.pathname.startsWith('/forum') && p.get('func') === 'showcat') return '👥 פארום גרופע';
      if (url.pathname.startsWith('/forum/profile')) return '👤 פראפייל';
      if (url.pathname.startsWith('/90days')) return '📊 90-טעג טשארט';
      if (url.hostname.startsWith('app.') && url.pathname.startsWith('/chats')) return '💬 לייוו טשעט';
      return '🔗 hitdanoigen.com' + (url.pathname.length > 1 ? url.pathname.slice(0, 24) : '');
    }
    const s = url.hostname.replace(/^www\./, '') + url.pathname;
    return '🔗 ' + (s.length > 38 ? s.slice(0, 36) + '…' : s);
  } catch { return u; }
}
const myName = () => (N.username() || '').trim().toLowerCase();
/** Escapes text and turns links into short chips and @names into tappable mentions. */
/** *bold*  _italic_  ~strike~  `code`  ```block``` on already-escaped text. */
function fmt(h) {
  return h
    .replace(/```([\s\S]+?)```/g, '<code class="blk">$1</code>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(>])\*(?!\s)([^*\n]+?)\*(?=$|[\s.,!?:;)<])/g, '$1<b>$2</b>')
    .replace(/(^|[\s(>])_(?!\s)([^_\n]+?)_(?=$|[\s.,!?:;)<])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(>])~(?!\s)([^~\n]+?)~(?=$|[\s.,!?:;)<])/g, '$1<s>$2</s>');
}
/** Line-level: "> quote" and "- list" / "• list". */
function lines(h) {
  return h.split('\n').map((l) => {
    if (/^&gt;\s?/.test(l)) return `<span class="q">${l.replace(/^&gt;\s?/, '')}</span>\u0001`;
    if (/^\s*[-•*]\s+/.test(l)) return `<span class="li">${l.replace(/^\s*[-•*]\s+/, '')}</span>\u0001`;
    if (/^\s*\d+[.)]\s+/.test(l)) return `<span class="li num" data-n="${l.match(/\d+/)[0]}">${l.replace(/^\s*\d+[.)]\s+/, '')}</span>\u0001`;
    return l;
  }).join('\n');
}
function richText(text) {
  const re = /(https?:\/\/[^\s<>"]+)|(^|[\s(\[,])@([^\s@.,!?:;()\[\]"'<>]+)/g;
  const me = myName();
  const plain = (t) => fmt(esc(t));
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    out += plain(text.slice(last, m.index));
    if (m[1]) {
      const u = m[1].replace(/[.,!?)\]]+$/, '');
      out += `<a data-href="${esc(u)}" class="chip-link">${esc(shortUrl(u))}</a>`;
      last = m.index + u.length;
      re.lastIndex = last;
    } else {
      out += plain(m[2]) + `<span class="mention${m[3].toLowerCase() === me ? ' me' : ''}" data-user="${esc(m[3])}">@${esc(m[3])}</span>`;
      last = m.index + m[0].length;
    }
  }
  return lines((out + plain(text.slice(last))).replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>').replace(/\u0001<br>/g, '').replace(/\u0001/g, '');
}
const linkify = richText;

/** Makes links and mentions inside a message box work. */
function bindRich(box) {
  box.querySelectorAll('a[data-href]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openLink(a.dataset.href); }));
  box.querySelectorAll('.mention[data-user]').forEach((x) => (x.onclick = (e) => { e.stopPropagation(); openMention(x.dataset.user); }));
}

async function openMention(name) {
  if (name.toLowerCase() === myName()) { toast('דאס ביסטו 🙂'); return; }
  try {
    await chatMe();
    const d = await gql('query U($u:String!){ userByUsername(username:$u){ id username isOnline currentStreak } }', { u: name });
    if (d.userByUsername) startChatWith(d.userByUsername);
    else toast('"' + name + '" איז נישט געפונען');
  } catch { toast('"' + name + '" איז נישט געפונען'); }
}

/** Links to our own site open inside the app (topic, group, chart, live chat); others in the browser. */
function openLink(href) {
  let url;
  try { url = new URL(href, SITE); } catch { return; }
  const h = url.hostname, p = url.searchParams, path = url.pathname;
  if (h === 'hitdanoigen.com' || h === 'www.hitdanoigen.com') {
    if (path.startsWith('/forum') && !path.startsWith('/forum/profile')) {
      if (p.get('func') === 'view' && p.get('id')) {
        const post = url.hash.replace('#', '');
        // no page given: a link to the first post means page 1, otherwise the newest page
        const start = p.get('start') != null ? p.get('start') : (!post || post === p.get('id')) && post ? '0' : null;
        return openThread({ title: '', cat: '', catid: p.get('catid'), id: p.get('id'), start, jumpTo: post || null });
      }
      if (p.get('func') === 'showcat' && p.get('catid')) {
        const c = forum.cats && forum.cats.groups.flatMap((g) => g.cats).find((x) => x.catid === p.get('catid'));
        return openCategory(c || { catid: p.get('catid'), title: 'פארום גרופע', desc: '' });
      }
      if (!p.get('func') || p.get('func') === 'listcat') { while (stack.length) popScreen(); forum.section = 'groups'; return go('forum'); }
    }
    if (path.startsWith('/90days')) {
      while (stack.length) popScreen();
      state.chart.seg = /wall-of-honour/.test(path) ? 'woh' : /log|diary/.test(path + url.search) ? 'diary' : 'c90';
      return go('chart');
    }
  }
  if (h === 'app.hitdanoigen.com' && path.startsWith('/chats')) return openLiveChats();
  N.openWeb(url.href, '');
}

/* ---------- overlay stack (full-screen chat screens, back button closes the top one) ---------- */
const stack = [];
function pushScreen(el, onClose) {
  document.body.appendChild(el);
  stack.push({ el, onClose });
  $('#nav').classList.add('hidden');
}
function popScreen() {
  const top = stack.pop();
  if (!top) return false;
  top.onClose?.();
  top.el.remove();
  if (!stack.length) {
    $('#nav').classList.remove('hidden');
    if (state.tab === 'forum') drawSection();
  }
  return true;
}
window.overlayBack = () => popScreen();
function actionSheet(title, items) {
  openModal(`<h2 style="font-size:17px">${esc(title)}</h2><div class="list" style="margin:0">${items.map((it, i) =>
    `<button class="item" data-a="${i}"><span class="ic">${it.icon}</span><span class="grow"><span class="t">${esc(it.t)}</span>${it.s ? `<div class="s">${esc(it.s)}</div>` : ''}</span></button>`).join('')}</div>`);
  document.querySelectorAll('#modal [data-a]').forEach((b) => (b.onclick = () => { closeModal(); items[+b.dataset.a].run(); }));
}
function onLongPress(el, fn) {
  let t = 0;
  el.addEventListener('touchstart', () => { t = setTimeout(() => { t = -1; fn(); }, 480); }, { passive: true });
  const cancel = () => { if (t > 0) clearTimeout(t); };
  el.addEventListener('touchend', (e) => { if (t === -1) e.preventDefault(); cancel(); });
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); fn(); });
}

/* ================= main tab ================= */
function renderForum() {
  document.body.classList.add('wa');
  if (!['groups', 'topics'].includes(forum.section)) forum.section = 'groups';
  const sec = forum.section;
  view().innerHTML = `
    <div class="wa-head"><div class="wa-h1">טשעטס</div>
      <button class="wa-icon" id="fRef" aria-label="ריפרעש">${icon('refresh')}</button></div>
    <div class="wa-tabs">
      <button data-s="groups" class="${sec === 'groups' ? 'on' : ''}">גרופעס</button>
      <button data-s="topics" class="${sec === 'topics' ? 'on' : ''}">טעמעס</button>
    </div>
    <div class="wa-search">${icon('search')}<input id="fq" placeholder="זוך..." value="${esc(forum.q)}" dir="auto"></div>
    <div id="fsec"><div class="spinner"></div></div>
    <button class="wa-fab2 ai" id="fAi" aria-label="AI געהילף"><span style="font-size:19px">🤖</span><span class="lbl">AI געהילף</span></button>
    <button class="wa-fab2" id="fLive" aria-label="לייוו טשעט">${icon('chat')}<span class="lbl">לייוו טשעט</span>${forum.unread ? `<span class="wa-badge fabb">${forum.unread > 99 ? '99+' : forum.unread}</span>` : ''}</button>
    <button class="wa-fab" id="fNew" aria-label="נייע טעמע">${icon('pen')}</button>`;
  document.querySelectorAll('.wa-tabs button').forEach((b) => (b.onclick = () => { forum.section = b.dataset.s; forum.q = ''; renderForum(); }));
  $('#fq').oninput = (e) => { forum.q = e.target.value; drawSection(); };
  $('#fLive').onclick = () => openLiveChats();
  $('#fAi').onclick = () => aiSheet();
  $('#fNew').onclick = () => newTopicSheet();
  $('#fRef').onclick = () => { forum.lists = {}; forum.cats = null; forum.convs = null; renderForum(); };
  loadSection();
}

function loadSection() {
  const sec = forum.section;
  const done = () => { if (state.tab === 'forum' && forum.section === sec) drawSection(); };
  const fail = (e) => {
    if (e?.message === 'auth' || state.tab !== 'forum' || forum.section !== sec || !$('#fsec')) return;
    $('#fsec').innerHTML = `<div class="card center" style="margin:16px"><p>${errText(e)}</p><button class="btn ghost" onclick="renderForum()">פרוביר נאכאמאל</button></div>`;
  };
  if (sec === 'groups') loadCats().then(done).catch(fail);
  else loadTopics(forum.filter).then(done).catch(fail);
}

function drawSection() {
  if (!$('#fsec')) return;
  if (forum.section === 'groups') drawCats();
  else drawTopicsSection();
}

/* ================= live chat ================= */
const CONV_Q = `query C($limit:Int!){ myConversations(limit:$limit){ id type unreadMessageCount canCommunicate
  conversationToUser{ isPinned isMuted isHidden }
  lastMessage{ id body createdAt authorId type state }
  participants{ id username isOnline lastSeenAt currentStreak } } }`;

async function chatMe() {
  if (forum.me) return forum.me;
  const d = await gql('query{ currentUser{ id username } }');
  forum.me = d.currentUser?.id;
  return forum.me;
}

async function loadConvs(force) {
  if (forum.convs && !force && Date.now() - forum.convs.at < 20_000) return;
  await chatMe();
  const [c, o] = await Promise.all([
    gql(CONV_Q, { limit: 60 }),
    gql('query O($l:Int!){ userListConnection(isOnline:true, first:$l){ edges{ node{ id username currentStreak } } } }', { l: 30 }).catch(() => null),
  ]);
  forum.convs = { rows: c.myConversations || [], at: Date.now() };
  await loadBots();
  forum.online = (o?.userListConnection?.edges || []).map((e) => e.node).filter((u) => u.id !== forum.me && !isBot(u));
  forum.unread = forum.convs.rows.reduce((n, r) => n + (r.unreadMessageCount || 0), 0);
  setNavBadge(forum.unread);
}

/* ---------- AI helpers: the site's chat bots ---------- */
const BOT_INFO = {
  Motivation: { icon: '🤖', desc: 'חיזוק און מאטיוואציע ווען דו דארפסט עס', starters: ['גיב מיר חיזוק', 'איך האב א שווערן טאג', 'איך האב א שטארקן גלוסט יעצט', 'פארוואס איז עס ווערט צו קעמפן?'] },
  Planning: { icon: '🗺️', desc: 'מאך א פלאן, ציל און שריט פאר שריט', starters: ['העלף מיר מאכן א פלאן', 'וואס קען איך טון היינט?', 'ווי אזוי פארמייד איך שווערע מאמענטן?', 'איך וויל שטעלן א ציל'] },
};
async function loadBots() {
  if (forum.bots) return forum.bots;
  try {
    const d = await gql('query B($l:Int!){ userListConnection(botsOnly:true, first:$l){ edges{ node{ id username botType isOnline } } } }', { l: 10 });
    forum.bots = (d.userListConnection?.edges || []).map((e) => e.node);
  } catch { forum.bots = []; }
  return forum.bots;
}
const isBot = (u) => !!(u && forum.bots && forum.bots.some((b) => b.id === u.id));
const botOf = (u) => (u && forum.bots ? forum.bots.find((b) => b.id === u.id) : null);

/** Big friendly AI buttons (Home card and the top of the live chat). */
function aiButtons(bots) {
  return bots.map((b) => {
    const i = BOT_INFO[b.botType] || { icon: '🤖', desc: '' };
    return `<button class="ai-btn" data-bot="${b.id}"><span class="ai-ic">${i.icon}</span>
      <span class="grow"><b>${esc(b.username)} <span class="ai-tag">AI</span></b><span class="ai-d">${esc(i.desc)}</span></span>${icon('chev')}</button>`;
  }).join('');
}
async function openBot(id) {
  await chatMe().catch(() => null);
  const bots = await loadBots();
  const b = bots.find((x) => String(x.id) === String(id));
  if (b) startChatWith(b);
  else toast('דער AI געהילף איז יעצט נישט צוגענגליך');
}
/** Sheet with the AI helpers (from the Chats tab button). */
async function aiSheet() {
  openModal('<h2>🤖 AI געהילף</h2><div class="spinner"></div>');
  await chatMe().catch(() => null);
  const bots = await loadBots();
  if (!bots.length) { closeModal(); toast('דער AI געהילף איז יעצט נישט צוגענגליך'); return; }
  openModal(`<h2>🤖 AI געהילף</h2><p>רעד יעצט – ער ענטפערט גלייך</p><div class="ai-list" style="padding:0">${aiButtons(bots)}</div>`);
  document.querySelectorAll('#modal [data-bot]').forEach((x) => (x.onclick = () => { closeModal(); openBot(x.dataset.bot); }));
}

function bindAi(box) {
  box.querySelectorAll('[data-bot]').forEach((x) => (x.onclick = () => openBot(x.dataset.bot)));
}

/** The live chat: its own screen, opened from the round button above "new topic". */
function openLiveChats() {
  const el = document.createElement('div');
  el.className = 'wa-screen list-screen';
  el.innerHTML = `
    <header class="wa-bar">
      <button class="wa-icon" data-back aria-label="צוריק">${icon('back')}</button>
      <span class="wa-av sm live">${icon('chat')}</span>
      <div class="grow" style="min-width:0"><div class="wa-title">לייוו טשעט</div><div class="wa-subt" data-online></div></div>
      <button class="wa-icon" data-ref aria-label="ריפרעש">${icon('refresh')}</button>
    </header>
    <div class="wa-search" style="margin:10px 14px 6px">${icon('search')}<input placeholder="זוך א טשעט..." dir="auto"></div>
    <div class="wa-list"><div class="spinner"></div></div>
    <button class="wa-fab in-screen" data-new aria-label="נייער טשעט">${icon('pen')}</button>`;
  forum.liveEl = el;
  forum.liveQ = '';
  el.querySelector('[data-back]').onclick = () => popScreen();
  el.querySelector('[data-new]').onclick = () => newChatSheet();
  el.querySelector('input').oninput = (e) => { forum.liveQ = e.target.value; drawConvs(); };
  const load = (force) => loadConvs(force).then(drawConvs).catch((e) => {
    if (forum.liveEl === el) el.querySelector('.wa-list').innerHTML = `<div class="center muted" style="padding:40px">${errText(e)}</div>`;
  });
  el.querySelector('[data-ref]').onclick = () => load(true);
  pushScreen(el, () => { if (forum.liveEl === el) forum.liveEl = null; clearInterval(el.timer); });
  load(false);
  el.timer = setInterval(() => { if (!document.hidden && stack[stack.length - 1]?.el === el) load(true); }, 20_000);
}

const other = (conv) => (conv.participants || []).find((p) => p.id !== forum.me) || conv.participants?.[0] || {};

function drawConvs() {
  const box = forum.liveEl?.querySelector('.wa-list');
  if (!box || !forum.convs) return;
  const sub = forum.liveEl.querySelector('[data-online]');
  if (sub) sub.textContent = forum.online.length ? `${forum.online.length} אנליין יעצט` : '';
  const q = (forum.liveQ || '').trim().toLowerCase();
  const rows = forum.convs.rows
    .filter((c) => !c.conversationToUser?.isHidden)
    .filter((c) => !q || (other(c).username || '').toLowerCase().includes(q) || (c.lastMessage?.body || '').toLowerCase().includes(q))
    .sort((a, b) => (b.conversationToUser?.isPinned ? 1 : 0) - (a.conversationToUser?.isPinned ? 1 : 0)
      || new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
  const onl = forum.online;
  const bots = (forum.bots || []);
  box.innerHTML = `
    ${bots.length && !q ? `<div class="wa-online-t">🤖 AI געהילפן</div><div class="ai-list">${aiButtons(bots)}</div>` : ''}
    ${onl.length && !q ? `<div class="wa-online-t">אנליין יעצט · ${onl.length}</div><div class="wa-online">${onl.map((u, i) =>
      `<button data-u="${i}">${avatar('', u.username, 'wa-av', true)}<span>${esc(u.username)}</span></button>`).join('')}</div>` : ''}
    ${rows.length ? rows.map((c) => {
      const o = other(c), lm = c.lastMessage, cu = c.conversationToUser || {};
      const mine = lm && lm.authorId === forum.me;
      return `<button class="wa-row" data-c="${c.id}">${avatar('', o.username, 'wa-av', o.isOnline)}
        <span class="wa-mid">
          <span class="wa-top"><b>${esc(o.username || 'טשעט')}</b><span class="wa-time${c.unreadMessageCount ? ' new' : ''}">${esc(isoWhen(lm?.createdAt))}</span></span>
          <span class="wa-top"><span class="wa-sub">${mine ? '<span class="ticks">✓✓</span> ' : ''}${lm ? esc(lm.type === 'Voice' ? '🎤 קול-מעסעדזש' : lm.state !== 'Active' ? '🚫 אויסגעמעקט' : lm.body || '') : '<i>נאך קיין מעסעדזשעס</i>'}</span>
            ${cu.isMuted ? '<span class="wa-ic">🔕</span>' : ''}${cu.isPinned ? '<span class="wa-ic">📌</span>' : ''}
            ${c.unreadMessageCount ? `<span class="wa-badge">${c.unreadMessageCount}</span>` : ''}</span>
        </span></button>`;
    }).join('') : `<div class="center muted" style="padding:40px">${q ? 'גארנישט געפונען' : 'נאך קיין טשעטס. דריק אויפ\'ן קנעפל אונטן צו אנהייבן.'}</div>`}`;
  box.querySelectorAll('[data-c]').forEach((b) => {
    const c = forum.convs.rows.find((x) => String(x.id) === b.dataset.c);
    b.onclick = () => openConv(c);
    onLongPress(b, () => convMenu(c));
  });
  box.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => startChatWith(onl[+b.dataset.u])));
  bindAi(box);
}

function convMenu(c) {
  const pinned = c.conversationToUser?.isPinned;
  actionSheet(other(c).username || 'טשעט', [
    { icon: '📌', t: pinned ? 'אנפין' : 'פין אויבן', run: () => pinConv(c, !pinned) },
    { icon: '🗂️', t: 'ארכייוו דעם טשעט', s: 'ער קומט צוריק ווען עס קומט א נייע מעסעדזש', run: () => hideConv(c) },
  ]);
}
async function pinConv(c, on) {
  try {
    await gql('mutation P($c:Int!,$p:Boolean!){ pinnedConversation(conversationId:$c, isPinned:$p){ id conversationToUser{ isPinned } } }', { c: c.id, p: on });
    c.conversationToUser = { ...(c.conversationToUser || {}), isPinned: on };
    toast(on ? '📌 אנגעהאנגען' : 'אראפגענומען');
    drawConvs();
  } catch (e) { toast(errText(e)); }
}
async function hideConv(c) {
  try {
    await gql('mutation H($c:Int!){ hiddenConversation(conversationId:$c) }', { c: c.id });
    c.conversationToUser = { ...(c.conversationToUser || {}), isHidden: true };
    toast('ארכייווד');
    drawConvs();
  } catch (e) { toast(errText(e)); }
}

/* ---------- a live-chat conversation ---------- */
const MSG_FIELDS = 'id authorId body createdAt type reaction state isViewed replyTo{ id body authorId }';

function chatScreen({ title, sub, av, menu, placeholder }) {
  const el = document.createElement('div');
  el.className = 'wa-screen';
  el.innerHTML = `
    <header class="wa-bar">
      <button class="wa-icon" data-back aria-label="צוריק">${icon('back')}</button>
      ${av}
      <div class="grow" style="min-width:0"><div class="wa-title">${esc(title)}</div><div class="wa-subt">${sub}</div></div>
      ${menu ? `<button class="wa-icon" data-menu aria-label="מער">${icon('more')}</button>` : ''}
    </header>
    <div class="wa-msgs"><div class="spinner"></div></div>
    <div class="wa-replying hidden"><div class="grow"><b></b><div class="s"></div></div><button class="wa-icon" data-unreply>✕</button></div>
    <div class="fmt-bar hidden">
      <button data-f="*" title="באלד"><b>B</b></button>
      <button data-f="_" title="איטאליק"><i>I</i></button>
      <button data-f="~" title="דורכגעשטראכן"><s>S</s></button>
      <button data-f="\`" title="קאוד"><code>&lt;/&gt;</code></button>
      <button data-l="> " title="ציטאט">❝</button>
      <button data-l="• " title="ליסט">•≡</button>
      <button data-l="1. " title="נומערירטע ליסט">1.</button>
    </div>
    <footer class="wa-compose">
      <div class="wa-input">
        <textarea rows="1" placeholder="${esc(placeholder || 'שרייב א מעסעדזש…')}" dir="auto" enterkeyhint="enter"></textarea>
        <button class="wa-fmt" aria-label="פארמאטירן" title="Aa">Aa</button>
        <button class="wa-pop" aria-label="גרויסער רעדאקטאר" title="גרויס">⤢</button>
      </div>
      <button class="wa-send" aria-label="שיק">${icon('send')}</button>
    </footer>`;
  el.querySelector('[data-back]').onclick = () => popScreen();
  if (menu) el.querySelector('[data-menu]').onclick = menu;
  const ta = el.querySelector('textarea');
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'; el.querySelector('.wa-send').classList.toggle('ready', !!ta.value.trim()); };
  const bar = el.querySelector('.fmt-bar');
  el.querySelector('.wa-pop').onclick = (e) => { e.preventDefault(); popEditor(el); };
  el.querySelector('.wa-fmt').onclick = (e) => { e.preventDefault(); bar.classList.toggle('hidden'); el.querySelector('.wa-fmt').classList.toggle('on'); ta.focus(); };
  // keep the keyboard open while tapping the formatting buttons
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => wrapSel(ta, b.dataset.f === '`' && ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n') ? '```' : b.dataset.f)));
  bar.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => prefixLines(ta, b.dataset.l)));
  return el;
}

/**
 * Full-screen editor for longer messages: big text area, the formatting toolbar always visible,
 * and a live preview. "שיק" sends through the chat's own send button; "צוריק" keeps the draft.
 */
function popEditor(chatEl) {
  const small = chatEl.querySelector('textarea');
  const title = chatEl.querySelector('.wa-title')?.textContent || '';
  const pop = document.createElement('div');
  pop.className = 'wa-editor';
  pop.innerHTML = `
    <header class="wa-bar">
      <button class="wa-icon" data-x aria-label="צוריק">${icon('back')}</button>
      <div class="grow" style="min-width:0"><div class="wa-title">${esc(title)}</div><div class="wa-subt">שרייב מיט פארמאטירונג</div></div>
      <button class="wa-icon" data-prev aria-label="פאָרבילד" title="פאָרבילד">${icon('eye')}</button>
    </header>
    <div class="fmt-bar ed">
      <button data-f="*" title="באלד"><b>B</b></button>
      <button data-f="_" title="איטאליק"><i>I</i></button>
      <button data-f="~" title="דורכגעשטראכן"><s>S</s></button>
      <button data-f="\`" title="קאוד"><code>&lt;/&gt;</code></button>
      <button data-l="> " title="ציטאט">❝</button>
      <button data-l="• " title="ליסט">•≡</button>
      <button data-l="1. " title="נומערירטע ליסט">1.</button>
    </div>
    <textarea class="ed-text" dir="auto" placeholder="${esc(small.placeholder)}"></textarea>
    <div class="ed-preview hidden"><div class="bub"><div class="txt"></div></div></div>
    <footer class="ed-foot">
      <span class="muted small" data-count></span>
      <button class="btn wa-green ed-send">${icon('send')} שיק</button>
    </footer>`;
  document.body.appendChild(pop);
  const ta = pop.querySelector('.ed-text');
  const count = pop.querySelector('[data-count]');
  ta.value = small.value;
  const upd = () => { count.textContent = ta.value.trim() ? `${ta.value.trim().length} אותיות` : ''; };
  ta.oninput = upd;
  upd();
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 50);
  pop.querySelector('.fmt-bar').addEventListener('mousedown', (e) => e.preventDefault());
  pop.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => wrapSel(ta, b.dataset.f === '`' && ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n') ? '```' : b.dataset.f)));
  pop.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => prefixLines(ta, b.dataset.l)));
  const prev = pop.querySelector('.ed-preview');
  pop.querySelector('[data-prev]').onclick = () => {
    const on = prev.classList.toggle('hidden') === false;
    if (on) prev.querySelector('.txt').innerHTML = richText(ta.value) || '<span class="muted">(ליידיג)</span>';
    ta.classList.toggle('hidden', on);
  };
  const close = (keep) => {
    small.value = keep ? ta.value : '';
    small.oninput && small.oninput();
    pop.remove();
    stack.splice(stack.findIndex((x) => x.el === pop), 1);
  };
  pop.querySelector('[data-x]').onclick = () => close(true);
  pop.querySelector('.ed-send').onclick = () => {
    if (!ta.value.trim()) return;
    small.value = ta.value;
    small.oninput && small.oninput();
    pop.remove();
    stack.splice(stack.findIndex((x) => x.el === pop), 1);
    chatEl.querySelector('.wa-send').click();
  };
  // the phone's back button closes the editor and keeps the draft
  stack.push({ el: pop, onClose: () => { small.value = ta.value; small.oninput && small.oninput(); } });
}

/** Wraps the selected text (or the cursor) in a WhatsApp-style marker like *…*. */
function wrapSel(ta, mark) {
  const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
  const sel = v.slice(a, b);
  ta.value = v.slice(0, a) + mark + sel + mark + v.slice(b);
  const pos = sel ? b + mark.length * 2 : a + mark.length;
  ta.setSelectionRange(sel ? a + mark.length : pos, sel ? b + mark.length : pos);
  ta.focus();
  ta.oninput();
}
/** Puts "> ", "• " or "1. " in front of every selected line (or the current line). */
function prefixLines(ta, pre) {
  const v = ta.value;
  const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let b = v.indexOf('\n', ta.selectionEnd);
  if (b < 0) b = v.length;
  let n = 0;
  const block = v.slice(a, b).split('\n').map((l) => (pre === '1. ' ? `${++n}. ` : pre) + l).join('\n');
  ta.value = v.slice(0, a) + block + v.slice(b);
  ta.setSelectionRange(a + block.length, a + block.length);
  ta.focus();
  ta.oninput();
}
/** The forum speaks BBCode: turn the WhatsApp-style marks into [b], [i], [strike], [code], [quote], [list]. */
function toBBCode(t) {
  let out = t
    .replace(/```([\s\S]+?)```/g, '[code]$1[/code]')
    .replace(/`([^`\n]+)`/g, '[code]$1[/code]')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=$|[\s.,!?:;)])/gm, '$1[b]$2[/b]')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=$|[\s.,!?:;)])/gm, '$1[i]$2[/i]')
    .replace(/(^|[\s(])~(?!\s)([^~\n]+?)~(?=$|[\s.,!?:;)])/gm, '$1[strike]$2[/strike]');
  // consecutive "> " lines -> one quote, "• " / "- " lines -> a list
  out = out.replace(/(?:^>\s?.*(?:\n|$))+/gm, (blk) => '[quote]' + blk.replace(/^>\s?/gm, '').replace(/\n$/, '') + '[/quote]\n');
  out = out.replace(/(?:^\s*[-•]\s+.*(?:\n|$))+/gm, (blk) => '[ul]' + blk.trim().split('\n').map((l) => '[li]' + l.replace(/^\s*[-•]\s+/, '') + '[/li]').join('') + '[/ul]\n');
  out = out.replace(/(?:^\s*\d+[.)]\s+.*(?:\n|$))+/gm, (blk) => '[ol]' + blk.trim().split('\n').map((l) => '[li]' + l.replace(/^\s*\d+[.)]\s+/, '') + '[/li]').join('') + '[/ol]\n');
  return out.replace(/\n$/, '');
}

/** Typing "@na..." in the message box suggests people; tapping one fills in "@name ". */
function mentionHelper(el) {
  const ta = el.querySelector('textarea');
  const pop = document.createElement('div');
  pop.className = 'mention-pop hidden';
  el.querySelector('.wa-compose').before(pop);
  let timer = 0, seq = 0;
  const hide = () => pop.classList.add('hidden');
  const current = () => {
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(^|\s)@([^\s@]{0,30})$/);
    return m ? { q: m[2], at: before.length - m[2].length - 1 } : null;
  };
  const prev = ta.oninput;
  ta.oninput = () => {
    prev && prev();
    const c = current();
    clearTimeout(timer);
    if (!c) return hide();
    timer = setTimeout(async () => {
      const my = ++seq;
      let users = [];
      try {
        const d = c.q.length
          ? await gql(`query S($s:String,$n:Int!){ userListConnection(first:$n, searchTerm:$s, sortBy:{direction:Desc, field:"lastSeenAt"}){ edges{ node{ id username isOnline } } } }`, { s: c.q, n: 8 })
          : null;
        users = d ? (d.userListConnection?.edges || []).map((e) => e.node) : forum.online.slice(0, 8);
      } catch {}
      if (my !== seq) return;
      users = users.filter((u) => u.id !== forum.me);
      if (!users.length) return hide();
      pop.innerHTML = users.map((u, i) => `<button data-i="${i}">${avatar('', u.username, 'wa-av xs', u.isOnline)}<span>${esc(u.username)}</span></button>`).join('');
      pop.classList.remove('hidden');
      pop.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => {
        const cur = current();
        if (!cur) return hide();
        const name = users[+b.dataset.i].username;
        const endPos = ta.selectionStart;
        ta.value = ta.value.slice(0, cur.at) + '@' + name + ' ' + ta.value.slice(endPos);
        const pos = cur.at + name.length + 2;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        hide();
        prev && prev();
      }));
    }, 250);
  };
  ta.addEventListener('blur', () => setTimeout(hide, 200));
}

async function startChatWith(user) {
  try {
    const d = await gql('query M($i:Int!){ myConversation(interlocutorId:$i){ id unreadMessageCount conversationToUser{ isPinned isMuted isHidden } participants{ id username isOnline lastSeenAt currentStreak } } }', { i: user.id });
    const c = d.myConversation || { id: null, participants: [{ id: forum.me }, user] };
    c.interlocutorId = user.id;
    openConv(c);
  } catch {
    openConv({ id: null, interlocutorId: user.id, participants: [{ id: forum.me }, user] });
  }
}

async function openConv(c) {
  await chatMe().catch(() => null);
  const o = other(c);
  await loadBots();
  const cv = { c, items: [], prevCursor: null, hasPrev: false, reply: null, timer: 0, sending: false, bot: botOf(other(c)), waiting: 0 };
  forum.conv = cv;
  const status = cv.bot ? 'AI געהילף · ענטפערט גלייך' : o.isOnline ? 'אנליין' : o.lastSeenAt ? 'לעצט געזען ' + isoWhen(o.lastSeenAt, true) : (o.currentStreak != null ? `🔥 ${o.currentStreak} טעג` : '');
  const el = chatScreen({ placeholder: 'שרייב א מעסעדזש…', title: o.username || 'טשעט', sub: esc(status), av: avatar('', o.username, 'wa-av sm', o.isOnline), menu: c.id ? () => convMenu(c) : null });
  cv.el = el;
  pushScreen(el, () => { clearInterval(cv.timer); clearInterval(cv.fast); if (forum.conv === cv) forum.conv = null; forum.convs && (forum.convs.at = 0); loadConvs(true).then(drawConvs).catch(() => {}); });
  el.querySelector('.wa-send').onclick = () => sendChat(cv);
  mentionHelper(el);
  el.querySelector('[data-unreply]').onclick = () => setReply(cv, null);
  if (!c.canCommunicate && c.canCommunicate === false) el.querySelector('.wa-compose').innerHTML = '<div class="wa-locked">מען קען נישט שרייבן אין דעם טשעט</div>';
  if (cv.bot) {
    const note = document.createElement('div');
    note.className = 'ai-note';
    note.textContent = '🤖 דאס איז א AI געהילף – ער קען אמאל מאכן א טעות. ביי א דרינגענדע זאך רוף דעם האטליין.';
    el.querySelector('.wa-compose').before(note);
  }
  if (!c.id) { drawChat(cv, true); return; }
  try {
    await fetchMsgs(cv, false);
    drawChat(cv, true);
    markViewed(cv);
  } catch (e) {
    el.querySelector('.wa-msgs').innerHTML = `<div class="day-chip" style="margin-top:40px">${errText(e)}</div>`;
  }
  // no push channel without our own server: look for new messages every few seconds while open
  cv.timer = setInterval(() => pollChat(cv), 5000);
}

async function fetchMsgs(cv, older) {
  const d = await gql(`query M($c:Int!,$l:Int!,$p:String){ messages(conversationId:$c, limit:$l, prevCursor:$p){ hasPrev prevCursor items{ ${MSG_FIELDS} } } }`,
    { c: cv.c.id, l: 40, p: older ? cv.prevCursor : null });
  const m = d.messages || { items: [] };
  if (older) cv.items = m.items.concat(cv.items);
  else cv.items = m.items;
  if (older || !cv.prevCursor) { cv.prevCursor = m.prevCursor; cv.hasPrev = m.hasPrev; }
}

async function pollChat(cv) {
  if (forum.conv !== cv || cv.sending || !cv.c.id || document.hidden) return;
  try {
    const d = await gql(`query M($c:Int!,$l:Int!){ messages(conversationId:$c, limit:$l){ items{ ${MSG_FIELDS} } } }`, { c: cv.c.id, l: 20 });
    const fresh = d.messages?.items || [];
    const known = new Map(cv.items.map((m) => [m.id, m]));
    let changed = false;
    fresh.forEach((m) => {
      const k = known.get(m.id);
      if (!k) { cv.items.push(m); changed = true; if (m.authorId !== forum.me) cv.waiting = 0; }
      else if (k.reaction !== m.reaction || k.isViewed !== m.isViewed || k.state !== m.state || k.body !== m.body) { Object.assign(k, m); changed = true; }
    });
    if (changed && forum.conv === cv) {
      const box = cv.el.querySelector('.wa-msgs');
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      drawChat(cv, atBottom);
      markViewed(cv);
    }
  } catch {}
}

function markViewed(cv) {
  const last = [...cv.items].reverse().find((m) => m.authorId !== forum.me && !m.isViewed);
  if (last) gql('mutation V($m:Int!){ markAsViewed(messageId:$m) }', { m: last.id }).then(() => { cv.items.forEach((m) => { if (m.authorId !== forum.me) m.isViewed = true; }); }).catch(() => {});
}

function drawChat(cv, scrollBottom) {
  const box = cv.el.querySelector('.wa-msgs');
  const o = other(cv.c);
  let html = cv.hasPrev ? '<button class="day-chip more" data-older>↑ פריערדיגע מעסעדזשעס</button>' : '';
  let lastDay = '', lastAuthor = null;
  cv.items.forEach((m) => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) { html += `<div class="day-chip">${esc(dayLabel(m.createdAt))}</div>`; lastDay = day; lastAuthor = null; }
    const mine = m.authorId === forum.me;
    const cont = m.authorId === lastAuthor;
    lastAuthor = m.authorId;
    const gone = m.state && m.state !== 'Active';
    const rt = m.replyTo;
    html += `<div class="msg ${mine ? 'out' : 'in'}${cont ? ' cont' : ''}" data-m="${m.id}">
      <div class="bub">
        ${rt ? `<blockquote><b>${rt.authorId === forum.me ? 'דו' : esc(o.username || '')}</b><br>${esc((rt.body || '').slice(0, 160))}</blockquote>` : ''}
        <div class="txt">${gone ? '<i class="muted">🚫 די מעסעדזש איז אויסגעמעקט געווארן</i>' : m.type === 'Voice' ? '🎤 <i>קול-מעסעדזש – הער אויפ\'ן וועבזייטל</i>' : linkify(m.body || '')}</div>
        <div class="meta"><span>${esc(isoWhen(m.createdAt).includes('/') ? '' : '')}${pad(new Date(m.createdAt).getHours())}:${pad(new Date(m.createdAt).getMinutes())}</span>${mine ? `<span class="ticks${m.isViewed ? ' seen' : ''}">✓✓</span>` : ''}</div>
        ${m.reaction ? `<span class="react">${reactionEmoji(m.reaction)}</span>` : ''}
      </div></div>`;
  });
  if (cv.waiting) html += '<div class="msg in"><div class="bub typing"><i></i><i></i><i></i></div></div>';
  const info = cv.bot ? BOT_INFO[cv.bot.botType] : null;
  if (info && !cv.items.length) {
    html = `<div class="ai-hello"><div class="ai-big">${info.icon}</div><b>${esc(cv.bot.username)}</b><p>${esc(info.desc)}</p>
      <div class="ai-starters">${info.starters.map((t) => `<button data-start="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  } else if (info) {
    html += `<div class="ai-starters inline">${info.starters.slice(0, 3).map((t) => `<button data-start="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  }
  box.innerHTML = html || '<div class="day-chip" style="margin-top:40px">שרייב די ערשטע מעסעדזש 👋</div>';
  box.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => {
    const ta = cv.el.querySelector('textarea');
    ta.value = b.dataset.start;
    sendChat(cv);
  }));
  bindRich(box);
  box.querySelectorAll('[data-m]').forEach((el) => {
    const m = cv.items.find((x) => String(x.id) === el.dataset.m);
    onLongPress(el.querySelector('.bub'), () => msgMenu(cv, m));
    el.querySelector('.bub').ondblclick = () => react(cv, m, m.reaction === 'Heart' ? null : 'Heart');
  });
  const older = box.querySelector('[data-older]');
  if (older) older.onclick = async () => {
    older.textContent = '...';
    const before = box.scrollHeight - box.scrollTop;
    try { await fetchMsgs(cv, true); drawChat(cv, false); box.scrollTop = box.scrollHeight - before; } catch (e) { toast(errText(e)); }
  };
  if (scrollBottom) box.scrollTop = box.scrollHeight;
}

function msgMenu(cv, m) {
  if (!m || (m.state && m.state !== 'Active')) return;
  openModal(`
    <div class="react-row">${REACTIONS.map(([k, e]) => `<button data-r="${k}" class="${m.reaction === k ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="list" style="margin:12px 0 0">
      <button class="item" data-x="reply"><span class="ic">↩️</span><span class="grow t">ריפליי</span></button>
      <button class="item" data-x="copy"><span class="ic">📋</span><span class="grow t">קאפי</span></button>
    </div>`);
  document.querySelectorAll('#modal [data-r]').forEach((b) => (b.onclick = () => { closeModal(); react(cv, m, m.reaction === b.dataset.r ? null : b.dataset.r); }));
  $('#modal [data-x=reply]').onclick = () => { closeModal(); setReply(cv, m); };
  $('#modal [data-x=copy]').onclick = () => {
    closeModal();
    try { navigator.clipboard.writeText(m.body || ''); toast('קאפיד'); } catch { toast('קען נישט קאפיען'); }
  };
}

async function react(cv, m, r) {
  const prev = m.reaction;
  m.reaction = r;
  drawChat(cv, false);
  try { await gql('mutation R($r:Emoji,$m:Int!){ updateMessageReaction(reaction:$r, messageId:$m) }', { r, m: m.id }); }
  catch (e) { m.reaction = prev; drawChat(cv, false); toast(errText(e)); }
}

function setReply(cv, m) {
  cv.reply = m;
  const bar = cv.el.querySelector('.wa-replying');
  bar.classList.toggle('hidden', !m);
  if (m) {
    bar.querySelector('b').textContent = m.authorId === forum.me ? 'דו' : other(cv.c).username || '';
    bar.querySelector('.s').textContent = (m.body || '').slice(0, 120);
    cv.el.querySelector('textarea').focus();
  }
}

async function sendChat(cv) {
  const ta = cv.el.querySelector('textarea');
  const body = ta.value.trim();
  if (!body || cv.sending) return;
  cv.sending = true;
  const tmp = { id: 'tmp' + Date.now(), authorId: forum.me, body, createdAt: new Date().toISOString(), type: 'Text', state: 'Active', replyTo: cv.reply ? { id: cv.reply.id, body: cv.reply.body, authorId: cv.reply.authorId } : null, pending: true };
  cv.items.push(tmp);
  drawChat(cv, true);
  ta.value = '';
  ta.oninput();
  const data = {
    attachmentsIds: [], body, conversationId: cv.c.id || null, interlocutorId: cv.c.id ? null : cv.c.interlocutorId || other(cv.c).id,
    meta: null, parentMessageId: cv.reply ? cv.reply.id : null, supportLabel: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, type: 'Text',
  };
  setReply(cv, null);
  try {
    const d = await gql(`mutation S($data:CreateMessageInput!){ createMessage(data:$data){ ${MSG_FIELDS} conversationId } }`, { data });
    const m = d.createMessage;
    const i = cv.items.indexOf(tmp);
    if (m && i >= 0) cv.items[i] = m;
    if (m?.conversationId && !cv.c.id) { cv.c.id = m.conversationId; cv.timer = cv.timer || setInterval(() => pollChat(cv), 5000); }
  } catch (e) {
    cv.items.splice(cv.items.indexOf(tmp), 1);
    ta.value = body;
    ta.oninput();
    toast(e.message === 'offline' ? 'קיין אינטערנעט – נישט געשיקט' : 'נישט געשיקט. פרוביר נאכאמאל.');
  }
  cv.sending = false;
  if (cv.bot) {
    cv.waiting = Date.now();
    clearInterval(cv.fast);
    cv.fast = setInterval(() => {
      if (!cv.waiting || Date.now() - cv.waiting > 90_000 || forum.conv !== cv) { cv.waiting = 0; clearInterval(cv.fast); drawChat(cv, false); return; }
      pollChat(cv);
    }, 2000);
  }
  drawChat(cv, true);
}

function newChatSheet() {
  openModal(`
    <h2>נייער טשעט</h2>
    <div class="wa-search" style="margin:8px 0 12px">${icon('search')}<input id="ncQ" placeholder="זוך א יוזער-נעים" dir="auto"></div>
    <div id="ncList" class="list" style="margin:0">${forum.online.slice(0, 12).map((u, i) => `<button class="item" data-i="${i}">${avatar('', u.username, 'wa-av sm', true)}<span class="grow"><span class="t">${esc(u.username)}</span><div class="s">אנליין${u.currentStreak != null ? ` · 🔥 ${u.currentStreak}` : ''}</div></span></button>`).join('') || '<div class="item muted">זוך א נאמען</div>'}</div>`);
  let found = forum.online.slice(0, 12);
  const bind = () => document.querySelectorAll('#ncList [data-i]').forEach((b) => (b.onclick = () => { closeModal(); startChatWith(found[+b.dataset.i]); }));
  bind();
  let t = 0;
  $('#ncQ').oninput = (e) => {
    clearTimeout(t);
    const s = e.target.value.trim();
    t = setTimeout(async () => {
      if (s.length < 2) return;
      try {
        const d = await gql(`query S($s:String,$n:Int!){ userListConnection(first:$n, searchTerm:$s, sortBy:{direction:Desc, field:"lastSeenAt"}){ edges{ node{ id username isOnline currentStreak } } } }`, { s, n: 20 });
        found = (d.userListConnection?.edges || []).map((x) => x.node).filter((u) => u.id !== forum.me);
        const l = $('#ncList');
        if (!l) return;
        l.innerHTML = found.length ? found.map((u, i) => `<button class="item" data-i="${i}">${avatar('', u.username, 'wa-av sm', u.isOnline)}<span class="grow"><span class="t">${esc(u.username)}</span>${u.currentStreak != null ? `<div class="s">🔥 ${u.currentStreak} טעג</div>` : ''}</span></button>`).join('') : '<div class="item muted">קיינער נישט געפונען</div>';
        bind();
      } catch {}
    }, 350);
  };
}

/* unread badge on the bottom-bar tab */
function setNavBadge(n) {
  const fb = $('#fLive');
  if (fb) {
    let x = fb.querySelector('.fabb');
    if (!n) x?.remove();
    else { if (!x) { x = document.createElement('span'); x.className = 'wa-badge fabb'; fb.appendChild(x); } x.textContent = n > 99 ? '99+' : n; }
  }
  const b = document.querySelector('#nav button[data-t="forum"] .pill');
  if (!b) return;
  let s = b.querySelector('.nav-badge');
  if (!n) { s?.remove(); return; }
  if (!s) { s = document.createElement('span'); s.className = 'nav-badge'; b.appendChild(s); }
  s.textContent = n > 99 ? '99+' : n;
}
async function refreshUnread() {
  if (!N.isLoggedIn()) return;
  try { const d = await gql('query{ unreadMessageCount }'); forum.unread = d.unreadMessageCount || 0; setNavBadge(forum.unread); } catch {}
}
setInterval(() => { if (!document.hidden) refreshUnread(); }, 60_000);
setTimeout(refreshUnread, 2500);

/* ================= forum categories ("groups") ================= */
async function loadCats(force) {
  if (forum.cats && !force && Date.now() - forum.cats.at < 5 * 60_000) return;
  const doc = await site('/forum/index');
  const groups = [];
  doc.querySelectorAll('tr[id^="kcat"]').forEach((tr) => {
    const block = tr.closest('.kblock');
    const gname = block?.querySelector('.kheader h2, .kheader h1, h2')?.textContent.replace(/\s+/g, ' ').trim() || '';
    let g = groups.find((x) => x.block === block);
    if (!g) { g = { block, name: gname, cats: [] }; groups.push(g); }
    const a = tr.querySelector('.kcol-kcattitle a[href*="showcat"]');
    if (!a) return;
    g.cats.push({
      catid: qs(a.getAttribute('href')).catid,
      title: a.textContent.trim(),
      desc: tr.querySelector('.kthead-desc')?.textContent.replace(/\s+/g, ' ').trim() || '',
      unread: +((tr.querySelector('.knewchar')?.textContent || '').match(/\d+/) || [0])[0],
      topics: tr.querySelector('.kcat-topics-number')?.textContent.trim() || '',
      lastBy: tr.querySelector('.klatest-subject-by a')?.textContent.trim() || '',
      lastSubject: (tr.querySelector('.klatest-subject a')?.textContent || '').replace(/^ענטפער:\s*/, '').trim(),
      when: tr.querySelector('.klatest-subject-by .nowrap')?.textContent.trim() || '',
      avatar: tr.querySelector('img.klist-avatar')?.getAttribute('src') || '',
    });
  });
  forum.cats = { groups: groups.map(({ name, cats }) => ({ name, cats })).filter((g) => g.cats.length), at: Date.now() };
}

const CAT_ICONS = { 6: '📢', 2: '👋', 3: '💬', 4: '🏁', 5: '📘', 91: '🎙️', 7: '📖', 9: '🪜', 17: '🤝', 15: '📞', 8: '🌍', 65: '⭐', 10: '☕' };
function catAvatar(c) {
  return `<span class="wa-av grp" style="background:${colorOf(c.title)}">${CAT_ICONS[c.catid] || esc(initial(c.title))}</span>`;
}

function drawCats() {
  const box = $('#fsec');
  if (!forum.cats) return;
  const q = forum.q.trim().toLowerCase();
  box.innerHTML = forum.cats.groups.map((g) => {
    const cats = g.cats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    if (!cats.length) return '';
    return `${g.name ? `<div class="wa-group-t">${esc(g.name)}</div>` : ''}${cats.map((c) => `
      <button class="wa-row" data-cat="${esc(c.catid)}">${catAvatar(c)}
        <span class="wa-mid">
          <span class="wa-top"><b>${esc(c.title)}</b><span class="wa-time${c.unread ? ' new' : ''}">${esc(shortWhen(c.when))}</span></span>
          <span class="wa-top"><span class="wa-sub">${c.lastBy ? `<b>${esc(c.lastBy)}:</b> ${esc(c.lastSubject)}` : esc(c.desc)}</span>
            ${c.unread ? `<span class="wa-badge">${c.unread > 999 ? '999+' : c.unread}</span>` : ''}</span>
        </span></button>`).join('')}`;
  }).join('') || '<div class="center muted" style="padding:40px">גארנישט געפונען</div>';
  box.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => {
    const c = forum.cats.groups.flatMap((g) => g.cats).find((x) => x.catid === b.dataset.cat);
    openCategory(c);
  }));
}

async function openCategory(c) {
  const el = document.createElement('div');
  el.className = 'wa-screen list-screen';
  el.innerHTML = `
    <header class="wa-bar">
      <button class="wa-icon" data-back aria-label="צוריק">${icon('back')}</button>
      ${catAvatar(c).replace('wa-av grp', 'wa-av grp sm')}
      <div class="grow" style="min-width:0"><div class="wa-title">${esc(c.title)}</div><div class="wa-subt">${esc(c.topics ? c.topics + ' טעמעס' : c.desc)}</div></div>
      <button class="wa-icon" data-new aria-label="נייע טעמע">${icon('pen')}</button>
    </header>
    ${c.desc ? `<div class="wa-desc">${esc(c.desc)}</div>` : ''}
    <div class="wa-list"><div class="spinner"></div></div>`;
  el.querySelector('[data-back]').onclick = () => popScreen();
  el.querySelector('[data-new]').onclick = () => newTopicSheet(c.catid);
  pushScreen(el);
  const key = 'cat' + c.catid;
  const draw = () => {
    const rows = forum.lists[key].rows;
    const list = el.querySelector('.wa-list');
    list.innerHTML = topicRows(rows) + (forum.lists[key].next ? '<button class="day-chip more" data-more>מער טעמעס ↓</button>' : '');
    bindTopicRows(list, rows);
    const more = list.querySelector('[data-more]');
    if (more) more.onclick = async () => {
      more.textContent = '...';
      try {
        const doc = await site(forum.lists[key].next);
        forum.lists[key].rows = rows.concat(parseTopics(doc).filter((r) => !rows.some((x) => x.id === r.id)));
        forum.lists[key].next = nextPage(doc);
        draw();
      } catch (e) { toast(errText(e)); more.textContent = 'מער טעמעס ↓'; }
    };
  };
  try {
    if (!forum.lists[key] || Date.now() - forum.lists[key].at > 3 * 60_000) {
      const doc = await site(`/forum?func=showcat&catid=${c.catid}`);
      forum.lists[key] = { rows: parseTopics(doc).map((r) => ({ ...r, cat: r.cat || c.title })), at: Date.now(), next: nextPage(doc) };
    }
    draw();
  } catch (e) {
    el.querySelector('.wa-list').innerHTML = `<div class="center muted" style="padding:40px">${errText(e)}</div>`;
  }
}
function nextPage(doc) {
  const act = doc.querySelector('.kpagination li.active');
  const a = act?.nextElementSibling?.querySelector('a');
  return a ? a.getAttribute('href') : null;
}

/* ================= forum topics ================= */
function parseTopics(doc) {
  return [...doc.querySelectorAll('tr')].filter((r) => r.querySelector('a.ktopic-title')).map((tr) => {
    const a = tr.querySelector('a.ktopic-title');
    const p = qs(a.getAttribute('href'));
    const last = tr.querySelector('.ktopic-latest-post a[href*="func=view"]');
    const newTxt = tr.querySelector('.knewchar')?.textContent || '';
    return {
      title: a.textContent.replace(/\s+/g, ' ').trim(),
      catid: p.catid, id: p.id,
      replies: +((tr.querySelector('.kcol-ktopicreplies strong')?.textContent || '').replace(/\D/g, '') || 0),
      views: tr.querySelector('.ktopic-views-number')?.textContent.trim() || '',
      unread: +(newTxt.match(/\d+/) || [0])[0],
      lastUrl: last ? absUrl(last.getAttribute('href')) : null,
      lastBy: tr.querySelector('.ktopic-latest-post a.kwho-user, .ktopic-latest-post a[class^="kwho"]')?.textContent.trim() || '',
      avatar: tr.querySelector('img.klist-avatar')?.getAttribute('src') || '',
      when: tr.querySelector('.ktopic-date')?.textContent.replace(/\s+/g, ' ').trim() || '',
      cat: tr.querySelector('.ktopic-category a')?.textContent.trim() || '',
      by: tr.querySelector('.ktopic-by a')?.textContent.trim() || '',
      sticky: !!tr.querySelector('[class*="sticky"]'),
    };
  });
}

async function loadTopics(filter, force) {
  if (filter === 'pinned') return;
  const l = forum.lists[filter];
  if (l && !force && Date.now() - l.at < 3 * 60_000) return;
  const f = FILTERS.find((x) => x.id === filter);
  forum.lists[filter] = { rows: parseTopics(await site(f.path)), at: Date.now() };
}

function drawTopicsSection() {
  const box = $('#fsec');
  const f = forum.filter;
  const chips = `<div class="wa-chips">${FILTERS.map((x) => `<button data-f="${x.id}" class="${f === x.id ? 'on' : ''}">${x.t}</button>`).join('')}</div>`;
  let rows;
  if (f === 'pinned') rows = Object.values(loadPins()).sort((a, b) => b.at - a.at);
  else if (forum.lists[f]) rows = forum.lists[f].rows;
  else { box.innerHTML = chips + '<div class="spinner"></div>'; bindChips(); return; }
  const q = forum.q.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q) || (r.lastBy || '').toLowerCase().includes(q));
  // pinned topics first
  const pins = loadPins();
  rows = [...rows].sort((a, b) => (pins[b.id] ? 1 : 0) - (pins[a.id] ? 1 : 0));
  box.innerHTML = chips + (rows.length ? topicRows(rows)
    : `<div class="center muted" style="padding:40px">${f === 'pinned' ? 'האלט אן א טעמע (לאנג דריקן) און קלייב "פין"' : 'קיין טעמעס נישט געפונען'}</div>`);
  bindChips();
  bindTopicRows(box, rows);
}
function bindChips() {
  document.querySelectorAll('.wa-chips button').forEach((b) => (b.onclick = () => {
    forum.filter = b.dataset.f;
    drawTopicsSection();
    loadTopics(forum.filter).then(() => { if (state.tab === 'forum' && forum.section === 'topics') drawTopicsSection(); }).catch((e) => toast(errText(e)));
  }));
}

function topicRows(rows) {
  const pins = loadPins();
  return rows.map((r, i) => `
    <button class="wa-row" data-i="${i}">${avatar(r.avatar, r.lastBy || r.by || r.title)}
      <span class="wa-mid">
        <span class="wa-top"><b>${esc(r.title)}</b><span class="wa-time${r.unread ? ' new' : ''}">${esc(shortWhen(r.when || ''))}</span></span>
        <span class="wa-top"><span class="wa-sub">${r.lastBy ? `<b>${esc(r.lastBy)}:</b> ` : ''}${esc(r.cat || '')}${r.replies ? ` · ${r.replies} ענטפערס` : r.views ? ` · ${esc(r.views)} קוקערס` : ''}</span>
          ${pins[r.id] ? '<span class="wa-ic">📌</span>' : ''}
          ${r.unread ? `<span class="wa-badge">${r.unread > 999 ? '999+' : r.unread}</span>` : ''}</span>
      </span></button>`).join('');
}
function bindTopicRows(box, rows) {
  box.querySelectorAll('.wa-row[data-i]').forEach((b) => {
    const r = rows[+b.dataset.i];
    b.onclick = () => openThread(r);
    onLongPress(b, () => topicMenu(r));
  });
}

/** Pin (on this phone), subscribe / favorite (on the forum), open on the site. */
async function topicMenu(t, acts) {
  const items = [
    { icon: '📌', t: isPinned(t) ? 'אנפין' : 'פין אויבן', run: () => { togglePin(t); drawSection(); } },
  ];
  const a = acts || t.actions;
  if (a?.subscribe) items.push({ icon: '🔔', t: 'סובסקרייב', s: 'באקום אן אימעיל ווען עמעצער ריפלייט', run: () => forumAction(t, a.subscribe, '🔔 סובסקרייבד', 'subscribe') });
  if (a?.unsubscribe) items.push({ icon: '🔕', t: 'אנסובסקרייב', run: () => forumAction(t, a.unsubscribe, 'אנסובסקרייבד', 'unsubscribe') });
  if (a?.favorite) items.push({ icon: '⭐', t: 'עד צו פעיווריטס', run: () => forumAction(t, a.favorite, '⭐ צוגעלייגט צו פעיווריטס', 'favorite') });
  if (a?.unfavorite) items.push({ icon: '☆', t: 'נעם ארויס פון פעיווריטס', run: () => forumAction(t, a.unfavorite, 'אראפגענומען', 'unfavorite') });
  if (!a) items.push({ icon: '🔔', t: 'סובסקרייב / פעיווריטס', s: 'עפן די טעמע צו זען די אפשאנס', run: () => openThread(t) });
  items.push({ icon: '🌐', t: 'עפן אויפ\'ן וועבזייטל', run: () => N.openWeb(`${SITE}/forum?func=view&catid=${t.catid}&id=${t.id}`, t.title) });
  actionSheet(t.title, items);
}
async function forumAction(t, href, okMsg, kind) {
  const r = await http('GET', absUrl(href));
  if (!r.ok) { toast(errText(r.status === 0 ? new Error('offline') : null)); return; }
  toast(okMsg);
  const a = t.actions || {};
  const flip = { subscribe: 'unsubscribe', unsubscribe: 'subscribe', favorite: 'unfavorite', unfavorite: 'favorite' };
  a[flip[kind]] = href.replace('do=' + kind, 'do=' + flip[kind]);
  delete a[kind];
  t.actions = a;
}

/* ---------- a forum topic, shown like a group chat ---------- */
function parseThread(doc) {
  const posts = [];
  doc.querySelectorAll('.kmsg-header').forEach((h) => {
    const t = h.nextElementSibling;
    if (!t || !t.matches('table.kmsg')) return;
    const text = t.querySelector('.kmsgtext');
    // desktop layout: profile column in the table; mobile layout: author + streak in the header
    const who = t.querySelector('.kpost-username a, .kpost-username') || h.querySelector('.kmsgby a');
    const uid = (who?.getAttribute?.('href') || '').match(/userid=(\d+)/)?.[1];
    posts.push({
      id: h.querySelector('a[name]')?.getAttribute('name'),
      when: h.querySelector('.kmsgdate')?.textContent.replace(/\s+/g, ' ').trim() || '',
      author: who?.textContent.trim() || '',
      avatar: t.querySelector('img.kavatar')?.getAttribute('src') || (uid ? `${SITE}/media/kunena/avatars/resized/size36/users/avatar${uid}.jpeg` : ''),
      streak: h.querySelector('.kmsg-current-streak-mobile')?.textContent.trim()
        || [...t.querySelectorAll('.kpost-userposts')].map((x) => x.textContent.trim()).find((x) => /איצטיגע/.test(x)) || '',
      html: text ? cleanHtml(text) : '',
      like: t.querySelector('.kpost-thankyou a')?.getAttribute('href') || null,
    });
  });
  const form = [...doc.querySelectorAll('form')].find((f) => f.querySelector('[name=parentid]'));
  let reply = null;
  if (form) {
    const tok = [...form.querySelectorAll('input[type=hidden]')].find((i) => /^[a-f0-9]{32}$/.test(i.name));
    reply = {
      catid: form.querySelector('[name=catid]')?.value,
      token: tok ? tok.name : null,
      me: form.querySelector('[name=authorname]')?.value || '',
      subject: form.querySelector('[name=subject]')?.value || '',
    };
  }
  const actions = {};
  doc.querySelectorAll('a[href*="do="]').forEach((a) => {
    const d = (a.getAttribute('href').match(/do=(subscribe|unsubscribe|favorite|unfavorite)\b/) || [])[1];
    if (d) actions[d] = a.getAttribute('href');
  });
  const starts = [...doc.querySelectorAll('select[name=start] option')].map((o) => +o.value).filter((n) => !isNaN(n));
  const title = (doc.querySelector('.kmsgtitle')?.textContent || '').replace(/^\s*ענטפער:\s*/, '').trim();
  return { posts, reply, starts, title, actions };
}

/** Keeps only safe, simple formatting from a forum post. */
function cleanHtml(src) {
  const out = document.createElement('div');
  const walk = (from, to) => {
    from.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        if (/@|https?:\/\//.test(n.textContent) && !(from.closest && from.closest('a'))) {
          const t = document.createElement('span');
          t.innerHTML = richText(n.textContent).replace(/<br>/g, ' ');
          while (t.firstChild) to.appendChild(t.firstChild);
        } else to.appendChild(document.createTextNode(n.textContent));
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      let el = null;
      if (n.classList.contains('kmsgtext-quote') || tag === 'BLOCKQUOTE') el = document.createElement('blockquote');
      else if (['P', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR'].includes(tag)) el = document.createElement(tag === 'STRONG' ? 'B' : tag === 'EM' ? 'I' : tag);
      else if (tag === 'A') {
        const href = absUrl(n.getAttribute('href') || '');
        el = document.createElement('a');
        el.setAttribute('data-href', href);
        // a link whose text is just the address -> show the short chip instead
        if (/^https?:\/\//.test(n.textContent.trim())) {
          el.className = 'chip-link';
          el.textContent = shortUrl(href);
          to.appendChild(el);
          return;
        }
      }
      else if (tag === 'IMG') {
        const s = absUrl(n.getAttribute('src') || '');
        if (/^https?:/.test(s)) { el = document.createElement('img'); el.src = s; el.loading = 'lazy'; if (/smil|emoticon|emoji/i.test(s)) el.className = 'smiley'; }
        if (el) to.appendChild(el);
        return;
      } else if (['SCRIPT', 'STYLE', 'IFRAME', 'FORM', 'INPUT', 'BUTTON'].includes(tag)) return;
      if (el) { walk(n, el); to.appendChild(el); } else walk(n, to);
    });
  };
  walk(src, out);
  return out.innerHTML;
}

async function fetchThreadPage(topic, start) {
  const url = `/forum?func=view&catid=${topic.catid}&id=${topic.id}&limit=50${start != null ? '&start=' + start : ''}`;
  return parseThread(await site(url));
}

async function openThread(topic) {
  const t = { topic, pages: [], title: topic.title, reply: null, lowest: null, sending: false };
  forum.thread = t;
  topic.unread = 0;
  const el = chatScreen({
    title: topic.title,
    sub: esc(topic.cat || ''),
    av: avatar(topic.avatar, topic.lastBy || topic.by || topic.title, 'wa-av sm'),
    menu: () => topicMenu(topic, t.actions),
  });
  el.querySelector('textarea').placeholder = 'שרייב אן ענטפער אין די טעמע…';
  t.el = el;
  pushScreen(el, () => { if (forum.thread === t) forum.thread = null; });
  el.querySelector('.wa-send').onclick = () => sendReply(t);
  el.querySelector('.wa-replying').remove();
  try {
    let start = topic.start != null ? topic.start : topic.lastUrl ? qs(topic.lastUrl).start : null;
    let page = await fetchThreadPage(topic, start);
    if (start == null && page.starts.length > 1) {
      start = Math.max(...page.starts);
      page = await fetchThreadPage(topic, start);
    }
    if (forum.thread !== t) return;
    t.lowest = start == null ? 0 : +start;
    t.pages = [page];
    t.reply = page.reply;
    t.actions = page.actions;
    topic.actions = page.actions;
    if (!topic.title && page.title) { t.title = page.title; el.querySelector('.wa-title').textContent = page.title; }
    drawThread(true);
  } catch (e) {
    if (forum.thread === t) el.querySelector('.wa-msgs').innerHTML = `<div class="day-chip" style="margin-top:40px">${errText(e)}</div>`;
  }
}

function drawThread(scrollBottom) {
  const t = forum.thread;
  if (!t) return;
  const box = t.el.querySelector('.wa-msgs');
  const me = (t.reply?.me || N.username() || '').trim().toLowerCase();
  const posts = t.pages.flatMap((p) => p.posts);
  let html = t.lowest > 0 ? '<button class="day-chip more" data-older>↑ פריערדיגע מעלדונגען</button>' : '';
  let lastDay = '', lastAuthor = '';
  posts.forEach((p) => {
    const time = (p.when.match(/\d{1,2}:\d{2}\s*[AP]M$/i) || [''])[0];
    const day = p.when.replace(time, '').trim();
    if (day && day !== lastDay) { html += `<div class="day-chip">${esc(day)}</div>`; lastDay = day; lastAuthor = ''; }
    const mine = me && p.author.trim().toLowerCase() === me;
    const cont = p.author === lastAuthor;
    lastAuthor = p.author;
    html += `<div class="msg ${mine ? 'out' : 'in'}${cont ? ' cont' : ''}" data-pid="${esc(p.id)}">
      ${!mine && !cont ? avatar(p.avatar, p.author, 'wa-av xs') : '<span class="wa-av xs ghost"></span>'}
      <div class="bub">
        ${!mine && !cont ? `<div class="who" style="color:${colorOf(p.author)}">${esc(p.author)}${p.streak ? `<span class="streak">${esc(p.streak.replace('איצטיגע שטרעקע:', '🔥'))}</span>` : ''}</div>` : ''}
        <div class="txt">${p.html}</div>
        <div class="meta">${p.like && !mine ? `<button class="like" data-like="${esc(p.like)}">👍</button>` : ''}<span>${esc(time)}</span>${mine ? '<span class="ticks seen">✓✓</span>' : ''}</div>
      </div></div>`;
  });
  box.innerHTML = html || '<div class="day-chip" style="margin-top:40px">נאך קיין מעלדונגען</div>';
  bindRich(box);
  box.querySelectorAll('[data-like]').forEach((b) => (b.onclick = () => likePost(b)));
  const older = box.querySelector('[data-older]');
  if (older) older.onclick = () => loadOlder(older);
  if (t.topic.jumpTo) {
    const target = box.querySelector(`[data-pid="${CSS.escape(t.topic.jumpTo)}"]`);
    t.topic.jumpTo = null;
    if (target) { setTimeout(() => { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); }, 60); scrollBottom = false; }
  }
  if (!t.reply) t.el.querySelector('.wa-compose').innerHTML = '<div class="wa-locked">מען קען נישט ענטפערן אויף די טעמע</div>';
  if (scrollBottom) box.scrollTop = box.scrollHeight;
}

async function loadOlder(btn) {
  const t = forum.thread;
  const box = t.el.querySelector('.wa-msgs');
  btn.textContent = '...';
  try {
    const start = Math.max(0, t.lowest - 50);
    const page = await fetchThreadPage(t.topic, start);
    if (forum.thread !== t) return;
    const before = box.scrollHeight - box.scrollTop;
    t.pages.unshift(page);
    t.lowest = start;
    drawThread(false);
    box.scrollTop = box.scrollHeight - before;
  } catch (e) {
    toast(errText(e));
    btn.textContent = '↑ פריערדיגע מעלדונגען';
  }
}

async function likePost(btn) {
  btn.disabled = true;
  const r = await http('GET', absUrl(btn.dataset.like));
  if (r.ok) { btn.classList.add('liked'); btn.textContent = '👍 א דאנק'; toast('א דאנק איז געשיקט געווארן'); }
  else { btn.disabled = false; toast(errText(r.status === 0 ? new Error('offline') : null)); }
}

async function sendReply(t) {
  const ta = t.el.querySelector('textarea');
  const msg = ta.value.trim();
  if (!t.reply || !msg || t.sending) return;
  t.sending = true;
  t.el.querySelector('.wa-send').classList.add('busy');
  const last = t.pages[t.pages.length - 1].posts.slice(-1)[0];
  // show it right away, like WhatsApp; confirmed after the forum answers
  const box = t.el.querySelector('.wa-msgs');
  const tmp = document.createElement('div');
  tmp.className = 'msg out pending';
  tmp.innerHTML = `<span class="wa-av xs ghost"></span><div class="bub"><div class="txt">${richText(msg)}</div><div class="meta"><span>🕓</span></div></div>`;
  box.appendChild(tmp);
  box.scrollTop = box.scrollHeight;
  ta.value = '';
  ta.oninput();
  const fields = {
    action: 'post',
    parentid: last?.id || t.topic.id,
    catid: t.reply.catid || t.topic.catid,
    subject: t.reply.subject || 'ענטפער: ' + t.title,
    message: toBBCode(msg),
    authorname: t.reply.me,
  };
  if (t.reply.token) fields[t.reply.token] = '1';
  const r = await httpForm(SITE + '/forum?func=post', fields);
  t.sending = false;
  t.el.querySelector('.wa-send')?.classList.remove('busy');
  if (!r.ok) {
    tmp.remove();
    ta.value = msg;
    ta.oninput();
    toast(r.status === 0 ? 'קיין אינטערנעט – די מעלדונג איז נישט געשיקט' : 'דער פארום האט נישט אנגענומען די מעלדונג. פרוביר נאכאמאל.');
    return;
  }
  // reload the last page so the real post (with its number and time) shows up
  try {
    const topic = t.topic;
    let page = await fetchThreadPage(topic, null);
    if (page.starts.length > 1) page = await fetchThreadPage(topic, Math.max(...page.starts));
    if (forum.thread !== t) return;
    t.pages = [page];
    t.lowest = page.starts.length > 1 ? Math.max(...page.starts) : 0;
    t.reply = page.reply || t.reply;
    drawThread(true);
    forum.lists = {};
    const newest = page.posts.slice(-1)[0];
    if (!newest || newest.author.trim().toLowerCase() !== (t.reply?.me || '').trim().toLowerCase()) {
      toast('די מעלדונג ווייזט זיך נאך נישט – אפשר דארף זי ווערן באשטעטיגט');
    }
  } catch { tmp.classList.remove('pending'); }
}

/* ---------- new topic ---------- */
async function newTopicSheet(catid) {
  openModal('<h2>נייע טעמע</h2><div class="spinner"></div>');
  let doc;
  try { doc = await site('/forum/newtopic'); } catch (e) { closeModal(); toast(errText(e)); return; }
  const form = [...doc.querySelectorAll('form')].find((f) => f.querySelector('[name=message]') && f.querySelector('select[name=catid]'));
  if (!form) { closeModal(); toast('מען קען נישט עפענען א נייע טעמע יעצט'); return; }
  const tok = [...form.querySelectorAll('input[type=hidden]')].find((i) => /^[a-f0-9]{32}$/.test(i.name));
  const cats = [...form.querySelectorAll('select[name=catid] option')].filter((o) => o.value !== '0')
    .map((o) => ({ v: o.value, t: o.textContent.replace(/^[.\s]+/, '').trim() }));
  const pick = catid || '3';
  openModal(`
    <h2>נייע טעמע</h2>
    <label class="field"><span>גרופע</span><select id="ntCat" class="input">${cats.map((c) => `<option value="${esc(c.v)}"${c.v === String(pick) ? ' selected' : ''}>${esc(c.t)}</option>`).join('')}</select></label>
    <label class="field"><span>טיטל</span><input id="ntSub" class="input" maxlength="50" dir="auto"></label>
    <label class="field"><span>מעלדונג</span><textarea id="ntMsg" class="input" rows="6" dir="auto"></textarea></label>
    <label class="check"><input type="checkbox" id="ntSubscribe" checked><span>🔔 סובסקרייב – לאז מיך וויסן ווען עמעצער ריפלייט</span></label>
    <div class="btns"><button class="btn wa-green" id="ntGo">${icon('send')} ארויפלייגן</button><button class="btn line" data-close>צוריק</button></div>`);
  $('#ntGo').onclick = async () => {
    const subject = $('#ntSub').value.trim(), message = $('#ntMsg').value.trim();
    if (!subject || !message) { toast('שרייב א טיטל און א מעלדונג'); return; }
    $('#ntGo').disabled = true;
    const fields = { action: 'post', id: '0', catid: $('#ntCat').value, subject, message: toBBCode(message) };
    if ($('#ntSubscribe').checked) fields.subscribeMe = '1';
    if (tok) fields[tok.name] = '1';
    const r = await httpForm(SITE + '/forum?func=post', fields);
    if (!r.ok) { $('#ntGo').disabled = false; toast('עס האט נישט געקלאפט. פרוביר נאכאמאל.'); return; }
    closeModal();
    toast('די טעמע איז ארויפגעלייגט');
    forum.lists = {};
    forum.cats = null;
    while (stack.length) popScreen();
    forum.section = 'topics';
    forum.filter = 'mine';
    renderForum();
  };
}
