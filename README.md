# HQ · panel local para tu vault de Obsidian

Un "cuartel general" visual encima de tu vault de Obsidian: carrusel de secciones con escenas pixel art animadas,
tareas de la semana, todo lo que ha hecho la IA, lo que te toca decidir y una vista de base de datos para cada carpeta.
Todo sigue siendo **carpetas y notas Markdown** en tu ordenador, así que funciona con cualquier IA (Claude, Codex, Gemini, Grok…).

## Arrancar: app nativa (Rust + Tauri)

Abre **HQ** desde el Escritorio o el menú Inicio (`D:\CerebroWeb\HQ.exe`). Arranca en menos de 1 s y lleva el servidor dentro.

- **Cerrar la ventana** la oculta en la **bandeja del sistema** (junto al reloj): el servidor sigue activo para el celular.
- Menú de la bandeja: **Abrir HQ**, **Iniciar con Windows** (arranca oculta) y **Salir**.
- Solo puede haber una abierta: si la abres de nuevo, enfoca la que ya está.
- Si el puerto 4320 está ocupado (por ejemplo por `node server.mjs`), avisa y te deja usar ese servidor o salir.
- La interfaz (`public/`) se lee desde disco: puedes editarla sin recompilar.
- Logs: `%LOCALAPPDATA%\com.hq.panel\logs` (uno por día, se guardan 7).

### Compilar

```powershell
cargo build --release -p hq          # app de escritorio → target\release\hq.exe
cargo build --release -p hq-server   # mismo servidor sin ventana → target\release\hq-server.exe
cargo test --workspace               # tests unitarios y de integración (vault temporal)
cargo clippy --workspace --all-targets -- -D warnings
```

Después de compilar, copia `target\release\hq.exe` a `D:\CerebroWeb\HQ.exe` (los accesos directos apuntan ahí).
El `.exe` no está firmado: con **Smart App Control** activado, Windows lo bloquea.

### Estructura

| Carpeta | Qué es |
|---|---|
| `crates/hq-core` | Núcleo en Rust: vault, frontmatter, API HTTP (axum), Sheets, correo, preferencias |
| `crates/hq-server` | El servidor sin ventana (reemplazo 1:1 de `node server.mjs`) |
| `src-tauri` | La app de escritorio: ventana, bandeja, inicio con Windows, logs |
| `tools/paridad.mjs` | Compara Node y Rust ruta por ruta sobre el vault real (solo lectura) |
| `server.mjs` | Servidor Node original, como respaldo |

Para comprobar que Rust y Node responden igual:

```powershell
$env:HQ_PORT=4321; node server.mjs     # en una terminal
.\target\release\hq-server.exe         # en otra (puerto 4320)
node tools/paridad.mjs                 # 505/505 iguales en la última verificación
```

## Arrancar: servidor Node (respaldo)

```powershell
node scripts/crear-vault-ejemplo.mjs   # solo la primera vez: crea ./vault con datos de ejemplo
node server.mjs                        # abre http://localhost:4320
```

No hay que instalar nada más que Node 18+ (sin `npm install`).

## Usar tu propio vault

En `hq.config.json` cambia `"vault"` por la ruta de tu vault (ahora mismo: `"D:/Cerebro"`) y ajusta `secciones`.
Para crear las carpetas y reglas de HQ en un vault existente sin datos de ejemplo (no sobrescribe nada):

```powershell
node scripts/crear-vault-ejemplo.mjs --vacio
```

Campos de cada sección:

| campo | qué es |
|---|---|
| `carpeta` | carpeta del vault que muestra la sección |
| `escena` | `noche`, `estanque`, `bosque`, `montanas`, `pradera`, `mar`, `atardecer`, `aurora`, `lluvia`, `cristales` |
| `tipo` | vacío (vista genérica), `bandeja` o `finanzas` |
| `icono` | `contenido`, `formacion`, `aprender`, `ventas`, `bandeja`, `finanzas`… |

## Elegir el pixel art de cada sección

Botón de engranaje (arriba a la derecha) → **Ajustes**:
- elige una de las 10 escenas animadas para cada sección,
- o sube tus propias imágenes (PNG, JPG, WEBP o GIF animado; también arrastrándolas). Se guardan en `portadas/`,
- y regula la **intensidad del fondo** y el **desenfoque del cristal**.

Las elecciones se guardan en `hq.preferencias.json`, fuera de tu vault. Otra opción: un `portada.png` dentro de la carpeta de la sección en el vault.

