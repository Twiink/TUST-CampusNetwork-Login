use anyhow::Result;
use netmate_core::{
    model::{Network, WifiRule},
    recovery::Wifi,
};
#[cfg(all(target_os = "linux", not(feature = "test-driver")))]
#[path = "linux.rs"]
mod imp;
#[cfg(all(target_os = "windows", not(feature = "test-driver")))]
#[path = "windows.rs"]
mod imp;
#[cfg(all(target_os = "macos", not(feature = "test-driver")))]
#[path = "macos.rs"]
mod imp;
#[cfg(feature = "test-driver")]
#[path = "fixture.rs"]
mod imp;
pub use imp::Platform;
#[cfg(not(feature = "test-driver"))]
pub fn native_snapshot() -> Network {
    let wifi = netmate_platform::current_wifi();
    let info = netmate_platform::network_info();
    Network {
        enabled: true,
        ssid: wifi.as_ref().and_then(|w| w.ssid.clone()),
        bssid: wifi.as_ref().and_then(|w| w.bssid.clone()),
        security: wifi.as_ref().and_then(|w| w.security.clone()),
        rssi: wifi.as_ref().and_then(|w| w.rssi),
        frequency: wifi.as_ref().and_then(|w| w.frequency),
        channel: wifi.as_ref().and_then(|w| w.channel),
        link_speed: wifi.as_ref().and_then(|w| w.link_speed),
        ipv4: info.as_ref().and_then(|i| i.ipv4.clone()),
        ipv6: info.and_then(|i| i.ipv6),
    }
}
#[cfg(all(target_os = "linux", not(feature = "test-driver")))]
pub fn channel(f: i32) -> i32 {
    match f {
        2484 => 14,
        2412..=2472 => (f - 2407) / 5,
        5935 => 2,
        5955..=7115 => (f - 5950) / 5,
        5000..=5900 => (f - 5000) / 5,
        _ => 0,
    }
}

#[cfg(not(target_os = "linux"))]
pub fn start_tray(
    calls: tokio::sync::mpsc::Sender<crate::Call>,
    state: tokio::sync::watch::Receiver<netmate_core::model::Snapshot>,
) -> tokio::task::JoinHandle<()> {
    #[cfg(target_os = "windows")]
    {
        crate::win_tray::start(calls, state)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (calls, state);
        tokio::spawn(async { std::future::pending::<()>().await })
    }
}
