use std::{
    net::{IpAddr, SocketAddr},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair};
use serde::Deserialize;
use tokio::fs;

const DEFAULT_UPSTREAM_BASE_URL: &str = "https://open.bigmodel.cn/api/anthropic";
const DEFAULT_ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_LISTEN_ADDR: &str = "0.0.0.0";
const DEFAULT_PORT: u16 = 443;
const DEFAULT_CERT_DIR: &str = "certs";
const DEFAULT_CERT_FILE: &str = "cert.pem";
const DEFAULT_KEY_FILE: &str = "key.pem";

#[derive(Debug)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub upstream_base_url: String,
    pub api_key: Option<String>,
    pub anthropic_version: String,
    pub cert_path: PathBuf,
    pub key_path: PathBuf,
}

impl Config {
    pub fn from_yaml_file(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let raw: RawConfig = serde_yaml::from_str(&content)
            .with_context(|| format!("failed to parse {}", path.display()))?;

        let listen_ip: IpAddr = raw
            .server
            .listen_addr
            .unwrap_or_else(|| DEFAULT_LISTEN_ADDR.to_string())
            .parse()
            .context("invalid server.listen_addr")?;
        let port = raw.server.port.unwrap_or(DEFAULT_PORT);
        let cert_dir = PathBuf::from(
            raw.tls
                .cert_dir
                .unwrap_or_else(|| DEFAULT_CERT_DIR.to_string()),
        );
        let cert_path = cert_dir.join(
            raw.tls
                .cert_file
                .unwrap_or_else(|| DEFAULT_CERT_FILE.to_string()),
        );
        let key_path = cert_dir.join(
            raw.tls
                .key_file
                .unwrap_or_else(|| DEFAULT_KEY_FILE.to_string()),
        );

        Ok(Self {
            listen_addr: SocketAddr::new(listen_ip, port),
            upstream_base_url: raw
                .upstream
                .base_url
                .unwrap_or_else(|| DEFAULT_UPSTREAM_BASE_URL.to_string())
                .trim_end_matches('/')
                .to_string(),
            api_key: raw
                .upstream
                .api_key
                .filter(|value| !value.trim().is_empty()),
            anthropic_version: raw
                .upstream
                .anthropic_version
                .unwrap_or_else(|| DEFAULT_ANTHROPIC_VERSION.to_string()),
            cert_path,
            key_path,
        })
    }
}

#[derive(Debug, Deserialize)]
struct RawConfig {
    #[serde(default)]
    server: ServerConfig,
    #[serde(default)]
    upstream: UpstreamConfig,
    #[serde(default)]
    tls: TlsConfig,
}

#[derive(Debug, Default, Deserialize)]
struct ServerConfig {
    listen_addr: Option<String>,
    port: Option<u16>,
}

#[derive(Debug, Default, Deserialize)]
struct UpstreamConfig {
    base_url: Option<String>,
    api_key: Option<String>,
    anthropic_version: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct TlsConfig {
    cert_dir: Option<String>,
    cert_file: Option<String>,
    key_file: Option<String>,
}

pub async fn ensure_self_signed_cert(cert_path: &Path, key_path: &Path) -> Result<()> {
    if cert_path.exists() && key_path.exists() {
        return Ok(());
    }

    let cert_dir = cert_path
        .parent()
        .context("certificate path has no parent directory")?;
    fs::create_dir_all(cert_dir)
        .await
        .with_context(|| format!("failed to create {}", cert_dir.display()))?;

    let mut params = CertificateParams::new(vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        "::1".to_string(),
    ])?;
    let mut distinguished_name = DistinguishedName::new();
    distinguished_name.push(DnType::CommonName, "airouter");
    params.distinguished_name = distinguished_name;
    let key_pair = KeyPair::generate()?;
    let cert = params.self_signed(&key_pair)?;

    fs::write(cert_path, cert.pem())
        .await
        .with_context(|| format!("failed to write {}", cert_path.display()))?;
    fs::write(key_path, key_pair.serialize_pem())
        .await
        .with_context(|| format!("failed to write {}", key_path.display()))?;

    Ok(())
}
