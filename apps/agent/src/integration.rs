use anyhow::Result;
use netmate_core::update::Release;
use std::{path::Path, process::Stdio};
pub fn open_ui() -> Result<tokio::process::Child> {
    let exe = std::env::current_exe()?;
    let ui = exe.with_file_name(if cfg!(windows) {
        "netmate-ui.exe"
    } else {
        "netmate-ui"
    });
    Ok(tokio::process::Command::new(ui)
        .stdin(Stdio::null())
        .spawn()?)
}
pub fn install(path: &Path, release: &Release) -> Result<()> {
    let _ = release;
    #[cfg(target_os = "linux")]
    {
        let manager = if path.extension().is_some_and(|s| s == "rpm") {
            "/usr/bin/dnf"
        } else {
            "/usr/bin/apt-get"
        };
        std::process::Command::new("pkexec")
            .args([manager, "install", "-y"])
            .arg(path)
            .spawn()?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(path).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        let manifest = path.with_extension("release.json");
        netmate_core::store::atomic_write(&manifest, &serde_json::to_vec(release)?)?;
        std::process::Command::new(std::env::current_exe()?)
            .arg("--apply-update")
            .arg(path)
            .arg(manifest)
            .arg(std::process::id().to_string())
            .spawn()?;
    }
    Ok(())
}
#[cfg(target_os = "macos")]
pub fn apply_update(args: &[String]) -> Result<()> {
    let archive = std::path::PathBuf::from(
        args.get(2)
            .ok_or_else(|| anyhow::anyhow!("missing archive"))?,
    );
    let manifest = args
        .get(3)
        .ok_or_else(|| anyhow::anyhow!("missing release metadata"))?;
    let parent: u32 = args
        .get(4)
        .ok_or_else(|| anyhow::anyhow!("missing parent"))?
        .parse()?;
    let release: Release = serde_json::from_slice(&std::fs::read(manifest)?)?;
    release.verify(
        option_env!("NETMATE_UPDATE_PUBLIC_KEY")
            .ok_or_else(|| anyhow::anyhow!("更新公钥未配置"))?,
    )?;
    release.verify_file(&archive)?;
    let current = std::env::current_exe()?;
    let target = current
        .ancestors()
        .nth(3)
        .filter(|p| p.extension().is_some_and(|e| e == "app"))
        .ok_or_else(|| anyhow::anyhow!("更新仅支持已安装应用包"))?
        .to_path_buf();
    let stage = target.with_file_name(format!(".netmate-update-{}", std::process::id()));
    std::fs::create_dir(&stage)?;
    let extracted = stage.join("NetMate.app");
    let extract = std::process::Command::new("/usr/bin/ditto")
        .args(["-x", "-k"])
        .arg(&archive)
        .arg(&stage)
        .status()?;
    if !extract.success() {
        anyhow::bail!("更新包解压失败")
    }
    if !std::process::Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(&extracted)
        .status()?
        .success()
    {
        anyhow::bail!("macOS 应用签名无效")
    }
    let info = std::process::Command::new("/usr/bin/plutil")
        .args(["-extract", "CFBundleIdentifier", "raw", "-o", "-"])
        .arg(extracted.join("Contents/Info.plist"))
        .output()?;
    if !info.status.success()
        || String::from_utf8_lossy(&info.stdout).trim() != "com.netmate.native"
    {
        anyhow::bail!("更新应用标识不匹配")
    }
    for _ in 0..100 {
        if unsafe { libc::kill(parent as i32, 0) } != 0 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    if unsafe { libc::kill(parent as i32, 0) } == 0 {
        anyhow::bail!("请先退出正在运行的 NetMate")
    }
    let backup = target.with_file_name(".NetMate.previous.app");
    if backup.exists() {
        std::fs::remove_dir_all(&backup)?;
    }
    std::fs::rename(&target, &backup)
        .map_err(|_| anyhow::anyhow!("应用目录不可写，请通过 Finder 将新版应用放入安装目录"))?;
    if let Err(error) = std::fs::rename(&extracted, &target) {
        let _ = std::fs::rename(&backup, &target);
        return Err(error.into());
    }
    std::process::Command::new("/usr/bin/open")
        .arg(&target)
        .spawn()?;
    let _ = std::fs::remove_dir_all(&stage);
    let _ = std::fs::remove_file(archive);
    Ok(())
}
