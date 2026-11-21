//! Errores de la API. Se serializan como `{"error": "..."}` con el mismo código y mensaje que `server.mjs`.

use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// Error con código y mensaje explícitos (los `err(status, msg)` del servidor Node).
    #[error("{1}")]
    Estado(StatusCode, String),
    /// Error de E/S. `NotFound` se responde como 404 "No encontrado", igual que ENOENT en Node.
    #[error(transparent)]
    Io(#[from] std::io::Error),
    /// JSON inválido en un archivo del disco (no en el cuerpo de la petición).
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl ApiError {
    pub fn nuevo(status: StatusCode, msg: impl Into<String>) -> Self {
        Self::Estado(status, msg.into())
    }
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::nuevo(StatusCode::BAD_REQUEST, msg)
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::nuevo(StatusCode::NOT_FOUND, msg)
    }

    pub fn status(&self) -> StatusCode {
        match self {
            Self::Estado(s, _) => *s,
            Self::Io(e) if e.kind() == std::io::ErrorKind::NotFound => StatusCode::NOT_FOUND,
            Self::Io(_) | Self::Json(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn mensaje(&self) -> String {
        match self {
            Self::Io(e) if e.kind() == std::io::ErrorKind::NotFound => "No encontrado".to_owned(),
            otro => otro.to_string(),
        }
    }
}

pub type Resultado<T> = Result<T, ApiError>;

/// Respuesta JSON con las mismas cabeceras que el servidor Node.
pub fn json_response(status: StatusCode, valor: &serde_json::Value) -> Response {
    let cuerpo = serde_json::to_string(valor).unwrap_or_else(|_| "null".to_owned());
    (status, [(header::CONTENT_TYPE, "application/json; charset=utf-8"), (header::CACHE_CONTROL, "no-store")], cuerpo)
        .into_response()
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        if status.is_server_error() {
            tracing::error!(error = %self, "error interno");
        }
        json_response(status, &serde_json::json!({ "error": self.mensaje() }))
    }
}
