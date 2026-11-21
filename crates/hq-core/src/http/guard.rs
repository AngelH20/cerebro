//! Guardas comunes a todas las peticiones, en el mismo orden que Node:
//! 1. `Host` permitido (localhost o tu dominio de Tailscale) → 403.
//! 2. Ruta bien codificada → 500 "URI malformed".
//! 3. Escrituras con `Content-Type: application/json` → 415.

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{header, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use serde_json::json;

use super::estaticos::decodificar_ruta;
use crate::error::json_response;
use crate::state::App;

fn host_permitido(app: &App, host: &str) -> bool {
    let sin_puerto = match host.rfind(':') {
        Some(i) if !host[i + 1..].is_empty() && host[i + 1..].bytes().all(|b| b.is_ascii_digit()) => &host[..i],
        _ => host,
    };
    let h = sin_puerto.to_lowercase();
    app.cfg.abierto()
        || matches!(h.as_str(), "localhost" | "127.0.0.1" | "[::1]")
        || h.ends_with(".ts.net")
        || app.cfg.hosts_permitidos().contains(&h)
}

pub async fn guardia(State(app): State<Arc<App>>, req: Request, next: Next) -> Response {
    let host = req.headers().get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("");
    if !host_permitido(&app, host) {
        return json_response(StatusCode::FORBIDDEN, &json!({ "error": "Host no permitido" }));
    }
    if decodificar_ruta(req.uri().path()).is_none() {
        return json_response(StatusCode::INTERNAL_SERVER_ERROR, &json!({ "error": "URI malformed" }));
    }
    let escritura = !matches!(*req.method(), Method::GET | Method::HEAD);
    let es_json = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|t| t.contains("application/json"));
    if escritura && !es_json {
        return json_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            &json!({ "error": "Usa Content-Type: application/json" }),
        );
    }
    next.run(req).await
}
