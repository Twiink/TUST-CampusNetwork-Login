use crate::model::Config;
use anyhow::{Context, Result, bail};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
pub trait Secrets: Send + Sync {
    fn get(&self, key: &str) -> Result<String>;
    fn set(&self, key: &str, value: &str) -> Result<()>;
    fn delete(&self, key: &str) -> Result<()>;
}
pub struct SystemSecrets;
impl Secrets for SystemSecrets {
    fn get(&self, k: &str) -> Result<String> {
        keyring::Entry::new("com.netmate.native", k)?
            .get_password()
            .map_err(|_| anyhow::anyhow!("系统凭据无法读取，请解锁钥匙串"))
    }
    fn set(&self, k: &str, v: &str) -> Result<()> {
        keyring::Entry::new("com.netmate.native", k)?
            .set_password(v)
            .map_err(|_| anyhow::anyhow!("系统凭据无法保存，请解锁钥匙串"))
    }
    fn delete(&self, k: &str) -> Result<()> {
        let _ = keyring::Entry::new("com.netmate.native", k)?.delete_credential();
        Ok(())
    }
}
pub struct Store {
    path: PathBuf,
    secrets: Box<dyn Secrets>,
}
impl Store {
    pub fn new(directory: &Path, secrets: Box<dyn Secrets>) -> Result<Self> {
        private_dir(directory)?;
        Ok(Self {
            path: directory.join("config-v1.json"),
            secrets,
        })
    }
    pub fn load(&self) -> Result<Config> {
        if !self.path.exists() {
            return Ok(Config::default());
        }
        let mut config: Config = serde_json::from_slice(&std::fs::read(&self.path)?)
            .context("配置损坏，原文件已保留")?;
        for a in &mut config.accounts {
            a.password = self.resolve(&a.password)?;
        }
        for w in &mut config.wifi_rules {
            w.password = self.resolve(&w.password)?;
        }
        config.validate()?;
        Ok(config)
    }
    fn resolve(&self, key: &str) -> Result<String> {
        if key.is_empty() {
            Ok(String::new())
        } else if let Some(k) = key.strip_prefix("keyring:") {
            self.secrets.get(k)
        } else {
            bail!("配置含非凭据引用的密码")
        }
    }
    pub fn save(&self, config: &Config) -> Result<()> {
        config.validate()?;
        let old = self
            .path
            .exists()
            .then(|| std::fs::read(&self.path))
            .transpose()?;
        let mut disk = config.clone();
        let mut added = vec![];
        let prepare = (|| -> Result<()> {
            for (kind, id, pw) in disk
                .accounts
                .iter_mut()
                .map(|a| ("account", a.id.as_str(), &mut a.password))
                .chain(
                    disk.wifi_rules
                        .iter_mut()
                        .map(|w| ("wifi", w.id.as_str(), &mut w.password)),
                )
            {
                if !pw.is_empty() {
                    let key = format!("{kind}:{id}:{}", config.revision);
                    self.secrets.set(&key, pw)?;
                    added.push(key.clone());
                    *pw = format!("keyring:{key}");
                }
            }
            atomic_write(&self.path, &serde_json::to_vec(&disk)?)?;
            Ok(())
        })();
        if let Err(error) = prepare {
            for key in added {
                let _ = self.secrets.delete(&key);
            }
            return Err(error);
        }
        if let Some(old) = old.and_then(|b| serde_json::from_slice::<Config>(&b).ok()) {
            for key in old
                .accounts
                .iter()
                .map(|a| &a.password)
                .chain(old.wifi_rules.iter().map(|w| &w.password))
            {
                if let Some(k) = key.strip_prefix("keyring:")
                    && !added.iter().any(|a| a == k)
                {
                    let _ = self.secrets.delete(k);
                }
            }
        }
        Ok(())
    }
}
pub fn data_dir() -> Result<PathBuf> {
    if let Some(value) = std::env::var_os("NETMATE_DATA_DIR") {
        return Ok(PathBuf::from(value));
    }
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("NetMateNative"));
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|p| p.join("Library/Application Support/NetMateNative"));
    #[cfg(target_os = "linux")]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/share")))
        .map(|p| p.join("netmate-native"));
    base.ok_or_else(|| anyhow::anyhow!("无法确定用户数据目录"))
}
pub fn private_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let temp = path.with_extension("tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    // Rust uses a replacement rename on supported Windows and Unix filesystems.
    // Keep the old path visible until the new file is committed in one operation.
    std::fs::rename(&temp, path)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashMap, sync::Mutex};
    struct Memory(Mutex<HashMap<String, String>>);
    impl Secrets for Memory {
        fn get(&self, k: &str) -> Result<String> {
            self.0
                .lock()
                .unwrap()
                .get(k)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("missing"))
        }
        fn set(&self, k: &str, v: &str) -> Result<()> {
            self.0.lock().unwrap().insert(k.into(), v.into());
            Ok(())
        }
        fn delete(&self, k: &str) -> Result<()> {
            self.0.lock().unwrap().remove(k);
            Ok(())
        }
    }
    #[test]
    fn secrets_never_enter_public_or_disk_config() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path(), Box::new(Memory(Mutex::default()))).unwrap();
        let mut c = Config::default();
        c.accounts.push(crate::model::Account {
            id: "a".into(),
            username: "test".into(),
            password: "sensitive".into(),
            ..Default::default()
        });
        s.save(&c).unwrap();
        assert!(
            !std::fs::read_to_string(&s.path)
                .unwrap()
                .contains("sensitive")
        );
        assert!(!c.public().to_string().contains("sensitive"));
        assert_eq!(s.load().unwrap().accounts[0].password, "sensitive");
        let mut edit = c.public();
        edit["accounts"][0]["name"] = "renamed".into();
        assert_eq!(c.edit(edit).unwrap().accounts[0].password, "sensitive");
    }
}
