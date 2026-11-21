//! La ventana principal: carga la interfaz desde el servidor local.

use tauri::webview::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const ETIQUETA: &str = "main";

pub fn abrir(app: &AppHandle, port: u16, oculto: bool) {
    if app.get_webview_window(ETIQUETA).is_some() {
        return;
    }
    let url = match format!("http://127.0.0.1:{port}/").parse() {
        Ok(u) => u,
        Err(e) => return tracing::error!(error = %e, "URL inválida"),
    };
    let creada = WebviewWindowBuilder::new(app, ETIQUETA, WebviewUrl::External(url))
        .title("HQ")
        .inner_size(1440.0, 900.0)
        .min_inner_size(900.0, 600.0)
        // El mismo fondo que el panel: sin destello blanco al abrir.
        .background_color(Color(7, 16, 18, 255))
        .maximized(true)
        .visible(!oculto)
        .build();
    if let Err(e) = creada {
        tracing::error!(error = %e, "no pude crear la ventana");
    }
}

/// Muestra y enfoca la ventana (desde la bandeja o al abrir HQ por segunda vez).
pub fn mostrar(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(ETIQUETA) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
