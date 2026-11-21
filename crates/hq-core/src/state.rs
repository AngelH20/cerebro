//! Estado compartido de la aplicación.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::broadcast;

use crate::config::Config;
use crate::correo::Importador;
use crate::sheets::Hojas;
use crate::vault::watch::{self, Vigia};
use crate::vault::Vault;

pub struct App {
    pub cfg: Config,
    pub vault: Arc<Vault>,
    /// Aviso de cambios en el vault (milisegundos del momento del cambio).
    pub eventos: broadcast::Sender<u64>,
    pub hojas: Hojas,
    pub correo: Importador,
    vigia: Mutex<Option<Vigia>>,
}

impl App {
    pub fn nuevo(cfg: Config) -> Result<Arc<Self>, reqwest::Error> {
        let (eventos, _) = broadcast::channel(64);
        Ok(Arc::new(Self {
            vault: Arc::new(Vault::new(cfg.vault.clone())),
            cfg,
            eventos,
            hojas: Hojas::new()?,
            correo: Importador::default(),
            vigia: Mutex::new(None),
        }))
    }

    /// Empieza a vigilar el vault. Si el sistema no lo permite, marca el índice como sucio
    /// cada 5 s (el mismo plan B que tenía Node).
    pub fn vigilar(self: &Arc<Self>) {
        match watch::vigilar(self.vault.clone(), self.eventos.clone()) {
            Ok(v) => {
                if let Ok(mut g) = self.vigia.lock() {
                    *g = Some(v);
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "sin vigilancia de cambios en vivo; se relee cada 5 s");
                let vault = self.vault.clone();
                tokio::spawn(async move {
                    let mut t = tokio::time::interval(Duration::from_secs(5));
                    loop {
                        t.tick().await;
                        vault.marcar_sucio();
                    }
                });
            }
        }
    }
}
