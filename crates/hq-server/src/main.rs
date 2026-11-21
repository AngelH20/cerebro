//! `hq-server`: el servidor de HQ sin ventana. Mismo comportamiento que `node server.mjs`
//! (útil para depurar y para comparar con la versión Node).

use anyhow::Context;
use hq_core::{config, http, App, Config};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let root = config::encontrar_raiz()?;
    let cfg = Config::cargar(&root)?;
    if let Err(e) = cfg.exigir_vault() {
        eprintln!(
            "\n  {e}\n  Crea uno de ejemplo:  node scripts/crear-vault-ejemplo.mjs\n  o apunta \"vault\" en hq.config.json a tu vault de Obsidian.\n"
        );
        std::process::exit(1);
    }
    let (host, port, vault) = (cfg.host.clone(), cfg.port, cfg.vault.clone());
    let listener = tokio::net::TcpListener::bind((host.as_str(), port))
        .await
        .with_context(|| format!("no pude abrir {host}:{port} (¿ya hay otro servidor HQ corriendo?)"))?;

    let app = App::nuevo(cfg)?;
    app.vigilar();
    println!("\n  HQ listo →  http://localhost:{port}\n  Vault:      {}\n", vault.display());
    http::servir(app, listener).await.context("el servidor se detuvo")?;
    Ok(())
}
