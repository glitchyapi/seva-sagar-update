/* Seva Sagar — web bundle app. Runs inside the native shell (window.Seva bridge). */
'use strict';

/* ================= bridge ================= */
const Bridge = {
  seq: 0,
  pending: {},
  meta: {},
  call(op, arg, timeout = 90000) {
    return new Promise((res, rej) => {
      const id = ++this.seq;
      this.pending[id] = { res, rej };
      const t = setTimeout(() => { delete this.pending[id]; rej(new Error('timeout:' + op)); }, timeout);
      this.pending[id].t = t;
      if (window.Seva && Seva.call) Seva.call(JSON.stringify({ id, op, arg }));
      else { clearTimeout(t); delete this.pending[id]; rej(new Error('no_bridge')); }
    });
  },
  reply(obj) {
    const id = obj.id; const p = this.pending[id];
    if (!p) return;
    clearTimeout(p.t); delete this.pending[id];
    p.res(obj);
  },
  events: {},
  on(type, fn) { (this.events[type] = this.events[type] || []).push(fn); },
  fire(type, data) { (this.events[type] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); } }); }
};
window.__sevaReply = r => { try { Bridge.reply(typeof r === 'string' ? JSON.parse(r) : r); } catch (e) {} };
window.__sevaEvent = (type, data) => Bridge.fire(type, data);

/* ================= i18n ================= */
const I18N = { lang: 'en', d: {}, loaded: {} };
async function i18nLoad(lang) {
  if (I18N.loaded[lang]) { I18N.d = I18N.loaded[lang]; I18N.lang = lang; return; }
  try {
    const r = await fetch('i18n/' + lang + '.json');
    I18N.loaded[lang] = await r.json();
  } catch (e) {
    const r = await fetch('i18n/en.json');
    I18N.loaded[lang] = await r.json();
  }
  I18N.d = I18N.loaded[lang]; I18N.lang = lang;
}
function t(k, vars) {
  let s = (I18N.d && I18N.d[k]) || (I18N.loaded.en && I18N.loaded.en[k]) || k;
  if (vars) for (const key in vars) s = s.replace('{' + key + '}', vars[key]);
  return s;
}
function fmtDate(dstr) {
  if (!dstr) return '';
  const loc = { en: 'en-IN', hi: 'hi-IN', pa: 'pa-IN' }[I18N.lang] || 'en-IN';
  try {
    const d = new Date(dstr + 'T00:00:00');
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return dstr; }
}
function fmtTime(tstr) {
  if (!tstr) return '';
  const [h, m] = tstr.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

/* ================= data ================= */
const Doc = {
  doc: { sevas: [], events: [], profile: { name: '', satsang: '', greeting: 'waheguru' } },
  locked: false,
  async load() {
    const r = await Bridge.call('vault.load');
    if (r.ok && r.doc) { try { this.doc = JSON.parse(r.doc); } catch (e) {} }
    this.locked = !!r.locked;
    return r;
  },
  async save() { await Bridge.call('vault.save', JSON.stringify(this.doc)); },
  uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); },
  today() { const d = new Date(); return d.toISOString().slice(0, 10); },
  sevasOn(day) { return this.doc.sevas.filter(s => s.date === day); },
  stats() {
    const sevas = this.doc.sevas;
    const minutes = sevas.reduce((a, s) => a + (+s.minutes || 0), 0);
    const plates = sevas.reduce((a, s) => a + (+s.plates || 0), 0);
    const month = this.today().slice(0, 7);
    const monthCount = sevas.filter(s => (s.date || '').startsWith(month)).length;
    return { total: sevas.length, minutes, plates, monthCount, streak: this.streak() };
  },
  streak() {
    const days = [...new Set(this.doc.sevas.map(s => s.date))].sort().reverse();
    if (!days.length) return 0;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    let cur = this.today();
    if (days[0] !== cur && days[0] !== y) return 0;
    if (days[0] === y) cur = y;
    const set = new Set(days); let n = 0;
    while (set.has(cur)) { n++; cur = new Date(new Date(cur + 'T00:00:00').getTime() - 864e5).toISOString().slice(0, 10); }
    return n;
  },
  upcoming() { const td = this.today(); return this.doc.events.filter(e => e.date >= td).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); },
  past() { const td = this.today(); return this.doc.events.filter(e => e.date < td).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); }
};

