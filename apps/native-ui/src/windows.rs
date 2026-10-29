#![allow(unsafe_op_in_unsafe_fn)]
mod appearance;
use crate::client::{self, Event};
use appearance::{Palette, scale};
use netmate_core::{journal::LogQuery, protocol::Command};
use serde_json::{Value, json};
use std::sync::{Mutex, OnceLock};
use windows::{
    Win32::{
        Foundation::*,
        Graphics::Gdi::*,
        System::{LibraryLoader::GetModuleHandleW, SystemServices::SS_OWNERDRAW},
        UI::{Controls::*, HiDpi::*, WindowsAndMessaging::*},
    },
    core::{PCWSTR, PWSTR, w},
};
struct Ui {
    tx: async_channel::Sender<Command>,
    config: Value,
    state: Value,
    page: u16,
    children: Vec<Control>,
    cards: Vec<RECT>,
    dark: bool,
    dpi: u32,
    scroll: i32,
    normal_font: isize,
    title_font: isize,
    brand_font: isize,
    card_font: isize,
    card_brush: isize,
    rows: Vec<Value>,
    edit: Value,
    query: LogQuery,
    cursors: Vec<Option<String>>,
    next: Option<String>,
    log_generation: u64,
    ready: bool,
}
#[derive(Clone, Copy)]
struct Control {
    handle: isize,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    fixed: bool,
    font_role: u8,
}
static UI: OnceLock<Mutex<Ui>> = OnceLock::new();
const REPLY: u32 = WM_APP + 20;
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}
unsafe fn child(
    parent: HWND,
    class: PCWSTR,
    text: &str,
    id: u16,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    extra: u32,
) -> HWND {
    let (dpi, scroll, normal_font, card_font) = {
        let s = UI.get().unwrap().lock().unwrap();
        (s.dpi, s.scroll, s.normal_font, s.card_font)
    };
    let font_role =
        u8::from(id == 0 && matches!(text, "网络连接状态" | "当前账号" | "当前 WiFi" | "心跳检测"));
    let chrome = (1..=6).contains(&id) || id >= 900;
    let fixed = chrome && id != 902;
    let tab_stop = if id == 0 || matches!(id, 80..=83 | 90 | 900 | 902) {
        0
    } else {
        WS_TABSTOP.0
    };
    let owner_static = id == 0 || matches!(id, 80..=83 | 90 | 900 | 902);
    let (x, y) = if chrome { (x, y) } else { (x + 224, y + 80) };
    let text = wide(text);
    let result = CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        class,
        PCWSTR(text.as_ptr()),
        WINDOW_STYLE(
            WS_CHILD.0
                | WS_VISIBLE.0
                | tab_stop
                | extra
                | if owner_static { SS_OWNERDRAW.0 } else { 0 },
        ),
        scale(x, dpi),
        scale(y - if fixed { 0 } else { scroll }, dpi),
        scale(width, dpi),
        scale(height, dpi),
        Some(parent),
        Some(HMENU(id as usize as *mut _)),
        None,
        None,
    )
    .unwrap();
    UI.get().unwrap().lock().unwrap().children.push(Control {
        handle: result.0 as isize,
        x,
        y,
        width,
        height,
        fixed,
        font_role,
    });
    SendMessageW(
        result,
        WM_SETFONT,
        Some(WPARAM(if font_role == 1 {
            card_font
        } else {
            normal_font
        } as usize)),
        Some(LPARAM(1)),
    );
    result
}
unsafe fn button(h: HWND, text: &str, id: u16, x: i32, y: i32, width: i32) {
    child(
        h,
        w!("BUTTON"),
        text,
        id,
        x,
        y,
        width,
        44,
        BS_OWNERDRAW as u32,
    );
}
unsafe fn label(h: HWND, text: &str, id: u16, y: i32) {
    child(h, w!("STATIC"), text, id, 24, y, 800, 32, 0);
}
unsafe fn field(h: HWND, title: &str, value: &str, id: u16, y: i32, password: bool) {
    child(h, w!("STATIC"), title, 0, 24, y, 220, 28, 0);
    child(
        h,
        w!("EDIT"),
        value,
        id,
        245,
        y,
        550,
        28,
        WS_BORDER.0 | ES_AUTOHSCROLL as u32 | if password { ES_PASSWORD as u32 } else { 0 },
    );
}
unsafe fn text(h: HWND, id: u16) -> String {
    let c = GetDlgItem(Some(h), id as i32).unwrap_or_default();
    let mut b = vec![0u16; (GetWindowTextLengthW(c).max(0) + 1) as usize];
    let n = GetWindowTextW(c, &mut b);
    String::from_utf16_lossy(&b[..n as usize])
}
unsafe fn check(h: HWND, title: &str, id: u16, y: i32, value: bool) {
    let c = child(
        h,
        w!("BUTTON"),
        title,
        id,
        24,
        y,
        760,
        28,
        BS_AUTOCHECKBOX as u32,
    );
    SendMessageW(c, BM_SETCHECK, Some(WPARAM(usize::from(value))), None);
    // Classic checkboxes honor WM_CTLCOLORBTN for both light and dark surfaces.
    let _ = SetWindowTheme(c, w!(""), w!(""));
}
unsafe fn checked(h: HWND, id: u16) -> bool {
    SendMessageW(
        GetDlgItem(Some(h), id as i32).unwrap_or_default(),
        BM_GETCHECK,
        None,
        None,
    )
    .0 == 1
}
fn send(command: Command) {
    let _ = UI.get().unwrap().lock().unwrap().tx.try_send(command);
}
unsafe fn selected(h: HWND) -> Option<usize> {
    let list = GetDlgItem(Some(h), 100).ok()?;
    let n = SendMessageW(
        list,
        LVM_GETNEXTITEM,
        Some(WPARAM(usize::MAX)),
        Some(LPARAM(LVNI_SELECTED as isize)),
    )
    .0;
    (n >= 0).then_some(n as usize)
}
unsafe fn feedback(h: HWND, message: &str) {
    let value = wide(message);
    if let Ok(control) = GetDlgItem(Some(h), 90) {
        let _ = SetWindowTextW(control, PCWSTR(value.as_ptr()));
    }
}
pub fn run() {
    unsafe {
        if let Ok(existing) = FindWindowW(w!("NetMateNativeUi"), None) {
            let _ = ShowWindow(existing, SW_RESTORE);
            let _ = SetForegroundWindow(existing);
            return;
        }
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        InitCommonControls();
        let (tx, rx) = client::start();
        UI.set(Mutex::new(Ui {
            tx,
            config: Value::Null,
            state: Value::Null,
            page: 1,
            children: vec![],
            cards: vec![],
            dark: crate::theme::saved_dark().unwrap_or_else(|| appearance::system_dark()),
            dpi: 96,
            scroll: 0,
            normal_font: appearance::font(15, 400, 96).0 as isize,
            title_font: appearance::font(34, 800, 96).0 as isize,
            brand_font: appearance::font(23, 800, 96).0 as isize,
            card_font: appearance::font(19, 700, 96).0 as isize,
            card_brush: CreateSolidBrush(
                Palette::new(
                    crate::theme::saved_dark().unwrap_or_else(|| appearance::system_dark()),
                )
                .card,
            )
            .0 as isize,
            rows: vec![],
            edit: Value::Null,
            query: LogQuery::default(),
            cursors: vec![],
            next: None,
            log_generation: 0,
            ready: false,
        }))
        .ok();
        let instance = GetModuleHandleW(None).unwrap();
        let class = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: instance.into(),
            lpszClassName: w!("NetMateNativeUi"),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap(),
            ..Default::default()
        };
        RegisterClassW(&class);
        let system_dpi = GetDpiForSystem().max(96);
        let h = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("NetMateNativeUi"),
            w!("NetMate"),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE | WS_CLIPCHILDREN | WS_VSCROLL,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            scale(1140, system_dpi).min(GetSystemMetrics(SM_CXSCREEN) - scale(32, system_dpi)),
            scale(820, system_dpi).min(GetSystemMetrics(SM_CYSCREEN) - scale(64, system_dpi)),
            None,
            None,
            Some(instance.into()),
            None,
        )
        .unwrap();
        refresh_fonts(h);
        appearance::titlebar(h, UI.get().unwrap().lock().unwrap().dark);
        render(h);
        send(Command::Config);
        let raw = h.0 as isize;
        std::thread::spawn(move || {
            while let Ok(event) = rx.recv_blocking() {
                let p = Box::into_raw(Box::new(event));
                if PostMessageW(
                    Some(HWND(raw as *mut _)),
                    REPLY,
                    WPARAM(0),
                    LPARAM(p as isize),
                )
                .is_err()
                {
                    drop(Box::from_raw(p));
                    break;
                }
            }
        });
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            if !IsDialogMessageW(h, &message).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }
}
unsafe fn card(x: i32, y: i32, width: i32, height: i32) {
    UI.get().unwrap().lock().unwrap().cards.push(RECT {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
    });
}
unsafe fn refresh_brush() {
    let mut s = UI.get().unwrap().lock().unwrap();
    let old = s.card_brush;
    s.card_brush = CreateSolidBrush(Palette::new(s.dark).card).0 as isize;
    let _ = DeleteObject(HGDIOBJ(old as *mut _));
}
unsafe fn refresh_fonts(h: HWND) {
    let dpi = GetDpiForWindow(h).max(96);
    let (old, controls, normal, title, brand, card_font) = {
        let mut s = UI.get().unwrap().lock().unwrap();
        let old = [s.normal_font, s.title_font, s.brand_font, s.card_font];
        s.dpi = dpi;
        s.normal_font = appearance::font(15, 400, dpi).0 as isize;
        s.title_font = appearance::font(34, 800, dpi).0 as isize;
        s.brand_font = appearance::font(23, 800, dpi).0 as isize;
        s.card_font = appearance::font(19, 700, dpi).0 as isize;
        (
            old,
            s.children.clone(),
            s.normal_font,
            s.title_font,
            s.brand_font,
            s.card_font,
        )
    };
    for c in controls {
        let child = HWND(c.handle as *mut _);
        let id = GetDlgCtrlID(child);
        let font = if id == 902 || id == 80 {
            title
        } else if id == 900 {
            brand
        } else if c.font_role == 1 {
            card_font
        } else {
            normal
        };
        SendMessageW(
            child,
            WM_SETFONT,
            Some(WPARAM(font as usize)),
            Some(LPARAM(1)),
        );
    }
    for value in old {
        let _ = DeleteObject(HGDIOBJ(value as *mut _));
    }
}
unsafe fn position_children(h: HWND) {
    let mut rect = RECT::default();
    let _ = GetClientRect(h, &mut rect);
    let (controls, dpi, scroll, max) = {
        let mut s = UI.get().unwrap().lock().unwrap();
        let height = rect.bottom * 96 / s.dpi as i32;
        let max = s
            .children
            .iter()
            .filter(|c| !c.fixed)
            .map(|c| c.y + c.height + 32)
            .max()
            .unwrap_or(0);
        s.scroll = s.scroll.clamp(0, (max - height).max(0));
        (s.children.clone(), s.dpi, s.scroll, max)
    };
    for c in controls {
        let y = if c.fixed {
            if c.handle == GetDlgItem(Some(h), 901).unwrap_or_default().0 as isize {
                (rect.bottom * 96 / dpi as i32 - 92).max(380)
            } else {
                c.y
            }
        } else {
            c.y - scroll
        };
        let content_scale = appearance::content_scale(rect.right, dpi);
        let (x, width) = if c.fixed {
            (c.x, c.width)
        } else {
            (
                224 + ((c.x - 224) as f64 * content_scale) as i32,
                (c.width as f64 * content_scale) as i32,
            )
        };
        let _ = SetWindowPos(
            HWND(c.handle as *mut _),
            None,
            scale(x, dpi),
            scale(y, dpi),
            scale(width, dpi),
            scale(c.height, dpi),
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
    let info = SCROLLINFO {
        cbSize: std::mem::size_of::<SCROLLINFO>() as u32,
        fMask: SIF_RANGE | SIF_PAGE | SIF_POS,
        nMin: 0,
        nMax: max.saturating_sub(1),
        nPage: (rect.bottom * 96 / dpi as i32).max(1) as u32,
        nPos: scroll,
        ..Default::default()
    };
    SetScrollInfo(h, SB_VERT, &info, true);
}
unsafe fn refresh_home(h: HWND) {
    let (state, config) = {
        let s = UI.get().unwrap().lock().unwrap();
        (s.state.clone(), s.config.clone())
    };
    let n = &state["network"];
    let online = state["internetReachable"] == true;
    let account = config["accounts"]
        .as_array()
        .and_then(|a| a.iter().find(|a| a["id"] == config["currentAccountId"]));
    let fields = [
        (
            80,
            if online {
                "已连接"
            } else if matches!(
                state["phase"].as_str(),
                Some("authenticating" | "connecting")
            ) {
                "连接中…"
            } else {
                "未连接"
            }
            .to_owned(),
        ),
        (
            81,
            format!(
                "{}\r\nIPv4  {}    IPv6  {}\r\nBSSID  {}\r\n信号 {} dBm    频率 {} MHz    速率 {} Mbps",
                n["ssid"].as_str().unwrap_or("未连接 WiFi"),
                n["ipv4"].as_str().unwrap_or("未知"),
                n["ipv6"].as_str().unwrap_or("未知"),
                n["bssid"].as_str().unwrap_or("未知"),
                n["rssi"],
                n["frequency"],
                n["linkSpeed"]
            ),
        ),
        (
            82,
            account
                .map(|a| {
                    format!(
                        "{}\r\n{}",
                        a["username"].as_str().unwrap_or(""),
                        a["serverUrl"].as_str().unwrap_or("")
                    )
                })
                .unwrap_or_else(|| "尚未配置认证账号，请添加账号并关联 WiFi。".into()),
        ),
        (
            83,
            format!(
                "{} · 每 {} 秒检测一次 · {}",
                if config["settings"]["enableHeartbeat"] == true {
                    "心跳检测已开启"
                } else {
                    "心跳检测已关闭"
                },
                config["settings"]["heartbeatIntervalSeconds"],
                state["message"].as_str().unwrap_or("等待网络状态")
            ),
        ),
    ];
    for (id, value) in fields {
        if let Ok(control) = GetDlgItem(Some(h), id) {
            let value = wide(&value);
            let _ = SetWindowTextW(control, PCWSTR(value.as_ptr()));
        }
    }
    if let Ok(status) = GetDlgItem(Some(h), 80) {
        let font = UI.get().unwrap().lock().unwrap().title_font;
        SendMessageW(
            status,
            WM_SETFONT,
            Some(WPARAM(font as usize)),
            Some(LPARAM(1)),
        );
    }
}
unsafe fn render(h: HWND) {
    let (page, config, edit, state, old) = {
        let mut s = UI.get().unwrap().lock().unwrap();
        (s.page, s.config.clone(), s.edit.clone(), s.state.clone(), {
            s.cards.clear();
            std::mem::take(&mut s.children)
        })
    };
    for c in old {
        let _ = DestroyWindow(HWND(c.handle as *mut _));
    }
    let mut rect = RECT::default();
    let _ = GetClientRect(h, &mut rect);
    let (dpi, dark, title_font, brand_font) = {
        let s = UI.get().unwrap().lock().unwrap();
        (s.dpi, s.dark, s.title_font, s.brand_font)
    };
    let brand = child(h, w!("STATIC"), "NetMate", 900, 24, 32, 156, 40, 0);
    SendMessageW(
        brand,
        WM_SETFONT,
        Some(WPARAM(brand_font as usize)),
        Some(LPARAM(1)),
    );
    for (index, (id, title)) in [
        (1, "运行状态"),
        (5, "配置设置"),
        (4, "运行日志"),
        (6, "关于"),
    ]
    .into_iter()
    .enumerate()
    {
        button(h, title, id, 12, 104 + index as i32 * 56, 170);
    }
    button(
        h,
        if dark {
            "切换至白天模式"
        } else {
            "切换至黑夜模式"
        },
        901,
        32,
        (rect.bottom * 96 / dpi as i32 - 92).max(380),
        130,
    );
    let title = match page {
        1 => "运行状态",
        2 | 3 | 5 | 7 | 8 | 9 => "配置设置",
        4 | 10 => "运行日志",
        _ => "关于",
    };
    let heading = child(h, w!("STATIC"), title, 902, 248, 36, 810, 48, 0);
    SendMessageW(
        heading,
        WM_SETFONT,
        Some(WPARAM(title_font as usize)),
        Some(LPARAM(1)),
    );
    if matches!(page, 2 | 3 | 5) {
        for (id, title, x) in [
            (13, "账号配置", 24),
            (12, "WiFi 配置", 190),
            (15, "通用设置", 356),
        ] {
            button(h, title, id, x, 14, 150);
        }
    }
    label(h, "", 90, 735);
    match page {
        1 => {
            for (x, y, width, height) in [
                (24, 70, 390, 224),
                (438, 70, 396, 224),
                (24, 318, 810, 202),
                (24, 544, 810, 154),
            ] {
                card(x, y, width, height);
            }
            child(h, w!("STATIC"), "网络连接状态", 0, 56, 98, 326, 28, 0);
            child(h, w!("STATIC"), "", 80, 56, 142, 326, 42, 0);
            button(h, "立即连接", 20, 56, 214, 144);
            button(h, "断开连接", 21, 214, 214, 144);
            child(h, w!("STATIC"), "当前账号", 0, 470, 98, 332, 28, 0);
            child(h, w!("STATIC"), "", 82, 470, 142, 332, 70, 0);
            button(h, "配置账号", 85, 470, 214, 160);
            child(h, w!("STATIC"), "当前 WiFi", 0, 56, 346, 746, 28, 0);
            child(h, w!("STATIC"), "", 81, 56, 390, 746, 112, 0);
            child(h, w!("STATIC"), "心跳检测", 0, 56, 572, 746, 28, 0);
            child(h, w!("STATIC"), "", 83, 56, 608, 746, 28, 0);
            button(h, "立即恢复网络", 22, 56, 642, 200);
            button(h, "停止当前恢复", 23, 270, 642, 200);
            refresh_home(h);
        }
        2 | 3 | 4 | 9 => {
            card(8, 64, 842, 648);
            let rows = if page == 2 {
                config["wifiRules"].as_array().cloned().unwrap_or_default()
            } else if page == 3 {
                config["accounts"].as_array().cloned().unwrap_or_default()
            } else {
                UI.get().unwrap().lock().unwrap().rows.clone()
            };
            let list = child(
                h,
                WC_LISTVIEWW,
                "",
                100,
                24,
                80,
                810,
                if page == 4 { 440 } else { 490 },
                WS_BORDER.0 | LVS_REPORT | LVS_OWNERDATA | LVS_SINGLESEL,
            );
            let mut title = wide(if page == 2 || page == 9 {
                "WiFi"
            } else if page == 3 {
                "账号"
            } else {
                "日志（双击查看详情）"
            });
            let column = LVCOLUMNW {
                mask: LVCF_TEXT | LVCF_WIDTH,
                cx: scale(
                    (780.0 * appearance::content_scale(rect.right, dpi)) as i32,
                    dpi,
                ),
                pszText: PWSTR(title.as_mut_ptr()),
                ..Default::default()
            };
            SendMessageW(
                list,
                LVM_INSERTCOLUMNW,
                Some(WPARAM(0)),
                Some(LPARAM((&column as *const LVCOLUMNW) as isize)),
            );
            SendMessageW(list, LVM_SETITEMCOUNT, Some(WPARAM(rows.len())), None);
            let palette = Palette::new(dark);
            SendMessageW(
                list,
                LVM_SETBKCOLOR,
                None,
                Some(LPARAM(palette.card.0 as isize)),
            );
            SendMessageW(
                list,
                LVM_SETTEXTBKCOLOR,
                None,
                Some(LPARAM(palette.card.0 as isize)),
            );
            SendMessageW(
                list,
                LVM_SETTEXTCOLOR,
                None,
                Some(LPARAM(palette.text.0 as isize)),
            );
            UI.get().unwrap().lock().unwrap().rows = rows;
            if page == 9 {
                button(h, "配置所选网络", 35, 24, 590, 220);
            } else if page == 4 {
                let query = UI.get().unwrap().lock().unwrap().query.clone();
                field(h, "搜索全部历史", &query.keyword, 120, 585, false);
                button(h, "搜索 / 刷新", 40, 24, 625, 140);
                button(h, "上一页", 41, 172, 625, 100);
                button(h, "下一页", 42, 280, 625, 100);
                button(h, "导出全部", 43, 388, 625, 120);
                button(h, "导出筛选", 44, 516, 625, 120);
                button(h, "清空日志", 45, 644, 625, 120);
                button(h, "筛选条件", 46, 24, 545, 140);
            } else {
                button(h, "添加", 30, 24, 590, 140);
                button(h, "编辑", 31, 172, 590, 140);
                button(h, "删除", 32, 320, 590, 140);
                button(
                    h,
                    if page == 2 {
                        "连接"
                    } else {
                        "设为当前账号"
                    },
                    33,
                    468,
                    590,
                    170,
                );
                if page == 2 {
                    button(h, "扫描附近 WiFi", 34, 24, 635, 220);
                }
            }
        }
        5 => {
            card(8, 58, 842, 632);
            let settings = &config["settings"];
            for (id, key, title) in [
                (200, "autoLaunch", "开机自启"),
                (201, "enableHeartbeat", "启用心跳"),
                (202, "autoReconnect", "断线自动恢复"),
                (203, "startupAutoConnect", "启动时自动连接"),
                (204, "keepCurrentConnection", "保持当前连接"),
                (205, "autoUpdate", "自动检查更新"),
            ] {
                check(
                    h,
                    title,
                    id,
                    70 + (id as i32 - 200) * 32,
                    settings[key] == true,
                );
            }
            for (id, key, title) in [
                (210, "heartbeatIntervalSeconds", "心跳间隔（秒）"),
                (211, "heartbeatFailureThreshold", "连续失败阈值"),
                (212, "wifiReconnectRetries", "每 WiFi 尝试次数"),
                (213, "wifiReconnectCooldownMinutes", "冷却（分钟）"),
            ] {
                field(
                    h,
                    title,
                    &settings[key].to_string(),
                    id,
                    280 + (id as i32 - 210) * 38,
                    false,
                );
            }
            for (id, key, title) in [
                (220, "wifiDisconnected", "WiFi 断开通知"),
                (221, "reconnectSuccess", "恢复成功通知"),
                (222, "reconnectFailed", "恢复失败通知"),
                (223, "authRecovered", "认证恢复通知"),
            ] {
                check(
                    h,
                    title,
                    id,
                    450 + (id as i32 - 220) * 32,
                    settings["notificationSettings"][key] == true,
                );
            }
            button(h, "保存并应用", 50, 24, 620, 220);
        }
        10 => {
            card(8, 58, 842, 354);
            let q = UI.get().unwrap().lock().unwrap().query.clone();
            field(h, "关键词", &q.keyword, 130, 90, false);
            field(h, "来源（可留空）", &q.source, 131, 140, false);
            field(
                h,
                "级别（all/info/warn/error/debug/success）",
                &q.level,
                132,
                190,
                false,
            );
            field(h, "最近小时（0=全部保留历史）", "0", 133, 240, false);
            button(h, "应用筛选", 47, 24, 310, 200);
        }
        7 | 8 => {
            card(8, 58, 842, 590);
            if page == 7 {
                for (id, key, title) in [
                    (300, "name", "显示名称"),
                    (301, "username", "账号"),
                    (302, "serverUrl", "认证服务器"),
                    (303, "isp", "运营商"),
                ] {
                    if key == "isp" {
                        child(h, w!("STATIC"), "运营商", 0, 24, 230, 220, 28, 0);
                        let combo = child(
                            h,
                            w!("COMBOBOX"),
                            "",
                            303,
                            245,
                            230,
                            550,
                            180,
                            CBS_DROPDOWNLIST as u32 | WS_VSCROLL.0,
                        );
                        for title in ["校园网", "中国移动", "中国联通", "中国电信"] {
                            let title = wide(title);
                            SendMessageW(
                                combo,
                                CB_ADDSTRING,
                                None,
                                Some(LPARAM(title.as_ptr() as isize)),
                            );
                        }
                        let selected = ["campus", "cmcc", "cucc", "ctcc"]
                            .iter()
                            .position(|v| Some(*v) == edit["isp"].as_str())
                            .unwrap_or(0);
                        SendMessageW(combo, CB_SETCURSEL, Some(WPARAM(selected)), None);
                    } else {
                        field(
                            h,
                            title,
                            edit[key].as_str().unwrap_or(""),
                            id,
                            80 + (id as i32 - 300) * 50,
                            false,
                        );
                    }
                }
            } else {
                for (id, key, title) in [
                    (300, "ssid", "WiFi 名称"),
                    (301, "security", "安全类型"),
                    (302, "bssid", "BSSID（可留空）"),
                    (303, "priority", "优先级 1–99"),
                ] {
                    let value = edit[key]
                        .as_str()
                        .map(str::to_string)
                        .unwrap_or_else(|| edit[key].to_string());
                    field(
                        h,
                        title,
                        if value == "null" { "" } else { &value },
                        id,
                        80 + (id as i32 - 300) * 50,
                        false,
                    );
                }
                check(h, "允许自动连接", 310, 400, edit["autoConnect"] == true);
                check(h, "需要校园网认证", 311, 435, edit["requiresAuth"] == true);
                let names = edit["linkedAccountIds"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|id| {
                        config["accounts"]
                            .as_array()?
                            .iter()
                            .find(|a| a["id"] == *id)?
                            .get("username")?
                            .as_str()
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                field(h, "关联账号（账号名称，逗号分隔）", &names, 312, 480, false);
            }
            field(h, "密码（留空保留）", "", 304, 300, true);
            check(h, "清空已保存密码", 305, 350, false);
            button(h, "保存", 60, 24, 570, 180);
            button(h, "取消", 61, 212, 570, 180);
        }
        _ => {
            card(8, 58, 842, 418);
            label(
                h,
                concat!(
                    "NetMate ",
                    env!("CARGO_PKG_VERSION"),
                    " · WiFi 连接管理与校园网认证"
                ),
                80,
                80,
            );
            for (id, title) in [
                (70, "检查更新"),
                (71, "下载更新"),
                (72, "查看下载进度"),
                (73, "取消下载"),
                (74, "校验并安装更新"),
                (75, "退出 NetMate"),
            ] {
                button(h, title, id, 24, 140 + (id as i32 - 70) * 45, 280);
            }
        }
    }
    position_children(h);
    let _ = InvalidateRect(Some(h), None, false);
}
unsafe fn command(h: HWND, id: u16) {
    if id == 901 {
        let dark = {
            let mut s = UI.get().unwrap().lock().unwrap();
            s.dark = !s.dark;
            s.dark
        };
        if let Err(error) = crate::theme::save(dark) {
            feedback(h, &error.to_string());
        }
        refresh_brush();
        appearance::titlebar(h, dark);
        let title = wide(if dark {
            "切换至白天模式"
        } else {
            "切换至黑夜模式"
        });
        if let Ok(toggle) = GetDlgItem(Some(h), 901) {
            let _ = SetWindowTextW(toggle, PCWSTR(title.as_ptr()));
        }
        if let Ok(list) = GetDlgItem(Some(h), 100) {
            let p = Palette::new(dark);
            SendMessageW(list, LVM_SETBKCOLOR, None, Some(LPARAM(p.card.0 as isize)));
            SendMessageW(
                list,
                LVM_SETTEXTBKCOLOR,
                None,
                Some(LPARAM(p.card.0 as isize)),
            );
            SendMessageW(
                list,
                LVM_SETTEXTCOLOR,
                None,
                Some(LPARAM(p.text.0 as isize)),
            );
        }
        let _ = RedrawWindow(Some(h), None, None, RDW_INVALIDATE | RDW_ALLCHILDREN);
        return;
    }
    let id = match id {
        12 => 2,
        13 | 85 => 3,
        15 => 5,
        _ => id,
    };
    if (1..=6).contains(&id) {
        {
            let mut s = UI.get().unwrap().lock().unwrap();
            s.page = id;
            s.scroll = 0;
        }
        render(h);
        if id == 4 {
            let query = UI.get().unwrap().lock().unwrap().query.clone();
            send(Command::Logs(query))
        }
        return;
    }
    match id {
        20 => send(Command::Login),
        21 => send(Command::Logout),
        22 => send(Command::Retry),
        23 => send(Command::StopRecovery),
        34 => send(Command::Scan),
        30 | 31 => {
            let selected = selected(h);
            let mut s = UI.get().unwrap().lock().unwrap();
            let page = s.page;
            let value = if id == 31 {
                selected.and_then(|i| s.rows.get(i).cloned())
            } else {
                Some(if page == 3 {
                    json!({"id":format!("account-{}",netmate_core::model::now()),"serverUrl":"http://10.10.102.50:801","isp":"campus"})
                } else {
                    json!({"id":format!("wifi-{}",netmate_core::model::now()),"priority":10,"autoConnect":true})
                })
            };
            if let Some(value) = value {
                s.edit = value;
                s.page = if page == 3 { 7 } else { 8 };
            }
            drop(s);
            render(h);
        }
        35 => {
            if let Some(index) = selected(h) {
                let mut s = UI.get().unwrap().lock().unwrap();
                let mut network = s.rows[index].clone();
                network["id"] = json!(format!("wifi-{}", netmate_core::model::now()));
                network["priority"] = json!(10);
                network["autoConnect"] = json!(true);
                s.edit = network;
                s.page = 8;
                drop(s);
                render(h);
            }
        }
        32 | 33 => {
            if id == 32
                && MessageBoxW(Some(h), w!("确认删除所选配置？"), w!("NetMate"), MB_YESNO) != IDYES
            {
                return;
            }
            if let Some(index) = selected(h) {
                let s = UI.get().unwrap().lock().unwrap();
                let item = s.rows[index].clone();
                if id == 33 && s.page == 2 {
                    drop(s);
                    send(Command::Connect {
                        id: item["id"].as_str().unwrap_or("").into(),
                    });
                    return;
                }
                let mut config = s.config.clone();
                if id == 33 {
                    config["currentAccountId"] = item["id"].clone();
                } else {
                    let field = if s.page == 3 { "accounts" } else { "wifiRules" };
                    config[field]
                        .as_array_mut()
                        .unwrap()
                        .retain(|a| a["id"] != item["id"]);
                    if field == "accounts" {
                        if config["currentAccountId"] == item["id"] {
                            config["currentAccountId"] = Value::Null;
                        }
                        for w in config["wifiRules"].as_array_mut().unwrap() {
                            w["linkedAccountIds"]
                                .as_array_mut()
                                .unwrap()
                                .retain(|id| id != &item["id"]);
                        }
                    }
                }
                drop(s);
                send(Command::SaveConfig(config));
            }
        }
        50 => {
            let mut config = UI.get().unwrap().lock().unwrap().config.clone();
            for (id, key) in [
                (200, "autoLaunch"),
                (201, "enableHeartbeat"),
                (202, "autoReconnect"),
                (203, "startupAutoConnect"),
                (204, "keepCurrentConnection"),
                (205, "autoUpdate"),
            ] {
                config["settings"][key] = json!(checked(h, id));
            }
            for (id, key) in [
                (210, "heartbeatIntervalSeconds"),
                (211, "heartbeatFailureThreshold"),
                (212, "wifiReconnectRetries"),
                (213, "wifiReconnectCooldownMinutes"),
            ] {
                config["settings"][key] = json!(text(h, id).parse::<u64>().unwrap_or(0));
            }
            for (id, key) in [
                (220, "wifiDisconnected"),
                (221, "reconnectSuccess"),
                (222, "reconnectFailed"),
                (223, "authRecovered"),
            ] {
                config["settings"]["notificationSettings"][key] = json!(checked(h, id));
            }
            send(Command::SaveConfig(config));
        }
        60 => {
            let mut s = UI.get().unwrap().lock().unwrap();
            let account = s.page == 7;
            let mut item = s.edit.clone();
            for (id, key) in if account {
                [
                    (300, "name"),
                    (301, "username"),
                    (302, "serverUrl"),
                    (303, "isp"),
                ]
            } else {
                [
                    (300, "ssid"),
                    (301, "security"),
                    (302, "bssid"),
                    (303, "priority"),
                ]
            } {
                item[key] = if key == "priority" {
                    json!(text(h, id).parse::<u8>().unwrap_or(0))
                } else {
                    let v = text(h, id);
                    if v.is_empty() && (key == "security" || key == "bssid") {
                        Value::Null
                    } else {
                        json!(v)
                    }
                };
            }
            if account {
                let combo = GetDlgItem(Some(h), 303).unwrap_or_default();
                let selected = SendMessageW(combo, CB_GETCURSEL, None, None).0.max(0) as usize;
                item["isp"] = json!(["campus", "cmcc", "cucc", "ctcc"][selected.min(3)]);
            }
            let pw = text(h, 304);
            item["passwordEdit"] = if checked(h, 305) {
                json!({"action":"clear"})
            } else if pw.is_empty() {
                json!({"action":"keep"})
            } else {
                json!({"action":"replace","value":pw})
            };
            if !account {
                item["autoConnect"] = json!(checked(h, 310));
                item["requiresAuth"] = json!(checked(h, 311));
                let names = text(h, 312);
                item["linkedAccountIds"] = json!(
                    names
                        .split(',')
                        .filter_map(|name| s.config["accounts"]
                            .as_array()?
                            .iter()
                            .find(|a| a["username"].as_str() == Some(name.trim()))?
                            .get("id")
                            .cloned())
                        .collect::<Vec<_>>()
                );
            }
            let field = if account { "accounts" } else { "wifiRules" };
            let mut config = s.config.clone();
            let values = config[field].as_array_mut().unwrap();
            if let Some(index) = values.iter().position(|a| a["id"] == item["id"]) {
                values[index] = item;
            } else {
                values.push(item)
            }
            s.page = if account { 3 } else { 2 };
            drop(s);
            send(Command::SaveConfig(config));
        }
        61 => {
            let mut s = UI.get().unwrap().lock().unwrap();
            s.page = if s.page == 7 { 3 } else { 2 };
            drop(s);
            render(h);
        }
        40 => {
            let mut s = UI.get().unwrap().lock().unwrap();
            s.query.keyword = text(h, 120);
            s.query.cursor = None;
            s.cursors.clear();
            let q = s.query.clone();
            drop(s);
            send(Command::Logs(q));
        }
        41 | 42 => {
            let mut s = UI.get().unwrap().lock().unwrap();
            if id == 41 {
                if let Some(c) = s.cursors.pop() {
                    s.query.cursor = c
                }
            } else if let Some(next) = s.next.clone() {
                let old = s.query.cursor.clone();
                s.cursors.push(old);
                s.query.cursor = Some(next);
            }
            let q = s.query.clone();
            drop(s);
            send(Command::Logs(q));
        }
        43 | 44 => send(Command::ExportLogs {
            query: if id == 44 {
                UI.get().unwrap().lock().unwrap().query.clone()
            } else {
                LogQuery::default()
            },
            format: "text".into(),
        }),
        45 => {
            if MessageBoxW(Some(h), w!("清空全部保留日志？"), w!("NetMate"), MB_YESNO) == IDYES
            {
                send(Command::ClearLogs)
            }
        }
        46 => {
            UI.get().unwrap().lock().unwrap().page = 10;
            render(h);
        }
        47 => {
            let hours = text(h, 133).parse::<u64>();
            if !matches!(hours, Ok(0..=168)) {
                feedback(h, "请输入 0–168 小时");
                return;
            }
            let mut s = UI.get().unwrap().lock().unwrap();
            s.query.keyword = text(h, 130);
            s.query.source = text(h, 131);
            s.query.level = text(h, 132);
            s.query.start_time = hours
                .ok()
                .filter(|h| *h > 0)
                .map(|h| netmate_core::model::now().saturating_sub(h * 3600000));
            s.query.cursor = None;
            s.cursors.clear();
            s.page = 4;
            let q = s.query.clone();
            drop(s);
            render(h);
            send(Command::Logs(q));
        }
        70 => send(Command::UpdateCheck),
        71 => send(Command::UpdateDownload),
        72 => send(Command::UpdateStatus),
        73 => send(Command::UpdateCancel),
        74 => send(Command::UpdateInstall),
        75 => {
            send(Command::Quit);
            let _ = DestroyWindow(h);
        }
        _ => {}
    }
}
unsafe extern "system" fn proc(h: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match message {
        WM_PAINT => {
            let mut paint = PAINTSTRUCT::default();
            let dc = BeginPaint(h, &mut paint);
            let mut rect = RECT::default();
            let _ = GetClientRect(h, &mut rect);
            {
                let s = UI.get().unwrap().lock().unwrap();
                appearance::background(dc, rect, Palette::new(s.dark), s.dpi, &s.cards, s.scroll);
            }
            let _ = EndPaint(h, &paint);
            let result = LRESULT(0);
            let mut s = UI.get().unwrap().lock().unwrap();
            if !s.ready && !s.config.is_null() {
                s.ready = true;
                let _ = s.tx.try_send(Command::UiReady {
                    pid: std::process::id(),
                });
            }
            result
        }
        WM_ERASEBKGND => LRESULT(1),
        WM_GETMINMAXINFO => {
            let info = &mut *(l.0 as *mut MINMAXINFO);
            let dpi = GetDpiForWindow(h).max(96);
            info.ptMinTrackSize = POINT {
                x: scale(900, dpi),
                y: scale(480, dpi),
            };
            LRESULT(0)
        }
        WM_SIZE => {
            position_children(h);
            let _ = InvalidateRect(Some(h), None, false);
            LRESULT(0)
        }
        WM_DPICHANGED => {
            refresh_fonts(h);
            let r = &*(l.0 as *const RECT);
            let _ = SetWindowPos(
                h,
                None,
                r.left,
                r.top,
                r.right - r.left,
                r.bottom - r.top,
                SWP_NOZORDER | SWP_NOACTIVATE,
            );
            position_children(h);
            LRESULT(0)
        }
        WM_VSCROLL | WM_MOUSEWHEEL => {
            let mut info = SCROLLINFO {
                cbSize: std::mem::size_of::<SCROLLINFO>() as u32,
                fMask: SIF_ALL,
                ..Default::default()
            };
            let _ = GetScrollInfo(h, SB_VERT, &mut info);
            let delta = if message == WM_MOUSEWHEEL {
                -((w.0 >> 16) as i16 as i32) / 120 * 72
            } else {
                match w.0 as u16 as i32 {
                    x if x == SB_LINEUP.0 => -36,
                    x if x == SB_LINEDOWN.0 => 36,
                    x if x == SB_PAGEUP.0 => -360,
                    x if x == SB_PAGEDOWN.0 => 360,
                    x if x == SB_THUMBTRACK.0 => info.nTrackPos - info.nPos,
                    _ => 0,
                }
            };
            {
                let mut s = UI.get().unwrap().lock().unwrap();
                s.scroll = (s.scroll + delta).clamp(0, (info.nMax - info.nPage as i32 + 1).max(0));
            }
            position_children(h);
            let _ = InvalidateRect(Some(h), None, false);
            LRESULT(0)
        }
        WM_DRAWITEM => {
            let item = &*(l.0 as *const DRAWITEMSTRUCT);
            let s = UI.get().unwrap().lock().unwrap();
            let mut root = RECT::default();
            let _ = GetClientRect(h, &mut root);
            if let Some(control) = s
                .children
                .iter()
                .find(|c| c.handle == item.hwndItem.0 as isize)
            {
                let content_scale = appearance::content_scale(root.right, s.dpi);
                let x = if control.fixed {
                    control.x
                } else {
                    224 + ((control.x - 224) as f64 * content_scale) as i32
                };
                let y = if control.fixed && item.CtlID == 901 {
                    (root.bottom * 96 / s.dpi as i32 - 92).max(380)
                } else if control.fixed {
                    control.y
                } else {
                    control.y - s.scroll
                };
                let dc = SaveDC(item.hDC);
                let _ = SetViewportOrgEx(item.hDC, -scale(x, s.dpi), -scale(y, s.dpi), None);
                appearance::background(
                    item.hDC,
                    root,
                    Palette::new(s.dark),
                    s.dpi,
                    &s.cards,
                    s.scroll,
                );
                let _ = RestoreDC(item.hDC, dc);
                if item.CtlType == ODT_STATIC {
                    let font = if matches!(item.CtlID, 80 | 902) {
                        s.title_font
                    } else if item.CtlID == 900 {
                        s.brand_font
                    } else if control.font_role == 1 {
                        s.card_font
                    } else {
                        s.normal_font
                    };
                    appearance::static_text(item, &s, HFONT(font as *mut _));
                } else {
                    appearance::button(item, s.page, s.dark, HFONT(s.normal_font as *mut _), s.dpi);
                }
            }
            LRESULT(1)
        }
        WM_CTLCOLORSTATIC | WM_CTLCOLORBTN | WM_CTLCOLOREDIT | WM_CTLCOLORLISTBOX => {
            let dc = HDC(w.0 as *mut _);
            let s = UI.get().unwrap().lock().unwrap();
            let p = Palette::new(s.dark);
            let _ = SetTextColor(
                dc,
                if GetDlgCtrlID(HWND(l.0 as *mut _)) == 80 && s.page == 1 {
                    appearance::rgb(if s.state["internetReachable"] == true {
                        if s.dark { 0x4ade80 } else { 0x15803d }
                    } else if s.dark {
                        0xfca5a5
                    } else {
                        0xb91c1c
                    })
                } else if GetDlgCtrlID(HWND(l.0 as *mut _)) == 900 {
                    appearance::rgb(if s.dark { 0x38bdf8 } else { 0x0369a1 })
                } else if GetDlgCtrlID(HWND(l.0 as *mut _)) == 902 {
                    appearance::rgb(if s.dark { 0xe2e8f0 } else { 0x0c4a6e })
                } else {
                    p.text
                },
            );
            let _ = SetBkMode(dc, TRANSPARENT);
            if matches!(message, WM_CTLCOLOREDIT | WM_CTLCOLORLISTBOX) {
                let _ = SetBkColor(dc, p.card);
                LRESULT(s.card_brush)
            } else if GetDlgCtrlID(HWND(l.0 as *mut _)) < 900 {
                LRESULT(s.card_brush)
            } else {
                LRESULT(GetStockObject(NULL_BRUSH).0 as isize)
            }
        }
        WM_COMMAND => {
            command(h, (w.0 & 0xffff) as u16);
            LRESULT(0)
        }
        REPLY => {
            let event = *Box::from_raw(l.0 as *mut Event);
            match event {
                Event::State(v) => {
                    if v["phase"] == "exiting" {
                        let _ = DestroyWindow(h);
                        return LRESULT(0);
                    }
                    let page = {
                        let mut s = UI.get().unwrap().lock().unwrap();
                        let refresh = s.page == 4
                            && s.query.cursor.is_none()
                            && v["logRevision"] != s.state["logRevision"];
                        s.state = v;
                        if refresh {
                            let _ = s.tx.try_send(Command::Logs(s.query.clone()));
                        }
                        s.page
                    };
                    if page == 1 {
                        refresh_home(h);
                    }
                }
                Event::Error(e) => feedback(h, &e),
                Event::Reply(op, v) => match op {
                    Command::UiReady { .. } => {}
                    Command::Config | Command::SaveConfig(_) => {
                        UI.get().unwrap().lock().unwrap().config = v;
                        render(h)
                    }
                    Command::Logs(query) => {
                        let mut s = UI.get().unwrap().lock().unwrap();
                        let generation = v["generation"].as_u64().unwrap_or(0);
                        if s.page != 4 || s.query != query || generation < s.log_generation {
                            return LRESULT(0);
                        }
                        s.log_generation = generation;
                        s.rows = v["entries"].as_array().cloned().unwrap_or_default();
                        s.next = if v["hasMore"] == true {
                            v["nextCursor"].as_str().map(str::to_owned)
                        } else {
                            None
                        };
                        let count = s.rows.len();
                        drop(s);
                        if let Ok(list) = GetDlgItem(Some(h), 100) {
                            SendMessageW(list, LVM_SETITEMCOUNT, Some(WPARAM(count)), None);
                            let _ = InvalidateRect(Some(list), None, false);
                        }
                        feedback(h, &format!("共 {} 条 · 本页 {} 条", v["total"], count));
                    }
                    Command::ClearLogs => {
                        let query = {
                            let mut s = UI.get().unwrap().lock().unwrap();
                            s.log_generation = v.as_u64().unwrap_or(s.log_generation + 1);
                            s.rows.clear();
                            s.query.cursor = None;
                            s.next = None;
                            s.cursors.clear();
                            s.query.clone()
                        };
                        if let Ok(list) = GetDlgItem(Some(h), 100) {
                            SendMessageW(list, LVM_SETITEMCOUNT, Some(WPARAM(0)), None);
                        }
                        send(Command::Logs(query));
                    }
                    Command::Scan => {
                        let mut s = UI.get().unwrap().lock().unwrap();
                        s.rows = v.as_array().cloned().unwrap_or_default();
                        s.page = 9;
                        drop(s);
                        render(h)
                    }
                    _ => feedback(
                        h,
                        &if v == true {
                            "操作已提交".into()
                        } else {
                            v.to_string()
                        },
                    ),
                },
            }
            LRESULT(0)
        }
        WM_NOTIFY => {
            let header = &*(l.0 as *const NMHDR);
            if header.code == LVN_GETDISPINFOW {
                let info = &mut *(l.0 as *mut NMLVDISPINFOW);
                let s = UI.get().unwrap().lock().unwrap();
                if let Some(row) = s.rows.get(info.item.iItem.max(0) as usize) {
                    let value = if s.page == 9 {
                        format!(
                            "{} · {} · {} dBm",
                            row["ssid"].as_str().unwrap_or(""),
                            row["security"].as_str().unwrap_or(""),
                            row["rssi"]
                        )
                    } else if s.page == 2 {
                        format!(
                            "{} · 优先级 {}",
                            row["ssid"].as_str().unwrap_or(""),
                            row["priority"]
                        )
                    } else if s.page == 3 {
                        format!(
                            "{} · {}",
                            row["name"].as_str().unwrap_or(""),
                            row["username"].as_str().unwrap_or("")
                        )
                    } else {
                        format!(
                            "[{}] {} {}",
                            row["level"].as_str().unwrap_or(""),
                            row["source"].as_str().unwrap_or(""),
                            row["message"].as_str().unwrap_or("")
                        )
                    };
                    let wide = wide(&value);
                    if !info.item.pszText.is_null() {
                        let count = wide.len().min(info.item.cchTextMax.max(1) as usize);
                        std::ptr::copy_nonoverlapping(
                            wide.as_ptr(),
                            info.item.pszText.0,
                            count.saturating_sub(1),
                        );
                        *info.item.pszText.0.add(count.saturating_sub(1)) = 0;
                    }
                }
            } else if header.code == NM_DBLCLK {
                if let Some(index) = selected(h) {
                    let (page, entry) = {
                        let s = UI.get().unwrap().lock().unwrap();
                        (s.page, s.rows.get(index).cloned())
                    };
                    if page == 4 {
                        if let Some(entry) = entry {
                            let value = wide(&serde_json::to_string_pretty(&entry).unwrap());
                            MessageBoxW(Some(h), PCWSTR(value.as_ptr()), w!("日志详情"), MB_OK);
                        }
                    } else if page == 9 {
                        command(h, 35)
                    } else if page == 2 || page == 3 {
                        command(h, 31)
                    }
                }
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            {
                let mut s = UI.get().unwrap().lock().unwrap();
                for font in [s.normal_font, s.title_font, s.brand_font, s.card_font] {
                    let _ = DeleteObject(HGDIOBJ(font as *mut _));
                }
                let _ = DeleteObject(HGDIOBJ(s.card_brush as *mut _));
                s.children.clear();
            }
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(h, message, w, l),
    }
}
