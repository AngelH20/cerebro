//! Icono en la bandeja del sistema: Abrir HQ · Iniciar con Windows · Salir.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::ventana;

pub fn crear(app: &AppHandle) -> tauri::Result<()> {
    let abrir = MenuItem::with_id(app, "abrir", "Abrir HQ", true, None::<&str>)?;
    let activo = app.autolaunch().is_enabled().unwrap_or(false);
    let inicio = CheckMenuItem::with_id(app, "inicio", "Iniciar con Windows", true, activo, None::<&str>)?;
    let salir = MenuItem::with_id(app, "salir", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &inicio, &PredefinedMenuItem::separator(app)?, &salir])?;

    let mut b = TrayIconBuilder::with_id("hq").tooltip("HQ").menu(&menu).show_menu_on_left_click(false);
    if let Some(icono) = app.default_window_icon() {
        b = b.icon(icono.clone());
    }
    b.on_menu_event(move |app, ev| match ev.id().as_ref() {
        "abrir" => ventana::mostrar(app),
        "inicio" => alternar_inicio(app, &inicio),
        "salir" => {
            tracing::info!("salida pedida desde la bandeja");
            app.exit(0);
        }
        _ => {}
    })
    .on_tray_icon_event(|tray, ev| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
            ventana::mostrar(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

fn alternar_inicio(app: &AppHandle, casilla: &CheckMenuItem<tauri::Wry>) {
    let auto = app.autolaunch();
    let activo = auto.is_enabled().unwrap_or(false);
    let r = if activo { auto.disable() } else { auto.enable() };
    match r {
        Ok(()) => tracing::info!(activo = !activo, "inicio con Windows cambiado"),
        Err(e) => tracing::error!(error = %e, "no pude cambiar el inicio con Windows"),
    }
    let _ = casilla.set_checked(auto.is_enabled().unwrap_or(activo));
}