/* ================= icons ================= */
const IC = {
  home: '<path d="M12 3l8.5 7.5h-2V20h-4.7v-6h-3.6v6H5.5v-9.5h-2z"/>',
  diary: '<path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6v12" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 8h6M11 11h6M11 14h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  bhan: '<path d="M4 10h16s-1 9-8 9-8-9-8-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 7c0-2 2-2 2-4M14 7c0-2 2-2 2-4M2 21h20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
  cal: '<path d="M7 2v3M17 2v3M4 6h16a1.5 1.5 0 0 1 1.5 1.5V20A1.5 1.5 0 0 1 20 21.5H4A1.5 1.5 0 0 1 2.5 20V7.5A1.5 1.5 0 0 1 4 6zM2.5 10h19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5.5l4 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  place: '<path d="M12 2.5c-4.1 0-7.5 3.4-7.5 7.5 0 5.5 7.5 11.5 7.5 11.5S19.5 15.5 19.5 10c0-4.1-3.4-7.5-7.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  edit: '<path d="M4 20v-4L16.5 3.5a2.1 2.1 0 0 1 3 3L7 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  del: '<path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  bell: '<path d="M12 3c-3.3 0-6 2.7-6 6v5l-2 3h16l-2-3V9c0-3.3-2.7-6-6-6zM10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  shield: '<path d="M12 2.5 20 5.5V11c0 5.5-3.4 9.4-8 11-4.6-1.6-8-5.5-8-11V5.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 11.5 2.5 2.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  globe: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.8 12h18.4M12 2.8c-3 3-4.5 6.1-4.5 9.2s1.5 6.2 4.5 9.2c3-3 4.5-6.1 4.5-9.2S15 5.8 12 2.8z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  chart: '<path d="M4 20v-10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5V17M12 7.2v.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m15.5 15.5 5.5 5.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  flame: '<path d="M12 2.5c3 4.5 6 7 6 11 0 4.1-2.7 7-6 7s-6-2.9-6-7c0-4 3-6.5 6-11z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10c1.4 2 2.5 3.2 2.5 5 0 1.9-1.1 3-2.5 3s-2.5-1.1-2.5-3c0-1.8 1.1-3 2.5-5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14a1.5 1.5 0 0 1 1.5 1.5V20A1.5 1.5 0 0 1 19 21.5H5A1.5 1.5 0 0 1 3.5 20v-8.5A1.5 1.5 0 0 1 5 10zM12 14v3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  backup: '<path d="M7 18a4.5 4.5 0 0 1-.5-9c.9-3.4 3.9-5.5 7-5.5 3.9 0 7 2.9 7.4 6.6A4 4 0 0 1 19 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 12v9m-3.5-3.5L12 21l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  chev: '<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="7.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.7c2.5.5 4 2.3 4 5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  lotus: '<path d="M12 4c1.8 2.5 2.6 4.6 2.6 6.6 0 2.4-1.1 4-2.6 4s-2.6-1.6-2.6-4C9.4 8.6 10.2 6.5 12 4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 9c3 .6 5 2 5.8 4.2M20 9c-3 .6-5 2-5.8 4.2M2.5 15c2.5 3.4 5.7 5 9.5 5s7-1.6 9.5-5c-3 1.2-6.1 1.8-9.5 1.8S5.5 16.2 2.5 15z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 3v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  spark: '<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  logo: '<g><path d="M54 28c7 9 12 15 12 23 0 8-5.4 13-12 13s-12-5-12-13c0-8 5-14 12-23z" fill="#E8590C"/><path d="M54 40c3.6 4.6 6 7.6 6 11.4 0 4.2-2.7 7-6 7s-6-2.8-6-7c0-3.8 2.4-6.8 6-11.4z" fill="#F59F00"/><path d="M38 67h32s-4 8-16 8-16-8-16-8z" fill="#C64A08"/><path d="M30 80c6-3.5 12-3.5 18 0s12 3.5 18 0c4-2.3 8-2.6 12-.6v3.6c-4-2-8-1.7-12 .6-6 3.4-18 3.4-24 0-4-2.3-8-2.6-12-.2z" fill="#1971C2" opacity=".9"/></g>',
  empty: '<g fill="none" stroke="#C9BFB2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 20h36s-2.5 22-18 22-18-22-18-22z"/><path d="M24 13c0-5 5-5 5-10M36 13c0-5 5-5 5-10"/><circle cx="32" cy="32" r="2.4"/></g>'
};
function icon(name, size = 24, color) {
  const vb = name === 'logo' || name === 'empty' ? '0 0 108 108' : '0 0 24 24';
  return '<svg width="' + size + '" height="' + size + '" viewBox="' + vb + '" ' +
    (color ? 'style="color:' + color + '"' : '') + '>' + (IC[name] || '') + '</svg>';
}

/* ================= seva type meta ================= */
const TYPES = [
  ['simran', 'flame', '#FFF1E8', '#E8590C'],
  ['kirtan', 'lotus', '#F1ECFD', '#6741D9'],
  ['langar', 'bhan', '#FFF9E6', '#B08900'],
  ['katha', 'users', '#E7F1FB', '#1971C2'],
  ['safai', 'spark', '#EBFBEE', '#2F9E44'],
  ['prachar', 'place', '#FDEEEE', '#C92A2A'],
  ['annadaan', 'backup', '#E6FCF5', '#0C8599'],
  ['other', 'diary', '#F1F3F5', '#495057']
];
const typeMeta = k => TYPES.find(x => x[0] === k) || TYPES[7];

/* ================= ui helpers ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let toastTimer;
function toast(msg) {
  let n = $('#toast');
  if (!n) { n = el('<div id="toast"></div>'); document.body.appendChild(n); }
  n.textContent = msg; n.classList.remove('hide');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.add('hide'), 2400);
}
let sheetStack = [];
function sheet(html, onMount) {
  const back = el('<div class="sheet-back"></div>');
  const sh = el('<div class="sheet"><div class="grab"></div>' + html + '</div>');
  back.onclick = () => close();
  document.body.appendChild(back); document.body.appendChild(sh);
  sheetStack.push({ back, sh, close });
  function close() {
    sh.style.transition = 'transform .22s'; sh.style.transform = 'translateY(70%)';
    back.style.transition = 'opacity .2s'; back.style.opacity = '0';
    setTimeout(() => { back.remove(); sh.remove(); }, 210);
    sheetStack = sheetStack.filter(x => x.close !== close);
  }
  if (onMount) onMount(sh, close);
  return { el: sh, close };
}
function confirmBox(msg, onYes, yesLabel) {
  sheet('<h3>' + esc(msg) + '</h3><div class="row"><button class="btn ghost" data-x="no">' + t('act.cancel') +
    '</button><button class="btn danger" data-x="yes">' + (yesLabel || t('act.delete')) + '</button></div>',
    (sh, close) => {
      sh.querySelector('[data-x=no]').onclick = close;
      sh.querySelector('[data-x=yes]').onclick = () => { close(); onYes(); };
    });
}
function humanMin(m) {
  m = +m || 0;
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60 ? (m % 60) + 'm' : '');
}

/* ================= screens ================= */
const Screens = {};
let currentTab = 'home';

