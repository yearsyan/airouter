use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Instant,
};

use reqwest::Client;
use tokio::sync::{RwLock, broadcast};

use crate::{
    config::{Config, DefaultModel},
    monitor::MonitorEvent,
};

#[derive(Clone)]
pub struct AppState {
    pub client: Client,
    pub config: Arc<Config>,
    pub broadcaster: broadcast::Sender<MonitorEvent>,
    pub default_model: Arc<RwLock<Option<DefaultModel>>>,
    pub auth: Arc<AuthState>,
}

pub struct AuthState {
    /// Pending OTP codes: username -> (code, created_at)
    pub pending_otps: Mutex<HashMap<String, (String, Instant)>>,
    /// Active sessions: token -> username
    pub sessions: Mutex<HashMap<String, String>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            pending_otps: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
        }
    }
}
