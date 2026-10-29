use crate::journal::LogQuery;
use serde::{Deserialize, Serialize};
use serde_json::Value;
pub const VERSION: u32 = 1;
pub const MAX_FRAME: usize = 2 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "op", content = "args", rename_all = "snake_case")]
pub enum Command {
    Snapshot,
    UiReady { pid: u32 },
    Subscribe,
    Config,
    SaveConfig(Value),
    Scan,
    Connect { id: String },
    Login,
    Logout,
    Retry,
    StopRecovery,
    Logs(LogQuery),
    ClearLogs,
    ExportLogs { query: LogQuery, format: String },
    UpdateCheck,
    UpdateStatus,
    UpdateDownload,
    UpdateCancel,
    UpdateInstall,
    OpenUi,
    NetworkChanged,
    SystemSuspend(bool),
    MonitorDegraded,
    Quit,
}
#[derive(Serialize, Deserialize)]
pub struct Request {
    pub version: u32,
    pub id: u64,
    pub command: Command,
}
impl Request {
    pub fn new(command: Command) -> Self {
        Self {
            version: VERSION,
            id: 1,
            command,
        }
    }
}
#[derive(Serialize, Deserialize)]
pub struct Response {
    pub version: u32,
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
impl Response {
    pub fn from_result(id: u64, r: anyhow::Result<Value>) -> Self {
        match r {
            Ok(v) => Self {
                version: VERSION,
                id,
                result: Some(v),
                error: None,
            },
            Err(e) => Self {
                version: VERSION,
                id,
                result: None,
                error: Some(crate::journal::redact(&e.to_string())),
            },
        }
    }
}
