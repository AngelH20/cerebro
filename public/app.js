/* HQ · panel local sobre tu vault de Obsidian */
'use strict';

// ---------------- utilidades ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fechaDe = v => (v == null ? '' : String(v).slice(0, 10));
const wd = d => d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
const fmtLargo = s => cap(parseISO(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
const hashStr = s => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; };
const encQ = s => encodeURIComponent(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('hq.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hq.' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const DONE = new Set(['hecha', 'hecho', 'completada', 'completado', 'done', 'true']);
const isDone = n => DONE.has(String(n.data.estado ?? n.data.hecha ?? '').toLowerCase());

function fmtCorto(f) {
  if (!f) return '';
  const today = S.ov.hoy;
  const d = parseISO(f), t = parseISO(today);
  const diff = Math.round((d - t) / 864e5);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  return `${wd(d)} ${d.getDate()}${d.getFullYear() !== t.getFullYear() ? '/' + d.getFullYear() : Math.abs(diff) > 6 ? '/' + (d.getMonth() + 1) : ''}`;
}
const money = v => new Intl.NumberFormat(S.cfg.locale || 'es-AR', { style: 'currency', currency: S.cfg.moneda || 'ARS', maximumFractionDigits: 0 }).format(v || 0);
const num = s => { // "12.500,50" / "12500.5" / "100 kg" → número
  if (typeof s === 'number') return s;
  let x = String(s ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!x || x === '-' ) return NaN;
  if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (x.includes(',')) x = x.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  return Number(x);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function api(url, opts = {}) {
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  if (opts.method && opts.method !== 'GET') opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), 2200);
}

// ---------------- iconos ----------------
const ICONS = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  tareas: '<path d="m3.5 6 1.5 1.5L8 4.5"/><path d="m3.5 12 1.5 1.5L8 10.5"/><path d="m3.5 18 1.5 1.5L8 16.5"/><path d="M12 6h9M12 12h9M12 18h9"/>',
  contenido: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z"/>',
  formacion: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3.5 2.5 8.5 2.5 12 0v-5"/><path d="M22 9v6"/>',
  aprender: '<path d="M3 21h18"/><path d="M4 10h16"/><path d="m12 3 8 5H4z"/><path d="M6.5 10v8M10.5 10v8M13.5 10v8M17.5 10v8"/>',
  ventas: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  bandeja: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  finanzas: '<path d="M12 2.5v19"/><path d="M16.5 7c-.6-1.7-2.3-2.6-4.5-2.6-2.6 0-4.5 1.3-4.5 3.3 0 4.6 9.4 2.4 9.4 7.2 0 2.1-2 3.6-4.9 3.6-2.5 0-4.4-1.1-5-3"/>',
  ia: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  decidir: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  aprendido: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.6.5.8 1.3.8 2.1V16h6v-.3c0-.8.2-1.6.8-2.1A6 6 0 0 0 12 3z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  humano: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  maquina: '<rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/>',
  note: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  check: '<path d="m5 12 5 5 9-10"/>', ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  lean3d: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  gimnasio: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  nutricion: '<path d="M12 7.5c-1.6-1.4-6.2-2-7.2 2.2-1 4.4 1.4 10 4.2 10.8 1 .3 2-.5 3-.5s2 .8 3 .5c2.8-.8 5.2-6.4 4.2-10.8-1-4.2-5.6-3.6-7.2-2.2z"/><path d="M12 7.5c0-2 1-3.6 3-4.5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  folderplus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
};
const SCENE_NAMES = {
  noche: 'Noche tranquila', estanque: 'Estanque con kois', bosque: 'Bosque con niebla', montanas: 'Montañas al amanecer',
  pradera: 'Pradera con farol', mar: 'Faro en el mar', atardecer: 'Atardecer', aurora: 'Aurora boreal',
  lluvia: 'Ciudad bajo la lluvia', cristales: 'Cueva de cristales', taller: 'Taller de impresión 3D', gimnasio: 'Gimnasio de powerlifting',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.folder}</svg>`;

// ---------------- markdown mínimo (estilo Obsidian) ----------------
function inline(src) {
  let s = esc(src);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, f) => `<img src="/api/archivo?nombre=${encQ(f)}" alt="${f}">`);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${/^https?:/.test(u) ? u : '/vault/' + u}">`);
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => `<a href="#" data-wiki="${t}">${l || t}</a>`);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
// numera las casillas en el mismo orden que el servidor, para poder marcarlas desde el panel
const MD_TASK = { n: 0 };
const mdDoc = src => { MD_TASK.n = 0; return md(src); };
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const LIST = /^\s*([-*+]|\d+\.)\s+/;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`); continue;
    }
    if (LIST.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && LIST.test(lines[i])) items.push(lines[i++].replace(LIST, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(t => {
        const c = t.match(/^\[( |x|X)\]\s*(.*)/);
        return c ? `<li class="task ${c[1] !== ' ' ? 'done' : ''}"><span class="cb ${c[1] !== ' ' ? 'on' : ''}" data-n="${MD_TASK.n++}" role="checkbox" aria-checked="${c[1] !== ' '}" tabindex="0"></span><span>${inline(c[2])}</span></li>` : `<li>${inline(t)}</li>`;
      }).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.trim().slice(1, -1).split('|').map(x => x.trim());
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|$/.test(r.trim())));
      out.push(`<table><thead><tr>${cells(body[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    do { buf.push(lines[i++]); } while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s|\|)/.test(lines[i]));
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

// ---------------- estado ----------------
const S = { cfg: null, ov: null, items: [], slide: store.get('slide', 0), tok: 0, editing: false, note: null, route: { name: 'inicio', args: [] } };
const SYS_ITEMS = [
  { id: 'ia', nombre: 'Qué ha hecho la IA', corto: 'La IA', icono: 'ia', escena: 'aurora', tipo: 'ia', grupo: 2 },
  { id: 'decidir', nombre: 'Te toca decidir', corto: 'Decidir', icono: 'decidir', escena: 'lluvia', tipo: 'decidir', grupo: 2 },
  { id: 'aprendido', nombre: 'Lo aprendido', corto: 'Aprendido', icono: 'aprendido', escena: 'cristales', tipo: 'aprendido', grupo: 2 },
];
function buildItems() {
  const c = S.cfg;
  S.items = [
    { id: 'tareas', nombre: 'Tareas', corto: 'Tareas', icono: 'tareas', escena: 'noche', tipo: 'tareas', carpeta: c.sistema.tareas },
    ...c.secciones.map(s => ({ ...s, corto: s.corto || s.nombre, tipo: s.tipo || 'seccion', icono: s.icono || s.id, escena: s.escena || 'noche' })),
    ...SYS_ITEMS,
  ].map(it => {
    // prioridad: lo elegido en Ajustes > portada.png en la carpeta del vault > escena por defecto
    const pref = c.prefs?.portadas?.[it.id];
    const vaultImg = it.portada || c.portadas?.[it.id] || null;
    const out = { ...it, escenaBase: it.escena, portadaUrl: null };
    if (pref?.imagen) out.portadaUrl = `/portadas/${encQ(pref.imagen)}`;
    else if (pref?.escena && Scenes.types.includes(pref.escena)) out.escena = pref.escena;
    else if (vaultImg) out.portadaUrl = `/vault/${vaultImg.split('/').map(encQ).join('/')}`;
    return out;
  });
  applyFondo();
}
function applyFondo() {
  const f = S.cfg.prefs?.fondo || {};
  const root = document.documentElement.style;
  root.setProperty('--amb', String((f.intensidad ?? 80) / 100 * 1.05));
  root.setProperty('--glass', `${f.cristal ?? 22}px`);
}
async function reloadConfig() { S.cfg = await api('/api/config'); buildItems(); }
async function loadOverview() { S.ov = await api('/api/overview'); }

// ---------------- portada (escena pixel art o imagen propia) ----------------
// imágenes pequeñas (pixel art) se escalan sin suavizar; las grandes, normal
const IMG_PX = `onload="this.classList.toggle('px', this.naturalWidth <= 700)"`;
const cover = (it, anim = true) => it.portadaUrl
  ? `<img class="cover" src="${esc(it.portadaUrl)}" alt="" ${IMG_PX}>`
  : `<canvas data-scene="${it.escena}" data-seed="${hashStr(it.id)}" data-anim="${anim ? 1 : 0}"></canvas>`;
// fondo: dos lienzos que se funden entre sí
const AMB = { idx: 0, key: null, tok: 0 };
function setAmbient(it) {
  const key = it.portadaUrl || `${it.escena}:${hashStr(it.id)}`;
  if (AMB.key === key) return;
  AMB.key = key;
  const tok = ++AMB.tok;
  const cs = [$('#amb-a'), $('#amb-b')];
  const next = cs[AMB.idx ^ 1];
  const swap = () => { if (tok !== AMB.tok) return; next.classList.add('on'); cs[AMB.idx].classList.remove('on'); AMB.idx ^= 1; };
  if (it.portadaUrl) {
    const img = new Image();
    img.onload = () => {
      if (tok !== AMB.tok) return;
      next.width = Scenes.W; next.height = Scenes.H;
      const c = next.getContext('2d'), r = Math.max(next.width / img.width, next.height / img.height);
      c.clearRect(0, 0, next.width, next.height);
      c.drawImage(img, (next.width - img.width * r) / 2, (next.height - img.height * r) / 2, img.width * r, img.height * r);
      swap();
    };
    img.src = it.portadaUrl;
  } else { Scenes.paint(next, it.escena, hashStr(it.id)); swap(); }
}
const hero = (it, title, sub) => `<section class="hero">${cover(it)}<div class="hero-tx"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div></section>`;
function mountView(v, it) { Scenes.hydrate(v); if (it) setAmbient(it); }

// ---------------- barra superior, semana y dock ----------------
function setCrumbs(parts) {
  $('#crumbs').innerHTML = [`<a href="#inicio">${esc(S.cfg.nombre)}</a>`, ...parts.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`))].join('<span class="sep">/</span>');
  document.title = `${S.cfg.nombre} · ${parts.length ? parts[parts.length - 1][0] : 'Panel'}`;
}
function tickClock() {
  const d = new Date();
  $('#clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('#date').textContent = cap(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
  if (S.ov && isoDate(d) !== S.ov.hoy) refresh();
  pintarTimer();
}

// ---------------- cronómetro de estudio (sigue corriendo aunque cambies de pestaña) ----------------
const TIMER = {
  get: () => store.get('timer', null),
  set: v => { store.set('timer', v); pintarTimer(); },
  seg(t = TIMER.get()) { return t ? Math.floor((t.acumulado + (t.corriendo ? Date.now() - t.inicio : 0)) / 1000) : 0; },
};
const fmtSeg = s => `${s >= 3600 ? Math.floor(s / 3600) + ':' : ''}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
function pintarTimer() {
  const t = TIMER.get(), el = $('#timer-pill');
  if (!el) return;
  el.hidden = !t;
  if (!t) return;
  el.innerHTML = `${ic(t.corriendo ? 'timer' : 'pause')}<b>${fmtSeg(TIMER.seg(t))}</b><span>${esc(t.temaNombre)}</span>`;
  el.href = `#${t.sec}`;
  el.classList.toggle('paused', !t.corriendo);
  const big = $('#timer-big');
  if (big) big.textContent = fmtSeg(TIMER.seg(t));
}
function renderWeek() {
  const w = $('#week');
  const show = ['inicio', 'tareas'].includes(S.route.name);
  w.hidden = !show;
  if (!show) return;
  const a0 = S.route.args[0] || '';
  const sel = S.route.name === 'tareas' ? (/^\d{4}-/.test(a0) ? a0 : a0 ? '' : S.ov.hoy) : S.ov.hoy;
  w.innerHTML = S.ov.semana.map(d => {
    const dt = parseISO(d.fecha);
    return `<button class="day ${d.fecha === sel ? 'on' : ''}" data-day="${d.fecha}" title="${d.pendientes} pendientes">${wd(dt)} ${dt.getDate()}${d.pendientes ? '<i class="dot"></i>' : ''}</button>`;
  }).join('') + `
    <button class="stat" data-go="decidir">${ic('decidir')}<span><b>Te toca decidir${S.ov.decidir ? '<i class="pulse"></i>' : ''}</b><small>${S.ov.decidir} cosas</small></span></button>
    <button class="stat" data-go="tareas">${ic('tareas')}<span><b>Hoy</b><small>${S.ov.porHacer} por hacer</small></span></button>`;
}
function renderDock() {
  const cur = S.route.name;
  const dock = $('#dock');
  const sig = JSON.stringify([S.items.map(i => i.id + i.corto + i.icono), S.ov.numeros]);
  if (dock._sig !== sig) { // solo se reconstruye si cambian las secciones o los contadores: así el indicador se desliza
    const btn = it => `<a href="#${it.id}" data-id="${it.id}" title="${esc(it.nombre)}">${ic(it.icono)}<span>${esc(it.corto)}</span>${S.ov.numeros[it.id] ? `<b class="n">${S.ov.numeros[it.id]}</b>` : ''}</a>`;
    dock.innerHTML = '<i class="glider" aria-hidden="true"></i>' + btn({ id: 'inicio', nombre: 'Inicio', corto: 'Inicio', icono: 'inicio' })
      + S.items.filter(i => !i.grupo).map(btn).join('') + '<i class="sep"></i>' + S.items.filter(i => i.grupo).map(btn).join('');
    dock._sig = sig;
  }
  let on = null;
  $$('#dock a').forEach(a => { const y = a.dataset.id === cur; a.classList.toggle('on', y); y ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); if (y) on = a; });
  const g = $('#dock .glider');
  if (on) {
    g.style.cssText = `left:${on.offsetLeft}px;top:${on.offsetTop}px;width:${on.offsetWidth}px;height:${on.offsetHeight}px;opacity:1`;
    on.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
  } else g.style.opacity = '0';
}

// ---------------- router ----------------
function parseHash() {
  const h = location.hash.slice(1) || 'inicio';
  const parts = h.split('/').map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  return { name: parts[0], args: parts.slice(1).filter(Boolean) };
}
const go = (...parts) => { location.hash = parts.map(encQ).join('/'); };

async function render(soft = false) {
  const tok = ++S.tok;
  const alive = () => tok === S.tok;
  S.route = parseHash();
  const prev = S.prevRoute;
  S.prevRoute = S.route;
  if (!soft) closeDrawer();
  renderDock(); renderWeek();
  const it = S.items.find(i => i.id === S.route.name);
  // carpeta "actual" para el botón Crear (en Tareas los argumentos son filtros, no carpetas)
  S.ctxFolder = !it?.carpeta ? '' : it.tipo === 'tareas' ? it.carpeta : [it.carpeta, ...S.route.args].join('/');
  const v = $('#view');
  $('#btn-ajustes').classList.toggle('acc', S.route.name === 'ajustes');
  // transición de salida: la vista actual se desliza hacia el lado contrario al que vas
  const anim = !soft && !REDUCE && prev;
  if (anim) {
    const order = ['inicio', ...S.items.map(i => i.id), 'ajustes'];
    const dir = prev.name === S.route.name ? 0 : Math.sign(order.indexOf(S.route.name) - order.indexOf(prev.name));
    v.style.setProperty('--dx', `${dir * 3}rem`);
    v.classList.remove('in'); v.classList.add('out');
    await sleep(170);
    if (!alive()) return;
  }
  document.body.dataset.route = S.route.name;
  try {
    if (S.route.name === 'ajustes') await viewAjustes(v, alive);
    else if (!it) viewInicio(v);
    else {
      const fn = { tareas: viewTareas, ia: viewIA, decidir: viewDecidir, aprendido: viewAprendido, bandeja: viewBandeja, finanzas: viewFinanzas, negocio: viewNegocio, hojas: viewHojas, estudio: viewEstudio }[it.tipo];
      const useGeneric = !fn || (['bandeja', 'finanzas', 'negocio', 'hojas', 'estudio'].includes(it.tipo) && S.route.args.length);
      await (useGeneric ? viewSeccion : fn)(v, it, S.route.args, alive);
    }
  } catch (e) {
    if (alive()) v.innerHTML = `<div class="panel empty"><b>No se pudo cargar</b>${esc(e.message)}</div>`;
  }
  if (alive() && !soft) {
    v.classList.remove('out');
    if (!REDUCE) { v.classList.remove('in'); void v.offsetWidth; v.classList.add('in'); }
    if (!anim) window.scrollTo(0, 0); else window.scrollTo({ top: 0 });
  }
}

// ---------------- INICIO: carrusel ----------------
function viewInicio(v) {
  setCrumbs([['Inicio']]);
  const items = S.items, n = items.length;
  S.slide = ((S.slide % n) + n) % n;
  v.innerHTML = `<section class="carousel init" id="car" aria-roledescription="carrusel">${items.map((it, i) => `
      <article class="card" data-i="${i}" aria-label="${esc(it.nombre)}">${cover(it, false)}
        ${S.ov.badges[it.id] ? `<span class="badge">${esc(S.ov.badges[it.id])}</span>` : ''}
        <h2 class="ttl">${esc(it.nombre)}</h2>
        <a class="btn acc go" href="#${it.id}">Entrar ${ic('arrow')}</a>
      </article>`).join('')}
      <button class="arrow l" data-car="-1" aria-label="Anterior">${ic('left')}</button>
      <button class="arrow r" data-car="1" aria-label="Siguiente">${ic('right')}</button>
    </section>
    <div class="dots" id="dots">${items.map((it, i) => `<button data-dot="${i}" aria-label="${esc(it.nombre)}"></button>`).join('')}</div>`;
  Scenes.hydrate(v);
  layoutCarousel();
  const car = $('#car');
  requestAnimationFrame(() => requestAnimationFrame(() => car.classList.remove('init')));
  car.addEventListener('click', e => {
    if (S.swiped) { S.swiped = false; e.preventDefault(); return; }
    const a = e.target.closest('[data-car]');
    if (a) return moveSlide(+a.dataset.car);
    const c = e.target.closest('.card');
    if (!c) return;
    if (!c.classList.contains('center')) { e.preventDefault(); setSlide(+c.dataset.i); }
    else if (!e.target.closest('a')) go(items[+c.dataset.i].id);
  });
  $('#dots').addEventListener('click', e => { const b = e.target.closest('[data-dot]'); if (b) setSlide(+b.dataset.dot); });
  let x0 = null;
  car.addEventListener('pointerdown', e => { x0 = e.clientX; });
  car.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) { S.swiped = true; moveSlide(dx < 0 ? 1 : -1); setTimeout(() => { S.swiped = false; }, 50); }
  });
}
function layoutCarousel() {
  const cards = $$('#car .card'), n = cards.length;
  cards.forEach((c, i) => {
    let off = (((i - S.slide) % n) + n) % n;
    if (off > n / 2) off -= n;
    c.classList.toggle('center', off === 0);
    c.classList.toggle('side', off !== 0);
    c.classList.toggle('far', Math.abs(off) > 1);
    c.style.transform = `translateX(calc(-50% + ${off * 64}%)) scale(${off === 0 ? 1 : 0.86})`;
    c.style.zIndex = String(10 - Math.abs(off));
    c.setAttribute('aria-hidden', off === 0 ? 'false' : 'true');
    Scenes.animate(c.querySelector('canvas'), off === 0);
  });
  $$('#dots button').forEach((b, i) => b.classList.toggle('on', i === S.slide));
  setAmbient(S.items[S.slide]);
  store.set('slide', S.slide);
}
function setSlide(i) { const n = S.items.length; S.slide = ((i % n) + n) % n; layoutCarousel(); }
const moveSlide = d => setSlide(S.slide + d);

