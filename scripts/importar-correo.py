"""Importa los correos de varias cuentas de Gmail al vault (solo lectura, por IMAP).

Los scripts captan, la IA decide: cada correo se guarda como una nota en
Bandeja/maquina/correos/<cuenta>/ con sus propiedades (de, asunto, fecha, estado...).
No marca nada como leído en Gmail (usa BODY.PEEK y abre el buzón en solo lectura).

Configuración: copia cuentas-correo.ejemplo.json a cuentas-correo.json y rellena cada cuenta
con una "contraseña de aplicación" de Google (https://myaccount.google.com/apppasswords).
Ese archivo queda en la carpeta del panel, fuera del vault (no se sube a GitHub con tus notas).

Uso:  python scripts/importar-correo.py
"""
import email
import imaplib
import json
import re
import sys
from datetime import datetime, timedelta
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape
from pathlib import Path

if sys.stdout:  # con pythonw (tarea programada, sin ventana) no hay consola
    sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "hq.config.json").read_text(encoding="utf-8"))
vault = Path(cfg["vault"])
vault = vault if vault.is_absolute() else (ROOT / vault).resolve()
bandeja = next((s for s in cfg.get("secciones", []) if s.get("tipo") == "bandeja"), {"carpeta": "Bandeja", "correos": "maquina/correos"})
destino = vault / bandeja["carpeta"] / bandeja.get("correos", "maquina/correos")
registro = vault / cfg.get("sistema", {}).get("registro", "Sistema/maquina/registro-ia.jsonl")
cuentas_f = ROOT / "cuentas-correo.json"
estado_f = ROOT / ".correo-estado.json"

if not cuentas_f.exists():
    print("Falta cuentas-correo.json: copia cuentas-correo.ejemplo.json y rellena tus cuentas.")
    sys.exit(1)
conf = json.loads(cuentas_f.read_text(encoding="utf-8"))
estado = json.loads(estado_f.read_text(encoding="utf-8")) if estado_f.exists() else {}
MAX_POR_CUENTA = int(conf.get("max_por_vez", 300))
DIAS_INICIALES = int(conf.get("dias_iniciales", 30))


def dec(v) -> str:
    try:
        return str(make_header(decode_header(v or ""))).strip()
    except Exception:  # noqa: BLE001
        return str(v or "").strip()


def limpio(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|#^\[\]\r\n\t]', "", s).strip()[:70] or "sin asunto"


def q(s) -> str:
    return json.dumps(str(s), ensure_ascii=False)


def texto(msg) -> str:
    plano, html = None, None
    for part in msg.walk() if msg.is_multipart() else [msg]:
        if part.get_content_maintype() == "multipart" or "attachment" in str(part.get("Content-Disposition", "")):
            continue
        try:
            data = part.get_payload(decode=True)
            if data is None:
                continue
            t = data.decode(part.get_content_charset() or "utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        if part.get_content_type() == "text/plain" and plano is None:
            plano = t
        elif part.get_content_type() == "text/html" and html is None:
            html = t
    if plano:
        return plano
    if html:
        html = re.sub(r"(?is)<(script|style).*?</\1>", "", html)
        html = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", html)
        return unescape(re.sub(r"<[^>]+>", "", html))
    return ""


total, importantes, errores, cuentas_ok = 0, 0, [], 0
for c in conf.get("cuentas", []):
    nombre, usuario, clave = c.get("nombre") or c.get("email"), c.get("email"), str(c.get("password_app", "")).replace(" ", "")
    if not usuario or not clave or set(clave.lower()) == {"x"}:
        print(f"[{nombre}] sin contraseña de aplicación, la salto.")
        continue
    try:
        M = imaplib.IMAP4_SSL(c.get("servidor", "imap.gmail.com"), 993)
        M.login(usuario, clave)
        M.select(c.get("carpeta", "INBOX"), readonly=True)
        ult = estado.get(usuario, {}).get("uid")
        if ult:
            typ, data = M.uid("search", None, f"UID {int(ult) + 1}:*")
        else:
            desde = (datetime.now() - timedelta(days=DIAS_INICIALES)).strftime("%d-%b-%Y")
            typ, data = M.uid("search", None, f"SINCE {desde}")
        uids = [u for u in (data[0] or b"").split() if not ult or int(u) > int(ult)]
        uids = uids[-MAX_POR_CUENTA:]
        carpeta = destino / limpio(nombre)
        carpeta.mkdir(parents=True, exist_ok=True)
        n = 0
        for uid in uids:
            typ, resp = M.uid("fetch", uid, "(X-GM-LABELS BODY.PEEK[])")
            if typ != "OK" or not resp or not isinstance(resp[0], tuple):
                continue
            cab, raw = resp[0]
            msg = email.message_from_bytes(raw)
            asunto = dec(msg.get("Subject")) or "(sin asunto)"
            nom, mail = parseaddr(dec(msg.get("From")))
            try:
                f = parsedate_to_datetime(msg.get("Date")).astimezone()
            except Exception:  # noqa: BLE001
                f = datetime.now()
            labels = cab.decode(errors="replace")
            imp = "\\\\Important" in labels or "\\Important" in labels
            cuerpo = re.sub(r"\n{3,}", "\n\n", texto(msg)).strip()[:8000]
            archivo = carpeta / f"{f:%Y-%m-%d %H%M} {limpio(asunto)} {uid.decode()}.md"
            if not archivo.exists():
                archivo.write_text(
                    "---\n"
                    f"buzon: {q(nombre)}\nde: {q(nom or mail)}\nde_email: {q(mail)}\nasunto: {q(asunto)}\n"
                    f"fecha: \"{f:%Y-%m-%d %H:%M}\"\nestado: {'importante' if imp else 'nuevo'}\nuid: {uid.decode()}\n"
                    "---\n\n" + cuerpo + "\n",
                    encoding="utf-8",
                )
                n += 1
                importantes += imp
            estado.setdefault(usuario, {})["uid"] = int(uid)
        M.logout()
        total += n
        cuentas_ok += 1
        print(f"[{nombre}] {n} correos nuevos")
    except Exception as e:  # noqa: BLE001
        errores.append(f"{nombre}: {e}")
        print(f"[{nombre}] ERROR: {e}")

estado_f.write_text(json.dumps(estado, indent=2), encoding="utf-8")
registro.parent.mkdir(parents=True, exist_ok=True)
with registro.open("a", encoding="utf-8") as fh:
    texto_log = f"Importados {total} correos de {cuentas_ok} cuentas; {importantes} importantes."
    if errores:
        texto_log += " Errores: " + "; ".join(errores)
    fh.write(json.dumps({
        "fecha": datetime.now().strftime("%Y-%m-%dT%H:%M"), "estado": "error" if errores and not cuentas_ok else "hecho",
        "seccion": "Bandeja", "subseccion": "Bandeja", "agente": "Script", "texto": texto_log,
    }, ensure_ascii=False) + "\n")
print(texto_log)
sys.exit(1 if errores and not cuentas_ok else 0)