Screens.home = () => {
  const st = Doc.stats();
  const today = Doc.sevasOn(Doc.today());
  const up = Doc.upcoming().slice(0, 2);
  const recent = Doc.doc.sevas.slice(0, 4);
  const p = Doc.doc.profile;
  const hrs = (st.minutes / 60).toFixed(st.minutes < 600 ? 1 : 0);
  const greetKey = 'greet.' + (p.greeting || 'waheguru');

  let banners = '';
  if (up.length) {
    banners = up.map((e, i) => `
      <div class="banner ${i % 2 ? 'green' : ''}" data-ev="${e.id}">
        <div class="deco">${icon(e.kind === 'satsang' ? 'lotus' : 'bhan', 96)}</div>
        <span class="tag">${icon('flame', 12)} ${esc(t('bhan.kind.' + (e.kind || 'bhandara')))}</span>
        <h4>${esc(e.name)}</h4>
        <p>${icon('place', 12)} ${esc(e.place || '—')} &nbsp;•&nbsp; ${icon('cal', 12)} ${esc(fmtDate(e.date))} ${e.time ? ' · ' + fmtTime(e.time) : ''}</p>
        <div class="row"><button class="mini-btn" data-share="${e.id}">${t('bhan.share')}</button></div>
      </div>`).join('');
  } else {
    banners = `<div class="card flat center muted" style="padding:26px">${t('home.banners.none')}</div>`;
  }

  return `
  <div class="screen">
    <div class="stats">
      <div class="stat"><b>${st.total}</b><span>${t('home.stats.sevas')}</span></div>
      <div class="stat"><b><em>${hrs}</em></b><span>${t('home.stats.hours')}</span></div>
      <div class="stat"><b>${st.streak}</b><span>${t('home.stats.streak')}</span></div>
    </div>

    <div class="sec"><h3>${t('home.today')}</h3><a data-act="addseva">+ ${t('home.record')}</a></div>
    ${today.length ? today.map(sevaRow).join('') : `
      <div class="card flat" style="display:flex;align-items:center;gap:14px">
        <div style="width:46px;height:46px;border-radius:16px;background:var(--saffron-l);display:grid;place-items:center;color:var(--saffron)">${icon('flame', 24)}</div>
        <div style="flex:1"><b style="font-size:14px">${t('home.none.today')}</b></div>
        <button class="btn sm" data-act="addseva">${t('act.add')}</button>
      </div>`}

    <div class="sec"><h3>${t('home.banners')}</h3><a data-tab="bhandara">${t('home.seeall')}</a></div>
    ${banners}

    <div class="sec"><h3>${t('home.recent')}</h3><a data-tab="seva">${t('home.seeall')}</a></div>
    ${recent.length ? recent.map(sevaRow).join('') : ''}
  </div>`;
};

function sevaRow(s) {
  const m = typeMeta(s.type);
  return `<div class="seva-item" data-seva="${s.id}">
    <div class="ic" style="background:${m[2]};color:${m[3]}">${icon(m[1], 24)}</div>
    <div class="tx"><b>${esc(t('type.' + s.type))}</b><span>${esc(s.place || '—')}${s.notes ? ' · ' + esc(s.notes) : ''}</span></div>
    <div class="rt"><b>${s.minutes ? humanMin(s.minutes) : ''}${s.plates ? (s.minutes ? ' · ' : '') + s.plates + '' : ''}</b><span>${esc(fmtDate(s.date))}</span></div>
  </div>`;
}

Screens.seva = () => {
  const st = Doc.stats();
  return `<div class="screen">
    <div class="card" style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="color:var(--ink-3)">${icon('search', 20)}</div>
      <input id="q" placeholder="${t('seva.search')}" style="border:0;background:none;outline:none;width:100%;font-weight:600">
    </div>
    <div class="chips" id="fchips">
      <button class="chip saffron on" data-f="all">${t('seva.all')}</button>
      ${TYPES.map(x => `<button class="chip saffron" data-f="${x[0]}">${esc(t('type.' + x[0]))}</button>`).join('')}
    </div>
    <div class="stats" style="margin:16px 0">
      <div class="stat"><b>${st.monthCount}</b><span>${t('seva.month')}</span></div>
      <div class="stat"><b>${st.total}</b><span>${t('seva.total')}</span></div>
      <div class="stat"><b>${st.plates}</b><span>${t('home.stats.plates')}</span></div>
    </div>
    <div id="list">${sevaList(Doc.doc.sevas)}</div>
    <button class="btn mt" data-act="addseva">${icon('plus', 20)} ${t('seva.add')}</button>
  </div>`;
};
function sevaList(list) {
  if (!list.length) return `<div class="empty"><div class="ei">${icon('empty', 44)}</div><b>${t('seva.empty.t')}</b><p>${t('seva.empty.s')}</p></div>`;
  return list.map(sevaRow).join('');
}

Screens.bhandara = () => {
  const up = Doc.upcoming(), past = Doc.past();
  const block = (evs, cls) => evs.length ? `<div class="tl">${evs.map(e => `
    <div class="ev ${cls}" data-ev="${e.id}">
      <div class="card" style="padding:16px">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="width:44px;height:44px;border-radius:14px;background:${e.kind === 'satsang' ? 'var(--violet-l)' : 'var(--saffron-l)'};color:${e.kind === 'satsang' ? 'var(--violet)' : 'var(--saffron)'};display:grid;place-items:center;flex:none">${icon(e.kind === 'satsang' ? 'lotus' : 'bhan', 22)}</div>
          <div style="flex:1;min-width:0">
            <b style="font-size:15px">${esc(e.name)}</b>
            <div class="muted" style="font-size:12.5px;font-weight:600;margin-top:3px">${icon('place', 11)} ${esc(e.place || '—')}</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--saffron-d);margin-top:5px">${icon('cal', 12)} ${esc(fmtDate(e.date))}${e.time ? ' · ' + fmtTime(e.time) : ''}${e.date === Doc.today() ? ' · ' + t('bhan.today') : ''}</div>
            ${e.desc ? `<p style="font-size:13px;color:var(--ink-2);font-weight:600;margin-top:7px">${esc(e.desc)}</p>` : ''}
            <div class="row" style="margin-top:12px">
              <button class="mini-btn" data-share="${e.id}">${t('bhan.share')}</button>
              <button class="mini-btn" data-remind="${e.id}">${icon('bell', 13)} ${t('bhan.remind')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>`).join('')}</div>` : '';
  return `<div class="screen">
    <div class="sec" style="margin-top:4px"><h3>${t('bhan.upcoming')}</h3></div>
    ${up.length ? block(up, '') : `<div class="empty"><div class="ei">${icon('empty', 44)}</div><b>${t('bhan.empty.t')}</b><p>${t('bhan.empty.s')}</p></div>`}
    <div class="sec"><h3>${t('bhan.past')}</h3></div>
    ${past.length ? block(past, 'past') : ''}
    <button class="btn mt" data-act="addev">${icon('plus', 20)} ${t('bhan.add')}</button>
  </div>`;
};

