use netmate_core::{ipc, protocol::*};
use serde_json::Value;
use std::time::Duration;
pub enum Event {
    Reply(Command, Value),
    State(Value),
    /// The failed command, or `None` when the state subscription was lost.
    Error(Option<Command>, String),
}
/// The config list `field`, created empty when the config lacks it. The agent
/// validates the saved result, so an edit never aborts the UI on an odd config.
pub fn list<'a>(config: &'a mut Value, field: &str) -> &'a mut Vec<Value> {
    if !config[field].is_array() {
        config[field] = Value::Array(Vec::new());
    }
    config[field]
        .as_array_mut()
        .expect("array was just ensured")
}
/// Bounds one request so a stalled agent call cannot hold a permit forever.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
async fn request(command: Command) -> anyhow::Result<Value> {
    tokio::time::timeout(REQUEST_TIMEOUT, ipc::request(command))
        .await
        .map_err(|_| anyhow::anyhow!("后台响应超时"))?
}
/// Lets UI-side workers, such as the appearance writer, report into the event stream.
static LOCAL: std::sync::OnceLock<async_channel::Sender<Event>> = std::sync::OnceLock::new();
/// Reports a failure that belongs to no agent command; the UI shows it as feedback.
pub fn report(message: String) {
    if let Some(events) = LOCAL.get() {
        let _ = events.try_send(Event::Error(None, message));
    }
}
pub fn start() -> (
    async_channel::Sender<Command>,
    async_channel::Receiver<Event>,
) {
    let (tx, rx) = async_channel::bounded::<Command>(8);
    let (events, output) = async_channel::bounded(16);
    let _ = LOCAL.set(events.clone());
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async move {
            if ipc::connect().await.is_err() {
                if let Ok(exe) = std::env::current_exe() {
                    let agent = exe.with_file_name(if cfg!(windows) {
                        "netmate-agent.exe"
                    } else {
                        "netmate-agent"
                    });
                    let _ = std::process::Command::new(agent)
                        .arg("--background")
                        .spawn();
                }
                for _ in 0..50 {
                    if ipc::connect().await.is_ok() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
            let push = events.clone();
            let subscription = tokio::spawn(async move {
                // One message per outage; the config is re-read once the agent is back,
                // because a restarted agent may hold a newer revision.
                let mut lost = false;
                loop {
                    let result = async {
                        let mut stream = ipc::connect().await?;
                        ipc::write_frame(&mut stream, &Request::new(Command::Subscribe)).await?;
                        loop {
                            let r: Response = ipc::read_frame(&mut stream).await?;
                            if let Some(v) = r.result {
                                // Waiting keeps the newest snapshot; the agent bounds a slow reader.
                                if push.send(Event::State(v)).await.is_err() {
                                    return Ok::<(), anyhow::Error>(());
                                }
                                if lost {
                                    lost = false;
                                    if let Ok(value) = request(Command::Config).await {
                                        let _ =
                                            push.send(Event::Reply(Command::Config, value)).await;
                                    }
                                }
                            }
                        }
                    }
                    .await;
                    if let Err(error) = result
                        && !lost
                    {
                        lost = true;
                        let _ = push.send(Event::Error(None, error.to_string())).await;
                    }
                    if push.is_closed() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            });
            let gate = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
            let mut jobs = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    _ = jobs.join_next(), if !jobs.is_empty() => {},
                    command = rx.recv() => {
                        let Ok(command) = command else { break };
                        let Ok(permit) = gate.clone().try_acquire_owned() else {
                            let _ = events
                                .send(Event::Error(Some(command), "操作进行中，请稍后重试".into()))
                                .await;
                            continue;
                        };
                        let events = events.clone();
                        jobs.spawn(async move {
                            let _permit = permit;
                            let refresh = matches!(command, Command::Login | Command::Logout);
                            let event = match request(command.clone()).await {
                                Ok(value) => Event::Reply(command, value),
                                Err(error) => Event::Error(Some(command), error.to_string()),
                            };
                            let _ = events.send(event).await;
                            if refresh && let Ok(value) = request(Command::Config).await {
                                let _ = events.send(Event::Reply(Command::Config, value)).await;
                            }
                        });
                    }
                }
            }
            jobs.abort_all();
            subscription.abort();
        });
    });
    (tx, output)
}
