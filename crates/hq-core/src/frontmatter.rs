//! Frontmatter YAML sencillo (el que usa Obsidian para propiedades), compatible con `server.mjs`.

use std::sync::LazyLock;

use axum::http::StatusCode;
use regex::Regex;
use serde_json::{Map, Value};

use crate::error::{ApiError, Resultado};
use crate::js;
use crate::paths::re;

static FM: LazyLock<Regex> = LazyLock::new(|| re(r"(?s)\A---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\z)"));
static NUMERO: LazyLock<Regex> = LazyLock::new(|| re(r"^-?\d+(\.\d+)?$"));
static ITEM: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*-\s+(.*)$"));
static CLAVE_VALOR: LazyLock<Regex> = LazyLock::new(|| re(r"^([^:\s#][^:]*?):(?:\s+(.*)|\s*)$"));
static CLAVE_VALIDA: LazyLock<Regex> = LazyLock::new(|| re(r"^[\p{L}\p{N}_ -]+$"));
static CONTINUA_LISTA: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*-\s"));
static NECESITA_COMILLAS: LazyLock<Regex> =
    LazyLock::new(|| re(r#"[:#\[\]{}"',&*!|>%@`]|^\s|\s$|^(true|false|null|-?\d+(\.\d+)?)$"#));

pub struct Documento<'a> {
    pub data: Map<String, Value>,
    /// Texto después del frontmatter.
    pub body: &'a str,
    /// El bloque de frontmatter completo (incluido el salto de línea final), o `""`.
    pub cabecera: &'a str,
}

pub fn parse_scalar(v: &str) -> Value {
    let v = v.trim();
    if v.is_empty() || v == "null" || v == "~" {
        return Value::Null;
    }
    if v.len() > 1 && v.starts_with('"') && v.ends_with('"') {
        return serde_json::from_str::<String>(v)
            .map_or_else(|_| Value::String(v[1..v.len() - 1].to_owned()), Value::String);
    }
    if v.len() > 1 && v.starts_with('\'') && v.ends_with('\'') {
        return Value::String(v[1..v.len() - 1].replace("''", "'"));
    }
    match v {
        "true" => return Value::Bool(true),
        "false" => return Value::Bool(false),
        _ => {}
    }
    if NUMERO.is_match(v) {
        if let Ok(f) = v.parse::<f64>() {
            return js::num_value(f);
        }
    }
    if v.starts_with('[') && v.ends_with(']') && !v.starts_with("[[") {
        return Value::Array(v[1..v.len() - 1].split(',').map(parse_scalar).filter(|x| !x.is_null()).collect());
    }
    Value::String(v.to_owned())
}

pub fn parse_yaml(src: &str) -> Map<String, Value> {
    let mut out = Map::new();
    let mut ultima: Option<String> = None;
    for raw in src.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)) {
        let t = raw.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if let (Some(c), Some(k)) = (ITEM.captures(raw), ultima.as_ref()) {
            let item = parse_scalar(c.get(1).map_or("", |m| m.as_str()));
            match out.get_mut(k) {
                Some(Value::Array(a)) => a.push(item),
                _ => {
                    out.insert(k.clone(), Value::Array(vec![item]));
                }
            }
            continue;
        }
        if let Some(c) = CLAVE_VALOR.captures(raw) {
            let k = c.get(1).map_or("", |m| m.as_str()).trim().to_owned();
            out.insert(k.clone(), parse_scalar(c.get(2).map_or("", |m| m.as_str())));
            ultima = Some(k);
        }
    }
    out
}

pub fn parse(texto: &str) -> Documento<'_> {
    match FM.captures(texto) {
        Some(c) => {
            let todo = c.get(0).map_or("", |m| m.as_str());
            Documento {
                data: parse_yaml(c.get(1).map_or("", |m| m.as_str())),
                body: &texto[todo.len()..],
                cabecera: todo,
            }
        }
        None => Documento { data: Map::new(), body: texto, cabecera: "" },
    }
}

