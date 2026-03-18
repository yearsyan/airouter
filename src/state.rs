use std::sync::Arc;

use reqwest::Client;
use tokio::sync::{RwLock, broadcast};

use crate::{config::Config, monitor::MonitorEvent, routes::ModelRoute};

#[derive(Clone)]
pub struct AppState {
    pub client: Client,
    pub config: Arc<Config>,
    pub broadcaster: broadcast::Sender<MonitorEvent>,
    pub routes: Arc<RwLock<Vec<ModelRoute>>>,
}