Screens.more = async () => {
  const meta = Bridge.meta;
  const pin = await Bridge.call('pin.has');
  const p = Doc.doc.profile;
  return `<div class="screen">
    <div class="card" style="display:flex;gap:14px;align-items:center">
      <div class="avatar" style="width:54px;height:54px;font-size:20px">${esc((p.name || '?').charAt(0).toUpperCase())}</div>
      <div style="flex:1"><b style="font-size:16px">${esc(p.name || '—')}</b>
        <div class="muted" style="font-size:12.5px;font-weight:600">${esc(p.satsang || '')}</div></div>
      <button class="icon-btn" data-act="profile" style="box-shadow:none;border:1px solid var(--line)">${icon('edit', 18)}</button>
    </div>

    <div class="sec"><h3>${t('more.title')}</h3></div>
    <div class="card" style="padding:6px 18px">
      ${mItem('globe', 'var(--sky-l)', 'var(--sky)', t('more.language'), 'lang', I18N.lang.toUpperCase())}
      ${mItem('shield', 'var(--leaf-l)', 'var(--leaf)', t('more.pin'), 'pin', pin.enabled ? '●' : '○')}
      ${mItem('backup', 'var(--violet-l)', 'var(--violet)', t('more.backup'), 'backup')}
      ${mItem('dl', 'var(--saffron-l)', 'var(--saffron)', t('more.update'), 'update', '', Bridge.meta.updateBadge)}
      ${mItem('chart', 'var(--marigold-l)', '#B08900', t('more.stats'), 'stats')}
      ${mItem('info', '#F1F3F5', '#495057', t('more.about'), 'about')}
    </div>
    <div class="card flat center mt" style="padding:14px">
      <span class="muted" style="font-size:12px;font-weight:700">${t('more.version')} ${esc(String(meta.webVersion ?? meta.versionCode ?? ''))} · shell ${esc(String(meta.shellVersion ?? meta.versionCode ?? ''))}</span>
    </div>
    <button class="btn ghost danger mt" style="color:var(--rose)" data-act="wipe">${t('more.clear')}</button>
  </div>`;
};
function mItem(ic, bg, fg, label, act, right, dot) {
  return `<div class="list-item" data-act="${act}" style="cursor:pointer">
    <div class="ic" style="background:${bg};color:${fg}">${icon(ic, 20)}</div>
    <div class="tx"><b>${esc(label)}</b></div>
    ${right ? '<span class="muted" style="font-weight:700;font-size:13px">' + esc(right) + '</span>' : ''}
    ${dot ? '<span class="badge" style="position:static;border:0"></span>' : ''}
    <span style="color:var(--ink-3)">${icon('chev', 16)}</span>
  </div>`;
}

/* ================= sheets: forms ================= */
function sevaSheet(id) {
  const s = id ? Doc.doc.sevas.find(x => x.id === id) : null;
  const d = s || { type: 'simran', place: '', date: Doc.today(), time: '', minutes: '', plates: '', notes: '' };
  sheet(`<h3>${t(s ? 'seva.edit' : 'seva.add')}</h3>
    <div class="field"><label>${t('seva.type')}</label>
      <div class="chips" id="types">${TYPES.map(x =>
        `<button class="chip saffron ${x[0] === d.type ? 'on' : ''}" data-t="${x[0]}">${esc(t('type.' + x[0]))}</button>`).join('')}</div>
    </div>
    <div class="field"><label>${t('seva.place')}</label><input id="f-place" value="${esc(d.place)}" placeholder="—"></div>
    <div class="grid2">
      <div class="field"><label>${t('seva.date')}</label><input id="f-date" type="date" value="${esc(d.date)}"></div>
      <div class="field"><label>${t('seva.time')}</label><input id="f-time" type="time" value="${esc(d.time)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>${t('seva.minutes')}</label><input id="f-min" type="number" inputmode="numeric" min="0" value="${esc(d.minutes || '')}"></div>
      <div class="field"><label>${t('seva.plates')}</label><input id="f-pl" type="number" inputmode="numeric" min="0" value="${esc(d.plates || '')}"></div>
    </div>
    <div class="field"><label>${t('seva.notes')}</label><textarea id="f-notes">${esc(d.notes)}</textarea></div>
    <div class="row">
      ${s ? '<button class="btn ghost" style="color:var(--rose);flex:0 0 54px" id="fdel">' + icon('del', 20) + '</button>' : ''}
      <button class="btn" id="fsave">${t('seva.save')}</button>
    </div>`,
    (sh, close) => {
      let type = d.type;
      sh.querySelectorAll('#types .chip').forEach(c => c.onclick = () => {
        type = c.dataset.t;
        sh.querySelectorAll('#types .chip').forEach(x => x.classList.toggle('on', x === c));
      });
      sh.querySelector('#fsave').onclick = async () => {
        const rec = {
          id: s ? s.id : Doc.uid(), type,
          place: sh.querySelector('#f-place').value.trim(),
          date: sh.querySelector('#f-date').value || Doc.today(),
          time: sh.querySelector('#f-time').value,
          minutes: +sh.querySelector('#f-min').value || 0,
          plates: +sh.querySelector('#f-pl').value || 0,
          notes: sh.querySelector('#f-notes').value.trim(),
          createdAt: s ? s.createdAt : Date.now()
        };
        const i = Doc.doc.sevas.findIndex(x => x.id === rec.id);
        if (i >= 0) Doc.doc.sevas[i] = rec; else Doc.doc.sevas.unshift(rec);
        await Doc.save(); close(); toast(t('seva.saved')); render();
      };
      const del = sh.querySelector('#fdel');
      if (del) del.onclick = () => confirmBox(t('seva.delete.q'), async () => {
        Doc.doc.sevas = Doc.doc.sevas.filter(x => x.id !== id);
        await Doc.save(); close(); toast(t('seva.deleted')); render();
      });
    });
}

