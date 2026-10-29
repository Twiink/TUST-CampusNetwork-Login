use super::*;
use futures_util::StreamExt;
use std::collections::HashMap;
use zbus::{
    Connection, Proxy,
    zvariant::{OwnedObjectPath, OwnedValue, Value},
};
#[derive(Clone)]
pub struct Platform {
    bus: Connection,
    sleeping: std::sync::Arc<std::sync::atomic::AtomicBool>,
}
const NM: &str = "org.freedesktop.NetworkManager";
const ROOT: &str = "/org/freedesktop/NetworkManager";
impl Platform {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            bus: Connection::system().await?,
            sleeping: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
    }
    pub fn suspended(&self) -> bool {
        self.sleeping.load(std::sync::atomic::Ordering::Relaxed)
    }
    async fn proxy<'a>(&'a self, path: &'a str, interface: &'a str) -> Result<Proxy<'a>> {
        Ok(Proxy::new(&self.bus, NM, path, interface).await?)
    }
    async fn devices(&self) -> Result<Vec<OwnedObjectPath>> {
        Ok(self.proxy(ROOT, NM).await?.call("GetDevices", &()).await?)
    }
    async fn wireless(&self) -> Result<OwnedObjectPath> {
        for device in self.devices().await? {
            let p = self
                .proxy(&device, "org.freedesktop.NetworkManager.Device")
                .await?;
            if p.get_property::<u32>("DeviceType").await? == 2 {
                return Ok(device);
            }
        }
        anyhow::bail!("未发现无线网卡")
    }
    pub async fn watch(&self, events: tokio::sync::mpsc::Sender<()>) -> Result<()> {
        let rule = zbus::MatchRule::builder()
            .msg_type(zbus::message::Type::Signal)
            .sender(NM)?
            .build();
        let mut signals = zbus::MessageStream::for_match_rule(rule, &self.bus, Some(32)).await?;
        let power_rule = zbus::MatchRule::builder()
            .msg_type(zbus::message::Type::Signal)
            .interface("org.freedesktop.login1.Manager")?
            .member("PrepareForSleep")?
            .build();
        let mut power = zbus::MessageStream::for_match_rule(power_rule, &self.bus, Some(4)).await?;
        loop {
            tokio::select! {
                message=signals.next()=>{match message{Some(message)=>{let message=message?;if changes_connectivity(&message){let _=events.try_send(());}},None=>break}},
                message=power.next()=>{match message{Some(message)=>{let message=message?;if let Ok(value)=message.body().deserialize::<bool>() {self.sleeping.store(value,std::sync::atomic::Ordering::Relaxed);let _=events.try_send(());}},None=>break}}
            }
        }
        anyhow::bail!("NetworkManager 监听已结束")
    }
    pub async fn notify(&self, title: &str, body: &str) {
        if let Ok(bus) = Connection::session().await
            && let Ok(proxy) = Proxy::new(
                &bus,
                "org.freedesktop.Notifications",
                "/org/freedesktop/Notifications",
                "org.freedesktop.Notifications",
            )
            .await
        {
            let _: zbus::Result<u32> = proxy
                .call(
                    "Notify",
                    &(
                        "NetMate",
                        0u32,
                        "network-wireless",
                        title,
                        body,
                        Vec::<String>::new(),
                        HashMap::<String, Value>::new(),
                        5000i32,
                    ),
                )
                .await;
        }
    }
    pub fn autostart(&self, enabled: bool) -> Result<()> {
        let home = std::env::var_os("HOME").ok_or_else(|| anyhow::anyhow!("用户目录不可用"))?;
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(home).join(".config"));
        let file = base.join("autostart/netmate-native.desktop");
        if !enabled {
            if file.exists() {
                std::fs::remove_file(file)?
            }
            return Ok(());
        }
        std::fs::create_dir_all(file.parent().unwrap())?;
        let exe = std::env::current_exe()?;
        let path = exe
            .to_string_lossy()
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('`', "\\`")
            .replace('$', "\\$")
            .replace('%', "%%");
        netmate_core::store::atomic_write(&file,format!("[Desktop Entry]\nType=Application\nName=NetMate\nExec=\"{path}\" --background\nIcon=network-wireless\nX-GNOME-Autostart-enabled=true\n").as_bytes())
    }
}
impl Wifi for Platform {
    async fn snapshot(&self) -> Result<Network> {
        let root = self.proxy(ROOT, NM).await?;
        let enabled = root.get_property::<bool>("WirelessEnabled").await?;
        let mut snapshot = tokio::task::spawn_blocking(super::native_snapshot).await?;
        snapshot.enabled = enabled;
        Ok(snapshot)
    }
    async fn scan(&self) -> Result<Vec<Network>> {
        let path = self.wireless().await?;
        let wireless = self
            .proxy(&path, "org.freedesktop.NetworkManager.Device.Wireless")
            .await?;
        let old = wireless.get_property::<i64>("LastScan").await?;
        let _: () = wireless
            .call("RequestScan", &(HashMap::<String, Value>::new(),))
            .await?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
        while wireless.get_property::<i64>("LastScan").await? == old {
            if tokio::time::Instant::now() >= deadline {
                anyhow::bail!("WiFi 扫描超时")
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        let aps: Vec<OwnedObjectPath> = wireless.call("GetAllAccessPoints", &()).await?;
        let mut networks = Vec::new();
        for path in aps.into_iter().take(256) {
            let p = self
                .proxy(&path, "org.freedesktop.NetworkManager.AccessPoint")
                .await?;
            let ssid = p.get_property::<Vec<u8>>("Ssid").await?;
            if ssid.is_empty() {
                continue;
            }
            let rsn = p.get_property::<u32>("RsnFlags").await?;
            let wpa = p.get_property::<u32>("WpaFlags").await?;
            let flags = p.get_property::<u32>("Flags").await?;
            let sec = if (rsn | wpa) & 0x200 != 0 {
                "Enterprise"
            } else if rsn & 0x400 != 0 {
                if rsn & 0x100 != 0 {
                    "WPA2-WPA3"
                } else {
                    "WPA3"
                }
            } else if rsn != 0 {
                "WPA2"
            } else if wpa != 0 {
                "WPA"
            } else if flags & 1 != 0 {
                "WEP"
            } else {
                "Open"
            };
            let frequency = p.get_property::<u32>("Frequency").await? as i32;
            networks.push(Network {
                enabled: true,
                ssid: Some(String::from_utf8_lossy(&ssid).into_owned()),
                bssid: Some(p.get_property("HwAddress").await?),
                security: Some(sec.into()),
                rssi: Some((p.get_property::<u8>("Strength").await? as i32 * 60 / 100) - 100),
                frequency: Some(frequency),
                channel: Some(super::channel(frequency)),
                ..Network::default()
            });
        }
        networks.sort_by_key(|n| std::cmp::Reverse(n.rssi));
        Ok(networks)
    }
    async fn connect(&self, rule: &WifiRule) -> Result<()> {
        let device = self.wireless().await?;
        if netmate_core::model::security(rule.security.as_deref().unwrap_or("Open")) == "enterprise"
        {
            anyhow::bail!("企业网络请先通过系统网络设置创建连接")
        }
        let root = self.proxy(ROOT, NM).await?;
        let mut owned_profile = None;
        {
            let settings = self
                .proxy(
                    "/org/freedesktop/NetworkManager/Settings",
                    "org.freedesktop.NetworkManager.Settings",
                )
                .await?;
            let paths: Vec<OwnedObjectPath> = settings.call("ListConnections", &()).await?;
            for path in paths {
                let p = self
                    .proxy(&path, "org.freedesktop.NetworkManager.Settings.Connection")
                    .await?;
                let config: HashMap<String, HashMap<String, OwnedValue>> =
                    p.call("GetSettings", &()).await?;
                let ssid = config
                    .get("802-11-wireless")
                    .and_then(|s| s.get("ssid"))
                    .and_then(|v| Vec::<u8>::try_from(v.try_clone().ok()?).ok());
                let name = config
                    .get("connection")
                    .and_then(|c| c.get("id"))
                    .and_then(|v| <&str>::try_from(v).ok());
                if name == Some(format!("NetMate-{}", rule.id).as_str()) {
                    owned_profile = Some(path.clone());
                }
                let system_security = config
                    .get("802-11-wireless-security")
                    .and_then(|s| s.get("key-mgmt"))
                    .and_then(|v| <&str>::try_from(v).ok())
                    .unwrap_or("none");
                let expected =
                    netmate_core::model::security(rule.security.as_deref().unwrap_or("Open"));
                let matches_security = match system_security {
                    "none" => expected == "open",
                    "wpa-psk" => expected == "wpa2" || expected == "wpa2wpa3",
                    "sae" => expected == "wpa3" || expected == "wpa2wpa3",
                    _ => false,
                };
                let configured_bssid = config
                    .get("802-11-wireless")
                    .and_then(|s| s.get("bssid"))
                    .and_then(|v| Vec::<u8>::try_from(v.try_clone().ok()?).ok());
                let matches_bssid = rule.bssid.as_ref().is_none_or(|b| {
                    configured_bssid.as_ref().is_some_and(|bytes| {
                        bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
                            == b.replace(':', "").to_lowercase()
                    })
                });
                if rule.password.is_empty()
                    && matches_security
                    && matches_bssid
                    && ssid.as_deref() == Some(rule.ssid.as_bytes())
                {
                    let _: OwnedObjectPath = root
                        .call(
                            "ActivateConnection",
                            &(&path, &device, OwnedObjectPath::try_from("/")?),
                        )
                        .await?;
                    return Ok(());
                }
            }
        }
        let mut config: HashMap<&str, HashMap<&str, Value<'_>>> = HashMap::new();
        let connection = HashMap::from([
            ("id", Value::from(format!("NetMate-{}", rule.id))),
            ("type", Value::from("802-11-wireless")),
            ("autoconnect", Value::from(false)),
        ]);
        config.insert("connection", connection);
        let mut wireless = HashMap::from([
            ("ssid", Value::from(rule.ssid.as_bytes().to_vec())),
            ("mode", Value::from("infrastructure")),
        ]);
        if let Some(b) = &rule.bssid {
            let bytes: Vec<u8> = b
                .split(':')
                .map(|s| u8::from_str_radix(s, 16))
                .collect::<std::result::Result<_, _>>()?;
            wireless.insert("bssid", Value::from(bytes));
        }
        config.insert("802-11-wireless", wireless);
        if !rule.password.is_empty() {
            config.insert(
                "802-11-wireless-security",
                HashMap::from([
                    (
                        "key-mgmt",
                        Value::from(if rule.security.as_deref() == Some("WPA3") {
                            "sae"
                        } else {
                            "wpa-psk"
                        }),
                    ),
                    ("psk", Value::from(rule.password.as_str())),
                ]),
            );
        }
        config.insert("ipv4", HashMap::from([("method", Value::from("auto"))]));
        config.insert("ipv6", HashMap::from([("method", Value::from("auto"))]));
        if let Some(profile) = owned_profile {
            let proxy = self
                .proxy(
                    &profile,
                    "org.freedesktop.NetworkManager.Settings.Connection",
                )
                .await?;
            let _: HashMap<String, OwnedValue> = proxy
                .call("Update2", &(&config, 2u32, HashMap::<String, Value>::new()))
                .await?;
            let _: OwnedObjectPath = root
                .call(
                    "ActivateConnection",
                    &(&profile, &device, OwnedObjectPath::try_from("/")?),
                )
                .await?;
            return Ok(());
        }
        let _: (
            OwnedObjectPath,
            OwnedObjectPath,
            HashMap<String, OwnedValue>,
        ) = root
            .call(
                "AddAndActivateConnection2",
                &(
                    config,
                    device,
                    OwnedObjectPath::try_from("/")?,
                    HashMap::from([("persist", Value::from("memory"))]),
                ),
            )
            .await?;
        Ok(())
    }
}

fn changes_connectivity(message: &zbus::Message) -> bool {
    let header = message.header();
    let member = header.member().map(|value| value.as_str()).unwrap_or("");
    if matches!(member, "StateChanged" | "DeviceAdded" | "DeviceRemoved") {
        return true;
    }
    if member != "PropertiesChanged" {
        return false;
    }
    let Ok((_, changed, invalidated)) =
        message
            .body()
            .deserialize::<(String, HashMap<String, OwnedValue>, Vec<String>)>()
    else {
        return false;
    };
    changed.keys().chain(invalidated.iter()).any(|key| {
        matches!(
            key.as_str(),
            "WirelessEnabled"
                | "ActiveAccessPoint"
                | "Ip4Config"
                | "Ip6Config"
                | "ActiveConnections"
                | "ActiveConnection"
                | "State"
                | "Connectivity"
        )
    })
}
