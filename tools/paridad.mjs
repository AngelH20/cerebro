// Comparador de paridad Node ↔ Rust: solo lecturas sobre el vault real.
// Uso: node tools/paridad.mjs [http://127.0.0.1:4321 (Node)] [http://127.0.0.1:4320 (Rust)]
// Compara estado HTTP, Content-Type y cuerpo. En JSON compara también el ORDEN de las claves.
// `mtime` se compara con tolerancia de 0,001 ms y `leido` (hora de lectura de Sheets) se ignora.
import http from 'node:http';

const [A = 'http://127.0.0.1:4321', B = 'http://127.0.0.1:4320'] = process.argv.slice(2);
const IGNORAR = new Set(['leido']);

async function pedir(base, ruta, opts = {}) {
  let r;
  try { r = await fetch(base + ruta, opts); } catch (e) { return { status: `conexión cortada (${e.cause?.code || e.message})`, tipo: '', cuerpo: '' }; }
  const buf = Buffer.from(await r.arrayBuffer());
  const tipo = (r.headers.get('content-type') || '').split(';')[0];
  let cuerpo = buf;
  if (tipo === 'application/json') { try { cuerpo = JSON.parse(buf.toString('utf8')); } catch { /* se compara en bruto */ } }
  return { status: r.status, tipo, cuerpo };
}

// Diferencia estructural; devuelve la ruta de la primera diferencia o null.
function diferencia(a, b, camino = '$') {
  if (Buffer.isBuffer(a) || Buffer.isBuffer(b)) return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b) ? null : `${camino} (bytes)`;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) return `${camino}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  if (a && typeof a === 'object') {
    if (Array.isArray(a)) {
      if (a.length !== b.length) return `${camino}: longitud ${a.length} ≠ ${b.length}`;
      for (let i = 0; i < a.length; i++) { const d = diferencia(a[i], b[i], `${camino}[${i}]`); if (d) return d; }
      return null;
    }
    const ka = Object.keys(a).filter(k => !IGNORAR.has(k)), kb = Object.keys(b).filter(k => !IGNORAR.has(k));
    if (ka.join('\u0000') !== kb.join('\u0000')) return `${camino}: claves [${ka}] ≠ [${kb}]`;
    for (const k of ka) {
      if (k === 'mtime' && typeof a[k] === 'number' && typeof b[k] === 'number') { if (Math.abs(a[k] - b[k]) > 0.001) return `${camino}.mtime: ${a[k]} ≠ ${b[k]}`; continue; }
      const d = diferencia(a[k], b[k], `${camino}.${k}`); if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${camino}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
}

// Petición con cabecera Host arbitraria (fetch no deja cambiarla).
function conHost(base, ruta, host) {
  const u = new URL(base);
  return new Promise((res, rej) => {
    http.get({ host: u.hostname, port: u.port, path: ruta, headers: { host } }, r => { r.resume(); res({ status: r.statusCode, tipo: '', cuerpo: '' }); }).on('error', rej);
  });
}

const casos = []; // [categoria, ruta, opts]
const add = (cat, ruta, opts) => casos.push([cat, ruta, opts]);
const enc = encodeURIComponent;

const raiz = (await pedir(A, '/api/carpeta?path=&recursive=1')).cuerpo;
const carpetas = (await pedir(A, '/api/carpetas')).cuerpo;
const config = (await pedir(A, '/api/config')).cuerpo;

for (const r of ['/api/config', '/api/overview', '/api/carpetas', '/api/registro', '/api/preferencias', '/api/portadas', '/api/correo/cuentas', '/api/diario', '/api/diario?fecha=2026-11-20', '/api/diario?fecha=2030-01-01'])
  add('Vistas generales', r);
for (const d of ['', ...carpetas]) { add('Carpetas', `/api/carpeta?path=${enc(d)}`); add('Carpetas', `/api/carpeta?path=${enc(d)}&recursive=1`); }
add('Carpetas', '/api/carpeta?path=NoExiste');
for (const n of raiz.notas) add('Notas', `/api/note?path=${enc(n.path)}`);
for (const n of raiz.notas.slice(0, 60)) add('Resolver', `/api/resolver?nombre=${enc(n.name)}`);
add('Resolver', '/api/resolver?nombre=no-existe-xyz');
add('JSON de máquina', '/api/json?path=Gimnasio/maquina/historial-rutina.json');
add('JSON de máquina', '/api/json?path=no/existe.json');
for (const hojas of Object.values(config.prefs?.hojas || {})) for (const h of hojas) add('Google Sheets', `/api/hoja?url=${enc(h.url)}`);
for (const f of ['/', '/index.html', '/app.js', '/app.css', '/scenes.js', '/ruta/inexistente']) add('Estáticos', f);
for (const f of raiz.archivos.slice(0, 10)) { add('Archivos del vault', `/vault/${f.split('/').map(enc).join('/')}`); add('Archivos del vault', `/api/archivo?nombre=${enc(f.split('/').pop())}`); }
add('Errores', '/api/note?path=../hq.config.json');
add('Errores', '/api/note?path=no/existe.md');
add('Errores', '/api/no-existe');
add('Errores', '/vault/no-existe.png');
add('Errores', '/portadas/../hq.config.json');
add('Errores', '/a%zz');
add('Errores', '/api/correo/importar', { method: 'POST' }); // sin Content-Type → 415, no ejecuta nada
add('Errores', '/api/json?path=Tareas');

const resumen = new Map();
const fallos = [];
for (const [cat, ruta, opts] of casos) {
  const [a, b] = await Promise.all([pedir(A, ruta, opts), pedir(B, ruta, opts)]);
  let d = a.status !== b.status ? `estado ${a.status} ≠ ${b.status}` : a.tipo !== b.tipo ? `tipo ${a.tipo} ≠ ${b.tipo}` : diferencia(a.cuerpo, b.cuerpo);
  // En errores 500 el texto depende del motor (mensajes del sistema): basta con igualar el estado.
  if (d && a.status === 500 && b.status === 500 && d.startsWith('$.error')) d = null;
  const s = resumen.get(cat) || { total: 0, iguales: 0 };
  s.total++; if (!d) s.iguales++; else fallos.push([cat, ruta, d]);
  resumen.set(cat, s);
}
for (const host of ['evil.com', 'mi-pc.tail1234.ts.net']) {
  const [a, b] = await Promise.all([conHost(A, '/api/config', host), conHost(B, '/api/config', host)]);
  const s = resumen.get('Host') || { total: 0, iguales: 0 };
  s.total++; if (a.status === b.status) s.iguales++; else fallos.push(['Host', host, `estado ${a.status} ≠ ${b.status}`]);
  resumen.set('Host', s);
}

console.log(`\nParidad  Node (${A})  ↔  Rust (${B})\n`);
console.log('Categoría'.padEnd(22) + 'Comparadas'.padStart(11) + 'Iguales'.padStart(9) + 'Distintas'.padStart(11));
let T = 0, I = 0;
for (const [cat, s] of resumen) { T += s.total; I += s.iguales; console.log(cat.padEnd(22) + String(s.total).padStart(11) + String(s.iguales).padStart(9) + String(s.total - s.iguales).padStart(11)); }
console.log('-'.repeat(53));
console.log('TOTAL'.padEnd(22) + String(T).padStart(11) + String(I).padStart(9) + String(T - I).padStart(11));
if (fallos.length) {
  console.log('\nDiferencias:');
  for (const [c, r, d] of fallos.slice(0, 40)) console.log(`- [${c}] ${r}\n    ${d}`);
}
process.exit(fallos.length ? 1 : 0);