pub fn format_scalar(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) if s.is_empty() => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => js::num_str(n),
        Value::Array(a) => format!("[{}]", a.iter().map(format_scalar).collect::<Vec<_>>().join(", ")),
        otro => {
            let s = js::string(Some(otro)).replace("\r\n", " ").replace('\n', " ");
            if NECESITA_COMILLAS.is_match(&s) {
                serde_json::to_string(&s).unwrap_or(s)
            } else {
                s
            }
        }
    }
}

/// Cambia o añade propiedades conservando el resto del frontmatter (`setFields` de Node).
pub fn set_fields(texto: &str, campos: &Map<String, Value>) -> Resultado<String> {
    let doc = FM.captures(texto);
    let mut lineas: Vec<String> = doc
        .as_ref()
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l).to_owned()).collect())
        .unwrap_or_default();
    for (k, v) in campos {
        if !CLAVE_VALIDA.is_match(k) {
            return Err(ApiError::nuevo(StatusCode::BAD_REQUEST, format!("Propiedad no válida: {k}")));
        }
        let linea = format!("{k}: {}", format_scalar(v)).trim_end().to_owned();
        let pos = lineas.iter().position(|l| l.split(':').next().unwrap_or("").trim() == k && l.contains(':'));
        match pos {
            Some(i) => {
                let mut j = i + 1;
                while j < lineas.len() && CONTINUA_LISTA.is_match(&lineas[j]) {
                    j += 1;
                }
                lineas.splice(i..j, [linea]);
            }
            None => lineas.push(linea),
        }
    }
    let cuerpo = doc.and_then(|c| c.get(0)).map_or(texto, |m| &texto[m.end()..]);
    Ok(format!("---\n{}\n---\n{cuerpo}", lineas.join("\n")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn escalares() {
        assert_eq!(parse_scalar(""), Value::Null);
        assert_eq!(parse_scalar("true"), json!(true));
        assert_eq!(parse_scalar("145"), json!(145));
        assert_eq!(parse_scalar("-82.5"), json!(-82.5));
        assert_eq!(parse_scalar("007"), json!(7));
        assert_eq!(parse_scalar("2026-11-20"), json!("2026-11-20"));
        assert_eq!(parse_scalar(r#""a: \"b\"""#), json!("a: \"b\""));
        assert_eq!(parse_scalar("'it''s'"), json!("it's"));
        assert_eq!(parse_scalar("[tarea, 2, ]"), json!(["tarea", 2]));
        assert_eq!(parse_scalar("[[Nota]]"), json!("[[Nota]]"));
    }

    #[test]
    fn documento_con_listas_y_orden() {
        let t = "---\nestado: pendiente\ntags:\n  - a\n  - b\nfecha: 2026-11-20\n---\n\n# Hola\n";
        let d = parse(t);
        assert_eq!(d.data.keys().collect::<Vec<_>>(), ["estado", "tags", "fecha"]);
        assert_eq!(d.data["tags"], json!(["a", "b"]));
        assert_eq!(d.body, "\n# Hola\n");
        assert!(parse("sin frontmatter").data.is_empty());
    }

    #[test]
    fn set_fields_reemplaza_y_añade() {
        let t = "---\nestado: pendiente\ntags:\n  - a\n---\ncuerpo";
        let mut c = Map::new();
        c.insert("tags".into(), json!(["x"]));
        c.insert("respuesta".into(), json!("Sí: \"A\""));
        c.insert("importe".into(), json!(-18500));
        let r = set_fields(t, &c).ok();
        assert_eq!(
            r.as_deref(),
            Some("---\nestado: pendiente\ntags: [x]\nrespuesta: \"Sí: \\\"A\\\"\"\nimporte: -18500\n---\ncuerpo")
        );
        let mut malo = Map::new();
        malo.insert("a:b".into(), json!(1));
        assert!(set_fields(t, &malo).is_err());
    }

    #[test]
    fn formato_de_escalares() {
        assert_eq!(format_scalar(&json!("hola")), "hola");
        assert_eq!(format_scalar(&json!("true")), "\"true\"");
        assert_eq!(format_scalar(&json!("2026-11-20 09:10")), "\"2026-11-20 09:10\"");
        assert_eq!(format_scalar(&json!(12500.0)), "12500");
        assert_eq!(format_scalar(&json!("")), "");
    }
}
