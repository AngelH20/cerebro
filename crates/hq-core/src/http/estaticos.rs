//! Archivos: la interfaz (`public/`, desde disco para poder editarla sin recompilar),
//! archivos del vault (`/vault/*`) y portadas subidas (`/portadas/*`).

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};

use crate::error::{ApiError, Resultado};
use crate::paths::{self, normalizar};
use crate::prefs::IMAGEN;
use crate::state::App;

fn tipo_mime(p: &Path) -> &'static str {
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "md" => "text/markdown; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "pdf" => "application/pdf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// Envía un archivo con las cabeceras de Node (`no-cache`, `nosniff`).
pub async fn enviar_archivo(full: &Path) -> Resultado<Response> {
    let meta = tokio::fs::metadata(full).await?;
    if !meta.is_file() {
        return Err(ApiError::not_found("No encontrado"));
    }
    let bytes = tokio::fs::read(full).await?;
    let mut r = Response::new(Body::from(bytes));
    let h = r.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(tipo_mime(full)));
    h.insert(header::CONTENT_LENGTH, HeaderValue::from(meta.len()));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    Ok(r)
}

/// `decodeURIComponent` estricto: `None` si hay una secuencia `%` inválida o UTF-8 roto.
pub fn decodificar_ruta(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

async fn resolver(app: &App, p: &str) -> Resultado<Response> {
    if p.starts_with("/api/") {
        return Err(ApiError::not_found("Ruta no encontrada"));
    }
    if let Some(rel) = p.strip_prefix("/vault/") {
        return enviar_archivo(&paths::confinar(app.vault.raiz(), rel)?).await;
    }
    if let Some(nombre) = p.strip_prefix("/portadas/") {
        if !IMAGEN.is_match(nombre) {
            return Err(ApiError::not_found("No encontrado"));
        }
        return enviar_archivo(&app.cfg.portadas.join(nombre)).await;
    }
    let public = &app.cfg.public;
    let relativo = if p == "/" { "index.html" } else { p.trim_start_matches(['/', '\\']) };
    let f = normalizar(&public.join(relativo));
    if f == *public || !f.starts_with(public) {
        return Err(ApiError::nuevo(StatusCode::FORBIDDEN, "No permitido"));
    }
    let f = if tokio::fs::try_exists(&f).await.unwrap_or(false) { f } else { public.join("index.html") };
    enviar_archivo(&f).await
}

pub async fn servir(State(app): State<Arc<App>>, uri: Uri) -> Response {
    let Some(p) = decodificar_ruta(uri.path()) else {
        return ApiError::nuevo(StatusCode::INTERNAL_SERVER_ERROR, "URI malformed").into_response();
    };
    resolver(&app, &p).await.unwrap_or_else(IntoResponse::into_response)
}

#[cfg(test)]
mod tests {
    use super::decodificar_ruta;

    #[test]
    fn decodifica_como_js() {
        assert_eq!(decodificar_ruta("/vault/Formaci%C3%B3n/a.md").as_deref(), Some("/vault/Formación/a.md"));
        assert_eq!(decodificar_ruta("/a%2"), None);
        assert_eq!(decodificar_ruta("/a%zz"), None);
        assert_eq!(decodificar_ruta("/a%FF"), None);
    }
}
