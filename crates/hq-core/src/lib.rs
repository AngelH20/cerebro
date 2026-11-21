//! Núcleo de HQ: todo lo que hacía `server.mjs`, sin dependencias de la interfaz de escritorio.
//!
//! - [`config`]: lectura de `hq.config.json` y descubrimiento de la carpeta raíz.
//! - [`vault`]: índice en memoria del vault, vigilancia de cambios y escrituras.
//! - [`views`]: vistas de lectura (`config`, `overview`, `carpeta`…).
//! - [`prefs`], [`sheets`], [`correo`], [`registro`]: servicios del panel.

pub mod config;
pub mod correo;
pub mod error;
pub mod fechas;
pub mod frontmatter;
pub mod js;
pub mod markdown;
pub mod paths;
pub mod prefs;
pub mod registro;
pub mod sheets;
pub mod state;
pub mod vault;
pub mod views;

pub use config::Config;
pub use error::ApiError;
pub use state::App;
