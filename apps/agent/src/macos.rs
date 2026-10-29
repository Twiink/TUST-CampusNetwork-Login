use super::*;
#[derive(Clone)]
pub struct Platform {
    connection: std::sync::Arc<tokio::sync::Mutex<()>>,
}
impl Platform {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            connection: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        })
    }
    pub async fn watch(&self, _events: tokio::sync::mpsc::Sender<()>) -> Result<()> {
        let exe = std::env::current_exe()?.with_file_name("netmate-host");
        let mut host = tokio::process::Command::new(exe)
            .kill_on_drop(true)
            .spawn()?;
        host.wait().await?;
        anyhow::bail!("macOS 原生菜单栏宿主已退出")
    }
    pub async fn notify(&self, _title: &str, _message: &str) {}
    pub fn autostart(&self, enabled: bool) -> Result<()> {
        let dir = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .ok_or_else(|| anyhow::anyhow!("用户目录不可用"))?
            .join("Library/LaunchAgents");
        std::fs::create_dir_all(&dir)?;
        let file = dir.join("com.netmate.native.plist");
        if !enabled {
            if file.exists() {
                std::fs::remove_file(file)?
            }
            return Ok(());
        }
        let exe = std::env::current_exe()?
            .to_string_lossy()
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        netmate_core::store::atomic_write(&file,format!(r#"<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.netmate.native</string><key>ProgramArguments</key><array><string>{exe}</string><string>--background</string></array><key>RunAtLoad</key><true/></dict></plist>"#).as_bytes())
    }
}
impl Wifi for Platform {
    async fn snapshot(&self) -> Result<Network> {
        Ok(tokio::task::spawn_blocking(|| {
            let mut network = super::native_snapshot();
            network.enabled = netmate_platform::macos::wifi_enabled();
            network
        })
        .await?)
    }
    async fn scan(&self) -> Result<Vec<Network>> {
        Ok(
            tokio::task::spawn_blocking(netmate_platform::macos::scan_wifi)
                .await??
                .into_iter()
                .map(|w| Network {
                    enabled: true,
                    ssid: w.ssid,
                    bssid: w.bssid,
                    security: w.security,
                    rssi: w.rssi,
                    frequency: w.frequency,
                    channel: w.channel,
                    link_speed: w.link_speed,
                    ..Network::default()
                })
                .collect(),
        )
    }
    async fn connect(&self, rule: &WifiRule) -> Result<()> {
        let rule = rule.clone();
        // Move the guard into the OS call: aborting the waiter cannot release it early.
        let serial = self.connection.clone().lock_owned().await;
        tokio::task::spawn_blocking(move || {
            let _serial = serial;
            netmate_platform::macos::connect_wifi(
                &rule.ssid,
                &rule.password,
                rule.bssid.as_deref(),
                rule.security.as_deref(),
            )
        })
        .await??;
        Ok(())
    }
}
