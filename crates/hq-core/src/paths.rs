//! Rutas: confinamiento al vault y utilidades sobre rutas relativas con `/`.

use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

use crate::error::{ApiError, Resultado};

/// Normaliza una ruta de forma léxica (como `path.resolve` sin tocar el disco):
/// resuelve `.` y `..` y unifica separadores.
pub fn normalizar(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                // No se sube por encima de la raíz/prefijo.
                if !matches!(out.components().next_back(), Some(Component::RootDir | Component::Prefix(_)) | None) {
                    out.pop();
                }
            }
            otro => out.push(otro.as_os_str()),
        }
    }
    out
}

/// `safe()` de Node: resuelve `rel` dentro del vault y rechaza todo lo que quede fuera.
pub fn confinar(vault: &Path, rel: &str) -> Resultado<PathBuf> {
    let limpio = rel.trim_start_matches(['/', '\\']);
    let full = normalizar(&vault.join(limpio));
    if full == vault || full.starts_with(vault) {
        Ok(full)
    } else {
        Err(ApiError::bad_request("Ruta fuera del vault"))
    }
}

/// Ruta relativa al vault con `/` como separador (`rel()` de Node).
pub fn relativa(vault: &Path, full: &Path) -> String {
    full.strip_prefix(vault)
        .map(|r| r.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/"))
        .unwrap_or_default()
}

pub fn padre(p: &str) -> &str {
    p.rfind('/').map_or("", |i| &p[..i])
}

pub fn base(p: &str) -> &str {
    p.rfind('/').map_or(p, |i| &p[i + 1..])
}

static PROHIBIDOS: LazyLock<Regex> = LazyLock::new(|| re(r#"[\\/:*?"<>|#^\[\]]"#));
static ESPACIOS: LazyLock<Regex> = LazyLock::new(|| re(r"\s+"));

/// Nombre de archivo válido en Windows y en Obsidian (`nombreArchivo` de Node).
pub fn nombre_archivo(s: &str) -> String {
    let sin = PROHIBIDOS.replace_all(s, "");
    let unido = ESPACIOS.replace_all(&sin, " ");
    crate::js::slice_utf16(unido.trim(), 90)
}

/// Quita `/` iniciales y finales (`replace(/^\/+|\/+$/g, '')`).
pub fn sin_barras(s: &str) -> &str {
    s.trim_matches('/')
}

/// Quita `/` o `\` iniciales y finales.
pub fn sin_separadores(s: &str) -> &str {
    s.trim_matches(['/', '\\'])
}

/// Compila una expresión regular fija del código. Si fuera inválida es un error de programación,
/// detectado por los tests; en ese caso se usa una que no coincide con nada.
pub(crate) fn re(patron: &str) -> Regex {
    Regex::new(patron).unwrap_or_else(|e| {
        tracing::error!(%patron, error = %e, "expresión regular inválida");
        #[allow(clippy::unwrap_used)]
        Regex::new(r"[^\s\S]").unwrap()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> PathBuf {
        PathBuf::from(if cfg!(windows) { r"D:\Cerebro" } else { "/vault" })
    }

    #[test]
    fn confina_dentro_del_vault() {
        let v = vault();
        assert_eq!(confinar(&v, "Tareas/a.md").ok(), Some(v.join("Tareas").join("a.md")));
        assert_eq!(confinar(&v, "").ok(), Some(v.clone()));
        assert_eq!(confinar(&v, "/Tareas/../Diario").ok(), Some(v.join("Diario")));
    }

    #[test]
    fn rechaza_salidas_del_vault() {
        let v = vault();
        for malo in ["../secreto", "Tareas/../../x", "..\\..\\Windows"] {
            assert!(confinar(&v, malo).is_err(), "{malo}");
        }
        if cfg!(windows) {
            assert!(confinar(&v, r"C:\Windows\win.ini").is_err());
            assert!(confinar(&v, "D:../x").is_err());
        }
    }

    #[test]
    fn relativa_y_partes() {
        let v = vault();
        assert_eq!(relativa(&v, &v.join("A").join("b.md")), "A/b.md");
        assert_eq!(padre("A/B/c.md"), "A/B");
        assert_eq!(padre("c.md"), "");
        assert_eq!(base("A/B/c.md"), "c.md");
    }

    #[test]
    fn nombres_de_archivo() {
        assert_eq!(nombre_archivo("  Re: ¿precio?  #1 [x]  "), "Re ¿precio 1 x");
        assert_eq!(nombre_archivo("a/b\\c"), "abc");
    }
}
