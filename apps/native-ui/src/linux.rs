use crate::client::{self, Event};
use gtk::{gio, glib, prelude::*};
use netmate_core::{journal::LogQuery, protocol::Command};
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc};
struct Ui {
    window: gtk::ApplicationWindow,
    body: gtk::Box,
    status: gtk::Label,
    wifi_status: gtk::Label,
    account_status: gtk::Label,
    heartbeat_status: gtk::Label,
    navigation: Vec<(String, gtk::ToggleButton)>,
    feedback: gtk::Label,
    tx: async_channel::Sender<Command>,
    config: Value,
    network: Value,
    page: String,
    query: LogQuery,
    cursors: Vec<Option<String>>,
    next: Option<String>,
    log_entries: Vec<Value>,
    log_generation: u64,
    log_model: gtk::StringList,
}
pub fn run() {
    let app = gtk::Application::builder()
        .application_id("com.netmate.native.ui")
        .build();
    app.connect_activate(|app| {
        if let Some(window) = app.active_window() {
            window.present();
            return;
        }
        let window = gtk::ApplicationWindow::builder()
            .application(app)
            .title("NetMate")
            .default_width(1100)
            .default_height(820)
            .build();
        window.add_css_class("netmate");
        let provider = gtk::CssProvider::new();
        provider.load_from_string(include_str!("netmate.css"));
        gtk::style_context_add_provider_for_display(
            &gtk::prelude::WidgetExt::display(&window),
            &provider,
            gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
        let dark = crate::theme::saved_dark().unwrap_or_else(|| {
            gtk::Settings::default()
                .is_some_and(|settings| settings.is_gtk_application_prefer_dark_theme())
        });
        if dark {
            window.add_css_class("dark");
        }
        if let Some(settings) = gtk::Settings::default() {
            settings.set_gtk_application_prefer_dark_theme(dark);
        }
        let root = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        let sidebar = gtk::Box::new(gtk::Orientation::Vertical, 8);
        sidebar.add_css_class("sidebar");
        sidebar.set_width_request(170);
        let brand = gtk::Label::new(Some("NetMate"));
        brand.set_xalign(0.0);
        brand.add_css_class("brand");
        sidebar.append(&brand);
        root.append(&sidebar);
        let main = gtk::Box::new(gtk::Orientation::Vertical, 12);
        main.set_hexpand(true);
        main.set_vexpand(true);
        main.add_css_class("main-content");
        root.append(&main);
        let body = gtk::Box::new(gtk::Orientation::Vertical, 16);
        body.set_vexpand(true);
        main.append(&body);
        let feedback = gtk::Label::new(None);
        feedback.set_xalign(0.0);
        feedback.set_wrap(true);
        feedback.set_selectable(true);
        feedback.add_css_class("secondary");
        main.append(&feedback);
        window.set_child(Some(&root));
        let (tx, rx) = client::start();
        let state = Rc::new(RefCell::new(Ui {
            window: window.clone(),
            body,
            status: gtk::Label::new(None),
            wifi_status: gtk::Label::new(None),
            account_status: gtk::Label::new(None),
            heartbeat_status: gtk::Label::new(None),
            navigation: vec![],
            feedback,
            tx,
            config: Value::Null,
            network: Value::Null,
            page: "运行状态".into(),
            query: LogQuery::default(),
            cursors: vec![],
            next: None,
            log_entries: vec![],
            log_generation: 0,
            log_model: gtk::StringList::new(&[]),
        }));
        for (page, title, icon) in [
            ("运行状态", "运行状态", "network-workgroup-symbolic"),
            ("配置设置", "配置设置", "emblem-system-symbolic"),
            ("日志", "运行日志", "text-x-generic-symbolic"),
            ("关于", "关于", "help-about-symbolic"),
        ] {
            let item = gtk::ToggleButton::new();
            item.add_css_class("navigation");
            let row = gtk::Box::new(gtk::Orientation::Horizontal, 10);
            row.append(&gtk::Image::from_icon_name(icon));
            row.append(&gtk::Label::new(Some(title)));
            item.set_child(Some(&row));
            item.update_property(&[gtk::accessible::Property::Label(title)]);
            let ui = state.clone();
            item.connect_clicked(move |_| {
                ui.borrow_mut().page = page.into();
                render(&ui);
            });
            sidebar.append(&item);
            state.borrow_mut().navigation.push((page.into(), item));
        }
        let space = gtk::Box::new(gtk::Orientation::Vertical, 0);
        space.set_vexpand(true);
        sidebar.append(&space);
        let appearance = gtk::ToggleButton::new();
        appearance.add_css_class("theme-switch");
        appearance.set_halign(gtk::Align::Center);
        appearance.set_active(dark);
        let drawing = gtk::DrawingArea::new();
        drawing.set_content_width(72);
        drawing.set_content_height(32);
        let weak_toggle = appearance.downgrade();
        drawing.set_draw_func(move |_, context, width, height| {
            if let Some(toggle) = weak_toggle.upgrade() {
                draw_day_night(context, width, height, toggle.is_active());
            }
        });
        appearance.set_child(Some(&drawing));
        theme_accessibility(&appearance, dark);
        let weak = Rc::downgrade(&state);
        appearance.connect_toggled(move |toggle| {
            let Some(ui) = weak.upgrade() else { return };
            let dark = toggle.is_active();
            let ui = ui.borrow();
            if dark {
                ui.window.add_css_class("dark");
            } else {
                ui.window.remove_css_class("dark");
            }
            if let Some(settings) = gtk::Settings::default() {
                settings.set_gtk_application_prefer_dark_theme(dark);
            }
            theme_accessibility(toggle, dark);
            if let Some(child) = toggle.child() {
                child.queue_draw();
            }
            if let Err(error) = crate::theme::save(dark) {
                ui.feedback.set_text(&error.to_string());
            }
        });
        sidebar.append(&appearance);
        glib::spawn_future_local({
            let state = state.clone();
            async move {
                while let Ok(event) = rx.recv().await {
                    match event {
                        Event::State(v) => {
                            if v["phase"] == "exiting" {
                                state.borrow().window.close();
                                continue;
                            }
                            let mut s = state.borrow_mut();
                            let refresh = s.page == "日志"
                                && s.query.cursor.is_none()
                                && v["logRevision"] != s.network["logRevision"];
                            s.network = v;
                            refresh_home(&s);
                            if refresh {
                                let query = s.query.clone();
                                drop(s);
                                send(&state, Command::Logs(query));
                            }
                        }
                        Event::Error(e) => state.borrow().feedback.set_text(&e),
                        Event::Reply(command, value) => match command {
                            Command::UiReady { .. } => {}
                            Command::Config | Command::SaveConfig(_) => {
                                state.borrow_mut().config = value;
                                render(&state);
                            }
                            Command::Scan => scan_dialog(&state, value),
                            Command::Logs(query) => {
                                let mut s = state.borrow_mut();
                                let generation = value["generation"].as_u64().unwrap_or(0);
                                if s.page != "日志"
                                    || s.query != query
                                    || generation < s.log_generation
                                {
                                    continue;
                                }
                                s.log_generation = generation;
                                s.log_entries =
                                    value["entries"].as_array().cloned().unwrap_or_default();
                                s.next = if value["hasMore"] == true {
                                    value["nextCursor"].as_str().map(str::to_owned)
                                } else {
                                    None
                                };
                                s.log_model.splice(
                                    0,
                                    s.log_model.n_items(),
                                    &s.log_entries
                                        .iter()
                                        .map(|e| {
                                            format!(
                                                "[{}] {}  {}",
                                                e["level"].as_str().unwrap_or(""),
                                                e["source"].as_str().unwrap_or(""),
                                                e["message"]
                                                    .as_str()
                                                    .unwrap_or("")
                                                    .replace('\n', " ")
                                            )
                                        })
                                        .collect::<Vec<_>>()
                                        .iter()
                                        .map(String::as_str)
                                        .collect::<Vec<_>>(),
                                );
                                s.feedback
                                    .set_text(&format!("本页 {} 条日志", s.log_entries.len()));
                            }
                            Command::ClearLogs => {
                                let mut s = state.borrow_mut();
                                s.log_generation = value.as_u64().unwrap_or(s.log_generation + 1);
                                s.log_entries.clear();
                                s.log_model.splice(0, s.log_model.n_items(), &[]);
                                s.cursors.clear();
                                s.query.cursor = None;
                                let query = s.query.clone();
                                drop(s);
                                send(&state, Command::Logs(query));
                            }
                            Command::ExportLogs { .. } => {
                                state.borrow().feedback.set_text(&format!(
                                    "日志已导出：{}",
                                    value["path"].as_str().unwrap_or("")
                                ));
                                if let Some(path) = value["path"].as_str() {
                                    let _ = gio::AppInfo::launch_default_for_uri(
                                        &format!(
                                            "file://{}",
                                            std::path::Path::new(path).parent().unwrap().display()
                                        ),
                                        None::<&gio::AppLaunchContext>,
                                    );
                                }
                            }
                            _ => state.borrow().feedback.set_text(&if value == true {
                                "操作已提交".into()
                            } else {
                                value.to_string()
                            }),
                        },
                    }
                }
            }
        });
        let quit = gio::SimpleAction::new("quit", None);
        let close_window = window.clone();
        quit.connect_activate(move |_, _| close_window.close());
        app.add_action(&quit);
        let ready = Rc::new(std::cell::Cell::new(false));
        let weak = Rc::downgrade(&state);
        window.connect_map(move |window| {
            if let Some(clock) = window.frame_clock() {
                let ready = ready.clone();
                let weak = weak.clone();
                clock.connect_after_paint(move |_| {
                    if let Some(state) = weak.upgrade()
                        && !ready.get()
                        && !state.borrow().config.is_null()
                    {
                        ready.set(true);
                        send(
                            &state,
                            Command::UiReady {
                                pid: std::process::id(),
                            },
                        );
                    }
                });
            }
        });
        send(&state, Command::Config);
        window.present();
    });
    app.run();
}
fn theme_accessibility(toggle: &gtk::ToggleButton, dark: bool) {
    let name = if dark {
        "切换至白天模式"
    } else {
        "切换至黑夜模式"
    };
    toggle.set_tooltip_text(Some(name));
    toggle.update_property(&[gtk::accessible::Property::Label(name)]);
}
fn draw_day_night(context: &gtk::cairo::Context, width: i32, height: i32, dark: bool) {
    let _ = context.save();
    context.scale(width as f64 / 72.0, height as f64 / 32.0);
    let color = |hex: u32| {
        context.set_source_rgb(
            ((hex >> 16) & 255) as f64 / 255.0,
            ((hex >> 8) & 255) as f64 / 255.0,
            (hex & 255) as f64 / 255.0,
        )
    };
    context.arc(
        16.0,
        16.0,
        16.0,
        std::f64::consts::FRAC_PI_2,
        std::f64::consts::PI * 1.5,
    );
    context.arc(
        56.0,
        16.0,
        16.0,
        std::f64::consts::PI * 1.5,
        std::f64::consts::PI * 2.5,
    );
    context.close_path();
    context.clip();
    color(if dark { 0x191e32 } else { 0x4685c0 });
    let _ = context.paint();
    let circle = |x: f64, y: f64, r: f64| {
        context.arc(x, y, r, 0.0, std::f64::consts::TAU);
        let _ = context.fill();
    };
    if dark {
        color(0xffffff);
        for (x, y) in [(12.0, 9.0), (22.0, 19.0), (30.0, 8.0)] {
            circle(x, y, 0.9);
        }
    } else {
        color(0xe0f2fe);
        for (x, y, r) in [(55.0, 28.0, 12.0), (66.0, 23.0, 10.0), (40.0, 32.0, 10.0)] {
            circle(x, y, r);
        }
    }
    color(if dark { 0xc3c8d2 } else { 0xffc323 });
    circle(if dark { 56.0 } else { 16.0 }, 16.0, 12.0);
    if dark {
        color(0x96a0b4);
        for (x, y, r) in [(54.0, 12.0, 3.0), (60.0, 19.0, 2.0), (50.0, 20.0, 1.5)] {
            circle(x, y, r);
        }
    }
    let _ = context.restore();
}
fn send(s: &Rc<RefCell<Ui>>, command: Command) {
    if s.borrow().tx.try_send(command).is_err() {
        s.borrow().feedback.set_text("操作队列已满，请稍后重试")
    }
}
fn label(box_: &gtk::Box, text: &str) {
    let l = gtk::Label::new(Some(text));
    l.set_xalign(0.0);
    l.set_wrap(true);
    box_.append(&l);
}
fn button(box_: &gtk::Box, text: &str, f: impl Fn() + 'static) {
    let b = gtk::Button::with_label(text);
    if matches!(
        text,
        "立即连接" | "保存" | "保存并应用" | "添加认证账号" | "添加 WiFi"
    ) {
        b.add_css_class("primary");
    }
    if text.contains("删除") || text == "断开连接" {
        b.add_css_class("danger");
    }
    b.connect_clicked(move |_| f());
    box_.append(&b);
}
fn card(parent: &gtk::Box, title: &str) -> gtk::Box {
    let card = gtk::Box::new(gtk::Orientation::Vertical, 14);
    card.add_css_class("card");
    let heading = gtk::Label::new(Some(title));
    heading.set_xalign(0.0);
    heading.add_css_class("card-title");
    card.append(&heading);
    parent.append(&card);
    card
}
fn detail(text: &str) -> gtk::Label {
    let label = gtk::Label::new(Some(text));
    label.set_xalign(0.0);
    label.set_wrap(true);
    label.set_wrap_mode(gtk::pango::WrapMode::WordChar);
    label.set_max_width_chars(70);
    label.set_selectable(true);
    label
}
fn refresh_home(ui: &Ui) {
    let state = &ui.network;
    let n = &state["network"];
    ui.status.set_text(if state["internetReachable"] == true {
        "已连接"
    } else if matches!(
        state["phase"].as_str(),
        Some("connecting" | "authenticating" | "verifying")
    ) {
        "连接中…"
    } else {
        "未连接"
    });
    ui.status.remove_css_class("connected");
    ui.status.remove_css_class("disconnected");
    ui.status
        .add_css_class(if state["internetReachable"] == true {
            "connected"
        } else {
            "disconnected"
        });
    ui.wifi_status.set_text(&format!(
        "{}\nIPv4  {}    IPv6  {}\nBSSID  {}\n信号  {} dBm    频率  {} MHz    速率  {} Mbps",
        n["ssid"].as_str().unwrap_or("未连接 WiFi"),
        n["ipv4"].as_str().unwrap_or("未知"),
        n["ipv6"].as_str().unwrap_or("未知"),
        n["bssid"].as_str().unwrap_or("未知"),
        n["rssi"],
        n["frequency"],
        n["linkSpeed"]
    ));
    let account = ui.config["accounts"].as_array().and_then(|accounts| {
        accounts
            .iter()
            .find(|a| a["id"] == ui.config["currentAccountId"])
    });
    ui.account_status.set_text(
        &account
            .map(|a| {
                format!(
                    "{}\n{}",
                    a["username"].as_str().unwrap_or(""),
                    a["serverUrl"].as_str().unwrap_or("")
                )
            })
            .unwrap_or_else(|| "尚未配置认证账号，请在配置设置中添加账号并关联 WiFi。".into()),
    );
    ui.heartbeat_status.set_text(&format!(
        "{}  ·  每 {} 秒检测一次\n{}",
        if ui.config["settings"]["enableHeartbeat"] == true {
            "心跳检测已开启"
        } else {
            "心跳检测已关闭"
        },
        ui.config["settings"]["heartbeatIntervalSeconds"]
            .as_u64()
            .unwrap_or(30),
        if state["paused"] == true {
            "自动认证已暂停"
        } else {
            state["message"].as_str().unwrap_or("等待网络状态")
        }
    ));
}
fn render(state: &Rc<RefCell<Ui>>) {
    let body = state.borrow().body.clone();
    while let Some(child) = body.first_child() {
        body.remove(&child);
    }
    let page = state.borrow().page.clone();
    let config = state.borrow().config.clone();
    for (key, item) in &state.borrow().navigation {
        item.set_active(key == &page);
    }
    let title = gtk::Label::new(Some(match page.as_str() {
        "日志" => "运行日志",
        "账号" | "WiFi" | "设置" => "配置设置",
        _ => &page,
    }));
    title.set_xalign(0.0);
    title.add_css_class("page-title");
    body.append(&title);
    if page == "日志" {
        let panel = gtk::Box::new(gtk::Orientation::Vertical, 12);
        panel.add_css_class("card");
        panel.set_vexpand(true);
        body.append(&panel);
        logs(state, &panel);
        return;
    }
    let content = gtk::Box::new(gtk::Orientation::Vertical, 24);
    body.append(
        &gtk::ScrolledWindow::builder()
            .vexpand(true)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .child(&content)
            .build(),
    );
    match page.as_str() {
        "运行状态" => {
            let row = gtk::Box::new(gtk::Orientation::Horizontal, 24);
            row.set_homogeneous(true);
            content.append(&row);
            let connection = card(&row, "网络连接状态");
            let status = detail("");
            status.add_css_class("connection-state");
            connection.append(&status);
            let actions = gtk::Box::new(gtk::Orientation::Horizontal, 10);
            connection.append(&actions);
            for (text, command) in [("立即连接", Command::Login), ("断开连接", Command::Logout)]
            {
                let s = state.clone();
                button(&actions, text, move || send(&s, command.clone()));
            }
            let current = card(&row, "当前账号");
            let account = detail("");
            current.append(&account);
            let s = state.clone();
            button(&current, "配置账号", move || {
                s.borrow_mut().page = "配置设置".into();
                render(&s);
            });
            let wifi = card(&content, "当前 WiFi");
            let wifi_status = detail("");
            wifi.append(&wifi_status);
            let heartbeat = card(&content, "心跳检测");
            let heartbeat_status = detail("");
            heartbeat_status.add_css_class("secondary");
            heartbeat.append(&heartbeat_status);
            let s = state.clone();
            button(&heartbeat, "立即恢复网络", move || {
                send(&s, Command::Retry)
            });
            let s = state.clone();
            button(&heartbeat, "停止当前恢复", move || {
                send(&s, Command::StopRecovery)
            });
            let mut ui = state.borrow_mut();
            ui.status = status;
            ui.wifi_status = wifi_status;
            ui.account_status = account;
            ui.heartbeat_status = heartbeat_status;
            refresh_home(&ui);
        }
        "配置设置" | "账号" | "WiFi" | "设置" => {
            let accounts = card(&content, "账号配置");
            let s = state.clone();
            button(&accounts, "添加认证账号", move || {
                account_editor(&s, None)
            });
            for account in config["accounts"].as_array().into_iter().flatten() {
                let row = gtk::Box::new(gtk::Orientation::Horizontal, 12);
                let text = detail(&format!(
                    "{}  {}",
                    account["name"].as_str().unwrap_or(""),
                    account["username"].as_str().unwrap_or("")
                ));
                text.set_hexpand(true);
                row.append(&text);
                let s = state.clone();
                let account = account.clone();
                button(&row, "编辑", move || {
                    account_editor(&s, Some(account.clone()))
                });
                accounts.append(&row);
            }
            let wifi = card(&content, "WiFi 配置");
            let tools = gtk::Box::new(gtk::Orientation::Horizontal, 12);
            wifi.append(&tools);
            let s = state.clone();
            button(&tools, "扫描附近 WiFi", move || send(&s, Command::Scan));
            let s = state.clone();
            button(&tools, "添加 WiFi", move || wifi_editor(&s, None, None));
            for rule in config["wifiRules"].as_array().into_iter().flatten() {
                let row = gtk::Box::new(gtk::Orientation::Horizontal, 12);
                let text = detail(&format!(
                    "{}  ·  优先级 {}",
                    rule["ssid"].as_str().unwrap_or(""),
                    rule["priority"]
                ));
                text.set_hexpand(true);
                row.append(&text);
                let s = state.clone();
                let id = rule["id"].as_str().unwrap_or("").to_string();
                button(&row, "连接", move || {
                    send(&s, Command::Connect { id: id.clone() })
                });
                let s = state.clone();
                let rule = rule.clone();
                button(&row, "编辑", move || {
                    wifi_editor(&s, Some(rule.clone()), None)
                });
                wifi.append(&row);
            }
            let general = card(&content, "通用设置");
            settings(state, &general);
        }
        _ => {
            let about = card(&content, "NetMate");
            label(
                &about,
                concat!("版本 ", env!("CARGO_PKG_VERSION"), "\n校园网自动登录助手"),
            );
            for (text, command) in [
                ("检查更新", Command::UpdateCheck),
                ("下载更新", Command::UpdateDownload),
                ("查看下载进度", Command::UpdateStatus),
                ("取消下载", Command::UpdateCancel),
                ("校验并安装更新", Command::UpdateInstall),
                ("退出 NetMate", Command::Quit),
            ] {
                let s = state.clone();
                button(&about, text, move || send(&s, command.clone()));
            }
        }
    }
}
fn entry(box_: &gtk::Box, title: &str, value: &str) -> gtk::Entry {
    label(box_, title);
    let e = gtk::Entry::new();
    e.set_text(value);
    e.update_property(&[gtk::accessible::Property::Label(title)]);
    e.set_hexpand(true);
    box_.append(&e);
    e
}
fn check(box_: &gtk::Box, title: &str, value: bool) -> gtk::CheckButton {
    let c = gtk::CheckButton::with_label(title);
    c.set_active(value);
    box_.append(&c);
    c
}
fn dialog(state: &Rc<RefCell<Ui>>, title: &str) -> (gtk::Window, gtk::Box) {
    let d = gtk::Window::builder()
        .title(title)
        .transient_for(&state.borrow().window)
        .modal(true)
        .default_width(520)
        .default_height(620)
        .build();
    d.add_css_class("netmate");
    if state.borrow().window.has_css_class("dark") {
        d.add_css_class("dark");
    }
    let box_ = gtk::Box::new(gtk::Orientation::Vertical, 8);
    box_.set_margin_start(16);
    box_.set_margin_end(16);
    box_.set_margin_top(16);
    box_.set_margin_bottom(16);
    let scroll = gtk::ScrolledWindow::builder()
        .child(&box_)
        .vexpand(true)
        .build();
    d.set_child(Some(&scroll));
    (d, box_)
}
fn put_item(state: &Rc<RefCell<Ui>>, field: &str, item: Value) {
    let mut config = state.borrow().config.clone();
    let items = config[field].as_array_mut().unwrap();
    if let Some(i) = items.iter().position(|old| old["id"] == item["id"]) {
        items[i] = item;
    } else {
        items.push(item)
    }
    send(state, Command::SaveConfig(config));
}
fn password(e: &gtk::Entry, clear: &gtk::CheckButton) -> Value {
    if clear.is_active() {
        json!({"action":"clear"})
    } else if e.text().is_empty() {
        json!({"action":"keep"})
    } else {
        json!({"action":"replace","value":e.text().as_str()})
    }
}
fn account_editor(state: &Rc<RefCell<Ui>>, old: Option<Value>) {
    let (d, b) = dialog(state, "认证账号");
    let old=old.unwrap_or(json!({"id":format!("account-{}",netmate_core::model::now()),"serverUrl":"http://10.10.102.50:801","isp":"campus"}));
    let name = entry(&b, "显示名称", old["name"].as_str().unwrap_or(""));
    let user = entry(&b, "账号", old["username"].as_str().unwrap_or(""));
    let pw = entry(&b, "密码（留空保留）", "");
    pw.set_visibility(false);
    let clear = check(&b, "清空已保存密码", false);
    let server = entry(&b, "认证服务器", old["serverUrl"].as_str().unwrap_or(""));
    label(&b, "运营商");
    let isp = gtk::DropDown::from_strings(&["校园网", "中国移动", "中国联通", "中国电信"]);
    let values = ["campus", "cmcc", "cucc", "ctcc"];
    isp.set_selected(
        values
            .iter()
            .position(|v| Some(*v) == old["isp"].as_str())
            .unwrap_or(0) as u32,
    );
    b.append(&isp);
    let s = state.clone();
    let dialog = d.clone();
    let id = old["id"].clone();
    button(&b, "保存", move || {
        put_item(
            &s,
            "accounts",
            json!({"id":id,"name":name.text().as_str(),"username":user.text().as_str(),"serverUrl":server.text().as_str(),"isp":values[isp.selected() as usize],"passwordEdit":password(&pw,&clear)}),
        );
        dialog.close();
    });
    let s = state.clone();
    let id = old["id"].clone();
    let dialog = d.clone();
    button(&b, "设为当前账号", move || {
        let mut c = s.borrow().config.clone();
        c["currentAccountId"] = id.clone();
        send(&s, Command::SaveConfig(c));
        dialog.close();
    });
    let s = state.clone();
    let dialog = d.clone();
    button(&b, "删除账号", move || {
        let mut c = s.borrow().config.clone();
        c["accounts"]
            .as_array_mut()
            .unwrap()
            .retain(|a| a["id"] != old["id"]);
        if c["currentAccountId"] == old["id"] {
            c["currentAccountId"] = Value::Null;
        }
        for w in c["wifiRules"].as_array_mut().unwrap() {
            w["linkedAccountIds"]
                .as_array_mut()
                .unwrap()
                .retain(|id| id != &old["id"]);
        }
        send(&s, Command::SaveConfig(c));
        dialog.close();
    });
    d.present();
}
fn wifi_editor(state: &Rc<RefCell<Ui>>, old: Option<Value>, scan: Option<Value>) {
    let (d, b) = dialog(state, "WiFi 配置");
    let old=old.unwrap_or(json!({"id":format!("wifi-{}",netmate_core::model::now()),"priority":10,"autoConnect":true}));
    let seed = scan.unwrap_or(Value::Null);
    let ssid = entry(
        &b,
        "WiFi 名称",
        old["ssid"].as_str().or(seed["ssid"].as_str()).unwrap_or(""),
    );
    let pw = entry(&b, "密码（留空保留）", "");
    pw.set_visibility(false);
    let clear = check(&b, "清空密码（开放网络）", false);
    let sec = entry(
        &b,
        "安全类型",
        old["security"]
            .as_str()
            .or(seed["security"].as_str())
            .unwrap_or("Open"),
    );
    let bssid = entry(&b, "BSSID（可留空）", old["bssid"].as_str().unwrap_or(""));
    let priority = gtk::SpinButton::with_range(1.0, 99.0, 1.0);
    priority.set_value(old["priority"].as_f64().unwrap_or(10.0));
    b.append(&priority);
    let auto = check(&b, "允许自动连接", old["autoConnect"] == true);
    let auth = check(&b, "需要校园网认证", old["requiresAuth"] == true);
    label(&b, "关联账号（按下面顺序尝试；可调整序号）");
    let mut linked = vec![];
    for a in state.borrow().config["accounts"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let id = a["id"].as_str().unwrap_or("").to_string();
        let active = old["linkedAccountIds"]
            .as_array()
            .is_some_and(|ids| ids.contains(&json!(id)));
        let c = check(
            &b,
            a["name"]
                .as_str()
                .filter(|s| !s.is_empty())
                .or(a["username"].as_str())
                .unwrap_or("账号"),
            active,
        );
        let order = gtk::SpinButton::with_range(1.0, 100.0, 1.0);
        order.set_value(
            old["linkedAccountIds"]
                .as_array()
                .and_then(|ids| ids.iter().position(|v| v == &json!(id)))
                .map(|p| p + 1)
                .unwrap_or(100) as f64,
        );
        b.append(&order);
        linked.push((id, c, order));
    }
    let s = state.clone();
    let id = old["id"].clone();
    let dialog = d.clone();
    button(&b, "保存", move || {
        let mut ids: Vec<_> = linked.iter().filter(|(_, c, _)| c.is_active()).collect();
        ids.sort_by_key(|(_, _, n)| n.value_as_int());
        let value = json!({"id":id,"ssid":ssid.text().as_str(),"passwordEdit":password(&pw,&clear),"security":if sec.text().is_empty(){Value::Null}else{json!(sec.text().as_str())},"bssid":if bssid.text().is_empty(){Value::Null}else{json!(bssid.text().as_str())},"priority":priority.value_as_int(),"autoConnect":auto.is_active(),"requiresAuth":auth.is_active(),"linkedAccountIds":ids.iter().map(|(id,_,_)|id).collect::<Vec<_>>()});
        put_item(&s, "wifiRules", value);
        dialog.close();
    });
    let s = state.clone();
    let dialog = d.clone();
    button(&b, "删除网络", move || {
        let mut c = s.borrow().config.clone();
        c["wifiRules"]
            .as_array_mut()
            .unwrap()
            .retain(|w| w["id"] != old["id"]);
        send(&s, Command::SaveConfig(c));
        dialog.close();
    });
    d.present();
}
fn scan_dialog(state: &Rc<RefCell<Ui>>, networks: Value) {
    let (d, b) = dialog(state, "附近网络");
    for network in networks.as_array().into_iter().flatten() {
        let s = state.clone();
        let network = network.clone();
        let dialog = d.clone();
        button(
            &b,
            &format!(
                "{} · {}",
                network["ssid"].as_str().unwrap_or(""),
                network["security"].as_str().unwrap_or("")
            ),
            move || {
                wifi_editor(&s, None, Some(network.clone()));
                dialog.close();
            },
        );
    }
    d.present();
}
fn settings(state: &Rc<RefCell<Ui>>, b: &gtk::Box) {
    let settings = state.borrow().config["settings"].clone();
    let mut flags = vec![];
    for (key, title) in [
        ("autoLaunch", "开机自启"),
        ("enableHeartbeat", "启用心跳"),
        ("autoReconnect", "断线自动恢复"),
        ("startupAutoConnect", "启动时自动连接"),
        ("keepCurrentConnection", "保持当前连接"),
        ("autoUpdate", "自动检查更新"),
    ] {
        flags.push((key, check(b, title, settings[key] == true)));
    }
    let mut numbers = vec![];
    for (key, title, min, max) in [
        ("heartbeatIntervalSeconds", "心跳间隔（秒）", 5.0, 300.0),
        ("heartbeatFailureThreshold", "连续失败阈值", 1.0, 10.0),
        (
            "wifiReconnectRetries",
            "每 WiFi 尝试次数（含首次）",
            1.0,
            10.0,
        ),
        (
            "wifiReconnectCooldownMinutes",
            "全部失败后冷却（分钟）",
            0.0,
            1440.0,
        ),
    ] {
        label(b, title);
        let n = gtk::SpinButton::with_range(min, max, 1.0);
        n.set_value(settings[key].as_f64().unwrap_or(min));
        b.append(&n);
        numbers.push((key, n));
    }
    let mut notices = vec![];
    for (key, title) in [
        ("wifiDisconnected", "WiFi 断开通知"),
        ("reconnectSuccess", "恢复成功通知"),
        ("reconnectFailed", "恢复失败通知"),
        ("authRecovered", "认证恢复通知"),
    ] {
        notices.push((
            key,
            check(b, title, settings["notificationSettings"][key] == true),
        ));
    }
    let s = state.clone();
    button(b, "保存并应用", move || {
        let mut c = s.borrow().config.clone();
        for (k, v) in &flags {
            c["settings"][k] = json!(v.is_active());
        }
        for (k, v) in &numbers {
            c["settings"][k] = json!(v.value_as_int());
        }
        for (k, v) in &notices {
            c["settings"]["notificationSettings"][k] = json!(v.is_active());
        }
        send(&s, Command::SaveConfig(c));
    });
}
fn logs(state: &Rc<RefCell<Ui>>, b: &gtk::Box) {
    let tools = gtk::Box::new(gtk::Orientation::Horizontal, 8);
    let keyword = gtk::SearchEntry::new();
    keyword.set_placeholder_text(Some("搜索全部保留历史"));
    keyword.update_property(&[gtk::accessible::Property::Label("搜索全部保留历史")]);
    keyword.set_text(&state.borrow().query.keyword);
    keyword.set_hexpand(true);
    tools.append(&keyword);
    let level =
        gtk::DropDown::from_strings(&["全部级别", "debug", "info", "success", "warn", "error"]);
    tools.append(&level);
    b.append(&tools);
    let extra = gtk::Box::new(gtk::Orientation::Horizontal, 8);
    let source = gtk::Entry::new();
    source.set_placeholder_text(Some("来源（可留空）"));
    source.update_property(&[gtk::accessible::Property::Label("来源（可留空）")]);
    source.set_text(&state.borrow().query.source);
    source.set_hexpand(true);
    extra.append(&source);
    extra.append(&gtk::Label::new(Some("最近小时（0=全部）")));
    let hours = gtk::SpinButton::with_range(0.0, 168.0, 1.0);
    extra.append(&hours);
    b.append(&extra);
    let s = state.clone();
    button(&tools, "筛选 / 刷新", move || {
        let mut ui = s.borrow_mut();
        ui.query.keyword = keyword.text().to_string();
        ui.query.source = source.text().to_string();
        ui.query.start_time = if hours.value_as_int() > 0 {
            Some(netmate_core::model::now().saturating_sub(hours.value_as_int() as u64 * 3600000))
        } else {
            None
        };
        ui.query.level =
            ["", "debug", "info", "success", "warn", "error"][level.selected() as usize].into();
        ui.query.cursor = None;
        ui.cursors.clear();
        let q = ui.query.clone();
        drop(ui);
        send(&s, Command::Logs(q));
    });
    let model = state.borrow().log_model.clone();
    let selection = gtk::SingleSelection::new(Some(model));
    let factory = gtk::SignalListItemFactory::new();
    factory.connect_setup(|_, item| {
        let item = item.downcast_ref::<gtk::ListItem>().unwrap();
        let label = gtk::Label::new(None);
        label.set_xalign(0.0);
        label.set_ellipsize(gtk::pango::EllipsizeMode::End);
        label.set_margin_top(6);
        label.set_margin_bottom(6);
        item.set_child(Some(&label));
    });
    factory.connect_bind(|_, item| {
        let item = item.downcast_ref::<gtk::ListItem>().unwrap();
        let label = item.child().and_downcast::<gtk::Label>().unwrap();
        let text = item.item().and_downcast::<gtk::StringObject>().unwrap();
        label.set_text(&text.string());
    });
    let list = gtk::ListView::new(Some(selection), Some(factory));
    let s = state.clone();
    list.connect_activate(move |_, index| {
        if let Some(entry) = s.borrow().log_entries.get(index as usize) {
            let (d, b) = dialog(&s, "日志详情");
            let text = gtk::TextView::new();
            text.set_editable(false);
            text.set_wrap_mode(gtk::WrapMode::WordChar);
            text.buffer()
                .set_text(&serde_json::to_string_pretty(entry).unwrap());
            b.append(&text);
            d.present();
        }
    });
    b.append(
        &gtk::ScrolledWindow::builder()
            .vexpand(true)
            .child(&list)
            .build(),
    );
    let actions = gtk::Box::new(gtk::Orientation::Horizontal, 6);
    b.append(&actions);
    let s = state.clone();
    button(&actions, "上一页", move || {
        let mut ui = s.borrow_mut();
        if let Some(cursor) = ui.cursors.pop() {
            ui.query.cursor = cursor;
            let q = ui.query.clone();
            drop(ui);
            send(&s, Command::Logs(q));
        }
    });
    let s = state.clone();
    button(&actions, "下一页", move || {
        let mut ui = s.borrow_mut();
        if let Some(next) = ui.next.clone() {
            let old = ui.query.cursor.clone();
            ui.cursors.push(old);
            ui.query.cursor = Some(next);
            let q = ui.query.clone();
            drop(ui);
            send(&s, Command::Logs(q));
        }
    });
    for (title, filtered, format) in [
        ("导出全部", false, "text"),
        ("导出筛选", true, "text"),
        ("导出 JSON", false, "json"),
    ] {
        let s = state.clone();
        button(&actions, title, move || {
            let q = if filtered {
                s.borrow().query.clone()
            } else {
                LogQuery::default()
            };
            send(
                &s,
                Command::ExportLogs {
                    query: q,
                    format: format.into(),
                },
            );
        });
    }
    let s = state.clone();
    button(&actions, "清空日志", move || {
        let (d, b) = dialog(&s, "清空日志");
        label(&b, "清空全部保留日志？");
        let s = s.clone();
        let dialog = d.clone();
        button(&b, "确认清空", move || {
            send(&s, Command::ClearLogs);
            dialog.close();
        });
        d.present();
    });
    send(state, Command::Logs(state.borrow().query.clone()));
}
