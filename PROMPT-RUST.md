# Prompt: app nativa de HQ en Rust (Tauri 2)

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en una sesión nueva de Claude Code abierta en `D:\CerebroWeb`.

---

## Tu rol

Actúa como **ingeniero senior de Rust** con experiencia en producción en **Tauri 2**, **axum/tokio**, sistemas de archivos y apps de escritorio para Windows. Escribe código idiomático, seguro y mantenible, como si fuera a revisarlo otro senior:

- Nada de `unwrap()`/`expect()` en caminos de ejecución normales: errores tipados (`thiserror`) y `anyhow` solo en el borde (`main`/`setup`).
- `cargo fmt` y `cargo clippy --all-targets -- -D warnings` limpios.
- Módulos chicos y con una sola responsabilidad. Nada de un `server.rs` de 1500 líneas.
- Logs con `tracing`, archivo de log rotativo en la carpeta de datos de la app.
- Tests unitarios para la lógica pura y tests de integración del servidor HTTP.
- Explícame las decisiones importantes en español y en pocas líneas. Antes de escribir código, preséntame el plan y espera mi OK.

## El proyecto (contexto)

**HQ** es mi panel personal sobre mi vault de Obsidian. Hoy funciona así:

- `D:\CerebroWeb\server.mjs`: servidor Node sin dependencias, en `127.0.0.1:4320`. **Es la especificación de referencia: léelo entero antes de empezar.**
- `D:\CerebroWeb\public\`: interfaz web (`index.html`, `app.js`, `app.css`, `scenes.js`). **No la reescribas.** Habla con el servidor por `fetch('/api/...')` y `EventSource('/api/events')`.
- `D:\CerebroWeb\hq.config.json`: configuración (ruta del vault `D:/Cerebro`, puerto, moneda ARS, locale es-AR, secciones).
- `D:\CerebroWeb\hq.preferencias.json`: portadas elegidas, fondo y hojas de Google Sheets vinculadas.
- `D:\CerebroWeb\portadas\`: imágenes subidas por mí.
- `D:\CerebroWeb\cuentas-correo.json`: cuentas de Gmail con contraseñas de aplicación. **Secreto: no lo muestres, no lo loguees, no lo copies a ningún lado.**
- `D:\CerebroWeb\scripts\`: `importar-correo.py` (IMAP, lo lanza el servidor y una tarea de Windows "HQ correo" cada hora), `registrar-ia.mjs`, `captar-youtube.py`, `copia-github.ps1`, `crear-vault-ejemplo.mjs`.
- `D:\Cerebro\`: **mi vault real**. Cada nota es una fila y su frontmatter YAML son las columnas. Hay carpetas `humano/` y `maquina/`, y las reglas para agentes están en `D:\Cerebro\CLAUDE.md`.

Secciones y datos que maneja (todo debe seguir funcionando igual):
- Tareas (`Tareas/`), Decidir (`Sistema/Decidir/`), Aprendido (`Sistema/Aprendido/`), Diario (`Diario/AAAA-MM-DD.md`), registro de la IA (`Sistema/maquina/registro-ia.jsonl`).
- **LeAn3D**: mi emprendimiento de impresión 3D, con pedidos en `LeAn3D/Pedidos/`. Al cobrar un pedido se crea un ingreso en `Finanzas/Movimientos/`.
- **Finanzas** en pesos argentinos, con cuentas LeAn3D y Personal.
- **Bandeja**: correos importados en `Bandeja/maquina/correos/<cuenta>/`.
- **Powerlifting**: lee mi rutina de Google Sheets (formato de mi entrenador). Guarda un historial semanal en `Gimnasio/maquina/historial-rutina.json` + `Gimnasio/Semanas/`, y reportes en `Gimnasio/Reportes/`.
- **Nutrición**: lee mi plan desde Sheets y guarda un seguimiento diario en `Nutrición/Registro/`.
- **Formación y Aprender**: temas con plan (casillas), sesiones de estudio y cronómetro.

## Objetivo

Convertir HQ en una **app nativa de Windows con Tauri 2**:

1. **Backend en Rust** que reemplace `server.mjs` con **paridad exacta** de la API HTTP: mismas rutas, mismos métodos, mismos JSON (nombres de campos, tipos, `null`, orden de claves del frontmatter), mismos códigos de error y mensajes en español. Tiene que servir los archivos de `public/` desde disco, para que yo pueda seguir editando la interfaz sin recompilar.
2. Seguir escuchando en `127.0.0.1:<puerto de hq.config.json>`, para que el acceso desde el celular con `tailscale serve` siga funcionando.
3. **Ventana nativa** (WebView2) que cargue la interfaz desde ese servidor. Al cerrar la ventana, la app se oculta en la **bandeja del sistema** y el servidor sigue corriendo. Menú de bandeja: Abrir HQ, Iniciar con Windows (casilla con `tauri-plugin-autostart`, arranca oculta con `--oculto`) y Salir. **Una sola instancia** (`tauri-plugin-single-instance`).
4. Si el puerto ya está ocupado (por ejemplo, el servidor Node viejo), mostrar un aviso claro en vez de fallar en silencio.
5. Un `.exe` de release liviano y rápido: arranque en frío por debajo de 1 s, consumo de memoria contenido, sin ventana de consola.

### Lo que el backend tiene que replicar (ver `server.mjs`)

- Índice del vault en memoria: recorrido recursivo ignorando `.obsidian`, `.git`, `.trash`, `node_modules`, `.claude`, `.github` y todo lo que empiece con punto. Parser de frontmatter compatible: escalares, booleanos, números, listas `[a, b]` y `- item`, comillas dobles con escapes JSON, comillas simples. `excerpt` de 260 caracteres. `checks` = [hechas, total] de casillas `- [ ]` fuera de bloques de código.
- Vigilancia de cambios con `notify`: marca el índice como sucio y emite el evento SSE `cambio` con 400 ms de debounce, ignorando `.obsidian`/`.git`/`.trash`. Ping cada 25 s.
- Rutas: `config`, `overview`, `carpeta`, `carpetas`, `note` (GET/PUT/PATCH/DELETE → mover a `.trash`), `nota` (POST), `carpeta` (POST), `check`, `tareas`, `registro` (GET/POST), `diario`, `resolver`, `archivo`, `events`, `json` (GET/PUT, solo `.json` dentro del vault), `hoja` (Google Sheets CSV con caché de 60 s y los mismos mensajes de error), `correo/cuentas`, `correo/importar` (lanza `python scripts/importar-correo.py` sin ventana, con timeout de 10 min y una ejecución a la vez), `preferencias`, `portadas` (GET/POST base64/DELETE), `/vault/*`, `/portadas/*` y estáticos con fallback a `index.html`.
- Seguridad, igual o mejor que hoy:
  - Todas las rutas confinadas al vault (sin `..` ni rutas absolutas).
  - Comprobación del header `Host`: localhost, 127.0.0.1, `[::1]`, `*.ts.net` o `hostsPermitidos`.
  - Las escrituras exigen `Content-Type: application/json`.
  - Límites de tamaño de cuerpo (25 MB para portadas).
  - Solo URLs `https://docs.google.com/spreadsheets/...` para Sheets.
- Fechas y horas en hora local. Formatos `AAAA-MM-DD` y `AAAA-MM-DDTHH:MM`. Nombres de días y meses en español.

## Reglas de trabajo

- **Primero lee** `server.mjs`, `public/app.js` (cómo usa cada endpoint), `hq.config.json` y `D:\Cerebro\CLAUDE.md`. Después propón la arquitectura (módulos, crates y versiones, manejo de errores, estado compartido, testing) y **espera mi OK**.
- Inicializa git en `D:\CerebroWeb` antes de tocar nada, con un `.gitignore` que excluya `cuentas-correo.json`, `.correo-estado.json`, `hq.preferencias.json`, `portadas/`, `vault/`, `target/` y `node_modules/`. Commits chicos y descriptivos.
- **No toques mis datos reales de `D:\Cerebro`** salvo para pruebas imprescindibles. Si creas algo de prueba, márcalo con `PRUEBA` y bórralo al terminar. Para los tests de integración, usa un vault temporal.
- **Paridad verificable:** arranca el servidor Node en el puerto 4321 (`HQ_PORT=4321 node server.mjs`) y el de Rust en 4320. Compara las respuestas JSON de todas las rutas de lectura con un script y muéstrame el resultado. Las diferencias de orden de claves también cuentan.
- No borres `server.mjs` ni cambies la interfaz. El Node queda como respaldo hasta que yo diga.
- Si algo necesita que yo intervenga (contraseñas, cuentas, instalar algo), pídemelo. No lo hagas por mí.
- Al final dame: cómo compilar (`cargo build --release` / `cargo tauri build`), dónde queda el `.exe`, cómo activar el inicio con Windows, qué probaste y qué no.

## Entorno

Windows 11, Rust 1.99 (cargo instalado), WebView2 instalado, Node 26, Python 3.15 en `C:\Python315`. Hay un esqueleto empezado en `D:\CerebroWeb\src-tauri\` (`Cargo.toml`, `build.rs`, `tauri.conf.json`): revísalo y corrígelo o reemplázalo si hace falta.
