use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{config::{DefaultModel, ModelRoute}, state::AppState};

pub async fn get_routes(State(state): State<AppState>) -> Json<Value> {
    let providers: Vec<Value> = state
        .config
        .providers
        .iter()
        .map(|p| {
            json!({
                "name": p.name,
                "upstream_url": p.upstream_url,
                "auth_header": p.auth_header,
                "has_api_key": p.api_key.is_some(),
                "models": p.models,
            })
        })
        .collect();

    let routes: Vec<Value> = state
        .config
        .routes
        .iter()
        .map(|r| {
            json!({
                "input_model": r.input_model,
                "provider": r.provider,
                "model": r.model,
            })
        })
        .collect();

    let default_model = state.default_model.read().await;
    let default = default_model.as_ref().map(|dm| {
        json!({
            "provider": dm.provider,
            "model": dm.model,
        })
    });

    Json(json!({
        "providers": providers,
        "routes": routes,
        "default_model": default,
    }))
}

#[derive(Deserialize)]
pub struct SetDefaultModelRequest {
    pub provider: String,
    pub model: String,
}

pub async fn set_default_model(
    State(state): State<AppState>,
    Json(body): Json<SetDefaultModelRequest>,
) -> impl IntoResponse {
    if state.config.find_provider(&body.provider).is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("provider '{}' not found", body.provider) })),
        );
    }

    let mut default = state.default_model.write().await;
    *default = Some(DefaultModel {
        provider: body.provider.clone(),
        model: body.model.clone(),
    });

    (
        StatusCode::OK,
        Json(json!({
            "default_model": {
                "provider": body.provider,
                "model": body.model,
            }
        })),
    )
}

pub fn find_route(routes: &[ModelRoute], model: &str) -> Option<ModelRoute> {
    routes.iter().find(|r| r.input_model == model).cloned()
}
