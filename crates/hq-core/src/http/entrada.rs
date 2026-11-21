//! Extractores: parámetros de consulta (primer valor gana, como `URLSearchParams.get`) y cuerpo JSON con límite.

use std::collections::HashMap;

use axum::extract::{FromRequest, FromRequestParts, Request};
use axum::http::request::Parts;
use axum::http::StatusCode;
use reqwest::Url;
use serde_json::{json, Value};

use crate::error::ApiError;

pub struct Q(HashMap<String, String>);

impl Q {
    pub fn get(&self, k: &str) -> Option<&str> {
        self.0.get(k).map(String::as_str)
    }
}

impl<S: Send + Sync> FromRequestParts<S> for Q {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, ApiError> {
        let mut m = HashMap::new();
        if let Some(q) = parts.uri.query() {
            if let Ok(u) = Url::parse(&format!("http://local/?{q}")) {
                for (k, v) in u.query_pairs() {
                    m.entry(k.into_owned()).or_insert_with(|| v.into_owned());
                }
            }
        }
        Ok(Self(m))
    }
}

/// Cuerpo JSON con tamaño máximo `MAX` bytes. Vacío equivale a `{}`, como en Node.
pub struct Cuerpo<const MAX: usize>(pub Value);

pub const NORMAL: usize = 5_000_000;
pub const JSON_GRANDE: usize = 10_000_000;
pub const PORTADA: usize = 21_000_000;

impl<S: Send + Sync, const MAX: usize> FromRequest<S> for Cuerpo<MAX> {
    type Rejection = ApiError;

    async fn from_request(req: Request, _: &S) -> Result<Self, ApiError> {
        let bytes = axum::body::to_bytes(req.into_body(), MAX)
            .await
            .map_err(|_| ApiError::nuevo(StatusCode::PAYLOAD_TOO_LARGE, "Demasiado grande"))?;
        if bytes.is_empty() {
            return Ok(Self(json!({})));
        }
        serde_json::from_slice(&bytes).map(Self).map_err(|_| ApiError::bad_request("JSON no válido"))
    }
}
