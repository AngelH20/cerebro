// HQ · servidor local que lee tu vault de Obsidian y sirve el panel.
// Sin dependencias: solo Node 18+.  Arranque: node server.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(await fs.readFile(path.join(ROOT, 'hq.config.json'), 'utf8'));
const VAULT = path.resolve(ROOT, process.env.HQ_VAULT || cfg.vault || './vault');
const PORT = Number(process.env.HQ_PORT || cfg.port || 4320);
const HOST = process.env.HQ_HOST || cfg.host || '127.0.0.1';
const PUBLIC = path.join(ROOT, 'public');
const PORTADAS = path.join(ROOT, 'portadas');
const PREFS_FILE = path.join(ROOT, 'hq.preferencias.json');
const SIS = {
  tareas: 'Tareas', decidir: 'Sistema/Decidir', aprendido: 'Sistema/Aprendido',
  diario: 'Diario', registro: 'Sistema/maquina/registro-ia.jsonl', ...(cfg.sistema || {}),
};

if (!fss.existsSync(VAULT)) {
  console.error(`\n  No encuentro el vault en: ${VAULT}\n  Crea uno de ejemplo:  node scripts/crear-vault-ejemplo.mjs\n  o apunta "vault" en hq.config.json a tu vault de Obsidian.\n`);
  process.exit(1);
}

