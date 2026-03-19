use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::{error, info};
use uuid::Uuid;

use crate::state::AppState;

const OTP_TTL_SECS: u64 = 30;

fn generate_otp() -> String {
    let id = Uuid::new_v4();
    let bytes = id.as_bytes();
    let n = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) % 1_000_000;
    format!("{:06}", n)
}

fn extract_session_cookie(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get("cookie")?.to_str().ok()?;
    cookie_header
        .split(';')
        .map(|s| s.trim())
        .find(|s| s.starts_with("airouter_session="))
        .map(|s| s["airouter_session=".len()..].to_string())
}

/// GET /api/auth/status
pub async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Json<Value> {
    if state.config.web_auth.is_empty() {
        return Json(json!({ "enabled": false }));
    }

    let authenticated = extract_session_cookie(&headers)
        .map(|token| {
            let sessions = state.auth.sessions.lock().unwrap();
            sessions.contains_key(&token)
        })
        .unwrap_or(false);

    Json(json!({ "enabled": true, "authenticated": authenticated }))
}

#[derive(Deserialize)]
pub struct SendOtpRequest {
    pub username: String,
}

/// POST /api/auth/send-otp
pub async fn send_otp(
    State(state): State<AppState>,
    Json(body): Json<SendOtpRequest>,
) -> impl IntoResponse {
    let user = state
        .config
        .web_auth
        .iter()
        .find(|u| u.name == body.username);
    let Some(user) = user else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "invalid username" })),
        );
    };

    let code = generate_otp();
    let curl_cmd = user.otp_curl.replace("${CODE}", &code);

    // Store OTP
    {
        let mut otps = state.auth.pending_otps.lock().unwrap();
        otps.insert(body.username.clone(), (code, std::time::Instant::now()));
    }

    info!(username = %body.username, "sending OTP");

    // Execute curl command in background
    let result = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&curl_cmd)
        .output()
        .await;

    match result {
        Ok(output) if output.status.success() => {
            (StatusCode::OK, Json(json!({ "ok": true })))
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!(username = %body.username, stderr = %stderr, "OTP curl failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to send code" })),
            )
        }
        Err(e) => {
            error!(username = %body.username, error = %e, "OTP curl execution failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to send code" })),
            )
        }
    }
}

#[derive(Deserialize)]
pub struct VerifyOtpRequest {
    pub username: String,
    pub code: String,
}

/// POST /api/auth/verify-otp
pub async fn verify_otp(
    State(state): State<AppState>,
    Json(body): Json<VerifyOtpRequest>,
) -> Response {
    let otp_result = {
        let mut otps = state.auth.pending_otps.lock().unwrap();
        match otps.get(&body.username) {
            Some((stored_code, created_at)) => {
                if created_at.elapsed().as_secs() > OTP_TTL_SECS {
                    otps.remove(&body.username);
                    Err("code expired")
                } else if *stored_code != body.code {
                    Err("invalid code")
                } else {
                    otps.remove(&body.username);
                    Ok(())
                }
            }
            None => Err("no pending code"),
        }
    };

    match otp_result {
        Ok(()) => {
            let token = Uuid::new_v4().to_string();
            {
                let mut sessions = state.auth.sessions.lock().unwrap();
                sessions.insert(token.clone(), body.username.clone());
            }

            info!(username = %body.username, "authenticated");

            let secure_attr = if state.config.tls_enabled {
                "; Secure"
            } else {
                ""
            };
            let cookie = format!(
                "airouter_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800{secure_attr}"
            );

            let mut response = Json(json!({ "ok": true })).into_response();
            response
                .headers_mut()
                .insert("set-cookie", cookie.parse().unwrap());
            response
        }
        Err(msg) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": msg })),
        )
            .into_response(),
    }
}

/// Middleware: protect routes when web_auth is configured
pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if state.config.web_auth.is_empty() {
        return next.run(request).await;
    }

    let authenticated = extract_session_cookie(request.headers())
        .map(|token| {
            let sessions = state.auth.sessions.lock().unwrap();
            sessions.contains_key(&token)
        })
        .unwrap_or(false);

    if authenticated {
        return next.run(request).await;
    }

    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header("content-type", "application/json")
        .body(Body::from(r#"{"error":"unauthorized"}"#))
        .unwrap()
}
