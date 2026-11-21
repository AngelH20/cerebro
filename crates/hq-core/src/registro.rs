//! Registro de lo que hace la IA (`Sistema/maquina/registro-ia.jsonl`).

use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;

use crate::error::{ApiError, Resultado};
use crate::vault::Vault;
use crate::{fechas, js, paths};

/// Todas las entradas válidas, en orden. Las líneas rotas o "falsy" se omiten como en Node.
pub async fn leer(v: &Vault, archivo: &str) -> Vec<Value> {
    let Ok(full) = paths::confinar(v.raiz(), archivo) else { return Vec::new() };
    let Ok(texto) = tokio::fs::read_to_string(full).await else { return Vec::new() };
    texto
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .filter(|l| !l.is_empty())
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|x| js::truthy(Some(x)))
        .collect()
}

pub async fn registrar(v: &Vault, archivo: &str, e: &Value) -> Resultado<Value> {
    let o = |k: &str, defecto: Value| e.get(k).filter(|x| js::truthy(Some(x))).cloned().unwrap_or(defecto);
    let texto = js::string_o_vacio(e.get("texto").filter(|x| js::truthy(Some(x)))).trim().to_owned();
    let entrada = json!({
        "fecha": o("fecha", json!(fechas::ahora_iso())),
        "estado": o("estado", json!("hecho")),
        "seccion": o("seccion", json!("General")),
        "subseccion": o("subseccion", json!("")),
        "agente": o("agente", json!("IA")),
        "texto": texto,
    });
    if texto.is_empty() {
        return Err(ApiError::bad_request("Falta el texto"));
    }
    let full = paths::confinar(v.raiz(), archivo)?;
    if let Some(dir) = full.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let mut f = tokio::fs::OpenOptions::new().create(true).append(true).open(&full).await?;
    f.write_all(format!("{}\n", serde_json::to_string(&entrada)?).as_bytes()).await?;
    Ok(entrada)
}
