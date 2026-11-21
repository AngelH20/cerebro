//! `/api/events`: avisos de cambio en el vault (Server-Sent Events) con el mismo formato que Node.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::extract::State;
use axum::http::{header, HeaderValue};
use axum::response::Response;
use tokio_stream::wrappers::{BroadcastStream, IntervalStream};
use tokio_stream::StreamExt;

use crate::state::App;

const PING: Duration = Duration::from_secs(25);

pub async fn eventos(State(app): State<Arc<App>>) -> Response {
    let cambios = BroadcastStream::new(app.eventos.subscribe())
        .filter_map(Result::ok)
        .map(|ms| Bytes::from(format!("event: cambio\ndata: {ms}\n\n")));
    let pings = IntervalStream::new(tokio::time::interval_at(tokio::time::Instant::now() + PING, PING))
        .map(|_| Bytes::from_static(b": ping\n\n"));
    let flujo =
        tokio_stream::once(Bytes::from_static(b"retry: 3000\n\n")).chain(cambios.merge(pings)).map(Ok::<_, Infallible>);

    let mut r = Response::new(Body::from_stream(flujo));
    let h = r.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/event-stream"));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    h.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
    r
}
