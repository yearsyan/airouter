use std::path::Path;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tracing::{error, info};

use crate::state::AppState;

const ROUTES_FILE: &str = "routes.json";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelRoute {
    pub input_model: String,
    pub upstream_url: String,
    pub output_model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

#[derive(Deserialize)]
pub struct RoutesPayload {
    pub routes: Vec<ModelRoute>,
}

pub fn load_routes() -> Vec<ModelRoute> {
    let path = Path::new(ROUTES_FILE);
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(err) => {
            error!(?err, "failed to read routes file");
            Vec::new()
        }
    }
}

fn save_routes(routes: &[ModelRoute]) -> anyhow::Result<()> {
    let json = serde_json::to_string_pretty(routes)?;
    std::fs::write(ROUTES_FILE, json)?;
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
