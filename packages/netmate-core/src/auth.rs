use crate::model::{Account, Network};
use anyhow::{Result, bail};
use futures_util::{StreamExt, stream::FuturesUnordered};
use std::{sync::Mutex, time::Duration};
pub const PROBES: [&str; 3] = [
    "http://connectivitycheck.platform.hicloud.com/generate_204",
    "http://connect.rom.miui.com/generate_204",
    "http://www.google.cn/generate_204",
];
#[derive(Clone)]
pub struct Portal {
    client: reqwest::Client,
}
/// One source-bound pool for the current network. Changing identity drops idle sockets.
#[derive(Default)]
pub struct PortalPool(Mutex<Option<(String, Portal)>>);
impl PortalPool {
    pub fn for_network(&self, network: &Network) -> Result<Portal> {
        let key = network.key();
        let mut cached = self.0.lock().unwrap();
        if let Some((identity, client)) = cached.as_ref()
            && *identity == key
        {
            return Ok(client.clone());
        }
        let client = Portal::new(network.ipv4.as_deref().and_then(|s| s.parse().ok()))?;
        *cached = Some((key, client.clone()));
        Ok(client)
    }
}
impl Portal {
    pub fn new(ip: Option<std::net::IpAddr>) -> Result<Self> {
        let mut builder = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(1)
            .user_agent("NetMate/2.0");
        if let Some(ip) = ip {
            builder = builder.local_address(ip)
        }
        Ok(Self {
            client: builder.build()?,
        })
    }
    pub async fn online(&self, urls: &[String]) -> bool {
        let mut pending = FuturesUnordered::new();
        for url in urls {
            let request = self.client.get(url).timeout(Duration::from_secs(3));
            pending.push(async move { request.send().await.is_ok_and(|r| r.status() == 204) });
        }
        while let Some(ok) = pending.next().await {
            if ok {
                return true;
            }
        }
        false
    }
    pub async fn login(&self, account: &Account, network: &Network) -> Result<String> {
        let url = login_url(account, network)?;
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| anyhow::anyhow!("认证请求失败，请检查 WiFi"))?;
        if !response.status().is_success() {
            bail!("认证服务器返回错误")
        }
        let mut bytes = Vec::with_capacity(1024);
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| anyhow::anyhow!("认证响应读取失败"))?
        {
            if bytes.len() + chunk.len() > 8192 {
                bail!("认证响应过长")
            }
            bytes.extend_from_slice(&chunk);
        }
        parse_login(std::str::from_utf8(&bytes)?)
    }
    pub async fn logout(&self, server: &str) -> Result<()> {
        let mut response = self
            .client
            .get(format!(
                "{}/eportal/portal/logout",
                server.trim_end_matches('/')
            ))
            .send()
            .await
            .map_err(|_| anyhow::anyhow!("注销请求失败"))?;
        if !response.status().is_success() {
            bail!("注销服务器返回错误")
        }
        let mut body = Vec::new();
        while let Some(b) = response
            .chunk()
            .await
            .map_err(|_| anyhow::anyhow!("注销响应读取失败"))?
        {
            if body.len() + b.len() > 8192 {
                bail!("注销响应过长")
            }
            body.extend_from_slice(&b)
        }
        let value = jsonp(std::str::from_utf8(&body)?)?;
        if value["result"].as_i64() != Some(1) {
            bail!("注销失败，请重试")
        };
        Ok(())
    }
}
pub fn login_url(a: &Account, n: &Network) -> Result<String> {
    let suffix = match a.isp.as_str() {
        "cucc" => "@unicom",
        "cmcc" => "@cmcc",
        "ctcc" => "@telecom",
        _ => "",
    };
    let mut url = url::Url::parse(&format!(
        "{}/eportal/portal/login",
        a.server_url.trim_end_matches('/')
    ))?;
    {
        let mut q = url.query_pairs_mut();
        q.extend_pairs([
            ("callback", "dr1005"),
            ("login_method", "1"),
            ("user_account", &format!(",0,{}{suffix}", a.username)),
            ("user_password", &a.password),
            (
                "wlan_user_ip",
                n.ipv4
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("等待 WiFi 地址"))?,
            ),
            ("wlan_user_mac", "000000000000"),
            ("jsVersion", "4.1.3"),
            ("terminal_type", "3"),
            ("lang", "zh-cn"),
            ("v", "9303"),
        ]);
        if let Some(ip) = &n.ipv6 {
            q.append_pair("wlan_user_ipv6", ip);
        }
    }
    Ok(url
        .as_str()
        .replace('+', "%20")
        .replace('*', "%2A")
        .replace("%7E", "~"))
}
pub fn jsonp(body: &str) -> Result<serde_json::Value> {
    let text = body.trim();
    let payload = if text.starts_with('{') {
        text
    } else {
        let start = text
            .find('(')
            .ok_or_else(|| anyhow::anyhow!("门户响应格式无效"))?;
        let end = text
            .rfind(')')
            .filter(|e| *e > start)
            .ok_or_else(|| anyhow::anyhow!("门户响应格式无效"))?;
        &text[start + 1..end]
    };
    serde_json::from_str(payload).map_err(|_| anyhow::anyhow!("门户响应格式无效"))
}
pub fn parse_login(body: &str) -> Result<String> {
    let value = jsonp(body)?;
    let msg = value["msg"].as_str().unwrap_or("");
    if value["status"].as_i64() == Some(1) || msg.contains("已经在线") {
        Ok(if msg.contains("已经在线") {
            "账号已在线"
        } else {
            "登录成功"
        }
        .into())
    } else {
        bail!("认证失败，请核对账号、密码和运营商")
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_portal_protocol() {
        for (isp, suffix) in [
            ("campus", ""),
            ("cucc", "@unicom"),
            ("cmcc", "@cmcc"),
            ("ctcc", "@telecom"),
        ] {
            let a = Account {
                username: "test".into(),
                password: "a b+*".into(),
                isp: isp.into(),
                ..Account::default()
            };
            let s = login_url(
                &a,
                &Network {
                    ipv4: Some("10.0.0.2".into()),
                    ..Network::default()
                },
            )
            .unwrap();
            let u = url::Url::parse(&s).unwrap();
            let q: std::collections::HashMap<_, _> = u.query_pairs().collect();
            assert_eq!(q["user_account"], format!(",0,test{suffix}"));
            assert_eq!(q["user_password"], "a b+*");
            assert!(s.contains("a%20b%2B%2A"));
            assert!(!q.contains_key("wlan_ac_ip"));
        }
    }
    #[test]
    fn jsonp_is_data_not_code() {
        assert!(parse_login("dr1005({\"status\":1});").is_ok());
        assert!(parse_login("cb({\"status\":0,\"msg\":\"已经在线\"})").is_ok());
        assert!(parse_login("cb({\"status\":0})").is_err());
        assert!(parse_login("status:1").is_err());
    }
}
