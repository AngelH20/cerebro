//! Preferencias del panel (`hq.preferencias.json`) y portadas subidas (`portadas/`).
//! Viven fuera del vault: son del panel, no de tus notas.

use std::sync::LazyLock;

use axum::http::StatusCode;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use regex::Regex;
use serde_json::{json, Map, Value};
use unicode_normalization::UnicodeNormalization;

use crate::config::Config;
use crate::error::{ApiError, Resultado};
use crate::paths::re;
use crate::{js, sheets};

pub static IMAGEN: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^[A-Za-z0-9_.-]+\.(png|jpe?g|gif|webp)$"));
static ID: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^[a-z0-9_-]{1,40}$"));
static ESCENA: LazyLock<Regex> = LazyLock::new(|| re(r"^[a-z]{1,30}$"));
static DATA_URL: LazyLock<Regex> = LazyLock::new(|| re(r"^data:image/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$"));
static EXTENSION: LazyLock<Regex> = LazyLock::new(|| re(r"\.[^.]+$"));
static NO_PALABRA: LazyLock<Regex> = LazyLock::new(|| re(r"[^A-Za-z0-9_-]+"));

const MAX_IMAGEN: usize = 15_000_000;

/// Base64 tolerante como `Buffer.from(x, 'base64')`.
const B64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

pub async fn leer(cfg: &Config) -> Value {
    match tokio::fs::read_to_string(&cfg.prefs_file).await.ok().and_then(|t| serde_json::from_str(&t).ok()) {
        Some(v) => v,
        None => json!({ "portadas": {}, "fondo": {} }),
    }
}

/// Imágenes de `portadas/`, las más recientes primero.
pub async fn listar_portadas(cfg: &Config) -> Vec<String> {
    let Ok(mut dir) = tokio::fs::read_dir(&cfg.portadas).await else { return Vec::new() };
    let mut v: Vec<(f64, String)> = Vec::new();
    while let Ok(Some(e)) = dir.next_entry().await {
        let nombre = e.file_name().to_string_lossy().into_owned();
        let Ok(meta) = e.metadata().await else { continue };
        if meta.is_file() && IMAGEN.is_match(&nombre) {
            v.push((crate::vault::index::mtime_ms(&meta), nombre));
        }
    }
    v.sort_by(|a, b| b.0.total_cmp(&a.0));
    v.into_iter().map(|(_, n)| n).collect()
}

fn numero_en(x: Option<&Value>, lo: f64, hi: f64, defecto: i64) -> Value {
    match x {
        Some(Value::Number(n)) if n.as_f64().is_some_and(|f| f >= lo && f <= hi) => Value::Number(n.clone()),
        _ => json!(defecto),
    }
}

/// Sanea y guarda las preferencias (misma validación que Node).
pub async fn guardar(cfg: &Config, b: &Value) -> Resultado<Value> {
    let galeria = listar_portadas(cfg).await;
    let mut portadas = Map::new();
    for (id, v) in b.get("portadas").and_then(Value::as_object).into_iter().flatten() {
        if !ID.is_match(id) || !js::truthy(Some(v)) {
            continue;
        }
        match (v.get("imagen").and_then(Value::as_str), v.get("escena").and_then(Value::as_str)) {
            (Some(img), _) if galeria.iter().any(|g| g == img) => {
                portadas.insert(id.clone(), json!({ "imagen": img }));
            }
            (_, Some(esc)) if ESCENA.is_match(esc) => {
                portadas.insert(id.clone(), json!({ "escena": esc }));
            }
            _ => {}
        }
    }
    let fondo = json!({
        "intensidad": numero_en(b.pointer("/fondo/intensidad"), 0.0, 100.0, 80),
        "cristal": numero_en(b.pointer("/fondo/cristal"), 0.0, 40.0, 22),
    });
    let mut hojas = Map::new();
    for (id, lista) in b.get("hojas").and_then(Value::as_object).into_iter().flatten() {
        let Some(lista) = lista.as_array() else { continue };
        if !ID.is_match(id) {
            continue;
        }
        let validas: Vec<Value> = lista
            .iter()
            .filter(|h| sheets::csv_url(&js::string(h.get("url"))).is_ok())
            .take(20)
            .map(|h| {
                let nombre =
                    h.get("nombre").filter(|x| js::truthy(Some(x))).map_or("Hoja".to_owned(), |x| js::string(Some(x)));
                json!({ "nombre": js::slice_utf16(&nombre, 60), "url": js::string(h.get("url")) })
            })
            .collect();
        hojas.insert(id.clone(), Value::Array(validas));
    }
    let prefs = json!({ "portadas": portadas, "fondo": fondo, "hojas": hojas });
    tokio::fs::write(&cfg.prefs_file, serde_json::to_string_pretty(&prefs)?).await?;
    Ok(prefs)
}

