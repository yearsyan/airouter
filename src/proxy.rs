use std::{borrow::Cow, io};

use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{
        HeaderMap, HeaderName, HeaderValue, Response, StatusCode,
        header::{CONTENT_LENGTH, CONTENT_TYPE, HOST},
    },
};
use bytes::BytesMut;
use chrono::Utc;
use futures_util::StreamExt;
use serde_json::{Value, json};
use tracing::{error, info};
use uuid::Uuid;

use crate::{
    monitor::{MonitorEvent, broadcast_error, broadcast_event},
    state::AppState,
};

const MAX_MONITOR_BODY: usize = 128 * 1024;

pub async fn proxy_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response<Body> {
    let request_id = Uuid::new_v4().to_string();
    let request_time = Utc::now();
    let started_at = std::time::Instant::now();
    let request_json = serde_json::from_slice::<Value>(&body).ok();
    let is_stream = request_json
        .as_ref()
        .and_then(|value| value.get("stream"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    info!(
        request_id = %request_id,
        path = "/v1/messages",
        request_time = %request_time.to_rfc3339(),
        "received request"
    );

    broadcast_event(
        &state,
        MonitorEvent {
            kind: "request.received",
            timestamp: request_time,
            request_id: request_id.clone(),
            data: json!({
                "method": "POST",
                "path": "/v1/messages",
                "headers": headers_to_json(&headers),
                "body": body_to_json(&body),
                "stream": is_stream
            }),
        },
    );

    let upstream_url = format!("{}/v1/messages", state.config.upstream_base_url);
    let mut upstream_headers = filter_request_headers(&headers);
    apply_default_headers(&state, &mut upstream_headers);

    let upstream_response = match state
        .client
        .post(upstream_url)
        .headers(upstream_headers)
        .body(body.clone())
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            let error_body = json!({
                "type": "upstream_connection_error",
                "message": err.to_string()
            });
            broadcast_error(
                &state,
                &request_id,
                started_at.elapsed().as_millis(),
                &error_body,
            );
            return build_json_response(StatusCode::BAD_GATEWAY, error_body);
        }
    };

    let status = upstream_response.status();
    let response_headers = upstream_response.headers().clone();

    if is_event_stream(&response_headers) || is_stream {
        proxy_streaming_response(
            state,
            request_id,
            started_at,
            status,
            response_headers,
            upstream_response,
        )
        .await
    } else {
        proxy_json_response(
            state,
            request_id,
            started_at,
            status,
            response_headers,
            upstream_response,
        )
        .await
    }
}

async fn proxy_json_response(
    state: AppState,
    request_id: String,
    started_at: std::time::Instant,
    status: reqwest::StatusCode,
    response_headers: HeaderMap,
    upstream_response: reqwest::Response,
) -> Response<Body> {
    match upstream_response.bytes().await {
        Ok(bytes) => {
            let response_json = serde_json::from_slice::<Value>(&bytes).ok();
            let usage = response_json
                .as_ref()
                .and_then(extract_usage)
                .cloned()
                .unwrap_or(Value::Null);
            let duration_ms = started_at.elapsed().as_millis();

            broadcast_event(
                &state,
                MonitorEvent {
                    kind: "response.completed",
                    timestamp: Utc::now(),
                    request_id: request_id.clone(),
                    data: json!({
                        "status": status.as_u16(),
                        "headers": headers_to_json(&response_headers),
                        "body": body_to_json(&bytes),
                        "usage": usage,
                        "duration_ms": duration_ms
                    }),
                },
            );

            build_response(status, &response_headers, Body::from(bytes))
        }
        Err(err) => {
            let error_body = json!({
                "type": "upstream_read_error",
                "message": err.to_string()
            });
            broadcast_error(
                &state,
                &request_id,
                started_at.elapsed().as_millis(),
                &error_body,
            );
            build_json_response(StatusCode::BAD_GATEWAY, error_body)
        }
    }
}

async fn proxy_streaming_response(
    state: AppState,
    request_id: String,
    started_at: std::time::Instant,
    status: reqwest::StatusCode,
    response_headers: HeaderMap,
    upstream_response: reqwest::Response,
) -> Response<Body> {
    let mut upstream_stream = upstream_response.bytes_stream();
    let stream_state = state.clone();
    let stream_request_id = request_id.clone();
    let stream_headers = response_headers.clone();

    let stream = stream! {
        let mut collected = BytesMut::new();

        while let Some(next_chunk) = upstream_stream.next().await {
            let chunk = match next_chunk {
                Ok(chunk) => chunk,
                Err(err) => {
                    error!(?err, request_id = %stream_request_id, "failed to read upstream stream");
                    yield Err::<Bytes, io::Error>(io::Error::other(err.to_string()));
                    return;
                }
            };

            let chunk_text = String::from_utf8_lossy(&chunk).into_owned();
            collected.extend_from_slice(&chunk);

            broadcast_event(
                &stream_state,
                MonitorEvent {
                    kind: "response.chunk",
                    timestamp: Utc::now(),
                    request_id: stream_request_id.clone(),
                    data: json!({
                        "chunk": truncate_str(&chunk_text, MAX_MONITOR_BODY),
                        "chunk_size": chunk.len()
                    }),
                },
            );

            yield Ok::<Bytes, io::Error>(chunk);
        }

        let duration_ms = started_at.elapsed().as_millis();
        let body_text = String::from_utf8_lossy(&collected).into_owned();
        let (usage, content_preview) = summarize_sse(&body_text);

        broadcast_event(
            &stream_state,
            MonitorEvent {
                kind: "response.completed",
                timestamp: Utc::now(),
                request_id: stream_request_id.clone(),
                data: json!({
                    "status": status.as_u16(),
                    "headers": headers_to_json(&stream_headers),
                    "body": truncate_str(&body_text, MAX_MONITOR_BODY),
                    "stream_text": truncate_str(&content_preview, MAX_MONITOR_BODY),
                    "usage": usage,
                    "duration_ms": duration_ms
                }),
            },
        );
    };

    build_response(status, &response_headers, Body::from_stream(stream))
}

