//! Semántica de JavaScript que el servidor Node usaba implícitamente (`String(x)`, `!x`, `Number`),
//! replicada para que las respuestas sean idénticas.

use serde_json::{Map, Number, Value};

/// Convierte un `f64` al `Value` que produciría `JSON.stringify` de un número JS:
/// los enteros exactos salen sin decimales (`145`, no `145.0`).
pub fn num_value(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992.0 {
        // Conversión exacta: el valor es entero y cabe en 53 bits.
        #[allow(clippy::cast_possible_truncation)]
        let i = f as i64;
        Value::Number(Number::from(i))
    } else {
        Number::from_f64(f).map_or(Value::Null, Value::Number)
    }
}

/// `String(n)` para un número JSON.
pub fn num_str(n: &Number) -> String {
    match n.as_f64() {
        Some(f) if n.is_f64() && f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992.0 => {
            #[allow(clippy::cast_possible_truncation)]
            let i = f as i64;
            i.to_string()
        }
        _ => n.to_string(),
    }
}

/// `String(x)` de JS. `None` representa `undefined`.
pub fn string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_owned(),
        Some(Value::Null) => "null".to_owned(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => num_str(n),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a
            .iter()
            .map(|x| match x {
                Value::Null => String::new(),
                otro => string(Some(otro)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_owned(),
    }
}

/// `String(x ?? '')`: `null` y `undefined` pasan a cadena vacía.
pub fn string_o_vacio(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        otro => string(otro),
    }
}

/// Veracidad de JS (`!!x`).
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

/// `x ?? y` de JS sobre un mapa: devuelve el primero que no sea `null`/`undefined`.
pub fn coalesce<'a>(m: &'a Map<String, Value>, claves: &[&str]) -> Option<&'a Value> {
    claves.iter().filter_map(|k| m.get(*k)).find(|v| !v.is_null())
}

/// `s.slice(0, n)` contando unidades UTF-16 como JS (sin partir caracteres).
pub fn slice_utf16(s: &str, n: usize) -> String {
    let mut usado = 0;
    let mut out = String::new();
    for c in s.chars() {
        usado += c.len_utf16();
        if usado > n {
            break;
        }
        out.push(c);
    }
    out
}

/// `fechaDe` del servidor Node: los 10 primeros caracteres, o `""` si no hay valor.
pub fn fecha_de(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        otro => slice_utf16(&string(otro), 10),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn numeros_como_js() {
        assert_eq!(num_value(145.0), json!(145));
        assert_eq!(num_value(82.5), json!(82.5));
        assert_eq!(num_str(&Number::from(12500)), "12500");
        assert_eq!(string(Some(&json!(1.0))), "1");
    }

    #[test]
    fn string_y_truthy() {
        assert_eq!(string(None), "undefined");
        assert_eq!(string(Some(&json!(["a", null, 2]))), "a,,2");
        assert!(!truthy(Some(&json!(0))));
        assert!(!truthy(Some(&json!(""))));
        assert!(truthy(Some(&json!("pendiente"))));
    }

    #[test]
    fn recorte_utf16() {
        assert_eq!(slice_utf16("2026-11-20 09:10", 10), "2026-11-20");
        assert_eq!(slice_utf16("a😀b", 2), "a");
        assert_eq!(slice_utf16("a😀b", 3), "a😀");
    }
}