/// Nombre de archivo seguro a partir del nombre original (sin acentos, solo `[A-Za-z0-9_-]`).
fn base_segura(nombre: &str) -> String {
    let sin_ext = EXTENSION.replace(nombre, "");
    let sin_acentos: String = sin_ext.nfd().filter(|c| !('\u{300}'..='\u{36f}').contains(c)).collect();
    let limpio = NO_PALABRA.replace_all(&sin_acentos, "-");
    let recortado = js::slice_utf16(limpio.trim_matches('-'), 40);
    if recortado.is_empty() {
        "imagen".to_owned()
    } else {
        recortado
    }
}

pub async fn subir(cfg: &Config, b: &Value) -> Resultado<Value> {
    let data = js::string_o_vacio(b.get("data").filter(|x| js::truthy(Some(x))));
    let c = DATA_URL
        .captures(&data)
        .ok_or_else(|| ApiError::bad_request("Formato no admitido: usa PNG, JPG, WEBP o GIF"))?;
    let tipo = c.get(1).map_or("png", |m| m.as_str());
    let bytes = B64
        .decode(c.get(2).map_or("", |m| m.as_str()))
        .map_err(|_| ApiError::bad_request("Formato no admitido: usa PNG, JPG, WEBP o GIF"))?;
    if bytes.len() > MAX_IMAGEN {
        return Err(ApiError::nuevo(StatusCode::PAYLOAD_TOO_LARGE, "La imagen pesa más de 15 MB"));
    }
    let ext = if tipo == "jpeg" { "jpg" } else { tipo };
    let nombre = js::string_o_vacio(b.get("nombre").filter(|x| js::truthy(Some(x))));
    let base = base_segura(if nombre.is_empty() { "imagen" } else { &nombre });
    tokio::fs::create_dir_all(&cfg.portadas).await?;
    let mut archivo = format!("{base}.{ext}");
    let mut i = 2;
    while cfg.portadas.join(&archivo).exists() {
        archivo = format!("{base}-{i}.{ext}");
        i += 1;
    }
    tokio::fs::write(cfg.portadas.join(&archivo), bytes).await?;
    Ok(json!({ "archivo": archivo }))
}

pub async fn borrar(cfg: &Config, archivo: Option<&str>) -> Resultado<Value> {
    let archivo = archivo.unwrap_or("");
    if !IMAGEN.is_match(archivo) {
        return Err(ApiError::bad_request("Archivo no válido"));
    }
    tokio::fs::remove_file(cfg.portadas.join(archivo)).await?;
    let mut p = leer(cfg).await;
    if let Some(portadas) = p.get_mut("portadas").and_then(Value::as_object_mut) {
        portadas.retain(|_, v| v.get("imagen").and_then(Value::as_str) != Some(archivo));
    }
    guardar(cfg, &p).await?;
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nombres_seguros() {
        assert_eq!(base_segura("Mi Fotó (1).PNG"), "Mi-Foto-1");
        assert_eq!(base_segura("...png"), "imagen");
        assert!(IMAGEN.is_match("a-b_1.webp") && !IMAGEN.is_match("../a.png") && !IMAGEN.is_match("a.exe"));
    }
}
