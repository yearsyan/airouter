use axum::{extract::State, response::Json};
use serde_json::{Value, json};

use crate::{config::ModelRoute, state::AppState};

pub async fn get_routes(State(state): State<AppState>) -> Json<Value> {
    let routes: Vec<Value> = state
        .config
        .routes
        .iter()
        .map(|r| {
            json!({
                "input_model": r.input_model,
                "output_model": r.output_model,
                "upstream_url": r.upstream_url,
                "auth_header": r.auth_header,
            })
        })
        .collect();
    Json(json!({ "routes": routes }))
}

pub fn find_route(routes: &[ModelRoute], model: &str) -> Option<ModelRoute> {
    routes.iter().find(|r| r.input_model == model).cloned()
}
