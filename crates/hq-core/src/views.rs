//! Vistas de lectura sobre el índice: `config`, `overview`, `carpeta`, `carpetas`, `resolver`.

use std::cmp::Ordering;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{json, Map, Value};
use unicode_normalization::UnicodeNormalization;

use crate::error::Resultado;
use crate::paths::{self, re};
use crate::state::App;
use crate::vault::{Indice, Nota};
use crate::{fechas, js, prefs, registro};

static PORTADA: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^portada\.(png|jpe?g|gif|webp)$"));

fn portada(i: &Indice, carpeta: Option<&str>) -> Value {
    let Some(c) = carpeta else { return Value::Null };
    i.archivos
        .iter()
        .find(|f| paths::padre(f) == c && PORTADA.is_match(paths::base(f)))
        .map_or(Value::Null, |f| json!(f))
}

pub async fn config(app: &App) -> Value {
    let i = app.vault.indice().await;
    let cfg = &app.cfg;
    let sis = &cfg.sistema;
    let secciones: Vec<Value> = cfg
        .secciones()
        .into_iter()
        .map(|s| {
            let carpeta = s.get("carpeta").and_then(Value::as_str).map(str::to_owned);
            let mut m = s.as_object().cloned().unwrap_or_default();
            m.insert("portada".into(), portada(&i, carpeta.as_deref()));
            Value::Object(m)
        })
        .collect();
    let registro = sis.registro();
    let o = |k: &str, defecto: &str| cfg.raw.get(k).filter(|x| js::truthy(Some(x))).cloned().unwrap_or(json!(defecto));
    json!({
        "nombre": o("nombre", "HQ"),
        "vault": cfg.vault.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
        "moneda": o("moneda", "ARS"),
        "locale": o("locale", "es-AR"),
        "sistema": sis.como_json(),
        "secciones": secciones,
        "portadas": {
            "tareas": portada(&i, Some(&sis.tareas())),
            "decidir": portada(&i, Some(&sis.decidir())),
            "aprendido": portada(&i, Some(&sis.aprendido())),
            "ia": portada(&i, Some(paths::padre(&registro))),
        },
        "prefs": prefs::leer(cfg).await,
    })
}

const HECHO: [&str; 6] = ["hecha", "hecho", "completada", "completado", "done", "true"];

fn hecha(n: &Nota) -> bool {
    HECHO.contains(&js::string_o_vacio(js::coalesce(&n.data, &["estado", "hecha"])).to_lowercase().as_str())
}

fn pendiente(n: &Nota) -> bool {
    !js::truthy(n.data.get("estado")) || js::string(n.data.get("estado")).to_lowercase() == "pendiente"
}

pub async fn overview(app: &App) -> Value {
    let i = app.vault.indice().await;
    let sis = &app.cfg.sistema;
    let hoy = fechas::hoy();
    let tareas = sis.tareas();
    let pend: Vec<&Nota> = i.notas.iter().filter(|n| n.en_carpeta(&tareas) && !hecha(n)).collect();
    let semana: Vec<Value> = (0..7)
        .map(|d| {
            let f = fechas::hoy_mas(d);
            let n = pend.iter().filter(|t| js::fecha_de(t.data.get("fecha")) == f).count();
            json!({ "fecha": f, "pendientes": n })
        })
        .collect();
    let por_hacer = pend
        .iter()
        .filter(|t| {
            let f = js::fecha_de(t.data.get("fecha"));
            f.is_empty() || f <= hoy
        })
        .count();
    let decidir = i.notas.iter().filter(|n| n.en_carpeta(&sis.decidir()) && pendiente(n)).count();
    let ia_hoy = registro::leer(&app.vault, &sis.registro())
        .await
        .iter()
        .filter(|e| js::slice_utf16(&js::string(e.get("fecha")), 10) == hoy)
        .count();
    let aprendido = i.notas.iter().filter(|n| n.en_carpeta(&sis.aprendido())).count();

    let mut badges = Map::new();
    badges.insert("tareas".into(), json!(format!("{por_hacer} por hacer")));
    badges.insert("ia".into(), json!(format!("{ia_hoy} hoy")));
    badges.insert("decidir".into(), json!(format!("{decidir} esperan")));
    badges.insert("aprendido".into(), json!(format!("{aprendido} lecciones")));
    for s in app.cfg.secciones() {
        let id = js::string(s.get("id"));
        let carpeta = js::string(s.get("carpeta"));
        let ns = i.notas.iter().filter(|n| n.en_carpeta(&carpeta));
        let texto = if s.get("tipo").and_then(Value::as_str) == Some("bandeja") {
            let imp = ns.filter(|n| js::string(n.data.get("estado")).to_lowercase() == "importante").count();
            format!("{imp} importantes")
        } else {
            format!("{} notas", ns.count())
        };
        badges.insert(id, json!(texto));
    }
    json!({
        "hoy": hoy,
        "semana": semana,
        "porHacer": por_hacer,
        "decidir": decidir,
        "iaHoy": ia_hoy,
        "badges": badges,
        "numeros": { "tareas": por_hacer, "decidir": decidir },
    })
}

