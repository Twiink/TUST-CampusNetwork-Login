use netmate_core::{ipc, protocol::*};
use serde_json::Value;
pub enum Event {
    Reply(Command, Value),
    State(Value),
    Error(String),
}
pub fn start() -> (
    async_channel::Sender<Command>,
    async_channel::Receiver<Event>,
) {
    let (tx, rx) = async_channel::bounded::<Command>(8);
    let (events, output) = async_channel::bounded(16);
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async move{
  if ipc::connect().await.is_err(){if let Ok(exe)=std::env::current_exe(){let agent=exe.with_file_name(if cfg!(windows){"netmate-agent.exe"}else{"netmate-agent"});let _=std::process::Command::new(agent).arg("--background").spawn();}for _ in 0..50{if ipc::connect().await.is_ok(){break}tokio::time::sleep(std::time::Duration::from_millis(100)).await;}}
  let push=events.clone();let subscription=tokio::spawn(async move{
    loop {
      let result=async{let mut stream=ipc::connect().await?;ipc::write_frame(&mut stream,&Request::new(Command::Subscribe)).await?;loop{let r:Response=ipc::read_frame(&mut stream).await?;if let Some(v)=r.result{let _=push.try_send(Event::State(v));}}#[allow(unreachable_code)]Ok::<(),anyhow::Error>(())}.await;
      if let Err(error)=result {let _=push.try_send(Event::Error(error.to_string()));}
      tokio::time::sleep(std::time::Duration::from_secs(1)).await;
      if push.is_closed(){break;}
    }
  });
  let gate=std::sync::Arc::new(tokio::sync::Semaphore::new(4));let mut jobs=tokio::task::JoinSet::new();
  loop{tokio::select!{
   _=jobs.join_next(),if !jobs.is_empty()=>{},
   command=rx.recv()=>{let Ok(command)=command else{break};let Ok(permit)=gate.clone().try_acquire_owned()else{let _=events.try_send(Event::Error("操作进行中，请稍后重试".into()));continue};let events=events.clone();jobs.spawn(async move{let _permit=permit;let refresh=matches!(command,Command::Login|Command::Logout);let event=match ipc::request(command.clone()).await{Ok(value)=>Event::Reply(command,value),Err(error)=>Event::Error(error.to_string())};let _=events.send(event).await;if refresh&& let Ok(value)=ipc::request(Command::Config).await{let _=events.send(Event::Reply(Command::Config,value)).await;}});}
  }}jobs.abort_all();
  subscription.abort();
 });
    });
    (tx, output)
}
