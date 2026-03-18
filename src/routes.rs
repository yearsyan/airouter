use std::path::PathBuf;
use std::sync::LazyLock;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tracing::{error, info};

use crate::state::AppState;

/// Resolve routes.json to an absolute path based on cwd (same directory as config.yml).
static ROUTES_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    std::env::current_dir()
        .unwrap_or_default()
        .join("routes.json")
});

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelRoute {
    pub input_model: String,
    pub upstream_url: String,
    pub output_model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// "authorization" (default, sends Bearer) or "x-api-key"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_header: Option<String>,
}

#[derive(Deserialize)]
pub struct RoutesPayload {
    pub routes: Vec<ModelRoute>,
}

pub fn load_routes() -> Vec<ModelRoute> {
    let path = &*ROUTES_PATH;
    info!(path = %path.display(), "loading routes");
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(err) => {
            error!(?err, path = %path.display(), "failed to read routes file");
            Vec::new()
        }
    }
}

fn save_routes(routes: &[ModelRoute]) -> anyhow::Result<()> {
    let path = &*ROUTES_PATH;
    let json = serde_json::to_string_pretty(routes)?;
    std::fs::write(path, &json)?;
    info!(path = %path.display(), count = routes.len(), "routes saved to disk");
    Ok(())
}

pub async fn get_routes(State(state): State<AppState>) -> Json<Value> {
    let routes = state.routes.read().await;
    Json(json!({ "routes": *routes }))
}

pub async fn put_routes(
    State(state): State<AppState>,
    Json(payload): Json<RoutesPayload>,
) -> impl IntoResponse {
    if let Err(err) = save_routes(&payload.routes) {
        error!(?err, "failed to persist routes");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        );
    }

    let mut routes = state.routes.write().await;
    *routes = payload.routes;
    info!(count = routes.len(), "routes updated");
    (StatusCode::OK, Json(json!({ "ok": true, "routes": *routes })))
}

pub fn find_route(routes: &[ModelRoute], model: &str) -> Option<ModelRoute> {
    routes.iter().find(|r| r.input_model == model).cloned()
}