// ---------------- TAREAS ----------------
async function viewTareas(v, it, args, alive) {
  const d = await api(`/api/carpeta?path=${encQ(it.carpeta)}&recursive=1`);
  if (!alive()) return;
  const today = S.ov.hoy;
  const mode = args[0] || 'hoy';
  const all = d.notas.map(n => ({ ...n, fecha: fechaDe(n.data.fecha), done: isDone(n) }));
  let list;
  if (mode === 'hoy') list = all.filter(t => (!t.done && (!t.fecha || t.fecha <= today)) || (t.done && fechaDe(t.data.completada || t.fecha) === today));
  else if (mode === 'todas') list = all.filter(t => !t.done);
  else if (mode === 'hechas') list = all.filter(t => t.done);
  else list = all.filter(t => t.fecha === mode);
  const prioN = t => ({ alta: 0, normal: 1, baja: 2 }[String(t.data.prioridad || 'normal').toLowerCase()] ?? 1);
  list.sort((a, b) => a.done - b.done || (a.fecha || '9').localeCompare(b.fecha || '9') || prioN(a) - prioN(b) || a.name.localeCompare(b.name));
  const grupo = t => {
    if (t.done && mode !== 'hechas') return 'Hechas hoy';
    if (!t.fecha) return 'Sin fecha';
    if (t.fecha < today && !t.done) return 'Atrasadas';
    return t.fecha === today ? 'Hoy' : fmtLargo(t.fecha);
  };
  const isDay = /^\d{4}-\d\d-\d\d$/.test(mode);
  const titulo = isDay ? fmtLargo(mode) : { hoy: 'Hoy', todas: 'Todas las pendientes', hechas: 'Hechas' }[mode] || 'Tareas';
  setCrumbs([['Tareas', '#tareas'], [titulo]]);
  const pend = all.filter(t => !t.done);
  const secs = S.cfg.secciones.map(s => s.corto || s.nombre);
  let html = hero(it, 'Tareas', `${S.ov.porHacer} por hacer hoy · ${pend.length} pendientes en total · carpeta <b>${esc(it.carpeta)}/</b>`)
    + `<div class="chips">${[['hoy', 'Hoy y atrasadas'], ['todas', 'Todas pendientes'], ['hechas', 'Hechas']].map(([k, l]) => `<button class="chip ${mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}${isDay ? `<button class="chip on">${esc(titulo)}</button>` : ''}</div>
    <form class="panel newtask" id="nt" autocomplete="off">
      <input class="field" name="titulo" placeholder="Nueva tarea…" required aria-label="Título">
      <input class="field" type="date" name="fecha" value="${isDay ? mode : today}" aria-label="Fecha">
      <select class="field" name="seccion" aria-label="Sección"><option value="">Sin sección</option>${['General', ...secs].map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <button class="btn acc">${ic('plus')} Añadir</button>
    </form>`;
  if (!list.length) html += `<div class="panel empty"><b>Nada por aquí</b>${mode === 'hoy' ? 'No tienes tareas pendientes para hoy.' : 'No hay tareas en esta vista.'}</div>`;
  else {
    let lastG = null;
    html += '<div class="panel tlist">';
    for (const t of list) {
      const g = grupo(t);
      if (g !== lastG) { html += `<div class="tgroup ${g === 'Atrasadas' ? 'late' : ''}">${esc(g)}</div>`; lastG = g; }
      html += `<div class="task ${t.done ? 'done' : ''}">
        <button class="check ${t.done ? 'on' : ''}" data-toggle="${esc(t.path)}" data-done="${t.done ? 1 : 0}" aria-label="${t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}">${t.done ? ic('check') : ''}</button>
        <button class="t linklike" data-note="${esc(t.path)}">${esc(t.name)}</button>
        <span class="meta">${prioN(t) === 0 && !t.done ? '<i class="prio" title="Prioridad alta"></i>' : ''}${t.data.seccion ? `<span class="tag">${esc(t.data.seccion)}</span>` : ''}<span>${esc(fmtCorto(t.fecha))}</span></span>
      </div>`;
    }
    html += '</div>';
  }
  v.innerHTML = html;
  mountView(v, it);
  v.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => go('tareas', b.dataset.mode)));
  $('#nt').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/tareas', { method: 'POST', body: Object.fromEntries(f) });
      toast('Tarea creada'); await refresh();
    } catch (er) { toast(er.message); }
  });
  $('.tlist', v)?.addEventListener('click', async e => {
    const b = e.target.closest('[data-toggle]');
    if (!b) return;
    const done = b.dataset.done === '1';
    b.closest('.task').classList.toggle('done', !done);
    b.classList.toggle('on', !done);
    try {
      await api(`/api/note?path=${encQ(b.dataset.toggle)}`, { method: 'PATCH', body: { campos: { estado: done ? 'pendiente' : 'hecha', completada: done ? '' : today } } });
      await refresh();
    } catch (er) { toast(er.message); }
  });
}

// ---------------- SECCIÓN genérica: carpetas + base de datos ----------------
const FOLDER_INFO = {
  humano: { label: 'Humano', tag: '<span class="tag hum">Tuyo</span>', desc: 'Lo que tú has dicho o escrito, tal cual.', icon: 'humano' },
  maquina: { label: 'Máquina', tag: '<span class="tag maq">IA</span>', desc: 'Instrucciones, scripts y datos que mueve la IA.', icon: 'maquina' },
};
const folderKind = name => (/^humano$/i.test(name) ? 'humano' : /^m[aá]quina$/i.test(name) ? 'maquina' : null);
const labelProp = k => cap(String(k).replace(/_/g, ' '));
const cleanVal = v => String(v).replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a);
const STATE_COLORS = { pendiente: 'c-warn', hecha: 'c-ok', hecho: 'c-ok', publicado: 'c-ok', cerrado: 'c-ok', aprobado: 'c-ok', entendido: 'c-ok', abierto: 'c-ok', error: 'c-err', rechazado: 'c-err', importante: 'c-acc', idea: 'c-info', borrador: 'c-info', contacto: 'c-info', grabando: 'c-warn', 'en curso': 'c-warn', propuesta: 'c-warn', reunión: 'c-warn', preparando: 'c-warn', repasar: 'c-warn', nuevo: 'c-info', leido: 'c-mut', archivado: 'c-mut' };
function cell(v, k) {
  if (v === null || v === undefined || v === '') return '<span class="dim">—</span>';
  if (typeof v === 'boolean') return v ? '<span class="ok">✓ Sí</span>' : '<span class="dim">No</span>';
  if (Array.isArray(v)) return esc(v.map(cleanVal).join(', '));
  if (typeof v === 'number') return /importe|valor|precio|coste|ingreso|gasto/i.test(k) ? esc(money(v)) : esc(v.toLocaleString('es-ES'));
  const s = cleanVal(v);
  if (/^(estado|etapa|tipo|fase)$/i.test(k)) return `<span class="pill ${STATE_COLORS[s.toLowerCase()] || 'c-mut'}">${esc(s)}</span>`;
  if (/^https?:\/\//.test(s)) return `<a href="${esc(s)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>`;
  if (/^\d{4}-\d\d-\d\d$/.test(s)) return esc(fmtCorto(s));
  return esc(s.length > 90 ? s.slice(0, 88) + '…' : s);
}
function dbTable(notas) {
  const freq = {};
  for (const n of notas) for (const [k, v] of Object.entries(n.data)) if (v !== null && v !== '' && !['tags', 'aliases', 'cssclasses'].includes(k)) freq[k] = (freq[k] || 0) + 1;
  const cols = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 6);
  if (!cols.length) {
    return `<div class="grid">${notas.map(n => `<button class="panel fcard" data-note="${esc(n.path)}"><span class="fh">${ic('note')}${esc(n.name)}</span>${n.excerpt ? `<span class="fx">${esc(n.excerpt)}</span>` : '<span class="fd">Nota vacía</span>'}</button>`).join('')}</div>`;
  }
  const numCol = c => notas.some(n => typeof n.data[c] === 'number');
  return `<div class="panel tablewrap"><table class="db"><thead><tr><th>Nombre</th>${cols.map(c => `<th${numCol(c) ? ' style="text-align:right"' : ''}>${esc(labelProp(c))}</th>`).join('')}</tr></thead><tbody>${notas.map(n => `<tr data-note="${esc(n.path)}"><td class="nm">${esc(n.name)}</td>${cols.map(c => `<td class="${typeof n.data[c] === 'number' ? 'num' : typeof n.data[c] === 'string' && n.data[c].length > 40 ? 'txt' : ''}">${cell(n.data[c], c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
async function viewSeccion(v, it, sub, alive) {
  const folder = [it.carpeta, ...sub].join('/');
  const d = await api(`/api/carpeta?path=${encQ(folder)}`);
  if (!alive()) return;
  const route = k => '#' + [it.id, ...sub.slice(0, k)].map(encQ).join('/');
  setCrumbs([[it.nombre, sub.length ? '#' + it.id : null], ...sub.map((s, i) => [FOLDER_INFO[folderKind(s)]?.label || s, i < sub.length - 1 ? route(i + 1) : null])]);
  const last = sub[sub.length - 1];
  const kind = last && folderKind(last);
  const titulo = sub.length ? (FOLDER_INFO[kind]?.label || last) : it.nombre;
  if (!d.existe) {
    v.innerHTML = hero(it, titulo, '') + `<div class="panel empty"><b>La carpeta todavía no existe</b>Crea <code>${esc(folder)}/</code> en tu vault de Obsidian y aparecerá aquí.</div>`;
    return mountView(v, it);
  }
  const notas = [...d.notas].sort((a, b) => String(b.data.fecha || '').localeCompare(String(a.data.fecha || '')) || a.name.localeCompare(b.name, 'es'));
  const subs = [...d.subcarpetas].sort((a, b) => (folderKind(a.nombre) ? 1 : 0) - (folderKind(b.nombre) ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
  const subt = `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'} · ${subs.length} ${subs.length === 1 ? 'carpeta' : 'carpetas'} · <b>${esc(folder)}/</b>`;
  let html = hero(it, titulo, kind ? `${FOLDER_INFO[kind].desc} · ${subt}` : subt)
    + `<div class="chips acts-row"><button class="btn acc" data-nnota>${ic('plus')} Nueva nota</button><button class="btn" data-ncarpeta>${ic('folderplus')} Nueva carpeta</button></div>`;
  if (subs.length) {
    html += `<div class="grid">${subs.map(s => {
      const k = folderKind(s.nombre), info = FOLDER_INFO[k];
      return `<button class="panel fcard" data-sub="${esc(s.nombre)}"><span class="fh">${ic(info ? info.icon : 'folder')}${esc(info ? info.label : s.nombre)} ${info ? info.tag : ''}</span><span class="fd">${s.notas} ${s.notas === 1 ? 'nota' : 'notas'}${info ? ' · ' + info.desc : ''}</span></button>`;
    }).join('')}</div>`;
  }
  // filtros automáticos según las propiedades
  const stateKey = ['estado', 'etapa', 'tipo'].find(k => notas.some(n => n.data[k] != null && n.data[k] !== ''));
  const boolKeys = [...new Set(notas.flatMap(n => Object.entries(n.data).filter(([, x]) => typeof x === 'boolean').map(([k]) => k)))];
  const opts = [];
  if (stateKey) for (const val of [...new Set(notas.map(n => n.data[stateKey]).filter(x => x != null && x !== '').map(String))]) opts.push({ id: `s:${val}`, label: cap(val), f: n => String(n.data[stateKey]) === val });
  for (const k of boolKeys) opts.push({ id: `b:${k}`, label: /^util$/i.test(k) ? 'Solo útiles' : `Solo ${labelProp(k).toLowerCase()}`, f: n => n.data[k] === true });
  if (notas.length) {
    html += `<div class="sec-h"><h2>${sub.length ? 'Notas' : 'Notas sueltas'}</h2><span class="mut" id="ncount"></span></div>`;
    if (opts.length && notas.length > 2) html += `<div class="chips" id="filt"><button class="chip on" data-f="">Todas <span class="c">${notas.length}</span></button>${opts.map(o => `<button class="chip" data-f="${esc(o.id)}">${esc(o.label)} <span class="c">${notas.filter(o.f).length}</span></button>`).join('')}</div>`;
    html += '<div id="dbt"></div>';
  } else if (!subs.length) {
    html += `<div class="panel empty"><b>Carpeta vacía</b>Añade notas en <code>${esc(folder)}/</code> desde Obsidian. Las propiedades de cada nota se convierten en columnas.</div>`;
  }
  v.innerHTML = html;
  mountView(v, it);
  const draw = fid => {
    const o = opts.find(x => x.id === fid);
    const list = o ? notas.filter(o.f) : notas;
    $('#dbt').innerHTML = dbTable(list);
    $('#ncount').textContent = `${list.length} de ${notas.length}`;
  };
  if (notas.length) draw('');
  $('#filt')?.addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    $$('#filt .chip').forEach(x => x.classList.toggle('on', x === b));
    draw(b.dataset.f);
  });
  v.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => go(it.id, ...sub, b.dataset.sub)));
  $('[data-nnota]', v)?.addEventListener('click', () => openModal({
    title: `Nueva nota en ${titulo}`, html: fld('Título', inp('titulo', 'required placeholder="Título de la nota"')) + fld('Contenido (opcional)', txa('cuerpo', 'Escribe aquí… admite Markdown y [[enlaces]]', 6)),
    onSubmit: async f => { const r = await api('/api/nota', { method: 'POST', body: { carpeta: folder, titulo: f.titulo, cuerpo: f.cuerpo } }); toast('Nota creada'); await refresh(); setTimeout(() => openNote(r.path, { edit: !f.cuerpo }), 50); },
  }));
  $('[data-ncarpeta]', v)?.addEventListener('click', () => openModal({
    title: `Nueva carpeta en ${titulo}`, html: fld('Nombre', inp('nombre', 'required placeholder="Nombre de la carpeta"')),
    onSubmit: async f => { await api('/api/carpeta', { method: 'POST', body: { padre: folder, nombre: f.nombre } }); toast('Carpeta creada'); await refresh(); },
  }));
}