// ---------------- utilidades ----------------
const pad = n => String(n).padStart(2, '0');
const hoy = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ahora = (d = new Date()) => `${hoy(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toPosix = p => p.split(path.sep).join('/');
const rel = full => toPosix(path.relative(VAULT, full));
const parentOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = p => p.slice(p.lastIndexOf('/') + 1);
const inFolder = (n, folder) => !folder || n.folder === folder || n.folder.startsWith(folder + '/');
const fechaDe = v => (v == null ? '' : String(v).slice(0, 10));
const DONE = new Set(['hecha', 'hecho', 'completada', 'completado', 'done', 'true']);
const isDone = n => DONE.has(String(n.data.estado ?? n.data.hecha ?? '').toLowerCase());
const esPendiente = n => !n.data.estado || String(n.data.estado).toLowerCase() === 'pendiente';
const err = (status, msg) => Object.assign(new Error(msg), { status });

function safe(p) {
  const full = path.resolve(VAULT, String(p || '').replace(/^[\\/]+/, ''));
  if (full !== VAULT && !full.startsWith(VAULT + path.sep)) throw err(400, 'Ruta fuera del vault');
  return full;
}

// ---------------- frontmatter (YAML sencillo, el que usa Obsidian para propiedades) ----------------
function parseScalar(v) {
  v = v.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v.startsWith('"') && v.endsWith('"') && v.length > 1) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith("'") && v.endsWith("'") && v.length > 1) return v.slice(1, -1).replace(/''/g, "'");
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) return v.slice(1, -1).split(',').map(parseScalar).filter(x => x !== null);
  return v;
}
function parseYaml(src) {
  const out = {};
  let last = null;
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const li = raw.match(/^\s*-\s+(.*)$/);
    if (li && last) {
      if (!Array.isArray(out[last])) out[last] = [];
      out[last].push(parseScalar(li[1]));
      continue;
    }
    const kv = raw.match(/^([^:\s#][^:]*?):(?:\s+(.*)|\s*)$/);
    if (kv) { last = kv[1].trim(); out[last] = parseScalar(kv[2] || ''); }
  }
  return out;
}
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
function parseFrontmatter(text) {
  const m = text.match(FM_RE);
  if (!m) return { data: {}, body: text };
  return { data: parseYaml(m[1]), body: text.slice(m[0].length) };
}
function formatScalar(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(formatScalar).join(', ')}]`;
  const s = String(v).replace(/\r?\n/g, ' ');
  return /[:#[\]{}"',&*!|>%@`]|^\s|\s$|^(true|false|null|-?\d+(\.\d+)?)$/.test(s) ? JSON.stringify(s) : s;
}
function setFields(text, fields) {
  const m = text.match(FM_RE);
  const lines = m ? m[1].split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(fields)) {
    if (!/^[\p{L}\p{N}_ -]+$/u.test(k)) throw err(400, `Propiedad no válida: ${k}`);
    const line = `${k}: ${formatScalar(v)}`.trimEnd();
    const i = lines.findIndex(l => l.replace(/:.*$/, '').trim() === k && l.includes(':'));
    if (i >= 0) {
      let j = i + 1;
      while (j < lines.length && /^\s*-\s/.test(lines[j])) j++;
      lines.splice(i, j - i, line);
    } else lines.push(line);
  }
  const body = m ? text.slice(m[0].length) : text;
  return `---\n${lines.join('\n')}\n---\n${body}`;
}
// casillas "- [ ] / - [x]" fuera de bloques de código (mismo orden que las pinta el panel)
const TASK_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/;
function taskLines(lines) {
  const out = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l.replace(/^(\s*>\s?)+/, ''))) { fence = !fence; return; }
    if (!fence && TASK_RE.test(l)) out.push(i);
  });
  return out;
}
function checksDe(body) {
  const lines = body.split('\n');
  const idx = taskLines(lines);
  return idx.length ? [idx.filter(i => /[xX]/.test(lines[i].match(TASK_RE)[2])).length, idx.length] : null;
}
const excerpt = body => body
  .replace(/```[\s\S]*?```/g, '')
  .split(/\r?\n/)
  .map(l => l.replace(/^#+\s*|^>\s*|^\s*[-*+]\s+(\[.\]\s*)?|^\s*\d+\.\s+/g, '').trim())
  .filter(Boolean).join(' ')
  .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)
  .replace(/[*_`=]/g, '')
  .slice(0, 260);

// ---------------- índice del vault ----------------
const IGNORE = new Set(['.obsidian', '.git', '.trash', 'node_modules', '.claude', '.github']);
let index = null;
let building = null;
let dirty = true;

async function buildIndex() {
  const out = { notes: [], dirs: [], files: [] };
  async function walk(dir) {
    let ents;
    try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { out.dirs.push(rel(full)); await walk(full); }
      else if (e.name.toLowerCase().endsWith('.md')) {
        try {
          const [txt, st] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)]);
          const { data, body } = parseFrontmatter(txt);
          out.notes.push({ path: rel(full), name: e.name.slice(0, -3), folder: rel(dir), data, excerpt: excerpt(body), checks: checksDe(body), mtime: st.mtimeMs });
        } catch { /* archivo en uso: se reintenta en el siguiente cambio */ }
      } else out.files.push(rel(full));
    }
  }
  await walk(VAULT);
  return out;
}
function getIndex() {
  if (!dirty && index) return Promise.resolve(index);
  if (!building) {
    dirty = false;
    building = buildIndex().then(r => { index = r; building = null; return r; }, e => { building = null; dirty = true; throw e; });
  }
  return building;
}

// ---------------- cambios en vivo (SSE) ----------------
const clients = new Set();
function broadcast() { for (const c of clients) c.write(`event: cambio\ndata: ${Date.now()}\n\n`); }
let bcTimer = null;
try {
  fss.watch(VAULT, { recursive: true }, (_ev, f) => {
    if (f && /(^|[\\/])\.(obsidian|git|trash)([\\/]|$)/.test(f)) return;
    dirty = true;
    clearTimeout(bcTimer);
    bcTimer = setTimeout(broadcast, 400);
  });
} catch (e) {
  console.warn('Sin vigilancia de cambios en vivo:', e.message);
  setInterval(() => { dirty = true; }, 5000);
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000);

// ---------------- registro de la IA ----------------
async function leerRegistro() {
  try {
    const txt = await fs.readFile(safe(SIS.registro), 'utf8');
    return txt.split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
async function registrar(e) {
  const d = new Date();
  const entry = {
    fecha: e.fecha || `${hoy(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    estado: e.estado || 'hecho', seccion: e.seccion || 'General', subseccion: e.subseccion || '',
    agente: e.agente || 'IA', texto: String(e.texto || '').trim(),
  };
  if (!entry.texto) throw err(400, 'Falta el texto');
  const f = safe(SIS.registro);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.appendFile(f, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

// ---------------- preferencias del panel (portadas, fondo) ----------------
// Se guardan fuera del vault: son del panel, no de tus notas.
const IMG_RE = /^[\w.-]+\.(png|jpe?g|gif|webp)$/i;
async function leerPrefs() {
  try { return JSON.parse(await fs.readFile(PREFS_FILE, 'utf8')); } catch { return { portadas: {}, fondo: {} }; }
}
async function listarPortadas() {
  try {
    const ents = await fs.readdir(PORTADAS, { withFileTypes: true });
    const out = [];
    for (const e of ents) if (e.isFile() && IMG_RE.test(e.name)) out.push({ archivo: e.name, mtime: (await fs.stat(path.join(PORTADAS, e.name))).mtimeMs });
    return out.sort((a, b) => b.mtime - a.mtime).map(x => x.archivo);
  } catch { return []; }
}
async function guardarPrefs(b) {
  const galeria = new Set(await listarPortadas());
  const portadas = {};
  for (const [id, v] of Object.entries(b.portadas || {})) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !v) continue;
    if (typeof v.imagen === 'string' && galeria.has(v.imagen)) portadas[id] = { imagen: v.imagen };
    else if (typeof v.escena === 'string' && /^[a-z]{1,30}$/.test(v.escena)) portadas[id] = { escena: v.escena };
  }
  const num = (x, lo, hi, d) => (typeof x === 'number' && x >= lo && x <= hi ? x : d);
  const fondo = { intensidad: num(b.fondo?.intensidad, 0, 100, 80), cristal: num(b.fondo?.cristal, 0, 40, 22) };
  const hojas = {};
  for (const [id, lista] of Object.entries(b.hojas || {})) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !Array.isArray(lista)) continue;
    hojas[id] = lista.filter(h => { try { csvUrl(h.url); return true; } catch { return false; } })
      .slice(0, 20).map(h => ({ nombre: String(h.nombre || 'Hoja').slice(0, 60), url: String(h.url) }));
  }
  const prefs = { portadas, fondo, hojas };
  await fs.writeFile(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8');
  return prefs;
}
async function subirPortada({ nombre, data }) {
  const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) throw err(400, 'Formato no admitido: usa PNG, JPG, WEBP o GIF');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 15e6) throw err(413, 'La imagen pesa más de 15 MB');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const base = String(nombre || 'imagen').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'imagen';
  await fs.mkdir(PORTADAS, { recursive: true });
  let archivo = `${base}.${ext}`;
  for (let i = 2; fss.existsSync(path.join(PORTADAS, archivo)); i++) archivo = `${base}-${i}.${ext}`;
  await fs.writeFile(path.join(PORTADAS, archivo), buf);
  return { archivo };
}
async function borrarPortada(archivo) {
  if (!IMG_RE.test(archivo || '')) throw err(400, 'Archivo no válido');
  await fs.unlink(path.join(PORTADAS, archivo));
  const p = await leerPrefs();
  for (const [id, v] of Object.entries(p.portadas || {})) if (v.imagen === archivo) delete p.portadas[id];
  await guardarPrefs(p);
  return { ok: true };
}

