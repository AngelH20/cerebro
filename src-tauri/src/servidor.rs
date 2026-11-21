//! Arranque del servidor HTTP dentro de la app, con avisos claros si algo impide hacerlo.

use std::io::ErrorKind;
use std::net::TcpListener;

use anyhow::Context;
use hq_core::{config, http, App, Config};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::ventana;

/// Lee la configuración, abre el puerto y lanza el servidor. Después abre la ventana.
pub fn arrancar(app: AppHandle, oculto: bool) {
    let cfg = match cargar_config() {
        Ok(c) => c,
        Err(e) => return error_fatal(&app, &format!("{e:#}")),
    };
    let (host, port) = (cfg.host.clone(), cfg.port);
    match TcpListener::bind((host.as_str(), port)) {
        Ok(listener) => {
            if let Err(e) = lanzar(cfg, listener) {
                return error_fatal(&app, &format!("No pude iniciar el servidor: {e:#}"));
            }
            tracing::info!(%host, port, "servidor HQ escuchando");
            ventana::abrir(&app, port, oculto);
        }
        Err(e) if e.kind() == ErrorKind::AddrInUse => puerto_ocupado(app, port, oculto),
        Err(e) => error_fatal(&app, &format!("No pude abrir {host}:{port}: {e}")),
    }
}

fn cargar_config() -> anyhow::Result<Config> {
    let root = config::encontrar_raiz()?;
    let cfg = Config::cargar(&root)?;
    cfg.exigir_vault().context("revisa \"vault\" en hq.config.json")?;
    Ok(cfg)
}

fn lanzar(cfg: Config, listener: TcpListener) -> anyhow::Result<()> {
    listener.set_nonblocking(true)?;
    let estado = App::nuevo(cfg)?;
    tauri::async_runtime::spawn(async move {
        estado.vigilar();
        match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => {
                if let Err(e) = http::servir(estado, l).await {
                    tracing::error!(error = %e, "el servidor se detuvo");
                }
            }
            Err(e) => tracing::error!(error = %e, "no pude preparar el puerto"),
        }
    });
    Ok(())
}

/// Otro proceso (por ejemplo el servidor Node viejo) ya usa el puerto: se ofrece usarlo o salir.
fn puerto_ocupado(app: AppHandle, port: u16, oculto: bool) {
    tracing::warn!(port, "el puerto ya está en uso");
    let texto = format!(
        "El puerto {port} ya está en uso (¿quedó abierto el servidor Node, `node server.mjs`?).\n\n\
         Puedes usar ese servidor desde esta ventana, o salir, cerrarlo y volver a abrir HQ."
    );
    let app2 = app.clone();
    app.dialog()
        .message(texto)
        .title("HQ")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Usar ese servidor".into(), "Salir".into()))
        .show(move |usar| {
            if usar {
                ventana::abrir(&app2, port, oculto);
            } else {
                app2.exit(0);
            }
        });
}

fn error_fatal(app: &AppHandle, msg: &str) {
    tracing::error!(%msg, "no se pudo arrancar");
    let app2 = app.clone();
    app.dialog().message(msg).title("HQ no pudo arrancar").kind(MessageDialogKind::Error).show(move |_| app2.exit(1));
}