// ---------------- BANDEJA ----------------
async function viewBandeja(v, it, _args, alive) {
  const base = [it.carpeta, it.correos].filter(Boolean).join('/');
  const [d, root, cc] = await Promise.all([api(`/api/carpeta?path=${encQ(base)}&recursive=1`), api(`/api/carpeta?path=${encQ(it.carpeta)}`), api('/api/correo/cuentas').catch(() => ({ configurado: false, cuentas: [] }))]);
  if (!alive()) return;
  setCrumbs([[it.nombre]]);
  const listas = cc.cuentas.filter(c => c.lista);
  const correos = d.notas.filter(n => n.data.asunto || n.data.de).sort((a, b) => String(b.data.fecha || '').localeCompare(String(a.data.fecha || '')));
  const buzones = [...new Set(correos.map(c => c.data.buzon).filter(Boolean))];
  const estados = [...new Set(correos.map(c => String(c.data.estado || '')).filter(Boolean))];
  const f = store.get('bandeja', { b: '', e: '', q: '' });
  v.innerHTML = hero(it, it.nombre, 'Correo local · solo lectura')
    + `<div class="note-bar">${listas.length
      ? `Cuentas conectadas: <b>${listas.map(c => esc(c.nombre)).join(', ')}</b>. El script trae los correos nuevos a <code>${esc(base)}/</code> sin marcarlos como leídos en Gmail.`
      : `Todavía no hay cuentas de Gmail conectadas. Copia <code>cuentas-correo.ejemplo.json</code> como <code>cuentas-correo.json</code> (en la carpeta del panel) y pega una <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">contraseña de aplicación</a> por cuenta.`}</div>
    <div class="chips acts-row"><button class="btn acc" id="imp-correo" ${listas.length ? '' : 'disabled'}>${ic('sync')} Traer correos ahora</button><span class="mut" id="imp-estado"></span><span class="sp"></span>${root.subcarpetas.map(s => { const info = FOLDER_INFO[folderKind(s.nombre)]; return `<a class="chip" href="#${it.id}/${encQ(s.nombre)}">${esc(info ? info.label : s.nombre)} <span class="c">${s.notas}</span></a>`; }).join('')}</div>
    <div class="row3">
      <label class="lbl">Buzón<select class="field" id="fb"><option value="">Todos los buzones</option>${buzones.map(b => `<option ${f.b === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
      <label class="lbl">Estado<select class="field" id="fe"><option value="">Todos</option>${estados.map(e => `<option value="${esc(e)}" ${f.e === e ? 'selected' : ''}>${esc(cap(e))}</option>`).join('')}</select></label>
      <label class="lbl">Buscar hilo<input class="field" id="fq" placeholder="Asunto o remitente" value="${esc(f.q)}"></label>
    </div>
    <div class="count" id="cnt"></div><div id="mails"></div>`;
  mountView(v, it);
  let limit = 100;
  const draw = () => {
    const b = $('#fb').value, e = $('#fe').value, q = $('#fq').value.trim().toLowerCase();
    store.set('bandeja', { b, e, q });
    const list = correos.filter(c => (!b || c.data.buzon === b) && (!e || String(c.data.estado) === e) && (!q || `${c.data.asunto} ${c.data.de}`.toLowerCase().includes(q)));
    $('#cnt').textContent = `${list.length} ${list.length === 1 ? 'hilo' : 'hilos'} en esta vista`;
    $('#mails').innerHTML = list.slice(0, limit).map(c => {
      const st = String(c.data.estado || '').toLowerCase();
      return `<button class="panel mail ${esc(st)}" data-note="${esc(c.path)}">
        <div class="mh"><b>${esc(c.data.de || '—')}</b>${st ? `<span class="pill ${STATE_COLORS[st] || 'c-mut'}">${esc(cap(st))}</span>` : ''}${c.data.buzon ? `<span class="dim">${esc(c.data.buzon)}</span>` : ''}<span class="when">${esc(fmtCorto(fechaDe(c.data.fecha)))} ${esc(String(c.data.fecha || '').slice(11, 16))}</span></div>
        <div class="ms">${esc(c.data.asunto || c.name)}</div>
        <div class="mx">${esc(c.data.resumen_ia || c.excerpt || '')}</div>
      </button>`;
    }).join('') + (list.length > limit ? '<div class="chips" style="justify-content:center"><button class="btn" id="more">Mostrar más</button></div>' : '')
      + (!list.length ? '<div class="panel empty"><b>Sin correos</b>No hay correos con estos filtros.</div>' : '');
    $('#more')?.addEventListener('click', () => { limit += 200; draw(); });
  };
  $('#imp-correo').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; $('#imp-estado').textContent = 'Conectando con Gmail… puede tardar un poco la primera vez';
    try {
      const r = await api('/api/correo/importar', { method: 'POST' });
      $('#imp-estado').textContent = r.ok ? (r.salida.split('\n').pop() || 'Listo') : `Error: ${r.error || r.salida}`;
      toast(r.ok ? 'Correos actualizados' : 'No se pudieron traer los correos');
      if (r.ok) await refresh();
    } catch (er) { $('#imp-estado').textContent = er.message; } finally { b.disabled = false; }
  });
  ['#fb', '#fe'].forEach(s => $(s).addEventListener('change', draw));
  $('#fq').addEventListener('input', draw);
  draw();
}

// ---------------- ventana modal (formularios para crear cosas sin ir a Obsidian) ----------------
function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; }
function openModal({ title, html, submit = 'Crear', onSubmit }) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim" data-mclose></div><form class="mbox" id="mform" autocomplete="off" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mh"><h2>${esc(title)}</h2><button type="button" class="btn icon ghost" data-mclose aria-label="Cerrar">${ic('x')}</button></div>
    <div class="mbody">${html}</div>
    <div class="mact"><button type="button" class="btn" data-mclose>Cancelar</button><button class="btn acc" type="submit">${esc(submit)}</button></div></form>`;
  m.classList.add('open');
  m.onclick = e => { if (e.target.closest('[data-mclose]')) closeModal(); };
  const form = $('#mform');
  setTimeout(() => form.querySelector('.mbody input:not([type=radio]):not([type=hidden]), .mbody textarea')?.focus(), 40);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form)), form); closeModal(); } catch (er) { toast(er.message); btn.disabled = false; }
  };
  return form;
}
const fld = (label, inner) => `<label class="lbl">${label}${inner}</label>`;
const inp = (name, attrs = '') => `<input class="field" name="${name}" ${attrs}>`;
const sel = (name, opts, val = '') => `<select class="field" name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const txa = (name, ph = '', rows = 4) => `<textarea class="field" name="${name}" rows="${rows}" placeholder="${esc(ph)}"></textarea>`;
const seg = (name, opts, val) => `<div class="seg">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${v === val ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
const limpiarNombre = s => String(s || '').replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
const hhmm = (d = new Date()) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
async function guardarPrefsUI(mut) {
  const p = JSON.parse(JSON.stringify(S.cfg.prefs || {}));
  p.portadas ||= {}; p.fondo ||= {}; p.hojas ||= {};
  mut(p);
  await api('/api/preferencias', { method: 'PUT', body: p });
  await reloadConfig();
}
const folderChips = (it, subs) => subs.map(s => { const info = FOLDER_INFO[folderKind(s.nombre)]; return `<a class="chip" href="#${it.id}/${encQ(s.nombre)}">${esc(info ? info.label : s.nombre)} <span class="c">${s.notas}</span></a>`; }).join('');

// botón "+" de arriba: crear nota, tarea o carpeta en cualquier sitio
async function crearRapido() {
  const carpetas = await api('/api/carpetas').catch(() => []);
  const opciones = [['', '(raíz del vault)'], ...carpetas.map(c => [c, c])];
  const form = openModal({
    title: 'Crear', html: `
      ${seg('tipo', [['nota', 'Nota'], ['tarea', 'Tarea'], ['carpeta', 'Carpeta']], 'nota')}
      ${fld('Título', inp('titulo', 'required'))}
      <div data-solo="nota carpeta">${fld('Dónde', sel('carpeta', opciones, S.ctxFolder || ''))}</div>
      <div data-solo="tarea" hidden><div class="row2">${fld('Fecha', inp('fecha', `type="date" value="${S.ov.hoy}"`))}${fld('Sección', sel('seccion', ['', 'General', ...S.cfg.secciones.map(s => s.corto || s.nombre)]))}</div></div>
      <div data-solo="nota">${fld('Contenido (opcional)', txa('cuerpo', 'Escribe aquí… admite Markdown, - [ ] casillas y [[enlaces]]', 6))}</div>`,
    onSubmit: async f => {
      if (f.tipo === 'tarea') { await api('/api/tareas', { method: 'POST', body: { titulo: f.titulo, fecha: f.fecha, seccion: f.seccion } }); toast('Tarea creada'); }
      else if (f.tipo === 'carpeta') { await api('/api/carpeta', { method: 'POST', body: { padre: f.carpeta, nombre: f.titulo } }); toast('Carpeta creada'); }
      else { const r = await api('/api/nota', { method: 'POST', body: { carpeta: f.carpeta, titulo: f.titulo, cuerpo: f.cuerpo } }); toast('Nota creada'); setTimeout(() => openNote(r.path, { edit: !f.cuerpo }), 60); }
      await refresh();
    },
  });
  const sync = () => {
    const t = form.querySelector('[name=tipo]:checked').value;
    form.querySelectorAll('[data-solo]').forEach(el => { el.hidden = !el.dataset.solo.split(' ').includes(t); });
    form.querySelector('[name=titulo]').placeholder = { carpeta: 'Nombre de la carpeta', tarea: '¿Qué tienes que hacer?', nota: 'Título de la nota' }[t];
  };
  form.addEventListener('change', sync);
  sync();
}

// ---------------- FINANZAS (pesos argentinos, por cuenta) ----------------
const CATS_GASTO = ['Filamento', 'Repuestos', 'Envíos', 'Packaging', 'Publicidad', 'Herramientas', 'Luz', 'Internet', 'Alquiler', 'Servicios', 'Supermercado', 'Comida', 'Transporte', 'Salud', 'Gimnasio', 'Suplementos', 'Estudio', 'Ocio', 'Impuestos', 'Otros'];
const CATS_ING = ['Ventas', 'Sueldo', 'Servicios', 'Otros'];
const finSec = () => S.cfg.secciones.find(s => s.tipo === 'finanzas');
const movFolder = () => { const f = finSec(); return f ? `${f.carpeta}/${f.movimientos || 'Movimientos'}` : 'Finanzas/Movimientos'; };
const mesLabel = m => cap(parseISO(m + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
function movimientoModal({ cuenta = '', tipo = 'gasto', categorias = [] } = {}) {
  const cuentas = [...new Set([...(finSec()?.cuentas || []), cuenta].filter(Boolean))];
  openModal({
    title: tipo === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso', submit: 'Guardar', html: `
      ${seg('tipo', [['gasto', 'Gasto'], ['ingreso', 'Ingreso']], tipo)}
      ${fld('Concepto', inp('concepto', 'required placeholder="Ej.: Bobina PLA 1 kg"'))}
      <div class="row2">${fld(`Importe (${esc(S.cfg.moneda)})`, inp('importe', 'required inputmode="decimal" placeholder="Ej.: 18.500"'))}${fld('Fecha', inp('fecha', `type="date" value="${S.ov.hoy}" required`))}</div>
      <div class="row2">${fld('Categoría', '<input class="field" name="categoria" list="cats-mov" placeholder="Elige o escribe">')}${fld('Cuenta', sel('cuenta', cuentas.length ? cuentas : ['Personal'], cuenta))}</div>
      <datalist id="cats-mov">${[...new Set([...categorias, ...CATS_GASTO, ...CATS_ING])].map(c => `<option value="${esc(c)}">`).join('')}</datalist>`,
    onSubmit: async x => {
      const imp = num(x.importe);
      if (!isFinite(imp) || imp === 0) throw new Error('El importe no es válido');
      await api('/api/nota', { method: 'POST', body: { carpeta: movFolder(), titulo: `${x.fecha} ${limpiarNombre(x.concepto)}`, campos: { fecha: x.fecha, concepto: x.concepto, importe: x.tipo === 'gasto' ? -Math.abs(imp) : Math.abs(imp), categoria: x.categoria || 'Otros', cuenta: x.cuenta } } });
      toast('Movimiento guardado');
      await refresh();
    },
  });
}
async function viewFinanzas(v, it, _args, alive) {
  const d = await api(`/api/carpeta?path=${encQ(it.carpeta)}&recursive=1`);
  if (!alive()) return;
  setCrumbs([[it.nombre]]);
  const movs = d.notas.filter(n => typeof n.data.importe === 'number').map(n => ({ ...n, f: fechaDe(n.data.fecha), imp: n.data.importe }));
  const cuentas = [...new Set([...(it.cuentas || []), ...movs.map(m => m.data.cuenta).filter(Boolean)])];
  let cuenta = store.get('finCuenta', '');
  if (cuenta && !cuentas.includes(cuenta)) cuenta = '';
  const meses = [...new Set([S.ov.hoy.slice(0, 7), ...movs.map(m => m.f.slice(0, 7)).filter(Boolean)])].sort().reverse();
  let mes = meses[0];
  const cats = [...new Set(movs.map(m => m.data.categoria).filter(Boolean))];
  v.innerHTML = hero(it, it.nombre, `${movs.length} movimientos · en ${esc(S.cfg.moneda)} · <b>${esc(it.carpeta)}/</b>`)
    + `<div class="chips acts-row"><button class="btn acc" data-mov="gasto">${ic('plus')} Nuevo gasto</button><button class="btn" data-mov="ingreso">${ic('plus')} Nuevo ingreso</button><span class="sp"></span>${folderChips(it, d.subcarpetas)}</div>
    <div class="chips" id="cuentas"><button class="chip" data-c="">Todas las cuentas</button>${cuentas.map(c => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="chips" id="meses">${meses.map(m => `<button class="chip" data-m="${m}">${esc(mesLabel(m))}</button>`).join('')}</div>
    <div id="fin"></div>`;
  mountView(v, it);
  const draw = () => {
    $$('#cuentas [data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === cuenta));
    $$('#meses [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === mes));
    const ms = movs.filter(m => m.f.startsWith(mes) && (!cuenta || m.data.cuenta === cuenta)).sort((a, b) => b.f.localeCompare(a.f));
    const ing = ms.filter(m => m.imp > 0).reduce((s, m) => s + m.imp, 0);
    const gas = -ms.filter(m => m.imp < 0).reduce((s, m) => s + m.imp, 0);
    const porCat = {};
    for (const m of ms.filter(x => x.imp < 0)) porCat[m.data.categoria || 'Otros'] = (porCat[m.data.categoria || 'Otros'] || 0) - m.imp;
    const cl = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    const max = cl[0]?.[1] || 1;
    $('#fin').innerHTML = `<div class="stats">
        <div class="panel stat-t"><small>Ingresos</small><b class="pos">${money(ing)}</b></div>
        <div class="panel stat-t"><small>Gastos</small><b class="neg">${money(gas)}</b></div>
        <div class="panel stat-t"><small>Balance</small><b>${money(ing - gas)}</b></div>
        <div class="panel stat-t"><small>Movimientos</small><b>${ms.length}</b></div>
      </div>
      ${cl.length ? `<div class="sec-h"><h2>Gastos por categoría</h2></div><div class="panel cats">${cl.map(([c, x]) => `<div class="cat"><span>${esc(c)}</span><div class="bar"><i style="width:${(x / max) * 100}%"></i></div><span class="v">${money(x)}</span></div>`).join('')}</div>` : ''}
      <div class="sec-h"><h2>Movimientos de ${esc(mesLabel(mes).toLowerCase())}</h2></div>
      ${ms.length ? `<div class="panel tablewrap"><table class="db"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Cuenta</th><th style="text-align:right">Importe</th></tr></thead><tbody>
      ${ms.map(m => `<tr data-note="${esc(m.path)}"><td>${esc(fmtCorto(m.f))}</td><td class="nm">${esc(m.data.concepto || m.name)}</td><td>${esc(m.data.categoria || '—')}</td><td class="mut">${esc(m.data.cuenta || '—')}</td><td class="num ${m.imp < 0 ? 'neg' : 'pos'}">${money(m.imp)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="panel empty"><b>Sin movimientos</b>Registra el primero con «Nuevo gasto» o «Nuevo ingreso». Cada movimiento se guarda como una nota en <code>${esc(movFolder())}/</code>.</div>`}`;
  };
  $('#cuentas').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { cuenta = b.dataset.c; store.set('finCuenta', cuenta); draw(); } });
  $('#meses').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { mes = b.dataset.m; draw(); } });
  $$('[data-mov]', v).forEach(b => b.addEventListener('click', () => movimientoModal({ tipo: b.dataset.mov, cuenta, categorias: cats })));
  draw();
}

