#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod platform;
#[cfg(target_os = "windows")]
mod windows;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunction;

#[napi(object)]
pub struct NativeWifiInfo {
    pub ssid: Option<String>,
    pub bssid: Option<String>,
    pub rssi: Option<i32>,
    pub link_speed: Option<i32>,
    pub channel: Option<i32>,
    pub frequency: Option<i32>,
    pub security: Option<String>,
}

#[napi(object)]
pub struct NativeNetworkInfo {
    pub ipv4: Option<String>,
    pub ipv6: Option<String>,
    pub mac: Option<String>,
    pub gateway: Option<String>,
    pub dns: Option<Vec<String>>,
    pub subnet_mask: Option<String>,
}

/// 获取当前连接的 WiFi 快照。返回 null 表示无连接或不可用，TS 层回退 spawn 实现。
#[napi]
pub fn current_wifi() -> Option<NativeWifiInfo> {
    platform::current_wifi()
}

/// 获取网络接口信息。返回 null 时 TS 层回退 spawn 实现。
#[napi]
pub fn network_info() -> Option<NativeNetworkInfo> {
    platform::network_info()
}

/// CoreWLAN scan runs outside the Electron main thread. Other platforms use their OS adapter.
#[napi]
pub async fn scan_wifi() -> Result<Vec<NativeWifiInfo>> {
    #[cfg(target_os = "macos")]
    {
        napi::tokio::task::spawn_blocking(macos::scan_wifi)
            .await
            .map_err(|_| Error::from_reason("WiFi scan failed"))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(Error::from_reason("Native scan is unavailable on this platform"))
    }
}

/// 注册网络变化回调；返回 false 表示当前平台不支持事件推送，TS 层继续兜底轮询。
#[napi]
pub fn watch_network(
    callback: ThreadsafeFunction<(), napi::threadsafe_function::ErrorStrategy::CalleeHandled>,
) -> Result<bool> {
    platform::watch_network(callback)
}
