#![allow(unsafe_op_in_unsafe_fn)]
use super::*;
use std::sync::OnceLock;
use windows::{
    Win32::{
        Foundation::*,
        System::LibraryLoader::GetModuleHandleW,
        UI::{Shell::*, WindowsAndMessaging::*},
    },
    core::w,
};
static WINDOW: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static CALLS: OnceLock<mpsc::Sender<Call>> = OnceLock::new();
fn send(command: Command) {
    if let Some(tx) = CALLS.get() {
        let (reply, _) = oneshot::channel();
        let _ = tx.try_send(Call { command, reply });
    }
}
unsafe extern "system" fn proc(h: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match message {
        m if m == WM_APP + 1 => {
            if lparam.0 as u32 == WM_LBUTTONUP {
                send(Command::OpenUi)
            } else if lparam.0 as u32 == WM_RBUTTONUP {
                let menu = CreatePopupMenu().unwrap();
                for (id, text) in [
                    (1, w!("打开 NetMate")),
                    (2, w!("立即登录")),
                    (3, w!("注销并暂停认证")),
                    (4, w!("恢复网络")),
                    (5, w!("退出 NetMate")),
                ] {
                    let _ = AppendMenuW(menu, MF_STRING, id, text);
                }
                let mut point = POINT::default();
                let _ = GetCursorPos(&mut point);
                let _ = SetForegroundWindow(h);
                let _ = TrackPopupMenu(menu, TPM_RIGHTBUTTON, point.x, point.y, None, h, None);
                let _ = DestroyMenu(menu);
            }
            LRESULT(0)
        }
        WM_POWERBROADCAST => {
            if wparam.0 == 4 {
                send(Command::SystemSuspend(true));
            } else if wparam.0 == 18 || wparam.0 == 7 {
                send(Command::SystemSuspend(false));
            }
            LRESULT(1)
        }
        WM_COMMAND => {
            match wparam.0 & 0xffff {
                1 => send(Command::OpenUi),
                2 => send(Command::Login),
                3 => send(Command::Logout),
                4 => send(Command::Retry),
                5 => send(Command::Quit),
                _ => {}
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(h, message, wparam, lparam),
    }
}
pub fn start(
    calls: mpsc::Sender<Call>,
    mut state: watch::Receiver<Snapshot>,
) -> tokio::task::JoinHandle<()> {
    CALLS.set(calls).ok();
    let (tx, rx) = oneshot::channel();
    std::thread::spawn(move || unsafe {
        let instance = GetModuleHandleW(None).unwrap();
        let class = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: instance.into(),
            lpszClassName: w!("NetMateTray"),
            ..Default::default()
        };
        RegisterClassW(&class);
        let h = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("NetMateTray"),
            w!("NetMate"),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.into()),
            None,
        )
        .unwrap();
        let mut icon = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: h,
            uID: 1,
            uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
            uCallbackMessage: WM_APP + 1,
            hIcon: LoadIconW(None, IDI_APPLICATION).unwrap(),
            ..Default::default()
        };
        let title: Vec<u16> = "NetMate".encode_utf16().collect();
        icon.szTip[..title.len()].copy_from_slice(&title);
        let _ = Shell_NotifyIconW(NIM_ADD, &icon);
        WINDOW.store(h.0 as isize, std::sync::atomic::Ordering::Relaxed);
        let _ = tx.send(h.0 as isize);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = Shell_NotifyIconW(NIM_DELETE, &icon);
    });
    tokio::spawn(async move {
        if let Ok(raw) = rx.await {
            while state.changed().await.is_ok() {
                let state = state.borrow_and_update();
                unsafe {
                    let mut icon = NOTIFYICONDATAW {
                        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
                        hWnd: HWND(raw as *mut _),
                        uID: 1,
                        uFlags: NIF_TIP,
                        ..Default::default()
                    };
                    let tip: Vec<u16> = format!(
                        "NetMate · {}",
                        if state.internet_reachable {
                            "已联网"
                        } else {
                            "等待网络"
                        }
                    )
                    .encode_utf16()
                    .take(127)
                    .collect();
                    icon.szTip[..tip.len()].copy_from_slice(&tip);
                    let _ = Shell_NotifyIconW(NIM_MODIFY, &icon);
                }
            }
        }
    })
}

pub fn notify(title: &str, message: &str) {
    let raw = WINDOW.load(std::sync::atomic::Ordering::Relaxed);
    if raw == 0 {
        return;
    }
    unsafe {
        let mut data = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: HWND(raw as *mut _),
            uID: 1,
            uFlags: NIF_INFO,
            dwInfoFlags: NIIF_INFO,
            ..Default::default()
        };
        let title: Vec<u16> = title.encode_utf16().take(63).collect();
        let message: Vec<u16> = message.encode_utf16().take(255).collect();
        data.szInfoTitle[..title.len()].copy_from_slice(&title);
        data.szInfo[..message.len()].copy_from_slice(&message);
        let _ = Shell_NotifyIconW(NIM_MODIFY, &data);
    }
}
