// Crea un vault de Obsidian de ejemplo con la estructura HQ (humano / máquina, bases de datos por carpeta).
// Las fechas se calculan desde hoy para que el panel siempre tenga datos "vivos".
// Uso: node scripts/crear-vault-ejemplo.mjs [--forzar]
//      node scripts/crear-vault-ejemplo.mjs --vacio   → solo carpetas y reglas, sin datos; nunca sobrescribe nada
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await fs.readFile(path.join(ROOT, 'hq.config.json'), 'utf8'));
const VAULT = path.resolve(ROOT, process.env.HQ_VAULT || cfg.vault);

const VACIO = process.argv.includes('--vacio');
if (!VACIO && fss.existsSync(VAULT) && fss.readdirSync(VAULT).length && !process.argv.includes('--forzar')) {
  console.log(`Ya existe un vault en ${VAULT}. No toco nada (usa --forzar para reescribir los archivos de ejemplo).`);
  process.exit(0);
}

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const hoy = dia(0);
const now = new Date();
const mesDia = k => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(Math.min(k, now.getDate()))}`;
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const mesPrevDia = k => `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(k)}`;

function fm(obj) {
  const val = v => {
    if (Array.isArray(v)) return `[${v.join(', ')}]`;
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && /[:#[\]{}]|^\s|\s$/.test(v)) return `"${v}"`;
    return String(v);
  };
  return '---\n' + Object.entries(obj).map(([k, v]) => `${k}: ${val(v)}`.trimEnd()).join('\n') + '\n---\n';
}
async function w(rel, data, body = '') {
  const f = path.join(VAULT, rel);
  if (VACIO && fss.existsSync(f)) return console.log(`  (ya existe, no lo toco) ${rel}`);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, (data ? fm(data) + '\n' : '') + body.trim() + '\n', 'utf8');
}

// ---------- Reglas para la IA (válidas para Claude, Codex, Gemini, Grok…) ----------
const reglas = `# Reglas para cualquier IA que trabaje en este vault

