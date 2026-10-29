//! OS network snapshots without Node, JavaScript or a GUI runtime.
use serde::{Deserialize, Serialize};
use std::{fmt, sync::Arc};
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "linux")]
pub use linux::{current_wifi, network_info};
#[cfg(target_os = "macos")]
pub use macos::{current_wifi, network_info};
#[cfg(target_os = "windows")]
pub use windows::{current_wifi, network_info};
pub type NetworkCallback = Arc<dyn Fn() + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug)]
pub struct Error(String);
#[derive(Debug)]
pub enum Status {
    GenericFailure,
}
impl Error {
    pub fn new(_: Status, text: impl Into<String>) -> Self {
        Self(text.into())
    }
    pub fn from_reason(text: impl Into<String>) -> Self {
        Self(text.into())
    }
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}
impl std::error::Error for Error {}
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeWifiInfo {
    pub ssid: Option<String>,
    pub bssid: Option<String>,
    pub rssi: Option<i32>,
    pub link_speed: Option<i32>,
    pub channel: Option<i32>,
    pub frequency: Option<i32>,
    pub security: Option<String>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeNetworkInfo {
    pub ipv4: Option<String>,
    pub ipv6: Option<String>,
    pub mac: Option<String>,
    pub gateway: Option<String>,
    pub dns: Option<Vec<String>>,
    pub subnet_mask: Option<String>,
}
