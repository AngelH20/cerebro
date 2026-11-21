"""Capta los últimos vídeos de los canales que sigues (RSS público de YouTube, sin API key)
y los guarda como notas en Contenido/YouTube/Investigación.

Los scripts captan, la IA decide: las notas se crean con `util` vacío para que la IA
las revise y rellene `util` y `motivo`.

Uso:  python scripts/captar-youtube.py
Canales: Contenido/YouTube/maquina/canales.txt (un channel_id por línea).
"""
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "hq.config.json").read_text(encoding="utf-8"))
vault = Path(cfg["vault"])
vault = vault if vault.is_absolute() else (ROOT / vault).resolve()

canales_f = vault / "Contenido/YouTube/maquina/canales.txt"
destino = vault / "Contenido/YouTube/Investigación"
registro = vault / cfg.get("sistema", {}).get("registro", "Sistema/maquina/registro-ia.jsonl")
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}


def limpio(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|#^\[\]]', "", s).strip()[:90]


nuevos = 0
canales = 0
for linea in canales_f.read_text(encoding="utf-8").splitlines():
    cid = linea.split("#")[0].strip()
    if not cid:
        continue
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "hq-captador/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            root = ET.fromstring(r.read())
    except Exception as e:  # noqa: BLE001
        print("Error con", cid, e)
        continue
    canales += 1
    canal = (root.findtext("a:title", default=cid, namespaces=NS) or cid).replace('"', "")
    for e in root.findall("a:entry", NS):
        titulo = e.findtext("a:title", default="", namespaces=NS)
        vid = e.findtext("yt:videoId", default="", namespaces=NS)
        f = destino / f"{limpio(titulo) or vid}.md"
        if f.exists():
            continue
        stats = e.find("media:group/media:community/media:statistics", NS)
        vistas = stats.get("views") if stats is not None else 0
        desc = e.findtext("media:group/media:description", default="", namespaces=NS)
        publicado = (e.findtext("a:published", default="", namespaces=NS) or "")[:10]
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(
            f'---\ncanal: "{canal}"\nvistas: {vistas or 0}\npublicado: {publicado}\n'
            f"url: https://youtu.be/{vid}\nutil:\nmotivo:\ncaptado: {datetime.now():%Y-%m-%d}\n---\n\n{desc[:1500]}\n",
            encoding="utf-8",
        )
        nuevos += 1

registro.parent.mkdir(parents=True, exist_ok=True)
with registro.open("a", encoding="utf-8") as fh:
    fh.write(json.dumps({
        "fecha": datetime.now().strftime("%Y-%m-%dT%H:%M"),
        "estado": "hecho",
        "seccion": "Contenido",
        "subseccion": "YouTube",
        "agente": "Script",
        "texto": f"Captados {nuevos} vídeos nuevos de {canales} canales.",
    }, ensure_ascii=False) + "\n")
print(f"{nuevos} vídeos nuevos")