function evSheet(id) {
  const e = id ? Doc.doc.events.find(x => x.id === id) : null;
  const d = e || { name: '', place: '', date: Doc.today(), time: '', desc: '', kind: 'bhandara' };
  sheet(`<h3>${t(e ? 'act.edit' : 'bhan.add')}</h3>
    <div class="field"><label>${t('bhan.name')}</label><input id="e-name" value="${esc(d.name)}"></div>
    <div class="field"><label>${t('bhan.kind')}</label>
      <div class="chips" id="kinds">${['bhandara', 'satsang', 'other'].map(k =>
        `<button class="chip saffron ${k === d.kind ? 'on' : ''}" data-k="${k}">${esc(t('bhan.kind.' + k))}</button>`).join('')}</div></div>
    <div class="field"><label>${t('bhan.place')}</label><input id="e-place" value="${esc(d.place)}"></div>
    <div class="grid2">
      <div class="field"><label>${t('bhan.date')}</label><input id="e-date" type="date" value="${esc(d.date)}"></div>
      <div class="field"><label>${t('bhan.time')}</label><input id="e-time" type="time" value="${esc(d.time)}"></div>
    </div>
    <div class="field"><label>${t('bhan.desc')}</label><textarea id="e-desc">${esc(d.desc)}</textarea></div>
    <div class="row">
      ${e ? '<button class="btn ghost" style="color:var(--rose);flex:0 0 54px" id="edel">' + icon('del', 20) + '</button>' : ''}
      <button class="btn" id="esave">${t('act.save')}</button>
    </div>`,
    (sh, close) => {
      let kind = d.kind;
      sh.querySelectorAll('#kinds .chip').forEach(c => c.onclick = () => {
        kind = c.dataset.k;
        sh.querySelectorAll('#kinds .chip').forEach(x => x.classList.toggle('on', x === c));
      });
      sh.querySelector('#esave').onclick = async () => {
        const rec = {
          id: e ? e.id : Doc.uid(), kind,
          name: sh.querySelector('#e-name').value.trim() || '—',
          place: sh.querySelector('#e-place').value.trim(),
          date: sh.querySelector('#e-date').value || Doc.today(),
          time: sh.querySelector('#e-time').value,
          desc: sh.querySelector('#e-desc').value.trim(),
          remind: e ? e.remind : false,
          createdAt: e ? e.createdAt : Date.now()
        };
        const i = Doc.doc.events.findIndex(x => x.id === rec.id);
        if (i >= 0) Doc.doc.events[i] = rec; else Doc.doc.events.unshift(rec);
        await Doc.save(); close(); toast(t('bhan.saved')); render();
      };
      const del = sh.querySelector('#edel');
      if (del) del.onclick = () => confirmBox(t('bhan.delete.q'), async () => {
        Doc.doc.events = Doc.doc.events.filter(x => x.id !== id);
        await Doc.save(); close(); toast(t('bhan.deleted')); render();
      });
    });
}

function profileSheet() {
  const p = Doc.doc.profile;
  sheet(`<h3>${t('more.profile')}</h3>
    <div class="field"><label>${t('more.name')}</label><input id="p-name" value="${esc(p.name)}"></div>
    <div class="field"><label>${t('more.satsang')}</label><input id="p-sat" value="${esc(p.satsang)}"></div>
    <div class="field"><label>${t('more.greeting')}</label>
      <div class="chips" id="greets">${['waheguru', 'radhe', 'ram', 'om'].map(g =>
        `<button class="chip saffron ${g === p.greeting ? 'on' : ''}" data-g="${g}">${esc(t('greet.' + g))}</button>`).join('')}</div></div>
    <button class="btn" id="psave">${t('act.save')}</button>`,
    (sh, close) => {
      let g = p.greeting;
      sh.querySelectorAll('#greets .chip').forEach(c => c.onclick = () => {
        g = c.dataset.g;
        sh.querySelectorAll('#greets .chip').forEach(x => x.classList.toggle('on', x === c));
      });
      sh.querySelector('#psave').onclick = async () => {
        Doc.doc.profile = { name: sh.querySelector('#p-name').value.trim(), satsang: sh.querySelector('#p-sat').value.trim(), greeting: g };
        await Doc.save(); close(); toast(t('more.saved')); render();
      };
    });
}

/* ================= pin pad ================= */
function pinPad(title, onDone) {
  let entry = '';
  const s = sheet(`<h3 class="center">${esc(title)}</h3>
    <div class="pin-dots" id="dots"><i></i><i></i><i></i><i></i></div>
    <div class="pinpad" id="pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}
      <button data-n="c">⌫</button><button data-n="0">0</button><button data-n="ok">✓</button>
    </div><p class="center muted" id="pmsg" style="margin-top:14px;font-weight:700"></p>`,
    (sh, close) => {
      const dots = sh.querySelectorAll('#dots i');
      const msg = sh.querySelector('#pmsg');
      const paint = () => dots.forEach((d, i) => d.classList.toggle('f', i < entry.length));
      sh.querySelector('#pad').onclick = async ev => {
        const n = ev.target.dataset.n; if (!n) return;
        if (n === 'c') entry = entry.slice(0, -1);
        else if (n === 'ok') { await submit(); return; }
        else if (entry.length < 4) entry += n;
        paint();
        if (entry.length === 4) setTimeout(submit, 120);
      };
      async function submit() {
        if (entry.length < 4) return;
        const r = await onDone(entry, msg);
        if (r === true) close();
        else { entry = ''; paint(); msg.textContent = r || t('pin.wrong'); }
      }
    });
  return s;
}

