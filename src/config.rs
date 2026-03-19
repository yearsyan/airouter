use std::{
    net::{IpAddr, SocketAddr},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair};
use serde::{Deserialize, Serialize};
use tokio::fs;

const DEFAULT_ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_LISTEN_ADDR: &str = "0.0.0.0";
const DEFAULT_PORT: u16 = 443;
const DEFAULT_CERT_DIR: &str = "certs";
const DEFAULT_CERT_FILE: &str = "cert.pem";
const DEFAULT_KEY_FILE: &str = "key.pem";

#[derive(Debug)]
pub struct Config {
    pub config_path: PathBuf,
    pub listen_addr: SocketAddr,
    pub anthropic_version: String,
    pub tls_enabled: bool,
    pub cert_path: PathBuf,
    pub key_path: PathBuf,
    pub providers: Vec<Provider>,
    pub default_model: Option<DefaultModel>,
    pub routes: Vec<ModelRoute>,
    pub access_keys: Vec<AccessKey>,
    pub web_auth: Vec<WebAuthUser>,
    pub log_dir: PathBuf,
}

impl Config {
    pub fn from_yaml_file(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let config_path = resolve_config_path(path)?;
        let config_dir = config_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let content = std::fs::read_to_string(&config_path)
            .with_context(|| format!("failed to read {}", config_path.display()))?;
        let raw: RawConfig = serde_yaml::from_str(&content)
            .with_context(|| format!("failed to parse {}", config_path.display()))?;

        let listen_ip: IpAddr = raw
            .server
            .listen_addr
            .unwrap_or_else(|| DEFAULT_LISTEN_ADDR.to_string())
            .parse()
            .context("invalid server.listen_addr")?;
        let port = raw.server.port.unwrap_or(DEFAULT_PORT);
        let tls_enabled = raw.tls.enabled.unwrap_or(true);
        let cert_dir = resolve_relative_to(
            &config_dir,
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

        let providers: Vec<Provider> = raw
            .providers
            .into_iter()
            .map(|mut p| {
                p.upstream_url = p.upstream_url.trim_end_matches('/').to_string();
                p
            })
            .collect();

        Ok(Self {
            config_path,
            listen_addr: SocketAddr::new(listen_ip, port),
            anthropic_version: raw
                .server
                .anthropic_version
                .unwrap_or_else(|| DEFAULT_ANTHROPIC_VERSION.to_string()),
            tls_enabled,
            cert_path,
            key_path,
            providers,
            default_model: raw.default_model,
            routes: raw.routes,
            access_keys: raw.access_keys,
            web_auth: raw.web_auth,
            log_dir: resolve_relative_to(
                &config_dir,
                raw.server.log_dir.unwrap_or_else(|| ".".to_string()),
            ),
        })
    }

    pub fn find_provider(&self, name: &str) -> Option<&Provider> {
        self.providers.iter().find(|p| p.name == name)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub name: String,
    pub upstream_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default = "default_auth_header")]
    pub auth_header: String,
    #[serde(default)]
    pub models: Vec<String>,
}

fn default_auth_header() -> String {
    "authorization".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultModel {
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRoute {
    pub input_model: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AccessKey {
    pub name: String,
    pub key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebAuthUser {
    pub name: String,
    pub otp_curl: String,
}

#[derive(Debug, Deserialize)]
struct RawConfig {
    #[serde(default)]
    server: ServerConfig,
    #[serde(default)]
    tls: TlsConfig,
    #[serde(default)]
    providers: Vec<Provider>,
    #[serde(default)]
    default_model: Option<DefaultModel>,
    #[serde(default)]
    routes: Vec<ModelRoute>,
    #[serde(default)]
    access_keys: Vec<AccessKey>,
    #[serde(default)]
    web_auth: Vec<WebAuthUser>,
}

#[derive(Debug, Default, Deserialize)]
struct ServerConfig {
    listen_addr: Option<String>,
    port: Option<u16>,
    log_dir: Option<String>,
    anthropic_version: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct TlsConfig {
    enabled: Option<bool>,
    cert_dir: Option<String>,
    cert_file: Option<String>,
    key_file: Option<String>,
}

fn resolve_config_path(path: &Path) -> Result<PathBuf> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(std::env::current_dir()
            .context("failed to resolve current working directory")?
            .join(path))
    }
}

fn resolve_relative_to(base_dir: &Path, path: impl Into<PathBuf>) -> PathBuf {
    let path = path.into();
    if path.is_absolute() {
        path
    } else {
        base_dir.join(path)
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn tls_enabled_defaults_to_true() {
        let raw: RawConfig = serde_yaml::from_str(
            r#"
server:
  port: 8080
"#,
        )
        .expect("config should parse");

        let tls_enabled = raw.tls.enabled.unwrap_or(true);
        assert!(tls_enabled);
    }

    #[test]
    fn tls_enabled_can_be_disabled() {
        let raw: RawConfig = serde_yaml::from_str(
            r#"
tls:
  enabled: false
"#,
        )
        .expect("config should parse");

        assert_eq!(raw.tls.enabled, Some(false));
    }

    #[test]
    fn relative_paths_follow_config_file_directory() {
        let test_dir = std::env::temp_dir().join(format!(
            "airouter-config-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time should be monotonic")
                .as_nanos()
        ));
        std::fs::create_dir_all(&test_dir).expect("test dir should be created");

        let config_path = test_dir.join("nested").join("config.yml");
        std::fs::create_dir_all(config_path.parent().expect("config parent should exist"))
            .expect("config parent should be created");
        std::fs::write(
            &config_path,
            r#"
server:
  log_dir: logs
tls:
  cert_dir: certs
"#,
        )
        .expect("config should be written");

        let config = Config::from_yaml_file(&config_path).expect("config should load");
        let config_dir = config_path.parent().expect("config should have parent");

        assert_eq!(config.config_path, config_path);
        assert_eq!(config.cert_path, config_dir.join("certs").join("cert.pem"));
        assert_eq!(config.key_path, config_dir.join("certs").join("key.pem"));
        assert!(config.routes.is_empty());
        assert_eq!(config.log_dir, config_dir.join("logs"));

        std::fs::remove_dir_all(test_dir).expect("test dir should be removed");
    }
}
