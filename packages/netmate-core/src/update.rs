use anyhow::{Result, bail};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::Path,
};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub platform: String,
    pub arch: String,
    pub url: String,
    pub length: u64,
    pub sha256: String,
    pub signature: String,
}
impl Release {
    pub fn signed_message(&self) -> String {
        format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            self.version, self.platform, self.arch, self.url, self.length, self.sha256
        )
    }
    pub fn verify(&self, key: &str) -> Result<()> {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};
        let bytes = base64::engine::general_purpose::STANDARD.decode(key)?;
        let key = VerifyingKey::from_bytes(bytes.as_slice().try_into()?)?;
        let signature = base64::engine::general_purpose::STANDARD.decode(&self.signature)?;
        key.verify(
            self.signed_message().as_bytes(),
            &Signature::from_slice(&signature)?,
        )?;
        let url = url::Url::parse(&self.url)?;
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || self.length == 0
            || self.length > 128 * 1024 * 1024
            || self.sha256.len() != 64
        {
            bail!("更新元数据无效")
        }
        if self.platform != std::env::consts::OS || self.arch != std::env::consts::ARCH {
            bail!("更新平台不匹配")
        }
        Ok(())
    }
    pub fn verify_file(&self, path: &Path) -> Result<()> {
        let mut file = std::fs::File::open(path)?;
        if file.metadata()?.len() != self.length {
            bail!("更新文件长度不匹配")
        }
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 32768];
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
        }
        if format!("{:x}", hash.finalize()) != self.sha256.to_lowercase() {
            bail!("更新摘要不匹配")
        }
        Ok(())
    }
    pub async fn download(&self, path: &Path, progress: impl Fn(u64)) -> Result<()> {
        let temp = path.with_extension("partial");
        let result = async {
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::limited(5))
                .build()?;
            let mut response = client
                .get(&self.url)
                .timeout(std::time::Duration::from_secs(300))
                .send()
                .await
                .map_err(|_| anyhow::anyhow!("更新下载失败"))?
                .error_for_status()
                .map_err(|_| anyhow::anyhow!("更新服务器返回错误"))?;
            let mut file = std::fs::File::create(&temp)?;
            let mut received = 0;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| anyhow::anyhow!("更新下载中断"))?
            {
                received += chunk.len() as u64;
                if received > self.length {
                    bail!("更新文件超过声明长度")
                }
                file.write_all(&chunk)?;
                progress(received);
            }
            file.sync_all()?;
            self.verify_file(&temp)?;
            std::fs::rename(&temp, path)?;
            Ok(())
        }
        .await;
        if result.is_err() {
            let _ = std::fs::remove_file(temp);
        }
        result
    }
}
pub async fn check() -> Result<Option<Release>> {
    let endpoint = option_env!("NETMATE_UPDATE_ENDPOINT")
        .ok_or_else(|| anyhow::anyhow!("此构建尚未配置签名更新源"))?;
    let key = option_env!("NETMATE_UPDATE_PUBLIC_KEY")
        .ok_or_else(|| anyhow::anyhow!("此构建尚未配置更新公钥"))?;
    if !endpoint.starts_with("https://") {
        bail!("更新源必须使用 HTTPS")
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let mut response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|_| anyhow::anyhow!("检查更新失败"))?
        .error_for_status()
        .map_err(|_| anyhow::anyhow!("更新服务器返回错误"))?;
    let mut bytes = Vec::new();
    while let Some(b) = response
        .chunk()
        .await
        .map_err(|_| anyhow::anyhow!("更新元数据读取失败"))?
    {
        if bytes.len() + b.len() > 65536 {
            bail!("更新元数据过大")
        }
        bytes.extend_from_slice(&b)
    }
    let releases: Vec<Release> = serde_json::from_slice(&bytes)?;
    let release = releases
        .into_iter()
        .filter(|r| {
            r.platform == std::env::consts::OS
                && r.arch == std::env::consts::ARCH
                && version(&r.version) > version(env!("CARGO_PKG_VERSION"))
                && (!cfg!(target_os = "linux")
                    || r.url.split('?').next().unwrap_or("").ends_with(
                        if std::path::Path::new("/usr/bin/dpkg").exists() {
                            ".deb"
                        } else {
                            ".rpm"
                        },
                    ))
        })
        .max_by_key(|r| version(&r.version));
    if let Some(r) = &release {
        r.verify(key)?;
    }
    Ok(release)
}
fn version(v: &str) -> Option<(u32, u32, u32)> {
    let p: Vec<_> = v
        .trim_start_matches('v')
        .split('.')
        .map(str::parse::<u32>)
        .collect();
    if p.len() != 3 {
        return None;
    }
    Some((
        *p[0].as_ref().ok()?,
        *p[1].as_ref().ok()?,
        *p[2].as_ref().ok()?,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    #[test]
    fn signed_metadata_and_streamed_artifact_reject_tampering() {
        let signing = SigningKey::from_bytes(&[7; 32]);
        let public =
            base64::engine::general_purpose::STANDARD.encode(signing.verifying_key().to_bytes());
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("update");
        std::fs::write(&file, b"native artifact").unwrap();
        let mut release = Release {
            version: "2.1.0".into(),
            platform: std::env::consts::OS.into(),
            arch: std::env::consts::ARCH.into(),
            url: "https://example.com/native-package".into(),
            length: 15,
            sha256: format!("{:x}", Sha256::digest(b"native artifact")),
            signature: String::new(),
        };
        release.signature = base64::engine::general_purpose::STANDARD
            .encode(signing.sign(release.signed_message().as_bytes()).to_bytes());
        release.verify(&public).unwrap();
        release.verify_file(&file).unwrap();
        release.version = "2.2.0".into();
        assert!(release.verify(&public).is_err());
        std::fs::write(&file, b"modified bytes!").unwrap();
        assert!(release.verify_file(&file).is_err());
    }
}
