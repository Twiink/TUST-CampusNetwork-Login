use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub username: String,
    pub password: String,
    pub isp: String,
    pub server_url: String,
}
impl Default for Account {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            username: String::new(),
            password: String::new(),
            isp: "campus".into(),
            server_url: "http://10.10.102.50:801".into(),
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WifiRule {
    pub id: String,
    pub ssid: String,
    pub password: String,
    pub security: Option<String>,
    pub bssid: Option<String>,
    pub priority: u8,
    pub auto_connect: bool,
    pub requires_auth: bool,
    pub linked_account_ids: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub auto_launch: bool,
    pub enable_heartbeat: bool,
    pub heartbeat_interval_seconds: u64,
    pub heartbeat_failure_threshold: u32,
    pub auto_reconnect: bool,
    pub auto_auth_paused: bool,
    pub wifi_reconnect_retries: u32,
    pub wifi_reconnect_cooldown_minutes: u64,
    pub startup_auto_connect: bool,
    pub keep_current_connection: bool,
    pub auto_update: bool,
    pub notification_settings: NotificationSettings,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub wifi_disconnected: bool,
    pub reconnect_success: bool,
    pub reconnect_failed: bool,
    pub auth_recovered: bool,
}
impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            wifi_disconnected: true,
            reconnect_success: true,
            reconnect_failed: true,
            auth_recovered: true,
        }
    }
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_launch: false,
            enable_heartbeat: true,
            heartbeat_interval_seconds: 30,
            heartbeat_failure_threshold: 3,
            auto_reconnect: true,
            auto_auth_paused: false,
            wifi_reconnect_retries: 3,
            wifi_reconnect_cooldown_minutes: 5,
            startup_auto_connect: false,
            keep_current_connection: true,
            auto_update: true,
            notification_settings: NotificationSettings::default(),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub schema: u32,
    pub revision: u64,
    pub accounts: Vec<Account>,
    pub current_account_id: Option<String>,
    pub wifi_rules: Vec<WifiRule>,
    pub settings: Settings,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            schema: 1,
            revision: 0,
            accounts: vec![],
            current_account_id: None,
            wifi_rules: vec![],
            settings: Settings::default(),
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<()> {
        if self.schema != 1 || self.accounts.len() > 100 || self.wifi_rules.len() > 100 {
            bail!("配置版本或数量无效")
        }
        let mut ids = std::collections::HashSet::new();
        for a in &self.accounts {
            if a.id.is_empty()
                || a.id.len() > 128
                || !ids.insert(&a.id)
                || a.username.is_empty()
                || a.username.len() > 256
                || a.name.len() > 128
                || a.server_url.len() > 2048
                || a.password.len() > 2048
                || !["campus", "cmcc", "cucc", "ctcc"].contains(&a.isp.as_str())
            {
                bail!("账号配置无效")
            }
            let url = url::Url::parse(&a.server_url)?;
            if !["http", "https"].contains(&url.scheme())
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                bail!("认证服务器地址无效")
            }
        }
        if self
            .current_account_id
            .as_ref()
            .is_some_and(|id| !ids.contains(id))
        {
            bail!("当前账号不存在")
        }
        let mut wifi_ids = std::collections::HashSet::new();
        for w in &self.wifi_rules {
            if w.id.is_empty()
                || w.id.len() > 128
                || !wifi_ids.insert(&w.id)
                || w.ssid.is_empty()
                || w.ssid.len() > 32
                || w.priority == 0
                || w.priority > 99
                || w.password.len() > 256
                || w.linked_account_ids.iter().any(|id| !ids.contains(id))
            {
                bail!("WiFi 配置无效")
            }
        }
        let s = &self.settings;
        if !(5..=300).contains(&s.heartbeat_interval_seconds)
            || !(1..=10).contains(&s.wifi_reconnect_retries)
            || !(1..=10).contains(&s.heartbeat_failure_threshold)
            || s.wifi_reconnect_cooldown_minutes > 1440
        {
            bail!("检测与恢复参数无效")
        }
        Ok(())
    }
    pub fn public(&self) -> serde_json::Value {
        let mut value = serde_json::to_value(self).expect("config serializes");
        for field in ["accounts", "wifiRules"] {
            for item in value[field].as_array_mut().expect("array") {
                let has = !item["password"].as_str().unwrap_or("").is_empty();
                item.as_object_mut().unwrap().remove("password");
                item["hasPassword"] = has.into();
            }
        }
        value
    }
    pub fn edit(&self, mut value: serde_json::Value) -> Result<Self> {
        for field in ["accounts", "wifiRules"] {
            let entries = value[field]
                .as_array_mut()
                .ok_or_else(|| anyhow::anyhow!("配置列表无效"))?;
            for entry in entries {
                let id = entry["id"].as_str().unwrap_or("");
                let previous = if field == "accounts" {
                    self.accounts
                        .iter()
                        .find(|a| a.id == id)
                        .map(|a| a.password.as_str())
                } else {
                    self.wifi_rules
                        .iter()
                        .find(|w| w.id == id)
                        .map(|w| w.password.as_str())
                };
                let password = match entry.get("passwordEdit") {
                    None => previous.unwrap_or("").to_string(),
                    Some(edit) => match edit["action"].as_str() {
                        Some("keep") => previous.unwrap_or("").to_string(),
                        Some("clear") => String::new(),
                        Some("replace") => edit["value"]
                            .as_str()
                            .ok_or_else(|| anyhow::anyhow!("密码值无效"))?
                            .to_string(),
                        _ => bail!("密码操作无效"),
                    },
                };
                entry["password"] = password.into();
            }
        }
        let mut next: Self = serde_json::from_value(value)?;
        if next.revision != self.revision {
            bail!("配置已变化，请刷新后重试")
        }
        next.revision += 1;
        next.validate()?;
        Ok(next)
    }
}
#[derive(Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Network {
    pub enabled: bool,
    pub ssid: Option<String>,
    pub bssid: Option<String>,
    pub security: Option<String>,
    pub ipv4: Option<String>,
    pub ipv6: Option<String>,
    pub rssi: Option<i32>,
    pub frequency: Option<i32>,
    pub channel: Option<i32>,
    pub link_speed: Option<i32>,
}
impl Network {
    pub fn key(&self) -> String {
        serde_json::to_string(&(&self.ssid, &self.bssid, &self.security, &self.ipv4)).unwrap()
    }
    pub fn connected(&self) -> bool {
        self.ssid.is_some() && self.ipv4.is_some()
    }
    pub fn matches(&self, w: &WifiRule) -> bool {
        self.ssid.as_ref() == Some(&w.ssid)
            && w.bssid.as_ref().is_none_or(|b| {
                self.bssid
                    .as_ref()
                    .is_some_and(|n| n.eq_ignore_ascii_case(b))
            })
            && w.security.as_ref().is_none_or(|s| {
                self.security
                    .as_ref()
                    .is_some_and(|n| security_matches(s, n))
            })
    }
}
pub fn security(s: &str) -> String {
    let s = s.to_ascii_lowercase().replace(['-', '_', ' '], "");
    if s.contains("eap") || s.contains("enterprise") {
        "enterprise".into()
    } else if s.contains("sae") || s.contains("wpa3") {
        if s.contains("wpa2") || s.contains("psk") {
            "wpa2wpa3".into()
        } else {
            "wpa3".into()
        }
    } else if s.contains("wpa2") || s.contains("psk") {
        "wpa2".into()
    } else if s.contains("wpa") {
        "wpa".into()
    } else if s.contains("wep") {
        "wep".into()
    } else {
        "open".into()
    }
}
pub fn security_matches(expected: &str, actual: &str) -> bool {
    let expected = security(expected);
    let actual = security(actual);
    expected == actual || (expected == "wpa2wpa3" && (actual == "wpa2" || actual == "wpa3"))
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Snapshot {
    pub revision: u64,
    pub network: Network,
    pub internet_reachable: bool,
    pub has_connected: bool,
    pub requires_auth: bool,
    pub authenticated: bool,
    pub paused: bool,
    pub phase: String,
    pub target_id: Option<String>,
    pub attempt: u32,
    pub max_attempts: u32,
    pub failures: Vec<Failure>,
    pub message: String,
    pub next_heartbeat_at: Option<u64>,
    pub next_retry_at: Option<u64>,
    pub monitor_degraded: bool,
    pub sequence: u64,
    pub log_revision: u64,
    pub notification: Option<Notification>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Failure {
    pub id: String,
    pub ssid: String,
    pub reason: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: u64,
    pub title: String,
    pub message: String,
}