/* ================= updates ui ================= */
Bridge.on('update:manifest', async d => {
  Bridge.meta.updateBadge = d.ok && d.manifest && (d.manifest.versionCode > d.current || d.needsShell);
  paintBadge();
  if (!d.ok) { if (!d.silent) toast(t('upd.offline')); return; }
  const m = d.manifest;
  const newer = m.versionCode > d.current;
  if (!newer && !d.needsShell) { if (!d.silent) toast(t('upd.uptodate')); return; }
  if (d.silent && !m.force) return;   // silent check: badge only, no interruption
  openUpdate(m, d);
});
Bridge.on('update:progress', d => {
  const bar = $('#uprog i'); if (bar && d.total) bar.style.width = Math.round(100 * d.done / d.total) + '%';
  const lbl = $('#uprog-lbl'); if (lbl) lbl.textContent = d.done + ' / ' + d.total + ' ' + t('upd.files');
});
Bridge.on('update:state', d => {
  const lbl = $('#ustate'); if (lbl) lbl.textContent = t('upd.' + (d.state === 'applying' ? 'applying' : 'downloading'));
});

function paintBadge() {
  const b = $('#nav-more .dot');
  if (b) b.classList.toggle('hide', !Bridge.meta.updateBadge);
  const nb = $('#nav-update-dot'); if (nb) nb.classList.toggle('hide', !Bridge.meta.updateBadge);
}

function openUpdate(m, info) {
  const local = info ? info.current : 0;
  sheet(`<div class="upd-hero" style="color:var(--saffron)">${icon('dl', 36)}</div>
    <h3 class="center">${t('upd.available')}</h3>
    <p class="center muted" style="font-weight:700">${t('upd.current')}: v${local} → ${t('upd.latest')}: <b style="color:var(--saffron-d)">v${m.versionCode}</b> (${esc(m.versionName)})</p>
    ${info && info.needsShell ? `<div class="notes" style="background:var(--saffron-l);color:var(--saffron-d)">${t('upd.shell')}</div>` : ''}
    <div class="prog" id="uprog"><i></i></div>
    <p class="center muted" id="uprog-lbl" style="font-size:12px;font-weight:700">${m.files ? m.files.length + ' ' + t('upd.files') : ''}</p>
    <p class="center" id="ustate" style="font-weight:800;color:var(--saffron-d);min-height:20px"></p>
    ${m.notes && m.notes[I18N.lang] ? `<div class="notes">${esc(m.notes[I18N.lang])}</div>` : (m.notes && m.notes.en ? `<div class="notes">${esc(m.notes.en)}</div>` : '')}
    <div class="row mt">
      ${m.force ? '' : '<button class="btn ghost" id="ulater">' + t('upd.later') + '</button>'}
      <button class="btn" id="unow">${info && info.needsShell ? t('upd.shell.btn') : t('upd.now')}</button>
    </div>
    <button class="btn ghost hide mt" id="urestart">${t('upd.restart')}</button>`,
    (sh, close) => {
      const later = sh.querySelector('#ulater'); if (later) later.onclick = close;
      sh.querySelector('#unow').onclick = async () => {
        sh.querySelector('#unow').disabled = true;
        const op = info && info.needsShell ? 'update.shell' : 'update.apply';
        const r = await Bridge.call(op, null, 300000);
        if (r.ok) {
          sh.querySelector('#ustate').textContent = t('upd.done');
          sh.querySelector('#uprog i').style.width = '100%';
          const rs = sh.querySelector('#urestart'); rs.classList.remove('hide');
          rs.onclick = () => Bridge.call('app.restart');
          sh.querySelector('#unow').classList.add('hide');
          if (later) later.classList.add('hide');
          Bridge.meta.updateBadge = false; paintBadge();
        } else {
          sh.querySelector('#ustate').textContent = t('upd.failed') + ' — ' + (r.error || r.msg || '');
          const un = sh.querySelector('#unow'); un.disabled = false; un.textContent = t('upd.retry');
        }
      };
    });
}

/* ================= router / render ================= */
const TABS = [
  ['home', 'home'], ['seva', 'diary'], ['bhandara', 'bhan'], ['more', 'grid']
];
async function render() {
  const main = $('#main');
  const hdr = $('#hdr');
  const p = Doc.doc.profile;
  if (currentTab === 'home') {
    const h = new Date().getHours();
    const gk = h < 12 ? 'greet.morning' : h < 17 ? 'greet.afternoon' : 'greet.evening';
    hdr.innerHTML = `<div class="greet"><small>${t(gk)} · ${esc(t('greet.' + (p.greeting || 'waheguru')))}</small>
        <b>${esc(p.name || t('app.name'))}</b></div>
      <button class="icon-btn" id="hbell">${icon('bell', 20)}<span class="badge ${Bridge.meta.updateBadge ? '' : 'hide'}" id="nav-update-dot"></span></button>`;
    hdr.querySelector('#hbell').onclick = () => go('more');
  } else {
    const titles = { seva: 'seva.title', bhandara: 'bhan.title', more: 'more.title' };
    hdr.innerHTML = `<div class="greet"><b>${t(titles[currentTab])}</b></div>
      <button class="icon-btn" id="hbell">${icon('bell', 20)}<span class="badge ${Bridge.meta.updateBadge ? '' : 'hide'}" id="nav-update-dot"></span></button>`;
    hdr.querySelector('#hbell').onclick = () => go('more');
  }
  main.innerHTML = '<div class="skel" style="height:120px"></div>';
  const html = await Screens[currentTab]();
  main.innerHTML = html;
  wireScreen();
  paintBadge();
}

