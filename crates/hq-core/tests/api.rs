//! Tests de integración de la API sobre un vault temporal (nunca el real).

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use hq_core::{http, App, Config};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

type R<T = ()> = Result<T, Box<dyn std::error::Error>>;

struct Entorno {
    _dir: tempfile::TempDir,
    app: Arc<App>,
}

fn preparar() -> R<Entorno> {
    let dir = tempfile::tempdir()?;
    let root = dir.path();
    std::fs::create_dir_all(root.join("public"))?;
    std::fs::write(root.join("public/index.html"), "<!doctype html>hola")?;
    std::fs::write(root.join("public/app.js"), "console.log(1)")?;
    let v = root.join("vault");
    for d in ["Tareas", "Sistema/Decidir", "Bandeja/maquina/correos", "Formación/Tema"] {
        std::fs::create_dir_all(v.join(d))?;
    }
    std::fs::write(v.join("Tareas/Hoy.md"), "---\nestado: pendiente\nfecha: 2000-01-01\n---\n")?;
    std::fs::write(v.join("Tareas/Lista.md"), "---\nestado: hecha\n---\n")?;
    std::fs::write(v.join("Sistema/Decidir/A.md"), "---\nestado: pendiente\n---\n")?;
    std::fs::write(v.join("Bandeja/maquina/correos/c.md"), "---\nestado: importante\n---\n")?;
    std::fs::write(v.join("Formación/Tema/Tema.md"), "---\ntipo: tema\n---\n- [x] a\n- [ ] b\n")?;
    std::fs::write(v.join("Formación/portada.png"), [1u8, 2, 3])?;
    std::fs::write(
        root.join("hq.config.json"),
        serde_json::to_string(&json!({
            "vault": "./vault",
            "secciones": [
                { "id": "formacion", "nombre": "Formación", "carpeta": "Formación" },
                { "id": "bandeja", "nombre": "Bandeja", "carpeta": "Bandeja", "tipo": "bandeja" }
            ]
        }))?,
    )?;
    let app = App::nuevo(Config::cargar(root)?)?;
    Ok(Entorno { _dir: dir, app })
}

fn router(e: &Entorno) -> Router {
    http::router(e.app.clone())
}

async fn pedir(r: &Router, metodo: Method, uri: &str, cuerpo: Option<Value>) -> R<(StatusCode, Value)> {
    let mut b = Request::builder().method(metodo).uri(uri).header(header::HOST, "localhost:4320");
    let body = match cuerpo {
        Some(c) => {
            b = b.header(header::CONTENT_TYPE, "application/json");
            Body::from(serde_json::to_vec(&c)?)
        }
        None => Body::empty(),
    };
    let resp = r.clone().oneshot(b.body(body)?).await?;
    let status = resp.status();
    let bytes = resp.into_body().collect().await?.to_bytes();
    let v = serde_json::from_slice(&bytes).unwrap_or(Value::String(String::from_utf8_lossy(&bytes).into_owned()));
    Ok((status, v))
}

#[tokio::test]
async fn guardas_de_seguridad() -> R {
    let e = preparar()?;
    let r = router(&e);
    let req = Request::builder().uri("/api/config").header(header::HOST, "evil.com").body(Body::empty())?;
    assert_eq!(r.clone().oneshot(req).await?.status(), StatusCode::FORBIDDEN);
    let req = Request::builder().uri("/api/config").header(header::HOST, "mi-pc.tail1234.ts.net").body(Body::empty())?;
    assert_eq!(r.clone().oneshot(req).await?.status(), StatusCode::OK);

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/nota")
        .header(header::HOST, "localhost")
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("{}"))?;
    assert_eq!(r.clone().oneshot(req).await?.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

    let (s, v) = pedir(&r, Method::GET, "/api/note?path=../../hq.config.json", None).await?;
    assert_eq!((s, v), (StatusCode::BAD_REQUEST, json!({ "error": "Ruta fuera del vault" })));
    let (s, _) = pedir(&r, Method::GET, "/vault/..%2F..%2Fhq.config.json", None).await?;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, v) = pedir(&r, Method::GET, "/api/no-existe", None).await?;
    assert_eq!((s, v), (StatusCode::NOT_FOUND, json!({ "error": "Ruta no encontrada" })));
    let (s, _) = pedir(&r, Method::DELETE, "/api/config", Some(json!({}))).await?;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (s, _) = pedir(&r, Method::GET, "/a%zz", None).await?;
    assert_eq!(s, StatusCode::INTERNAL_SERVER_ERROR);
    Ok(())
}

#[tokio::test]
async fn vistas_de_lectura() -> R {
    let e = preparar()?;
    let r = router(&e);
    let (s, c) = pedir(&r, Method::GET, "/api/config", None).await?;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(c["vault"], "vault");
    assert_eq!(c["secciones"][0]["portada"], "Formación/portada.png");
    assert_eq!(c["prefs"], json!({ "portadas": {}, "fondo": {} }));
    let claves: Vec<&String> = c.as_object().map(|o| o.keys().collect()).unwrap_or_default();
    assert_eq!(claves, ["nombre", "vault", "moneda", "locale", "sistema", "secciones", "portadas", "prefs"]);

    let (_, o) = pedir(&r, Method::GET, "/api/overview", None).await?;
    assert_eq!(o["porHacer"], 1);
    assert_eq!(o["decidir"], 1);
    assert_eq!(o["badges"]["bandeja"], "1 importantes");
    assert_eq!(o["badges"]["formacion"], "1 notas");

    let (_, f) = pedir(&r, Method::GET, "/api/carpeta?path=Formaci%C3%B3n&recursive=1", None).await?;
    assert_eq!(f["subcarpetas"], json!([{ "path": "Formación/Tema", "nombre": "Tema", "notas": 1 }]));
    assert_eq!(f["notas"][0]["checks"], json!([1, 2]));
    assert_eq!(f["archivos"], json!(["Formación/portada.png"]));
    let (_, f) = pedir(&r, Method::GET, "/api/carpeta?path=NoExiste", None).await?;
    assert_eq!(f["existe"], false);

    let (_, d) = pedir(&r, Method::GET, "/api/diario?fecha=2026-11-20", None).await?;
    assert_eq!(d["nuevo"], true);
    let (s, _) = pedir(&r, Method::GET, "/api/resolver?nombre=hoy", None).await?;
    assert_eq!(s, StatusCode::OK);
    let (s, html) = pedir(&r, Method::GET, "/cualquier/ruta", None).await?;
    assert_eq!((s, html), (StatusCode::OK, json!("<!doctype html>hola")));
    Ok(())
}

