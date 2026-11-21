//! Configuración: `hq.config.json` + variables de entorno `HQ_VAULT`, `HQ_PORT`, `HQ_HOST`, `HQ_ROOT`.

use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::paths::normalizar;

pub const ARCHIVO_CONFIG: &str = "hq.config.json";

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("no encuentro {ARCHIVO_CONFIG} (busqué en {0})")]
    SinRaiz(String),
    #[error("no pude leer {0}: {1}")]
    Leer(PathBuf, std::io::Error),
    #[error("{0} no es JSON válido: {1}")]
    Json(PathBuf, serde_json::Error),
    #[error("No encuentro el vault en: {0}")]
    SinVault(PathBuf),
}

/// Rutas de sistema dentro del vault (`SIS` en Node). Conserva el orden de claves de Node.
#[derive(Debug, Clone)]
pub struct Sistema(Map<String, Value>);

impl Sistema {
    fn desde(cfg: &Value) -> Self {
        let mut m = Map::new();
        for (k, v) in [
            ("tareas", "Tareas"),
            ("decidir", "Sistema/Decidir"),
            ("aprendido", "Sistema/Aprendido"),
            ("diario", "Diario"),
            ("registro", "Sistema/maquina/registro-ia.jsonl"),
        ] {
            m.insert(k.to_owned(), json!(v));
        }
        if let Some(extra) = cfg.get("sistema").and_then(Value::as_object) {
            for (k, v) in extra {
                m.insert(k.clone(), v.clone());
            }
        }
        Self(m)
    }
    pub fn get(&self, clave: &str) -> String {
        crate::js::string_o_vacio(self.0.get(clave))
    }
    pub fn tareas(&self) -> String {
        self.get("tareas")
    }
    pub fn decidir(&self) -> String {
        self.get("decidir")
    }
    pub fn aprendido(&self) -> String {
        self.get("aprendido")
    }
    pub fn diario(&self) -> String {
        self.get("diario")
    }
    pub fn registro(&self) -> String {
        self.get("registro")
    }
    pub fn como_json(&self) -> Value {
        Value::Object(self.0.clone())
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub root: PathBuf,
    pub vault: PathBuf,
    pub public: PathBuf,
    pub portadas: PathBuf,
    pub prefs_file: PathBuf,
    pub cuentas_file: PathBuf,
    pub port: u16,
    pub host: String,
    pub sistema: Sistema,
    /// El JSON original de `hq.config.json`, para devolver las secciones tal cual.
    pub raw: Value,
}

impl Config {
    /// Lee la configuración de `root`, aplicando las variables de entorno como hacía Node.
    pub fn cargar(root: &Path) -> Result<Self, ConfigError> {
        let archivo = root.join(ARCHIVO_CONFIG);
        let texto = std::fs::read_to_string(&archivo).map_err(|e| ConfigError::Leer(archivo.clone(), e))?;
        let raw: Value = serde_json::from_str(&texto).map_err(|e| ConfigError::Json(archivo.clone(), e))?;

        let vault_cfg = std::env::var("HQ_VAULT").ok().filter(|v| !v.is_empty()).unwrap_or_else(|| {
            raw.get("vault").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("./vault").to_owned()
        });
        let vault = normalizar(&root.join(vault_cfg));
        let port = std::env::var("HQ_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .or_else(|| raw.get("port").and_then(Value::as_u64).and_then(|p| u16::try_from(p).ok()))
            .unwrap_or(4320);
        let host = std::env::var("HQ_HOST")
            .ok()
            .filter(|h| !h.is_empty())
            .or_else(|| raw.get("host").and_then(Value::as_str).map(str::to_owned))
            .unwrap_or_else(|| "127.0.0.1".to_owned());

        Ok(Self {
            public: root.join("public"),
            portadas: root.join("portadas"),
            prefs_file: root.join("hq.preferencias.json"),
            cuentas_file: root.join("cuentas-correo.json"),
            sistema: Sistema::desde(&raw),
            root: normalizar(root),
            vault,
            port,
            host,
            raw,
        })
    }

    /// Falla si el vault no existe (Node salía con el mismo mensaje).
    pub fn exigir_vault(&self) -> Result<(), ConfigError> {
        if self.vault.is_dir() {
            Ok(())
        } else {
            Err(ConfigError::SinVault(self.vault.clone()))
        }
    }

    pub fn secciones(&self) -> Vec<Value> {
        self.raw.get("secciones").and_then(Value::as_array).cloned().unwrap_or_default()
    }

    pub fn hosts_permitidos(&self) -> Vec<String> {
        self.raw
            .get("hostsPermitidos")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(|h| crate::js::string(Some(h)).to_lowercase()).collect())
            .unwrap_or_default()
    }

    /// `true` si el servidor escucha fuera de localhost (entonces no se filtra por `Host`).
    pub fn abierto(&self) -> bool {
        !matches!(self.host.as_str(), "127.0.0.1" | "localhost" | "::1")
    }
}

/// Busca la carpeta que contiene `hq.config.json`: `HQ_ROOT`, luego los ancestros del
/// ejecutable y luego los del directorio actual.
pub fn encontrar_raiz() -> Result<PathBuf, ConfigError> {
    if let Some(r) = std::env::var_os("HQ_ROOT").map(PathBuf::from) {
        if r.join(ARCHIVO_CONFIG).is_file() {
            return Ok(r);
        }
    }
    let mut candidatos = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        candidatos.extend(exe.ancestors().skip(1).map(Path::to_path_buf));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidatos.extend(cwd.ancestors().map(Path::to_path_buf));
    }
    candidatos
        .iter()
        .find(|d| d.join(ARCHIVO_CONFIG).is_file())
        .cloned()
        .ok_or_else(|| ConfigError::SinRaiz(candidatos.first().map(|p| p.display().to_string()).unwrap_or_default()))
}