function go(tab) {
  currentTab = tab;
  $$('nav.bottom button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  render();
}

function wireScreen() {
  // tab links & add actions
  $$('[data-tab]').forEach(a => a.onclick = () => go(a.dataset.tab));
  $$('[data-act=addseva]').forEach(b => b.onclick = () => sevaSheet());
  $$('[data-act=addev]').forEach(b => b.onclick = () => evSheet());
  $$('[data-act=profile]').forEach(b => b.onclick = () => profileSheet());
  $$('[data-seva]').forEach(n => n.onclick = () => sevaSheet(n.dataset.seva));
  $$('[data-ev]').forEach(n => n.onclick = ev => {
    if (ev.target.closest('button')) return;
    evSheet(n.dataset.ev);
  });
  $$('[data-share]').forEach(b => b.onclick = () => {
    const e = Doc.doc.events.find(x => x.id === b.dataset.share);
    if (!e) return;
    Bridge.call('share.text',
      `🙏 *${e.name}* 🙏\n📍 ${e.place || '—'}\n🗓 ${fmtDate(e.date)}${e.time ? ' · ' + fmtTime(e.time) : ''}\n${e.desc ? e.desc + '\n' : ''}— ${t('app.name')}`);
  });
  $$('[data-remind]').forEach(b => b.onclick = async () => {
    const e = Doc.doc.events.find(x => x.id === b.dataset.remind);
    if (!e) return;
    const perm = await Bridge.call('notif.perm');
    if (!perm.granted) { toast('⚠️ notifications blocked'); return; }
    await Bridge.call('notif.post', { title: e.name, body: fmtDate(e.date) + (e.time ? ' · ' + fmtTime(e.time) : '') + ' — ' + (e.place || '') });
    toast(t('bhan.remind.on'));
  });
  // search + filter on seva screen
  const q = $('#q');
  if (q) {
    let f = 'all';
    const apply = () => {
      let list = Doc.doc.sevas;
      if (f !== 'all') list = list.filter(s => s.type === f);
      const term = q.value.trim().toLowerCase();
      if (term) list = list.filter(s => (s.place + ' ' + s.notes + ' ' + t('type.' + s.type)).toLowerCase().includes(term));
      $('#list').innerHTML = sevaList(list);
      $$('[data-seva]').forEach(n => n.onclick = () => sevaSheet(n.dataset.seva));
    };
    q.oninput = apply;
    $$('#fchips .chip').forEach(c => c.onclick = () => {
      f = c.dataset.f;
      $$('#fchips .chip').forEach(x => x.classList.toggle('on', x === c));
      apply();
    });
  }
  // more-screen items
  $$('[data-act]').forEach(n => {
    const a = n.dataset.act;
    if (['addseva', 'addev', 'profile'].includes(a)) return;
    n.onclick = () => moreAction(a);
  });
}

async function moreAction(a) {
  if (a === 'lang') {
    sheet(`<h3>${t('more.language')}</h3>` +
      [['en', 'English'], ['hi', 'हिंदी'], ['pa', 'ਪੰਜਾਬੀ']].map(([c, n]) =>
        `<div class="list-item" data-l="${c}" style="cursor:pointer"><div class="tx"><b>${n}</b></div>${I18N.lang === c ? '<span style="color:var(--saffron)">' + icon('check', 20) + '</span>' : ''}</div>`).join(''),
        (sh, close) => sh.querySelectorAll('[data-l]').forEach(x => x.onclick = async () => {
          await Bridge.call('prefs.set', { lang: x.dataset.l });
          await i18nLoad(x.dataset.l);
          close(); renderNav(); render(); toast(t('more.saved'));
        }));
  }
  else if (a === 'pin') {
    const has = await Bridge.call('pin.has');
    if (!has.enabled) {
      let first = null;
      pinPad(t('pin.set'), async (code, msg) => {
        if (first === null) { first = code; msg.textContent = t('pin.confirm'); return 'wait'; }
        if (code !== first) { first = null; return t('pin.mismatch'); }
        await Bridge.call('vault.load'); // ensure doc loaded pre-rekey
        await Bridge.call('pin.set', code);
        await Doc.save();
        toast(t('pin.set.ok')); return true;
      });
    } else {
      pinPad(t('pin.title'), async code => {
        const r = await Bridge.call('pin.unlock', code);
        if (!r.ok) return t('pin.wrong');
        confirmBox(t('more.pin.remove') + '?', async () => {
          await Bridge.call('pin.set', '');
          await Doc.save(); toast(t('pin.removed')); render();
        }, t('more.pin.remove'));
        return true;
      });
    }
  }
  else if (a === 'backup') {
    sheet(`<h3>${t('more.backup')}</h3>
      <p class="muted" style="font-weight:600;font-size:13px;margin-bottom:16px">${t('more.backup.note')}</p>
      <button class="btn" id="bexp">${icon('backup', 20)} ${t('more.backup.exp')}</button>
      <button class="btn ghost mt" id="bimp">${t('more.backup.imp')}</button>
      <div class="field mt hide" id="impbox"><label>Backup code</label><textarea id="impcode" placeholder="SSV1…"></textarea>
      <button class="btn mt" id="bimp2">${t('act.ok')}</button></div>`,
      (sh, close) => {
        sh.querySelector('#bexp').onclick = async () => {
          const r = await Bridge.call('vault.export');
          if (!r.ok) return;
          sheet('<h3>' + t('more.backup.exp') + '</h3><div class="field"><textarea id="bcode" readonly style="font-size:11px;min-height:150px">' + esc(r.b64) + '</textarea></div><button class="btn" id="bshare">' + t('act.share') + '</button>',
            (s2, c2) => s2.querySelector('#bshare').onclick = () => Bridge.call('share.text', r.b64));
        };
        sh.querySelector('#bimp').onclick = () => sh.querySelector('#impbox').classList.remove('hide');
        sh.querySelector('#bimp2').onclick = async () => {
          const code = sh.querySelector('#impcode').value.trim();
          const r = await Bridge.call('vault.import', code);
          if (r.ok) { close(); toast(t('more.saved')); await unlockFlow(true); }
          else toast(t('upd.failed'));
        };
      });
  }
  else if (a === 'update') {
    openUpdateSheet();
  }
  else if (a === 'stats') {
    const st = Doc.stats();
    const tc = {};
    Doc.doc.sevas.forEach(s => tc[s.type] = (tc[s.type] || 0) + 1);
    const max = Math.max(1, ...Object.values(tc));
    sheet(`<h3>${t('more.stats')}</h3>
      <div class="stats"><div class="stat"><b>${st.total}</b><span>${t('home.stats.sevas')}</span></div>
      <div class="stat"><b>${humanMin(st.minutes)}</b><span>${t('home.stats.hours')}</span></div>
      <div class="stat"><b>${st.streak}</b><span>${t('home.stats.streak')}</span></div></div>
      <div class="card flat mt" style="padding:16px">
        ${TYPES.filter(x => tc[x[0]]).map(x => `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:4px">
            <span>${esc(t('type.' + x[0]))}</span><span class="muted">${tc[x[0]]}</span></div>
          <div class="prog" style="margin:0"><i style="width:${Math.round(100 * tc[x[0]] / max)}%;background:${x[3]}"></i></div></div>`).join('') || '<p class="muted center">—</p>'}
      </div>`, () => {});
  }
  else if (a === 'about') {
    const m = Bridge.meta;
    sheet(`<div class="upd-hero" style="background:var(--saffron-l)">${icon('logo', 52)}</div>
      <h3 class="center">${t('app.name')}</h3>
      <p class="center muted" style="font-weight:700;font-size:13px">v${esc(String(m.webVersion ?? m.versionCode ?? ''))} · shell ${esc(String(m.shellVersion ?? m.versionCode ?? ''))}</p>
      <p style="font-size:13.5px;font-weight:600;color:var(--ink-2);margin-top:14px">${t('about.text')}</p>
      <div class="notes">${t('about.enc')}</div>
      <p class="center muted" style="font-size:12px;font-weight:700;margin-top:14px">${t('about.disc')}</p>`, () => {});
  }
  else if (a === 'wipe') {
    confirmBox(t('more.clear.q'), async () => {
      await Bridge.call('vault.wipe');
      Doc.doc = { sevas: [], events: [], profile: Doc.doc.profile };
      await Doc.save(); toast(t('more.cleared')); render();
    }, t('act.delete'));
  }
}

async function openUpdateSheet() {
  toast(t('upd.checking'));
  await Bridge.call('update.check');
}

/* ================= boot ================= */
/** Re-locks session pin after a restore/import; asks PIN until vault opens. */
async function unlockFlow() {
  const has = await Bridge.call('pin.has');
  if (!has.enabled) { await Doc.load(); return true; }
  return await new Promise(res => {
    pinPad(t('pin.title'), async code => {
      const ok = await Bridge.call('pin.unlock', code);
      if (!ok.ok) return t('pin.wrong');
      await Doc.load();
      res(true);
      return true;
    });
  });
}

async function setupFlow() {
  const main = $('#main'); $('#hdr').innerHTML = '';
  $$('#nav').forEach(n => n.classList.add('hide'));
  document.querySelector('nav.bottom').classList.add('hide');
  main.innerHTML = `<div class="screen" style="padding-top:8vh">
    <div class="upd-hero" style="width:110px;height:110px;border-radius:34px;background:var(--saffron-l)">${icon('logo', 74)}</div>
    <h2 class="center" style="font-size:24px;letter-spacing:-.02em;margin-top:14px">${t('setup.title')}</h2>
    <p class="center muted" style="font-weight:600;margin:8px auto 26px;max-width:280px">${t('setup.sub')}</p>
    <div class="card" style="padding:20px">
      <div class="field"><label>${t('more.name')}</label><input id="s-name" placeholder="—"></div>
      <div class="field"><label>${t('more.satsang')}</label><input id="s-sat" placeholder="—"></div>
      <div class="field"><label>${t('more.greeting')}</label>
        <div class="chips" id="s-greets">${['waheguru', 'radhe', 'ram', 'om'].map((g, i) =>
          `<button class="chip saffron ${i === 0 ? 'on' : ''}" data-g="${g}">${esc(t('greet.' + g))}</button>`).join('')}</div></div>
      <div class="field"><label>${t('more.language')}</label>
        <div class="chips" id="s-langs">${[['en', 'English'], ['hi', 'हिंदी'], ['pa', 'ਪੰਜਾਬੀ']].map(([c, n], i) =>
          `<button class="chip ${c === I18N.lang ? 'on' : ''}" data-l="${c}">${n}</button>`).join('')}</div></div>
      <button class="btn" id="s-go">${t('setup.begin')} →</button>
    </div></div>`;
  let g = 'waheguru', lang = I18N.lang;
  main.querySelector('#s-greets').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    g = c.dataset.g; main.querySelectorAll('#s-greets .chip').forEach(x => x.classList.toggle('on', x === c));
  };
  main.querySelector('#s-langs').onclick = async e => {
    const c = e.target.closest('.chip'); if (!c) return;
    lang = c.dataset.l; main.querySelectorAll('#s-langs .chip').forEach(x => x.classList.toggle('on', x === c));
    await Bridge.call('prefs.set', { lang }); await i18nLoad(lang); setupFlow();
  };
  main.querySelector('#s-go').onclick = async () => {
    Doc.doc.profile = {
      name: main.querySelector('#s-name').value.trim(),
      satsang: main.querySelector('#s-sat').value.trim(), greeting: g
    };
    await Doc.save();
    await Bridge.call('prefs.set', { onboarded: true });
    Bridge.meta.onboarded = true;
    document.querySelector('nav.bottom').classList.remove('hide');
    renderNav(); go('home');
  };
}

