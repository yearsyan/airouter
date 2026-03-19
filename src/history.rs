use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::json;

use crate::state::AppState;

pub async fn get_history(State(state): State<AppState>) -> Json<serde_json::Value> {
    let entries = crate::csv_log::read_csv_entries(&state.config.log_dir);
    Json(json!({ "entries": entries }))
}

pub async fn get_history_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match crate::csv_log::read_detail_log(&state.config.log_dir, &id) {
        Some(data) => (StatusCode::OK, Json(data)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "log not found" })),
        )
            .into_response(),
    }
}
