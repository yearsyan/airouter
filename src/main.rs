mod config;
mod monitor;
mod proxy;
mod state;

use std::sync::Arc;

use anyhow::{Context, Result};
use axum::{
    Router,
    routing::{get, post},
};
use axum_server::tls_rustls::RustlsConfig;
use reqwest::Client;
use rustls::crypto::aws_lc_rs;
use tokio::sync::broadcast;
use tracing::info;

use crate::{
    config::{Config, ensure_self_signed_cert},
    monitor::{healthz, root, ws_handler},
    proxy::proxy_messages,
    state::AppState,
};

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    let _ = aws_lc_rs::default_provider().install_default();

    let config = Arc::new(Config::from_yaml_file("config.yml")?);
    ensure_self_signed_cert(&config.cert_path, &config.key_path).await?;

    let rustls_config = RustlsConfig::from_pem_file(&config.cert_path, &config.key_path).await?;
    let client = Client::builder()
        .http2_adaptive_window(true)
        .build()
        .context("failed to build reqwest client")?;
    let (broadcaster, _) = broadcast::channel(512);

    let state = AppState {
        client,
        config: Arc::clone(&config),
        broadcaster,
    };

    let app = Router::new()
        .route("/", get(root))
        .route("/healthz", get(healthz))
        .route("/ws", get(ws_handler))
        .route("/v1/messages", post(proxy_messages))
        .with_state(state);

    info!(
        listen = %config.listen_addr,
        upstream = %config.upstream_base_url,
        cert = %config.cert_path.display(),
        "starting airouter"
    );

    axum_server::bind_rustls(config.listen_addr, rustls_config)
        .serve(app.into_make_service())
        .await
        .context("server exited unexpectedly")
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter("airouter=info,tower_http=info")
        .with_target(false)
        .compact()
        .init();
}
