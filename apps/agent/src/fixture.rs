//! Controlled OS boundary used only by the separately built native UI test driver.
use super::*;
#[derive(Clone)]
pub struct Platform;
impl Platform {
    pub fn suspended(&self) -> bool {
        false
    }
    pub async fn new() -> Result<Self> {
        Ok(Self)
    }
    pub async fn watch(&self, _events: tokio::sync::mpsc::Sender<()>) -> Result<()> {
        std::future::pending().await
    }
    pub async fn notify(&self, _title: &str, _message: &str) {}
    pub fn autostart(&self, _enabled: bool) -> Result<()> {
        Ok(())
    }
}
impl Wifi for Platform {
    async fn snapshot(&self) -> Result<Network> {
        Ok(Network {
            enabled: true,
            ..Network::default()
        })
    }
    async fn scan(&self) -> Result<Vec<Network>> {
        Ok(vec![Network {
            enabled: true,
            ssid: Some("Test WiFi".into()),
            security: Some("Open".into()),
            ..Network::default()
        }])
    }
    async fn connect(&self, _rule: &WifiRule) -> Result<()> {
        anyhow::bail!("Controlled driver never changes the host network")
    }
}