// ---------------- Google Sheets (hoja compartida "cualquiera con el enlace puede ver") ----------------
function csvUrl(u) {
  let url;
  try { url = new URL(String(u)); } catch { throw err(400, 'Enlace no válido'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/')) throw err(400, 'Solo se admiten enlaces de Google Sheets');
  const gid = ((url.hash + url.search).match(/gid=(\d+)/) || [])[1];
  let m = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (m) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  m = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (!m) throw err(400, 'No encuentro el ID de la hoja en el enlace');
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}
function parseCSV(txt) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const hojaCache = new Map();
async function leerHoja(u, forzar) {
  const csv = csvUrl(u);
  const c = hojaCache.get(csv);
  if (c && !forzar && Date.now() - c.t < 60000) return c.data;
  const priv = 'No puedo leer la hoja: en Sheets pulsa Compartir → "Cualquier persona con el enlace" → Lector.';
  let r;
  try { r = await fetch(csv, { redirect: 'follow', headers: { 'User-Agent': 'hq-panel' }, signal: AbortSignal.timeout(20000) }); } catch { throw err(502, 'No hay conexión con Google Sheets'); }
  if (!r.ok) throw err(502, [401, 403, 404].includes(r.status) ? priv : `Google respondió ${r.status}`);
  const txt = await r.text();
  if (/text\/html/.test(r.headers.get('content-type') || '') || /^\s*<!doctype html/i.test(txt)) throw err(502, priv);
  const data = { filas: parseCSV(txt), leido: Date.now() };
  hojaCache.set(csv, { t: Date.now(), data });
  return data;
}

// ---------------- correo (script IMAP, ver scripts/importar-correo.py) ----------------
const CUENTAS_F = path.join(ROOT, 'cuentas-correo.json');
async function cuentasCorreo() {
  try {
    const c = JSON.parse(await fs.readFile(CUENTAS_F, 'utf8'));
    return { configurado: true, cuentas: (c.cuentas || []).map(x => ({ nombre: x.nombre, email: x.email, lista: !!x.password_app && !/^x+$/i.test(String(x.password_app).replace(/\s/g, '')) })) };
  } catch { return { configurado: false, cuentas: [] }; }
}
let importando = null;
function importarCorreo() {
  if (importando) return importando;
  importando = new Promise(resolve => {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    execFile(py, [path.join(ROOT, 'scripts', 'importar-correo.py')], { cwd: ROOT, timeout: 10 * 60e3, windowsHide: true, maxBuffer: 4e6 }, (e, out, errOut) => {
      resolve({ ok: !e, salida: String(out || '').trim().split('\n').slice(-15).join('\n'), error: e ? String(errOut || e.message).trim().split('\n').slice(-6).join('\n') : null });
    });
  }).finally(() => { importando = null; dirty = true; });
  return importando;
}

// ---------------- crear, borrar, marcar casillas ----------------
async function crearNota({ carpeta, titulo, campos, cuerpo }) {
  const folder = String(carpeta || '').replace(/^[\\/]+|[\\/]+$/g, '');
  safe(folder);
  const nombre = nombreArchivo(titulo || '');
  if (!nombre) throw err(400, 'Falta el título');
  const base = folder ? `${folder}/` : '';
  let p = `${base}${nombre}.md`;
  for (let i = 2; fss.existsSync(safe(p)); i++) p = `${base}${nombre} ${i}.md`;
  const limpios = Object.fromEntries(Object.entries(campos || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  const fm = Object.keys(limpios).length ? setFields('', limpios) + '\n' : '';
  return escribir(p, fm + (cuerpo ? String(cuerpo).trim() + '\n' : ''));
}
async function crearCarpeta({ padre, nombre }) {
  const n = nombreArchivo(nombre || '');
  if (!n) throw err(400, 'Falta el nombre de la carpeta');
  const p = [String(padre || '').replace(/^[\\/]+|[\\/]+$/g, ''), n].filter(Boolean).join('/');
  await fs.mkdir(safe(p), { recursive: true });
  dirty = true;
  return { ok: true, path: p };
}
async function borrarNota(p) {
  const full = safe(p);
  if (!full.toLowerCase().endsWith('.md')) throw err(400, 'Solo notas .md');
  const trash = path.join(VAULT, '.trash');
  await fs.mkdir(trash, { recursive: true });
  let dest = path.join(trash, path.basename(full));
  for (let i = 2; fss.existsSync(dest); i++) dest = path.join(trash, `${path.basename(full, '.md')} ${i}.md`);
  await fs.rename(full, dest);
  dirty = true;
  return { ok: true };
}
async function marcarCasilla(p, n) {
  const full = safe(p);
  const raw = await fs.readFile(full, 'utf8');
  const m = raw.match(FM_RE);
  const head = m ? m[0] : '';
  const lines = raw.slice(head.length).split('\n');
  const i = taskLines(lines)[Number(n)];
  if (i === undefined) throw err(404, 'No encuentro esa casilla');
  lines[i] = lines[i].replace(TASK_RE, (_, a, x, b) => a + (x === ' ' ? 'x' : ' ') + b);
  return escribir(rel(full), head + lines.join('\n'));
}

// ---------------- vistas de datos ----------------
async function config() {
  const idx = await getIndex();
  const portada = folder => idx.files.find(f => parentOf(f) === folder && /^portada\.(png|jpe?g|gif|webp)$/i.test(baseOf(f))) || null;
  return {
    nombre: cfg.nombre || 'HQ', vault: path.basename(VAULT), moneda: cfg.moneda || 'ARS', locale: cfg.locale || 'es-AR', sistema: SIS,
    secciones: (cfg.secciones || []).map(s => ({ ...s, portada: portada(s.carpeta) })),
    portadas: { tareas: portada(SIS.tareas), decidir: portada(SIS.decidir), aprendido: portada(SIS.aprendido), ia: portada(parentOf(SIS.registro)) },
    prefs: await leerPrefs(),
  };
}

async function overview() {
  const idx = await getIndex();
  const today = hoy();
  const pend = idx.notes.filter(n => inFolder(n, SIS.tareas) && !isDone(n));
  const semana = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const f = hoy(d);
    return { fecha: f, pendientes: pend.filter(t => fechaDe(t.data.fecha) === f).length };
  });
  const porHacer = pend.filter(t => { const f = fechaDe(t.data.fecha); return !f || f <= today; }).length;
  const decidir = idx.notes.filter(n => inFolder(n, SIS.decidir) && esPendiente(n)).length;
  const reg = await leerRegistro();
  const iaHoy = reg.filter(e => String(e.fecha).slice(0, 10) === today).length;
  const aprendido = idx.notes.filter(n => inFolder(n, SIS.aprendido)).length;
  const badges = { tareas: `${porHacer} por hacer`, ia: `${iaHoy} hoy`, decidir: `${decidir} esperan`, aprendido: `${aprendido} lecciones` };
  for (const s of cfg.secciones || []) {
    const ns = idx.notes.filter(n => inFolder(n, s.carpeta));
    if (s.tipo === 'bandeja') badges[s.id] = `${ns.filter(n => String(n.data.estado).toLowerCase() === 'importante').length} importantes`;
    else badges[s.id] = `${ns.length} notas`;
  }
  return { hoy: today, semana, porHacer, decidir, iaHoy, badges, numeros: { tareas: porHacer, decidir } };
}

async function carpeta(folder, recursive) {
  const idx = await getIndex();
  folder = String(folder || '').replace(/^\/+|\/+$/g, '');
  safe(folder);
  if (folder && !idx.dirs.includes(folder)) return { folder, existe: false, subcarpetas: [], notas: [], archivos: [] };
  const subcarpetas = idx.dirs.filter(d => parentOf(d) === folder)
    .map(d => ({ path: d, nombre: baseOf(d), notas: idx.notes.filter(n => inFolder(n, d)).length }));
  const notas = idx.notes.filter(n => (recursive ? inFolder(n, folder) : n.folder === folder));
  const archivos = idx.files.filter(f => parentOf(f) === folder);
  return { folder, existe: true, subcarpetas, notas, archivos };
}

async function nota(p) {
  const full = safe(p);
  const [raw, st] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)]);
  const { data, body } = parseFrontmatter(raw);
  return { path: rel(full), name: path.basename(full, '.md'), data, body, raw, mtime: st.mtimeMs };
}

