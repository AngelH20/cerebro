//! Manejadores de `/api/*`. Son finos: validan la entrada y delegan en los módulos de dominio.

use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{json, Map, Value};

use super::entrada::{Cuerpo, JSON_GRANDE, NORMAL, PORTADA, Q};
use super::estaticos::enviar_archivo;
use crate::error::{json_response, ApiError, Resultado};
use crate::state::App;
use crate::vault::ops;
use crate::{correo, frontmatter, js, paths, prefs, registro, views};

type Estado = State<Arc<App>>;
type Res = Result<Response, ApiError>;

fn ok(v: &Value) -> Res {
    Ok(json_response(StatusCode::OK, v))
}
fn creado(v: &Value) -> Res {
    Ok(json_response(StatusCode::CREATED, v))
}
fn ruta(q: &Q) -> &str {
    q.get("path").unwrap_or("")
}

pub async fn no_encontrada() -> Response {
    ApiError::not_found("Ruta no encontrada").into_response()
}

pub async fn config(State(app): Estado) -> Res {
    ok(&views::config(&app).await)
}

pub async fn overview(State(app): Estado) -> Res {
    ok(&views::overview(&app).await)
}

pub async fn carpeta(State(app): Estado, q: Q) -> Res {
    ok(&views::carpeta(&app, q.get("path"), q.get("recursive") == Some("1")).await?)
}

pub async fn carpeta_crear(State(app): Estado, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    creado(&ops::crear_carpeta(&app.vault, &b).await?)
}

pub async fn carpetas(State(app): Estado) -> Res {
    ok(&views::carpetas(&app).await)
}

pub async fn nota(State(app): Estado, q: Q) -> Res {
    ok(&ops::leer_nota(&app.vault, ruta(&q)).await?)
}

pub async fn nota_escribir(State(app): Estado, q: Q, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    ok(&ops::escribir(&app.vault, ruta(&q), &js::string_o_vacio(b.get("raw"))).await?)
}

pub async fn nota_campos(State(app): Estado, q: Q, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    let full = paths::confinar(app.vault.raiz(), ruta(&q))?;
    let raw = tokio::fs::read_to_string(&full).await?;
    let campos = b.get("campos").and_then(Value::as_object).cloned().unwrap_or_else(Map::new);
    ok(&ops::escribir(&app.vault, ruta(&q), &frontmatter::set_fields(&raw, &campos)?).await?)
}

pub async fn nota_borrar(State(app): Estado, q: Q) -> Res {
    ok(&ops::borrar_nota(&app.vault, ruta(&q)).await?)
}

pub async fn nota_crear(State(app): Estado, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    creado(&ops::crear_nota(&app.vault, &b).await?)
}

pub async fn tarea_crear(State(app): Estado, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    creado(&ops::crear_tarea(&app.vault, &app.cfg.sistema.tareas(), &b).await?)
}

pub async fn casilla(State(app): Estado, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    ok(&ops::marcar_casilla(&app.vault, &b).await?)
}

pub async fn registro(State(app): Estado) -> Res {
    ok(&json!(registro::leer(&app.vault, &app.cfg.sistema.registro()).await))
}

pub async fn registrar(State(app): Estado, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    creado(&registro::registrar(&app.vault, &app.cfg.sistema.registro(), &b).await?)
}

pub async fn diario(State(app): Estado, q: Q) -> Res {
    ok(&ops::diario(&app.vault, &app.cfg.sistema.diario(), q.get("fecha")).await?)
}

pub async fn json_leer(State(app): Estado, q: Q) -> Res {
    ok(&ops::json_leer(&app.vault, ruta(&q)).await?)
}

pub async fn json_escribir(State(app): Estado, q: Q, Cuerpo(b): Cuerpo<JSON_GRANDE>) -> Res {
    ok(&ops::json_escribir(&app.vault, ruta(&q), b.get("data").unwrap_or(&Value::Null)).await?)
}

pub async fn resolver(State(app): Estado, q: Q) -> Res {
    match views::resolver(&app, q.get("nombre")).await {
        Some(p) => ok(&json!({ "path": p })),
        None => Err(ApiError::not_found("Nota no encontrada")),
    }
}

pub async fn archivo(State(app): Estado, q: Q) -> Resultado<Response> {
    let f = views::buscar_archivo(&app, q.get("nombre"))
        .await
        .ok_or_else(|| ApiError::not_found("Archivo no encontrado"))?;
    enviar_archivo(&paths::confinar(app.vault.raiz(), &f)?).await
}

pub async fn hoja(State(app): Estado, q: Q) -> Res {
    ok(&app.hojas.leer(q.get("url"), q.get("forzar") == Some("1")).await?)
}

pub async fn correo_cuentas(State(app): Estado) -> Res {
    ok(&correo::cuentas(&app.cfg).await)
}

pub async fn correo_importar(State(app): Estado) -> Res {
    ok(&app.correo.importar(app.cfg.root.clone(), app.vault.clone()).await)
}

pub async fn prefs(State(app): Estado) -> Res {
    ok(&prefs::leer(&app.cfg).await)
}

pub async fn prefs_guardar(State(app): Estado, Cuerpo(b): Cuerpo<NORMAL>) -> Res {
    ok(&prefs::guardar(&app.cfg, &b).await?)
}

pub async fn portadas(State(app): Estado) -> Res {
    ok(&json!(prefs::listar_portadas(&app.cfg).await))
}

pub async fn portada_subir(State(app): Estado, Cuerpo(b): Cuerpo<PORTADA>) -> Res {
    creado(&prefs::subir(&app.cfg, &b).await?)
}

pub async fn portada_borrar(State(app): Estado, q: Q) -> Res {
    ok(&prefs::borrar(&app.cfg, q.get("archivo")).await?)
}
