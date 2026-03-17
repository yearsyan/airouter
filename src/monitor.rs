use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::{IntoResponse, Json},
};
use chrono::Utc;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{Value, json};
use tokio_stream::wrappers::BroadcastStream;
use tracing::error;

use crate::state::AppState;

#[derive(Clone, Debug, Serialize)]
pub struct MonitorEvent {
    pub kind: &'static str,
    pub timestamp: chrono::DateTime<Utc>,
    pub request_id: String,
    pub data: Value,
}

pub async fn healthz() -> Json<Value> {
    Json(json!({ "ok": true }))
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: AppState) {
    let mut stream = BroadcastStream::new(state.broadcaster.subscribe());
    let hello = json!({
        "kind": "hello",
        "timestamp": Utc::now(),
        "data": {
            "service": "airouter"
        }
    });

    if socket
        .send(Message::Text(hello.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(err)) => {
                        error!(?err, "websocket receive error");
                        break;
                    }
                }
            }
            outbound = stream.next() => {
                match outbound {
                    Some(Ok(event)) => {
                        match serde_json::to_string(&event) {
                            Ok(text) => {
                                if socket.send(Message::Text(text.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(err) => error!(?err, "failed to serialize monitor event"),
                        }
                    }
                    Some(Err(_)) => {
                        let lagged = json!({
                            "kind": "warning",
                            "timestamp": Utc::now(),
                            "data": {
                                "message": "websocket consumer lagged and dropped some events"
                            }
                        });
                        if socket.send(Message::Text(lagged.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
        }
    }
}

pub fn broadcast_event(state: &AppState, event: MonitorEvent) {
    let _ = state.broadcaster.send(event);
}

pub fn broadcast_error(state: &AppState, request_id: &str, duration_ms: u128, error_body: &Value) {
    broadcast_event(
        state,
        MonitorEvent {
            kind: "response.error",
            timestamp: Utc::now(),
            request_id: request_id.to_string(),
            data: json!({
                "duration_ms": duration_ms,
                "error": error_body
            }),
        },
    );
}