pub async fn carpeta(app: &App, folder: Option<&str>, recursivo: bool) -> Resultado<Value> {
    let i = app.vault.indice().await;
    let folder = paths::sin_barras(folder.unwrap_or("")).to_owned();
    paths::confinar(app.vault.raiz(), &folder)?;
    if !folder.is_empty() && !i.carpetas.contains(&folder) {
        return Ok(json!({ "folder": folder, "existe": false, "subcarpetas": [], "notas": [], "archivos": [] }));
    }
    let subcarpetas: Vec<Value> = i
        .carpetas
        .iter()
        .filter(|d| paths::padre(d) == folder)
        .map(|d| json!({ "path": d, "nombre": paths::base(d), "notas": i.notas.iter().filter(|n| n.en_carpeta(d)).count() }))
        .collect();
    let notas: Vec<&Nota> =
        i.notas.iter().filter(|n| if recursivo { n.en_carpeta(&folder) } else { n.folder == folder }).collect();
    let archivos: Vec<&String> = i.archivos.iter().filter(|f| paths::padre(f) == folder).collect();
    Ok(json!({ "folder": folder, "existe": true, "subcarpetas": subcarpetas, "notas": notas, "archivos": archivos }))
}

/// Clave de orden aproximada a `localeCompare('es')`: espacios < puntuación < símbolos < dígitos < letras,
/// letras sin acentos y sin distinguir mayúsculas (con desempate por el texto original).
fn clave_es(s: &str) -> Vec<(u8, char)> {
    s.nfd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .map(|c| {
            let clase = if c.is_whitespace() {
                0
            } else if c.is_ascii_punctuation() && !"$+<=>^`|~".contains(c) {
                1
            } else if c.is_numeric() {
                3
            } else if c.is_alphabetic() {
                4
            } else {
                2
            };
            (clase, c.to_lowercase().next().unwrap_or(c))
        })
        .collect()
}

/// Desempate como ICU: primero sin acento antes que con acento, luego minúscula antes que mayúscula.
fn desempate(s: &str) -> (Vec<bool>, Vec<bool>) {
    let acentos = s.nfd().map(|c| ('\u{300}'..='\u{36f}').contains(&c)).collect();
    let mayus = s.chars().map(char::is_uppercase).collect();
    (acentos, mayus)
}

pub fn comparar_es(a: &str, b: &str) -> Ordering {
    clave_es(a).cmp(&clave_es(b)).then_with(|| desempate(a).cmp(&desempate(b))).then_with(|| a.cmp(b))
}

pub async fn carpetas(app: &App) -> Value {
    let i = app.vault.indice().await;
    let mut v: Vec<&String> = i.carpetas.iter().filter(|d| !d.starts_with('.') && !d.contains("/.")).collect();
    v.sort_by(|a, b| comparar_es(a, b));
    json!(v)
}

pub async fn resolver(app: &App, nombre: Option<&str>) -> Option<String> {
    let i = app.vault.indice().await;
    let n = nombre.unwrap_or("");
    let n = n.strip_suffix(".md").or_else(|| n.strip_suffix(".MD")).unwrap_or(n).to_lowercase();
    let ultimo = n.rsplit('/').next().unwrap_or("").to_owned();
    i.notas
        .iter()
        .find(|x| x.path.to_lowercase() == format!("{n}.md"))
        .or_else(|| i.notas.iter().find(|x| x.name.to_lowercase() == ultimo))
        .map(|x| x.path.clone())
}

pub async fn buscar_archivo(app: &App, nombre: Option<&str>) -> Option<String> {
    let i = app.vault.indice().await;
    let n = nombre.unwrap_or("").to_lowercase();
    let ultimo = n.rsplit('/').next().unwrap_or("").to_owned();
    i.archivos
        .iter()
        .find(|f| f.to_lowercase() == n)
        .or_else(|| i.archivos.iter().find(|f| paths::base(f).to_lowercase() == ultimo))
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orden_en_español() {
        let mut v = vec!["Ventas", "Aprender", "Formación/maquina", "Formación", "Finanzas", "Contenido/YouTube"];
        v.sort_by(|a, b| comparar_es(a, b));
        assert_eq!(v, ["Aprender", "Contenido/YouTube", "Finanzas", "Formación", "Formación/maquina", "Ventas"]);
        assert_eq!(comparar_es("nutricion", "Nutrición"), Ordering::Less);
        assert_eq!(comparar_es("nutricion", "Nutricion"), Ordering::Less);
    }
}
