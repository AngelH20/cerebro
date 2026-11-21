//! API HTTP compatible 1:1 con `server.mjs`.

mod api;
mod entrada;
mod estaticos;
mod guard;
mod sse;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::{middleware, Router};

use crate::state::App;

/// Sirve la API en un listener ya abierto hasta que el proceso termine.
pub async fn servir(app: Arc<App>, listener: tokio::net::TcpListener) -> std::io::Result<()> {
    axum::serve(listener, router(app)).await
}

/// Construye el router completo (API + archivos del vault, portadas y la interfaz).
pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/api/config", get(api::config))
        .route("/api/overview", get(api::overview))
        .route("/api/carpeta", get(api::carpeta).post(api::carpeta_crear))
        .route("/api/carpetas", get(api::carpetas))
        .route("/api/note", get(api::nota).put(api::nota_escribir).patch(api::nota_campos).delete(api::nota_borrar))
        .route("/api/nota", post(api::nota_crear))
        .route("/api/tareas", post(api::tarea_crear))
        .route("/api/check", post(api::casilla))
        .route("/api/registro", get(api::registro).post(api::registrar))
        .route("/api/diario", get(api::diario))
        .route("/api/json", get(api::json_leer).put(api::json_escribir))
        .route("/api/resolver", get(api::resolver))
        .route("/api/archivo", get(api::archivo))
        .route("/api/hoja", get(api::hoja))
        .route("/api/correo/cuentas", get(api::correo_cuentas))
        .route("/api/correo/importar", post(api::correo_importar))
        .route("/api/preferencias", get(api::prefs).put(api::prefs_guardar))
        .route("/api/portadas", get(api::portadas).post(api::portada_subir).delete(api::portada_borrar))
        .route("/api/events", get(sse::eventos))
        // Node respondía 404 a cualquier método o ruta de la API que no existiera.
        .method_not_allowed_fallback(api::no_encontrada)
        .fallback(estaticos::servir)
        .layer(middleware::from_fn_with_state(app.clone(), guard::guardia))
        // Los límites de tamaño los aplica cada ruta con `entrada::Cuerpo`.
        .layer(DefaultBodyLimit::disable())
        .with_state(app)
}
