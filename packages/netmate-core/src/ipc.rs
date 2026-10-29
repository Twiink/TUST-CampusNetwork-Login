use crate::{
    protocol::*,
    store::{data_dir, private_dir},
};
use anyhow::{Result, bail};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
pub async fn read_frame<T: serde::de::DeserializeOwned>(
    stream: &mut (impl AsyncRead + Unpin),
) -> Result<T> {
    let n = stream.read_u32().await? as usize;
    if n == 0 || n > MAX_FRAME {
        bail!("IPC frame size invalid")
    }
    let mut bytes = vec![0; n];
    stream.read_exact(&mut bytes).await?;
    serde_json::from_slice(&bytes).map_err(Into::into)
}
pub async fn write_frame<T: serde::Serialize>(
    stream: &mut (impl AsyncWrite + Unpin),
    value: &T,
) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() > MAX_FRAME {
        bail!("IPC response too large")
    }
    stream.write_u32(bytes.len() as u32).await?;
    stream.write_all(&bytes).await?;
    stream.flush().await?;
    Ok(())
}
#[cfg(unix)]
pub type Stream = tokio::net::UnixStream;
#[cfg(windows)]
pub type Stream = tokio::net::windows::named_pipe::NamedPipeClient;
pub fn endpoint() -> Result<String> {
    #[cfg(unix)]
    {
        Ok(data_dir()?.join("agent.sock").to_string_lossy().into())
    }
    #[cfg(windows)]
    {
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(data_dir()?.to_string_lossy().as_bytes());
        Ok(format!(r"\\.\pipe\NetMateNative-{:x}", hash)[..60].to_string())
    }
}
pub async fn connect() -> Result<Stream> {
    #[cfg(unix)]
    {
        Ok(Stream::connect(endpoint()?).await?)
    }
    #[cfg(windows)]
    {
        Ok(tokio::net::windows::named_pipe::ClientOptions::new().open(endpoint()?)?)
    }
}
pub async fn request(command: Command) -> Result<serde_json::Value> {
    let mut stream = connect().await?;
    write_frame(&mut stream, &Request::new(command)).await?;
    let response: Response = read_frame(&mut stream).await?;
    if response.version != VERSION {
        bail!("后台协议版本不一致")
    }
    if let Some(error) = response.error {
        bail!("{error}")
    }
    response
        .result
        .ok_or_else(|| anyhow::anyhow!("后台响应为空"))
}
#[cfg(unix)]
pub struct Listener {
    listener: tokio::net::UnixListener,
    _lock: std::fs::File,
    path: std::path::PathBuf,
}
#[cfg(unix)]
impl Listener {
    pub fn bind() -> Result<Self> {
        use std::os::{fd::AsRawFd, unix::fs::PermissionsExt};
        let dir = data_dir()?;
        private_dir(&dir)?;
        let lock = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.join("agent.lock"))?;
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            bail!("NetMate 后台已运行")
        }
        let path = dir.join("agent.sock");
        if path.exists() {
            std::fs::remove_file(&path)?
        }
        let listener = tokio::net::UnixListener::bind(&path)?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
        Ok(Self {
            listener,
            _lock: lock,
            path,
        })
    }
    pub async fn accept(&self) -> Result<tokio::net::UnixStream> {
        let (stream, _) = self.listener.accept().await?;
        if stream.peer_cred()?.uid() != unsafe { libc::geteuid() } {
            bail!("IPC peer is not current user")
        }
        Ok(stream)
    }
}
#[cfg(unix)]
impl Drop for Listener {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}
#[cfg(windows)]
pub struct Listener {
    next: std::sync::Mutex<Option<tokio::net::windows::named_pipe::NamedPipeServer>>,
}
#[cfg(windows)]
impl Listener {
    pub fn bind() -> Result<Self> {
        let _ = data_dir().and_then(|d| private_dir(&d));
        Ok(Self {
            next: std::sync::Mutex::new(Some(pipe(true)?)),
        })
    }
    pub async fn accept(&self) -> Result<tokio::net::windows::named_pipe::NamedPipeServer> {
        let server = self
            .next
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| anyhow::anyhow!("IPC listener unavailable"))?;
        server.connect().await?;
        *self.next.lock().unwrap() = Some(pipe(false)?);
        Ok(server)
    }
}
#[cfg(windows)]
fn pipe(first: bool) -> Result<tokio::net::windows::named_pipe::NamedPipeServer> {
    use windows::Win32::{
        Foundation::LocalFree,
        Security::{
            Authorization::{
                ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
            },
            PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES,
        },
    };
    // Owner Rights excludes Everyone/anonymous read access of the default pipe DACL.
    let sddl: Vec<u16> = "D:P(A;;GA;;;OW)(A;;GA;;;SY)\0".encode_utf16().collect();
    let mut sd = PSECURITY_DESCRIPTOR::default();
    unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            windows::core::PCWSTR(sddl.as_ptr()),
            SDDL_REVISION_1,
            &mut sd,
            None,
        )?;
        let sa = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: sd.0,
            bInheritHandle: false.into(),
        };
        let result = tokio::net::windows::named_pipe::ServerOptions::new()
            .first_pipe_instance(first)
            .reject_remote_clients(true)
            .create_with_security_attributes_raw(
                endpoint()?,
                (&sa as *const SECURITY_ATTRIBUTES).cast_mut().cast(),
            );
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(sd.0)));
        Ok(result?)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn oversized_frame_is_rejected_before_allocation() {
        let (mut a, mut b) = tokio::io::duplex(16);
        a.write_u32((MAX_FRAME + 1) as u32).await.unwrap();
        assert!(read_frame::<Request>(&mut b).await.is_err());
    }
}
