//! Fechas en hora local, con los mismos formatos que el servidor Node.

use chrono::{Datelike, Local, NaiveDate, Timelike};

const DIAS: [&str; 7] = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES: [&str; 12] = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

/// `AAAA-MM-DD` de hoy.
pub fn hoy() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// `AAAA-MM-DD` de hoy + `dias`.
pub fn hoy_mas(dias: i64) -> String {
    let d = Local::now().date_naive() + chrono::Duration::days(dias);
    d.format("%Y-%m-%d").to_string()
}

/// `AAAA-MM-DD HH:MM`.
pub fn ahora() -> String {
    Local::now().format("%Y-%m-%d %H:%M").to_string()
}

/// `AAAA-MM-DDTHH:MM`.
pub fn ahora_iso() -> String {
    let n = Local::now();
    format!("{}T{:02}:{:02}", n.format("%Y-%m-%d"), n.hour(), n.minute())
}

/// Milisegundos desde 1970 (`Date.now()`).
pub fn ahora_ms() -> u64 {
    u64::try_from(Local::now().timestamp_millis()).unwrap_or(0)
}

/// `/^\d{4}-\d\d-\d\d$/` (solo forma, igual que Node).
pub fn es_fecha(s: &str) -> bool {
    s.len() == 10 && s.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

/// "Viernes, 20 de noviembre" (lo que daba `toLocaleDateString('es-ES', …)` con mayúscula inicial).
pub fn titulo_largo(fecha: &str) -> Option<String> {
    let d = NaiveDate::parse_from_str(fecha, "%Y-%m-%d").ok()?;
    let dia = DIAS[d.weekday().num_days_from_monday() as usize];
    let mes = MESES[d.month0() as usize];
    let texto = format!("{dia}, {} de {mes}", d.day());
    let mut cs = texto.chars();
    Some(cs.next().map(|c| c.to_uppercase().collect::<String>() + cs.as_str()).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titulos_en_español() {
        assert_eq!(titulo_largo("2026-11-20").as_deref(), Some("Viernes, 20 de noviembre"));
        assert_eq!(titulo_largo("2026-03-01").as_deref(), Some("Domingo, 1 de marzo"));
        assert_eq!(titulo_largo("no"), None);
    }

    #[test]
    fn formato_de_fecha() {
        assert!(es_fecha("2026-11-20"));
        assert!(!es_fecha("2026-1-20"));
        assert!(!es_fecha("ayer"));
        assert_eq!(hoy().len(), 10);
        assert_eq!(ahora_iso().len(), 16);
    }
}
