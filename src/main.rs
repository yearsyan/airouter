mod config;
mod csv_log;
mod embed;
mod history;
mod monitor;
mod proxy;
mod routes;
mod state;

use std::{env, ffi::OsString, path::PathBuf, sync::Arc};

use anyhow::{Context, Result, bail};
use axum::{
    Router,
    routing::{get, post, put},
};
use axum_server::tls_rustls::RustlsConfig;
use reqwest::Client;
use rustls::crypto::aws_lc_rs;
use tokio::sync::{RwLock, broadcast};
use tracing::info;

use crate::{
    config::{Config, ensure_self_signed_cert},
    embed::static_handler,
    history::{get_history, get_history_detail},
    monitor::{healthz, ws_handler},
    proxy::proxy_messages,
    routes::{get_routes, set_default_model},
    state::AppState,
};

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    let _ = aws_lc_rs::default_provider().install_default();

    let config_path = parse_config_path()?;
    let config = Arc::new(Config::from_yaml_file(&config_path)?);
    let client = Client::builder()
        .http2_adaptive_window(true)
        .build()
        .context("failed to build reqwest client")?;
    let (broadcaster, _) = broadcast::channel(512);

    info!(
        providers = config.providers.len(),
        routes = config.routes.len(),
        "loaded config"
    );

    let default_model = Arc::new(RwLock::new(config.default_model.clone()));

    let state = AppState {
        client,
        config: Arc::clone(&config),
        broadcaster,
        default_model,
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/ws", get(ws_handler))
        .route("/v1/messages", post(proxy_messages))
        .route("/api/routes", get(get_routes))
        .route("/api/default-model", put(set_default_model))
        .route("/api/history", get(get_history))
        .route("/api/history/{id}", get(get_history_detail))
        .fallback(static_handler)
        .with_state(state);

    if config.tls_enabled {
        ensure_self_signed_cert(&config.cert_path, &config.key_path).await?;
        let rustls_config =
            RustlsConfig::from_pem_file(&config.cert_path, &config.key_path).await?;

        info!(
            config = %config.config_path.display(),
            listen = %config.listen_addr,
            providers = config.providers.len(),
            tls = true,
            cert = %config.cert_path.display(),
            "starting airouter"
        );

        axum_server::bind_rustls(config.listen_addr, rustls_config)
            .serve(app.into_make_service())
            .await
            .context("server exited unexpectedly")
    } else {
        info!(
            config = %config.config_path.display(),
            listen = %config.listen_addr,
            providers = config.providers.len(),
            tls = false,
            "starting airouter"
        );

        axum_server::bind(config.listen_addr)
            .serve(app.into_make_service())
            .await
            .context("server exited unexpectedly")
    }
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter("airouter=info,tower_http=info")
        .with_target(false)
        .compact()
        .init();
}

fn parse_config_path() -> Result<PathBuf> {
    parse_config_path_from(env::args_os().skip(1))
}

fn parse_config_path_from<I>(args: I) -> Result<PathBuf>
where
    I: IntoIterator<Item = OsString>,
{
    let mut config_path = PathBuf::from("config.yml");
    let mut args = args.into_iter();

    while let Some(arg) = args.next() {
        let arg_text = arg.to_string_lossy();
        match arg_text.as_ref() {
            "-c" | "--config" => {
                let Some(value) = args.next() else {
                    bail!("missing value for {arg_text}");
                };
                config_path = PathBuf::from(value);
            }
            _ => {
                if let Some(value) = arg_text.strip_prefix("--config=") {
                    config_path = PathBuf::from(value);
                } else {
                    bail!("unknown argument: {arg_text}");
                }
            }
        }
    }

    Ok(config_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_path_defaults_to_config_yml() {
        let path = parse_config_path_from(Vec::<OsString>::new()).expect("path should parse");
        assert_eq!(path, PathBuf::from("config.yml"));
    }

    #[test]
    fn config_path_supports_short_flag() {
        let path = parse_config_path_from(vec![OsString::from("-c"), OsString::from("dev.yml")])
            .expect("path should parse");
        assert_eq!(path, PathBuf::from("dev.yml"));
    }

    #[test]
    fn config_path_supports_long_flag() {
        let path = parse_config_path_from(vec![OsString::from("--config=prod.yml")])
            .expect("path should parse");
        assert_eq!(path, PathBuf::from("prod.yml"));
    }
}
