//! HQ: app de escritorio. Lanza el servidor de `hq-core` dentro del proceso y muestra la interfaz
//! en una ventana nativa; al cerrarla queda en la bandeja para que el celular siga conectándose.

// Sin consola en Windows (también en debug, para probar igual que en release).
#![windows_subsystem = "windows"]

mod bandeja;
mod logs;
mod servidor;
mod ventana;

use tauri::{Manager, WindowEvent};

/// Se pasa al arrancar con Windows: el servidor arranca pero la ventana queda oculta.
pub const ARG_OCULTO: &str = "--oculto";

fn main() {
    let oculto = std::env::args().any(|a| a == ARG_OCULTO);
    let resultado = tauri::Builder::default()
        // Primero: si ya hay una HQ abierta, se enfoca esa y esta instancia termina.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| ventana::mostrar(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![ARG_OCULTO]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if let Ok(dir) = app.path().app_log_dir() {
                logs::iniciar(&dir);
            }
            tracing::info!(version = env!("CARGO_PKG_VERSION"), oculto, "HQ arrancando");
            bandeja::crear(app.handle())?;
            servidor::arrancar(app.handle().clone(), oculto);
            Ok(())
        })
        .on_window_event(|w, ev| {
            // Cerrar = ocultar en la bandeja; para salir del todo está "Salir" en el menú.
            if let WindowEvent::CloseRequested { api, .. } = ev {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .run(tauri::generate_context!());
    if let Err(e) = resultado {
        tracing::error!(error = %e, "HQ terminó con error");
    }
}