#[tokio::test]
async fn escrituras_de_punta_a_punta() -> R {
    let e = preparar()?;
    let r = router(&e);
    let (s, n) = pedir(
        &r,
        Method::POST,
        "/api/nota",
        Some(json!({ "carpeta": "Ideas", "titulo": "Prueba", "cuerpo": "- [ ] a" })),
    )
    .await?;
    assert_eq!((s, &n), (StatusCode::CREATED, &json!({ "ok": true, "path": "Ideas/Prueba.md" })));

    let (s, _) =
        pedir(&r, Method::PATCH, "/api/note?path=Ideas/Prueba.md", Some(json!({ "campos": { "estado": "hecha" } })))
            .await?;
    assert_eq!(s, StatusCode::OK);
    let (_, _) = pedir(&r, Method::POST, "/api/check", Some(json!({ "path": "Ideas/Prueba.md", "n": 0 }))).await?;
    let (_, leida) = pedir(&r, Method::GET, "/api/note?path=Ideas/Prueba.md", None).await?;
    assert_eq!(leida["raw"], "---\nestado: hecha\n---\n- [x] a\n");

    let (s, _) = pedir(&r, Method::DELETE, "/api/note?path=Ideas/Prueba.md", Some(json!({}))).await?;
    assert_eq!(s, StatusCode::OK);
    assert!(e.app.vault.raiz().join(".trash/Prueba.md").exists());

    let (s, t) = pedir(&r, Method::POST, "/api/tareas", Some(json!({ "titulo": "Nueva" }))).await?;
    assert_eq!((s, &t["path"]), (StatusCode::CREATED, &json!("Tareas/Nueva.md")));
    let (s, reg) = pedir(&r, Method::POST, "/api/registro", Some(json!({ "texto": " hola " }))).await?;
    assert_eq!((s, &reg["texto"], &reg["estado"]), (StatusCode::CREATED, &json!("hola"), &json!("hecho")));
    let (_, todo) = pedir(&r, Method::GET, "/api/registro", None).await?;
    assert_eq!(todo.as_array().map(Vec::len), Some(1));

    let (s, _) = pedir(&r, Method::PUT, "/api/json?path=G/h.json", Some(json!({ "data": { "semanas": [] } }))).await?;
    assert_eq!(s, StatusCode::OK);
    let (_, h) = pedir(&r, Method::GET, "/api/json?path=G/h.json", None).await?;
    assert_eq!(h, json!({ "semanas": [] }));

    let (s, v) = pedir(
        &r,
        Method::PUT,
        "/api/preferencias",
        Some(json!({ "fondo": { "intensidad": 500 }, "hojas": { "gym": [{ "url": "https://evil.com" }] } })),
    )
    .await?;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v, json!({ "portadas": {}, "fondo": { "intensidad": 80, "cristal": 22 }, "hojas": { "gym": [] } }));
    Ok(())
}

#[tokio::test]
async fn limites_y_json_invalido() -> R {
    let e = preparar()?;
    let r = router(&e);
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/nota")
        .header(header::HOST, "localhost")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{roto"))?;
    assert_eq!(r.clone().oneshot(req).await?.status(), StatusCode::BAD_REQUEST);
    let grande = format!("{{\"x\":\"{}\"}}", "a".repeat(5_000_100));
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/nota")
        .header(header::HOST, "localhost")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(grande))?;
    assert_eq!(r.clone().oneshot(req).await?.status(), StatusCode::PAYLOAD_TOO_LARGE);
    Ok(())
}

#[tokio::test]
async fn avisa_cambios_por_sse() -> R {
    let e = preparar()?;
    e.app.vigilar();
    let mut rx = e.app.eventos.subscribe();
    tokio::time::sleep(Duration::from_millis(200)).await;
    std::fs::write(e.app.vault.raiz().join("Tareas/Nueva.md"), "x")?;
    let llego = tokio::time::timeout(Duration::from_secs(5), rx.recv()).await;
    assert!(matches!(llego, Ok(Ok(_))), "no llegó el aviso de cambio");
    // Lo de .obsidian no avisa.
    std::fs::create_dir_all(e.app.vault.raiz().join(".obsidian"))?;
    tokio::time::sleep(Duration::from_millis(900)).await;
    while rx.try_recv().is_ok() {}
    std::fs::write(e.app.vault.raiz().join(".obsidian/workspace.json"), "{}")?;
    let nada = tokio::time::timeout(Duration::from_millis(1200), rx.recv()).await;
    assert!(nada.is_err(), "no debería avisar por cambios en .obsidian");
    Ok(())
}