function renderNav() {
  const nav = document.querySelector('nav.bottom');
  nav.innerHTML = TABS.map(([tab, ic]) =>
    `<button data-tab="${tab}" id="nav-${tab}" class="${tab === currentTab ? 'on' : ''}">${icon(ic, 22)}<span>${t('nav.' + tab)}</span>${tab === 'more' ? '<span class="dot hide"></span>' : ''}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.tab));
  paintBadge();
}

async function boot() {
  Bridge.meta = JSON.parse(window.Seva ? Seva.meta() : '{}');
  await i18nLoad(Bridge.meta.lang || 'en');
  renderNav();
  if (!Bridge.meta.onboarded) { await setupFlow(); hideBoot(); return; }
  const r = await Doc.load();
  if (r.locked) {
    await new Promise(res => pinPad(t('pin.title'), async code => {
      const ok = await Bridge.call('pin.unlock', code);
      if (ok.ok) { await Doc.load(); res(true); return true; }
      return t('pin.wrong');
    }));
  }
  go('home');
  hideBoot();
  Bridge.call('update.check').catch(() => {});
}
function hideBoot() {
  const b = $('#boot'); if (!b) return;
  setTimeout(() => { b.classList.add('off'); setTimeout(() => b.remove(), 500); }, 350);
}
window.addEventListener('DOMContentLoaded', boot);
