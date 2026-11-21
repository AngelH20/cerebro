//! Log rotativo diario en la carpeta de datos de la app (`%LOCALAPPDATA%\com.hq.panel\logs`), 7 días.

use std::path::Path;

use tracing_appender::rolling::{Builder, Rotation};
use tracing_subscriber::EnvFilter;

pub fn iniciar(dir: &Path) {
    let archivo = Builder::new()
        .rotation(Rotation::DAILY)
        .filename_prefix("hq")
        .filename_suffix("log")
        .max_log_files(7)
        .build(dir);
    let filtro = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,hq=debug,hq_core=info"));
    match archivo {
        Ok(writer) => {
            let _ = tracing_subscriber::fmt().with_env_filter(filtro).with_ansi(false).with_writer(writer).try_init();
        }
        // Sin carpeta de logs la app funciona igual; solo se pierde el registro.
        Err(_) => {
            let _ = tracing_subscriber::fmt().with_env_filter(filtro).try_init();
        }
    }
}
