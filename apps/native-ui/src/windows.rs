#![allow(unsafe_op_in_unsafe_fn)]
//! Win32 pages that mirror the React desktop pages; `linux.rs` defines the shared behavior.
mod appearance;
use crate::client::{self, Event};
use appearance::{Badge, Btn, Font, Ink, Look, Palette, Shape, Surface, scale};
use netmate_core::{
    journal::LogQuery,
    model::{Network, WifiRule},
    protocol::Command,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard, OnceLock},
};
use windows::{
    Win32::{
        Foundation::*,
        Graphics::Gdi::*,
        System::{
            LibraryLoader::GetModuleHandleW,
            SystemServices::{SS_NOPREFIX, SS_OWNERDRAW},
        },
        UI::{Controls::*, HiDpi::*, WindowsAndMessaging::*},
    },
    core::{PCWSTR, PWSTR, w},
};
type Action = Arc<dyn Fn(HWND) + Send + Sync>;
type Choice = Arc<dyn Fn(HWND, usize) + Send + Sync>;
type Edit = Box<dyn Fn(&mut Value) + Send>;
/// x, y, width and height in 96-DPI content units.
type Pos = (i32, i32, i32, i32);
/// Content origin inside the client area, in 96-DPI units.
const LEFT: i32 = 224;
const TOP: i32 = 100;
/// Content width; sections have no card, so rows span it edge to edge.
const CW: i32 = 826;
const HOME: u16 = 1;
const LOGS: u16 = 4;
const SETTINGS: u16 = 5;
const ABOUT: u16 = 6;
const ACCOUNT: u16 = 7;
const WIFI: u16 = 8;
const DETAIL: u16 = 9;
const REPLY: u32 = WM_APP + 20;
/// Button clicks run after the notification returns, so an action may rebuild the page.
const ACTION: u32 = WM_APP + 21;
const FIRST_ACTION: u16 = 1000;
/// Number settings: control id, key and range; saved 600 ms after the last change.
const NUMBERS: [(u16, &str, u64, u64); 4] = [
    (210, "heartbeatIntervalSeconds", 5, 300),
    (211, "heartbeatFailureThreshold", 1, 10),
    (212, "wifiReconnectRetries", 1, 10),
    (213, "wifiReconnectCooldownMinutes", 0, 1440),
];
struct Ui {
    tx: async_channel::Sender<Command>,
    config: Value,
    state: Value,
    page: u16,
    rendered: u16,
    children: Vec<Control>,
    surfaces: Vec<(RECT, Surface)>,
    actions: HashMap<u16, Action>,
    next_id: u16,
    dark: bool,
    dpi: u32,
    scroll: i32,
    /// Wheel delta below one scroll step, kept for precision touchpads.
    wheel_rest: i32,
    layout_scale: f64,
    fonts: [isize; appearance::FONT_COUNT],
    ground_brush: isize,
    input_brush: isize,
    rows: Vec<Value>,
    query: LogQuery,
    cursors: Vec<Option<String>>,
    next: Option<String>,
    log_generation: u64,
    detail: Value,
    edit: Value,
    drafts: HashMap<String, String>,
    edit_keys: HashMap<u16, String>,
    sizing: bool,
    edits: Vec<Edit>,
    saving: bool,
    clear_on_save: Vec<String>,
    scan: Value,
    scanning: bool,
    update: Value,
    poll_update: bool,
    feedback: String,
    home_signature: String,
    countdowns: Vec<(u16, bool)>,
    bias: i64,
    ready: bool,
    /// Day/night switch frame state: the 0.3 s transitions and the hover lean.
    toggle: appearance::Toggle,
    /// Tooltip window for the log toolbar and footer controls (created on first use).
    tips: isize,
    /// Owner-drawn dropdowns: change handler, plus the open and focused ones.
    combos: HashMap<u16, Choice>,
    combo_open: u16,
    combo_focus: u16,
}
/// Timers: 1 countdowns and update polling, 2 number save, 3 switch frames (16 ms, only while
/// a transition runs), 4 hover check.
const TOGGLE_TIMER: usize = 3;
const HOVER_TIMER: usize = 4;
/// The BUTTON and COMBOBOX window procedures, saved when the first control is subclassed.
static BUTTON_PROC: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static COMBO_PROC: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Static,
    Button,
    Edit,
    ReadOnly,
    Check,
    List,
    Combo,
}
#[derive(Clone)]
struct Control {
    handle: isize,
    id: u16,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    fixed: bool,
    kind: Kind,
    look: Look,
    btn: Btn,
    /// Edits drawn inside a rounded field use the input brush.
    field: bool,
}
impl Control {
    fn new(kind: Kind) -> Self {
        Self {
            handle: 0,
            id: 0,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            fixed: false,
            kind,
            look: Look::default(),
            btn: Btn::Normal,
            field: false,
        }
    }
}
static UI: OnceLock<Mutex<Ui>> = OnceLock::new();
fn ui() -> MutexGuard<'static, Ui> {
    UI.get().unwrap().lock().unwrap()
}
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}
fn look(font: Font, ink: Ink) -> Look {
    Look {
        font,
        ink,
        ..Default::default()
    }
}
fn single(font: Font, ink: Ink) -> Look {
    Look {
        single: true,
        ..look(font, ink)
    }
}
fn centered(font: Font, ink: Ink) -> Look {
    Look {
        align: 1,
        ..look(font, ink)
    }
}
/// One text line of `font`, in 96-DPI units.
fn line(font: Font) -> i32 {
    appearance::FONTS[font as usize].0 * 3 / 2 + 2
}
fn send(command: Command) -> bool {
    ui().tx.try_send(command).is_ok()
}
fn act(f: impl Fn(HWND) + Send + Sync + 'static) -> Action {
    Arc::new(f)
}
fn reserve(count: u16) -> u16 {
    let mut s = ui();
    let id = s.next_id;
    s.next_id += count;
    id
}
fn register(id: u16, action: Action) {
    ui().actions.insert(id, action);
}
fn surface(x: i32, y: i32, width: i32, height: i32, kind: Surface) -> usize {
    let mut s = ui();
    s.surfaces.push((
        RECT {
            left: x,
            top: y,
            right: x + width,
            bottom: y + height,
        },
        kind,
    ));
    s.surfaces.len() - 1
}
fn set_bottom(index: usize, bottom: i32) {
    if let Some(item) = ui().surfaces.get_mut(index) {
        item.0.bottom = bottom;
    }
}
fn draft(key: &str, default: &str) -> String {
    ui().drafts
        .get(key)
        .cloned()
        .unwrap_or_else(|| default.into())
}
fn set_draft(key: &str, value: &str) {
    ui().drafts.insert(key.into(), value.into());
}
fn now_ms() -> u64 {
    netmate_core::model::now()
}
fn remaining(deadline: &Value) -> Option<u64> {
    let deadline = deadline.as_u64()?;
    Some(deadline.saturating_sub(now_ms()).div_ceil(1000))
}
/// Local "YYYY-MM-DD HH:MM:SS" from the time zone bias in the registry.
fn format_time(ms: u64, bias: i64) -> String {
    let seconds = (ms / 1000) as i64 - bias * 60;
    let days = seconds.div_euclid(86_400);
    let time = seconds.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02}",
        time / 3600,
        time / 60 % 60,
        time % 60
    )
}
fn level_label(level: &str) -> &str {
    match level {
        "info" => "信息",
        "success" => "成功",
        "warn" => "警告",
        "error" => "错误",
        "debug" => "调试",
        other => other,
    }
}
fn level_index(level: &str) -> u8 {
    match level {
        "info" => 0,
        "success" => 1,
        "warn" => 2,
        "error" => 3,
        "debug" => 4,
        _ => 5,
    }
}
fn isp_label(isp: &str) -> &str {
    match isp {
        "campus" => "校园网",
        "cmcc" => "中国移动",
        "cucc" => "中国联通",
        "ctcc" => "中国电信",
        other => other,
    }
}
fn rules(config: &Value) -> Vec<WifiRule> {
    serde_json::from_value(config["wifiRules"].clone()).unwrap_or_default()
}
fn network(snapshot: &Value) -> Network {
    serde_json::from_value(snapshot["network"].clone()).unwrap_or_default()
}
/// The same rule the agent applies: the most specific matching identity wins.
fn current_rule(config: &Value, n: &Network) -> Option<WifiRule> {
    rules(config)
        .into_iter()
        .filter(|w| n.matches(w))
        .max_by_key(|w| usize::from(w.bssid.is_some()) + usize::from(w.security.is_some()))
}
/// resolveLoginAccounts: linked accounts in order, else the preferred account.
fn login_accounts(config: &Value, n: &Network, rule: Option<&WifiRule>) -> Vec<Value> {
    let accounts = config["accounts"].as_array().cloned().unwrap_or_default();
    if rule.is_none()
        && rules(config)
            .iter()
            .any(|w| Some(&w.ssid) == n.ssid.as_ref())
    {
        return vec![];
    }
    if let Some(rule) = rule {
        let linked: Vec<Value> = rule
            .linked_account_ids
            .iter()
            .filter_map(|id| accounts.iter().find(|a| a["id"] == json!(id)).cloned())
            .collect();
        if !linked.is_empty() {
            return linked;
        }
    }
    accounts
        .into_iter()
        .filter(|a| !config["currentAccountId"].is_null() && a["id"] == config["currentAccountId"])
        .collect()
}
fn same_identity(rule: &Value, ssid: &str, security: Option<&str>, bssid: Option<&str>) -> bool {
    if rule["ssid"] != json!(ssid) {
        return false;
    }
    if security.is_none() && bssid.is_none() {
        return true;
    }
    let norm = |s: Option<&str>| s.map(netmate_core::model::security);
    norm(rule["security"].as_str()) == norm(security)
        && rule["bssid"].as_str().map(str::to_ascii_lowercase) == bssid.map(str::to_ascii_lowercase)
}
fn signal_grade(percent: i32) -> (&'static str, Ink) {
    match percent {
        75.. => ("优秀", Ink::Ok),
        50..=74 => ("良好", Ink::Ok),
        25..=49 => ("一般", Ink::Warn),
        _ => ("较差", Ink::Warn),
    }
}
fn speed_grade(speed: i32) -> (&'static str, Ink) {
    match speed {
        500.. => ("优秀", Ink::Ok),
        200..=499 => ("良好", Ink::Ok),
        100..=199 => ("一般", Ink::Warn),
        50..=99 => ("较差", Ink::Warn),
        _ => ("很差", Ink::Bad),
    }
}
/// Queues a configuration edit; edits apply to the newest config, one save at a time.
fn mutate(edit: impl Fn(&mut Value) + Send + 'static) {
    let idle = {
        let mut s = ui();
        s.edits.push(Box::new(edit));
        !s.saving && !s.config.is_null()
    };
    if idle {
        flush();
    }
}
fn flush() {
    let config = {
        let mut s = ui();
        if s.edits.is_empty() {
            return;
        }
        let edits: Vec<Edit> = s.edits.drain(..).collect();
        let mut config = s.config.clone();
        for edit in &edits {
            edit(&mut config);
        }
        s.saving = true;
        config
    };
    if !send(Command::SaveConfig(config)) {
        ui().saving = false;
    }
}
fn put_item(field: &'static str, item: Value) {
    mutate(move |config| {
        let items = client::list(config, field);
        if let Some(i) = items.iter().position(|old| old["id"] == item["id"]) {
            items[i] = item.clone();
        } else {
            items.push(item.clone())
        }
    });
}
fn remove_account(id: Value) {
    mutate(move |c| {
        c["accounts"]
            .as_array_mut()
            .unwrap()
            .retain(|a| a["id"] != id);
        if c["currentAccountId"] == id {
            c["currentAccountId"] = Value::Null;
        }
        for w in client::list(c, "wifiRules") {
            if let Some(ids) = w["linkedAccountIds"].as_array_mut() {
                ids.retain(|linked| linked != &id);
            }
        }
    });
}
fn remove_wifi(id: Value) {
    mutate(move |c| {
        c["wifiRules"]
            .as_array_mut()
            .unwrap()
            .retain(|w| w["id"] != id)
    });
}
fn toggle_y(height: i32, dpi: u32) -> i32 {
    (height * 96 / dpi as i32 - 96).max(300)
}
/// Device rectangle of a control for the current client size and scroll offset.
fn place(c: &Control, root: RECT, dpi: u32, scroll: i32) -> (i32, i32, i32, i32) {
    if c.fixed {
        let y = match c.id {
            901 => toggle_y(root.bottom, dpi),
            903 => toggle_y(root.bottom, dpi) + appearance::TOGGLE_BOX.1 + 8,
            _ => c.y,
        };
        (
            scale(c.x, dpi),
            scale(y, dpi),
            scale(c.width, dpi),
            scale(c.height, dpi),
        )
    } else {
        let k = appearance::content_scale(root.right, dpi);
        // A classic combo box takes its dropped list height from the window height.
        let list = if c.kind == Kind::Combo {
            4 * 34 + 12
        } else {
            0
        };
        (
            scale(LEFT + (c.x as f64 * k) as i32, dpi),
            scale(TOP + c.y - scroll, dpi),
            scale((c.width as f64 * k) as i32, dpi),
            scale(c.height + list, dpi),
        )
    }
}
unsafe fn client(h: HWND) -> RECT {
    let mut rect = RECT::default();
    let _ = GetClientRect(h, &mut rect);
    rect
}
unsafe fn make(h: HWND, class: PCWSTR, text: &str, mut c: Control, style: u32) -> HWND {
    let (dpi, scroll, font) = {
        let s = ui();
        let font = match c.kind {
            Kind::Static | Kind::ReadOnly => c.look.font,
            _ => Font::Normal,
        };
        (s.dpi, s.scroll, s.fonts[font as usize])
    };
    let (x, y, width, height) = place(&c, client(h), dpi, scroll);
    let base = match c.kind {
        Kind::Static => SS_OWNERDRAW.0 | SS_NOPREFIX.0,
        Kind::Button => BS_OWNERDRAW as u32 | WS_TABSTOP.0,
        Kind::Edit => WS_TABSTOP.0,
        Kind::ReadOnly => WS_TABSTOP.0 | ES_READONLY as u32,
        Kind::Check => BS_AUTOCHECKBOX as u32 | WS_TABSTOP.0,
        Kind::List => WS_TABSTOP.0,
        Kind::Combo => {
            (CBS_DROPDOWNLIST | CBS_OWNERDRAWFIXED | CBS_HASSTRINGS) as u32
                | WS_TABSTOP.0
                | WS_VSCROLL.0
        }
    };
    let value = wide(text);
    let handle = CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        class,
        PCWSTR(value.as_ptr()),
        WINDOW_STYLE(WS_CHILD.0 | WS_VISIBLE.0 | base | style),
        x,
        y,
        width,
        height,
        Some(h),
        Some(HMENU(c.id as usize as *mut _)),
        None,
        None,
    )
    .unwrap_or_default();
    c.handle = handle.0 as isize;
    let kind = c.kind;
    ui().children.push(c);
    SendMessageW(
        handle,
        WM_SETFONT,
        Some(WPARAM(font as usize)),
        Some(LPARAM(1)),
    );
    if kind == Kind::Check {
        // Classic checkboxes honor WM_CTLCOLORSTATIC on both light and dark cards.
        let _ = SetWindowTheme(handle, w!(""), w!(""));
    }
    handle
}
fn at(kind: Kind, id: u16, (x, y, width, height): Pos) -> Control {
    Control {
        id,
        x,
        y,
        width,
        height,
        ..Control::new(kind)
    }
}
/// An owner-drawn static; returns its bottom edge.
unsafe fn label(h: HWND, id: u16, pos: Pos, text: &str, look: Look) -> i32 {
    let c = Control {
        look,
        ..at(Kind::Static, id, pos)
    };
    make(h, w!("STATIC"), text, c, 0);
    pos.1 + pos.3
}
/// A wrapped text block measured for `width`; returns its bottom edge.
unsafe fn para(h: HWND, x: i32, y: i32, width: i32, text: &str, look: Look) -> i32 {
    let height = if look.single {
        line(look.font)
    } else {
        measure(text, look.font, width)
    };
    label(h, 0, (x, y, width, height), text, look)
}
unsafe fn measure(text: &str, font: Font, width: i32) -> i32 {
    let (dpi, handle, k) = {
        let s = ui();
        (s.dpi, s.fonts[font as usize], s.layout_scale)
    };
    let dc = GetDC(None);
    let old = SelectObject(dc, HGDIOBJ(handle as *mut _));
    let mut value: Vec<u16> = text.encode_utf16().collect();
    let mut r = RECT {
        left: 0,
        top: 0,
        right: scale((width as f64 * k) as i32, dpi),
        bottom: 0,
    };
    if !value.is_empty() {
        DrawTextW(
            dc,
            &mut value,
            &mut r,
            DT_CALCRECT | DT_WORDBREAK | DT_NOPREFIX,
        );
    }
    SelectObject(dc, old);
    ReleaseDC(None, dc);
    (r.bottom * 96 / dpi as i32).max(line(font)) + 2
}
/// Single-line text width in content units.
unsafe fn width_of(text: &str, font: Font) -> i32 {
    let (dpi, handle, k) = {
        let s = ui();
        (s.dpi, s.fonts[font as usize], s.layout_scale)
    };
    let dc = GetDC(None);
    let old = SelectObject(dc, HGDIOBJ(handle as *mut _));
    let value: Vec<u16> = text.encode_utf16().collect();
    let mut size = SIZE::default();
    let _ = GetTextExtentPoint32W(dc, &value, &mut size);
    SelectObject(dc, old);
    ReleaseDC(None, dc);
    (size.cx as f64 * 96.0 / dpi as f64 / k) as i32 + 2
}
/// An outline tag (`.badge`): 20 high, 7px side padding, radius 4. Returns its right edge.
unsafe fn badge(h: HWND, x: i32, y: i32, text: &str, kind: Badge) -> i32 {
    let width = width_of(text, Font::Tiny) + 16;
    label(
        h,
        0,
        (x, y, width, 20),
        text,
        Look {
            font: Font::Tiny,
            badge: Some(kind),
            ..Default::default()
        },
    );
    x + width
}
/// An owner-drawn button; `action` runs on click. Returns the control id.
unsafe fn button(
    h: HWND,
    pos: Pos,
    text: &str,
    btn: Btn,
    action: Option<Action>,
    disabled: bool,
) -> u16 {
    let id = reserve(1);
    if let Some(action) = action {
        register(id, action);
    }
    let c = Control {
        btn,
        ..at(Kind::Button, id, pos)
    };
    make(
        h,
        w!("BUTTON"),
        text,
        c,
        if disabled { WS_DISABLED.0 } else { 0 },
    );
    id
}
unsafe fn click(
    h: HWND,
    pos: Pos,
    text: &str,
    btn: Btn,
    f: impl Fn(HWND) + Send + Sync + 'static,
) -> u16 {
    button(h, pos, text, btn, Some(act(f)), false)
}
/// A rounded input field; `key` keeps the text in `drafts` across re-renders.
#[allow(clippy::too_many_arguments)]
unsafe fn field(
    h: HWND,
    id: u16,
    pos: Pos,
    value: &str,
    cue: &str,
    key: Option<&str>,
    style: u32,
) -> HWND {
    let (x, y, width, height) = pos;
    surface(x, y, width, height, Surface::Field);
    let c = Control {
        field: true,
        ..at(
            Kind::Edit,
            id,
            (x + 14, y + (height - 22) / 2, width - 28, 22),
        )
    };
    let e = make(h, w!("EDIT"), value, c, ES_AUTOHSCROLL as u32 | style);
    if !cue.is_empty() {
        let cue = wide(cue);
        SendMessageW(
            e,
            EM_SETCUEBANNER,
            Some(WPARAM(1)),
            Some(LPARAM(cue.as_ptr() as isize)),
        );
    }
    if let Some(key) = key {
        ui().edit_keys.insert(id, key.into());
    }
    e
}
/// A captioned field (`.form-group`: 12.5px secondary label over the input); returns the bottom
/// edge.
#[allow(clippy::too_many_arguments)]
unsafe fn form(
    h: HWND,
    id: u16,
    x: i32,
    y: i32,
    width: i32,
    title: &str,
    value: &str,
    cue: &str,
    key: Option<&str>,
    style: u32,
) -> i32 {
    let y = para(h, x, y, width, title, look(Font::Small, Ink::Secondary)) + 6;
    field(h, id, (x, y, width, 36), value, cue, key, style);
    y + 36 + 12
}
unsafe fn check(h: HWND, id: u16, x: i32, y: i32, title: &str, value: bool) -> i32 {
    let width = width_of(title, Font::Normal) + 30;
    let c = at(Kind::Check, id, (x, y, width, 28));
    let handle = make(h, w!("BUTTON"), title, c, 0);
    SendMessageW(handle, BM_SETCHECK, Some(WPARAM(usize::from(value))), None);
    x + width
}
/// A settings row (`.set`): the checkbox with its name, the description under it in secondary
/// text, and a hairline below. Returns the bottom edge.
#[allow(clippy::too_many_arguments)]
unsafe fn toggle_row(
    h: HWND,
    x: i32,
    y: i32,
    width: i32,
    title: &str,
    desc: &str,
    value: bool,
    f: impl Fn(HWND, bool) + Send + Sync + 'static,
) -> i32 {
    let id = reserve(1);
    register(id, act(move |h| f(h, checked(h, id))));
    check(h, id, x, y + 9, title, value);
    let mut bottom = y + 9 + 28;
    if !desc.is_empty() {
        bottom = para(
            h,
            x + 22,
            bottom,
            width - 22,
            desc,
            look(Font::Small, Ink::Secondary),
        );
    }
    hairline(x, bottom + 9, width);
    bottom + 10
}
unsafe fn text(h: HWND, id: u16) -> String {
    let c = GetDlgItem(Some(h), id as i32).unwrap_or_default();
    let mut b = vec![0u16; (GetWindowTextLengthW(c).max(0) + 1) as usize];
    let n = GetWindowTextW(c, &mut b);
    String::from_utf16_lossy(&b[..n.max(0) as usize])
}
unsafe fn set_text(h: HWND, id: u16, value: &str) {
    if let Ok(control) = GetDlgItem(Some(h), id as i32) {
        if text(h, id) == value {
            return;
        }
        let value = wide(value);
        let _ = SetWindowTextW(control, PCWSTR(value.as_ptr()));
        let _ = InvalidateRect(Some(control), None, false);
    }
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
unsafe fn feedback(h: HWND, message: &str) {
    ui().feedback = message.into();
    set_text(h, 90, message);
}
/// Marks one button of a choice group as selected without re-rendering.
unsafe fn select(h: HWND, group: &[u16], chosen: u16) {
    let handles: Vec<isize> = {
        let mut s = ui();
        s.children
            .iter_mut()
            .filter(|c| group.contains(&c.id))
            .map(|c| {
                c.btn = match c.btn {
                    Btn::Pill(_) => Btn::Pill(c.id == chosen),
                    _ => Btn::Choice(c.id == chosen),
                };
                c.handle
            })
            .collect()
    };
    for handle in handles {
        let _ = InvalidateRect(Some(HWND(handle as *mut _)), None, false);
    }
}
/// A choice group; `f` receives the chosen index. Returns the bottom edge.
#[allow(clippy::too_many_arguments)]
unsafe fn choices(
    h: HWND,
    x: i32,
    y: i32,
    width: i32,
    columns: usize,
    height: i32,
    titles: &[String],
    selected: usize,
    f: impl Fn(HWND, usize) + Send + Sync + 'static,
) -> i32 {
    let first = reserve(titles.len() as u16);
    let group: Vec<u16> = (0..titles.len() as u16).map(|i| first + i).collect();
    let f = Arc::new(f);
    let gap = 10;
    let cell = (width - gap * (columns as i32 - 1)) / columns as i32;
    for (i, title) in titles.iter().enumerate() {
        let id = first + i as u16;
        let group = group.clone();
        let f = f.clone();
        register(
            id,
            act(move |h| {
                select(h, &group, id);
                f(h, i);
            }),
        );
        let c = Control {
            btn: Btn::Choice(i == selected),
            ..at(
                Kind::Button,
                id,
                (
                    x + (i % columns) as i32 * (cell + gap),
                    y + (i / columns) as i32 * (height + gap),
                    cell,
                    height,
                ),
            )
        };
        make(h, w!("BUTTON"), title, c, 0);
    }
    y + titles.len().div_ceil(columns) as i32 * (height + gap) - gap
}
/// An owner-drawn dropdown (`.dd`): `name` labels it for UI Automation through the caption
/// static created just before it (a drop-down list ignores its window text); `f` gets the chosen
/// index. `up` opens the list above the field. The control is 3px larger than the 36px field on
/// every side to leave room for the open ring. Returns the bottom edge of the field.
#[allow(clippy::too_many_arguments)]
unsafe fn dropdown(
    h: HWND,
    pos: (i32, i32, i32),
    name: &str,
    titles: &[String],
    selected: usize,
    up: bool,
    f: impl Fn(HWND, usize) + Send + Sync + 'static,
) -> i32 {
    let (x, y, width) = pos;
    let id = reserve(1);
    ui().combos.insert(id, Arc::new(f));
    let c = at(Kind::Combo, id, (x - 3, y - 3, width + 6, 42));
    let combo = make(h, w!("COMBOBOX"), name, c, 0);
    for title in titles {
        let value = wide(title);
        SendMessageW(
            combo,
            CB_ADDSTRING,
            None,
            Some(LPARAM(value.as_ptr() as isize)),
        );
    }
    SendMessageW(combo, CB_SETCURSEL, Some(WPARAM(selected)), None);
    let dpi = ui().dpi;
    // Item -1 is the face (about 42 tall with the frame, room for the ring); options are 34.
    SendMessageW(
        combo,
        CB_SETITEMHEIGHT,
        Some(WPARAM(usize::MAX)),
        Some(LPARAM(scale(FACE, dpi) as isize)),
    );
    SendMessageW(
        combo,
        CB_SETITEMHEIGHT,
        Some(WPARAM(0)),
        Some(LPARAM(scale(34, dpi) as isize)),
    );
    if up {
        let _ = SetWindowLongPtrW(combo, GWLP_USERDATA, 1);
    }
    subclass(combo, &COMBO_PROC, combo_proc);
    y + 36
}
/// Height of a dropdown's selection field, in 96-DPI units.
const FACE: i32 = 36;
/// Replaces a control's window procedure, keeping the class procedure for `CallWindowProcW`.
unsafe fn subclass(
    handle: HWND,
    slot: &std::sync::atomic::AtomicIsize,
    f: unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT,
) {
    let old = SetWindowLongPtrW(handle, GWLP_WNDPROC, f as usize as isize);
    if old != 0 {
        slot.store(old, std::sync::atomic::Ordering::Relaxed);
    }
}
unsafe fn call_old(
    slot: &std::sync::atomic::AtomicIsize,
    h: HWND,
    message: u32,
    w: WPARAM,
    l: LPARAM,
) -> LRESULT {
    let old = slot.load(std::sync::atomic::Ordering::Relaxed);
    // SAFETY: `old` is the class window procedure returned by SetWindowLongPtrW.
    let old: WNDPROC = std::mem::transmute::<isize, WNDPROC>(old);
    CallWindowProcW(old, h, message, w, l)
}
/// Paints a dropdown face: the window background behind it, then field, text and chevron.
unsafe fn paint_combo(combo: HWND) {
    let mut paint = PAINTSTRUCT::default();
    let dc = BeginPaint(combo, &mut paint);
    if let (Some(control), Ok(parent)) = (find(combo), GetParent(combo)) {
        let root = client(parent);
        let (dark, dpi, scroll, fonts, surfaces, open, focus) = {
            let s = ui();
            (
                s.dark,
                s.dpi,
                s.scroll,
                s.fonts,
                s.surfaces.clone(),
                s.combo_open,
                s.combo_focus,
            )
        };
        let (x, y, _, _) = place(&control, root, dpi, scroll);
        let saved = SaveDC(dc);
        let _ = SetViewportOrgEx(dc, -x, -y, None);
        appearance::background(dc, root, dark, dpi, &surfaces, scroll);
        let _ = RestoreDC(dc, saved);
        let face = client(combo);
        let disabled = GetWindowLongW(combo, GWL_STYLE) as u32 & WS_DISABLED.0 != 0;
        appearance::combo_face(
            dc,
            face,
            dark,
            &fonts,
            dpi,
            &combo_text(combo, -1),
            open == control.id,
            focus == control.id,
            disabled,
        );
    }
    let _ = EndPaint(combo, &paint);
}
/// Dropdowns paint their own face (no themed frame or arrow button); the list of an upward
/// dropdown is moved above the field when it opens.
unsafe extern "system" fn combo_proc(h: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match message {
        WM_PAINT => {
            paint_combo(h);
            return LRESULT(0);
        }
        WM_ERASEBKGND => return LRESULT(1),
        _ => {}
    }
    let result = call_old(&COMBO_PROC, h, message, w, l);
    if message == WM_CTLCOLORLISTBOX && GetWindowLongPtrW(h, GWLP_USERDATA) == 1 {
        let list = HWND(l.0 as *mut _);
        let mut field = RECT::default();
        let mut popup = RECT::default();
        if GetWindowRect(h, &mut field).is_ok()
            && GetWindowRect(list, &mut popup).is_ok()
            && popup.top >= field.bottom - 4
        {
            let height = popup.bottom - popup.top;
            let _ = SetWindowPos(
                list,
                None,
                popup.left,
                field.top - height - 2,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }
    result
}
/// Hover on the day/night switch: the first mouse move leans the sun 0.187em inwards and starts
/// a 50 ms check that stops when the cursor leaves (no TrackMouseEvent without
/// Win32_UI_Input_KeyboardAndMouse).
unsafe extern "system" fn toggle_proc(h: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    if message == WM_MOUSEMOVE {
        let start = {
            let mut s = ui();
            let start = !s.toggle.hover;
            s.toggle.hover = true;
            start
        };
        if start && let Ok(parent) = GetParent(h) {
            SetTimer(Some(parent), HOVER_TIMER, 50, None);
            animate_toggle(parent);
        }
    }
    call_old(&BUTTON_PROC, h, message, w, l)
}
/// Ends hover once the cursor is no longer over the switch.
unsafe fn check_hover(h: HWND) {
    let mut point = POINT::default();
    let over = GetCursorPos(&mut point).is_ok()
        && GetDlgItem(Some(h), 901).is_ok_and(|toggle| WindowFromPoint(point) == toggle);
    if !over {
        let _ = KillTimer(Some(h), HOVER_TIMER);
        ui().toggle.hover = false;
        animate_toggle(h);
    }
}
/// A section heading (`.sec-title`): 13px semibold title over a 1.5px ink rule; rows below it
/// are split by hairlines. `note` is right-aligned secondary text in the heading row. Returns
/// where the first row starts.
unsafe fn heading(h: HWND, x: i32, y: i32, width: i32, title: &str, note: &str) -> i32 {
    label(
        h,
        0,
        (x, y + 6, width, 22),
        title,
        single(Font::Section, Ink::Text),
    );
    if !note.is_empty() {
        label(
            h,
            0,
            (x + width - 200, y + 8, 200, 20),
            note,
            Look {
                align: 2,
                ..single(Font::Small, Ink::Secondary)
            },
        );
    }
    surface(x, y + 34, width, 2, Surface::Ink);
    y + 36
}
/// A 1px hairline under a row ending at `y`.
fn hairline(x: i32, y: i32, width: i32) {
    surface(x, y, width, 1, Surface::Rule);
}
/// `.form-heading`: a 12.5px semibold secondary caption 16px below the rows above it.
unsafe fn form_heading(h: HWND, x: i32, y: i32, width: i32, title: &str) -> i32 {
    label(
        h,
        0,
        (x, y + 16, width, 20),
        title,
        single(Font::Strong, Ink::Secondary),
    );
    y + 16 + 20 + 8
}
/// An undrawn label at `pos`; UI Automation names the next control after it.
unsafe fn anchor_at(h: HWND, pos: Pos, name: &str) {
    label(
        h,
        0,
        pos,
        name,
        Look {
            shape: Shape::Hidden,
            ..Default::default()
        },
    );
}
/// Replaces the page's tooltip window with one that names each control in `tips`. Mouse
/// messages reach it through `TTM_RELAYEVENT` in the message loop, so the controls are not
/// subclassed a second time.
unsafe fn tooltips(h: HWND, tips: &[(HWND, &str)]) {
    drop_tooltips();
    let Ok(window) = CreateWindowExW(
        WS_EX_TOPMOST,
        TOOLTIPS_CLASSW,
        PCWSTR::null(),
        WINDOW_STYLE(WS_POPUP.0 | TTS_ALWAYSTIP | TTS_NOPREFIX),
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        Some(h),
        None,
        None,
        None,
    ) else {
        return;
    };
    ui().tips = window.0 as isize;
    for (control, text) in tips {
        let mut text = wide(text);
        // The size without `lpReserved` is accepted by both comctl32 5.x and 6.x.
        let tool = TTTOOLINFOW {
            cbSize: std::mem::offset_of!(TTTOOLINFOW, lpReserved) as u32,
            uFlags: TTF_IDISHWND,
            hwnd: h,
            uId: control.0 as usize,
            lpszText: PWSTR(text.as_mut_ptr()),
            ..Default::default()
        };
        SendMessageW(
            window,
            TTM_ADDTOOLW,
            None,
            Some(LPARAM((&tool as *const TTTOOLINFOW) as isize)),
        );
    }
}
unsafe fn drop_tooltips() {
    let old = std::mem::take(&mut ui().tips);
    if old != 0 {
        let _ = DestroyWindow(HWND(old as *mut _));
    }
}
/// Keeps a UI Automation name visible on screen without drawing anything.
unsafe fn anchor(h: HWND, y: i32, name: &str) {
    label(
        h,
        0,
        (0, y, CW, 4),
        name,
        Look {
            shape: Shape::Hidden,
            ..Default::default()
        },
    );
}
/// CI diagnostics: GUI-subsystem processes have no console, so panics and startup
/// checkpoints go to a trace file when NETMATE_UI_TRACE is set.
fn trace_file() -> Option<std::path::PathBuf> {
    std::env::var_os("NETMATE_UI_TRACE")?;
    Some(std::env::temp_dir().join("netmate-ui-trace.log"))
}

fn trace(stage: &str) {
    use std::io::Write;
    if let Some(path) = trace_file() {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(file, "{stage}");
        }
    }
}

pub fn run() {
    unsafe {
        if let Ok(existing) = FindWindowW(w!("NetMateNativeUi"), None) {
            let _ = ShowWindow(existing, SW_RESTORE);
            let _ = SetForegroundWindow(existing);
            return;
        }
        if trace_file().is_some() {
            std::panic::set_hook(Box::new(|info| trace(&format!("panic: {info}"))));
        }
        trace("run: enter");
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        InitCommonControls();
        let (tx, rx) = client::start();
        trace("run: client started");
        let dark = crate::theme::saved_dark().unwrap_or_else(|| appearance::system_dark());
        UI.set(Mutex::new(Ui {
            tx,
            config: Value::Null,
            state: Value::Null,
            page: HOME,
            rendered: 0,
            children: vec![],
            surfaces: vec![],
            actions: HashMap::new(),
            next_id: FIRST_ACTION,
            dark,
            dpi: 96,
            scroll: 0,
            wheel_rest: 0,
            layout_scale: 1.0,
            fonts: [0; appearance::FONT_COUNT],
            ground_brush: 0,
            input_brush: 0,
            rows: vec![],
            query: LogQuery::default(),
            cursors: vec![],
            next: None,
            log_generation: 0,
            detail: Value::Null,
            edit: Value::Null,
            drafts: HashMap::new(),
            edit_keys: HashMap::new(),
            sizing: false,
            edits: vec![],
            saving: false,
            clear_on_save: vec![],
            scan: Value::Null,
            scanning: false,
            update: json!({}),
            poll_update: false,
            feedback: String::new(),
            home_signature: String::new(),
            countdowns: vec![],
            bias: appearance::time_bias(),
            ready: false,
            toggle: appearance::Toggle::new(dark),
            tips: 0,
            combos: HashMap::new(),
            combo_open: 0,
            combo_focus: 0,
        }))
        .ok();
        refresh_brushes();
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
            scale(1140, system_dpi)
                .min(GetSystemMetrics(SM_CXSCREEN) - scale(32, system_dpi))
                .max(1),
            scale(820, system_dpi)
                .min(GetSystemMetrics(SM_CYSCREEN) - scale(64, system_dpi))
                .max(1),
            None,
            None,
            Some(instance.into()),
            None,
        )
        .unwrap();
        trace("run: window created");
        delete_fonts(refresh_fonts(h));
        appearance::titlebar(h, dark);
        render(h);
        send(Command::Config);
        trace("run: home rendered");
        // Countdown pills tick once a second while the status page is open.
        SetTimer(Some(h), 1, 1000, None);
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
        trace("run: message loop");
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            if (WM_MOUSEFIRST..=WM_MOUSELAST).contains(&message.message) {
                let tips = ui().tips;
                if tips != 0 {
                    SendMessageW(
                        HWND(tips as *mut _),
                        TTM_RELAYEVENT,
                        None,
                        Some(LPARAM((&message as *const MSG) as isize)),
                    );
                }
            }
            if !IsDialogMessageW(h, &message).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }
}
unsafe fn refresh_brushes() {
    let mut s = ui();
    let p = Palette::new(s.dark);
    let old = [s.ground_brush, s.input_brush];
    s.ground_brush = CreateSolidBrush(p.ground).0 as isize;
    s.input_brush = CreateSolidBrush(p.field).0 as isize;
    for brush in old.into_iter().filter(|b| *b != 0) {
        let _ = DeleteObject(HGDIOBJ(brush as *mut _));
    }
}
/// Swaps in fonts for the window DPI and returns the previous handles. Callers delete
/// them with `delete_fonts` only after every child that used them has been recreated.
unsafe fn refresh_fonts(h: HWND) -> Vec<isize> {
    let dpi = GetDpiForWindow(h).max(96);
    let mut s = ui();
    let old = s.fonts.to_vec();
    s.dpi = dpi;
    for (slot, (size, weight, face)) in s.fonts.iter_mut().zip(appearance::FONTS) {
        *slot = appearance::font(size, weight, dpi, face).0 as isize;
    }
    old
}
unsafe fn delete_fonts(old: Vec<isize>) {
    for font in old.into_iter().filter(|f| *f != 0) {
        let _ = DeleteObject(HGDIOBJ(font as *mut _));
    }
}
/// Moves every child to its place for the current size and scroll offset.
unsafe fn position_children(h: HWND) {
    layout_children(h, false)
}
/// `scrolled` means only the offset changed: the rail and its fixed controls stay where
/// they are, so they are neither moved nor repainted.
unsafe fn layout_children(h: HWND, scrolled: bool) {
    let rect = client(h);
    let (controls, dpi, scroll, max) = {
        let mut s = ui();
        let height = rect.bottom * 96 / s.dpi as i32;
        let max = s
            .children
            .iter()
            .filter(|c| !c.fixed)
            .map(|c| c.y + c.height)
            .chain(s.surfaces.iter().map(|(r, _)| r.bottom))
            .max()
            .unwrap_or(0)
            + TOP
            + 40;
        s.scroll = s.scroll.clamp(0, (max - height).max(0));
        (s.children.clone(), s.dpi, s.scroll, max)
    };
    let _ = SendMessageW(h, WM_SETREDRAW, Some(WPARAM(0)), None);
    let moving: Vec<&Control> = controls.iter().filter(|c| !(scrolled && c.fixed)).collect();
    // One batched move instead of one SetWindowPos per child.
    let mut batch = BeginDeferWindowPos(moving.len() as i32).ok();
    for c in &moving {
        let (x, y, width, height) = place(c, rect, dpi, scroll);
        let target = HWND(c.handle as *mut _);
        let flags = SWP_NOZORDER | SWP_NOACTIVATE;
        batch = match batch {
            Some(pending) => DeferWindowPos(pending, target, None, x, y, width, height, flags).ok(),
            None => {
                let _ = SetWindowPos(target, None, x, y, width, height, flags);
                None
            }
        };
    }
    if let Some(pending) = batch {
        let _ = EndDeferWindowPos(pending);
    }
    let _ = SendMessageW(h, WM_SETREDRAW, Some(WPARAM(1)), None);
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
    // Scrolling repaints the content only; the rail (and its software-drawn toggle) is unchanged.
    let content = RECT {
        left: if scrolled {
            scale(appearance::RAIL, dpi)
        } else {
            0
        },
        ..rect
    };
    let _ = RedrawWindow(
        Some(h),
        Some(&content),
        None,
        RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN,
    );
}
fn page_group(page: u16) -> u16 {
    match page {
        ACCOUNT | WIFI => SETTINGS,
        DETAIL => LOGS,
        other => other,
    }
}
/// Rebuilds the sidebar and the current page; drafts keep typed text across rebuilds.
unsafe fn render(h: HWND) {
    let rect = client(h);
    let (page, old) = {
        let mut s = ui();
        s.surfaces.clear();
        s.actions.clear();
        s.edit_keys.clear();
        s.countdowns.clear();
        s.combos.clear();
        s.combo_open = 0;
        s.combo_focus = 0;
        s.next_id = FIRST_ACTION;
        s.layout_scale = appearance::content_scale(rect.right, s.dpi);
        if s.rendered != s.page {
            s.scroll = 0;
        }
        s.rendered = s.page;
        (s.page, std::mem::take(&mut s.children))
    };
    let _ = SendMessageW(h, WM_SETREDRAW, Some(WPARAM(0)), None);
    for c in old {
        let _ = DestroyWindow(HWND(c.handle as *mut _));
    }
    // After the tools are gone, so the tooltip never unhooks a live control.
    drop_tooltips();
    let _ = SendMessageW(h, WM_SETREDRAW, Some(WPARAM(1)), None);
    chrome(h, page);
    match page {
        HOME => home_page(h),
        SETTINGS => settings_page(h),
        LOGS => logs_page(h),
        DETAIL => detail_page(h),
        ACCOUNT => account_editor(h),
        WIFI => wifi_editor(h),
        _ => about_page(h),
    }
    let signature = home_signature();
    ui().home_signature = signature;
    tick(h);
    position_children(h);
}
unsafe fn fixed(h: HWND, class: PCWSTR, text: &str, mut c: Control, style: u32) -> HWND {
    c.fixed = true;
    make(h, class, text, c, style)
}
unsafe fn chrome(h: HWND, page: u16) {
    let (dark, feedback) = {
        let s = ui();
        (s.dark, s.feedback.clone())
    };
    // `.rail`: padding 26/14; the brand card, a hairline 22px below it, then 42px items 4px apart.
    let brand = Control {
        look: Look {
            shape: Shape::Brand,
            ..single(Font::Brand, Ink::Text)
        },
        ..at(Kind::Static, 900, (24, 26, 156, 40))
    };
    fixed(h, w!("STATIC"), "NetMate", brand, 0);
    for (index, (id, title)) in [
        (1, "运行状态"),
        (5, "配置设置"),
        (4, "运行日志"),
        (6, "关于"),
    ]
    .into_iter()
    .enumerate()
    {
        let c = Control {
            btn: Btn::Nav,
            ..at(Kind::Button, id, (14, 106 + index as i32 * 46, 166, 42))
        };
        fixed(h, w!("BUTTON"), title, c, 0);
    }
    // The pen's 90×40 switch (5.625em × 2.5em at 16px) in the 96×46 box of linux.rs, centered in
    // the 194px rail under the `.rail-foot` hairline.
    let (box_width, box_height) = appearance::TOGGLE_BOX;
    let toggle = Control {
        btn: Btn::Toggle,
        ..at(
            Kind::Button,
            901,
            ((194 - box_width) / 2, 0, box_width, box_height),
        )
    };
    let switch = fixed(
        h,
        w!("BUTTON"),
        if dark {
            "切换至白天模式"
        } else {
            "切换至黑夜模式"
        },
        toggle,
        0,
    );
    subclass(switch, &BUTTON_PROC, toggle_proc);
    let caption = Control {
        look: Look {
            align: 1,
            ..single(Font::Tiny, Ink::Rail)
        },
        ..at(Kind::Static, 903, (14, 0, 166, 18))
    };
    fixed(h, w!("STATIC"), "白天 / 黑夜", caption, 0);
    let title = match page_group(page) {
        HOME => "运行状态",
        SETTINGS => "配置设置",
        LOGS => "运行日志",
        _ => "关于",
    };
    label(
        h,
        902,
        (0, -68, 420, 40),
        title,
        single(Font::Title, Ink::Text),
    );
    if page_group(page) == SETTINGS {
        // `.page-subtitle` beside the title, as in linux.rs.
        label(
            h,
            0,
            (width_of(title, Font::Title) + 14, -60, 260, 24),
            "修改后立即保存并生效",
            single(Font::Small, Ink::Secondary),
        );
    }
    label(
        h,
        90,
        (CW - 400, -60, 400, 24),
        &feedback,
        Look {
            align: 2,
            ..single(Font::Small, Ink::Secondary)
        },
    );
}
fn home_signature() -> String {
    let s = ui();
    let mut v = s.state.clone();
    if let Some(map) = v.as_object_mut() {
        for key in ["sequence", "logRevision", "notification", "revision"] {
            map.remove(key);
        }
        for key in ["nextHeartbeatAt", "nextRetryAt"] {
            let present = !map.get(key).is_none_or(Value::is_null);
            map.insert(key.into(), present.into());
        }
    }
    json!([v, s.config["revision"], s.config.is_null()]).to_string()
}
/// Re-renders the status page only when a field it shows changed.
unsafe fn refresh_home(h: HWND) {
    if ui().page != HOME {
        return;
    }
    let current = home_signature();
    if ui().home_signature != current {
        render(h);
    }
}
unsafe fn tick(h: HWND) {
    let (countdowns, state) = {
        let s = ui();
        (s.countdowns.clone(), s.state.clone())
    };
    for (id, heartbeat) in countdowns {
        let value = if heartbeat {
            remaining(&state["nextHeartbeatAt"])
                .filter(|s| *s > 0)
                .map(|s| format!("{s}s 后检测"))
        } else {
            remaining(&state["nextRetryAt"]).map(|s| format!("剩余 {s} 秒后重试"))
        };
        set_text(h, id, &value.unwrap_or_default());
    }
}
unsafe fn go(h: HWND, page: u16) {
    ui().page = page;
    render(h);
}
/// `.banner`: a gold outline with the paused message and the resume action.
unsafe fn pause_banner(h: HWND, y: i32, config: &Value) -> i32 {
    if config["settings"]["autoAuthPaused"] != true {
        return y;
    }
    surface(0, y, CW, 50, Surface::Banner);
    label(
        h,
        0,
        (14, y + 14, CW - 200, 22),
        "自动认证已暂停",
        single(Font::Strong, Ink::GoldText),
    );
    let width = width_of("恢复自动认证", Font::Medium) + 30;
    click(
        h,
        (CW - 8 - width, y + 8, width, 34),
        "恢复自动认证",
        Btn::Primary,
        |_| mutate(|c| c["settings"]["autoAuthPaused"] = json!(false)),
    );
    y + 50 + 22
}
/// `.loading-card`: the spinner and the two lines under it, without a card container.
unsafe fn loading(h: HWND, y: i32) -> i32 {
    label(
        h,
        0,
        (CW / 2 - 32, y + 48, 64, 64),
        "",
        Look {
            shape: Shape::Glyph(4, Ink::Text),
            ..Default::default()
        },
    );
    let top = para(
        h,
        32,
        y + 48 + 64 + 16,
        CW - 64,
        "正在检测 WiFi 连接...",
        centered(Font::Notice, Ink::Text),
    ) + 6;
    para(
        h,
        32,
        top,
        CW - 64,
        "请稍候，正在检查网络连接状态",
        centered(Font::Normal, Ink::Secondary),
    ) + 48
}
/// WifiReconnectFailedCard (`本轮尝试`): per-network reasons once every WiFi has failed.
/// Returns the bottom edge, or `y` when there is nothing to show.
unsafe fn failures(h: HWND, x: i32, y: i32, width: i32, snapshot: &Value) -> i32 {
    let list = snapshot["failures"].as_array().cloned().unwrap_or_default();
    if list.is_empty() || !matches!(snapshot["phase"].as_str(), Some("failed" | "cooldown")) {
        return y;
    }
    let mut top = heading(h, x, y, width, "本轮尝试", "");
    for failure in list {
        let name = label(
            h,
            0,
            (x, top + 10, width, 22),
            failure["ssid"].as_str().unwrap_or(""),
            single(Font::Strong, Ink::Text),
        );
        top = para(
            h,
            x,
            name + 2,
            width,
            failure["reason"].as_str().unwrap_or(""),
            look(Font::Small, Ink::Secondary),
        ) + 10;
        hairline(x, top, width);
        top += 1;
    }
    top
}
/// Signal, speed, band, internet and heartbeat under one ink rule (`.metrics`), split by
/// hairlines; the heartbeat countdown is the only control `tick` updates.
unsafe fn strip(h: HWND, y: i32, snapshot: &Value, config: &Value) -> i32 {
    let n = network(snapshot);
    surface(0, y, CW, 2, Surface::Ink);
    let (signal, grade, signal_ink) = match n.rssi {
        Some(rssi) => {
            let percent = ((rssi + 100) * 100 / 60).clamp(0, 100);
            let (grade, ink) = signal_grade(percent);
            (format!("{percent}%"), grade, ink)
        }
        None => ("未知".into(), "", Ink::Text),
    };
    let (speed, speed_grade_text, speed_ink) = match n.link_speed.filter(|s| *s > 0) {
        Some(speed) => {
            let (grade, ink) = speed_grade(speed);
            (format!("{speed} Mbps"), grade, ink)
        }
        None => ("未知".into(), "", Ink::Text),
    };
    let band = match n.frequency.unwrap_or(0) {
        5925.. => "6GHz",
        4900..=5924 => "5GHz",
        2400..=2500 => "2.4GHz",
        _ => "未知",
    };
    let online = snapshot["internetReachable"] == true;
    let enabled = config["settings"]["enableHeartbeat"] == true;
    let interval = config["settings"]["heartbeatIntervalSeconds"]
        .as_u64()
        .unwrap_or(30);
    let heartbeat = if enabled {
        format!("心跳检测 · 每 {interval} 秒")
    } else {
        "心跳检测".into()
    };
    let (status, status_ink) = if !enabled {
        ("已关闭", Ink::Secondary)
    } else if online {
        ("正常", Ink::Ok)
    } else {
        ("异常", Ink::Bad)
    };
    // Only the grade word carries the colour; the number stays in ink.
    let cells: [(&str, String, Ink, &str, Ink); 5] = [
        ("信号强度", signal, Ink::Text, grade, signal_ink),
        ("连接速度", speed, Ink::Text, speed_grade_text, speed_ink),
        ("频段", band.into(), Ink::Text, "", Ink::Text),
        (
            "互联网",
            if online { "可达" } else { "不可达" }.into(),
            if online { Ink::Ok } else { Ink::Bad },
            "",
            Ink::Text,
        ),
        (heartbeat.as_str(), status.into(), status_ink, "", Ink::Text),
    ];
    let width = CW / 5;
    for (i, (title, value, ink, grade, grade_ink)) in cells.iter().enumerate() {
        let mut x = i as i32 * width;
        if i > 0 {
            surface(x, y + 2, 1, 54, Surface::Rule);
            x += 16;
        }
        let inner = (i as i32 + 1) * width - x - 8;
        label(
            h,
            0,
            (x, y + 11, inner, 18),
            title,
            single(Font::Tiny, Ink::Secondary),
        );
        let value_width = (width_of(value, Font::Metric) + 4).min(inner);
        label(
            h,
            0,
            (x, y + 30, value_width, 26),
            value,
            single(Font::Metric, *ink),
        );
        let rest = (x + value_width + 6, y + 34, inner - value_width - 6, 20);
        if i == 4 && enabled {
            let countdown = reserve(1);
            label(h, countdown, rest, "", single(Font::Mono, Ink::Secondary));
            ui().countdowns.push((countdown, true));
        } else if !grade.is_empty() {
            label(h, 0, rest, grade, single(Font::Tiny, *grade_ink));
        }
    }
    y + 56 + 22
}
/// Column width for the two home and settings columns (`.home-cols`, spacing 32).
const COL: i32 = (CW - 32) / 2;
/// 网络详情: key/value rows with right-aligned values, then the heartbeat notes.
unsafe fn details(h: HWND, x: i32, y: i32, width: i32, snapshot: &Value, config: &Value) -> i32 {
    let n = network(snapshot);
    let mut top = heading(h, x, y, width, "网络详情", "");
    click(
        h,
        (x + width - 28, y + 3, 28, 28),
        "刷新",
        Btn::Refresh,
        |_| {
            send(Command::Snapshot);
        },
    );
    let unknown = |v: &Option<String>| v.clone().unwrap_or_else(|| "未知".into());
    let rows = [
        ("WiFi 名称", unknown(&n.ssid), false),
        ("IPv4 地址", unknown(&n.ipv4), true),
        ("IPv6 地址", unknown(&n.ipv6), true),
        ("BSSID", unknown(&n.bssid), true),
        (
            "WiFi 信道",
            n.channel
                .map(|c| c.to_string())
                .unwrap_or_else(|| "未知".into()),
            true,
        ),
        ("安全类型", unknown(&n.security), false),
    ];
    for (key, value, mono) in rows {
        label(
            h,
            0,
            (x, top + 11, 100, 20),
            key,
            single(Font::Normal, Ink::Secondary),
        );
        label(
            h,
            0,
            (x + 104, top + 11, width - 104, 20),
            &value,
            Look {
                align: 2,
                ..single(if mono { Font::Mono } else { Font::Medium }, Ink::Text)
            },
        );
        top += 42;
        hairline(x, top - 1, width);
    }
    if config["settings"]["enableHeartbeat"] != true {
        return top;
    }
    let mut notes = vec![];
    if let Some(message) = snapshot["message"].as_str().filter(|m| !m.is_empty()) {
        notes.push(message.to_string());
    }
    if snapshot["monitorDegraded"] == true {
        notes.push("系统网络事件监听不可用，已改为定时检测".into());
    }
    if !notes.is_empty() {
        top = para(
            h,
            x,
            top + 10,
            width,
            &notes.join("\n"),
            look(Font::Small, Ink::Secondary),
        ) + 10;
        hairline(x, top, width);
        top += 1;
    }
    top
}
/// The left column while no WiFi is connected and heartbeat is enabled.
unsafe fn heartbeat_paused(h: HWND, x: i32, y: i32, width: i32) -> i32 {
    let top = heading(h, x, y, width, "心跳检测 (已暂停)", "");
    let top = para(
        h,
        x,
        top + 10,
        width,
        "当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。",
        look(Font::Small, Ink::Secondary),
    ) + 10;
    hairline(x, top, width);
    top + 1
}
/// WifiSwitcherCard: configured networks by priority in fixed columns so badges and actions
/// line up: rank (44) | name and subtitle | badge (92) | action (70).
unsafe fn switcher(
    h: HWND,
    x: i32,
    y: i32,
    width: i32,
    snapshot: &Value,
    list: &[WifiRule],
    current: Option<&WifiRule>,
) -> i32 {
    let switching = matches!(
        snapshot["phase"].as_str(),
        Some("connecting" | "authenticating" | "verifying")
    );
    let mut row = heading(h, x, y, width, "切换 WiFi", "按优先级排序");
    let height = 60;
    let action_x = x + width - 70;
    let badge_x = action_x - 12 - 92;
    let name_x = x + 44 + 12;
    let name_width = badge_x - 12 - name_x;
    for wifi in list {
        let is_current = current.is_some_and(|r| r.id == wifi.id);
        label(
            h,
            0,
            (x, row + 15, 44, 30),
            &format!("{:02}", wifi.priority),
            single(Font::Rank, if is_current { Ink::Gold } else { Ink::Faint }),
        );
        label(
            h,
            0,
            (name_x, row + 10, name_width, 22),
            &wifi.ssid,
            single(Font::Strong, Ink::Text),
        );
        let mut sub = vec![format!("优先级 {}", wifi.priority)];
        sub.extend(wifi.security.clone());
        sub.extend(wifi.bssid.clone());
        label(
            h,
            0,
            (name_x, row + 32, name_width, 18),
            &sub.join(" · "),
            single(Font::Small, Ink::Secondary),
        );
        let (tag, kind) = if wifi.requires_auth {
            ("校园网认证", Badge::Auth)
        } else {
            ("普通热点", Badge::Neutral)
        };
        let tag_width = (width_of(tag, Font::Tiny) + 16).min(92);
        label(
            h,
            0,
            (badge_x, row + 20, tag_width, 20),
            tag,
            Look {
                font: Font::Tiny,
                badge: Some(kind),
                ..Default::default()
            },
        );
        if is_current {
            label(
                h,
                0,
                (action_x + 18, row + 23, 14, 14),
                "",
                Look {
                    shape: Shape::Icon(10, Ink::Ok),
                    ..Default::default()
                },
            );
            label(
                h,
                0,
                (action_x + 36, row + 19, 34, 22),
                "当前",
                single(Font::Strong, Ink::Ok),
            );
        } else {
            let target = wifi.id.clone();
            button(
                h,
                (action_x + 70 - 56, row + 16, 56, 28),
                &wifi.ssid,
                Btn::Switch,
                Some(act(move |_| {
                    send(Command::Connect { id: target.clone() });
                })),
                switching,
            );
        }
        row += height;
        hairline(x, row - 1, width);
    }
    row
}
/// 网络详情 or the paused heartbeat beside 切换 WiFi; a column with nothing to show gives the
/// other one the full width, as the homogeneous GTK box does.
unsafe fn columns(
    h: HWND,
    y: i32,
    snapshot: &Value,
    config: &Value,
    wifi: bool,
    current: Option<&WifiRule>,
) {
    let mut list = rules(config);
    list.sort_by_key(|w| w.priority);
    let failed = snapshot["failures"]
        .as_array()
        .is_some_and(|f| !f.is_empty())
        && matches!(snapshot["phase"].as_str(), Some("failed" | "cooldown"));
    let heartbeat = config["settings"]["enableHeartbeat"] == true;
    let left = failed || wifi || heartbeat;
    let right = !list.is_empty();
    let (left_width, right_x, right_width) = match (left, right) {
        (true, true) => (COL, COL + 32, COL),
        (true, false) => (CW, 0, 0),
        _ => (0, 0, CW),
    };
    if left {
        let mut top = failures(h, 0, y, left_width, snapshot);
        if top > y {
            top += 24;
        }
        if wifi {
            details(h, 0, top, left_width, snapshot, config);
        } else if heartbeat {
            heartbeat_paused(h, 0, top, left_width);
        }
    }
    if right {
        switcher(h, right_x, y, right_width, snapshot, &list, current);
    }
}
/// "2023101234" → "2023 1012 34", printed like the number on a campus card.
fn card_number(username: &str) -> String {
    let chars: Vec<char> = username.chars().collect();
    chars
        .chunks(4)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join(" ")
}
/// Copy for the home account card and the column beside it (`Face` in linux.rs); a running or
/// finished recovery replaces the status, copy, meta and actions in `account_card`.
struct Face {
    /// Lamp: 0 idle, 1 ok, 2 warn, 3 bad.
    tone: u8,
    /// An empty dashed outline instead of a card face: no WiFi, no rule or no account.
    void: bool,
    /// Cards stacked behind the front one (0–2).
    backs: usize,
    issuer: &'static str,
    place: String,
    status: String,
    headline: String,
    body: String,
    meta: Vec<(&'static str, String)>,
    notes: Vec<(String, Badge)>,
    action: Option<(&'static str, Btn, Option<Action>)>,
}
/// Offsets of tags laid out left to right and wrapped at `width`; returns them and the height.
fn flow(widths: &[i32], width: i32, gap: i32, height: i32) -> (Vec<(i32, i32)>, i32) {
    let (mut x, mut y) = (0, 0);
    let mut spots = vec![];
    for &w in widths {
        if x > 0 && x + w > width {
            x = 0;
            y += height + gap;
        }
        spots.push((x, y));
        x += w + gap;
    }
    (spots, if widths.is_empty() { 0 } else { y + height })
}
/// Size of the card deck (the face plus room for two cards behind it) and the gap to the side.
const DECK: (i32, i32) = (456, 298);
const DECK_GAP: i32 = 40;
/// The top of the home page: the account card deck on the left, headline, copy, notes and
/// actions beside it. The magnetic stripe at the card's foot is the retry progress. Returns
/// where the next block starts.
unsafe fn account_card(
    h: HWND,
    y: i32,
    mut view: Face,
    number: Option<String>,
    snapshot: &Value,
    config: &Value,
) -> i32 {
    let phase = snapshot["phase"].as_str().unwrap_or("");
    let recovering = match phase {
        "connecting" => Some(("正在连接", false)),
        "authenticating" => Some(("正在认证", false)),
        "verifying" => Some(("正在确认联网", false)),
        "cooldown" => Some(("等待下一轮重连", true)),
        "failed" => Some(("连接失败", true)),
        "cancelled" => Some(("已取消", true)),
        _ => None,
    };
    let mut actions: Vec<(&'static str, Btn, Option<Action>)> = vec![];
    let mut progress = None;
    let mut countdown = false;
    if let Some((status, failed)) = recovering {
        let target = snapshot["targetId"].as_str().and_then(|id| {
            config["wifiRules"]
                .as_array()?
                .iter()
                .find(|w| w["id"] == id)
                .and_then(|w| w["ssid"].as_str().map(str::to_owned))
        });
        let ssid = target
            .or_else(|| snapshot["network"]["ssid"].as_str().map(str::to_owned))
            .unwrap_or_default();
        let all_failed = failed
            && snapshot["failures"]
                .as_array()
                .is_some_and(|f| !f.is_empty());
        view.void = false;
        view.tone = if failed { 3 } else { 2 };
        view.status = status.into();
        view.headline = if all_failed {
            "所有 WiFi 连接失败"
        } else {
            "WiFi 自动重连"
        }
        .into();
        let mut body = vec![];
        if !ssid.is_empty() {
            body.push(format!("目标 WiFi：{ssid}"));
        }
        if let Some(message) = snapshot["message"].as_str().filter(|m| !m.is_empty()) {
            body.push(message.to_string());
        }
        view.body = body.join("\n");
        view.meta.clear();
        if !ssid.is_empty() {
            view.place = ssid.clone();
            view.meta.push(("目标 WiFi", ssid));
        }
        let attempt = snapshot["attempt"].as_u64().unwrap_or(0);
        let max = snapshot["maxAttempts"].as_u64().unwrap_or(0);
        if max > 0 {
            view.meta.push(("尝试", format!("第 {attempt} / {max} 次")));
            progress = Some((attempt.min(max) * 1000 / max) as u16);
        }
        view.notes.clear();
        countdown = true;
        if failed {
            actions.push((
                "立即重试",
                Btn::Primary,
                Some(act(|_| {
                    send(Command::Retry);
                })),
            ));
        }
        if phase != "failed" && phase != "cancelled" {
            actions.push((
                "停止恢复",
                Btn::Normal,
                Some(act(|_| {
                    send(Command::StopRecovery);
                })),
            ));
        }
        // The home action stays reachable; while connecting it would only repeat the title.
        if failed {
            actions.extend(view.action.take());
        }
    } else {
        actions.extend(view.action.take());
    }
    // The deck: cards behind the face first, so the face paints over them.
    let backs = if view.void { 0 } else { view.backs };
    for (level, x, dy, width, height) in [(2, 45, 11, 409, 257), (1, 24, 16, 424, 266)]
        .into_iter()
        .skip(2 - backs)
    {
        surface(x, y + dy, width, height, Surface::Back(level));
    }
    surface(0, y + 22, 440, 276, Surface::Face(view.void));
    if let Some(permille) = progress {
        surface(0, y + 22 + 276 - 6, 440, 6, Surface::Stripe(permille));
    }
    let (soft, ink, digits) = if view.void {
        (Ink::Secondary, Ink::Text, Ink::Faint)
    } else {
        (Ink::FaceSoft, Ink::Face, Ink::Face)
    };
    // `.id-body` padding 22/24: issuer and place, chip, lamp and status, then number and meta.
    let top = y + 44;
    label(
        h,
        0,
        (24, top, 200, 16),
        view.issuer,
        single(Font::Tiny, soft),
    );
    label(
        h,
        0,
        (224, top, 192, 16),
        &view.place,
        Look {
            align: 2,
            ..single(Font::Tiny, soft)
        },
    );
    label(
        h,
        0,
        (24, top + 34, 46, 34),
        "",
        Look {
            shape: Shape::Chip(view.void),
            ..Default::default()
        },
    );
    let status = top + 34 + 34 + 14;
    label(
        h,
        0,
        (19, status + 11, 22, 22),
        "",
        Look {
            shape: Shape::Lamp(view.tone),
            ..Default::default()
        },
    );
    label(
        h,
        0,
        (49, status, 367, 44),
        &view.status,
        single(Font::Face, ink),
    );
    let meta = y + 276 - 39;
    label(
        h,
        0,
        (24, meta - 8 - 30, 392, 30),
        match number.as_deref() {
            Some(number) if !view.void => number,
            _ => "•••• •••• ••",
        },
        single(Font::Number, digits),
    );
    let mut x = 24;
    for (key, value) in &view.meta {
        if x >= 416 {
            break;
        }
        let width = width_of(key, Font::Key)
            .max(width_of(value, Font::Meta))
            .min(416 - x);
        label(h, 0, (x, meta, width, 18), key, single(Font::Key, soft));
        label(
            h,
            0,
            (x, meta + 18, width, 21),
            value,
            single(Font::Meta, ink),
        );
        x += width + 26;
    }
    // The side column (spacing 12), centered against the deck.
    let sx = DECK.0 + DECK_GAP;
    let sw = CW - sx;
    let mut tags: Vec<(String, Badge, u16)> = view
        .notes
        .iter()
        .map(|(text, kind)| (text.clone(), *kind, 0))
        .collect();
    if countdown {
        // The retry countdown note stays hidden until `tick` gives it text.
        let id = reserve(1);
        ui().countdowns.push((id, false));
        tags.push((String::new(), Badge::Neutral, id));
    }
    let widths: Vec<i32> = tags
        .iter()
        .map(|(text, _, id)| {
            let text = if *id == 0 {
                text.as_str()
            } else {
                "剩余 000 秒后重试"
            };
            (width_of(text, Font::Tiny) + 16).min(sw)
        })
        .collect();
    let (spots, notes_height) = flow(&widths, sw, 6, 20);
    let title_height = line(Font::Side);
    let body_height = if view.body.is_empty() {
        0
    } else {
        measure(&view.body, Font::Normal, sw)
    };
    let mut total = title_height;
    for part in [
        body_height,
        notes_height,
        if actions.is_empty() { 0 } else { 34 },
    ] {
        if part > 0 {
            total += 12 + part;
        }
    }
    let mut row = y + ((DECK.1 - total) / 2).max(0);
    row = label(
        h,
        0,
        (sx, row, sw, title_height),
        &view.headline,
        single(Font::Side, Ink::Text),
    );
    if body_height > 0 {
        row = para(
            h,
            sx,
            row + 12,
            sw,
            &view.body,
            look(Font::Normal, Ink::Secondary),
        );
    }
    if notes_height > 0 {
        row += 12;
        for ((text, kind, id), ((dx, dy), width)) in tags.iter().zip(spots.into_iter().zip(widths))
        {
            label(
                h,
                *id,
                (sx + dx, row + dy, width, 20),
                text,
                Look {
                    font: Font::Tiny,
                    badge: Some(*kind),
                    ..Default::default()
                },
            );
        }
        row += notes_height;
    }
    if !actions.is_empty() {
        row += 12;
        let mut x = sx;
        for (text, btn, action) in actions {
            let width = width_of(text, Font::Medium) + 30;
            let disabled = action.is_none();
            button(h, (x, row, width, 34), text, btn, action, disabled);
            x += width + 8;
        }
    }
    y + DECK.1.max(total) + 22
}
unsafe fn home_page(h: HWND) {
    let (snapshot, config) = {
        let s = ui();
        (s.state.clone(), s.config.clone())
    };
    anchor(h, 0, "网络连接状态");
    let y = pause_banner(h, 8, &config);
    if snapshot.is_null() || config.is_null() {
        loading(h, y);
        return;
    }
    let n = network(&snapshot);
    let wifi = n.ssid.is_some();
    let heartbeat_on = config["settings"]["enableHeartbeat"] == true;
    let online = snapshot["internetReachable"] == true;
    let rule = if wifi {
        current_rule(&config, &n)
    } else {
        None
    };
    let ssid = n.ssid.clone().unwrap_or_default();
    let accounts = if wifi {
        login_accounts(&config, &n, rule.as_ref())
    } else {
        vec![]
    };
    let number = accounts
        .first()
        .and_then(|a| a["username"].as_str())
        .map(card_number);
    // Each extra account in the login order shows as one more card behind the front one.
    let backs = accounts.len().saturating_sub(1).min(2);
    let view = if !wifi {
        let mut notes = vec![(
            "连接到 WiFi 后才能使用网络认证功能".to_string(),
            Badge::Neutral,
        )];
        if heartbeat_on {
            notes.push(("心跳检测已暂停".into(), Badge::Bad));
        }
        Face {
            tone: 3,
            void: true,
            backs: 0,
            issuer: "TUST · 校园网认证",
            place: "无 WiFi".into(),
            status: "未连接 WiFi".into(),
            headline: "先连上 WiFi".into(),
            body: "当前设备未连接到任何 WiFi 网络，请先连接 WiFi。".into(),
            meta: vec![
                ("WiFi", "无".into()),
                (
                    "心跳检测",
                    if heartbeat_on {
                        "已暂停"
                    } else {
                        "已关闭"
                    }
                    .into(),
                ),
            ],
            notes,
            action: None,
        }
    } else if rule.is_none() && snapshot["requiresAuth"] != true {
        let same_name = rules(&config).iter().any(|w| w.ssid == ssid);
        Face {
            tone: 0,
            void: true,
            backs: 0,
            issuer: "TUST · 未配置",
            place: ssid.clone(),
            status: if same_name {
                "请选择当前 WiFi 规则"
            } else {
                "该 WiFi 未配置"
            }
            .into(),
            headline: if same_name {
                "选择 WiFi 规则"
            } else {
                "添加这个 WiFi"
            }
            .into(),
            body: if same_name {
                "同名 WiFi 身份信息不足或规则不匹配，请在配置设置中选择安全类型及 BSSID 后重试。"
                    .to_string()
            } else {
                format!(
                    "当前连接的 WiFi \"{ssid}\" 尚未配置，请前往\"配置设置\"添加此 WiFi 的配置。"
                )
            },
            meta: vec![
                ("WiFi", ssid.clone()),
                (
                    "WiFi 规则",
                    if same_name { "未匹配" } else { "未配置" }.into(),
                ),
            ],
            notes: vec![(
                "点击左侧菜单的\"配置设置\"添加 WiFi 配置".into(),
                Badge::Neutral,
            )],
            action: None,
        }
    } else if !rule
        .as_ref()
        .map(|w| w.requires_auth)
        .unwrap_or(snapshot["requiresAuth"] == true)
    {
        Face {
            tone: if online { 1 } else { 2 },
            void: false,
            backs: 0,
            issuer: "TUST · 无需认证",
            place: ssid.clone(),
            status: "无需认证".into(),
            headline: if online {
                "互联网可达"
            } else {
                "互联网暂不可达"
            }
            .into(),
            body: if online {
                "当前 WiFi 无需校园网认证，互联网可达。"
            } else {
                "当前 WiFi 无需校园网认证，互联网暂不可达。"
            }
            .into(),
            meta: vec![
                ("WiFi", ssid.clone()),
                ("WiFi 规则", "无需认证".into()),
                ("互联网", if online { "可达" } else { "不可达" }.into()),
            ],
            notes: vec![
                ("此 WiFi 已配置为「无需认证」".into(), Badge::Auth),
                ("如家庭 WiFi、手机热点等网络".into(), Badge::Neutral),
            ],
            action: None,
        }
    } else if accounts.is_empty() {
        Face {
            tone: 0,
            void: true,
            backs: 0,
            issuer: "TUST · 校园网认证",
            place: ssid.clone(),
            status: "未配置账户".into(),
            headline: "还差一个账号".into(),
            body: "该 WiFi 需要校园网认证，但尚未关联账户。请前往\"配置设置\"添加账户并关联到此 WiFi。"
                .into(),
            meta: vec![("WiFi 规则", "需要认证".into()), ("关联账户", "无".into())],
            notes: vec![(
                "点击左侧菜单的\"配置设置\"添加账户并关联".into(),
                Badge::Neutral,
            )],
            action: Some((
                "添加认证账号",
                Btn::Primary,
                Some(act(|h| go(h, SETTINGS))),
            )),
        }
    } else {
        let authenticated = snapshot["authenticated"] == true;
        let connecting = matches!(
            snapshot["phase"].as_str(),
            Some("connecting" | "authenticating" | "verifying")
        );
        let action = if authenticated {
            (
                "断开连接",
                Btn::Danger,
                Some(act(|_| {
                    send(Command::Logout);
                })),
            )
        } else if connecting {
            ("正在认证...", Btn::Primary, None)
        } else {
            (
                "立即连接",
                Btn::Primary,
                Some(act(|_| {
                    send(Command::Login);
                })),
            )
        };
        let isp = accounts[0]["isp"].as_str().unwrap_or("");
        Face {
            tone: if authenticated && online { 1 } else { 2 },
            void: false,
            backs,
            issuer: "TUST · 校园网认证",
            place: ssid.clone(),
            status: if authenticated {
                if online {
                    "已认证并联网"
                } else {
                    "已认证，互联网不可达"
                }
            } else {
                "需要认证"
            }
            .into(),
            headline: if authenticated {
                if online {
                    "一切正常"
                } else {
                    "正在检查互联网"
                }
            } else if connecting {
                "正在认证"
            } else {
                "等待认证"
            }
            .into(),
            body: if authenticated {
                if online {
                    "当前 WiFi 已通过认证且可访问互联网。"
                } else {
                    "门户已确认认证成功，正在检查互联网连接。"
                }
            } else {
                "当前 WiFi 需要校园网认证，请点击下方按钮进行认证。"
            }
            .into(),
            meta: vec![
                ("运营商", isp_label(isp).to_string()),
                ("关联账户", format!("{} 个", accounts.len())),
                (
                    "WiFi 规则",
                    if rule.is_some() {
                        "需要认证"
                    } else {
                        "自动识别"
                    }
                    .into(),
                ),
            ],
            notes: vec![
                (
                    if rule.is_some() {
                        "此 WiFi 已配置为「需要认证」"
                    } else {
                        "根据当前网络信息识别为校园网"
                    }
                    .into(),
                    Badge::Auth,
                ),
                ("如校园网 CMCC/CUCC/CTCC".into(), Badge::Neutral),
            ],
            action: Some(action),
        }
    };
    let mut y = account_card(h, y, view, number, &snapshot, &config);
    if wifi {
        y = strip(h, y, &snapshot, &config);
    }
    columns(h, y, &snapshot, &config, wifi, rule.as_ref());
}
/// `.empty-box`: a dashed outline 12px below the heading with a centered message.
unsafe fn empty_box(h: HWND, x: i32, y: i32, width: i32, message: &str) -> i32 {
    let boxed = surface(x, y + 12, width, 0, Surface::Dashed);
    let bottom = para(
        h,
        x + 24,
        y + 12 + 24,
        width - 48,
        message,
        centered(Font::Normal, Ink::Secondary),
    );
    set_bottom(boxed, bottom + 24);
    bottom + 24
}
unsafe fn settings_page(h: HWND) {
    let config = ui().config.clone();
    anchor(h, 0, "账号配置");
    if config.is_null() {
        para(h, 0, 8, CW, "加载中...", look(Font::Normal, Ink::Text));
        return;
    }
    let settings = config["settings"].clone();
    let y = pause_banner(h, 8, &config);
    let y = accounts(h, y, &config) + 28;
    let y = wifis(h, y, &config) + 28;
    // Two columns as in linux.rs: 通用设置 | 附近 WiFi over 通知设置.
    let mut top = heading(h, 0, y, COL, "通用设置", "");
    for (key, title, desc) in [
        ("autoLaunch", "开机自动启动", ""),
        (
            "enableHeartbeat",
            "启用心跳检测",
            "按间隔检测网络；关闭后仅在 WiFi 变化时检测，另有 30 秒兜底检查",
        ),
        (
            "autoReconnect",
            "断线自动重连",
            "认证失效时自动登录；WiFi 断开时按优先级重连已开启自动连接的 WiFi",
        ),
        (
            "startupAutoConnect",
            "启动时自动连接",
            "启动时若未连接 WiFi，按优先级连接已配置的 WiFi",
        ),
        (
            "keepCurrentConnection",
            "保持当前连接",
            "启动时已连接其他 WiFi 则不切换；关闭后切换到附近最高优先级的已配置 WiFi",
        ),
        ("autoUpdate", "自动检查更新", "启动后自动检查新版本"),
    ] {
        top = toggle_row(
            h,
            0,
            top,
            COL,
            title,
            desc,
            settings[key] == true,
            move |_, v| mutate(move |c| c["settings"][key] = json!(v)),
        );
    }
    for (id, key, min, max) in NUMBERS {
        if key.starts_with("heartbeat") && settings["enableHeartbeat"] != true {
            continue;
        }
        let title = match key {
            "heartbeatIntervalSeconds" => "心跳检测间隔 (秒)",
            "heartbeatFailureThreshold" => {
                "连续失败阈值 (次，已在线后连续检测失败达到该次数才重新认证)"
            }
            "wifiReconnectRetries" => "每个 WiFi 最多尝试次数（含首次）",
            _ => "冷却期时长 (分钟，全部 WiFi 失败后暂停重连；0 为不冷却)",
        };
        // `.set` with the name on the left and a short number field on the right.
        let value = settings[key].as_u64().unwrap_or(min).clamp(min, max);
        let name_bottom = para(
            h,
            0,
            top + 10,
            COL - 112,
            title,
            look(Font::Medium, Ink::Text),
        );
        let row = (name_bottom + 10).max(top + 56);
        field(
            h,
            id,
            (COL - 96, (top + row - 36) / 2, 96, 36),
            &value.to_string(),
            &format!("{min}–{max}"),
            None,
            ES_NUMBER as u32,
        );
        hairline(0, row - 1, COL);
        top = row;
    }
    let x = COL + 32;
    let right = nearby(h, x, y, COL, &config) + 24;
    let mut top = heading(h, x, right, COL, "通知设置", "");
    for (key, title) in [
        ("wifiDisconnected", "WiFi 断开"),
        ("reconnectSuccess", "自动重连成功"),
        ("reconnectFailed", "自动重连全部失败"),
        ("authRecovered", "认证恢复成功"),
    ] {
        top = toggle_row(
            h,
            x,
            top,
            COL,
            title,
            "",
            settings["notificationSettings"][key] != false,
            move |_, v| mutate(move |c| c["settings"]["notificationSettings"][key] = json!(v)),
        );
    }
}
/// Reads the number settings after typing pauses and saves the ones that changed.
unsafe fn save_numbers(h: HWND) {
    let config = ui().config.clone();
    let mut changes = vec![];
    for (id, key, min, max) in NUMBERS {
        if GetDlgItem(Some(h), id as i32).is_err() {
            continue;
        }
        let Ok(value) = text(h, id).parse::<u64>() else {
            continue;
        };
        let value = value.clamp(min, max);
        if config["settings"][key].as_u64() != Some(value) {
            changes.push((key, value));
        }
    }
    if !changes.is_empty() {
        mutate(move |c| {
            for (key, value) in &changes {
                c["settings"][*key] = json!(value);
            }
        });
    }
}
/// 附近 WiFi: a quiet scan button in the heading, the note and the scanned networks.
unsafe fn nearby(h: HWND, x: i32, y: i32, width: i32, config: &Value) -> i32 {
    let (scanning, scan) = {
        let s = ui();
        (s.scanning, s.scan.clone())
    };
    let top = heading(h, x, y, width, "附近 WiFi", "");
    let scan_text = if scanning {
        "扫描中…"
    } else {
        "扫描附近 WiFi"
    };
    let scan_width = width_of(scan_text, Font::Medium) + 16;
    button(
        h,
        (x + width - scan_width, y + 3, scan_width, 28),
        scan_text,
        Btn::Quiet,
        Some(act(|h| {
            if send(Command::Scan) {
                ui().scanning = true;
                render(h);
            }
        })),
        scanning,
    );
    let mut top = para(
        h,
        x,
        top + 10,
        width,
        "扫描附近网络，选择后添加配置或编辑已保存的网络。",
        look(Font::Small, Ink::Secondary),
    ) + 10;
    hairline(x, top, width);
    top += 1;
    let Some(networks) = scan.as_array() else {
        return top;
    };
    if networks.is_empty() {
        top = para(
            h,
            x,
            top + 10,
            width,
            "未发现网络，请确认 WiFi 已开启，或手动填写 WiFi 名称。",
            look(Font::Small, Ink::Secondary),
        ) + 10;
        hairline(x, top, width);
        return top + 1;
    }
    for value in networks {
        let n: Network = serde_json::from_value(value.clone()).unwrap_or_default();
        let saved = current_rule(config, &n);
        let percent = n.rssi.map(|r| ((r + 100) * 100 / 60).clamp(0, 100));
        let mut parts = vec![n.ssid.clone().unwrap_or_default()];
        if let Some(p) = percent {
            parts.push(format!("{p}%"));
        }
        parts.extend(n.security.clone());
        parts.extend(n.bssid.clone());
        if saved.is_some() {
            parts.push("已保存".into());
        }
        label(
            h,
            0,
            (x, top + 16, width - 76, 22),
            &parts.join(" · "),
            single(Font::Normal, Ink::Text),
        );
        let pos = (x + width - 64, top + 9, 64, 34);
        match saved {
            Some(rule) => {
                let id = json!(rule.id);
                click(h, pos, "编辑", Btn::Normal, move |h| {
                    let rule = ui().config["wifiRules"]
                        .as_array()
                        .and_then(|r| r.iter().find(|w| w["id"] == id).cloned());
                    if let Some(rule) = rule {
                        open_editor(h, WIFI, rule);
                    }
                });
            }
            None => {
                click(h, pos, "选择", Btn::Normal, move |h| {
                    set_draft("wifi.ssid", n.ssid.as_deref().unwrap_or(""));
                    set_draft("wifi.security", n.security.as_deref().unwrap_or(""));
                    set_draft("wifi.bssid", n.bssid.as_deref().unwrap_or(""));
                    render(h);
                });
            }
        }
        top += 52;
        hairline(x, top - 1, width);
    }
    top
}
unsafe fn open_editor(h: HWND, page: u16, item: Value) {
    {
        let mut s = ui();
        s.edit = item;
        s.page = page;
    }
    render(h);
}
unsafe fn error_line(h: HWND, x: i32, y: i32, width: i32, key: &str) -> i32 {
    let error = ui().drafts.get(key).cloned();
    match error {
        Some(error) => para(h, x, y, width, &error, look(Font::Normal, Ink::Bad)) + 10,
        None => y,
    }
}
/// 账号管理: account rows with a mini card face, then the add form (用户名 | 密码 | 运营商 in
/// one row, then the server address and the submit button). Returns the bottom edge.
unsafe fn accounts(h: HWND, y: i32, config: &Value) -> i32 {
    let mut top = heading(h, 0, y, CW, "账号管理", "按顺序依次认证");
    let list = config["accounts"].as_array().cloned().unwrap_or_default();
    if list.is_empty() {
        top = empty_box(h, 0, top, CW, "暂无账号，请添加账号以使用登录功能");
    }
    for account in list {
        let username = account["username"].as_str().unwrap_or("").to_string();
        let id = account["id"].clone();
        let current = config["currentAccountId"] == id;
        label(
            h,
            0,
            (0, top + 13, 58, 38),
            "",
            Look {
                shape: Shape::Mini(current),
                ..Default::default()
            },
        );
        let actions = 330;
        label(
            h,
            0,
            (72, top + 12, CW - 72 - actions, 22),
            &username,
            single(Font::Code, Ink::Text),
        );
        let mut sub = vec![isp_label(account["isp"].as_str().unwrap_or("")).to_string()];
        sub.extend(
            account["serverUrl"]
                .as_str()
                .filter(|u| !u.is_empty())
                .map(str::to_owned),
        );
        label(
            h,
            0,
            (72, top + 36, CW - 72 - actions, 18),
            &sub.join(" · "),
            single(Font::Small, Ink::Secondary),
        );
        let row = top + 15;
        let mut right = CW - 64;
        click(h, (right, row, 64, 34), "删除", Btn::Danger, {
            let id = id.clone();
            move |_| remove_account(id.clone())
        });
        right -= 6 + 64;
        let edit = account.clone();
        click(h, (right, row, 64, 34), "编辑", Btn::Normal, move |h| {
            open_editor(h, ACCOUNT, edit.clone())
        });
        if current {
            label(
                h,
                0,
                (right - 6 - 70, row + 7, 64, 20),
                "使用中",
                Look {
                    align: 2,
                    ..single(Font::Strong, Ink::Ok)
                },
            );
        } else {
            let width = width_of("使用此账号", Font::Medium) + 30;
            let use_id = id.clone();
            click(
                h,
                (right - 6 - width, row, width, 34),
                "使用此账号",
                Btn::Normal,
                move |_| {
                    let id = use_id.clone();
                    mutate(move |c| c["currentAccountId"] = id.clone());
                },
            );
        }
        top += 64;
        hairline(0, top - 1, CW);
    }
    top = form_heading(h, 0, top, CW, "添加新账号");
    let third = (CW - 20) / 3;
    form(
        h,
        130,
        0,
        top,
        third,
        "用户名",
        &draft("account.username", ""),
        "请输入学号/用户名",
        Some("account.username"),
        0,
    );
    form(
        h,
        131,
        third + 10,
        top,
        third,
        "密码",
        &draft("account.password", ""),
        "请输入密码",
        Some("account.password"),
        ES_PASSWORD as u32,
    );
    let isp_x = 2 * (third + 10);
    let field_top = para(
        h,
        isp_x,
        top,
        third,
        "运营商",
        look(Font::Small, Ink::Secondary),
    ) + 6;
    let values = ["campus", "cmcc", "cucc", "ctcc"];
    let selected = draft("account.isp", "campus");
    let titles: Vec<String> = values.iter().map(|v| isp_label(v).to_string()).collect();
    dropdown(
        h,
        (isp_x, field_top, CW - isp_x),
        "运营商",
        &titles,
        values.iter().position(|v| *v == selected).unwrap_or(0),
        false,
        move |_, i| set_draft("account.isp", values[i]),
    );
    top = field_top + 36 + 12;
    if !ui().drafts.contains_key("account.server") {
        set_draft("account.server", "http://10.10.102.50:801");
    }
    let submit = width_of("保存并添加账号", Font::Medium) + 30;
    let bottom = form(
        h,
        132,
        0,
        top,
        CW - submit - 10,
        "登录服务器地址",
        &draft("account.server", ""),
        "",
        Some("account.server"),
        0,
    );
    click(
        h,
        (CW - submit, bottom - 12 - 36, submit, 36),
        "保存并添加账号",
        Btn::Primary,
        |h| {
            let username = text(h, 130).trim().to_string();
            let secret = text(h, 131);
            let error = if username.is_empty() || secret.is_empty() {
                Some("请输入用户名和密码")
            } else if ui().config["accounts"]
                .as_array()
                .is_some_and(|a| a.iter().any(|a| a["username"] == json!(username)))
            {
                Some("该用户名已存在")
            } else {
                None
            };
            if let Some(error) = error {
                set_draft("account.error", error);
                render(h);
                return;
            }
            ui().drafts.remove("account.error");
            let id = format!("account-{}", now_ms());
            let account = json!({"id":id,"name":username,"username":username,"serverUrl":text(h, 132).trim(),"isp":draft("account.isp","campus"),"passwordEdit":{"action":"replace","value":secret}});
            ui().clear_on_save.push("account.".into());
            mutate(move |c| {
                client::list(c, "accounts").push(account.clone());
                if c["currentAccountId"].is_null() {
                    c["currentAccountId"] = json!(id);
                }
            });
        },
    );
    error_line(h, 0, bottom - 6, CW, "account.error")
}
/// WiFi 配置: rules numbered by priority in gold, then the add form. Returns the bottom edge.
unsafe fn wifis(h: HWND, y: i32, config: &Value) -> i32 {
    let top = heading(h, 0, y, CW, "WiFi 配置", "");
    let mut top = para(
        h,
        0,
        top + 10,
        CW,
        "配置WiFi网络及其连接选项。新添加的WiFi默认启用自动重连，WiFi断开后会自动尝试重新连接。点击刷新图标按钮可切换自动重连状态。",
        look(Font::Small, Ink::Secondary),
    ) + 10;
    hairline(0, top, CW);
    top += 1;
    let accounts = config["accounts"].as_array().cloned().unwrap_or_default();
    let list = config["wifiRules"].as_array().cloned().unwrap_or_default();
    if list.is_empty() {
        top = empty_box(h, 0, top, CW, "暂无 WiFi 配置");
    }
    for wifi in list {
        let ssid = wifi["ssid"].as_str().unwrap_or("").to_string();
        let auth = wifi["requiresAuth"] == true;
        let auto = wifi["autoConnect"] == true;
        let priority = wifi["priority"].as_u64().unwrap_or(10);
        // Actions: auto reconnect (34) | 连接 | 编辑 | 删除, 8 apart; the badge sits before them.
        let actions = 34 + 8 + 64 + 8 + 64 + 8 + 64;
        let tag = if auth { "需要认证" } else { "无需认证" };
        let tag_width = width_of(tag, Font::Tiny) + 16;
        let info_x = 56;
        let info_width = CW - actions - 12 - tag_width - 12 - info_x;
        let mut line = top + 11;
        line = label(
            h,
            0,
            (info_x, line, info_width, 22),
            &ssid,
            single(Font::Strong, Ink::Text),
        ) + 2;
        let mut sub = vec![];
        if auth {
            let linked: Vec<String> = wifi["linkedAccountIds"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|id| accounts.iter().find(|a| &a["id"] == id))
                .map(|a| {
                    format!(
                        "{} ({} - {})",
                        a["username"].as_str().unwrap_or(""),
                        isp_label(a["isp"].as_str().unwrap_or("")),
                        a["serverUrl"].as_str().unwrap_or("")
                    )
                })
                .collect();
            if linked.is_empty() {
                line = label(
                    h,
                    0,
                    (info_x, line, info_width, 18),
                    "未关联账号（账号可能已删除）",
                    single(Font::Small, Ink::Bad),
                ) + 2;
            } else {
                sub.push(format!("关联账号: {}", linked.join("，")));
            }
        }
        sub.push(
            if auto {
                "断开后自动重连"
            } else {
                "手动连接"
            }
            .into(),
        );
        line = label(
            h,
            0,
            (info_x, line, info_width, 18),
            &sub.join(" · "),
            single(Font::Small, Ink::Secondary),
        );
        let bottom = line + 11;
        let middle = (top + bottom) / 2;
        label(
            h,
            0,
            (0, middle - 15, 44, 30),
            &format!("{priority:02}"),
            single(Font::Rank, Ink::Gold),
        );
        label(
            h,
            0,
            (info_x + info_width + 12, middle - 10, tag_width, 20),
            tag,
            Look {
                font: Font::Tiny,
                badge: Some(if auth { Badge::Auth } else { Badge::Neutral }),
                ..Default::default()
            },
        );
        let id = wifi["id"].clone();
        let row = middle - 17;
        let mut x = CW - actions;
        let toggle_id = id.clone();
        click(
            h,
            (x, row, 34, 34),
            if auto {
                "↻ 自动重连"
            } else {
                "↻ 手动连接"
            },
            Btn::Auto(auto),
            move |_| {
                let id = toggle_id.clone();
                mutate(move |c| {
                    for w in client::list(c, "wifiRules") {
                        if w["id"] == id {
                            w["autoConnect"] = json!(w["autoConnect"] != true);
                        }
                    }
                });
            },
        );
        x += 34 + 8;
        let connect = id.as_str().unwrap_or("").to_string();
        click(h, (x, row, 64, 34), "连接", Btn::Normal, move |_| {
            send(Command::Connect {
                id: connect.clone(),
            });
        });
        x += 64 + 8;
        let edit = wifi.clone();
        click(h, (x, row, 64, 34), "编辑", Btn::Normal, move |h| {
            open_editor(h, WIFI, edit.clone())
        });
        x += 64 + 8;
        click(h, (x, row, 64, 34), "删除", Btn::Danger, move |_| {
            remove_wifi(id.clone())
        });
        top = bottom.max(row + 34 + 11);
        hairline(0, top - 1, CW);
    }
    top = form_heading(h, 0, top, CW, "添加 WiFi");
    for (id, key, title, cue, style) in [
        (140, "wifi.ssid", "WiFi 名称 (SSID)", "请输入 WiFi 名称", 0),
        (
            141,
            "wifi.security",
            "安全类型（留空自动识别）",
            "WPA2 / WPA3 / WPA2-WPA3 / Open",
            0,
        ),
        (
            142,
            "wifi.bssid",
            "BSSID（可选，限定接入点）",
            "aa:bb:cc:dd:ee:ff",
            0,
        ),
        (
            143,
            "wifi.password",
            "WiFi 密码",
            "请输入 WiFi 密码（可选）",
            ES_PASSWORD as u32,
        ),
    ] {
        top = form(
            h,
            id,
            0,
            top,
            CW,
            title,
            &draft(key, ""),
            cue,
            Some(key),
            style,
        );
    }
    let auth = draft("wifi.auth", "1") == "1";
    for (key, title, desc, value) in [
        (
            "wifi.auth",
            "需要校园网认证",
            "关闭则视为家庭/热点网络",
            auth,
        ),
        (
            "wifi.auto",
            "断开后自动重连",
            "关闭后需手动连接此 WiFi",
            draft("wifi.auto", "1") == "1",
        ),
    ] {
        // `.form-group` row: the checkbox, then its description in parentheses.
        let id = reserve(1);
        register(
            id,
            act(move |h| {
                set_draft(key, if checked(h, id) { "1" } else { "0" });
                if key == "wifi.auth" {
                    ui().drafts.remove("wifi.account");
                    render(h);
                }
            }),
        );
        let right = check(h, id, 0, top, title, value);
        label(
            h,
            0,
            (right + 8, top + 5, CW - right - 8, 18),
            &format!("({desc})"),
            single(Font::Small, Ink::Secondary),
        );
        top += 28 + 10;
    }
    if auth {
        top = para(h, 0, top, CW, "关联账号", look(Font::Small, Ink::Secondary)) + 6;
        if accounts.is_empty() {
            let boxed = surface(0, top, CW, 0, Surface::Warning);
            let bottom = para(
                h,
                12,
                top + 8,
                CW - 24,
                "请先在上方「账号管理」添加账号",
                look(Font::Normal, Ink::Warn),
            );
            set_bottom(boxed, bottom + 8);
            top = bottom + 8 + 12;
        } else {
            let selected = draft("wifi.account", "");
            let ids: Vec<String> = accounts
                .iter()
                .map(|a| a["id"].as_str().unwrap_or("").to_string())
                .collect();
            let titles: Vec<String> = accounts
                .iter()
                .map(|a| {
                    format!(
                        "{}\n{} · {}",
                        a["username"].as_str().unwrap_or(""),
                        isp_label(a["isp"].as_str().unwrap_or("")),
                        a["serverUrl"].as_str().unwrap_or("")
                    )
                })
                .collect();
            let chosen = ids
                .iter()
                .position(|id| *id == selected)
                .unwrap_or(usize::MAX);
            top = choices(h, 0, top, CW, 1, 56, &titles, chosen, move |_, i| {
                set_draft("wifi.account", &ids[i])
            }) + 12;
        }
    }
    top = form(
        h,
        144,
        0,
        top,
        CW,
        "优先级",
        &draft("wifi.priority", "10"),
        "1–99",
        Some("wifi.priority"),
        ES_NUMBER as u32,
    ) - 6;
    top = para(
        h,
        0,
        top,
        CW,
        "数字越小优先级越高（1=最高，99=最低，默认=10）",
        look(Font::Small, Ink::Secondary),
    ) + 12;
    top = error_line(h, 0, top, CW, "wifi.error");
    let add = width_of("添加 WiFi", Font::Medium) + 30;
    button(
        h,
        (0, top, add, 36),
        "添加 WiFi",
        Btn::Primary,
        Some(act(|h| add_wifi(h))),
        auth && accounts.is_empty(),
    );
    top + 36
}
unsafe fn add_wifi(h: HWND) {
    let name = text(h, 140).trim().to_string();
    let secret = text(h, 143);
    let typed = text(h, 141).trim().to_string();
    let resolved = if !secret.is_empty() && (typed.is_empty() || typed.eq_ignore_ascii_case("open"))
    {
        Some("WPA2".to_string())
    } else {
        Some(typed.clone()).filter(|t| !t.is_empty())
    };
    let ap = Some(text(h, 142).trim().to_string()).filter(|b| !b.is_empty());
    let auth = draft("wifi.auth", "1") == "1";
    let account = draft("wifi.account", "");
    // Without a typed security or BSSID any rule with the same name counts as a duplicate.
    let loose = typed.is_empty() && ap.is_none();
    let exists = ui().config["wifiRules"].as_array().is_some_and(|rules| {
        rules.iter().any(|w| {
            if loose {
                same_identity(w, &name, None, None)
            } else {
                same_identity(w, &name, resolved.as_deref(), ap.as_deref())
            }
        })
    });
    let error = if name.is_empty() {
        Some("请输入 WiFi 名称")
    } else if exists {
        Some("该 WiFi 配置已存在")
    } else if auth && account.is_empty() {
        Some("需要认证的 WiFi 必须选择关联账号")
    } else {
        None
    };
    if let Some(error) = error {
        set_draft("wifi.error", error);
        render(h);
        return;
    }
    ui().drafts.remove("wifi.error");
    let priority = text(h, 144).parse::<u64>().unwrap_or(10).clamp(1, 99);
    let rule = json!({
        "id": format!("wifi-{}", now_ms()),
        "ssid": name,
        "passwordEdit": if secret.is_empty() { json!({"action":"clear"}) } else { json!({"action":"replace","value":secret}) },
        "security": resolved,
        "bssid": ap,
        "priority": priority,
        "autoConnect": draft("wifi.auto", "1") == "1",
        "requiresAuth": auth,
        "linkedAccountIds": if auth { vec![account] } else { vec![] },
    });
    ui().clear_on_save.push("wifi.".into());
    mutate(move |c| client::list(c, "wifiRules").push(rule.clone()));
}
fn password(secret: String, clear: bool) -> Value {
    if clear {
        json!({"action":"clear"})
    } else if secret.is_empty() {
        json!({"action":"keep"})
    } else {
        json!({"action":"replace","value":secret})
    }
}
unsafe fn editor_actions(h: HWND, y: i32, remove: &'static str, save: Action, delete: Action) {
    button(h, (0, y, 120, 36), "保存", Btn::Primary, Some(save), false);
    button(
        h,
        (128, y, 120, 36),
        remove,
        Btn::Danger,
        Some(delete),
        false,
    );
    click(h, (256, y, 100, 36), "取消", Btn::Normal, |h| {
        go(h, SETTINGS)
    });
}
unsafe fn account_editor(h: HWND) {
    let old = ui().edit.clone();
    let mut top = heading(h, 0, 8, CW, "编辑账号", "") + 14;
    for (id, title, key) in [(300, "显示名称", "name"), (301, "用户名", "username")] {
        top = form(
            h,
            id,
            0,
            top,
            CW,
            title,
            old[key].as_str().unwrap_or(""),
            "",
            None,
            0,
        );
    }
    top = form(
        h,
        302,
        0,
        top,
        CW,
        "密码（留空保留）",
        "",
        "",
        None,
        ES_PASSWORD as u32,
    );
    let clear = reserve(1);
    check(h, clear, 0, top - 4, "清空已保存密码", false);
    top = form(
        h,
        303,
        0,
        top + 34,
        CW,
        "登录服务器地址",
        old["serverUrl"].as_str().unwrap_or(""),
        "",
        None,
        0,
    );
    top = para(h, 0, top, CW, "运营商", look(Font::Small, Ink::Secondary)) + 6;
    let values = ["campus", "cmcc", "cucc", "ctcc"];
    let selected = values
        .iter()
        .position(|v| Some(*v) == old["isp"].as_str())
        .unwrap_or(0);
    ui().drafts
        .insert("editor.isp".into(), values[selected].into());
    let titles: Vec<String> = values.iter().map(|v| isp_label(v).to_string()).collect();
    top = dropdown(
        h,
        (0, top, CW),
        "运营商",
        &titles,
        selected,
        false,
        move |_, i| set_draft("editor.isp", values[i]),
    ) + 24;
    let id = old["id"].clone();
    let save = act(move |h| {
        put_item(
            "accounts",
            json!({"id":id,"name":text(h, 300),"username":text(h, 301).trim(),"serverUrl":text(h, 303).trim(),"isp":draft("editor.isp","campus"),"passwordEdit":password(text(h, 302), checked(h, clear))}),
        );
        go(h, SETTINGS);
    });
    let id = old["id"].clone();
    let delete = act(move |h| {
        remove_account(id.clone());
        go(h, SETTINGS);
    });
    editor_actions(h, top, "删除账号", save, delete);
}
unsafe fn wifi_editor(h: HWND) {
    let (old, accounts) = {
        let s = ui();
        (
            s.edit.clone(),
            s.config["accounts"].as_array().cloned().unwrap_or_default(),
        )
    };
    let mut top = heading(h, 0, 8, CW, "编辑 WiFi", "") + 14;
    top = form(
        h,
        300,
        0,
        top,
        CW,
        "WiFi 名称 (SSID)",
        old["ssid"].as_str().unwrap_or(""),
        "",
        None,
        0,
    );
    top = form(
        h,
        301,
        0,
        top,
        CW,
        "WiFi 密码（留空保留）",
        "",
        "",
        None,
        ES_PASSWORD as u32,
    );
    let clear = reserve(1);
    check(h, clear, 0, top - 4, "清空密码（开放网络）", false);
    top += 34;
    for (id, title, key) in [
        (302, "安全类型（留空自动识别）", "security"),
        (303, "BSSID（可选，限定接入点）", "bssid"),
    ] {
        top = form(
            h,
            id,
            0,
            top,
            CW,
            title,
            old[key].as_str().unwrap_or(""),
            "",
            None,
            0,
        );
    }
    top = form(
        h,
        304,
        0,
        top,
        CW,
        "优先级",
        &old["priority"].as_u64().unwrap_or(10).to_string(),
        "1–99",
        None,
        ES_NUMBER as u32,
    );
    let auto = reserve(2);
    check(
        h,
        auto,
        0,
        top,
        "断开后自动重连",
        old["autoConnect"] == true,
    );
    check(
        h,
        auto + 1,
        0,
        top + 36,
        "需要校园网认证",
        old["requiresAuth"] == true,
    );
    top = para(
        h,
        0,
        top + 82,
        CW,
        "关联账号（按下面顺序尝试；可调整序号）",
        look(Font::Small, Ink::Secondary),
    ) + 8;
    let ids = old["linkedAccountIds"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut linked = vec![];
    for a in &accounts {
        let id = a["id"].as_str().unwrap_or("").to_string();
        let box_id = reserve(2);
        let name = a["name"]
            .as_str()
            .filter(|s| !s.is_empty())
            .or(a["username"].as_str())
            .unwrap_or("账号");
        check(h, box_id, 0, top + 7, name, ids.contains(&json!(id)));
        let order = ids
            .iter()
            .position(|v| v == &json!(id))
            .map(|p| p + 1)
            .unwrap_or(100);
        field(
            h,
            box_id + 1,
            (CW - 120, top, 120, 36),
            &order.to_string(),
            "序号",
            None,
            ES_NUMBER as u32,
        );
        linked.push((id, box_id));
        top += 54;
    }
    top += 14;
    let id = old["id"].clone();
    let save = act(move |h| {
        let mut chosen: Vec<_> = linked
            .iter()
            .filter(|(_, c)| checked(h, *c))
            .map(|(id, c)| (id.clone(), text(h, c + 1).parse::<u64>().unwrap_or(100)))
            .collect();
        chosen.sort_by_key(|(_, n)| *n);
        let optional = |v: String| {
            if v.trim().is_empty() {
                Value::Null
            } else {
                json!(v.trim())
            }
        };
        let value = json!({
            "id": id,
            "ssid": text(h, 300).trim(),
            "passwordEdit": password(text(h, 301), checked(h, clear)),
            "security": optional(text(h, 302)),
            "bssid": optional(text(h, 303)),
            "priority": text(h, 304).parse::<u64>().unwrap_or(10).clamp(1, 99),
            "autoConnect": checked(h, auto),
            "requiresAuth": checked(h, auto + 1),
            "linkedAccountIds": chosen.into_iter().map(|(id, _)| id).collect::<Vec<_>>(),
        });
        put_item("wifiRules", value);
        go(h, SETTINGS);
    });
    let id = old["id"].clone();
    let delete = act(move |h| {
        remove_wifi(id.clone());
        go(h, SETTINGS);
    });
    editor_actions(h, top, "删除网络", save, delete);
}
fn reload_logs() {
    let q = {
        let mut s = ui();
        s.query.cursor = None;
        s.cursors.clear();
        s.query.clone()
    };
    send(Command::Logs(q));
}
/// "搜索 / 刷新": reads the toolbar fields into the query and reloads the first page.
unsafe fn apply_log_filter(h: HWND) {
    let hours = text(h, 122);
    let hours = if hours.trim().is_empty() {
        Ok(0)
    } else {
        hours.trim().parse::<u64>()
    };
    let Ok(hours @ 0..=168) = hours else {
        feedback(h, "请输入 0–168 小时");
        return;
    };
    {
        let mut s = ui();
        s.query.keyword = text(h, 120);
        s.query.source = text(h, 121).trim().to_string();
        s.query.start_time = (hours > 0).then(|| now_ms().saturating_sub(hours * 3_600_000));
    }
    reload_logs();
}
unsafe fn logs_page(h: HWND) {
    let (query, rows, dark) = {
        let s = ui();
        (s.query.clone(), s.rows.len(), s.dark)
    };
    let top = para(
        h,
        0,
        0,
        CW,
        "连接、认证与恢复记录，保留最近 7 天",
        single(Font::Small, Ink::Secondary),
    ) + 16;
    let mut y = top;
    let hours = query
        .start_time
        .map(|start| {
            (now_ms().saturating_sub(start) / 3_600_000)
                .max(1)
                .to_string()
        })
        .unwrap_or_else(|| "0".into());
    // One row of 36-high controls without captions, as in linux.rs; each field keeps its
    // accessible name from an undrawn label just before it, plus a tooltip.
    let toolbar = [
        (120, 0, 352, "搜索全部保留历史", "搜索消息或详情"),
        (121, 364, 150, "来源", "全部来源"),
        (122, 526, 96, "最近小时", "0"),
    ];
    let mut tips = vec![];
    for (id, x, width, name, cue) in toolbar {
        anchor_at(h, (x, y, width, 2), name);
        let (key, value, style) = match id {
            120 => ("log.keyword", query.keyword.clone(), 0),
            121 => ("log.source", query.source.clone(), 0),
            _ => ("log.hours", hours.clone(), ES_NUMBER as u32),
        };
        let edit = field(
            h,
            id,
            (x, y, width, 36),
            &draft(key, &value),
            cue,
            Some(key),
            style,
        );
        tips.push((
            edit,
            if id == 122 {
                "最近小时（0=全部）"
            } else {
                name
            },
        ));
    }
    click(
        h,
        (634, y, CW - 634, 36),
        "搜索 / 刷新",
        Btn::Normal,
        |h| apply_log_filter(h),
    );
    y += 36 + 12;
    let levels = ["", "info", "success", "warn", "error", "debug"];
    let first = reserve(levels.len() as u16);
    let group: Vec<u16> = (0..levels.len() as u16).map(|i| first + i).collect();
    // `.seg`: the levels sit in one field-coloured strip, 3px inside its border.
    let titles: Vec<&str> = levels
        .iter()
        .map(|value| {
            if value.is_empty() {
                "全部"
            } else {
                level_label(value)
            }
        })
        .collect();
    let widths: Vec<i32> = titles
        .iter()
        .map(|title| width_of(title, Font::Small) + 22)
        .collect();
    surface(0, y, widths.iter().sum::<i32>() + 6, 34, Surface::Field);
    let mut x = 3;
    for (i, value) in levels.into_iter().enumerate() {
        let id = first + i as u16;
        let title = titles[i];
        let width = widths[i];
        let group = group.clone();
        register(
            id,
            act(move |h| {
                select(h, &group, id);
                ui().query.level = value.into();
                reload_logs();
            }),
        );
        let active = query.level == value || (value.is_empty() && query.level == "all");
        let c = Control {
            btn: Btn::Pill(active),
            ..at(Kind::Button, id, (x, y + 3, width, 28))
        };
        make(h, w!("BUTTON"), title, c, 0);
        x += width;
    }
    x += 3;
    // Single line, so the count never wraps.
    label(
        h,
        91,
        (x + 12, y + 7, CW - x - 12, 20),
        "",
        Look {
            align: 2,
            ..single(Font::Tiny, Ink::Secondary)
        },
    );
    y += 34 + 12;
    surface(0, y, CW, 2, Surface::Ink);
    let list_top = y + 2;
    let list_height = 420;
    let c = at(Kind::List, 100, (0, list_top, CW, list_height));
    let list = make(
        h,
        WC_LISTVIEWW,
        "",
        c,
        LVS_REPORT | LVS_OWNERDATA | LVS_SINGLESEL | LVS_SHOWSELALWAYS | LVS_NOCOLUMNHEADER,
    );
    SendMessageW(
        list,
        LVM_SETEXTENDEDLISTVIEWSTYLE,
        Some(WPARAM(
            (LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER) as usize,
        )),
        Some(LPARAM(
            (LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER) as isize,
        )),
    );
    let (dpi, k) = {
        let s = ui();
        (s.dpi, s.layout_scale)
    };
    for (index, (title, width)) in [
        ("时间", 176),
        ("级别", 64),
        ("来源", 120),
        ("消息", CW - 176 - 64 - 120 - 24),
    ]
    .into_iter()
    .enumerate()
    {
        let mut title = wide(title);
        let column = LVCOLUMNW {
            mask: LVCF_TEXT | LVCF_WIDTH,
            cx: scale((width as f64 * k) as i32, dpi),
            pszText: PWSTR(title.as_mut_ptr()),
            ..Default::default()
        };
        SendMessageW(
            list,
            LVM_INSERTCOLUMNW,
            Some(WPARAM(index)),
            Some(LPARAM((&column as *const LVCOLUMNW) as isize)),
        );
    }
    color_list(list, dark);
    SendMessageW(list, LVM_SETITEMCOUNT, Some(WPARAM(rows)), None);
    label(
        h,
        92,
        (0, list_top + 150, CW, 60),
        "正在读取日志…",
        centered(Font::Normal, Ink::Secondary),
    );
    y = list_top + list_height + 1;
    surface(0, y, CW, 1, Surface::Rule);
    y += 12;
    // Footer: paging on the left; scope and format dropdowns, export and clear on the right,
    // all 36 high on one line.
    let pager = width_of("上一页", Font::Medium) + 30;
    click(h, (0, y, pager, 36), "上一页", Btn::Normal, |_| {
        let q = {
            let mut s = ui();
            let Some(cursor) = s.cursors.pop() else {
                return;
            };
            s.query.cursor = cursor;
            s.query.clone()
        };
        send(Command::Logs(q));
    });
    click(
        h,
        (pager + 8, y, pager, 36),
        "下一页",
        Btn::Normal,
        |_| {
            let q = {
                let mut s = ui();
                let Some(next) = s.next.clone() else {
                    return;
                };
                let old = s.query.cursor.clone();
                s.cursors.push(old);
                s.query.cursor = Some(next);
                s.query.clone()
            };
            send(Command::Logs(q));
        },
    );
    let export_width = width_of("导出日志", Font::Medium) + 30;
    let clear_width = width_of("清除日志", Font::Medium) + 30;
    let menu = 150;
    let x = CW - clear_width - 8 - export_width - 12 - menu - 10 - menu;
    let scope = ["全部保留日志".to_string(), "当前筛选结果".to_string()];
    let chosen = usize::from(draft("log.scope", "0") == "1");
    let first_menu = ui().next_id;
    dropdown(
        h,
        (x, y, menu),
        "导出范围",
        &scope,
        chosen,
        true,
        |_, i| set_draft("log.scope", &i.to_string()),
    );
    let x = x + menu + 10;
    let formats = ["可读文本 LOG".to_string(), "结构化 JSON".to_string()];
    let chosen = usize::from(draft("log.format", "0") == "1");
    dropdown(h, (x, y, menu), "格式", &formats, chosen, true, |_, i| {
        set_draft("log.format", &i.to_string())
    });
    for (id, name) in [(first_menu, "导出范围"), (first_menu + 1, "格式")] {
        if let Ok(combo) = GetDlgItem(Some(h), id as i32) {
            tips.push((combo, name));
        }
    }
    click(
        h,
        (CW - clear_width - 8 - export_width, y, export_width, 36),
        "导出日志",
        Btn::Normal,
        |_| {
            let query = if draft("log.scope", "0") == "1" {
                let mut q = ui().query.clone();
                q.cursor = None;
                q
            } else {
                LogQuery::default()
            };
            let format = if draft("log.format", "0") == "1" {
                "json"
            } else {
                "text"
            };
            send(Command::ExportLogs {
                query,
                format: format.into(),
            });
        },
    );
    click(
        h,
        (CW - clear_width, y, clear_width, 36),
        "清除日志",
        Btn::Danger,
        |h| {
            if MessageBoxW(
                Some(h),
                w!("清空全部保留日志？此操作无法撤销。"),
                w!("清除日志"),
                MB_YESNO | MB_ICONWARNING,
            ) == IDYES
            {
                send(Command::ClearLogs);
            }
        },
    );
    tooltips(h, &tips);
    log_status(h, None);
    send(Command::Logs(query));
}
unsafe fn color_list(list: HWND, dark: bool) {
    let p = Palette::new(dark);
    SendMessageW(
        list,
        LVM_SETBKCOLOR,
        None,
        Some(LPARAM(p.ground.0 as isize)),
    );
    SendMessageW(
        list,
        LVM_SETTEXTBKCOLOR,
        None,
        Some(LPARAM(p.ground.0 as isize)),
    );
    SendMessageW(
        list,
        LVM_SETTEXTCOLOR,
        None,
        Some(LPARAM(p.text.0 as isize)),
    );
}
/// Count line and empty state; `total` is known once a Logs reply arrived.
unsafe fn log_status(h: HWND, total: Option<u64>) {
    let (loaded, filtered) = {
        let s = ui();
        let q = &s.query;
        (
            s.rows.len() as u64,
            !q.keyword.is_empty()
                || !q.source.is_empty()
                || q.start_time.is_some()
                || !(q.level.is_empty() || q.level == "all"),
        )
    };
    if let Some(total) = total {
        set_text(
            h,
            91,
            &format!("共 {} 条，已加载 {loaded} 条", total.max(loaded)),
        );
        set_text(
            h,
            92,
            if filtered {
                "没有匹配的日志"
            } else {
                "暂无日志记录\n记录会在连接、认证或设置变更后显示"
            },
        );
    }
    if let Ok(list) = GetDlgItem(Some(h), 100) {
        let _ = ShowWindow(list, if loaded == 0 { SW_HIDE } else { SW_SHOW });
    }
    if let Ok(empty) = GetDlgItem(Some(h), 92) {
        let _ = ShowWindow(empty, if loaded == 0 { SW_SHOW } else { SW_HIDE });
    }
}
fn detail_text(entry: &Value) -> String {
    format!(
        "{}{}",
        entry["message"].as_str().unwrap_or(""),
        if entry["data"].is_null() {
            String::new()
        } else {
            format!(
                "\r\n\r\n{}",
                serde_json::to_string_pretty(&entry["data"])
                    .unwrap_or_default()
                    .replace('\n', "\r\n")
            )
        }
    )
}
unsafe fn detail_page(h: HWND) {
    let (entry, bias) = {
        let s = ui();
        (s.detail.clone(), s.bias)
    };
    let top = heading(h, 0, 8, CW, "日志详情", "") + 14;
    let kind = entry["level"].as_str().unwrap_or("");
    badge(
        h,
        0,
        top,
        level_label(kind),
        Badge::Level(level_index(kind)),
    );
    let top = top + 30;
    let top = para(
        h,
        0,
        top,
        CW,
        &format_time(entry["timestamp"].as_u64().unwrap_or(0), bias),
        single(Font::Mono, Ink::Secondary),
    ) + 4;
    let top = para(
        h,
        0,
        top,
        CW,
        entry["source"].as_str().unwrap_or("应用"),
        single(Font::Normal, Ink::Secondary),
    ) + 12;
    surface(0, top, CW, 300, Surface::Field);
    let c = Control {
        look: look(Font::Mono, Ink::Text),
        field: true,
        ..at(Kind::ReadOnly, 160, (12, top + 12, CW - 24, 276))
    };
    make(
        h,
        w!("EDIT"),
        &detail_text(&entry),
        c,
        ES_MULTILINE as u32 | ES_AUTOVSCROLL as u32 | WS_VSCROLL.0,
    );
    let top = top + 316;
    click(h, (0, top, 120, 36), "复制详情", Btn::Normal, |h| {
        if let Ok(edit) = GetDlgItem(Some(h), 160) {
            SendMessageW(edit, EM_SETSEL, Some(WPARAM(0)), Some(LPARAM(-1)));
            SendMessageW(edit, WM_COPY, None, None);
            feedback(h, "已复制日志详情");
        }
    });
    click(h, (128, top, 120, 36), "返回日志", Btn::Normal, |h| {
        go(h, LOGS)
    });
}
unsafe fn about_page(h: HWND) {
    // Layout as in linux.rs: a 320×200 version card beside the name, then 核心功能 | 更新检查
    // over 项目信息.
    surface(0, 0, 320, 200, Surface::Face(false));
    label(
        h,
        0,
        (24, 22, 140, 16),
        "NETMATE",
        single(Font::Tiny, Ink::FaceSoft),
    );
    label(
        h,
        0,
        (164, 22, 132, 16),
        concat!("v", env!("CARGO_PKG_VERSION")),
        Look {
            align: 2,
            ..single(Font::Mono, Ink::FaceSoft)
        },
    );
    label(
        h,
        0,
        (24, 56, 46, 34),
        "",
        Look {
            shape: Shape::Chip(false),
            ..Default::default()
        },
    );
    label(
        h,
        0,
        (24, 104, 272, 40),
        "NetMate",
        single(Font::Name, Ink::Face),
    );
    label(
        h,
        0,
        (24, 156, 272, 22),
        "TUST CAMPUS NETWORK",
        single(Font::Mono, Ink::Face),
    );
    let x = 320 + 36;
    let names = CW - x;
    label(
        h,
        0,
        (x, 44, names, 42),
        "NetMate",
        single(Font::Name, Ink::Text),
    );
    label(
        h,
        0,
        (x, 94, names, 22),
        "智能 WiFi 管理工具",
        single(Font::Normal, Ink::Secondary),
    );
    let version = concat!("版本 ", env!("CARGO_PKG_VERSION"));
    badge(h, x, 124, version, Badge::Auth);
    let top = 200 + 32;
    // Left column: core features.
    let mut y = heading(h, 0, top, COL, "核心功能", "");
    for item in [
        "WiFi 自动重连（三阶段优先级切换）",
        "校园网认证自动登录",
        "多账户管理",
        "网络状态监控",
        "心跳检测与断线重连",
    ] {
        label(
            h,
            0,
            (0, y + 12, 16, 16),
            "",
            Look {
                shape: Shape::Glyph(3, Ink::Ok),
                ..Default::default()
            },
        );
        label(
            h,
            0,
            (26, y + 9, COL - 26, 22),
            item,
            single(Font::Normal, Ink::Text),
        );
        y += 40;
        hairline(0, y - 1, COL);
    }
    // Right column: update check above project information.
    let x = COL + 32;
    let y = heading(h, x, top, COL, "更新检查", "");
    let y = update_view(h, x, y + 10, COL) + 24;
    let mut y = heading(h, x, y, COL, "项目信息", "");
    for (title, url) in [
        (
            "GitHub 仓库",
            "https://github.com/Twiink/TUST-CampusNetwork-Login",
        ),
        (
            "问题反馈",
            "https://github.com/Twiink/TUST-CampusNetwork-Login/issues",
        ),
    ] {
        label(
            h,
            0,
            (x, y + 10, 96, 22),
            title,
            single(Font::Strong, Ink::GoldText),
        );
        // Without Win32_UI_Shell there is no ShellExecuteW; the address stays selectable.
        let c = Control {
            look: look(Font::Small, Ink::Secondary),
            ..at(Kind::ReadOnly, 0, (x + 100, y + 12, COL - 100, 20))
        };
        make(h, w!("EDIT"), url, c, ES_AUTOHSCROLL as u32);
        y += 42;
        hairline(x, y - 1, COL);
    }
    let quit = width_of("退出 NetMate", Font::Medium) + 30;
    label(
        h,
        0,
        (x, y + 15, COL - quit - 12, 20),
        "© 2026 NetMate. All rights reserved.",
        single(Font::Small, Ink::Secondary),
    );
    click(
        h,
        (x + COL - quit, y + 8, quit, 34),
        "退出 NetMate",
        Btn::Danger,
        |h| {
            send(Command::Quit);
            let _ = DestroyWindow(h);
        },
    );
    hairline(x, y + 50, COL);
}
/// The update status label; a progress reply only rewrites its text.
const UPDATE_TEXT: u16 = 960;
/// Status lines that fit the label height measured for any other short status.
fn single_line(text: &str) -> bool {
    text.chars().count() <= 24 && !text.contains('\n')
}
/// The status line and action set the update block shows for `update`.
fn update_message(update: &Value) -> (String, Vec<(&'static str, Command, bool)>) {
    let phase = update["state"].as_str().unwrap_or("");
    let available = update["release"]["version"].as_str();
    let checking = update["checking"] == true;
    let message = if checking {
        "正在检查更新...".to_string()
    } else if let Some(error) = update["error"].as_str() {
        format!("更新失败：{error}")
    } else {
        match phase {
            "downloading" => match (update["received"].as_u64(), update["total"].as_u64()) {
                (Some(r), Some(t)) if t > 0 => format!("正在下载更新 {}%", r * 100 / t),
                _ => "正在下载更新...".into(),
            },
            "downloaded" => "更新已下载，可以安装".into(),
            "failed" => "下载失败，请重试".into(),
            _ => match available {
                Some(v) => format!("发现新版本 {v}"),
                None if update["latest"] == true => "当前已是最新版本".into(),
                None => "点击检查是否有新版本".into(),
            },
        }
    };
    let mut actions: Vec<(&str, Command, bool)> = match phase {
        "downloading" => vec![
            ("查看下载进度", Command::UpdateStatus, false),
            ("取消下载", Command::UpdateCancel, false),
        ],
        "downloaded" => vec![("立即安装", Command::UpdateInstall, false)],
        _ if available.is_some() => vec![("下载更新", Command::UpdateDownload, false)],
        _ => vec![],
    };
    actions.push((
        "检查更新",
        Command::UpdateCheck,
        checking || phase == "downloading",
    ));
    (message, actions)
}
/// The update block: status text above the actions the agent's update state allows.
/// Returns the bottom edge.
unsafe fn update_view(h: HWND, x: i32, y: i32, width: i32) -> i32 {
    let update = ui().update.clone();
    let (message, actions) = update_message(&update);
    let height = measure(&message, Font::Small, width);
    let top = label(
        h,
        UPDATE_TEXT,
        (x, y, width, height),
        &message,
        look(Font::Small, Ink::Secondary),
    ) + 10;
    let mut left = x;
    for (title, command, disabled) in actions {
        let w = width_of(title, Font::Medium) + 30;
        let checking = matches!(command, Command::UpdateCheck);
        button(
            h,
            (left, top, w, 34),
            title,
            if matches!(command, Command::UpdateDownload | Command::UpdateInstall) {
                Btn::Primary
            } else {
                Btn::Normal
            },
            Some(act(move |h| {
                if send(command.clone()) && checking {
                    ui().update["checking"] = json!(true);
                    render(h);
                }
            })),
            disabled,
        );
        left += w + 8;
    }
    top + 34
}
unsafe fn on_theme(h: HWND) {
    let dark = {
        let mut s = ui();
        s.dark = !s.dark;
        s.dark
    };
    start_toggle(h, dark);
    crate::theme::save_later(dark, client::report);
    refresh_brushes();
    appearance::titlebar(h, dark);
    // The page is repainted, not rebuilt, so typed text survives the switch.
    set_text(
        h,
        901,
        if dark {
            "切换至白天模式"
        } else {
            "切换至黑夜模式"
        },
    );
    if let Ok(list) = GetDlgItem(Some(h), 100) {
        color_list(list, dark);
    }
    let _ = RedrawWindow(
        Some(h),
        None,
        None,
        RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN,
    );
}
/// Runs the 0.3 s switch transition towards `dark`, or jumps there when animations are off.
unsafe fn start_toggle(h: HWND, dark: bool) {
    ui().toggle.night = dark;
    animate_toggle(h);
}
/// Starts the 16 ms frame timer for a theme or hover change; `step_toggle` stops it once nothing
/// moves, so the switch never animates while idle. With system animations off the switch jumps
/// to its end state and no timer runs.
unsafe fn animate_toggle(h: HWND) {
    let start = {
        let mut s = ui();
        if !appearance::animations_enabled() {
            s.toggle.settle();
            false
        } else {
            s.toggle.retarget();
            let start = !s.toggle.ticking;
            if start {
                s.toggle.ticking = true;
            }
            start
        }
    };
    if start {
        SetTimer(Some(h), TOGGLE_TIMER, 16, None);
    } else if !ui().toggle.ticking {
        let _ = KillTimer(Some(h), TOGGLE_TIMER);
    }
    if let Ok(toggle) = GetDlgItem(Some(h), 901) {
        let _ = InvalidateRect(Some(toggle), None, false);
    }
}
/// One frame of the switch; only the switch repaints, and the timer stops when nothing moves.
unsafe fn step_toggle(h: HWND) {
    let running = {
        let mut s = ui();
        let running = s.toggle.step(std::time::Instant::now());
        s.toggle.ticking = running;
        running
    };
    if !running {
        let _ = KillTimer(Some(h), TOGGLE_TIMER);
    }
    if let Ok(toggle) = GetDlgItem(Some(h), 901) {
        let _ = InvalidateRect(Some(toggle), None, false);
    }
}
unsafe fn on_command(h: HWND, id: u16, code: u32) {
    if code == EN_CHANGE {
        let key = ui().edit_keys.get(&id).cloned();
        if let Some(key) = key {
            let value = text(h, id);
            set_draft(&key, &value);
        }
        if NUMBERS.iter().any(|(n, ..)| *n == id) {
            SetTimer(Some(h), 2, 600, None);
        }
        return;
    }
    if ui().combos.contains_key(&id) {
        on_combo(h, id, code);
        return;
    }
    if code != BN_CLICKED {
        return;
    }
    match id {
        901 => on_theme(h),
        1 | 4 | 5 | 6 => {
            if id == LOGS {
                let mut s = ui();
                s.query.cursor = None;
                s.cursors.clear();
            }
            go(h, id)
        }
        _ => {
            let action = ui().actions.get(&id).cloned();
            if let Some(action) = action {
                action(h);
            }
        }
    }
}
/// Dropdown notifications: selection changes go to the handler; open and focus repaint the face.
unsafe fn on_combo(h: HWND, id: u16, code: u32) {
    let Ok(combo) = GetDlgItem(Some(h), id as i32) else {
        return;
    };
    match code {
        CBN_SELCHANGE => {
            let index = SendMessageW(combo, CB_GETCURSEL, None, None).0;
            let handler = ui().combos.get(&id).cloned();
            if let (Some(handler), true) = (handler, index >= 0) {
                handler(h, index as usize);
            }
        }
        CBN_DROPDOWN => ui().combo_open = id,
        CBN_CLOSEUP => ui().combo_open = 0,
        CBN_SETFOCUS => ui().combo_focus = id,
        CBN_KILLFOCUS => {
            let mut s = ui();
            s.combo_focus = 0;
            s.combo_open = 0;
        }
        _ => return,
    }
    let _ = InvalidateRect(Some(combo), None, false);
}
unsafe fn on_state(h: HWND, v: Value) {
    if v["phase"] == "exiting" {
        let _ = DestroyWindow(h);
        return;
    }
    let refresh = {
        let mut s = ui();
        let refresh = s.page == LOGS
            && s.query.cursor.is_none()
            && v["logRevision"] != s.state["logRevision"];
        s.state = v;
        refresh.then(|| s.query.clone())
    };
    refresh_home(h);
    if let Some(query) = refresh {
        send(Command::Logs(query));
    }
}
/// Only the failed command's pending flag is reset; a lost subscription changes no flag.
unsafe fn on_error(h: HWND, command: Option<Command>, error: &str) {
    let (saving, scanning, checking, page) = {
        let mut s = ui();
        let flags = (
            s.saving && matches!(command, Some(Command::SaveConfig(_))),
            s.scanning && matches!(command, Some(Command::Scan)),
            s.update["checking"] == true && matches!(command, Some(Command::UpdateCheck)),
            s.page,
        );
        if flags.0 {
            s.saving = false;
            s.clear_on_save.clear();
        }
        if flags.1 {
            s.scanning = false;
        }
        if flags.2 {
            s.update["checking"] = json!(false);
            s.update["error"] = json!(error);
        }
        flags
    };
    feedback(h, error);
    if saving {
        send(Command::Config);
    }
    if (scanning && page == SETTINGS) || (checking && page == ABOUT) {
        render(h);
    }
}
unsafe fn on_reply(h: HWND, command: Command, value: Value) {
    let previous_update = ui().update.clone();
    match command {
        Command::UiReady { .. } => {}
        Command::Snapshot => on_state(h, value),
        Command::Config | Command::SaveConfig(_) => {
            let saved = matches!(command, Command::SaveConfig(_));
            let page = {
                let mut s = ui();
                s.config = value;
                if saved {
                    s.saving = false;
                    let prefixes: Vec<String> = s.clear_on_save.drain(..).collect();
                    s.drafts
                        .retain(|key, _| !prefixes.iter().any(|p| key.starts_with(p.as_str())));
                }
                s.page
            };
            if saved {
                feedback(h, "配置已保存并生效");
            }
            flush();
            match page {
                HOME => refresh_home(h),
                LOGS | DETAIL => {}
                _ => render(h),
            }
            if ui().ready {
                return;
            }
            // The first config makes the page complete; UiReady follows its first paint.
            let _ = InvalidateRect(Some(h), None, false);
        }
        Command::Scan => {
            let page = {
                let mut s = ui();
                s.scan = value;
                s.scanning = false;
                s.page
            };
            if page == SETTINGS {
                render(h);
            }
        }
        Command::Logs(ref query) => {
            let (count, total) = {
                let mut s = ui();
                let generation = value["generation"].as_u64().unwrap_or(0);
                if s.page != LOGS || s.query != *query || generation < s.log_generation {
                    return;
                }
                s.log_generation = generation;
                s.rows = value["entries"].as_array().cloned().unwrap_or_default();
                s.next = if value["hasMore"] == true {
                    value["nextCursor"].as_str().map(str::to_owned)
                } else {
                    None
                };
                (s.rows.len(), value["total"].as_u64().unwrap_or(0))
            };
            if let Ok(list) = GetDlgItem(Some(h), 100) {
                SendMessageW(list, LVM_SETITEMCOUNT, Some(WPARAM(count)), None);
                let _ = InvalidateRect(Some(list), None, false);
            }
            log_status(h, Some(total));
        }
        Command::ClearLogs => {
            {
                let mut s = ui();
                s.log_generation = value.as_u64().unwrap_or(s.log_generation + 1);
                s.rows.clear();
                s.next = None;
            }
            if let Ok(list) = GetDlgItem(Some(h), 100) {
                SendMessageW(list, LVM_SETITEMCOUNT, Some(WPARAM(0)), None);
            }
            log_status(h, None);
            reload_logs();
        }
        Command::ExportLogs { .. } => feedback(
            h,
            &format!("日志已导出：{}", value["path"].as_str().unwrap_or("")),
        ),
        Command::UpdateCheck => {
            let latest = value.is_null();
            ui().update = json!({"release": value, "latest": latest, "checking": false});
        }
        Command::UpdateDownload | Command::UpdateStatus => {
            let mut s = ui();
            if let Some(fields) = value.as_object() {
                for (key, field) in fields {
                    s.update[key] = field.clone();
                }
            }
        }
        Command::UpdateCancel => {
            ui().update["state"] = json!("idle");
            feedback(h, "已取消下载");
        }
        Command::UpdateInstall => feedback(h, "正在安装更新…"),
        _ => feedback(
            h,
            &if value == true {
                "操作已提交".into()
            } else {
                value.to_string()
            },
        ),
    }
    if matches!(
        command,
        Command::UpdateCheck
            | Command::UpdateDownload
            | Command::UpdateStatus
            | Command::UpdateCancel
    ) && ui().page == ABOUT
    {
        let (before, after) = {
            let mut s = ui();
            // Polls the download once a second while the About page shows it.
            s.poll_update = s.update["state"] == "downloading";
            (previous_update, s.update.clone())
        };
        // A progress tick keeps the same actions and a one-line status; only the text changes.
        let (old_text, old_actions) = update_message(&before);
        let (new_text, new_actions) = update_message(&after);
        let same_actions = old_actions
            .iter()
            .map(|a| (a.0, a.2))
            .eq(new_actions.iter().map(|a| (a.0, a.2)));
        if same_actions && old_text != new_text && single_line(&old_text) && single_line(&new_text)
        {
            set_text(h, UPDATE_TEXT, &new_text);
        } else if !same_actions || old_text != new_text {
            render(h);
        }
    }
}
unsafe fn find(handle: HWND) -> Option<Control> {
    ui().children
        .iter()
        .find(|c| c.handle == handle.0 as isize)
        .cloned()
}
/// Text of option `index` of a dropdown; -1 means the chosen option.
unsafe fn combo_text(combo: HWND, index: isize) -> String {
    let index = if index < 0 {
        SendMessageW(combo, CB_GETCURSEL, None, None).0
    } else {
        index
    };
    if index < 0 {
        return String::new();
    }
    let length = SendMessageW(combo, CB_GETLBTEXTLEN, Some(WPARAM(index as usize)), None).0;
    if length <= 0 {
        return String::new();
    }
    let mut text = vec![0u16; length as usize + 1];
    let copied = SendMessageW(
        combo,
        CB_GETLBTEXT,
        Some(WPARAM(index as usize)),
        Some(LPARAM(text.as_mut_ptr() as isize)),
    )
    .0;
    String::from_utf16_lossy(&text[..copied.clamp(0, length) as usize])
}
unsafe fn item_text(item: &DRAWITEMSTRUCT) -> String {
    if item.CtlType == ODT_COMBOBOX {
        let index = if item.itemID == u32::MAX {
            -1
        } else {
            item.itemID as isize
        };
        return combo_text(item.hwndItem, index);
    }
    let mut text = vec![0u16; (GetWindowTextLengthW(item.hwndItem) + 1).max(1) as usize];
    let length = GetWindowTextW(item.hwndItem, &mut text);
    String::from_utf16_lossy(&text[..length.max(0) as usize])
}
unsafe fn draw_item(h: HWND, item: &DRAWITEMSTRUCT) {
    let (dark, dpi, fonts) = {
        let s = ui();
        (s.dark, s.dpi, s.fonts)
    };
    if item.CtlType == ODT_COMBOBOX && item.itemState.0 & ODS_COMBOBOXEDIT.0 != 0 {
        // The face is painted by `paint_combo`; a direct redraw of the selection repaints it.
        let _ = InvalidateRect(Some(item.hwndItem), None, false);
        return;
    }
    // Options in an open dropdown list are drawn on the list's own surface.
    if item.CtlType == ODT_COMBOBOX {
        if item.itemID == u32::MAX {
            return;
        }
        let chosen =
            SendMessageW(item.hwndItem, CB_GETCURSEL, None, None).0 == item.itemID as isize;
        appearance::combo_item(item, dark, &fonts, dpi, &item_text(item), chosen);
        return;
    }
    let Some(control) = find(item.hwndItem) else {
        return;
    };
    let root = client(h);
    let (scroll, page, surfaces, toggle) = {
        let s = ui();
        (s.scroll, s.page, s.surfaces.clone(), s.toggle)
    };
    let (x, y, _, _) = place(&control, root, dpi, scroll);
    if control.btn == Btn::Toggle {
        // The switch repaints every frame of its transition, so it is drawn off screen first.
        let r = item.rcItem;
        let (width, height) = (r.right - r.left, r.bottom - r.top);
        let memory = CreateCompatibleDC(Some(item.hDC));
        let bitmap = CreateCompatibleBitmap(item.hDC, width, height);
        let old = SelectObject(memory, bitmap.into());
        let _ = SetViewportOrgEx(memory, -x, -y, None);
        appearance::background(memory, root, dark, dpi, &surfaces, scroll);
        let _ = SetViewportOrgEx(memory, 0, 0, None);
        let focused = item.itemState.0 & ODS_FOCUS.0 != 0;
        let local = RECT {
            left: 0,
            top: 0,
            right: width,
            bottom: height,
        };
        appearance::toggle(memory, local, dpi, &toggle, focused);
        let _ = BitBlt(
            item.hDC,
            r.left,
            r.top,
            width,
            height,
            Some(memory),
            0,
            0,
            SRCCOPY,
        );
        SelectObject(memory, old);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        return;
    }
    // Owner-drawn controls repaint the window background behind themselves first.
    let saved = SaveDC(item.hDC);
    let _ = SetViewportOrgEx(item.hDC, -x, -y, None);
    appearance::background(item.hDC, root, dark, dpi, &surfaces, scroll);
    let _ = RestoreDC(item.hDC, saved);
    let backdrop = appearance::Backdrop {
        root,
        dark,
        dpi,
        surfaces: &surfaces,
        scroll,
        origin: (x, y),
    };
    if item.CtlType == ODT_STATIC {
        appearance::static_text(item, control.look, dark, &fonts, dpi, &backdrop);
    } else {
        let active = control.btn == Btn::Nav && page_group(page) == control.id;
        appearance::button(
            item,
            control.btn,
            active,
            dark,
            &fonts,
            dpi,
            &item_text(item),
            &backdrop,
        );
    }
}
unsafe fn control_color(message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    let dc = HDC(w.0 as *mut _);
    let control = find(HWND(l.0 as *mut _));
    let s = ui();
    let p = Palette::new(s.dark);
    let input = control.as_ref().is_some_and(|c| c.field);
    let ink = control
        .as_ref()
        .filter(|c| c.kind == Kind::ReadOnly)
        .map(|c| c.look.ink.color(s.dark))
        .unwrap_or(p.text);
    let _ = SetTextColor(dc, ink);
    let _ = SetBkColor(dc, if input { p.field } else { p.ground });
    if message == WM_CTLCOLORSTATIC || message == WM_CTLCOLORBTN {
        let _ = SetBkMode(dc, TRANSPARENT);
    }
    LRESULT(if input { s.input_brush } else { s.ground_brush })
}
unsafe fn list_notify(h: HWND, l: LPARAM) -> LRESULT {
    let header = &*(l.0 as *const NMHDR);
    if header.code == LVN_GETDISPINFOW {
        let info = &mut *(l.0 as *mut NMLVDISPINFOW);
        if !info.item.mask.contains(LVIF_TEXT) {
            return LRESULT(0);
        }
        let s = ui();
        if let Some(row) = s.rows.get(info.item.iItem.max(0) as usize) {
            let value = match info.item.iSubItem {
                0 => format_time(row["timestamp"].as_u64().unwrap_or(0), s.bias),
                1 => level_label(row["level"].as_str().unwrap_or("")).to_string(),
                2 => row["source"].as_str().unwrap_or("应用").to_string(),
                _ => row["message"].as_str().unwrap_or("").replace('\n', " "),
            };
            let wide = wide(&value);
            if !info.item.pszText.is_null() && info.item.cchTextMax > 0 {
                let count = wide.len().min(info.item.cchTextMax as usize);
                std::ptr::copy_nonoverlapping(wide.as_ptr(), info.item.pszText.0, count - 1);
                *info.item.pszText.0.add(count - 1) = 0;
            }
        }
    } else if header.code == NM_CUSTOMDRAW {
        let draw = &mut *(l.0 as *mut NMLVCUSTOMDRAW);
        let stage = draw.nmcd.dwDrawStage.0;
        if stage == CDDS_PREPAINT.0 {
            return LRESULT(CDRF_NOTIFYITEMDRAW as isize);
        }
        if stage == CDDS_ITEMPREPAINT.0 {
            return LRESULT(CDRF_NOTIFYSUBITEMDRAW as isize);
        }
        if stage == CDDS_ITEMPREPAINT.0 | CDDS_SUBITEM.0 {
            let s = ui();
            let p = Palette::new(s.dark);
            let level = s
                .rows
                .get(draw.nmcd.dwItemSpec)
                .map(|r| level_index(r["level"].as_str().unwrap_or("")))
                .unwrap_or(5);
            draw.clrText = match draw.iSubItem {
                1 => Ink::Level(level).color(s.dark),
                0 | 2 => p.text2,
                _ => p.text,
            };
            draw.clrTextBk = p.ground;
            return LRESULT(CDRF_DODEFAULT as isize);
        }
    } else if header.code == NM_DBLCLK || header.code == NM_RETURN {
        let list = header.hwndFrom;
        let index = SendMessageW(
            list,
            LVM_GETNEXTITEM,
            Some(WPARAM(usize::MAX)),
            Some(LPARAM(LVNI_SELECTED as isize)),
        )
        .0;
        let entry = (index >= 0)
            .then(|| ui().rows.get(index as usize).cloned())
            .flatten();
        if let Some(entry) = entry {
            ui().detail = entry;
            go(h, DETAIL);
        }
    }
    LRESULT(0)
}
unsafe extern "system" fn proc(h: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match message {
        WM_PAINT => {
            let mut paint = PAINTSTRUCT::default();
            let dc = BeginPaint(h, &mut paint);
            let rect = client(h);
            {
                let s = ui();
                appearance::background(dc, rect, s.dark, s.dpi, &s.surfaces, s.scroll);
            }
            let _ = EndPaint(h, &paint);
            let mut s = ui();
            if !s.ready && !s.config.is_null() {
                s.ready = true;
                let _ = s.tx.try_send(Command::UiReady {
                    pid: std::process::id(),
                });
            }
            LRESULT(0)
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
        WM_ENTERSIZEMOVE => {
            ui().sizing = true;
            LRESULT(0)
        }
        WM_SIZE | WM_EXITSIZEMOVE => {
            // A minimized client is 0 wide; re-flowing for it would rebuild the page twice.
            if message == WM_SIZE && w.0 as u32 == SIZE_MINIMIZED {
                return LRESULT(0);
            }
            if message == WM_EXITSIZEMOVE {
                ui().sizing = false;
            }
            let (sizing, stale, page) = {
                let s = ui();
                let k = appearance::content_scale(client(h).right, s.dpi);
                (s.sizing, (k - s.layout_scale).abs() > 0.01, s.page)
            };
            // Text wrapping is measured at render time; pages without typed input re-flow.
            if !sizing && stale && matches!(page, HOME | ABOUT | LOGS) {
                render(h);
            } else {
                position_children(h);
            }
            LRESULT(0)
        }
        WM_DPICHANGED => {
            let old = refresh_fonts(h);
            let r = &*(l.0 as *const RECT);
            // The move sends WM_SIZE; `sizing` defers its re-flow to the render below.
            let resizing = std::mem::replace(&mut ui().sizing, true);
            let _ = SetWindowPos(
                h,
                None,
                r.left,
                r.top,
                r.right - r.left,
                r.bottom - r.top,
                SWP_NOZORDER | SWP_NOACTIVATE,
            );
            ui().sizing = resizing;
            render(h);
            delete_fonts(old);
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
                // Precision touchpads send fractions of a 120 notch; keep the remainder.
                let mut s = ui();
                let total = s.wheel_rest - ((w.0 >> 16) as i16 as i32) * 72;
                s.wheel_rest = total % 120;
                total / 120
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
                let mut s = ui();
                s.scroll = (s.scroll + delta).clamp(0, (info.nMax - info.nPage as i32 + 1).max(0));
            }
            layout_children(h, true);
            LRESULT(0)
        }
        WM_TIMER => {
            if w.0 == TOGGLE_TIMER {
                step_toggle(h);
            } else if w.0 == HOVER_TIMER {
                check_hover(h);
            } else if w.0 == 2 {
                let _ = KillTimer(Some(h), 2);
                save_numbers(h);
            } else {
                let (page, poll) = {
                    let mut s = ui();
                    let poll = s.poll_update;
                    s.poll_update = false;
                    (s.page, poll)
                };
                if page == HOME {
                    tick(h);
                } else if page == ABOUT && poll {
                    send(Command::UpdateStatus);
                }
            }
            LRESULT(0)
        }
        WM_MEASUREITEM => {
            let item = &mut *(l.0 as *mut MEASUREITEMSTRUCT);
            if item.CtlType == ODT_COMBOBOX {
                let dpi = ui().dpi;
                item.itemHeight =
                    scale(if item.itemID == u32::MAX { FACE } else { 34 }, dpi) as u32;
            }
            LRESULT(1)
        }
        WM_DRAWITEM => {
            draw_item(h, &*(l.0 as *const DRAWITEMSTRUCT));
            LRESULT(1)
        }
        WM_CTLCOLORSTATIC | WM_CTLCOLORBTN | WM_CTLCOLOREDIT | WM_CTLCOLORLISTBOX => {
            control_color(message, w, l)
        }
        WM_COMMAND => {
            let id = (w.0 & 0xffff) as u16;
            let code = ((w.0 >> 16) & 0xffff) as u32;
            if l.0 == 0 {
                // Enter from IsDialogMessageW arrives as IDOK without a control.
                if id == 1 && ui().page == LOGS {
                    apply_log_filter(h);
                }
            } else if code == BN_CLICKED {
                // Actions may rebuild the page, so they run after the click notification returns.
                let _ = PostMessageW(Some(h), ACTION, WPARAM(id as usize), LPARAM(0));
            } else {
                on_command(h, id, code);
            }
            LRESULT(0)
        }
        ACTION => {
            on_command(h, w.0 as u16, BN_CLICKED);
            LRESULT(0)
        }
        REPLY => {
            match *Box::from_raw(l.0 as *mut Event) {
                Event::State(v) => on_state(h, v),
                Event::Error(command, e) => on_error(h, command, &e),
                Event::Reply(command, value) => on_reply(h, command, value),
            }
            LRESULT(0)
        }
        WM_NOTIFY => {
            let header = &*(l.0 as *const NMHDR);
            if header.idFrom == 100 {
                list_notify(h, l)
            } else {
                LRESULT(0)
            }
        }
        WM_DESTROY => {
            for timer in [1, 2, TOGGLE_TIMER, HOVER_TIMER] {
                let _ = KillTimer(Some(h), timer);
            }
            {
                let mut s = ui();
                for object in s.fonts.into_iter().chain([s.ground_brush, s.input_brush]) {
                    let _ = DeleteObject(HGDIOBJ(object as *mut _));
                }
                s.children.clear();
            }
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(h, message, w, l),
    }
}