async function escribir(p, raw) {
  const full = safe(p);
  if (!full.toLowerCase().endsWith('.md')) throw err(400, 'Solo se pueden escribir notas .md');
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, String(raw), 'utf8');
  dirty = true;
  return { ok: true, path: rel(full) };
}

const nombreArchivo = s => String(s).replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);

async function crearTarea({ titulo, fecha, seccion, prioridad }) {
  const nombre = nombreArchivo(titulo || '');
  if (!nombre) throw err(400, 'La tarea necesita un título');
  let p = `${SIS.tareas}/${nombre}.md`;
  for (let i = 2; fss.existsSync(safe(p)); i++) p = `${SIS.tareas}/${nombre} ${i}.md`;
  const raw = setFields('', {
    estado: 'pendiente', fecha: /^\d{4}-\d\d-\d\d$/.test(fecha || '') ? fecha : hoy(),
    seccion: seccion || '', prioridad: prioridad || 'normal', creado: ahora(),
  });
  return escribir(p, raw + '\n');
}

async function diario(fecha) {
  if (!/^\d{4}-\d\d-\d\d$/.test(fecha || '')) fecha = hoy();
  const p = `${SIS.diario}/${fecha}.md`;
  if (fss.existsSync(safe(p))) return nota(p);
  const [y, m, d] = fecha.split('-').map(Number);
  let titulo = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  const raw = `---\nfecha: ${fecha}\ntipo: diario\n---\n\n# ${titulo}\n\n## Lo importante\n- \n\n## Notas\n\n`;
  return { path: p, name: fecha, data: { fecha, tipo: 'diario' }, body: '', raw, nuevo: true };
}