Este vault es el sistema **HQ**. Un panel local (http://localhost:${cfg.port}) lo lee y lo muestra.
Da igual qué IA seas: estas reglas son las mismas para todas. Todo son carpetas y notas en Markdown.

## 1. Humano y máquina
- Carpetas \`humano/\`: solo lo que la persona ha dicho o escrito, **tal cual**. No resumas ni reescribas aquí.
  Si guardas algo que dijo, cítalo literal y pon la fecha.
- Carpetas \`maquina/\`: instrucciones, datos importados por scripts y todo lo que generes tú.
- Si dudas de dónde va algo, va a \`maquina/\`.

## 2. Los datos son notas con propiedades
Cada fila de una "base de datos" es una nota con propiedades (frontmatter YAML). No cambies los nombres de las propiedades.
- **Tareas** → \`Tareas/\`: \`estado\` (pendiente | hecha), \`fecha\` (AAAA-MM-DD), \`seccion\`, \`prioridad\` (alta | normal | baja).
- **Te toca decidir** → \`Sistema/Decidir/\`: \`estado: pendiente\`, \`seccion\`, \`agente\`, \`creado\`.
  La persona responde desde el panel: \`estado\` pasa a \`aprobado\` o \`rechazado\` y su comentario queda en \`respuesta\`.
  **Lee esas respuestas antes de continuar** con lo que estaba pendiente.
- **Lo aprendido** → \`Sistema/Aprendido/\`: una nota por lección (qué pasó y qué hacer distinto).
- **Correos** → \`Bandeja/maquina/correos/\` · **Movimientos** → \`Finanzas/maquina/movimientos/\`.

## 3. Los scripts captan, la IA decide
Los scripts (Python o Node) solo traen datos de fuera y los guardan como notas. Tú los lees y decides:
por ejemplo, marcar \`util: true\` en \`Contenido/YouTube/Investigación\` y explicar el porqué en \`motivo\`.

## 4. Registra todo lo que haces
Al terminar cada acción, añade **una línea JSON** al final de \`Sistema/maquina/registro-ia.jsonl\`:

\`\`\`json
{"fecha":"AAAA-MM-DDTHH:MM","estado":"hecho","seccion":"Contenido","subseccion":"YouTube","agente":"Claude","texto":"Qué has hecho, en una frase"}
\`\`\`

\`estado\`: \`hecho\` | \`error\` | \`decidir\`. Si necesitas el OK de la persona, usa \`decidir\` y crea además la nota en \`Sistema/Decidir/\`.
(Atajo desde la carpeta del panel: \`node scripts/registrar-ia.mjs --seccion Contenido --agente Claude "texto"\`.)
`;
await w('CLAUDE.md', null, reglas);
await w('AGENTS.md', null, reglas);

// ---------- Bases de Obsidian (vista tabla dentro de Obsidian) ----------
await fs.mkdir(VAULT, { recursive: true });
if (!(VACIO && fss.existsSync(path.join(VAULT, 'Tareas.base')))) await fs.writeFile(path.join(VAULT, 'Tareas.base'), `filters:
  and:
    - file.inFolder("Tareas")
views:
  - type: table
    name: Pendientes
    filters:
      and:
        - estado == "pendiente"
    order:
      - file.name
      - fecha
      - seccion
      - prioridad
  - type: table
    name: Todas
    order:
      - file.name
      - estado
      - fecha
      - seccion
`, 'utf8');

// ---------- Modo vacío: solo la estructura ----------
if (VACIO) {
  const S = cfg.sistema || {};
  const carpetas = [
    S.tareas || 'Tareas', S.diario || 'Diario', S.decidir || 'Sistema/Decidir', S.aprendido || 'Sistema/Aprendido',
    ...(cfg.secciones || []).flatMap(s => [`${s.carpeta}/humano`, `${s.carpeta}/maquina`]),
    ...(cfg.secciones || []).filter(s => s.correos).map(s => `${s.carpeta}/${s.correos}`),
    ...(cfg.secciones || []).filter(s => s.tipo === 'finanzas').map(s => `${s.carpeta}/${s.movimientos || 'maquina/movimientos'}`),
    ...(cfg.secciones || []).filter(s => s.pedidos).map(s => `${s.carpeta}/${s.pedidos}`),
    'Contenido/YouTube/Investigación', 'Contenido/YouTube/maquina',
  ];
  for (const c of carpetas) await fs.mkdir(path.join(VAULT, c), { recursive: true });
  const reg = path.join(VAULT, S.registro || 'Sistema/maquina/registro-ia.jsonl');
  await fs.mkdir(path.dirname(reg), { recursive: true });
  if (!fss.existsSync(reg)) await fs.writeFile(reg, '', 'utf8');
  const canales = path.join(VAULT, 'Contenido/YouTube/maquina/canales.txt');
  if (!fss.existsSync(canales)) await fs.writeFile(canales, '# Un channel_id de YouTube por línea (empiezan por UC...). Ejemplo:\n# UCxxxxxxxxxxxxxxxxxxxxxx  # Nombre del canal\n', 'utf8');
  console.log(`Estructura HQ creada en ${VAULT} (${carpetas.length} carpetas, sin datos de ejemplo).`);
  process.exit(0);
}

// ---------- Tareas ----------
const tareas = [
  ['Grabar vídeo del sistema en Obsidian', 0, 'Contenido', 'alta'],
  ['Revisar correos importantes', 0, 'Bandeja', 'normal'],
  ['Responder a los dos leads nuevos', 0, 'Ventas', 'alta'],
  ['Enviar factura de octubre', -1, 'Finanzas', 'alta'],
  ['Editar miniatura del próximo vídeo', 1, 'Contenido', 'normal'],
  ['Preparar la clase del martes', 2, 'Formación', 'normal'],
  ['Repasar el plan de inversiones', 3, 'Aprender', 'baja'],
  ['Llamada de seguimiento con Acme', 4, 'Ventas', 'normal'],
  ['Escribir la newsletter', 5, 'Contenido', 'normal'],
];
for (const [t, d, s, p] of tareas) await w(`Tareas/${t}.md`, { estado: 'pendiente', fecha: dia(d), seccion: s, prioridad: p, tags: ['tarea'] }, '');
await w('Tareas/Configurar la copia diaria en GitHub.md', { estado: 'hecha', fecha: hoy, seccion: 'General', prioridad: 'normal', completada: hoy, tags: ['tarea'] }, 'Script en `scripts/copia-github.ps1`, programado a las 23:45.');

// ---------- Contenido ----------
await w('Contenido/humano/Ideas sueltas.md', { fecha: dia(-3) }, `# Ideas sueltas

> "Quiero un vídeo que enseñe cómo ordeno todo en Obsidian sin que parezca complicado."

- Hacer una serie corta sobre agentes que trabajan de noche.
- Probar formatos de 8 minutos en vez de 15.`);
await w('Contenido/humano/Mi tono.md', { fecha: dia(-20) }, `# Mi tono

- Cercano, directo, sin tecnicismos innecesarios.
- Siempre enseñar el sistema funcionando, no diapositivas.`);
await w('Contenido/maquina/Cómo trabaja la IA aquí.md', null, `# Cómo trabaja la IA en Contenido

1. Los scripts captan vídeos de la competencia en \`YouTube/Investigación\`.
2. La IA marca \`util: true\` en los que sirven y explica el \`motivo\`.
3. Con las ideas de \`humano/\` propone títulos en **Te toca decidir**.`);

await w('Contenido/YouTube/Vídeos/Mi sistema en Obsidian.md', { estado: 'grabando', fecha: dia(2), formato: 'largo', duracion_min: 15 }, `# Mi sistema en Obsidian

## Guion
1. Por qué este sistema
2. Cómo crearlo (humano / máquina)
3. Consejos: copia en GitHub, acceso desde el móvil, arneses

## Miniatura
- [x] Boceto
- [ ] Versión final`);
await w('Contenido/YouTube/Vídeos/Agentes que trabajan de noche.md', { estado: 'idea', fecha: dia(12), formato: 'largo' }, 'Idea: enseñar el registro de "La IA" de una noche entera.');
await w('Contenido/YouTube/Vídeos/Cómo veo mi panel desde el móvil.md', { estado: 'publicado', fecha: dia(-9), formato: 'corto', vistas: 12400 }, 'Tailscale + servidor local.');

const inv = [
  ['Organiza tu vida con Obsidian en 2026', 'Canal Productivo', 184000, true, 'Mucha demanda de sistemas visuales; nuestro enfoque con IA es distinto.'],
  ['10 plugins de Obsidian imprescindibles', 'NotasPro', 92000, false, 'Tema muy saturado.'],
  ['Mi segundo cerebro con Claude', 'IA Diaria', 61000, true, 'Comentarios piden ver el sistema por dentro.'],
  ['Notion vs Obsidian, la verdad', 'Tech Sin Humo', 240000, false, 'Comparativa, no encaja con el canal.'],
  ['Automatizar el correo con IA', 'Flujo', 33000, true, 'Encaja con la Bandeja; poca competencia en español.'],
  ['Rutina de mañana de un programador', 'DevLife', 410000, false, 'Fuera de temática.'],
];
for (const [t, c, v, u, m] of inv) await w(`Contenido/YouTube/Investigación/${t}.md`, { canal: c, vistas: v, publicado: dia(-Math.round(v / 40000)), util: u, motivo: m, captado: dia(-1) }, '');
await w('Contenido/YouTube/maquina/Instrucciones - investigar vídeos.md', null, `# Instrucciones: investigar vídeos

El script \`scripts/captar-youtube.py\` guarda cada día los vídeos nuevos de los canales de \`canales.txt\`.
Tu trabajo (IA): para cada nota sin \`util\`, decide si sirve al canal y rellena \`util\` y \`motivo\`.`);
await fs.writeFile(path.join(VAULT, 'Contenido/YouTube/maquina/canales.txt'), '# Un channel_id de YouTube por línea (empiezan por UC...). Ejemplo:\n# UCxxxxxxxxxxxxxxxxxxxxxx  # Nombre del canal\n', 'utf8');
await w('Contenido/Newsletter/Edición 12.md', { estado: 'borrador', fecha: dia(5) }, '# Edición 12\n\n- Lo que he aprendido montando HQ');

// ---------- Formación ----------
await w('Formación/Cursos/Curso de IA para equipos.md', { estado: 'abierto', alumnos: 24, precio: 290, inicio: dia(10) }, '# Curso de IA para equipos\n\n4 sesiones en directo.');
await w('Formación/Cursos/Taller de Obsidian.md', { estado: 'preparando', alumnos: 0, precio: 90, inicio: dia(25) }, '');
await w('Formación/humano/Feedback de alumnos.md', { fecha: dia(-6) }, '> "Lo mejor fue ver el sistema funcionando en directo."');

// ---------- Aprender ----------
await w('Aprender/Inversiones/Plan de aprendizaje.md', { estado: 'en curso', fecha: dia(-14) }, `# Plan: aprender a invertir

- [x] Interés compuesto
- [x] Diversificación
- [ ] Fondos indexados
- [ ] Fiscalidad básica`);
await w('Aprender/Inversiones/Conceptos/Interés compuesto.md', { estado: 'entendido', fecha: dia(-10) }, 'Los intereses generan intereses. Lo que más pesa es el **tiempo**.');
await w('Aprender/Inversiones/Conceptos/Diversificación.md', { estado: 'entendido', fecha: dia(-7) }, 'No depender de un solo activo.');
await w('Aprender/Inversiones/Conceptos/Fondos indexados.md', { estado: 'repasar', fecha: dia(-2) }, 'Replican un índice con comisiones bajas.');

// ---------- Ventas ----------
const leads = [
  ['Acme', 'propuesta', 4800, 'Llamada de seguimiento', 4],
  ['Estudio Norte', 'reunión', 2200, 'Enviar propuesta', 1],
  ['Clínica Sol', 'contacto', 1500, 'Primera llamada', 0],
  ['Grupo Delta', 'cerrado', 6000, 'Arrancar proyecto', -3],
];
for (const [e, et, v, p, d] of leads) await w(`Ventas/Pipeline/${e}.md`, { empresa: e, etapa: et, valor: v, proximo_paso: p, fecha: dia(d) }, '');
await w('Ventas/humano/Cómo vendo.md', null, '# Cómo vendo\n\n- Nunca más de 2 seguimientos sin respuesta.\n- Propuesta en 48 h tras la reunión.');

// ---------- Bandeja ----------
const correos = [
  ['trabajo', 'Laura (Acme)', 'Re: propuesta de formación', 0, '09:12', 'importante', 'Pide mover la llamada al jueves y una versión con 3 sesiones.'],
  ['trabajo', 'Facturación', 'Factura pendiente de octubre', 0, '08:40', 'importante', 'Recordatorio: la factura vence el viernes.'],
  ['personal', 'Banco', 'Tu extracto mensual', 0, '07:55', 'nuevo', 'Extracto disponible. Nada urgente.'],
  ['trabajo', 'Estudio Norte', 'Dudas antes de la reunión', -1, '18:20', 'importante', 'Preguntan por precios para 10 personas.'],
  ['personal', 'Newsletter IA', 'Las novedades de la semana', -1, '10:00', 'leido', 'Resumen semanal, sin acción.'],
  ['trabajo', 'YouTube', 'Tu vídeo ha superado las 10.000 visitas', -1, '09:30', 'leido', 'Buen rendimiento del último corto.'],
  ['trabajo', 'Clínica Sol', 'Información sobre vuestros cursos', -2, '16:45', 'importante', 'Lead nuevo, quiere llamada esta semana.'],
  ['personal', 'Amazon', 'Tu pedido ha sido enviado', -2, '12:10', 'archivado', 'Notificación de envío.'],
  ['trabajo', 'Plataforma de cursos', 'Nuevo alumno inscrito', -3, '20:05', 'leido', 'Curso de IA para equipos: 24 alumnos.'],
  ['personal', 'Gimnasio', 'Cambio de horario', -4, '08:00', 'archivado', 'Horario de invierno.'],
  ['trabajo', 'Colaboraciones', 'Propuesta de vídeo patrocinado', -4, '11:30', 'nuevo', 'Marca de software ofrece patrocinio. Requiere decisión.'],
  ['trabajo', 'Hosting', 'Renovación del dominio', -5, '09:00', 'leido', 'Renovado automáticamente.'],
];
let ci = 1;
for (const [b, de, as, d, h, est, res] of correos) {
  await w(`Bandeja/maquina/correos/${dia(d)} ${pad(ci++)} ${as.replace(/[:\\/?*"<>|]/g, '')}.md`, { buzon: b, de, asunto: as, fecha: `${dia(d)} ${h}`, estado: est, resumen_ia: res }, `${res}\n\n(Texto original importado por el script de correo.)`);
}
await w('Bandeja/humano/Criterios de importancia.md', null, `# Qué correos son importantes para mí

- Clientes y leads: siempre.
- Facturas y pagos: siempre.
- Newsletters y notificaciones: nunca, archivar.`);

// ---------- Finanzas ----------
const movs = [
  [mesDia(1), 'Curso de IA para equipos', 2900, 'Formación', 'Empresa'],
  [mesDia(2), 'Alquiler oficina', -650, 'Oficina', 'Empresa'],
  [mesDia(3), 'Suscripciones de IA', -120, 'Software', 'Empresa'],
  [mesDia(5), 'Proyecto Grupo Delta (50%)', 3000, 'Ventas', 'Empresa'],
  [mesDia(6), 'Publicidad YouTube', 340, 'Contenido', 'Empresa'],
  [mesDia(8), 'Micrófono nuevo', -189, 'Equipo', 'Empresa'],
  [mesDia(9), 'Gestoría', -90, 'Servicios', 'Empresa'],
  [mesDia(11), 'Hosting y dominio', -32, 'Software', 'Empresa'],
  [mesDia(12), 'Patrocinio newsletter', 450, 'Contenido', 'Empresa'],
  [mesDia(14), 'Comidas con clientes', -76, 'Ventas', 'Empresa'],
  [mesDia(15), 'Seguro autónomo', -310, 'Servicios', 'Empresa'],
  [mesDia(17), 'Taller de Obsidian (preventa)', 540, 'Formación', 'Empresa'],
  [mesDia(18), 'Software de edición', -24, 'Software', 'Empresa'],
  [mesPrevDia(4), 'Curso de IA para equipos', 2610, 'Formación', 'Empresa'],
  [mesPrevDia(2), 'Alquiler oficina', -650, 'Oficina', 'Empresa'],
  [mesPrevDia(10), 'Suscripciones de IA', -120, 'Software', 'Empresa'],
  [mesPrevDia(21), 'Publicidad YouTube', 290, 'Contenido', 'Empresa'],
];
let mi = 1;
for (const [f, c, imp, cat, cu] of movs) await w(`Finanzas/maquina/movimientos/${f} ${pad(mi++)} ${c}.md`, { fecha: f, concepto: c, importe: imp, categoria: cat, cuenta: cu }, '');
await w('Finanzas/humano/Objetivos 2026.md', null, '# Objetivos 2026\n\n- Gastos fijos por debajo de 1.500 €/mes.\n- Colchón de 6 meses.');

// ---------- Sistema: decidir, aprendido, registro ----------
await w('Sistema/Decidir/Título del vídeo sobre Obsidian.md', { estado: 'pendiente', seccion: 'Contenido', agente: 'Claude', creado: `${hoy} 09:10` }, `Propongo dos títulos para el vídeo:

- **A:** Uso Obsidian para mi IA (pero no como todo el mundo)
- **B:** Mi segundo cerebro con IA, por dentro

Mi recomendación es la A: los vídeos útiles de la investigación con títulos en primera persona rinden mejor.`);
await w('Sistema/Decidir/Patrocinio de software.md', { estado: 'pendiente', seccion: 'Bandeja', agente: 'Codex', creado: `${dia(-1)} 18:46` }, 'Una marca ofrece patrocinar un vídeo. ¿Respondo pidiendo condiciones o lo rechazo?');
await w('Sistema/Decidir/Subir precio del curso.md', { estado: 'pendiente', seccion: 'Formación', agente: 'Claude', creado: `${dia(-1)} 12:02` }, 'El curso se ha llenado tres ediciones seguidas. Propongo subir de 290 € a 340 € en la próxima.');
await w('Sistema/Decidir/Mover Estudio Norte a propuesta.md', { estado: 'pendiente', seccion: 'Ventas', agente: 'Claude', creado: `${hoy} 10:40` }, 'Tras su correo, ¿preparo ya la propuesta para 10 personas?');
await w('Sistema/Decidir/Publicar la newsletter del jueves.md', { estado: 'aprobado', seccion: 'Contenido', agente: 'Claude', creado: `${dia(-3)} 09:00`, respondido: `${dia(-3)} 10:15`, respuesta: 'Adelante, pero quita el último enlace.' }, 'Borrador listo para enviar.');

await w('Sistema/Aprendido/Separar humano y máquina.md', { fecha: dia(-30), seccion: 'General' }, 'La IA confundía mis ideas con sus propios resúmenes. Desde que separo `humano/` y `maquina/`, sabe qué dije yo de verdad.');
await w('Sistema/Aprendido/Los scripts captan, la IA decide.md', { fecha: dia(-21), seccion: 'General' }, 'Traer datos de internet no necesita IA: un script es más barato y fiable. La IA entra después, para decidir qué sirve.');
await w('Sistema/Aprendido/Registrar todo lo que hace la IA.md', { fecha: dia(-12), seccion: 'General' }, 'Con el registro, cualquier sesión nueva sabe qué se hizo antes y por qué.');
await w('Sistema/Aprendido/Empezar por una sola carpeta.md', { fecha: dia(-40), seccion: 'General' }, 'Montar todo a la vez no funcionó. Empezar por YouTube y crecer desde ahí, sí.');

const reg = [
  [-2, '23:45', 'hecho', 'General', '', 'Script', 'Copia diaria de HQ en GitHub: 34 archivos nuevos o cambiados.'],
  [-2, '20:10', 'hecho', 'Ventas', 'Pipeline', 'Claude', 'Grupo Delta pasa a cerrado; creada la tarea de arranque.'],
  [-2, '12:30', 'hecho', 'Formación', 'Cursos', 'Codex', 'Actualizado el número de alumnos del curso (24).'],
  [-2, '08:05', 'hecho', 'Bandeja', 'Bandeja', 'Script', 'Importados 41 correos nuevos de 2 buzones.'],
  [-1, '23:45', 'hecho', 'General', '', 'Script', 'Copia diaria de HQ en GitHub: 61 archivos nuevos o cambiados.'],
  [-1, '19:40', 'error', 'Bandeja', 'Bandeja', 'Codex', 'La importación del buzón personal se cortó a mitad: límite de cuota. Reintento programado.'],
  [-1, '18:46', 'decidir', 'Bandeja', 'Bandeja', 'Codex', 'Propuesta de patrocinio recibida. Espera tu OK para responder.'],
  [-1, '18:20', 'hecho', 'Bandeja', 'Bandeja', 'Claude', 'Marcado como importante el correo de Estudio Norte y creada tarea de respuesta.'],
  [-1, '12:02', 'decidir', 'Formación', 'Cursos', 'Claude', 'Propuesta de subir el precio del curso a 340 €.'],
  [-1, '10:15', 'hecho', 'Contenido', 'YouTube', 'Claude', 'Investigación diaria: 6 vídeos captados, 3 marcados como útiles.'],
  [-1, '09:00', 'hecho', 'Aprender', 'Inversiones', 'Claude', 'Resumen de "Fondos indexados" añadido a conceptos.'],
  [-1, '08:05', 'hecho', 'Bandeja', 'Bandeja', 'Script', 'Importados 37 correos nuevos de 2 buzones; 4 importantes.'],
  [0, '08:05', 'hecho', 'Bandeja', 'Bandeja', 'Script', 'Importados 18 correos nuevos de 2 buzones; 2 importantes.'],
  [0, '08:20', 'hecho', 'Contenido', 'YouTube', 'Script', 'Captados 12 vídeos nuevos de 5 canales.'],
  [0, '08:41', 'hecho', 'Contenido', 'YouTube', 'Claude', 'Revisados los vídeos captados: 3 movidos a útiles con su motivo.'],
  [0, '09:10', 'decidir', 'Contenido', 'YouTube', 'Claude', 'Dos títulos propuestos para el vídeo de Obsidian. Espera tu OK.'],
  [0, '10:40', 'decidir', 'Ventas', 'Pipeline', 'Claude', '¿Preparo la propuesta para Estudio Norte?'],
  [0, '11:15', 'error', 'Finanzas', 'Movimientos', 'Script', 'No se pudo leer el extracto del banco: el CSV ha cambiado de formato.'],
  [0, '12:30', 'hecho', 'General', 'Diario', 'Claude', 'Creado el resumen del día en el diario.'],
];
await fs.mkdir(path.join(VAULT, 'Sistema/maquina'), { recursive: true });
await fs.writeFile(path.join(VAULT, 'Sistema/maquina/registro-ia.jsonl'),
  reg.map(([d, h, e, s, sub, a, t]) => JSON.stringify({ fecha: `${dia(d)}T${h}`, estado: e, seccion: s, subseccion: sub, agente: a, texto: t })).join('\n') + '\n', 'utf8');

// ---------- Diario ----------
await w(`Diario/${hoy}.md`, { fecha: hoy, tipo: 'diario' }, `# Diario de hoy

## Lo importante
- Grabar el vídeo del sistema
- Cerrar la factura de octubre

## Notas
- La IA ha dejado 2 cosas para decidir.`);

console.log(`Vault de ejemplo creado en ${VAULT}`);