fn filter_request_headers(headers: &HeaderMap) -> HeaderMap {
    let mut filtered = HeaderMap::new();
    for (name, value) in headers {
        if is_hop_by_hop_header(name) || *name == HOST || *name == CONTENT_LENGTH {
            continue;
        }
        filtered.insert(name.clone(), value.clone());
    }
    filtered
}

fn apply_default_headers(state: &AppState, headers: &mut HeaderMap) {
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if let Ok(version) = HeaderValue::from_str(&state.config.anthropic_version) {
        headers.insert(HeaderName::from_static("anthropic-version"), version);
    }

    if let Some(api_key) = &state.config.api_key {
        if let Ok(value) = HeaderValue::from_str(api_key) {
            headers.insert(HeaderName::from_static("x-api-key"), value);
        }
    }
}

fn is_hop_by_hop_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn headers_to_json(headers: &HeaderMap) -> Value {
    let map = headers
        .iter()
        .map(|(name, value)| {
            let value = value
                .to_str()
                .map(Cow::Borrowed)
                .unwrap_or_else(|_| Cow::Owned(format!("{value:?}")));
            (name.to_string(), Value::String(value.into_owned()))
        })
        .collect();
    Value::Object(map)
}

fn body_to_json(body: &[u8]) -> Value {
    serde_json::from_slice(body).unwrap_or_else(|_| {
        Value::String(
            String::from_utf8_lossy(body)
                .chars()
                .take(MAX_MONITOR_BODY)
                .collect(),
        )
    })
}

fn is_event_stream(headers: &HeaderMap) -> bool {
    headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.contains("text/event-stream"))
        .unwrap_or(false)
}

fn extract_usage(value: &Value) -> Option<&Value> {
    value
        .get("usage")
        .or_else(|| value.get("message").and_then(|v| v.get("usage")))
}

fn summarize_sse(body: &str) -> (Value, String) {
    let mut usage = Value::Null;
    let mut text = String::new();

    for line in body.lines() {
        let payload = match line.strip_prefix("data:") {
            Some(data) => data.trim(),
            None => continue,
        };

        if payload == "[DONE]" || payload.is_empty() {
            continue;
        }

        if let Ok(value) = serde_json::from_str::<Value>(payload) {
            if usage.is_null() {
                if let Some(found) = extract_usage(&value) {
                    usage = found.clone();
                }
            } else if let Some(found) = extract_usage(&value) {
                usage = found.clone();
            }

            if let Some(delta) = value
                .get("delta")
                .and_then(|delta| delta.get("text"))
                .and_then(Value::as_str)
            {
                text.push_str(delta);
            }
        }
    }

    (usage, text)
}

fn truncate_str(value: &str, max_len: usize) -> String {
    if value.len() <= max_len {
        value.to_string()
    } else {
        let mut truncated = value.chars().take(max_len).collect::<String>();
        truncated.push_str("...[truncated]");
        truncated
    }
}

fn build_response(status: reqwest::StatusCode, headers: &HeaderMap, body: Body) -> Response<Body> {
    let mut response = Response::builder().status(status.as_u16());
    for (name, value) in headers {
        if is_hop_by_hop_header(name) || *name == CONTENT_LENGTH {
            continue;
        }
        response = response.header(name, value);
    }
    response.body(body).unwrap_or_else(|_| {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from("failed to build response"))
            .expect("static response should build")
    })
}

fn build_json_response(status: StatusCode, body: Value) -> Response<Body> {
    let body = Body::from(body.to_string());
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, HeaderValue::from_static("application/json"))
        .body(body)
        .expect("static response should build")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{extract_usage, summarize_sse};

    #[test]
    fn extracts_usage_from_message_wrapper() {
        let body = json!({
            "message": {
                "usage": {
                    "input_tokens": 1,
                    "output_tokens": 2
                }
            }
        });

        assert_eq!(
            extract_usage(&body).cloned(),
            Some(json!({
                "input_tokens": 1,
                "output_tokens": 2
            }))
        );
    }

    #[test]
    fn summarizes_sse_text_and_usage() {
        let input = concat!(
            "event: message_start\n",
            "data: {\"message\":{\"usage\":{\"input_tokens\":12}}}\n\n",
            "event: content_block_delta\n",
            "data: {\"delta\":{\"text\":\"Hello\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"delta\":{\"text\":\" world\"}}\n\n",
            "event: message_delta\n",
            "data: {\"usage\":{\"output_tokens\":34}}\n\n",
            "data: [DONE]\n"
        );

        let (usage, text) = summarize_sse(input);
        assert_eq!(text, "Hello world");
        assert_eq!(usage, json!({"output_tokens": 34}));
    }
}
