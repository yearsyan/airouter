use axum::{
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "web/dist"]
struct Assets;

pub async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Try exact file match
    if !path.is_empty() {
        if let Some(file) = Assets::get(path) {
            return file_response(path, &file.data);
        }
    }

    // History API fallback: serve index.html for any unmatched route
    match Assets::get("index.html") {
        Some(file) => file_response("index.html", &file.data),
        None => (StatusCode::NOT_FOUND, "frontend not built").into_response(),
    }
}

fn file_response(path: &str, data: &[u8]) -> Response {
    let mime = mime_type(path);
    let mut resp = (StatusCode::OK, [(header::CONTENT_TYPE, mime)], data.to_vec())
        .into_response();

    // Immutable cache for hashed assets produced by Vite
    if path.starts_with("assets/") {
        resp.headers_mut().insert(
            header::CACHE_CONTROL,
            "public, max-age=31536000, immutable".parse().unwrap(),
        );
    }

    resp
}

fn mime_type(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}
