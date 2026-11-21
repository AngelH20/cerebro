// Añade una entrada al registro de "La IA".
// Uso: node scripts/registrar-ia.mjs [--estado hecho|error|decidir] [--seccion Contenido] [--sub YouTube] [--agente Claude] "Qué se ha hecho"
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await fs.readFile(path.join(ROOT, 'hq.config.json'), 'utf8'));
const VAULT = path.resolve(ROOT, process.env.HQ_VAULT || cfg.vault);
const registro = cfg.sistema?.registro || 'Sistema/maquina/registro-ia.jsonl';

const args = process.argv.slice(2);
const opt = {};
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else rest.push(args[i]);
}
const texto = rest.join(' ').trim();
if (!texto) {
  console.log('Uso: node scripts/registrar-ia.mjs [--estado hecho|error|decidir] [--seccion X] [--sub Y] [--agente Z] "Qué se ha hecho"');
  process.exit(1);
}
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const entry = {
  fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
  estado: opt.estado || 'hecho',
  seccion: opt.seccion || 'General',
  subseccion: opt.sub || '',
  agente: opt.agente || 'IA',
  texto,
};
const f = path.join(VAULT, registro);
await fs.mkdir(path.dirname(f), { recursive: true });
await fs.appendFile(f, JSON.stringify(entry) + '\n', 'utf8');
console.log('Registrado:', texto);
