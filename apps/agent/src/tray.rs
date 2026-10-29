use super::*;
#[cfg(target_os = "linux")]
fn submit(calls: &mpsc::Sender<Call>, command: Command) {
    let (reply, _) = oneshot::channel();
    let _ = calls.try_send(Call { command, reply });
}
#[cfg(target_os = "linux")]
pub fn start(
    calls: mpsc::Sender<Call>,
    mut state: watch::Receiver<Snapshot>,
) -> tokio::task::JoinHandle<()> {
    use ksni::TrayMethods;
    struct Tray {
        calls: mpsc::Sender<Call>,
        online: bool,
    }
    impl ksni::Tray for Tray {
        fn id(&self) -> String {
            "com.netmate.native".into()
        }
        fn title(&self) -> String {
            if self.online {
                "NetMate · 已联网"
            } else {
                "NetMate · 等待网络"
            }
            .into()
        }
        fn icon_name(&self) -> String {
            if self.online {
                "network-wireless-signal-excellent-symbolic"
            } else {
                "network-wireless-offline-symbolic"
            }
            .into()
        }
        fn activate(&mut self, _x: i32, _y: i32) {
            submit(&self.calls, Command::OpenUi);
        }
        fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
            use ksni::menu::StandardItem;
            vec![
                StandardItem {
                    label: "打开 NetMate".into(),
                    activate: Box::new(|s: &mut Tray| submit(&s.calls, Command::OpenUi)),
                    ..Default::default()
                }
                .into(),
                StandardItem {
                    label: "立即登录".into(),
                    activate: Box::new(|s: &mut Tray| submit(&s.calls, Command::Login)),
                    ..Default::default()
                }
                .into(),
                StandardItem {
                    label: "注销并暂停认证".into(),
                    activate: Box::new(|s: &mut Tray| submit(&s.calls, Command::Logout)),
                    ..Default::default()
                }
                .into(),
                StandardItem {
                    label: "立即恢复网络".into(),
                    activate: Box::new(|s: &mut Tray| submit(&s.calls, Command::Retry)),
                    ..Default::default()
                }
                .into(),
                ksni::MenuItem::Separator,
                StandardItem {
                    label: "退出 NetMate".into(),
                    activate: Box::new(|s: &mut Tray| submit(&s.calls, Command::Quit)),
                    ..Default::default()
                }
                .into(),
            ]
        }
    }
    tokio::spawn(async move {
        if let Ok(handle) = (Tray {
            calls,
            online: false,
        })
        .spawn()
        .await
        {
            while state.changed().await.is_ok() {
                let online = state.borrow_and_update().internet_reachable;
                handle.update(|tray| tray.online = online).await;
            }
        }
    })
}
#[cfg(not(target_os = "linux"))]
pub fn start(
    calls: mpsc::Sender<Call>,
    state: watch::Receiver<Snapshot>,
) -> tokio::task::JoinHandle<()> {
    crate::platform::start_tray(calls, state)
}
