use std::sync::Arc;

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
}
