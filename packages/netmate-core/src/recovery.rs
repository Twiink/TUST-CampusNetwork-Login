use crate::{
    auth::{PROBES, PortalPool},
    model::*,
};
use anyhow::{Result, bail};
use std::{future::Future, sync::Arc, time::Duration};
pub trait Wifi: Send + Sync + 'static {
    fn snapshot(&self) -> impl Future<Output = Result<Network>> + Send;
    fn scan(&self) -> impl Future<Output = Result<Vec<Network>>> + Send;
    fn connect(&self, rule: &WifiRule) -> impl Future<Output = Result<()>> + Send;
}
#[derive(Clone)]
pub enum Trigger {
    Startup,
    Check,
    Login,
    Retry,
    Connect(String),
}
pub struct Recovery<P: Wifi> {
    pub platform: Arc<P>,
    pub config: Config,
    pub state: Snapshot,
    pub session: Option<(String, String)>,
    pub offline_streak: u32,
    pub probes: Vec<String>,
    pub portals: Arc<PortalPool>,
}
impl<P: Wifi> Recovery<P> {
    pub fn new(platform: Arc<P>, config: Config, state: Snapshot) -> Self {
        Self {
            platform,
            config,
            state,
            session: None,
            offline_streak: 0,
            probes: PROBES.iter().map(|s| s.to_string()).collect(),
            portals: Arc::new(PortalPool::default()),
        }
    }
    pub async fn run(&mut self, trigger: Trigger, publish: impl Fn(&Snapshot)) -> Result<()> {
        let mut network = self.platform.snapshot().await?;
        if network.enabled && network.ssid.is_some() && network.ipv4.is_none() {
            self.state.network = network.clone();
            self.state.phase = "awaiting-address".into();
            self.state.message = "等待 WiFi 获取地址".into();
            publish(&self.state);
            let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
            while network.enabled
                && network.ssid.is_some()
                && network.ipv4.is_none()
                && tokio::time::Instant::now() < deadline
            {
                tokio::time::sleep(Duration::from_millis(250)).await;
                network = self.platform.snapshot().await?;
            }
        }
        let mut cooldown = self.state.next_retry_at.filter(|time| *time > now());
        self.state.has_connected |= network.connected();
        if self.state.network.key() != network.key() {
            cooldown = None;
            self.state.authenticated = false;
            self.state.internet_reachable = false;
            self.session = None;
            self.offline_streak = 0;
        }
        self.state.network = network;
        self.state.revision = self.config.revision;
        self.state.paused = self.config.settings.auto_auth_paused;
        self.state.next_retry_at = None;
        let n = &self.state.network;
        let previously_online = self.state.internet_reachable;
        self.state.requires_auth = self
            .config
            .wifi_rules
            .iter()
            .find(|w| n.matches(w))
            .map(|w| w.requires_auth)
            .unwrap_or_else(|| {
                n.ssid.as_ref().is_some_and(|s| {
                    s.to_uppercase().starts_with("TUST") || s.to_uppercase().starts_with("CU_TUST")
                }) && n.ipv4.as_ref().is_some_and(|ip| ip.starts_with("10."))
            });
        if !n.enabled {
            self.state.phase = "cancelled".into();
            self.state.message = "系统 WiFi 已关闭".into();
            publish(&self.state);
            return Ok(());
        }
        if matches!(trigger, Trigger::Startup)
            && !self.config.settings.startup_auto_connect
            && (!n.connected() || !self.config.settings.auto_reconnect)
        {
            self.state.phase = "offline".into();
            publish(&self.state);
            return Ok(());
        }
        let manual = matches!(
            trigger,
            Trigger::Login | Trigger::Connect(_) | Trigger::Retry
        );
        if !matches!(trigger, Trigger::Connect(_)) && n.connected() {
            let identity = n.key();
            let client = self.portals.for_network(n)?;
            let online = client.online(&self.probes).await;
            if !self.same_network(&identity, &publish).await? {
                return Ok(());
            }
            self.state.internet_reachable = online;
            if online {
                self.state.authenticated = self.state.requires_auth;
                self.offline_streak = 0;
                self.state.phase = "online".into();
                self.state.message = "互联网可达".into();
                publish(&self.state);
                if !matches!(trigger, Trigger::Startup)
                    || self.config.settings.keep_current_connection
                {
                    return Ok(());
                }
            } else if matches!(trigger, Trigger::Check)
                && (previously_online || self.offline_streak > 0)
            {
                self.offline_streak += 1;
                if self.offline_streak < self.config.settings.heartbeat_failure_threshold {
                    publish(&self.state);
                    return Ok(());
                }
            }
        }
        if !manual && matches!(trigger, Trigger::Check) && !self.config.settings.auto_reconnect {
            self.state.phase = "offline".into();
            publish(&self.state);
            return Ok(());
        }
        if matches!(trigger, Trigger::Check) {
            if !self.state.has_connected && !self.state.network.connected() {
                self.state.phase = "offline".into();
                self.state.message = "等待系统连接 WiFi".into();
                publish(&self.state);
                return Ok(());
            }
            if let Some(deadline) = cooldown {
                self.state.phase = "cooldown".into();
                self.state.next_retry_at = Some(deadline);
                publish(&self.state);
                return Ok(());
            }
        }
        let current = self
            .config
            .wifi_rules
            .iter()
            .filter(|w| self.state.network.matches(w))
            .max_by_key(|w| usize::from(w.bssid.is_some()) + usize::from(w.security.is_some()))
            .cloned();
        if current.is_none() && self.state.network.ssid.is_some() {
            let name = self.state.network.ssid.clone().unwrap();
            if !self.config.wifi_rules.iter().any(|w| w.ssid == name)
                && self
                    .state
                    .network
                    .ipv4
                    .as_deref()
                    .is_some_and(|ip| ip.starts_with("10."))
                && (name.to_uppercase().starts_with("TUST")
                    || name.to_uppercase().starts_with("CU_TUST"))
            {
                let rule = WifiRule {
                    id: "current-network".into(),
                    ssid: name,
                    requires_auth: true,
                    linked_account_ids: self
                        .config
                        .current_account_id
                        .clone()
                        .into_iter()
                        .collect(),
                    priority: 1,
                    ..WifiRule::default()
                };
                self.config.wifi_rules.push(rule);
            }
        }
        let current = self
            .config
            .wifi_rules
            .iter()
            .filter(|w| self.state.network.matches(w))
            .max_by_key(|w| usize::from(w.bssid.is_some()) + usize::from(w.security.is_some()))
            .cloned();
        let current_id = current
            .as_ref()
            .map(|w| w.id.clone())
            .or_else(|| self.state.target_id.clone());
        let mut candidates = match &trigger {
            Trigger::Connect(id) => vec![
                self.config
                    .wifi_rules
                    .iter()
                    .find(|w| &w.id == id)
                    .cloned()
                    .ok_or_else(|| anyhow::anyhow!("WiFi 配置不存在"))?,
            ],
            Trigger::Login => vec![current.clone().unwrap_or(WifiRule {
                id: "current".into(),
                ssid: self.state.network.ssid.clone().unwrap_or_default(),
                requires_auth: true,
                linked_account_ids: self.config.current_account_id.clone().into_iter().collect(),
                priority: 1,
                ..WifiRule::default()
            })],
            Trigger::Startup
                if self.state.network.connected()
                    && self.config.settings.keep_current_connection =>
            {
                current.clone().into_iter().collect()
            }
            _ => self
                .config
                .wifi_rules
                .iter()
                .filter(|w| {
                    w.auto_connect
                        && security(w.security.as_deref().unwrap_or("open")) != "enterprise"
                })
                .cloned()
                .collect(),
        };
        if !matches!(trigger, Trigger::Login | Trigger::Connect(_)) {
            candidates.sort_by_key(|w| {
                (
                    if matches!(trigger, Trigger::Startup)
                        && !self.config.settings.keep_current_connection
                    {
                        false
                    } else {
                        Some(&w.id) != current_id.as_ref()
                    },
                    w.priority,
                )
            });
        }
        if let Some(c) = current
            && !matches!(trigger, Trigger::Connect(_) | Trigger::Login)
            && !candidates.iter().any(|w| w.id == c.id)
            && (!matches!(trigger, Trigger::Startup)
                || self.config.settings.keep_current_connection)
        {
            candidates.insert(0, c)
        }
        self.state.failures.clear();
        if candidates.is_empty() {
            self.state.phase = "offline".into();
            self.state.message = "没有可用的自动连接规则".into();
            publish(&self.state);
            return Ok(());
        }
        for candidate in candidates {
            let mut reason = "无法连接目标 WiFi".to_string();
            let tries = if matches!(trigger, Trigger::Login) {
                1
            } else {
                self.config.settings.wifi_reconnect_retries
            };
            self.state.target_id = Some(candidate.id.clone());
            self.state.max_attempts = tries;
            for attempt in 1..=tries {
                self.state.attempt = attempt;
                self.state.phase = "connecting".into();
                self.state.message = candidate.ssid.clone();
                publish(&self.state);
                let network = self.platform.snapshot().await?;
                if !network.enabled {
                    bail!("系统 WiFi 已关闭")
                }
                if !network.matches(&candidate) {
                    if let Err(e) = self.platform.connect(&candidate).await {
                        reason = e.to_string();
                        continue;
                    }
                    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
                    loop {
                        let network = self.platform.snapshot().await?;
                        if network.connected() && network.matches(&candidate) {
                            break;
                        }
                        if tokio::time::Instant::now() >= deadline {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
                let network = self.platform.snapshot().await?;
                if !network.matches(&candidate) || !network.connected() {
                    reason = "未在等待时间内连接目标网络".into();
                    continue;
                }
                if self.state.network.key() != network.key() {
                    self.state.authenticated = false;
                    self.session = None;
                }
                self.state.has_connected |= network.connected();
                self.state.network = network;
                self.state.requires_auth = candidate.requires_auth;
                let identity = self.state.network.key();
                let portal = self.portals.for_network(&self.state.network)?;
                let mut online = portal.online(&self.probes).await;
                if !self.same_network(&identity, &publish).await? {
                    return Ok(());
                }
                if candidate.requires_auth && !online && !self.state.authenticated {
                    if self.config.settings.auto_auth_paused {
                        self.state.phase = "paused".into();
                        self.state.message = "自动认证已暂停".into();
                        publish(&self.state);
                        return Ok(());
                    }
                    self.state.phase = "authenticating".into();
                    publish(&self.state);
                    let mut accounts: Vec<_> = candidate
                        .linked_account_ids
                        .iter()
                        .filter_map(|id| self.config.accounts.iter().find(|a| &a.id == id).cloned())
                        .collect();
                    if accounts.is_empty() {
                        accounts = self
                            .config
                            .current_account_id
                            .as_ref()
                            .and_then(|id| {
                                self.config.accounts.iter().find(|a| &a.id == id).cloned()
                            })
                            .into_iter()
                            .collect();
                    }
                    if accounts.is_empty() {
                        reason = "请先配置并关联认证账号".into();
                    }
                    for account in accounts {
                        if !self.same_network(&identity, &publish).await? {
                            return Ok(());
                        }
                        let outcome = portal.login(&account, &self.state.network).await;
                        if !self.same_network(&identity, &publish).await? {
                            return Ok(());
                        }
                        match outcome {
                            Ok(message) => {
                                self.state.authenticated = true;
                                self.session =
                                    Some((self.state.network.key(), account.server_url.clone()));
                                self.state.message = message;
                                break;
                            }
                            Err(e) => reason = e.to_string(),
                        }
                    }
                }
                self.state.phase = "verifying".into();
                publish(&self.state);
                let confirmations = if candidate.requires_auth && !self.state.authenticated {
                    1
                } else {
                    self.config.settings.heartbeat_failure_threshold
                };
                for check in 0..confirmations {
                    if check > 0 {
                        tokio::time::sleep(Duration::from_secs(
                            self.config.settings.heartbeat_interval_seconds,
                        ))
                        .await;
                    }
                    if !self.same_network(&identity, &publish).await? {
                        return Ok(());
                    }
                    online = portal.online(&self.probes).await;
                    if !self.same_network(&identity, &publish).await? {
                        return Ok(());
                    }
                    self.state.internet_reachable = online;
                    publish(&self.state);
                    if online {
                        break;
                    }
                }
                if online {
                    self.state.phase = "online".into();
                    self.state.message = "网络已恢复".into();
                    self.state.internet_reachable = true;
                    self.offline_streak = 0;
                    publish(&self.state);
                    return Ok(());
                }
                if self.state.authenticated {
                    reason = "门户已认证，但互联网不可达".into();
                    break;
                }
                if attempt < tries {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
            self.state.failures.push(Failure {
                id: candidate.id,
                ssid: candidate.ssid,
                reason,
            });
        }
        self.state.phase = "failed".into();
        self.state.message = "所有候选网络均未恢复".into();
        if self.config.settings.auto_reconnect
            && !matches!(trigger, Trigger::Login | Trigger::Connect(_))
        {
            self.state.phase = "cooldown".into();
            self.state.next_retry_at = Some(
                now() + (self.config.settings.wifi_reconnect_cooldown_minutes * 60_000).max(5000),
            );
        }
        publish(&self.state);
        Ok(())
    }
    async fn same_network(&mut self, identity: &str, publish: &impl Fn(&Snapshot)) -> Result<bool> {
        let actual = self.platform.snapshot().await?;
        if actual.enabled && actual.key() == identity {
            return Ok(true);
        }
        self.state.network = actual;
        self.state.authenticated = false;
        self.state.internet_reachable = false;
        self.state.requires_auth = false;
        self.state.next_retry_at = None;
        self.state.phase = "network-changed".into();
        self.state.message = "网络身份已变化，重新检查连接".into();
        self.session = None;
        self.offline_streak = 0;
        publish(&self.state);
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    struct Fake {
        network: Mutex<Network>,
        connections: Mutex<Vec<String>>,
    }
    impl Wifi for Fake {
        async fn snapshot(&self) -> Result<Network> {
            Ok(self.network.lock().unwrap().clone())
        }
        async fn scan(&self) -> Result<Vec<Network>> {
            Ok(vec![])
        }
        async fn connect(&self, w: &WifiRule) -> Result<()> {
            self.connections.lock().unwrap().push(w.id.clone());
            let mut n = self.network.lock().unwrap();
            n.ssid = Some(w.ssid.clone());
            n.security = w.security.clone();
            n.ipv4 = Some("127.0.0.1".into());
            Ok(())
        }
    }
    async fn server(
        fake: Arc<Fake>,
        portal_ok: bool,
        online_ssid: &str,
    ) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let online_ssid = online_ssid.to_string();
        let task = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut b = [0; 4096];
                let n = stream.read(&mut b).await.unwrap();
                let login = String::from_utf8_lossy(&b[..n]).contains("/portal/login");
                let online = fake.network.lock().unwrap().ssid.as_deref() == Some(&online_ssid);
                let response = if login {
                    if portal_ok {
                        "HTTP/1.1 200 OK\r\nContent-Length: 23\r\nConnection: close\r\n\r\ncb({\"status\":1,\"msg\":\"\"})"
                    } else {
                        "HTTP/1.1 200 OK\r\nContent-Length: 16\r\nConnection: close\r\n\r\ncb({\"status\":0})"
                    }
                } else if online {
                    "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n"
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                };
                let _ = stream.write_all(response.as_bytes()).await;
            }
        });
        (url, task)
    }
    fn wifi(id: &str, priority: u8) -> WifiRule {
        WifiRule {
            id: id.into(),
            ssid: id.into(),
            priority,
            auto_connect: true,
            ..WifiRule::default()
        }
    }
    fn fake() -> Arc<Fake> {
        Arc::new(Fake {
            network: Mutex::new(Network {
                enabled: true,
                ..Network::default()
            }),
            connections: Mutex::new(vec![]),
        })
    }
    #[tokio::test]
    async fn priority_and_equal_priority_remain_stable() {
        let p = fake();
        let (url, server) = server(p.clone(), false, "backup").await;
        let mut config = Config::default();
        config.settings.startup_auto_connect = true;
        config.settings.heartbeat_failure_threshold = 1;
        config.settings.wifi_reconnect_retries = 1;
        config.wifi_rules = vec![wifi("first", 5), wifi("second", 5), wifi("backup", 10)];
        let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
        engine.probes = vec![url];
        engine.run(Trigger::Startup, |_| {}).await.unwrap();
        assert_eq!(
            *p.connections.lock().unwrap(),
            vec!["first", "second", "backup"]
        );
        assert!(engine.state.internet_reachable);
        server.abort();
    }
    #[tokio::test]
    async fn disabled_runtime_recovery_does_not_switch() {
        let p = fake();
        let mut config = Config::default();
        config.settings.auto_reconnect = false;
        config.wifi_rules = vec![wifi("backup", 1)];
        let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
        engine.run(Trigger::Check, |_| {}).await.unwrap();
        assert!(p.connections.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn manual_retry_can_use_candidates_when_runtime_disabled() {
        let p = fake();
        let (url, server) = server(p.clone(), false, "backup").await;
        let mut config = Config::default();
        config.settings.auto_reconnect = false;
        config.wifi_rules = vec![wifi("backup", 1)];
        let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
        engine.probes = vec![url];
        engine.run(Trigger::Retry, |_| {}).await.unwrap();
        assert!(engine.state.internet_reachable);
        assert_eq!(p.connections.lock().unwrap().len(), 1);
        server.abort();
    }
    #[tokio::test]
    async fn paused_auth_still_allows_wifi_association() {
        let p = fake();
        let (url, server) = server(p.clone(), false, "never").await;
        let mut config = Config::default();
        config.settings.auto_auth_paused = true;
        let mut rule = wifi("backup", 1);
        rule.requires_auth = true;
        config.wifi_rules = vec![rule];
        let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
        engine.probes = vec![url];
        engine.state.has_connected = true;
        engine.run(Trigger::Check, |_| {}).await.unwrap();
        assert_eq!(*p.connections.lock().unwrap(), vec!["backup"]);
        assert_eq!(engine.state.phase, "paused");
        assert!(!engine.state.authenticated);
        server.abort();
    }
    #[tokio::test]
    async fn minimum_retry_delay_is_five_seconds() {
        let p = fake();
        let (url, server) = server(p.clone(), false, "never").await;
        let mut config = Config::default();
        config.settings.startup_auto_connect = true;
        config.settings.wifi_reconnect_cooldown_minutes = 0;
        config.settings.heartbeat_failure_threshold = 1;
        config.settings.wifi_reconnect_retries = 1;
        config.wifi_rules = vec![wifi("offline", 1)];
        let mut engine = Recovery::new(p, config, Snapshot::default());
        engine.probes = vec![url];
        engine.run(Trigger::Startup, |_| {}).await.unwrap();
        assert!(engine.state.next_retry_at.unwrap() >= now() + 4900);
        server.abort();
    }
    #[tokio::test]
    async fn heartbeat_does_not_restart_a_round_during_cooldown() {
        let p = fake();
        let (url, server) = server(p.clone(), false, "never").await;
        let mut config = Config::default();
        config.settings.heartbeat_failure_threshold = 1;
        config.settings.wifi_reconnect_retries = 1;
        config.wifi_rules = vec![wifi("offline", 1)];
        let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
        engine.probes = vec![url];
        engine.run(Trigger::Retry, |_| {}).await.unwrap();
        let deadline = engine.state.next_retry_at;
        assert_eq!(engine.state.phase, "cooldown");
        engine.run(Trigger::Check, |_| {}).await.unwrap();
        assert_eq!(engine.state.next_retry_at, deadline);
        assert_eq!(*p.connections.lock().unwrap(), vec!["offline"]);
        server.abort();
    }
    #[tokio::test]
    async fn startup_and_runtime_switches_are_independent() {
        for startup in [false, true] {
            for runtime in [false, true] {
                let p = fake();
                let (url, server) = server(p.clone(), false, "backup").await;
                let mut config = Config::default();
                config.settings.startup_auto_connect = startup;
                config.settings.auto_reconnect = runtime;
                config.wifi_rules = vec![wifi("backup", 1)];
                let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
                engine.probes = vec![url];
                engine.run(Trigger::Startup, |_| {}).await.unwrap();
                assert_eq!(p.connections.lock().unwrap().len(), usize::from(startup));
                if !startup {
                    engine.run(Trigger::Check, |_| {}).await.unwrap();
                    assert!(p.connections.lock().unwrap().is_empty());
                }
                // A real association followed by loss exercises the runtime switch.
                engine.state.has_connected = true;
                engine.state.network = Network::default();
                *p.network.lock().unwrap() = Network {
                    enabled: true,
                    ..Network::default()
                };
                p.connections.lock().unwrap().clear();
                engine.run(Trigger::Check, |_| {}).await.unwrap();
                assert_eq!(p.connections.lock().unwrap().len(), usize::from(runtime));
                server.abort();
            }
        }
    }
    #[tokio::test]
    async fn radio_disabled_never_associates() {
        let p = fake();
        p.network.lock().unwrap().enabled = false;
        let mut config = Config::default();
        config.wifi_rules = vec![wifi("backup", 1)];
        let mut engine = Recovery::new(p.clone(), config, Snapshot::default());
        engine.run(Trigger::Retry, |_| {}).await.unwrap();
        assert!(p.connections.lock().unwrap().is_empty());
        assert_eq!(engine.state.phase, "cancelled");
    }
    #[tokio::test]
    async fn login_from_previous_bssid_cannot_authenticate_same_ssid() {
        let p = fake();
        *p.network.lock().unwrap() = Network {
            enabled: true,
            ssid: Some("campus".into()),
            bssid: Some("00:00:00:00:00:01".into()),
            ipv4: Some("127.0.0.1".into()),
            ..Network::default()
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let changed = p.clone();
        let server = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = [0; 4096];
                let count = stream.read(&mut bytes).await.unwrap();
                let login = String::from_utf8_lossy(&bytes[..count]).contains("/portal/login");
                let body = if login {
                    changed.network.lock().unwrap().bssid = Some("00:00:00:00:00:02".into());
                    "cb({\"status\":1})"
                } else {
                    ""
                };
                stream.write_all(format!("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        let mut config = Config::default();
        config.accounts = vec![Account {
            id: "account".into(),
            username: "fixture".into(),
            password: "fixture".into(),
            server_url: url.clone(),
            ..Account::default()
        }];
        config.current_account_id = Some("account".into());
        config.wifi_rules = vec![WifiRule {
            requires_auth: true,
            ..wifi("campus", 1)
        }];
        let mut engine = Recovery::new(p, config, Snapshot::default());
        engine.probes = vec![url];
        engine.run(Trigger::Login, |_| {}).await.unwrap();
        assert_eq!(engine.state.phase, "network-changed");
        assert!(!engine.state.authenticated);
        assert!(!engine.state.internet_reachable);
        assert!(engine.session.is_none());
        server.abort();
    }
    #[tokio::test]
    async fn multiple_accounts_keep_link_order_and_confirm_portal_success() {
        let p = fake();
        *p.network.lock().unwrap() = Network {
            enabled: true,
            ssid: Some("campus".into()),
            ipv4: Some("127.0.0.1".into()),
            ..Network::default()
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let attempts = Arc::new(Mutex::new(vec![]));
        let received = attempts.clone();
        let server = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = [0; 4096];
                let size = stream.read(&mut bytes).await.unwrap();
                let request = String::from_utf8_lossy(&bytes[..size]);
                let body = if request.contains("/portal/login") {
                    let ok = request.contains("second");
                    received
                        .lock()
                        .unwrap()
                        .push(if ok { "second" } else { "first" });
                    if ok {
                        "cb({\"status\":1})"
                    } else {
                        "cb({\"status\":0})"
                    }
                } else {
                    ""
                };
                let _=stream.write_all(format!("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len()).as_bytes()).await;
            }
        });
        let mut config = Config::default();
        config.settings.heartbeat_failure_threshold = 1;
        config.accounts = ["first", "second"]
            .into_iter()
            .map(|id| Account {
                id: id.into(),
                username: id.into(),
                server_url: url.clone(),
                ..Account::default()
            })
            .collect();
        config.wifi_rules = vec![WifiRule {
            requires_auth: true,
            linked_account_ids: vec!["first".into(), "second".into()],
            ..wifi("campus", 1)
        }];
        let mut engine = Recovery::new(p, config, Snapshot::default());
        engine.probes = vec![url];
        engine.run(Trigger::Login, |_| {}).await.unwrap();
        assert_eq!(*attempts.lock().unwrap(), vec!["first", "second"]);
        assert!(engine.state.authenticated);
        assert!(!engine.state.internet_reachable);
        assert_ne!(engine.state.phase, "online");
        assert_eq!(
            engine.state.failures[0].reason,
            "门户已认证，但互联网不可达"
        );
        server.abort();
    }
}
