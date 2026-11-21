//! Correo: lista de cuentas (sin exponer contraseñas) e importación con `scripts/importar-correo.py`.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::future::{BoxFuture, FutureExt, Shared};
use serde_json::{json, Map, Value};
use tokio::sync::Mutex;

use crate::config::Config;
use crate::js;
use crate::vault::Vault;

const LIMITE: Duration = Duration::from_secs(10 * 60);

/// `{ configurado, cuentas: [{nombre, email, lista}] }`. Nunca devuelve `password_app`.
pub async fn cuentas(cfg: &Config) -> Value {
    let leido =
        tokio::fs::read_to_string(&cfg.cuentas_file).await.ok().and_then(|t| serde_json::from_str::<Value>(&t).ok());
    let Some(c) = leido else { return json!({ "configurado": false, "cuentas": [] }) };
    let lista: Vec<Value> = c
        .get("cuentas")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|x| {
                    let mut m = Map::new();
                    // Como `JSON.stringify`: las claves ausentes (undefined) no se escriben.
                    for k in ["nombre", "email"] {
                        if let Some(v) = x.get(k) {
                            m.insert(k.into(), v.clone());
                        }
                    }
                    let clave: String =
                        js::string(x.get("password_app")).chars().filter(|c| !c.is_whitespace()).collect();
                    let solo_x = !clave.is_empty() && clave.chars().all(|c| c.eq_ignore_ascii_case(&'x'));
                    m.insert("lista".into(), json!(js::truthy(x.get("password_app")) && !solo_x));
                    Value::Object(m)
                })
                .collect()
        })
        .unwrap_or_default();
    json!({ "configurado": true, "cuentas": lista })
}

fn ultimas(texto: &str, n: usize) -> String {
    let lineas: Vec<&str> = texto.trim().split('\n').collect();
    lineas[lineas.len().saturating_sub(n)..].join("\n")
}

async fn ejecutar(root: PathBuf) -> Value {
    let python = if cfg!(windows) { "python" } else { "python3" };
    let script = root.join("scripts").join("importar-correo.py");
    let mut cmd = tokio::process::Command::new(python);
    cmd.arg(&script).current_dir(&root).kill_on_drop(true);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: que no aparezca una consola.
        cmd.creation_flags(0x0800_0000);
    }
    let salida = tokio::time::timeout(LIMITE, cmd.output()).await;
    match salida {
        Ok(Ok(o)) => {
            let out = String::from_utf8_lossy(&o.stdout);
            let err = String::from_utf8_lossy(&o.stderr);
            let ok = o.status.success();
            let error = if ok {
                Value::Null
            } else {
                let msg = if err.trim().is_empty() {
                    format!("Command failed: {python} {}", script.display())
                } else {
                    err.into_owned()
                };
                json!(ultimas(&msg, 6))
            };
            json!({ "ok": ok, "salida": ultimas(&out, 15), "error": error })
        }
        Ok(Err(e)) => json!({ "ok": false, "salida": "", "error": ultimas(&e.to_string(), 6) }),
        Err(_) => json!({ "ok": false, "salida": "", "error": "Tiempo agotado (10 minutos)" }),
    }
}

type Importacion = Shared<BoxFuture<'static, Value>>;

/// Una sola importación a la vez: quien llama mientras corre recibe el mismo resultado.
#[derive(Default)]
pub struct Importador {
    actual: Mutex<Option<Importacion>>,
}

impl Importador {
    pub async fn importar(&self, root: PathBuf, vault: Arc<Vault>) -> Value {
        let fut = {
            let mut actual = self.actual.lock().await;
            match actual.as_ref() {
                Some(f) => f.clone(),
                None => {
                    let f = async move {
                        let r = ejecutar(root).await;
                        vault.marcar_sucio();
                        r
                    }
                    .boxed()
                    .shared();
                    *actual = Some(f.clone());
                    f
                }
            }
        };
        let r = fut.await;
        *self.actual.lock().await = None;
        r
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ultimas_lineas() {
        assert_eq!(ultimas("a\nb\nc\n", 2), "b\nc");
        assert_eq!(ultimas("", 3), "");
    }
}
