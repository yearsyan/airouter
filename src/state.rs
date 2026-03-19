use std::sync::Arc;

use reqwest::Client;
use tokio::sync::broadcast;

use crate::{config::Config, monitor::MonitorEvent};

#[derive(Clone)]
pub struct AppState {
    pub client: Client,
    pub config: Arc<Config>,
    pub broadcaster: broadcast::Sender<MonitorEvent>,
}