## Cómo está organizado el vault

- **Cada nota es una fila y sus propiedades (frontmatter) son las columnas.** El panel convierte cualquier carpeta en una tabla con filtros automáticos (por `estado`, `etapa` o propiedades sí/no como `util`).
- **`humano/` y `maquina/`** en cada sección: lo que dijiste tú, tal cual, frente a lo que ejecuta y genera la IA.
- `Tareas/` → `estado`, `fecha`, `seccion`, `prioridad`. Se pueden crear y marcar desde el panel.
- `Sistema/Decidir/` → lo que la IA no hace sin tu OK. Aprobar o rechazar desde el panel escribe `estado`, `respondido` y `respuesta` en la nota.
- `Sistema/Aprendido/` → lecciones, una nota por lección.
- `Sistema/maquina/registro-ia.jsonl` → una línea por cada cosa que hace un agente (pestaña **La IA**).
- `Diario/AAAA-MM-DD.md` → botón **Diario de hoy**.
- `CLAUDE.md` / `AGENTS.md` en la raíz del vault: las reglas que lee cualquier agente.

Los cambios que hagas en Obsidian (o que haga la IA) aparecen en el panel al momento, sin recargar.

## Secciones especiales

- **LeAn3D**: pedidos de impresión 3D con tablero (pedido → imprimiendo → listo → entregado → cobrado). Al cobrar, se anota solo el ingreso en Finanzas con la cuenta LeAn3D.
- **Finanzas**: en pesos argentinos (`moneda` y `locale` en `hq.config.json`), filtrable por cuenta (LeAn3D / Personal) y mes.
- **Powerlifting y Nutrición**: lees tus Google Sheets. Comparte la hoja como «Cualquier persona con el enlace → Lector», copia la dirección de la pestaña y pulsa *Vincular hoja*. Calcula 1RM estimado (Epley) y promedios de macros si encuentra esas columnas.
- **Formación y Aprender**: temas con plan (casillas que marcas desde el panel), cronómetro de estudio, sesiones, racha y minutos por semana.
- **Crear sin Obsidian**: botón **+** arriba (nota, tarea o carpeta), *Nueva nota/carpeta* en cada sección, editar, borrar (va a `.trash` de Obsidian) y marcar casillas.

## Correo de Gmail (varias cuentas)

1. En cada cuenta de Google: verificación en 2 pasos activada → crea una contraseña de aplicación en https://myaccount.google.com/apppasswords.
2. Copia `cuentas-correo.ejemplo.json` como `cuentas-correo.json` y pega cada contraseña (ese archivo queda fuera del vault).
3. Pulsa **Traer correos ahora** en Bandeja, o prográmalo:

```powershell
schtasks /create /tn "HQ correo" /sc hourly /tr "python D:\CerebroWeb\scripts\importar-correo.py"
```

## Scripts

| script | para qué |
|---|---|
| `scripts/registrar-ia.mjs` | apunta una acción en el registro: `node scripts/registrar-ia.mjs --seccion Contenido --agente Claude "texto"` |
| `scripts/captar-youtube.py` | trae los últimos vídeos de los canales de `Contenido/YouTube/maquina/canales.txt` (RSS, sin API key) |
| `scripts/copia-github.ps1` | copia diaria del vault a un repositorio privado de GitHub y lo anota en el registro |

Programar la copia cada noche (Programador de tareas de Windows):

```powershell
schtasks /create /tn "HQ copia diaria" /sc daily /st 23:45 /tr "powershell -NoProfile -File D:\CerebroWeb\scripts\copia-github.ps1"
```

## Que arranque solo al encender el PC

Con la app nativa: menú de la bandeja → **Iniciar con Windows**. (Solo con Node: `Win + R` → `shell:startup` y un acceso directo a `iniciar-hq.vbs`; no uses las dos cosas a la vez, ocuparían el mismo puerto.)

## Verlo desde el móvil (Tailscale)

1. Instala Tailscale en el PC y en el móvil con la misma cuenta.
2. En el PC:

```powershell
tailscale serve --bg 4320
```

3. Abre en el móvil la dirección `https://<tu-pc>.<tu-red>.ts.net` que te muestra el comando. Solo funciona dentro de tu red de Tailscale.

El servidor escucha solo en `127.0.0.1` y únicamente acepta peticiones para `localhost` o tu dominio `*.ts.net`.