// ---------------- HTTP ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};
const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

async function sendFile(res, full) {
  const st = await fs.stat(full);
  if (!st.isFile()) throw err(404, 'No encontrado');
  const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  fss.createReadStream(full).pipe(res);
}

function readBody(req, max = 5e6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > max) { reject(err(413, 'Demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(err(400, 'JSON no válido')); } });
    req.on('error', reject);
  });
}

// Solo se aceptan peticiones dirigidas a este equipo (o a tu dominio de Tailscale).
const HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ...(cfg.hostsPermitidos || []).map(h => h.toLowerCase())]);
const abierto = !['127.0.0.1', 'localhost', '::1'].includes(HOST);
function hostOk(req) {
  const h = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  return abierto || HOSTS.has(h) || h.endsWith('.ts.net');
}

const server = http.createServer(async (req, res) => {
  try {
    if (!hostOk(req)) return json(res, 403, { error: 'Host no permitido' });
    const url = new URL(req.url, 'http://local');
    const p = decodeURIComponent(url.pathname);
    const q = url.searchParams;
    const M = req.method;
    if (!['GET', 'HEAD'].includes(M) && !String(req.headers['content-type'] || '').includes('application/json')) {
      return json(res, 415, { error: 'Usa Content-Type: application/json' });
    }

    if (p.startsWith('/api/')) {
      const route = `${M} ${p}`;
      switch (route) {
        case 'GET /api/config': return json(res, 200, await config());
        case 'GET /api/overview': return json(res, 200, await overview());
        case 'GET /api/carpeta': return json(res, 200, await carpeta(q.get('path'), q.get('recursive') === '1'));
        case 'GET /api/note': return json(res, 200, await nota(q.get('path')));
        case 'PUT /api/note': { const b = await readBody(req); return json(res, 200, await escribir(q.get('path'), b.raw ?? '')); }
        case 'PATCH /api/note': {
          const b = await readBody(req);
          const full = safe(q.get('path'));
          const raw = await fs.readFile(full, 'utf8');
          return json(res, 200, await escribir(q.get('path'), setFields(raw, b.campos || {})));
        }
        case 'POST /api/tareas': return json(res, 201, await crearTarea(await readBody(req)));
        case 'GET /api/registro': return json(res, 200, await leerRegistro());
        case 'POST /api/registro': return json(res, 201, await registrar(await readBody(req)));
        case 'GET /api/diario': return json(res, 200, await diario(q.get('fecha')));
        case 'GET /api/json': { // datos de máquina en el vault (p. ej. historial de la rutina)
          const full = safe(q.get('path'));
          if (!full.toLowerCase().endsWith('.json')) throw err(400, 'Solo archivos .json');
          try { return json(res, 200, JSON.parse(await fs.readFile(full, 'utf8'))); } catch (e) { if (e.code === 'ENOENT') return json(res, 404, { error: 'No existe todavía' }); throw e; }
        }
        case 'PUT /api/json': {
          const full = safe(q.get('path'));
          if (!full.toLowerCase().endsWith('.json')) throw err(400, 'Solo archivos .json');
          const b = await readBody(req, 10e6);
          await fs.mkdir(path.dirname(full), { recursive: true });
          await fs.writeFile(full, JSON.stringify(b.data ?? null, null, 1), 'utf8');
          dirty = true;
          return json(res, 200, { ok: true });
        }
        case 'POST /api/nota': return json(res, 201, await crearNota(await readBody(req)));
        case 'DELETE /api/note': return json(res, 200, await borrarNota(q.get('path')));
        case 'POST /api/carpeta': return json(res, 201, await crearCarpeta(await readBody(req)));
        case 'GET /api/carpetas': { const idx = await getIndex(); return json(res, 200, idx.dirs.filter(d => !/(^|\/)\./.test(d)).sort((a, b) => a.localeCompare(b, 'es'))); }
        case 'POST /api/check': { const b = await readBody(req); return json(res, 200, await marcarCasilla(b.path, b.n)); }
        case 'GET /api/hoja': return json(res, 200, await leerHoja(q.get('url'), q.get('forzar') === '1'));
        case 'GET /api/correo/cuentas': return json(res, 200, await cuentasCorreo());
        case 'POST /api/correo/importar': return json(res, 200, await importarCorreo());
        case 'GET /api/preferencias': return json(res, 200, await leerPrefs());
        case 'PUT /api/preferencias': return json(res, 200, await guardarPrefs(await readBody(req)));
        case 'GET /api/portadas': return json(res, 200, await listarPortadas());
        case 'POST /api/portadas': return json(res, 201, await subirPortada(await readBody(req, 21e6)));
        case 'DELETE /api/portadas': return json(res, 200, await borrarPortada(q.get('archivo')));
        case 'GET /api/resolver': {
          const idx = await getIndex();
          const name = String(q.get('nombre') || '').replace(/\.md$/i, '').toLowerCase();
          const n = idx.notes.find(x => x.path.toLowerCase() === `${name}.md`) || idx.notes.find(x => x.name.toLowerCase() === name.split('/').pop());
          return n ? json(res, 200, { path: n.path }) : json(res, 404, { error: 'Nota no encontrada' });
        }
        case 'GET /api/archivo': {
          const idx = await getIndex();
          const name = String(q.get('nombre') || '').toLowerCase();
          const f = idx.files.find(x => x.toLowerCase() === name) || idx.files.find(x => baseOf(x).toLowerCase() === name.split('/').pop());
          if (!f) return json(res, 404, { error: 'Archivo no encontrado' });
          return await sendFile(res, safe(f));
        }
        case 'GET /api/events': {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          res.write('retry: 3000\n\n');
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }
        default: return json(res, 404, { error: 'Ruta no encontrada' });
      }
    }

    if (p.startsWith('/vault/')) return await sendFile(res, safe(p.slice(7)));
    if (p.startsWith('/portadas/')) {
      const name = p.slice(10);
      if (!IMG_RE.test(name)) return json(res, 404, { error: 'No encontrado' });
      return await sendFile(res, path.join(PORTADAS, name));
    }

    let f = path.join(PUBLIC, p === '/' ? 'index.html' : p);
    if (!f.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'No permitido' });
    if (!fss.existsSync(f)) f = path.join(PUBLIC, 'index.html');
    return await sendFile(res, f);
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : 500);
    if (status >= 500) console.error(e);
    if (!res.headersSent) json(res, status, { error: e.code === 'ENOENT' ? 'No encontrado' : e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  HQ listo →  http://localhost:${PORT}\n  Vault:      ${VAULT}\n`);
});
