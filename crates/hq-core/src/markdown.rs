//! Markdown: casillas `- [ ]` (contarlas y marcarlas) y el resumen corto de una nota.

use std::sync::LazyLock;

use regex::Regex;

use crate::paths::re;

static TAREA: LazyLock<Regex> = LazyLock::new(|| re(r"^(\s*(?:>\s*)*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])"));
static CITA: LazyLock<Regex> = LazyLock::new(|| re(r"^(\s*>\s?)+"));
static BLOQUES: LazyLock<Regex> = LazyLock::new(|| re(r"(?s)```.*?```"));
static PREFIJO: LazyLock<Regex> = LazyLock::new(|| re(r"^#+\s*|^>\s*|^\s*[-*+]\s+(\[.\]\s*)?|^\s*\d+\.\s+"));
static WIKILINK: LazyLock<Regex> = LazyLock::new(|| re(r"!?\[\[([^\]|]+)\|?([^\]]*)\]\]"));
static MARCAS: LazyLock<Regex> = LazyLock::new(|| re(r"[*_`=]"));

/// Índices de las líneas con casilla, fuera de bloques de código (mismo orden que pinta la interfaz).
pub fn lineas_de_tarea(lineas: &[&str]) -> Vec<usize> {
    let mut out = Vec::new();
    let mut en_bloque = false;
    for (i, l) in lineas.iter().enumerate() {
        if CITA.replace(l, "").starts_with("```") {
            en_bloque = !en_bloque;
            continue;
        }
        if !en_bloque && TAREA.is_match(l) {
            out.push(i);
        }
    }
    out
}

/// `[hechas, total]` o `None` si no hay casillas.
pub fn checks(body: &str) -> Option<[usize; 2]> {
    let lineas: Vec<&str> = body.split('\n').collect();
    let idx = lineas_de_tarea(&lineas);
    if idx.is_empty() {
        return None;
    }
    let hechas = idx
        .iter()
        .filter(|&&i| TAREA.captures(lineas[i]).and_then(|c| c.get(2)).is_some_and(|m| m.as_str() != " "))
        .count();
    Some([hechas, idx.len()])
}

/// Invierte la casilla número `n` del cuerpo. `None` si no existe.
pub fn alternar_casilla(body: &str, n: usize) -> Option<String> {
    let mut lineas: Vec<String> = body.split('\n').map(str::to_owned).collect();
    let refs: Vec<&str> = lineas.iter().map(String::as_str).collect();
    let i = *lineas_de_tarea(&refs).get(n)?;
    let nueva = TAREA
        .replace(&lineas[i], |c: &regex::Captures<'_>| {
            let marca = if &c[2] == " " { "x" } else { " " };
            format!("{}{marca}{}", &c[1], &c[3])
        })
        .into_owned();
    lineas[i] = nueva;
    Some(lineas.join("\n"))
}

/// Resumen de 260 caracteres sin formato (`excerpt` de Node).
pub fn resumen(body: &str) -> String {
    let sin_bloques = BLOQUES.replace_all(body, "");
    let unido = sin_bloques
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .map(|l| PREFIJO.replace(l, "").trim().to_owned())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let enlaces = WIKILINK.replace_all(&unido, |c: &regex::Captures<'_>| {
        let alias = c.get(2).map_or("", |m| m.as_str());
        if alias.is_empty() {
            c.get(1).map_or("", |m| m.as_str()).to_owned()
        } else {
            alias.to_owned()
        }
    });
    crate::js::slice_utf16(&MARCAS.replace_all(&enlaces, ""), 260)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuenta_casillas_fuera_de_codigo() {
        let b = "- [x] uno\n- [ ] dos\n```\n- [ ] no cuenta\n```\n> - [X] en cita\n1. [ ] numerada";
        assert_eq!(checks(b), Some([2, 4]));
        assert_eq!(checks("sin tareas"), None);
    }

    #[test]
    fn alterna_la_casilla_pedida() {
        let b = "## Plan\n- [ ] A\n- [x] B";
        assert_eq!(alternar_casilla(b, 0).as_deref(), Some("## Plan\n- [x] A\n- [x] B"));
        assert_eq!(alternar_casilla(b, 1).as_deref(), Some("## Plan\n- [ ] A\n- [ ] B"));
        assert_eq!(alternar_casilla(b, 2), None);
    }

    #[test]
    fn resumen_limpio() {
        let b = "# Título\n\n> cita **fuerte**\n- [ ] tarea con [[Nota|alias]] y [[Otra]]\n```\ncódigo\n```\n";
        assert_eq!(resumen(b), "Título cita fuerte tarea con alias y Otra");
    }
}