// ---------------- LeAn3D: pedidos, ventas y gastos del emprendimiento ----------------
const PED_FLOW = ['pedido', 'imprimiendo', 'listo', 'entregado', 'cobrado'];
const PED_LABEL = { pedido: 'Pedidos nuevos', imprimiendo: 'Imprimiendo', listo: 'Listos', entregado: 'Entregados', cobrado: 'Cobrado', cancelado: 'Cancelado' };
const PED_NEXT = { pedido: 'Empezar a imprimir', imprimiendo: 'Marcar listo', listo: 'Marcar entregado' };
async function viewNegocio(v, it, _args, alive) {
  const pedF = `${it.carpeta}/${it.pedidos || 'Pedidos'}`;
  const fin = finSec();
  const cuenta = it.cuenta || it.nombre;
  const [dp, df, root] = await Promise.all([
    api(`/api/carpeta?path=${encQ(pedF)}&recursive=1`),
    fin ? api(`/api/carpeta?path=${encQ(fin.carpeta)}&recursive=1`) : { notas: [] },
    api(`/api/carpeta?path=${encQ(it.carpeta)}`),
  ]);
  if (!alive()) return;
  setCrumbs([[it.nombre]]);
  const today = S.ov.hoy, mes = today.slice(0, 7);
  const peds = dp.notas.filter(n => n.data.producto || n.data.cliente).map(n => ({ ...n, est: String(n.data.estado || 'pedido').toLowerCase(), precio: num(n.data.precio) || 0, costo: num(n.data.costo) || 0 }))
    .sort((a, b) => String(a.data.entrega || '9').localeCompare(String(b.data.entrega || '9')));
  const movs = df.notas.filter(n => typeof n.data.importe === 'number' && String(n.data.cuenta || '') === cuenta && fechaDe(n.data.fecha).startsWith(mes));
  const ing = movs.filter(m => m.data.importe > 0).reduce((s, m) => s + m.data.importe, 0);
  const gas = -movs.filter(m => m.data.importe < 0).reduce((s, m) => s + m.data.importe, 0);
  const activos = peds.filter(p => !['cobrado', 'cancelado'].includes(p.est));
  const porCobrar = peds.filter(p => ['listo', 'entregado'].includes(p.est)).reduce((s, p) => s + p.precio, 0);
  const cobrados = peds.filter(p => p.est === 'cobrado').sort((a, b) => String(b.data.cobrado || '').localeCompare(String(a.data.cobrado || ''))).slice(0, 10);
  const card = p => {
    const ent = fechaDe(p.data.entrega);
    return `<article class="panel kcard" data-note="${esc(p.path)}">
      <b>${esc(p.data.producto || p.name)}</b>
      <span class="mut">${esc(p.data.cliente || '—')}${num(p.data.cantidad) > 1 ? ` · x${num(p.data.cantidad)}` : ''}${p.data.filamento ? ` · ${esc(p.data.filamento)}` : ''}</span>
      <div class="kmeta"><span>${money(p.precio)}</span>${ent ? `<span class="${ent < today ? 'neg' : 'mut'}">entrega ${esc(fmtCorto(ent))}</span>` : ''}</div>
      <div class="kact" data-noopen>${p.est === 'entregado'
        ? `<button class="btn acc" data-cobrar="${esc(p.path)}">Cobrar ${money(p.precio)}</button>`
        : `<button class="btn" data-avanzar="${esc(p.path)}" data-est="${p.est}">${esc(PED_NEXT[p.est] || 'Avanzar')} →</button>`}</div>
    </article>`;
  };
  v.innerHTML = hero(it, it.nombre, `Impresión 3D · ${activos.length} pedidos en curso · todo en ${esc(S.cfg.moneda)}`)
    + `<div class="chips acts-row"><button class="btn acc" data-npedido>${ic('plus')} Nuevo pedido</button><button class="btn" data-mov="gasto">${ic('plus')} Registrar gasto</button><button class="btn" data-mov="ingreso">${ic('plus')} Otro ingreso</button><span class="sp"></span>${folderChips(it, root.subcarpetas)}</div>
    <div class="stats">
      <div class="panel stat-t"><small>Facturado en ${esc(mesLabel(mes).toLowerCase())}</small><b class="pos">${money(ing)}</b></div>
      <div class="panel stat-t"><small>Gastos del mes</small><b class="neg">${money(gas)}</b></div>
      <div class="panel stat-t"><small>Ganancia del mes</small><b>${money(ing - gas)}</b></div>
      <div class="panel stat-t"><small>Por cobrar</small><b>${money(porCobrar)}</b></div>
    </div>
    <div class="sec-h"><h2>Pedidos en curso</h2><span class="mut">Avanza cada pedido; al cobrarlo se anota solo como ingreso de ${esc(cuenta)} en Finanzas</span></div>
    <div class="kanban" id="kanban">${PED_FLOW.slice(0, 4).map(e => {
      const ps = peds.filter(p => p.est === e);
      return `<section class="kcol"><h3>${esc(PED_LABEL[e])} <span class="c">${ps.length}</span></h3>${ps.map(card).join('') || '<p class="kvacio">—</p>'}</section>`;
    }).join('')}</div>
    ${cobrados.length ? `<div class="sec-h"><h2>Últimos cobrados</h2></div><div class="panel tablewrap"><table class="db"><thead><tr><th>Producto</th><th>Cliente</th><th>Cobrado</th><th style="text-align:right">Precio</th><th style="text-align:right">Margen</th></tr></thead><tbody>
      ${cobrados.map(p => `<tr data-note="${esc(p.path)}"><td class="nm">${esc(p.data.producto || p.name)}</td><td>${esc(p.data.cliente || '—')}</td><td>${esc(fmtCorto(fechaDe(p.data.cobrado)))}</td><td class="num">${money(p.precio)}</td><td class="num ${p.costo ? 'pos' : 'mut'}">${p.costo ? money(p.precio - p.costo) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  mountView(v, it);
  $('[data-npedido]', v).addEventListener('click', () => openModal({
    title: 'Nuevo pedido', submit: 'Guardar pedido', html: `
      <div class="row2">${fld('Cliente', inp('cliente', 'required placeholder="Nombre o @usuario"'))}${fld('Producto', inp('producto', 'required placeholder="Ej.: Llavero personalizado"'))}</div>
      <div class="row3">${fld('Cantidad', inp('cantidad', 'type="number" min="1" value="1"'))}${fld(`Precio total (${esc(S.cfg.moneda)})`, inp('precio', 'required inputmode="decimal" placeholder="Ej.: 12.000"'))}${fld('Costo de material', inp('costo', 'inputmode="decimal" placeholder="Opcional"'))}</div>
      <div class="row3">${fld('Canal', sel('canal', ['Instagram', 'WhatsApp', 'Mercado Libre', 'Presencial', 'Otro']))}${fld('Filamento / color', inp('filamento', 'placeholder="Ej.: PLA rosa"'))}${fld('Entrega', inp('entrega', 'type="date"'))}</div>
      ${fld('Notas (opcional)', txa('notas', 'Medidas, archivo STL, detalles…', 3))}`,
    onSubmit: async f => {
      const precio = num(f.precio);
      if (!isFinite(precio)) throw new Error('El precio no es válido');
      await api('/api/nota', { method: 'POST', body: { carpeta: pedF, titulo: `${today} ${limpiarNombre(f.cliente)} - ${limpiarNombre(f.producto)}`, campos: { cliente: f.cliente, producto: f.producto, cantidad: num(f.cantidad) || 1, precio, costo: isFinite(num(f.costo)) ? num(f.costo) : '', canal: f.canal, filamento: f.filamento, entrega: f.entrega, estado: 'pedido', fecha: today }, cuerpo: f.notas } });
      toast('Pedido guardado');
      await refresh();
    },
  }));
  $$('[data-mov]', v).forEach(b => b.addEventListener('click', () => movimientoModal({ tipo: b.dataset.mov, cuenta })));
  $('#kanban').addEventListener('click', async e => {
    const a = e.target.closest('[data-avanzar]'), c = e.target.closest('[data-cobrar]');
    if (!a && !c) return;
    e.stopPropagation();
    (a || c).disabled = true;
    try {
      if (a) {
        const next = PED_FLOW[PED_FLOW.indexOf(a.dataset.est) + 1] || 'listo';
        await api(`/api/note?path=${encQ(a.dataset.avanzar)}`, { method: 'PATCH', body: { campos: { estado: next } } });
        toast(`Pedido: ${PED_LABEL[next].toLowerCase()}`);
      } else {
        const p = peds.find(x => x.path === c.dataset.cobrar);
        await api(`/api/note?path=${encQ(p.path)}`, { method: 'PATCH', body: { campos: { estado: 'cobrado', cobrado: today } } });
        await api('/api/nota', { method: 'POST', body: { carpeta: movFolder(), titulo: `${today} Venta ${limpiarNombre(p.data.producto)} - ${limpiarNombre(p.data.cliente)}`, campos: { fecha: today, concepto: `Venta: ${p.data.producto} (${p.data.cliente})`, importe: p.precio, categoria: 'Ventas', cuenta, pedido: `[[${p.name}]]` } } });
        toast(`Cobrado: ${money(p.precio)} anotado en Finanzas`);
      }
      await refresh();
    } catch (er) { toast(er.message); (a || c).disabled = false; }
  });
}

// ---------------- HOJAS DE GOOGLE SHEETS (Powerlifting, Nutrición) ----------------
const normH = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const findCol = (head, re) => head.findIndex(h => re.test(normH(h)));
const fmtKg = v => `${(Math.round(v * 2) / 2).toLocaleString('es-AR')} kg`;
function sparkline(vals) {
  vals = vals.filter(x => isFinite(x));
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
  const pts = vals.map((x, i) => `${((i / (vals.length - 1)) * 100).toFixed(2)},${(36 - ((x - min) / r) * 32).toFixed(2)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
const LIFTS = [['Sentadilla', /sentadilla|squat|\bsq\b/], ['Banca', /banca|bench|\bbp\b/], ['Peso muerto', /peso muerto|deadlift|\bdl\b|muerto/]];
function analisisGym(head, rows) {
  const cEj = findCol(head, /ejercicio|exercise|movimiento|lift/), cPeso = findCol(head, /^peso$|peso \(|kg|carga|weight|load/);
  const cReps = findCol(head, /^reps|repeticion|^rep$/), cFecha = findCol(head, /fecha|date|^dia$/);
  const res = LIFTS.map(([n]) => ({ n, best: 0, serie: new Map() }));
  const anotar = (li, e1, r, idx) => {
    res[li].best = Math.max(res[li].best, e1);
    const k = cFecha >= 0 && String(r[cFecha]).trim() ? String(r[cFecha]).trim() : `#${idx}`;
    res[li].serie.set(k, Math.max(res[li].serie.get(k) || 0, e1));
  };
  if (cEj >= 0 && cPeso >= 0) {
    rows.forEach((r, idx) => {
      const li = LIFTS.findIndex(([, re]) => re.test(normH(r[cEj])));
      const w = num(r[cPeso]);
      if (li < 0 || !(w > 0)) return;
      const reps = cReps >= 0 && num(r[cReps]) > 0 ? num(r[cReps]) : 1;
      anotar(li, reps === 1 ? w : w * (1 + reps / 30), r, idx);
    });
  } else {
    LIFTS.forEach(([, re], li) => {
      const c = head.findIndex(h => re.test(normH(h)));
      if (c >= 0) rows.forEach((r, idx) => { const w = num(r[c]); if (w > 0 && w < 600) anotar(li, w, r, idx); });
    });
  }
  if (!res.some(x => x.best)) return `<div class="note-bar">Para ver tus máximos, la hoja necesita columnas <b>Ejercicio</b>, <b>Peso</b> y <b>Reps</b>, o una columna por levantamiento (Sentadilla, Banca, Peso muerto).</div>`;
  const total = res.reduce((s, x) => s + x.best, 0);
  return `<div class="sec-h"><h2>Tus máximos</h2><span class="mut">1RM estimado con la fórmula de Epley a partir de lo que registraste</span></div>
    <div class="stats">${res.map(x => `<div class="panel stat-t"><small>${esc(x.n)}</small><b>${x.best ? fmtKg(x.best) : '—'}</b>${sparkline([...x.serie.values()])}</div>`).join('')}
    <div class="panel stat-t"><small>Total (SBD)</small><b>${fmtKg(total)}</b></div></div>`;
}
const NUT = [['Calorías', /calor|kcal|energia/, 'kcal'], ['Proteína', /prote/, 'g'], ['Carbohidratos', /carb|hidrat/, 'g'], ['Grasas', /grasa|fat|lipid/, 'g']];
function analisisNutri(head, rows) {
  const cols = NUT.map(([n, re, u]) => ({ n, u, c: findCol(head, re) })).filter(x => x.c >= 0);
  if (!cols.length) return `<div class="note-bar">Para ver tus promedios, la hoja necesita columnas como <b>Calorías</b>, <b>Proteína</b>, <b>Carbohidratos</b> y <b>Grasas</b>.</div>`;
  const tiles = cols.map(x => {
    const vals = rows.map(r => num(r[x.c])).filter(n => isFinite(n) && n > 0);
    if (!vals.length) return '';
    const ult = vals[vals.length - 1], ult7 = vals.slice(-7), avg = ult7.reduce((a, b) => a + b, 0) / ult7.length;
    return `<div class="panel stat-t"><small>${esc(x.n)} · último registro</small><b>${Math.round(ult).toLocaleString('es-AR')} ${x.u}</b><span class="mut">media de los últimos ${ult7.length}: ${Math.round(avg).toLocaleString('es-AR')} ${x.u}</span>${sparkline(vals.slice(-30))}</div>`;
  }).join('');
  return tiles ? `<div class="sec-h"><h2>Resumen</h2></div><div class="stats">${tiles}</div>` : '';
}
// ---- Rutina de powerlifting con formato de entrenador: bloques "SESION n" y columnas por semana ----
const T = r => (r || []).map(c => String(c ?? '').trim());
const capFrase = s => cap(String(s || '').toLowerCase());
const repsNum = s => { const m = String(s || '').match(/\d+(?:[.,]\d+)?/); return m ? num(m[0]) : NaN; };
const e1rm = (kg, reps) => (reps > 0 && reps <= 12 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : NaN);
function parseRutina(filas) {
  const rows = filas.map(T);
  const info = {};
  for (const t of rows) { // datos de cabecera: solo lo que hay antes de la primera sesión
    if (/^SESI[OÓ]N/i.test(t[0])) break;
    const v = t.slice(1).find(Boolean);
    if (t[0] && v) info[capFrase(t[0])] = v;
  }
  const sesiones = [];
  rows.forEach((t, i) => {
    if (!/^SESI[OÓ]N\s*\d+/i.test(t[0])) return;
    const vistos = {};
    const semanas = [];
    t.forEach((c, j) => { if (/^SEMANA/i.test(c)) { let l = capFrase(c); vistos[l] = (vistos[l] || 0) + 1; if (vistos[l] > 1) l += ' (bis)'; semanas.push({ label: l, col: j }); } });
    let hi = i + 1;
    while (hi < rows.length && hi < i + 5 && !rows[hi].some(c => /^EJERCICIOS?$/i.test(c))) hi++;
    const H = rows[hi] || [];
    const col = re => H.findIndex(c => re.test(c));
    const c = { ej: col(/^EJERCICIOS?$/i), vid: col(/^VIDEO/i), ser: col(/^SERIES$/i), rep: col(/^REPS/i), kg: col(/^KG$/i), rpe: col(/^RPE|^RIR/i), desc: col(/^DESCANSO$/i), ind: col(/^INDICACIONES$/i) };
    if (c.ej < 0) return;
    semanas.forEach((s, k) => {
      const fin = semanas[k + 1]?.col ?? H.length;
      s.series = [];
      for (let j = s.col; j < fin; j++) if (/^REPS$/i.test(H[j])) s.series.push(j);
    });
    const ejercicios = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const x = rows[r];
      if (/^SESI[OÓ]N|^CUANTIFICACI/i.test(x[0])) break;
      if (!x[c.ej]) continue;
      const g = k => (k >= 0 ? x[k] : '');
      ejercicios.push({
        grupo: capFrase(x[0]), nombre: x[c.ej], video: g(c.vid), series: g(c.ser), reps: g(c.rep), kg: g(c.kg), rpe: g(c.rpe), desc: g(c.desc), ind: g(c.ind),
        reg: semanas.map(s => s.series.map(j => ({ reps: x[j], kg: x[j + 1], rir: x[j + 2] })).filter(z => z.reps || z.kg)),
      });
    }
    sesiones.push({ nombre: capFrase(t[0]), tipo: capFrase(rows[i + 1]?.[0] || ''), semanas: semanas.map(s => s.label), ejercicios });
  });
  if (!sesiones.length) return null;
  const qi = rows.findIndex((t, i) => /^CUANTIFICACI/i.test(t[0]) && (rows[i + 1] || []).some(x => /^MUSCULOS?$/i.test(x)));
  const musculos = [];
  if (qi >= 0) {
    const H = rows[qi + 1], cs = H.findIndex(x => /^SERIES$/i.test(x)), ci = H.findIndex(x => /STRESS/i.test(x)), cd = H.findIndex(x => /DIF/i.test(x));
    for (let r = qi + 2; r < rows.length && rows[r][0]; r++) musculos.push({ n: capFrase(rows[r][0]), series: num(rows[r][cs]) || 0, stress: num(rows[r][ci]) || 0, dif: rows[r][cd] || '' });
  }
  return { info, sesiones, musculos };
}
// La hoja del profe siempre reescribe su "Semana 1". El panel guarda una copia por semana
// (Semana 1, 2, 3…) en el vault para no perder lo viejo: <carpeta>/maquina/historial-rutina.json
// + una nota legible por semana en <carpeta>/Semanas/.
const histPath = it => `${it.carpeta}/maquina/historial-rutina.json`;
// levantamientos de competencia (se excluyen variantes y accesorios)
const SBD = [
  ['Sentadilla', /sentadilla|squat/, /frontal|bulgar|hack|goblet|smith|prensa|zancada|split|maquina/],
  ['Banca', /banca|bench/, /mancuerna|inclinad|declinad|maquina|smith|cerrad/],
  ['Peso muerto', /peso muerto|deadlift/, /rumano|rdl|rigid|stiff|mancuerna|piernas|una pierna|trap/],
];
function snapshotDe(R) {
  return {
    sesiones: R.sesiones.filter(s => s.ejercicios.length).map(s => ({
      nombre: s.nombre, tipo: s.tipo,
      ejercicios: s.ejercicios.map(e => ({ grupo: e.grupo, nombre: e.nombre, video: e.video, series: e.series, reps: e.reps, kg: e.kg, rpe: e.rpe, desc: e.desc, ind: e.ind, reg: e.reg[0] || [] })),
    })),
  };
}
// peso real de cada levantamiento en una semana: lo que anotaste; si no hay registro, lo que pidió el profe
function pesosSBD(sesiones) {
  const res = SBD.map(([n, re, no]) => {
    const ejs = sesiones.flatMap(s => s.ejercicios).filter(e => re.test(normH(e.nombre)) && !no.test(normH(e.nombre)));
    let mejor = null;
    for (const e of ejs) {
      const det = `${e.series}x${e.reps}`;
      for (const z of e.reg || []) { const kg = num(z.kg); if (kg > 0 && (!mejor || kg > mejor.kg || mejor.fuente !== 'hecho')) mejor = { kg, fuente: 'hecho', det, ind: e.ind, ej: e.nombre }; }
      const kg = num(e.kg);
      if (kg > 0 && (!mejor || (mejor.fuente !== 'hecho' && kg > mejor.kg))) mejor = { kg, fuente: 'pedido', det, ind: e.ind, ej: e.nombre };
    }
    return { n, ...(mejor || { kg: 0 }) };
  });
  return { lifts: res, total: res.reduce((s, l) => s + (l.kg || 0), 0) };
}
const ddmm = f => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
function renderRutina(it, filas, ctx = {}) {
  const R = parseRutina(filas);
  if (!R) return null;
  const actual = snapshotDe(R);
  const hist = ctx.historial?.semanas || [];
  const last = hist[hist.length - 1];
  const pendiente = !last || JSON.stringify(last.sesiones) !== JSON.stringify(actual.sesiones);
  let sel = store.get(`rutinaSel.${it.id}`, null);
  if (!(sel === 'actual' && pendiente) && !hist.some(s => s.semana === sel)) sel = last ? last.semana : 'actual';
  const vista = sel === 'actual' ? { semana: null, fecha: S.ov.hoy, sesiones: actual.sesiones } : hist.find(s => s.semana === sel);
  S.rep = vista.semana ? { it, semana: vista.semana, fecha: vista.fecha, sesiones: vista.sesiones, path: `${it.carpeta}/Reportes/Reporte semana ${pad(vista.semana)}.md` } : null;
  const P = pesosSBD(vista.sesiones);
  const filasHist = hist.map(s => ({ s, p: pesosSBD(s.sesiones) }));
  const infoTxt = Object.entries(R.info).filter(([k]) => !/^nombre$/i.test(k)).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join(' · ');
  const maxSer = Math.max(1, ...R.musculos.map(m => m.series));
  const aviso = !last
    ? `Todavía no guardaste ninguna semana. Pulsa <b>Actualizar semana</b> para guardar lo que hay ahora en la hoja como <b>Semana 1</b>.`
    : pendiente
      ? `Tu profe cambió la hoja desde la <b>Semana ${last.semana}</b> (guardada el ${esc(ddmm(last.fecha))}). Pulsa <b>Actualizar semana</b> para guardarla como <b>Semana ${last.semana + 1}</b>.`
      : `Al día: la hoja coincide con la <b>Semana ${last.semana}</b>. El domingo, cuando tu profe la actualice, pulsa <b>Actualizar semana</b>.`;
  return `<div class="note-bar ${pendiente ? 'aviso' : ''}">${aviso}${infoTxt ? `<br><span class="mut">${infoTxt} · ${hist.length} ${hist.length === 1 ? 'semana guardada' : 'semanas guardadas'}</span>` : ''}</div>
    <div class="sec-h"><h2>${vista.semana ? `Pesos de la semana ${vista.semana}` : 'Pesos en la hoja (sin guardar)'}</h2></div>
    <div class="stats">${P.lifts.map(l => `<div class="panel stat-t"><small>${esc(l.n)}</small><b>${l.kg ? fmtKg(l.kg) : '—'}</b>${l.kg ? `<span class="mut">${esc(l.det)}${l.ind ? ` - ${esc(l.ind)}` : ''}</span>` : ''}</div>`).join('')}
      </div>
    ${filasHist.length ? `<div class="sec-h"><h2>Historial</h2><span class="mut">Una fila por semana guardada · toca una para verla</span></div>
      <div class="panel tablewrap"><table class="db"><thead><tr><th>Semana</th><th>Guardada</th><th style="text-align:right">Sentadilla</th><th style="text-align:right">Banca</th><th style="text-align:right">Peso muerto</th></tr></thead><tbody>
      ${filasHist.slice().reverse().map(({ s, p }) => `<tr data-rsem="${s.semana}" class="${s.semana === sel ? 'sel' : ''}"><td class="nm">Semana ${s.semana}</td><td>${esc(ddmm(s.fecha))}</td>${p.lifts.map(l => `<td class="num">${l.kg ? fmtKg(l.kg) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    <div class="sec-h"><h2>Rutina</h2><span class="mut">Elige la semana</span></div>
    <div class="chips" id="semanas">${hist.map(s => `<button class="chip ${s.semana === sel ? 'on' : ''}" data-rsem="${s.semana}">Semana ${s.semana} <span class="c">${esc(ddmm(s.fecha))}</span></button>`).join('')}${pendiente ? `<button class="chip ${sel === 'actual' ? 'on' : ''}" data-rsem="actual">Hoja actual <span class="c">sin guardar</span></button>` : ''}</div>
    <div class="sesiones">${vista.sesiones.map(s => `<section class="panel sesion"><div class="ses-h"><b>${esc(s.nombre)}</b><span class="tag">${esc(s.tipo)}</span><span class="mut">${s.ejercicios.length} ejercicios</span></div>
      ${s.ejercicios.map(e => `<div class="ex">
          <div class="ex-h"><span class="tag">${esc(e.grupo)}</span><b>${esc(capFrase(e.nombre))}</b>${/^https?:\/\//.test(e.video) ? `<a class="vid" href="${esc(e.video)}" target="_blank" rel="noopener" title="Ver video del ejercicio" aria-label="Ver video">${ic('play')}</a>` : ''}</div>
          <div class="ex-p"><b>${esc(e.series || '?')} × ${esc(e.reps || '?')}</b>${e.kg ? ` · ${esc(e.kg)} kg` : ''}${e.rpe ? ` · RPE/RIR ${esc(e.rpe)}` : ''}${e.desc ? ` · descanso ${esc(e.desc)}` : ''}</div>
          ${e.ind ? `<div class="ex-i">${esc(e.ind)}</div>` : ''}
          <div class="ex-r">${(e.reg || []).length ? e.reg.map((z, k) => `<span class="set">S${k + 1}: ${esc(z.reps || '?')}×${esc(z.kg || '—')} kg${z.rir ? ` · RIR ${esc(z.rir)}` : ''}</span>`).join('') : '<span class="dim">Sin series anotadas</span>'}</div>
        </div>`).join('')}
      ${vista.semana ? `<div class="ses-nota"><label for="rep-${esc(slugComida(s.nombre))}">¿Cómo me fue? <span class="rep-estado" data-estado="${esc(s.nombre)}"></span></label>
        <textarea class="field" id="rep-${esc(slugComida(s.nombre))}" data-rep="${esc(s.nombre)}" rows="3" placeholder="Cargas que hice, RPE real, cómo me sentí, molestias…"></textarea></div>` : ''}
      </section>`).join('')}</div>
    ${vista.semana ? `<div class="sec-h"><h2>Reporte de la semana ${vista.semana}</h2><span class="mut">Se guarda solo en <code>${esc(it.carpeta)}/Reportes/</code> · cópialo y mándaselo a tu coach</span></div>
      <section class="panel reporte" id="reporte">
        <div class="rep-cols">
          <div class="rep-gen"><label for="rep-general">General de la semana <span class="rep-estado" data-estado="General"></span></label>
            <textarea class="field" id="rep-general" data-rep="General" rows="6" placeholder="Peso corporal, sueño, alimentación, cómo me sentí en general, dudas para mi coach…"></textarea>
            <label class="rep-op"><input type="checkbox" id="rep-ej"> Incluir los ejercicios con sus series y kg</label></div>
          <div class="rep-prev"><div class="rep-prev-h"><b>Vista previa</b><span class="sp"></span><button class="btn acc" data-copiar>${ic('check')} Copiar reporte</button><a class="btn" id="rep-wa" href="https://wa.me/" target="_blank" rel="noopener">Abrir WhatsApp</a></div>
            <pre id="rep-texto" aria-live="polite"></pre></div>
        </div>
      </section>` : `<div class="note-bar">Para escribir tu reporte, primero guarda la semana con <b>Actualizar semana</b>.</div>`}
    ${R.musculos.some(m => m.series) ? `<div class="sec-h"><h2>Volumen por músculo</h2><span class="mut">Series semanales y stress index (según la hoja actual)</span></div>
      <div class="panel cats">${R.musculos.filter(m => m.series).sort((a, b) => b.series - a.series).map(m => `<div class="cat"><span>${esc(m.n)}</span><div class="bar"><i style="width:${(m.series / maxSer) * 100}%"></i></div><span class="v">${m.series} series · ${m.stress}</span></div>`).join('')}</div>` : ''}`;
}
function notaSemana(it, sem) {
  const p = pesosSBD(sem.sesiones);
  const [s, b, d] = p.lifts.map(l => l.kg || '');
  const fm = `---\nsemana: ${sem.semana}\nfecha: ${sem.fecha}\nsentadilla: ${s}\nbanca: ${b}\npeso_muerto: ${d}\ntipo: semana-rutina\n---\n\n`;
  const cuerpo = [`# Semana ${sem.semana} · ${ddmm(sem.fecha)}`, '', `Sentadilla **${s || '—'} kg** · Banca **${b || '—'} kg** · Peso muerto **${d || '—'} kg**`, '']
    .concat(sem.sesiones.flatMap(se => [`## ${se.nombre} · ${se.tipo}`, '', '| Ejercicio | Prescripción | Hecho |', '|---|---|---|',
      ...se.ejercicios.map(e => `| ${capFrase(e.nombre)} | ${e.series}×${e.reps}${e.kg ? ` · ${e.kg} kg` : ''}${e.rpe ? ` · RPE/RIR ${e.rpe}` : ''} | ${(e.reg || []).map(z => `${z.reps}×${z.kg}`).join(', ') || '—'} |`), '']));
  return fm + cuerpo.join('\n') + '\n';
}
// botón "Actualizar semana": trae la hoja y, si cambió, la guarda como semana nueva (o reemplaza la última)
async function importarSemana(it, h, redibujar) {
  const d = await api(`/api/hoja?url=${encQ(h.url)}&forzar=1`);
  const R = parseRutina(d.filas.filter(r => r.some(c => String(c).trim())));
  if (!R) { toast('Hoja actualizada'); return redibujar(); }
  const actual = snapshotDe(R);
  const hist = await api(`/api/json?path=${encQ(histPath(it))}`).catch(() => ({ semanas: [] }));
  hist.semanas ||= [];
  const last = hist.semanas[hist.semanas.length - 1];
  if (last && JSON.stringify(last.sesiones) === JSON.stringify(actual.sesiones)) {
    toast(`Sin cambios: la hoja sigue igual que la Semana ${last.semana}`);
    return redibujar();
  }
  const n = last ? last.semana + 1 : 1;
  const p = pesosSBD(actual.sesiones);
  openModal({
    title: 'Guardar semana', submit: 'Guardar', html: `
      <p style="margin:0">Tu profe actualizó la rutina. Se guardará con fecha de hoy (${esc(ddmm(S.ov.hoy))}) sin tocar las semanas anteriores.</p>
      <p class="mut" style="margin:0">En esta hoja: ${p.lifts.map(l => `${esc(l.n)} ${l.kg ? fmtKg(l.kg) : '—'}`).join(' · ')}</p>
      ${last ? seg('modo', [['nueva', `Guardar como Semana ${n}`], ['reemplazar', `Reemplazar Semana ${last.semana}`]], 'nueva') : `<input type="hidden" name="modo" value="nueva"><p style="margin:0"><b>Será la Semana 1</b> de tu historial.</p>`}`,
    onSubmit: async f => {
      let sem;
      if (f.modo === 'reemplazar' && last) {
        if (last.nota) await api(`/api/note?path=${encQ(last.nota)}`, { method: 'DELETE' }).catch(() => {});
        sem = { semana: last.semana, fecha: S.ov.hoy, importado: Date.now(), sesiones: actual.sesiones };
        hist.semanas[hist.semanas.length - 1] = sem;
      } else {
        sem = { semana: n, fecha: S.ov.hoy, importado: Date.now(), sesiones: actual.sesiones };
        hist.semanas.push(sem);
      }
      sem.nota = `${it.carpeta}/Semanas/Semana ${pad(sem.semana)} - ${sem.fecha}.md`;
      await api(`/api/note?path=${encQ(sem.nota)}`, { method: 'PUT', body: { raw: notaSemana(it, sem) } });
      await api(`/api/json?path=${encQ(histPath(it))}`, { method: 'PUT', body: { data: { version: 1, semanas: hist.semanas } } });
      store.set(`rutinaSel.${it.id}`, sem.semana);
      toast(`Guardada como Semana ${sem.semana}`);
      redibujar();
    },
  });
}

// ---- Reporte semanal para el coach: una nota por semana con una sección por sesión + "General" ----
function parseReporte(body) {
  const notas = {};
  const partes = String(body || '').split(/^## (.+)$/m);
  for (let i = 1; i < partes.length; i += 2) notas[partes[i].split(' · ')[0].trim()] = partes[i + 1].replace(/^\n+|\n+$/g, '');
  return notas;
}
function textoReporte(rep, notas, conEj) {
  const L = [`*Reporte semana ${rep.semana}* (desde el ${ddmm(rep.fecha)})`, ''];
  for (const s of rep.sesiones) {
    const nota = (notas[s.nombre] || '').trim();
    if (!nota && !conEj) continue;
    L.push(`*${s.nombre} · ${s.tipo}*`);
    if (conEj) for (const e of s.ejercicios) L.push(`• ${capFrase(e.nombre)}: ${e.series}×${e.reps}${e.kg ? ` · ${e.kg} kg` : ''}${(e.reg || []).length ? ` → hice ${e.reg.map(z => `${z.reps}×${z.kg}`).join(', ')}` : ''}`);
    if (nota) L.push(nota);
    L.push('');
  }
  const gen = (notas.General || '').trim();
  if (gen) L.push('*General*', gen, '');
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function rawReporte(rep, notas) {
  const d = new Date();
  return `---\nsemana: ${rep.semana}\ndesde: ${rep.fecha}\ntipo: reporte-semanal\nactualizado: "${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}"\n---\n\n# Reporte semana ${rep.semana}\n\n`
    + rep.sesiones.map(s => `## ${s.nombre} · ${s.tipo}\n${(notas[s.nombre] || '').trim()}\n`).join('\n')
    + `\n## General\n${(notas.General || '').trim()}\n`;
}
const leerNotasReporte = box => Object.fromEntries($$('[data-rep]', box).map(t => [t.dataset.rep, t.value]));
function pintarReporte(box) {
  const rep = S.rep;
  const pre = $('#rep-texto', box);
  if (!rep || !pre) return;
  const txt = textoReporte(rep, leerNotasReporte(box), $('#rep-ej', box)?.checked);
  const vacio = !txt.includes('\n');  // solo el título: todavía no escribiste nada
  pre.textContent = vacio ? 'Cuando escriba cómo me fue en cada sesión, acá se arma el reporte.' : txt;
  pre.dataset.txt = vacio ? '' : txt;
  const wa = $('#rep-wa', box);
  if (wa) wa.href = `https://wa.me/?text=${encQ(txt)}`;
}
async function cargarReporte(box) {
  const rep = S.rep;
  if (!rep || !$('#reporte', box)) return;
  const n = await api(`/api/note?path=${encQ(rep.path)}`).catch(() => null);
  const notas = n ? parseReporte(n.body) : {};
  $$('[data-rep]', box).forEach(t => { if (document.activeElement !== t) t.value = notas[t.dataset.rep] || ''; });
  const ej = $('#rep-ej', box);
  if (ej) ej.checked = store.get('repEj', false);
  box._repBase = JSON.stringify(leerNotasReporte(box));
  pintarReporte(box);
}
async function guardarReporte(box) {
  const rep = S.rep;
  if (!rep) return;
  const actual = JSON.stringify(leerNotasReporte(box));
  if (actual === box._repBase) return; // nada cambió: no crear ni tocar la nota
  box._repBase = actual;
  const estados = $$('.rep-estado', box);
  estados.forEach(e => { e.textContent = 'guardando…'; });
  try {
    await api(`/api/note?path=${encQ(rep.path)}`, { method: 'PUT', body: { raw: rawReporte(rep, leerNotasReporte(box)) } });
    estados.forEach(e => { e.textContent = '✓ guardado'; });
  } catch (er) { estados.forEach(e => { e.textContent = 'no se pudo guardar'; }); toast(er.message); }
}

// ---- Plan de nutrición: objetivos, macros y comidas; seguimiento diario en el vault ----
const slugComida = s => normH(s).replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
function parsePlan(filas) {
  const rows = filas.map(T);
  const iDist = rows.findIndex(r => /DISTRIBUCI/i.test(r[0]));
  const iEst = rows.findIndex(r => /ESTRUCTURA|COMIDAS/i.test(r[0]));
  if (iDist < 0 && iEst < 0) return null;
  const fin = [iDist, iEst].filter(x => x >= 0);
  const obs = rows.slice(0, Math.min(...fin)).filter(r => r[0] && r[1]).map(r => ({ k: r[0], v: r[1] }));
  const macros = iDist >= 0 ? rows.slice(iDist + 1, iEst > iDist ? iEst : undefined).filter(r => r[0] && isFinite(num(r[1])) && num(r[1]) > 0).map(r => ({ n: r[0], g: num(r[1]), nota: r[2] || '' })) : [];
  const comidas = [];
  let cur = null;
  if (iEst >= 0) for (const r of rows.slice(iEst + 1)) {
    if (r[0]) { cur = { nombre: r[0], slug: slugComida(r[0]), grupos: [] }; comidas.push(cur); }
    if (!cur) continue;
    if (r[1]) cur.grupos.push({ cat: r[1], ops: [] });
    if (r[2]) { if (!cur.grupos.length) cur.grupos.push({ cat: '', ops: [] }); cur.grupos[cur.grupos.length - 1].ops.push(r[2]); }
  }
  return { obs, macros, comidas };
}
function renderPlan(it, filas, ctx = {}) {
  const P = parsePlan(filas);
  if (!P) return null;
  const today = S.ov.hoy;
  const reg = (ctx.registro || []).map(n => ({ ...n, f: fechaDe(n.data.fecha) || n.name.slice(0, 10) }));
  const hoyN = reg.find(n => n.f === today);
  const kcalDe = m => m.g * (/grasa|lipid/i.test(m.n) ? 9 : 4);
  const kcalTot = P.macros.reduce((s, m) => s + kcalDe(m), 0) || 1;
  const COLS = ['#f4b68c', '#7fd6a4', '#8fb8f2', '#f2c46b'];
  const dias = [...Array(7)].map((_, i) => { const d = parseISO(today); d.setDate(d.getDate() - 6 + i); return isoDate(d); });
  const nC = P.comidas.length || 1;
  const hechasDia = d => { const n = reg.find(x => x.f === d); return n ? P.comidas.filter(c => n.data[c.slug] === true).length : 0; };
  const semana = Math.round((dias.reduce((s, d) => s + hechasDia(d), 0) / (7 * nC)) * 100);
  const pesos = reg.filter(n => isFinite(num(n.data.peso)) && num(n.data.peso) > 0).sort((a, b) => a.f.localeCompare(b.f));
  const kcalObs = P.obs.find(o => /calor/i.test(o.k));
  return `<div class="stats">
      ${kcalObs ? `<div class="panel stat-t"><small>Calorías del día</small><b>${esc(Number(num(kcalObs.v)).toLocaleString('es-AR'))} kcal</b></div>` : ''}
      ${P.obs.filter(o => o !== kcalObs).map(o => `<div class="panel stat-t"><small>${esc(o.k)}</small><b>${esc(o.v)}</b></div>`).join('')}
    </div>
    ${P.macros.length ? `<div class="sec-h"><h2>Macros del día</h2></div>
      <div class="panel macros"><div class="mbar">${P.macros.map((m, i) => `<i style="width:${(kcalDe(m) / kcalTot) * 100}%;background:${COLS[i % 4]}" title="${esc(capFrase(m.n))}"></i>`).join('')}</div>
      <div class="mlist">${P.macros.map((m, i) => `<div><span class="dotc" style="background:${COLS[i % 4]}"></span><b>${esc(capFrase(m.n))}</b><span class="g">${Math.round(m.g)} g</span><span class="mut">${Math.round((kcalDe(m) / kcalTot) * 100)}% de las kcal</span>${m.nota ? `<small class="mut">${esc(m.nota)}</small>` : ''}</div>`).join('')}</div></div>` : ''}
    <div class="sec-h"><h2>Hoy</h2><span class="mut">Marca las comidas que cumpliste · se guarda en <code>${esc(it.carpeta)}/Registro/</code></span></div>
    <div class="panel hoy-nutri">
      <div class="hn-com">${P.comidas.map(c => { const ok = hoyN?.data[c.slug] === true; return `<button class="chk ${ok ? 'on' : ''}" data-comida="${esc(c.slug)}" aria-pressed="${ok}">${ok ? ic('check') : ''}<span>${esc(capFrase(c.nombre))}</span></button>`; }).join('')}</div>
      <div class="hn-stats"><span><b>${hechasDia(today)}/${nC}</b> hoy</span><span><b>${semana}%</b> esta semana</span>
        <label class="peso">Peso hoy <input class="field" id="peso-hoy" inputmode="decimal" placeholder="kg" value="${esc(hoyN?.data.peso ?? '')}"></label></div>
      <div class="wbars wide">${dias.map(d => `<i style="--h:${(hechasDia(d) / nC) * 100}%" class="${d === today ? 'hoy' : ''}" title="${esc(fmtCorto(d))}: ${hechasDia(d)}/${nC}"></i>`).join('')}</div>
      ${pesos.length > 1 ? `<div class="mut" style="font-size:.8rem;margin-top:.6rem">Peso: ${esc(pesos[0].data.peso)} → <b>${esc(pesos[pesos.length - 1].data.peso)} kg</b></div>${sparkline(pesos.map(p => num(p.data.peso)))}` : ''}
    </div>
    <div class="sec-h"><h2>Comidas</h2></div>
    <div class="comidas">${P.comidas.map(c => `<section class="panel comida"><div class="ses-h"><b>${esc(capFrase(c.nombre))}</b></div>
      ${c.grupos.filter(g => g.ops.length).map(g => `<div class="cg"><small>${esc(g.cat || 'Opciones')}</small>${g.ops.length > 1 ? `<ul>${g.ops.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : `<p>${esc(g.ops[0])}</p>`}</div>`).join('')}
    </section>`).join('')}</div>`;
}
function renderHoja(it, h, d, ctx = {}) {
  const filas = d.filas.filter(r => r.some(c => String(c).trim()));
  const bar = `<div class="hoja-bar"><b>${esc(h.nombre)}</b><span class="mut">${filas.length} filas · leída a las ${new Date(d.leido).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span><span class="sp"></span>
    <a class="btn" href="${esc(h.url)}" target="_blank" rel="noopener">${ic('ext')} Abrir en Sheets</a><button class="btn ${it.analisis === 'gym' ? 'acc' : ''}" data-hupd>${ic('sync')} ${it.analisis === 'gym' ? 'Actualizar semana' : 'Actualizar'}</button><button class="btn icon" data-hquitar title="Quitar esta hoja del panel" aria-label="Quitar hoja">${ic('trash')}</button></div>`;
  if (!filas.length) return bar + '<div class="panel empty"><b>La hoja está vacía</b></div>';
  let hi = filas.findIndex(r => r.filter(c => String(c).trim() && !isFinite(num(c))).length >= 2);
  if (hi < 0) hi = 0;
  let ncol = 0;
  filas.forEach(r => r.forEach((c, i) => { if (String(c).trim()) ncol = Math.max(ncol, i + 1); }));
  const head = filas[hi].slice(0, ncol).map(c => String(c).trim());
  const rows = filas.slice(hi + 1).map(r => r.slice(0, ncol));
  const cellH = c => { const s = String(c ?? '').trim(); return !s ? '<td class="dim">·</td>' : isFinite(num(s)) && /^[\d\s.,%-]+(kg|g|kcal)?$/i.test(s) ? `<td class="num">${esc(s)}</td>` : `<td>${esc(s)}</td>`; };
  const tabla = `<div class="panel tablewrap hoja-tabla"><table class="db"><thead><tr>${head.map(x => `<th>${esc(x || '—')}</th>`).join('')}</tr></thead><tbody>${rows.slice(-400).map(r => `<tr class="nohover">${head.map((_, i) => cellH(r[i])).join('')}</tr>`).join('')}</tbody></table></div>`;
  // formatos conocidos (rutina del entrenador, plan de nutrición) → vista a medida; si no, tabla + análisis genérico
  const especial = it.analisis === 'gym' ? renderRutina(it, filas, ctx) : it.analisis === 'nutricion' ? renderPlan(it, filas, ctx) : null;
  if (especial) return bar + especial + `<details class="crudo"><summary>Ver la hoja tal cual</summary>${tabla}</details>`;
  const extra = it.analisis === 'gym' ? analisisGym(head, rows) : it.analisis === 'nutricion' ? analisisNutri(head, rows) : '';
  return bar + extra + `<div class="sec-h"><h2>Datos</h2><span class="mut">${rows.length} filas${rows.length > 400 ? ' · se muestran las últimas 400' : ''}</span></div>${tabla}`;
}
async function viewHojas(v, it, _args, alive) {
  const hojas = S.cfg.prefs?.hojas?.[it.id] || [];
  let selI = Math.min(store.get(`hoja.${it.id}`, 0), Math.max(0, hojas.length - 1));
  const root = await api(`/api/carpeta?path=${encQ(it.carpeta)}`).catch(() => ({ subcarpetas: [], notas: [] }));
  if (!alive()) return;
  setCrumbs([[it.nombre]]);
  v.innerHTML = hero(it, it.nombre, hojas.length ? `${hojas.length} ${hojas.length === 1 ? 'hoja vinculada' : 'hojas vinculadas'} de Google Sheets · sigues editando allí y aquí se ve al momento` : 'Vincula tu Google Sheets y lo verás aquí')
    + `<div class="chips acts-row" id="hojas-bar"><button class="btn acc" data-vincular>${ic('link')} Vincular hoja</button>${hojas.map((h, i) => `<button class="chip" data-hoja="${i}">${esc(h.nombre)}</button>`).join('')}<span class="sp"></span>${folderChips(it, root.subcarpetas)}</div>
    <div id="hoja"></div>`;
  mountView(v, it);
  const box = $('#hoja');
  const marcar = () => $$('#hojas-bar [data-hoja]').forEach(b => b.classList.toggle('on', +b.dataset.hoja === selI));
  // datos del vault que acompañan a la hoja: registro diario (nutrición) o historial de semanas (rutina)
  const cargar = (h, forzar) => Promise.all([
    api(`/api/hoja?url=${encQ(h.url)}${forzar ? '&forzar=1' : ''}`),
    it.analisis === 'nutricion' ? api(`/api/carpeta?path=${encQ(`${it.carpeta}/Registro`)}`).then(r => r.notas).catch(() => []) : [],
    it.analisis === 'gym' ? api(`/api/json?path=${encQ(histPath(it))}`).catch(() => ({ semanas: [] })) : null,
  ]).then(([d, registro, historial]) => ({ d, ctx: { registro, historial } }));
  async function drawHoja(forzar = false, quiet = false) {
    marcar();
    if (quiet && hojas.length) {
      const y = window.scrollY;
      const h = hojas[selI];
      try {
        const { d, ctx } = await cargar(h, false);
        if (alive()) { box.innerHTML = renderHoja(it, h, d, ctx); window.scrollTo(0, y); if (it.analisis === 'gym') cargarReporte(box); }
        return;
      } catch { /* si falla, se redibuja normal */ }
    }
    if (!hojas.length) {
      box.innerHTML = `<div class="panel empty"><b>Ninguna hoja vinculada todavía</b>1. Abre tu hoja en Google Sheets → <b>Compartir</b> → «Cualquier persona con el enlace» → <b>Lector</b>.<br>2. Abre la pestaña que quieras ver y copia la dirección del navegador.<br>3. Pulsa <b>Vincular hoja</b> y pégala. Puedes vincular varias pestañas (rutina, registro, macros…).</div>`;
      return;
    }
    const h = hojas[selI];
    box.innerHTML = `<div class="panel empty">Leyendo «${esc(h.nombre)}»…</div>`;
    try {
      const { d, ctx } = await cargar(h, forzar);
      if (alive()) { box.innerHTML = renderHoja(it, h, d, ctx); if (it.analisis === 'gym') cargarReporte(box); }
    } catch (e) {
      if (alive()) box.innerHTML = `<div class="hoja-bar"><b>${esc(h.nombre)}</b><span class="sp"></span><a class="btn" href="${esc(h.url)}" target="_blank" rel="noopener">${ic('ext')} Abrir en Sheets</a><button class="btn" data-hupd>${ic('sync')} Reintentar</button><button class="btn icon" data-hquitar aria-label="Quitar hoja">${ic('trash')}</button></div><div class="panel empty"><b>No pude leer la hoja</b>${esc(e.message)}</div>`;
    }
  }
  $('#hojas-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-hoja]');
    if (b) { selI = +b.dataset.hoja; store.set(`hoja.${it.id}`, selI); drawHoja(); return; }
    if (e.target.closest('[data-vincular]')) openModal({
      title: `Vincular hoja a ${it.nombre}`, submit: 'Vincular', html: `
        <p class="mut" style="margin:0">En Google Sheets: <b>Compartir</b> → «Cualquier persona con el enlace» → Lector. Luego abre la pestaña que quieras y copia la dirección.</p>
        ${fld('Nombre', inp('nombre', `required placeholder="${it.analisis === 'gym' ? 'Ej.: Registro de entrenos' : 'Ej.: Macros diarios'}"`))}
        ${fld('Enlace de la hoja', inp('url', 'required type="url" placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"'))}`,
      onSubmit: async f => {
        await api(`/api/hoja?url=${encQ(f.url)}&forzar=1`);
        await guardarPrefsUI(p => { (p.hojas[it.id] ||= []).push({ nombre: f.nombre, url: f.url }); });
        store.set(`hoja.${it.id}`, (S.cfg.prefs.hojas[it.id] || []).length - 1);
        toast('Hoja vinculada');
        render(true);
      },
    });
  });
  // seguimiento diario de nutrición: una nota por día en <carpeta>/Registro con una propiedad por comida
  async function guardarDia(campos) {
    const today = S.ov.hoy, carpeta = `${it.carpeta}/Registro`;
    const reg = await api(`/api/carpeta?path=${encQ(carpeta)}`).then(r => r.notas).catch(() => []);
    const n = reg.find(x => fechaDe(x.data.fecha) === today || x.name === today);
    if (n) await api(`/api/note?path=${encQ(n.path)}`, { method: 'PATCH', body: { campos } });
    else await api('/api/nota', { method: 'POST', body: { carpeta, titulo: today, campos: { fecha: today, ...campos } } });
  }
  // reporte semanal: se guarda solo (al dejar de escribir un momento y al salir del cuadro)
  let repTimer = null;
  box.addEventListener('input', e => {
    if (!e.target.matches('[data-rep]')) return;
    pintarReporte(box);
    const est = $(`.rep-estado[data-estado="${CSS.escape(e.target.dataset.rep)}"]`, box);
    if (est) est.textContent = 'sin guardar…';
    clearTimeout(repTimer);
    repTimer = setTimeout(() => guardarReporte(box), 1200);
  });
  box.addEventListener('focusout', e => {
    if (!e.target.matches('[data-rep]')) return;
    clearTimeout(repTimer);
    guardarReporte(box);
  });
  box.addEventListener('change', e => { if (e.target.id === 'rep-ej') { store.set('repEj', e.target.checked); pintarReporte(box); } });
  box.addEventListener('click', async e => {
    if (!e.target.closest('[data-copiar]')) return;
    const txt = $('#rep-texto', box)?.dataset.txt || '';
    if (!txt) { toast('Todavía no hay nada para copiar'); return; }
    try { await navigator.clipboard.writeText(txt); toast('Reporte copiado: pégalo en WhatsApp'); }
    catch {
      const r = document.createRange();
      r.selectNodeContents($('#rep-texto', box));
      getSelection().removeAllRanges(); getSelection().addRange(r);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* navegador sin soporte */ }
      toast(ok ? 'Reporte copiado: pégalo en WhatsApp' : 'Texto seleccionado: cópialo con Ctrl+C');
    }
  });
  box.addEventListener('change', async e => {
    if (e.target.id !== 'peso-hoy') return;
    const p = num(e.target.value);
    try { await guardarDia({ peso: isFinite(p) && p > 0 ? p : '' }); toast('Peso guardado'); drawHoja(false, true); } catch (er) { toast(er.message); }
  });
  box.addEventListener('click', async e => {
    const sem = e.target.closest('[data-rsem]');
    if (sem) { store.set(`rutinaSel.${it.id}`, sem.dataset.rsem === 'actual' ? 'actual' : +sem.dataset.rsem); return drawHoja(false, true); }
    const com = e.target.closest('[data-comida]');
    if (com) {
      const on = !com.classList.contains('on');
      com.classList.toggle('on', on);
      try { await guardarDia({ [com.dataset.comida]: on }); drawHoja(false, true); } catch (er) { toast(er.message); }
      return;
    }
    const upd = e.target.closest('[data-hupd]');
    if (upd) {
      if (it.analisis !== 'gym') return drawHoja(true);
      upd.disabled = true;
      try { await importarSemana(it, hojas[selI], () => drawHoja(false, true)); } catch (er) { toast(er.message); } finally { upd.disabled = false; }
      return;
    }
    if (e.target.closest('[data-hquitar]')) {
      if (!confirm(`¿Quitar «${hojas[selI].nombre}» del panel? La hoja de Google no se toca.`)) return;
      await guardarPrefsUI(p => { p.hojas[it.id] = (p.hojas[it.id] || []).filter((_, i) => i !== selI); });
      store.set(`hoja.${it.id}`, 0);
      toast('Hoja quitada');
      render(true);
    }
  });
  drawHoja();
}

// ---------------- ESTUDIO (Formación, Aprender): temas, plan, sesiones y cronómetro ----------------
const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
function sesionModal(it, temas, { tema = '', minutos = 30, deTimer = false } = {}) {
  openModal({
    title: deTimer ? 'Guardar sesión de estudio' : 'Registrar sesión de estudio', submit: 'Guardar sesión', html: `
      ${fld('Tema', sel('tema', temas.map(t => [t.path, t.nombre]), tema))}
      <div class="row2">${fld('Minutos', inp('minutos', `type="number" min="1" required value="${minutos}"`))}${fld('Fecha', inp('fecha', `type="date" value="${S.ov.hoy}"`))}</div>
      ${fld('¿Qué estudiaste?', txa('resumen', 'Lo que viste, dudas, próximos pasos…', 5))}`,
    onSubmit: async f => {
      const t = temas.find(x => x.path === f.tema);
      await api('/api/nota', { method: 'POST', body: { carpeta: `${f.tema}/Sesiones`, titulo: `${f.fecha} ${hhmm()}`, campos: { fecha: f.fecha, minutos: Math.max(1, Math.round(num(f.minutos))), tema: t?.nombre || '' }, cuerpo: f.resumen } });
      if (deTimer) TIMER.set(null);
      toast('Sesión guardada');
      await refresh();
    },
  });
}
async function viewEstudio(v, it, _args, alive) {
  const [root, all] = await Promise.all([api(`/api/carpeta?path=${encQ(it.carpeta)}`), api(`/api/carpeta?path=${encQ(it.carpeta)}&recursive=1`)]);
  if (!alive()) return;
  setCrumbs([[it.nombre]]);
  const today = S.ov.hoy;
  const temas = root.subcarpetas.filter(s => !folderKind(s.nombre)).map(s => {
    const notas = all.notas.filter(n => n.folder === s.path || n.folder.startsWith(s.path + '/'));
    const plan = notas.find(n => n.folder === s.path && (String(n.data.tipo || '').toLowerCase() === 'tema' || n.name === s.nombre)) || null;
    const ses = notas.filter(n => typeof n.data.minutos === 'number');
    return { ...s, plan, ses, min: ses.reduce((a, n) => a + n.data.minutos, 0), ult: ses.map(n => fechaDe(n.data.fecha)).sort().pop() || '', ck: plan?.checks, estado: String(plan?.data.estado || 'activo').toLowerCase(), objetivo: plan?.data.objetivo || '' };
  }).sort((a, b) => (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1) || (b.ult || '').localeCompare(a.ult || ''));
  const ses = temas.flatMap(t => t.ses.map(n => ({ ...n, tema: t.nombre, f: fechaDe(n.data.fecha) }))).sort((a, b) => b.f.localeCompare(a.f) || b.name.localeCompare(a.name));
  const dias = [...Array(7)].map((_, i) => { const d = parseISO(today); d.setDate(d.getDate() - 6 + i); return isoDate(d); });
  const porDia = dias.map(d => ses.filter(s => s.f === d).reduce((a, s) => a + s.data.minutos, 0));
  const semana = porDia.reduce((a, b) => a + b, 0), maxDia = Math.max(30, ...porDia);
  let racha = 0;
  { const d = parseISO(today); if (!ses.some(s => s.f === today)) d.setDate(d.getDate() - 1); while (ses.some(s => s.f === isoDate(d))) { racha++; d.setDate(d.getDate() - 1); } }
  const timer = TIMER.get();
  const aqui = timer && timer.sec === it.id;
  v.innerHTML = hero(it, it.nombre, `Tu espacio de estudio · ${temas.length} ${temas.length === 1 ? 'tema' : 'temas'} · ${fmtMin(semana)} esta semana`)
    + `<div class="est" id="est">
    <div class="chips acts-row"><button class="btn acc" data-ntema>${ic('plus')} Nuevo tema</button><button class="btn" data-nsesion ${temas.length ? '' : 'disabled'}>${ic('timer')} Registrar sesión</button><span class="sp"></span>${folderChips(it, root.subcarpetas.filter(s => folderKind(s.nombre)))}</div>
    ${aqui ? `<section class="panel timer-box"><div><small>Estudiando ahora</small><b>${esc(timer.temaNombre)}</b></div><div class="tbig" id="timer-big">${fmtSeg(TIMER.seg(timer))}</div>
      <div class="tc-a"><button class="btn" data-tpausa>${ic(timer.corriendo ? 'pause' : 'play')} ${timer.corriendo ? 'Pausar' : 'Seguir'}</button><button class="btn acc" data-tfin>${ic('stop')} Terminar y guardar</button><button class="btn ghost" data-tdescartar>Descartar</button></div></section>` : ''}
    <div class="stats">
      <div class="panel stat-t"><small>Esta semana</small><b>${fmtMin(semana)}</b><div class="wbars">${porDia.map((m, i) => `<i style="--h:${(m / maxDia) * 100}%" title="${esc(fmtCorto(dias[i]))}: ${m} min" class="${dias[i] === today ? 'hoy' : ''}"></i>`).join('')}</div></div>
      <div class="panel stat-t"><small>Racha</small><b>${racha} ${racha === 1 ? 'día' : 'días'}</b><span class="mut">${racha ? 'seguidos estudiando' : 'estudia hoy para empezar una'}</span></div>
      <div class="panel stat-t"><small>Temas activos</small><b>${temas.filter(t => t.estado === 'activo').length}</b></div>
      <div class="panel stat-t"><small>Total estudiado</small><b>${fmtMin(temas.reduce((a, t) => a + t.min, 0))}</b></div>
    </div>
    <div class="sec-h"><h2>Temas</h2><span class="mut">Cada tema es una carpeta con su plan (casillas) y sus sesiones</span></div>
    ${temas.length ? `<div class="tgrid">${temas.map(t => {
      const pct = t.ck ? Math.round((t.ck[0] / t.ck[1]) * 100) : 0;
      return `<article class="panel tcard">
        <div class="tc-h"><b>${esc(t.nombre)}</b><span class="pill ${STATE_COLORS[t.estado] || (t.estado === 'activo' ? 'c-ok' : 'c-mut')}">${esc(cap(t.estado))}</span></div>
        ${t.objetivo ? `<p class="mut">${esc(t.objetivo)}</p>` : ''}
        <div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><span>${t.ck ? `${t.ck[0]}/${t.ck[1]} · ${pct}%` : 'sin plan'}</span></div>
        <div class="tc-m"><span>${ic('timer')} ${fmtMin(t.min)}</span><span>${t.ult ? `última: ${esc(fmtCorto(t.ult))}` : 'sin sesiones'}</span></div>
        <div class="tc-a"><button class="btn acc" data-estudiar="${esc(t.path)}" data-nombre="${esc(t.nombre)}">${ic('play')} Estudiar</button>${t.plan ? `<button class="btn" data-note="${esc(t.plan.path)}">Plan</button>` : ''}<a class="btn" href="#${it.id}/${encQ(t.nombre)}">Abrir</a></div>
      </article>`;
    }).join('')}</div>` : `<div class="panel empty"><b>Todavía no hay temas</b>Crea uno con «Nuevo tema»: escribe el objetivo y los pasos del plan, y el panel lleva el progreso y las horas.</div>`}
    ${ses.length ? `<div class="sec-h"><h2>Últimas sesiones</h2></div><div class="panel tablewrap"><table class="db"><thead><tr><th>Fecha</th><th>Tema</th><th style="text-align:right">Tiempo</th><th>Qué estudiaste</th></tr></thead><tbody>
      ${ses.slice(0, 12).map(s => `<tr data-note="${esc(s.path)}"><td>${esc(fmtCorto(s.f))}</td><td class="nm">${esc(s.tema)}</td><td class="num">${esc(fmtMin(s.data.minutos))}</td><td class="txt">${esc(s.excerpt || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
  mountView(v, it);
  $('#est').addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-ntema]')) return openModal({
      title: `Nuevo tema en ${it.nombre}`, submit: 'Crear tema', html: `
        ${fld('Nombre del tema', inp('nombre', 'required placeholder="Ej.: Inglés B2, Fusion 360, Contabilidad…"'))}
        ${fld('Objetivo', inp('objetivo', 'placeholder="¿Qué quieres lograr?"'))}
        ${fld('Plan (un paso por línea)', txa('plan', 'Unidad 1\nUnidad 2\nProyecto final', 6))}`,
      onSubmit: async f => {
        const nombre = limpiarNombre(f.nombre);
        if (!nombre) throw new Error('Pon un nombre');
        const pasos = String(f.plan || '').split('\n').map(s => s.trim()).filter(Boolean);
        const cuerpo = `## Objetivo\n${f.objetivo || ''}\n\n## Plan\n${pasos.map(p => `- [ ] ${p}`).join('\n') || '- [ ] Primer paso'}\n\n## Apuntes\n`;
        await api('/api/nota', { method: 'POST', body: { carpeta: `${it.carpeta}/${nombre}`, titulo: nombre, campos: { tipo: 'tema', estado: 'activo', objetivo: f.objetivo, inicio: today }, cuerpo } });
        toast('Tema creado');
        await refresh();
      },
    });
    if (t.closest('[data-nsesion]')) return sesionModal(it, temas, { tema: temas[0]?.path });
    const est = t.closest('[data-estudiar]');
    if (est) {
      const cur = TIMER.get();
      if (cur && !confirm(`Ya hay una sesión en curso de «${cur.temaNombre}». ¿Descartarla y empezar otra?`)) return;
      TIMER.set({ sec: it.id, tema: est.dataset.estudiar, temaNombre: est.dataset.nombre, inicio: Date.now(), acumulado: 0, corriendo: true });
      return render(true);
    }
    if (t.closest('[data-tpausa]')) {
      const c = TIMER.get(); if (!c) return;
      TIMER.set(c.corriendo ? { ...c, acumulado: c.acumulado + Date.now() - c.inicio, corriendo: false } : { ...c, inicio: Date.now(), corriendo: true });
      return render(true);
    }
    if (t.closest('[data-tfin]')) {
      const c = TIMER.get(); if (!c) return;
      if (c.corriendo) TIMER.set({ ...c, acumulado: c.acumulado + Date.now() - c.inicio, corriendo: false });
      return sesionModal(it, temas, { tema: c.tema, minutos: Math.max(1, Math.round(TIMER.seg() / 60)), deTimer: true });
    }
    if (t.closest('[data-tdescartar]')) {
      if (confirm('¿Descartar el tiempo de esta sesión?')) { TIMER.set(null); render(true); }
    }
  });
}

// ---------------- LA IA: registro ----------------
const EST = { hecho: ['Hecho', 'ok'], error: ['Error', 'err'], decidir: ['Te toca decidir', 'warn'], 'en curso': ['En curso', 'info'] };
async function viewIA(v, it, args, alive) {
  const reg = await api('/api/registro');
  if (!alive()) return;
  setCrumbs([['La IA']]);
  const entries = reg.map(e => ({ ...e, dia: String(e.fecha).slice(0, 10), hora: String(e.fecha).slice(11, 16) })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const dias = [...new Set(entries.map(e => e.dia))];
  let dia = args[0] || dias[0] || S.ov.hoy;
  let sec = store.get('iaSec', 'Todas');
  const secs = ['Todas', ...new Set(entries.map(e => e.seccion).filter(Boolean))];
  if (!secs.includes(sec)) sec = 'Todas';
  const ddmm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  v.innerHTML = hero(it, 'Qué ha hecho la IA', 'Cada cosa que han hecho los agentes, con su sección y su resultado.')
    + `<div class="chips" id="dias">${dias.slice(0, 3).map(d => `<button class="chip" data-d="${d}">${d === S.ov.hoy ? 'Hoy' : ddmm(d)}</button>`).join('')}<button class="chip" data-d="7d">Últimos 7 días</button></div>
    <div class="chips" id="secs">${secs.map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div id="log"></div>`;
  mountView(v, it);
  const draw = () => {
    $$('#dias [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === dia));
    $$('#secs [data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    let ds;
    if (dia === '7d') { const lim = new Date(); lim.setDate(lim.getDate() - 6); ds = dias.filter(d => d >= isoDate(lim)); }
    else ds = [dia];
    let html = '';
    for (const d of ds) {
      const es = entries.filter(e => e.dia === d && (sec === 'Todas' || e.seccion === sec));
      const n = k => es.filter(e => e.estado === k).length;
      html += `<div class="day-h"><h2>${esc(fmtLargo(d))}</h2><span class="cnt">${es.length} cosas · ${n('hecho')} hechas · ${n('decidir')} esperan tu OK · ${n('error')} con error</span><span class="sp"></span><button class="linklike" data-diario="${d}">Diario del día</button></div>`;
      html += es.length ? es.map(e => {
        const [lbl, cls] = EST[e.estado] || [cap(e.estado || 'hecho'), 'info'];
        return `<div class="entry st-${cls}"><div class="hr">${esc(e.hora)}</div><div><div class="eh"><span class="pill c-${cls}">${esc(lbl)}</span><b>${esc(e.seccion || 'General')}${e.subseccion ? ' › ' + esc(e.subseccion) : ''}</b><span class="mut">· ${esc(e.agente || 'IA')}</span></div><div class="et">${esc(e.texto)}</div></div></div>`;
      }).join('') : '<div class="panel empty">Nada registrado este día con este filtro.</div>';
    }
    if (!entries.length) html = `<div class="panel empty"><b>Todavía no hay registro</b>Los agentes añaden una línea JSON a <code>${esc(S.cfg.sistema.registro)}</code> al terminar cada acción.</div>`;
    $('#log').innerHTML = html;
  };
  $('#dias').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { dia = b.dataset.d; draw(); } });
  $('#secs').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { sec = b.dataset.s; store.set('iaSec', sec); draw(); } });
  draw();
}

// ---------------- DECIDIR ----------------
async function viewDecidir(v, it, args, alive) {
  const d = await api(`/api/carpeta?path=${encQ(S.cfg.sistema.decidir)}&recursive=1`);
  if (!alive()) return;
  setCrumbs([['Te toca decidir']]);
  const pend = n => !n.data.estado || String(n.data.estado).toLowerCase() === 'pendiente';
  const modo = args[0] === 'respondidas' ? 'respondidas' : 'pendientes';
  const list = d.notas.filter(n => (modo === 'pendientes' ? pend(n) : !pend(n)))
    .sort((a, b) => String(b.data.respondido || b.data.creado || '').localeCompare(String(a.data.respondido || a.data.creado || '')));
  const nP = d.notas.filter(pend).length;
  let html = hero(it, 'Te toca decidir', 'Lo que la IA no hace sin tu OK. Tu respuesta queda en la nota para que el agente la lea.')
    + `<div class="chips"><a class="chip ${modo === 'pendientes' ? 'on' : ''}" href="#decidir">Pendientes <span class="c">${nP}</span></a><a class="chip ${modo === 'respondidas' ? 'on' : ''}" href="#decidir/respondidas">Respondidas <span class="c">${d.notas.length - nP}</span></a></div>`;
  if (!list.length) html += `<div class="panel empty"><b>${modo === 'pendientes' ? 'Todo decidido' : 'Aún no has respondido nada'}</b>${modo === 'pendientes' ? 'No hay nada esperando tu OK.' : ''}</div>`;
  else {
    const full = await Promise.all(list.map(n => api(`/api/note?path=${encQ(n.path)}`).catch(() => ({ ...n, body: n.excerpt }))));
    if (!alive()) return;
    html += `<div class="dcards">${full.map(n => {
      const st = String(n.data.estado || 'pendiente').toLowerCase();
      const cls = st === 'aprobado' ? 'st-ok' : st === 'rechazado' ? 'st-err' : '';
      return `<article class="panel dcard ${cls}">
        <div class="dm">${n.data.seccion ? `<span class="tag">${esc(n.data.seccion)}</span>` : ''}<span>${esc(n.data.agente || 'IA')}</span>${n.data.creado ? `<span>· ${esc(fmtCorto(fechaDe(n.data.creado)))} ${esc(String(n.data.creado).slice(11, 16))}</span>` : ''}${!pend(n) ? `<span class="pill ${STATE_COLORS[st] || 'c-mut'}">${esc(cap(st))}</span>` : ''}</div>
        <h3><button class="linklike" data-note="${esc(n.path)}">${esc(n.name)}</button></h3>
        <div class="md">${md(n.body)}</div>
        ${pend(n) ? `<textarea class="field" placeholder="Tu respuesta (opcional)" data-resp></textarea>
        <div class="da"><button class="btn acc" data-decide="aprobado" data-path="${esc(n.path)}">${ic('check')} Aprobar</button><button class="btn" data-decide="rechazado" data-path="${esc(n.path)}">${ic('x')} Rechazar</button></div>`
        : n.data.respuesta ? `<div class="resp"><span class="mut">Tu respuesta:</span> ${esc(n.data.respuesta)}</div>` : ''}
      </article>`;
    }).join('')}</div>`;
  }
  v.innerHTML = html;
  mountView(v, it);
  $('.dcards', v)?.addEventListener('click', async e => {
    const b = e.target.closest('[data-decide]'); if (!b) return;
    const card = b.closest('.dcard');
    const respuesta = card.querySelector('[data-resp]')?.value.trim() || '';
    const now = new Date();
    card.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try {
      await api(`/api/note?path=${encQ(b.dataset.path)}`, { method: 'PATCH', body: { campos: { estado: b.dataset.decide, respondido: `${isoDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`, respuesta } } });
      toast(b.dataset.decide === 'aprobado' ? 'Aprobado' : 'Rechazado');
      await refresh();
    } catch (er) { toast(er.message); card.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
  });
}

// ---------------- APRENDIDO ----------------
async function viewAprendido(v, it, _args, alive) {
  const d = await api(`/api/carpeta?path=${encQ(S.cfg.sistema.aprendido)}&recursive=1`);
  if (!alive()) return;
  setCrumbs([['Lo aprendido']]);
  const list = [...d.notas].sort((a, b) => String(b.data.fecha || '').localeCompare(String(a.data.fecha || '')));
  v.innerHTML = hero(it, 'Lo aprendido', 'Lecciones que el sistema no debe olvidar. Una nota por lección.')
    + (list.length ? `<div class="grid">${list.map(n => `<button class="panel fcard" data-note="${esc(n.path)}"><span class="fh">${ic('aprendido')}${esc(n.name)}</span><span class="fx">${esc(n.excerpt)}</span><span class="fd">${n.data.seccion ? `<span class="tag">${esc(n.data.seccion)}</span> ` : ''}${esc(fmtCorto(fechaDe(n.data.fecha)))}</span></button>`).join('')}</div>`
      : `<div class="panel empty"><b>Sin lecciones todavía</b>Crea notas en <code>${esc(S.cfg.sistema.aprendido)}/</code>.</div>`);
  mountView(v, it);
}

// ---------------- AJUSTES: elegir el pixel art de cada sección ----------------
async function viewAjustes(v, alive) {
  setCrumbs([['Ajustes']]);
  let galeria = await api('/api/portadas');
  if (!alive()) return;
  let sel = S.items.some(i => i.id === S.route.args[0]) ? S.route.args[0] : store.get('ajSel', S.items[0].id);
  if (!S.items.some(i => i.id === sel)) sel = S.items[0].id;
  const prefs = () => JSON.parse(JSON.stringify(S.cfg.prefs || { portadas: {}, fondo: {} }));
  async function save(mut, msg) {
    const p = prefs(); p.portadas ||= {}; p.fondo ||= {};
    mut(p);
    try {
      await api('/api/preferencias', { method: 'PUT', body: p });
      await reloadConfig();
      if (msg) toast(msg);
      draw();
    } catch (e) { toast(e.message); }
  }
  async function upload(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return toast('Usa PNG, JPG, WEBP o GIF');
    if (file.size > 15e6) return toast('La imagen pesa más de 15 MB');
    toast('Subiendo…');
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const { archivo } = await api('/api/portadas', { method: 'POST', body: { nombre: file.name, data } });
      galeria = await api('/api/portadas');
      await save(p => { p.portadas[sel] = { imagen: archivo }; }, 'Imagen subida y aplicada');
    } catch (e) { toast(e.message); }
  }
  function draw() {
    const it = S.items.find(i => i.id === sel);
    const pref = S.cfg.prefs?.portadas?.[sel];
    const f = S.cfg.prefs?.fondo || {};
    const curScene = pref?.imagen ? null : (it.portadaUrl ? null : it.escena);
    const curImg = pref?.imagen || null;
    const seed = hashStr(it.id);
    const origen = pref?.imagen ? 'Tu imagen' : pref?.escena ? `Escena: ${SCENE_NAMES[it.escena] || it.escena}` : it.portadaUrl ? 'portada del vault' : `Escena por defecto: ${SCENE_NAMES[it.escena] || it.escena}`;
    v.innerHTML = `
      <section class="hero">${cover(it)}<div class="hero-tx"><h1>Ajustes</h1><p>Elige el pixel art de cada sección y cuánto se nota el fondo de cristal.</p></div></section>
      <div class="chips" id="aj-items">${S.items.map(i => `<button class="chip ${i.id === sel ? 'on' : ''}" data-sel="${i.id}">${esc(i.corto)}</button>`).join('')}</div>
      <div class="aj-top">
        <div class="aj-prev">${cover(it)}<span class="badge">${esc(origen)}</span><h2 class="ttl">${esc(it.nombre)}</h2></div>
        <div class="panel aj-side">
          <h3>Fondo y transparencias</h3>
          <label><span>Intensidad del fondo <b id="v-amb">${f.intensidad ?? 80}%</b></span><input type="range" id="r-amb" min="0" max="100" value="${f.intensidad ?? 80}"></label>
          <label><span>Desenfoque del cristal <b id="v-glass">${f.cristal ?? 22}px</b></span><input type="range" id="r-glass" min="0" max="40" value="${f.cristal ?? 22}"></label>
          <button class="btn" id="aj-reset" ${pref ? '' : 'disabled'}>Volver a la portada por defecto</button>
          <p class="tip">Las imágenes se guardan en la carpeta <code>portadas/</code> del panel. Funcionan GIF animados y pixel art pequeño (se escala sin suavizar).</p>
        </div>
      </div>
      <div class="sec-h"><h2>Escenas animadas</h2><span class="mut">Pixel art hecho con código, se mueve solo</span></div>
      <div class="aj-grid">${Scenes.types.map(t => `<button class="aj-opt ${curScene === t ? 'on' : ''}" data-escena="${t}" aria-pressed="${curScene === t}">
          <canvas data-scene="${t}" data-seed="${seed}"></canvas><span>${esc(SCENE_NAMES[t] || t)}${t === it.escenaBase ? ' · por defecto' : ''}</span>${curScene === t ? `<i class="ok-badge">${ic('check')}</i>` : ''}</button>`).join('')}</div>
      <div class="sec-h"><h2>Tus imágenes</h2><span class="mut">PNG, JPG, WEBP o GIF animado · hasta 15 MB · también puedes arrastrarlas aquí</span></div>
      <div class="aj-grid" id="aj-gal">
        <label class="aj-opt aj-up" id="aj-drop"><input type="file" id="aj-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden><span style="position:static">${ic('upload')}Subir imagen</span></label>
        ${galeria.map(a => `<div class="aj-opt ${curImg === a ? 'on' : ''}" data-imagen="${esc(a)}" role="button" tabindex="0">
          <img src="/portadas/${encQ(a)}" alt="" loading="lazy" ${IMG_PX}><span>${esc(a)}</span>
          ${curImg === a ? `<i class="ok-badge">${ic('check')}</i>` : ''}<button class="aj-del" data-del="${esc(a)}" title="Borrar imagen" aria-label="Borrar ${esc(a)}">${ic('trash')}</button></div>`).join('')}
      </div>`;
    Scenes.hydrate(v);
    setAmbient(it);
    store.set('ajSel', sel);
  }
  draw();
  // eventos (se registran una vez; el contenido se redibuja dentro de v)
  const onClick = async e => {
    if (S.route.name !== 'ajustes') return;
    const t = e.target;
    const s = t.closest('[data-sel]'); if (s) { sel = s.dataset.sel; return draw(); }
    const del = t.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      if (!confirm(`¿Borrar la imagen "${del.dataset.del}"? Las secciones que la usen volverán a su escena.`)) return;
      try { await api(`/api/portadas?archivo=${encQ(del.dataset.del)}`, { method: 'DELETE' }); galeria = await api('/api/portadas'); await reloadConfig(); toast('Imagen borrada'); draw(); } catch (er) { toast(er.message); }
      return;
    }
    const es = t.closest('[data-escena]'); if (es) return save(p => { p.portadas[sel] = { escena: es.dataset.escena }; }, 'Escena aplicada');
    const im = t.closest('[data-imagen]'); if (im) return save(p => { p.portadas[sel] = { imagen: im.dataset.imagen }; }, 'Imagen aplicada');
    if (t.closest('#aj-reset')) return save(p => { delete p.portadas[sel]; }, 'Portada por defecto');
  };
  const onInput = e => {
    if (e.target.id === 'r-amb') { document.documentElement.style.setProperty('--amb', String(e.target.value / 100 * 1.05)); $('#v-amb').textContent = e.target.value + '%'; }
    if (e.target.id === 'r-glass') { document.documentElement.style.setProperty('--glass', e.target.value + 'px'); $('#v-glass').textContent = e.target.value + 'px'; }
  };
  const onChange = e => {
    if (e.target.id === 'r-amb' || e.target.id === 'r-glass') {
      save(p => { p.fondo.intensidad = +$('#r-amb').value; p.fondo.cristal = +$('#r-glass').value; }, 'Fondo guardado');
    }
    if (e.target.id === 'aj-file') upload(e.target.files[0]);
  };
  const onDrag = e => {
    const zone = e.target.closest?.('#aj-gal'); if (!zone) return;
    e.preventDefault();
    $('#aj-drop')?.classList.toggle('drag', e.type === 'dragover');
    if (e.type === 'drop') upload(e.dataTransfer.files[0]);
  };
  // limpiar oyentes anteriores de esta vista
  if (v._aj) for (const [ev, fn] of v._aj) v.removeEventListener(ev, fn);
  v._aj = [['click', onClick], ['input', onInput], ['change', onChange], ['dragover', onDrag], ['dragleave', onDrag], ['drop', onDrag]];
  for (const [ev, fn] of v._aj) v.addEventListener(ev, fn);
}

// ---------------- panel lateral de notas ----------------
const obsUrl = p => `obsidian://open?vault=${encQ(S.cfg.vault)}&file=${encQ(p.replace(/\.md$/i, ''))}`;
function showDrawer(html, quiet = false) {
  const d = $('#drawer');
  const was = d.classList.contains('open');
  d.innerHTML = `<div class="scrim" data-close></div><aside class="sheet${quiet || was ? ' quiet' : ''}" role="dialog" aria-modal="true">${html}</aside>`;
  d.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  const d = $('#drawer');
  if (!d.classList.contains('open')) return;
  d.classList.remove('open'); d.innerHTML = '';
  S.editing = false; S.note = null;
  document.body.style.overflow = '';
}
const props = data => {
  const e = Object.entries(data || {});
  return e.length ? `<dl class="props panel">${e.map(([k, v]) => `<dt>${esc(labelProp(k))}</dt><dd>${cell(v, k)}</dd>`).join('')}</dl>` : '';
};
async function openNote(path, { edit = false, nota = null } = {}) {
  try {
    const n = nota || await api(`/api/note?path=${encQ(path)}`);
    S.note = n;
    const head = `<div class="sheet-h"><span class="path">${esc(n.path)}</span><span class="acts">${n.nuevo ? '' : `<a class="btn" href="${obsUrl(n.path)}" title="Abrir en Obsidian">${ic('ext')} Obsidian</a>`}${edit ? '' : `<button class="btn" data-edit>${ic('edit')} Editar</button>`}${n.nuevo || edit ? '' : `<button class="btn icon" data-borrar title="Mover a la papelera" aria-label="Borrar nota">${ic('trash')}</button>`}<button class="btn icon" data-close aria-label="Cerrar">${ic('x')}</button></span></div>`;
    if (edit) {
      S.editing = true;
      showDrawer(`${head}<h1 class="note-t">${esc(n.name)}</h1><textarea class="editor" id="ed" spellcheck="false">${esc(n.raw)}</textarea><div class="ed-acts"><button class="btn acc" data-save>Guardar</button><button class="btn" data-cancel>Cancelar</button><small>Ctrl+S para guardar · se escribe directamente en tu vault</small></div>`);
      $('#ed').focus();
    } else {
      S.editing = false;
      showDrawer(`${head}<h1 class="note-t">${esc(n.name)}</h1>${props(n.data)}<article class="md">${mdDoc(n.body) || '<p class="dim">Nota sin contenido. Pulsa Editar para escribir.</p>'}</article>`);
    }
  } catch (e) { toast(e.message); }
}
async function saveNote() {
  if (!S.note) return;
  try {
    await api(`/api/note?path=${encQ(S.note.path)}`, { method: 'PUT', body: { raw: $('#ed').value } });
    toast('Guardado en el vault');
    S.editing = false;
    await openNote(S.note.path);
  } catch (e) { toast(e.message); }
}
async function openDiario(fecha) {
  try {
    const d = await api(`/api/diario?fecha=${fecha || S.ov.hoy}`);
    if (d.nuevo) openNote(d.path, { edit: true, nota: d }); else openNote(d.path);
  } catch (e) { toast(e.message); }
}

// ---------------- refresco en vivo ----------------
let refreshing = null;
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      await loadOverview();
      // si estás escribiendo en el panel (nota, reporte, peso…), no redibujes debajo de tus dedos
      const ae = document.activeElement;
      const escribiendo = ae && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName) && $('#view').contains(ae);
      if (S.editing || escribiendo || $('#modal').classList.contains('open')) { renderDock(); renderWeek(); return; }
      const y = window.scrollY;
      const notePath = S.note && !S.note.nuevo ? S.note.path : null;
      await render(true);
      window.scrollTo(0, y);
      if (notePath && $('#drawer').classList.contains('open')) {
        const sc = $('#drawer .sheet')?.scrollTop || 0;
        await openNote(notePath);
        const sh = $('#drawer .sheet'); if (sh) sh.scrollTop = sc;
      }
    } catch { /* servidor reiniciándose */ } finally { refreshing = null; }
  })();
  return refreshing;
}
function live() {
  let tm;
  const es = new EventSource('/api/events');
  es.addEventListener('cambio', () => { clearTimeout(tm); tm = setTimeout(refresh, 500); });
}

// ---------------- eventos globales ----------------
function bindGlobal() {
  window.addEventListener('hashchange', () => render());
  $('#btn-refresh').innerHTML = ic('refresh');
  $('#btn-ajustes').innerHTML = ic('ajustes');
  $('#btn-refresh').addEventListener('click', async e => {
    const b = e.currentTarget; b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    await refresh(); toast('Actualizado');
  });
  $('#btn-diario').addEventListener('click', () => openDiario());
  document.addEventListener('click', async e => {
    const t = e.target;
    const go1 = t.closest('[data-go]'); if (go1) { go(go1.dataset.go); return; }
    const day = t.closest('[data-day]'); if (day) { go('tareas', day.dataset.day); return; }
    const di = t.closest('[data-diario]'); if (di) { openDiario(di.dataset.diario); return; }
    const w = t.closest('[data-wiki]');
    if (w) {
      e.preventDefault();
      try { const r = await api(`/api/resolver?nombre=${encQ(w.dataset.wiki)}`); openNote(r.path); } catch { toast('No encuentro esa nota'); }
      return;
    }
    if (t.closest('#drawer')) {
      if (t.closest('[data-close]')) return closeDrawer();
      if (t.closest('[data-edit]')) return openNote(S.note.path, { edit: true, nota: S.note.nuevo ? S.note : null });
      if (t.closest('[data-cancel]')) return S.note.nuevo ? closeDrawer() : openNote(S.note.path);
      if (t.closest('[data-save]')) return saveNote();
      if (t.closest('[data-borrar]')) {
        if (!confirm(`¿Mover "${S.note.name}" a la papelera de Obsidian (.trash)? Puedes recuperarla desde ahí.`)) return;
        try { await api(`/api/note?path=${encQ(S.note.path)}`, { method: 'DELETE' }); closeDrawer(); toast('Nota movida a la papelera'); await refresh(); } catch (er) { toast(er.message); }
        return;
      }
      const cb = t.closest('.cb[data-n]');
      if (cb && S.note && !S.note.nuevo) {
        cb.classList.toggle('on'); cb.closest('li')?.classList.toggle('done');
        try { await api('/api/check', { method: 'POST', body: { path: S.note.path, n: +cb.dataset.n } }); } catch (er) { toast(er.message); }
        return;
      }
      return;
    }
    if (t.closest('#modal')) return;
    const n = t.closest('[data-note]');
    if (n && !t.closest('[data-toggle],[data-noopen]')) openNote(n.dataset.note);
  });
  $('#btn-crear').innerHTML = ic('plus');
  $('#btn-crear').addEventListener('click', () => crearRapido());
  window.addEventListener('resize', () => { clearTimeout(S.rz); S.rz = setTimeout(renderDock, 120); });
  document.addEventListener('keydown', e => {
    if ($('#modal').classList.contains('open')) { if (e.key === 'Escape') closeModal(); return; }
    const open = $('#drawer').classList.contains('open');
    if (open && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.editing) { e.preventDefault(); saveNote(); return; }
    if (e.key === 'Escape' && open) { if (!S.editing || confirm('¿Cerrar sin guardar?')) closeDrawer(); return; }
    if (open || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
    if (S.route.name === 'inicio' && $('#car')) {
      if (e.key === 'ArrowRight') moveSlide(1);
      else if (e.key === 'ArrowLeft') moveSlide(-1);
      else if (e.key === 'Enter' && document.activeElement === document.body) go(S.items[S.slide].id);
    }
  });
}

async function init() {
  try {
    S.cfg = await api('/api/config');
    buildItems();
    await loadOverview();
  } catch (e) {
    $('#view').innerHTML = `<div class="panel empty"><b>No puedo hablar con el servidor</b>${esc(e.message)}<br>¿Está corriendo <code>node server.mjs</code>?</div>`;
    return;
  }
  tickClock(); setInterval(tickClock, 1000);
  bindGlobal();
  await render();
  live();
}
init();
