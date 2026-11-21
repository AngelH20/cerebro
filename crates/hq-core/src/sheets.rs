//! Google Sheets compartidas como "cualquiera con el enlace puede ver", leídas como CSV.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use axum::http::StatusCode;
use regex::Regex;
use reqwest::Url;
use serde_json::{json, Value};

use crate::error::{ApiError, Resultado};
use crate::fechas;
use crate::paths::re;

const TTL: Duration = Duration::from_secs(60);
const PRIVADA: &str =
    "No puedo leer la hoja: en Sheets pulsa Compartir → \"Cualquier persona con el enlace\" → Lector.";

static GID: LazyLock<Regex> = LazyLock::new(|| re(r"gid=(\d+)"));
static PUBLICADA: LazyLock<Regex> = LazyLock::new(|| re(r"^/spreadsheets/d/e/([\w-]+)"));
static NORMAL: LazyLock<Regex> = LazyLock::new(|| re(r"^/spreadsheets/d/([\w-]+)"));
static HTML: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^\s*<!doctype html"));

/// Convierte el enlace que copias del navegador en la URL de exportación CSV.
pub fn csv_url(u: &str) -> Resultado<String> {
    let url = Url::parse(u).map_err(|_| ApiError::bad_request("Enlace no válido"))?;
    if url.scheme() != "https" || url.host_str() != Some("docs.google.com") || !url.path().starts_with("/spreadsheets/")
    {
        return Err(ApiError::bad_request("Solo se admiten enlaces de Google Sheets"));
    }
    let resto = format!(
        "{}{}",
        url.fragment().map(|f| format!("#{f}")).unwrap_or_default(),
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    );
    let gid = GID.captures(&resto).and_then(|c| c.get(1)).map(|m| format!("&gid={}", m.as_str())).unwrap_or_default();
    if let Some(id) = PUBLICADA.captures(url.path()).and_then(|c| c.get(1)) {
        return Ok(format!("https://docs.google.com/spreadsheets/d/e/{}/pub?output=csv{gid}", id.as_str()));
    }
    let id = NORMAL
        .captures(url.path())
        .and_then(|c| c.get(1))
        .ok_or_else(|| ApiError::bad_request("No encuentro el ID de la hoja en el enlace"))?;
    Ok(format!("https://docs.google.com/spreadsheets/d/{}/export?format=csv{gid}", id.as_str()))
}

/// CSV (RFC 4180) a filas de celdas, igual que el parser de Node.
pub fn parse_csv(txt: &str) -> Vec<Vec<String>> {
    let mut filas = Vec::new();
    let (mut fila, mut celda, mut comillas) = (Vec::new(), String::new(), false);
    let mut cs = txt.chars().peekable();
    while let Some(c) = cs.next() {
        if comillas {
            match c {
                '"' if cs.peek() == Some(&'"') => {
                    celda.push('"');
                    cs.next();
                }
                '"' => comillas = false,
                otro => celda.push(otro),
            }
            continue;
        }
        match c {
            '"' => comillas = true,
            ',' => fila.push(std::mem::take(&mut celda)),
            '\n' | '\r' => {
                if c == '\r' && cs.peek() == Some(&'\n') {
                    cs.next();
                }
                fila.push(std::mem::take(&mut celda));
                filas.push(std::mem::take(&mut fila));
            }
            otro => celda.push(otro),
        }
    }
    if !celda.is_empty() || !fila.is_empty() {
        fila.push(celda);
        filas.push(fila);
    }
    filas
}

pub struct Hojas {
    http: reqwest::Client,
    cache: Mutex<HashMap<String, (Instant, Value)>>,
}

impl Hojas {
    pub fn new() -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::builder().user_agent("hq-panel").timeout(Duration::from_secs(20)).build()?;
        Ok(Self { http, cache: Mutex::new(HashMap::new()) })
    }

    fn en_cache(&self, url: &str) -> Option<Value> {
        let c = self.cache.lock().ok()?;
        c.get(url).filter(|(t, _)| t.elapsed() < TTL).map(|(_, v)| v.clone())
    }

    pub async fn leer(&self, enlace: Option<&str>, forzar: bool) -> Resultado<Value> {
        let csv = csv_url(enlace.unwrap_or("null"))?;
        if !forzar {
            if let Some(v) = self.en_cache(&csv) {
                return Ok(v);
            }
        }
        let error = |m: &str| ApiError::nuevo(StatusCode::BAD_GATEWAY, m);
        let r = self.http.get(&csv).send().await.map_err(|_| error("No hay conexión con Google Sheets"))?;
        let status = r.status();
        if !status.is_success() {
            return Err(if matches!(status.as_u16(), 401 | 403 | 404) {
                error(PRIVADA)
            } else {
                error(&format!("Google respondió {}", status.as_u16()))
            });
        }
        let es_html = r
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|t| t.contains("text/html"));
        let txt = r.text().await.map_err(|_| error("No hay conexión con Google Sheets"))?;
        if es_html || HTML.is_match(&txt) {
            return Err(error(PRIVADA));
        }
        let datos = json!({ "filas": parse_csv(&txt), "leido": fechas::ahora_ms() });
        if let Ok(mut c) = self.cache.lock() {
            c.insert(csv, (Instant::now(), datos.clone()));
        }
        Ok(datos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_de_exportacion() {
        assert_eq!(
            csv_url("https://docs.google.com/spreadsheets/d/AbC-1_2/edit?gid=189#gid=189").ok().as_deref(),
            Some("https://docs.google.com/spreadsheets/d/AbC-1_2/export?format=csv&gid=189")
        );
        assert_eq!(
            csv_url("https://docs.google.com/spreadsheets/d/e/2PACX-x/pubhtml").ok().as_deref(),
            Some("https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?output=csv")
        );
        assert!(csv_url("http://docs.google.com/spreadsheets/d/x").is_err());
        assert!(csv_url("https://evil.com/spreadsheets/d/x").is_err());
        assert!(csv_url("null").is_err());
    }

    #[test]
    fn csv_con_comillas() {
        assert_eq!(
            parse_csv("a,\"b,c\",\"d\"\"e\"\r\n1,,3\n\"x\ny\""),
            vec![vec!["a", "b,c", "d\"e"], vec!["1", "", "3"], vec!["x\ny"]]
        );
        assert_eq!(parse_csv("a\n"), vec![vec!["a"]]);
    }
}
