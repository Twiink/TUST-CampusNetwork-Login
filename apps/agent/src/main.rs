#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod integration;
mod logging;
mod platform;
mod tray;
#[cfg(target_os = "windows")]
mod win_tray;
use anyhow::Result;
use netmate_core::{
    ipc,
    journal::Journal,
    model::*,
    protocol::*,
    recovery::{Recovery, Trigger, Wifi},
    store::{Store, SystemSecrets, data_dir},
};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{Semaphore, mpsc, oneshot, watch};
struct Call {
    command: Command,
    reply: oneshot::Sender<Result<Value>>,
}
type Job = tokio::task::JoinHandle<(Recovery<platform::Platform>, Result<()>)>;
fn main() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(2)
        .build()
        .expect("runtime");
    if let Err(error) = runtime.block_on(run()) {
        eprintln!(
            "NetMate: {}",
            netmate_core::journal::redact(&error.to_string())
        );
        std::process::exit(1)
    }
}
async fn run() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).is_some_and(|value| value == "--version") {
        println!(
            "NetMate {}{}",
            env!("CARGO_PKG_VERSION"),
            if cfg!(feature = "test-driver") {
                " [controlled OS adapter]"
            } else {
                ""
            }
        );
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    if args.get(1).is_some_and(|s| s == "--apply-update") {
        return integration::apply_update(&args);
    }
    if args
        .get(1)
        .is_some_and(|a| a == "--request" || a == "--status")
    {
        let command = if args[1] == "--status" {
            Command::Snapshot
        } else {
            serde_json::from_str(
                args.get(2)
                    .ok_or_else(|| anyhow::anyhow!("missing command"))?,
            )?
        };
        println!("{}", ipc::request(command).await?);
        return Ok(());
    }
    if ipc::request(if args.iter().any(|a| a == "--background") {
        Command::Snapshot
    } else {
        Command::OpenUi
    })
    .await
    .is_ok()
    {
        return Ok(());
    }
    let listener = ipc::Listener::bind()?;
    let directory = data_dir()?;
    let store = Arc::new(Store::new(&directory, Box::new(SystemSecrets))?);
    let mut config = store.load()?;
    let platform = Arc::new(platform::Platform::new().await?);
    let journal = Arc::new(Mutex::new(Journal::open(&directory.join("logs-v1.db"))?));
    journal
        .lock()
        .unwrap()
        .append("info", "agent", "NetMate 原生后台启动", Value::Null)?;
    let (calls, mut requests) = mpsc::channel::<Call>(16);
    let (state, receiver) = watch::channel(Snapshot::default());
    let logs = logging::Sink::new(journal.clone(), state.clone());
    let mut last_notice_state = Snapshot::default();
    let mut notice_id = 0;
    let (events, mut changes) = mpsc::channel::<()>(1);
    let event_task = {
        let platform = platform.clone();
        let events = events.clone();
        let state = state.clone();
        tokio::spawn(async move {
            loop {
                if platform.watch(events.clone()).await.is_err() {
                    state.send_modify(|s| {
                        s.monitor_degraded = true;
                        s.sequence += 1;
                    });
                    let _ = events.try_send(());
                }
                tokio::time::sleep(Duration::from_secs(15)).await;
                let _ = events.try_send(());
            }
        })
    };
    let server = {
        let calls = calls.clone();
        let receiver = receiver.clone();
        tokio::spawn(async move {
            let permits = Arc::new(Semaphore::new(8));
            loop {
                let permit = permits.clone().acquire_owned().await.unwrap();
                let mut stream = match listener.accept().await {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                let calls = calls.clone();
                let mut state = receiver.clone();
                tokio::spawn(async move {
                    let _permit = permit;
                    let action = async {
                        let request: Request = tokio::time::timeout(
                            Duration::from_secs(10),
                            ipc::read_frame(&mut stream),
                        )
                        .await??;
                        if request.version != VERSION {
                            ipc::write_frame(
                                &mut stream,
                                &Response::from_result(
                                    request.id,
                                    Err(anyhow::anyhow!("协议版本不一致")),
                                ),
                            )
                            .await?;
                            return Ok::<(), anyhow::Error>(());
                        }
                        if matches!(request.command, Command::Subscribe) {
                            let initial = serde_json::to_value(state.borrow_and_update().clone())?;
                            ipc::write_frame(
                                &mut stream,
                                &Response::from_result(request.id, Ok(initial)),
                            )
                            .await?;
                            loop {
                                use tokio::io::AsyncReadExt;
                                tokio::select! {_=stream.read_u8()=>break,changed=state.changed()=>{if changed.is_err(){break}let snapshot=serde_json::to_value(state.borrow_and_update().clone())?;tokio::time::timeout(Duration::from_secs(5),ipc::write_frame(&mut stream,&Response::from_result(request.id,Ok(snapshot)))).await??;}}
                            }
                        } else {
                            let (tx, rx) = oneshot::channel();
                            calls
                                .send(Call {
                                    command: request.command,
                                    reply: tx,
                                })
                                .await?;
                            let response = rx.await?;
                            ipc::write_frame(
                                &mut stream,
                                &Response::from_result(request.id, response),
                            )
                            .await?;
                        }
                        Ok(())
                    };
                    let _: Result<()> = action.await;
                });
            }
        })
    };
    let tray_task = tray::start(calls.clone(), receiver.clone());
    let mut ui: Option<tokio::process::Child> = None;
    if !args.iter().any(|a| a == "--background") {
        ui = Some(integration::open_ui()?);
    }
    platform.autostart(config.settings.auto_launch)?;
    let mut session = None;
    let portals = Arc::new(netmate_core::auth::PortalPool::default());
    let mut offline_streak = 0;
    let mut job: Option<Job> = None;
    let mut next_check = tokio::time::Instant::now();
    let mut started = false;
    let mut network_dirty = false;
    let mut suspended = false;
    let mut update_at = tokio::time::Instant::now() + Duration::from_secs(30);
    let available = Arc::new(Mutex::new(None::<netmate_core::update::Release>));
    let mut operations = tokio::task::JoinSet::new();
    let scan_gate = Arc::new(Semaphore::new(1));
    let update_gate = Arc::new(Semaphore::new(1));
    let journal_gate = Arc::new(Semaphore::new(1));
    let progress = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let mut update_error: Option<String> = None;
    let mut download: Option<tokio::task::JoinHandle<Result<()>>> = None;
    let mut update_file = directory.join(if cfg!(windows) {
        "update.exe"
    } else if cfg!(target_os = "macos") {
        "update.zip"
    } else {
        "update.pkg"
    });
    loop {
        tokio::select! {
             _=operations.join_next(),if !operations.is_empty()=>{},
             _=tokio::signal::ctrl_c()=>break,
             result=async{match &mut job{Some(handle)=>Some(handle.await),None=>std::future::pending().await}}=>{
              job=None;
              if network_dirty{network_dirty=false;next_check=tokio::time::Instant::now()+Duration::from_millis(200);}
              if let Some(Ok((engine,result)))=result{session=engine.session;offline_streak=engine.offline_streak;let mut final_state=engine.state;if let Err(error)=result{final_state.phase="failed".into();final_state.message=netmate_core::journal::redact(&error.to_string());}
               if final_state.phase=="network-changed"{next_check=tokio::time::Instant::now()+Duration::from_millis(200);}
               if let Some(deadline)=final_state.next_retry_at{next_check=next_check.min(tokio::time::Instant::now()+Duration::from_millis(deadline.saturating_sub(now())));}
               let settings=&config.settings;
               let flags = &settings.notification_settings;
               let same = last_notice_state.network.key() == final_state.network.key();
               let notice = if final_state.phase=="online" && (!same || !last_notice_state.internet_reachable) && (if same && final_state.authenticated {flags.auth_recovered}else{flags.reconnect_success}) {Some("网络已恢复")}
                else if matches!(final_state.phase.as_str(), "failed"|"cooldown") && last_notice_state.phase!=final_state.phase && flags.reconnect_failed {Some("网络恢复失败")}
                else if last_notice_state.network.connected() && !final_state.network.connected() && flags.wifi_disconnected {Some("WiFi 已断开")}
                else {None};
               final_state.notification=state.borrow().notification.clone();
               if let Some(title)=notice {notice_id+=1;platform.notify(title,&final_state.message).await;final_state.notification=Some(Notification{id:notice_id,title:title.into(),message:final_state.message.clone()});}
               last_notice_state=final_state.clone();
               final_state.log_revision=state.borrow().log_revision;
               final_state.monitor_degraded=state.borrow().monitor_degraded;final_state.next_heartbeat_at=state.borrow().next_heartbeat_at;final_state.sequence=state.borrow().sequence+1;state.send_replace(final_state);
              }
             },
             Some(_)=changes.recv()=>{
        #[cfg(target_os="linux")] {suspended=platform.suspended();}
        if suspended{if let Some(task)=job.take(){task.abort();}next_check=tokio::time::Instant::now()+Duration::from_secs(86400);state.send_modify(|s|{s.phase="suspended".into();s.sequence+=1;});continue;}
        if job.is_some() && !matches!(state.borrow().phase.as_str(),"connecting"|"awaiting-address")
            && let Ok(actual)=platform.snapshot().await && actual.key()!=state.borrow().network.key() {
                if let Some(task)=job.take(){task.abort();}
                session=None;offline_streak=0;
                state.send_modify(|s|{s.network=actual;s.authenticated=false;s.internet_reachable=false;s.phase="network-changed".into();s.next_retry_at=None;s.sequence+=1;});
        }
        if job.is_none(){next_check=tokio::time::Instant::now()+Duration::from_millis(200)}else{network_dirty=true;}},
             _=tokio::time::sleep_until(next_check)=>{
              let snapshot=state.borrow().clone();let retry=snapshot.next_retry_at.is_some_and(|t|now()>=t);
              if job.is_none(){let trigger=if !started{Trigger::Startup}else if retry{Trigger::Retry}else{Trigger::Check};job=Some(start_job(platform.clone(),config.clone(),snapshot,(session.clone(),offline_streak,portals.clone()),trigger,state.clone(),logs.clone()));started=true;}
              let heartbeat=if config.settings.enable_heartbeat{config.settings.heartbeat_interval_seconds}else{86400};
              let fallback=if state.borrow().monitor_degraded{if ui.as_mut().is_some_and(|child|child.try_wait().ok().flatten().is_none()){2}else{15}}else{86400};
              let interval=heartbeat.min(fallback);
              next_check=tokio::time::Instant::now()+Duration::from_secs(interval);state.send_modify(|s|{s.next_heartbeat_at=if config.settings.enable_heartbeat{Some(now()+interval*1000)}else{None};});
             },
             _=tokio::time::sleep_until(update_at)=>{
              update_at=tokio::time::Instant::now()+Duration::from_secs(86400);
              if config.settings.auto_update{let available=available.clone();operations.spawn(async move{if let Ok(release)=netmate_core::update::check().await{*available.lock().unwrap()=release;}});}
             },
             Some(call)=requests.recv()=>{
              if matches!(call.command,Command::Scan){
               if let Ok(permit)=scan_gate.clone().try_acquire_owned(){let platform=platform.clone();operations.spawn(async move{let _permit=permit;let result=platform.scan().await.and_then(|v|serde_json::to_value(v).map_err(Into::into));let _=call.reply.send(result);});}else{let _=call.reply.send(Err(anyhow::anyhow!("WiFi 正在扫描")));}continue;
              }
              if matches!(call.command,Command::UpdateCheck){
               if let Ok(permit)=update_gate.clone().try_acquire_owned(){let available=available.clone();operations.spawn(async move{let _permit=permit;let result=netmate_core::update::check().await.map(|release|{*available.lock().unwrap()=release.clone();json!(release)});let _=call.reply.send(result);});}else{let _=call.reply.send(Err(anyhow::anyhow!("正在检查更新")));}continue;
              }
              if matches!(call.command,Command::Logs(_)|Command::ClearLogs|Command::ExportLogs{..}) {
               if let Ok(permit)=journal_gate.clone().try_acquire_owned(){let journal=journal.clone();let directory=directory.clone();let state=state.clone();operations.spawn(async move{let _permit=permit;let result=tokio::task::spawn_blocking(move||journal_request(call.command,&journal,&directory,&state)).await.unwrap_or_else(|error|Err(error.into()));let _=call.reply.send(result);});}
               else {let _=call.reply.send(Err(anyhow::anyhow!("日志操作进行中，请稍后重试")));}
               continue;
              }
              let quitting=matches!(call.command,Command::Quit)||(!cfg!(target_os="linux")&&matches!(call.command,Command::UpdateInstall));
              let result:Result<Value>=async{match call.command {
               Command::UiReady{pid}=>{if std::env::var_os("NETMATE_PERF_READY").is_some(){netmate_core::store::atomic_write(&directory.join("ui-ready"),pid.to_string().as_bytes())?;}Ok(json!(true))},
           Command::Snapshot|Command::Subscribe=>Ok(serde_json::to_value(state.borrow().clone())?),
               Command::Config=>Ok(config.public()),
               Command::SaveConfig(value)=>{
                let next=config.edit(value)?;let copy=next.clone();let store=store.clone();tokio::task::spawn_blocking(move||store.save(&copy)).await??;
                platform.autostart(next.settings.auto_launch)?;if next.settings.auto_update!=config.settings.auto_update{update_at=tokio::time::Instant::now()+Duration::from_secs(if next.settings.auto_update{30}else{86400});}config=next;
                if let Some(task)=job.take(){task.abort();}next_check=tokio::time::Instant::now();state.send_modify(|s|{s.revision=config.revision;s.paused=config.settings.auto_auth_paused;s.next_retry_at=None;});Ok(config.public())
               },
               Command::Scan=>Ok(serde_json::to_value(platform.scan().await?)?),
               Command::Login|Command::Retry|Command::Connect{..}=>{
                if let Some(task)=job.take(){task.abort();}
                let trigger=match call.command {Command::Login=>{config.settings.auto_auth_paused=false;config.revision+=1;let copy=config.clone();let store=store.clone();tokio::task::spawn_blocking(move||store.save(&copy)).await??;Trigger::Login},Command::Connect{id}=>Trigger::Connect(id),_=>Trigger::Retry};
                job=Some(start_job(platform.clone(),config.clone(),state.borrow().clone(),(session.clone(),offline_streak,portals.clone()),trigger,state.clone(),logs.clone()));Ok(json!(true))
               },
               Command::StopRecovery=>{if let Some(task)=job.take(){task.abort();}state.send_modify(|s|{s.phase="cancelled".into();s.message="自动恢复已停止".into();s.next_retry_at=None;s.sequence+=1;});Ok(json!(true))},
               Command::Logout=>{
                if let Some(task)=job.take(){task.abort();}config.settings.auto_auth_paused=true;config.revision+=1;let copy=config.clone();let store=store.clone();tokio::task::spawn_blocking(move||store.save(&copy)).await??;
                state.send_modify(|s|{s.paused=true;s.next_retry_at=None;s.phase="paused".into();s.sequence+=1;});
                let network=platform.snapshot().await?;let server=session.as_ref().filter(|s|s.0==network.key()).map(|s|s.1.clone()).or_else(||config.current_account_id.as_ref().and_then(|id|config.accounts.iter().find(|a|&a.id==id)).map(|a|a.server_url.clone())).ok_or_else(||anyhow::anyhow!("无法确定当前认证服务器"))?;
                portals.for_network(&network)?.logout(&server).await?;session=None;state.send_modify(|s|{s.authenticated=false;s.internet_reachable=false;s.message="已注销，自动认证已暂停".into();s.sequence+=1;});Ok(json!(true))
               },
               Command::Logs(_)|Command::ClearLogs|Command::ExportLogs{..}=>unreachable!(),
               Command::UpdateCheck=>unreachable!(),
               Command::UpdateStatus=>{if download.as_ref().is_some_and(|task|task.is_finished())&& let Some(task)=download.take(){match task.await{Ok(Ok(()))=>{},Ok(Err(error))=>update_error=Some(error.to_string()),Err(_)=>update_error=Some("下载已取消".into())}}Ok(json!({"state":if update_error.is_some(){"failed"}else if download.is_some(){"downloading"}else if update_file.exists(){"downloaded"}else{"idle"},"received":progress.load(std::sync::atomic::Ordering::Relaxed),"total":available.lock().unwrap().as_ref().map(|r|r.length),"error":update_error}))},
               Command::UpdateDownload=>{if download.as_ref().is_some_and(|j|!j.is_finished()){anyhow::bail!("正在下载")};let release=available.lock().unwrap().clone().ok_or_else(||anyhow::anyhow!("请先检查更新"))?;let extension=if cfg!(target_os="linux"){if release.url.split('?').next().unwrap_or("").ends_with(".rpm"){"rpm"}else{"deb"}}else if cfg!(windows){"exe"}else{"zip"};update_file=directory.join(format!("update.{extension}"));let path=update_file.clone();let progress=progress.clone();progress.store(0,std::sync::atomic::Ordering::Relaxed);update_error=None;download=Some(tokio::spawn(async move{release.download(&path,|n|{progress.store(n,std::sync::atomic::Ordering::Relaxed);}).await}));Ok(json!({"state":"downloading"}))},
               Command::UpdateCancel=>{if let Some(task)=download.take(){task.abort();}let _=std::fs::remove_file(update_file.with_extension("partial"));Ok(json!(true))},
               Command::UpdateInstall=>{let release=available.lock().unwrap().clone().ok_or_else(||anyhow::anyhow!("请先检查更新"))?;release.verify_file(&update_file)?;integration::install(&update_file,&release)?;Ok(json!(true))},
               Command::OpenUi=>{if ui.as_mut().is_none_or(|child|child.try_wait().ok().flatten().is_some()){ui=Some(integration::open_ui()?);}else{let mut activation=integration::open_ui()?;operations.spawn(async move{let _=activation.wait().await;});}Ok(json!(true))},
               Command::SystemSuspend(value)=>{suspended=value;if let Some(task)=job.take(){task.abort();}next_check=tokio::time::Instant::now()+Duration::from_secs(if value{86400}else{0});state.send_modify(|s|{s.phase=if value{"suspended"}else{"checking"}.into();s.sequence+=1;});Ok(json!(true))},
               Command::NetworkChanged=>{let _=events.try_send(());Ok(json!(true))},
               Command::MonitorDegraded=>{state.send_modify(|s|{s.monitor_degraded=true;s.sequence+=1;});next_check=tokio::time::Instant::now();Ok(json!(true))},
               Command::Quit=>Ok(json!(true)),
              }}.await;let success=result.is_ok();let _=call.reply.send(result);if quitting&&success{state.send_modify(|s|{s.phase="exiting".into();s.sequence+=1;});tokio::time::sleep(Duration::from_millis(100)).await;break;}
             }
            }
    }
    if let Some(task) = job {
        task.abort();
    }
    if let Some(task) = download {
        task.abort();
    }
    if let Some(mut child) = ui {
        let _ = child.kill().await;
    }
    operations.abort_all();
    server.abort();
    event_task.abort();
    tray_task.abort();
    Ok(())
}
fn start_job(
    platform: Arc<platform::Platform>,
    config: Config,
    snapshot: Snapshot,
    memory: (
        Option<(String, String)>,
        u32,
        Arc<netmate_core::auth::PortalPool>,
    ),
    trigger: Trigger,
    state: watch::Sender<Snapshot>,
    logs: logging::Sink,
) -> Job {
    tokio::spawn(async move {
        let mut engine = Recovery::new(platform, config, snapshot);
        engine.session = memory.0;
        engine.offline_streak = memory.1;
        engine.portals = memory.2;
        let last_phase = std::sync::Mutex::new(String::new());
        let result = engine
            .run(trigger, |snapshot| {
                if *last_phase.lock().unwrap() != snapshot.phase {
                    logs.write(
                        if snapshot.phase == "failed" {
                            "warn"
                        } else {
                            "info"
                        },
                        &format!("{} · {}", snapshot.phase, snapshot.message),
                    );
                    *last_phase.lock().unwrap() = snapshot.phase.clone();
                }
                let mut snapshot = snapshot.clone();
                snapshot.log_revision = state.borrow().log_revision;
                snapshot.notification = state.borrow().notification.clone();
                snapshot.next_heartbeat_at = state.borrow().next_heartbeat_at;
                snapshot.monitor_degraded = state.borrow().monitor_degraded;
                snapshot.sequence = state.borrow().sequence + 1;
                state.send_replace(snapshot);
            })
            .await;
        (engine, result)
    })
}

fn journal_request(
    command: Command,
    journal: &Mutex<Journal>,
    directory: &std::path::Path,
    state: &watch::Sender<Snapshot>,
) -> Result<Value> {
    let mut journal = journal.lock().unwrap();
    match command {
        Command::Logs(query) => journal.query(&query),
        Command::ClearLogs => {
            let generation = journal.clear()?;
            state.send_modify(|s| {
                s.log_revision += 1;
                s.sequence += 1;
            });
            Ok(json!(generation))
        }
        Command::ExportLogs { query, format } => {
            let export = directory.join("exports");
            std::fs::create_dir_all(&export)?;
            for entry in std::fs::read_dir(&export)? {
                let path = entry?.path();
                if path.is_file() {
                    std::fs::remove_file(path)?;
                }
            }
            let path = export.join(format!(
                "netmate-logs-{}.{}",
                now(),
                if format == "json" { "json" } else { "txt" }
            ));
            let mut options = std::fs::OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let file = options.open(&path)?;
            if let Err(error) = journal.export(&query, std::io::BufWriter::new(file), &format) {
                let _ = std::fs::remove_file(&path);
                return Err(error);
            }
            Ok(json!({"path":path}))
        }
        _ => unreachable!(),
    }
}
