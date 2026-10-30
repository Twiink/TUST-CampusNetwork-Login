use crate::client::{self, Event};
use gtk::{cairo, gio, glib, prelude::*};
use netmate_core::{
    journal::LogQuery,
    model::{Network, WifiRule},
    protocol::Command,
};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::HashMap, rc::Rc, time::Duration};
type Edit = Box<dyn Fn(&mut Value)>;
struct Ui {
    window: gtk::ApplicationWindow,
    body: gtk::Box,
    home: gtk::Box,
    home_signature: String,
    /// Weather illustration of the home sky panel; redrawn when the theme changes.
    sky_art: Option<gtk::DrawingArea>,
    /// Countdown labels on the home page; `true` reads the heartbeat deadline, `false` the retry deadline.
    countdowns: Vec<(gtk::Label, bool)>,
    ticking: bool,
    scan: Value,
    scanning: bool,
    scan_button: Option<gtk::Button>,
    /// Unsaved add-form input survives re-renders after each configuration save.
    drafts: HashMap<String, String>,
    /// Draft key prefixes to clear once the pending save succeeds.
    clear_on_save: Vec<String>,
    saving: bool,
    edits: Vec<Edit>,
    update: Value,
    update_label: gtk::Label,
    update_actions: gtk::Box,
    scroll: Option<gtk::ScrolledWindow>,
    rendered_page: String,
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
    log_count: gtk::Label,
    log_empty: gtk::Label,
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
        let sidebar = gtk::Box::new(gtk::Orientation::Vertical, 4);
        sidebar.add_css_class("rail-items");
        sidebar.set_width_request(196);
        let brand = gtk::Box::new(gtk::Orientation::Horizontal, 10);
        brand.add_css_class("brand");
        let brand_icon = gtk::Image::from_icon_name("network-wireless-symbolic");
        brand_icon.set_pixel_size(26);
        brand.append(&brand_icon);
        brand.append(&gtk::Label::new(Some("NetMate")));
        sidebar.append(&brand);
        // The rail gradient comes from CSS; a static drawing behind the items adds day clouds or night stars.
        let rail = gtk::Overlay::new();
        rail.add_css_class("rail");
        rail.set_overflow(gtk::Overflow::Hidden);
        let rail_sky = gtk::DrawingArea::builder()
            .accessible_role(gtk::AccessibleRole::Presentation)
            .can_target(false)
            .build();
        rail_sky.set_draw_func(draw_rail_sky);
        rail.set_child(Some(&rail_sky));
        rail.add_overlay(&sidebar);
        rail.set_measure_overlay(&sidebar, true);
        root.append(&rail);
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
            home: gtk::Box::new(gtk::Orientation::Vertical, 0),
            home_signature: String::new(),
            sky_art: None,
            countdowns: vec![],
            ticking: false,
            scan: Value::Null,
            scanning: false,
            scan_button: None,
            drafts: HashMap::new(),
            clear_on_save: vec![],
            saving: false,
            edits: vec![],
            update: json!({}),
            update_label: gtk::Label::new(None),
            update_actions: gtk::Box::new(gtk::Orientation::Horizontal, 8),
            scroll: None,
            rendered_page: String::new(),
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
            log_count: gtk::Label::new(None),
            log_empty: gtk::Label::new(None),
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
        appearance.set_cursor_from_name(Some("pointer"));
        appearance.set_active(dark);
        let anim = Rc::new(RefCell::new(Toggle {
            night: dark,
            position: if dark { 1.0 } else { 0.0 },
            progress: if dark { 1.0 } else { 0.0 },
            target: if dark { 1.0 } else { 0.0 },
            ..Toggle::default()
        }));
        let drawing = gtk::DrawingArea::new();
        drawing.set_content_width(TOGGLE_BOX.0);
        drawing.set_content_height(TOGGLE_BOX.1);
        let frame = anim.clone();
        drawing.set_draw_func(move |_, context, width, height| {
            draw_toggle(context, width, height, &frame.borrow());
        });
        appearance.set_child(Some(&drawing));
        let motion = gtk::EventControllerMotion::new();
        for hover in [true, false] {
            let anim = anim.clone();
            let area = drawing.downgrade();
            let set = move || {
                if let Some(area) = area.upgrade() {
                    anim.borrow_mut().hover = hover;
                    animate_toggle(&anim, &area);
                }
            };
            if hover {
                motion.connect_enter(move |_, _, _| set());
            } else {
                motion.connect_leave(move |_| set());
            }
        }
        appearance.add_controller(motion);
        // Ambient motion runs only while the window is shown and focused; closed to the tray,
        // minimised or in the background, the toggle holds a still frame.
        {
            let anim = anim.clone();
            let area = drawing.downgrade();
            let lively = move |window: &gtk::ApplicationWindow| {
                if let Some(area) = area.upgrade() {
                    anim.borrow_mut().ambient = window.is_active() && window.is_mapped();
                    animate_toggle(&anim, &area);
                }
            };
            let on_active = lively.clone();
            window.connect_is_active_notify(move |w| on_active(w));
            let on_map = lively.clone();
            window.connect_map(move |w| on_map(w));
            window.connect_unmap(move |w| lively(w));
        }
        theme_accessibility(&appearance, dark);
        let weak = Rc::downgrade(&state);
        let area = drawing.downgrade();
        let sky = rail_sky.downgrade();
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
            if let Some(area) = area.upgrade() {
                anim.borrow_mut().night = dark;
                animate_toggle(&anim, &area);
            }
            if let Some(sky) = sky.upgrade() {
                sky.queue_draw();
            }
            if let Some(art) = ui.sky_art.as_ref() {
                art.queue_draw();
            }
            if let Err(error) = crate::theme::save(dark) {
                ui.feedback.set_text(&error.to_string());
            }
        });
        let foot = gtk::Box::new(gtk::Orientation::Vertical, 6);
        foot.add_css_class("rail-foot");
        foot.set_halign(gtk::Align::Center);
        foot.append(&appearance);
        let caption = gtk::Label::new(Some("白天 / 黑夜"));
        caption.add_css_class("rail-caption");
        foot.append(&caption);
        sidebar.append(&foot);
        glib::spawn_future_local({
            let state = state.clone();
            async move {
                while let Ok(event) = rx.recv().await {
                    match event {
                        Event::State(v) => apply_state(&state, v),
                        Event::Error(e) => on_error(&state, &e),
                        Event::Reply(command, value) => on_reply(&state, command, value),
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
/// Size of the day/night toggle's drawing area: the 200×90 design at 0.44 (88×40), plus room for
/// the 1.07 hover scale and the drop shadow.
const TOGGLE_BOX: (i32, i32) = (100, 54);
const TOGGLE_SCALE: f64 = 0.44;
const SWITCH_US: f64 = 550_000.0;
const LIFT_US: f64 = 200_000.0;
/// Frame state of the toggle. The tick callback only runs while switching or hovered.
#[derive(Default)]
struct Toggle {
    night: bool,
    /// Knob position, 0 = day (left) .. 1 = night (right); overshoots during the switch.
    position: f64,
    /// Colour and opacity blend between the day and night scenes.
    progress: f64,
    from: (f64, f64),
    target: f64,
    started: Option<i64>,
    hover: bool,
    /// The window is shown and focused: clouds drift, the sun glows and stars twinkle.
    ambient: bool,
    /// Strength of the ambient motion 0..1; eases in and out so pausing never jumps.
    motion: f64,
    /// Hover emphasis 0..1 (scale 1.07, brighter border).
    lift: f64,
    /// Seconds of drift and twinkle accumulated while hovered.
    clock: f64,
    last: Option<i64>,
    ticking: bool,
}
fn animations_enabled() -> bool {
    gtk::Settings::default().is_none_or(|s| s.is_gtk_enable_animations())
}
/// Starts the frame clock for a switch or hover change; it stops itself once nothing moves.
fn animate_toggle(anim: &Rc<RefCell<Toggle>>, area: &gtk::DrawingArea) {
    {
        let mut t = anim.borrow_mut();
        let target = if t.night { 1.0 } else { 0.0 };
        if !animations_enabled() {
            t.position = target;
            t.progress = target;
            t.target = target;
            t.started = None;
            t.lift = if t.hover { 1.0 } else { 0.0 };
            t.motion = 0.0;
            drop(t);
            area.queue_draw();
            return;
        }
        if t.target != target || (t.started.is_none() && t.progress != target) {
            t.from = (t.position, t.progress);
            t.target = target;
            t.started = None;
        }
        if t.ticking {
            return;
        }
        t.ticking = true;
        t.last = None;
    }
    let anim = anim.clone();
    area.add_tick_callback(move |area, clock| {
        let now = clock.frame_time();
        let mut t = anim.borrow_mut();
        let dt = t.last.map_or(0.0, |last| (now - last).max(0) as f64);
        t.last = Some(now);
        let switching = t.progress != t.target || t.position != t.target;
        if switching {
            let start = *t.started.get_or_insert(now);
            let k = ((now - start) as f64 / SWITCH_US).clamp(0.0, 1.0);
            let (target, (from_position, from_progress)) = (t.target, t.from);
            t.position = from_position + (target - from_position) * overshoot(k);
            t.progress = from_progress + (target - from_progress) * ease(k);
            if k >= 1.0 {
                t.position = target;
                t.progress = target;
                t.started = None;
            }
        }
        let lift_target = if t.hover { 1.0 } else { 0.0 };
        let step = dt / LIFT_US;
        t.lift = if t.lift < lift_target {
            (t.lift + step).min(lift_target)
        } else {
            (t.lift - step).max(lift_target)
        };
        let lively = t.hover || t.ambient;
        let motion_target = if lively { 1.0 } else { 0.0 };
        t.motion = if t.motion < motion_target {
            (t.motion + step).min(motion_target)
        } else {
            (t.motion - step).max(motion_target)
        };
        if t.motion > 0.0 {
            t.clock += dt / 1_000_000.0;
        }
        let moving = t.progress != t.target
            || t.position != t.target
            || t.lift != lift_target
            || t.motion != motion_target;
        area.queue_draw();
        if moving || lively {
            glib::ControlFlow::Continue
        } else {
            t.ticking = false;
            glib::ControlFlow::Break
        }
    });
}
/// CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)).
fn ease(t: f64) -> f64 {
    bezier(0.25, 0.1, 0.25, 1.0, t)
}
/// The knob's cubic-bezier(0.68, -0.1, 0.265, 1.2), which overshoots slightly.
fn overshoot(t: f64) -> f64 {
    bezier(0.68, -0.1, 0.265, 1.2, t)
}
fn bezier(x1: f64, y1: f64, x2: f64, y2: f64, t: f64) -> f64 {
    let curve = |a: f64, b: f64, s: f64| {
        3.0 * (1.0 - s).powi(2) * s * a + 3.0 * (1.0 - s) * s * s * b + s.powi(3)
    };
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..24 {
        let mid = (lo + hi) / 2.0;
        if curve(x1, x2, mid) < t {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    curve(y1, y2, (lo + hi) / 2.0)
}
fn rgb(hex: u32) -> (f64, f64, f64) {
    (
        ((hex >> 16) & 255) as f64 / 255.0,
        ((hex >> 8) & 255) as f64 / 255.0,
        (hex & 255) as f64 / 255.0,
    )
}
fn mix(a: u32, b: u32, k: f64) -> (f64, f64, f64) {
    let (a, b) = (rgb(a), rgb(b));
    (
        a.0 + (b.0 - a.0) * k,
        a.1 + (b.1 - a.1) * k,
        a.2 + (b.2 - a.2) * k,
    )
}
fn stop(g: &cairo::Gradient, offset: f64, color: (f64, f64, f64), alpha: f64) {
    g.add_color_stop_rgba(offset, color.0, color.1, color.2, alpha);
}
fn pill(cr: &cairo::Context, x: f64, y: f64, w: f64, h: f64) {
    let r = h.min(w) / 2.0;
    cr.new_sub_path();
    cr.arc(
        x + w - r,
        y + r,
        r,
        -std::f64::consts::FRAC_PI_2,
        std::f64::consts::FRAC_PI_2,
    );
    cr.arc(
        x + r,
        y + r,
        r,
        std::f64::consts::FRAC_PI_2,
        std::f64::consts::PI * 1.5,
    );
    cr.close_path();
}
fn disc(cr: &cairo::Context, x: f64, y: f64, r: f64) {
    cr.new_sub_path();
    cr.arc(x, y, r, 0.0, std::f64::consts::TAU);
}
/// A glossy sphere: radial gradient whose centre sits up and left, as in the prototype's suns and moons.
fn sphere(
    cr: &cairo::Context,
    x: f64,
    y: f64,
    r: f64,
    focus: (f64, f64),
    stops: &[(f64, u32)],
    alpha: f64,
) {
    let (fx, fy) = (x - r + focus.0 * 2.0 * r, y - r + focus.1 * 2.0 * r);
    let reach = ((1.0 - focus.0).hypot(1.0 - focus.1)) * 2.0 * r;
    let g = cairo::RadialGradient::new(fx, fy, 0.0, fx, fy, reach);
    for (offset, color) in stops {
        stop(&g, *offset, rgb(*color), alpha);
    }
    let _ = cr.set_source(g);
    disc(cr, x, y, r);
    let _ = cr.fill();
}
/// themeswitch's cloud cell: nine 17px circles in a 60×30 grid (left, top of each circle).
const PUFFS: [(f64, f64); 9] = [
    (26.0, 1.0),
    (38.0, 1.0),
    (10.0, 12.0),
    (23.0, 12.0),
    (32.0, 13.0),
    (43.0, 8.0),
    (16.0, 3.0),
    (5.0, 2.0),
    (0.0, 8.0),
];
/// Cloud cells along the bottom: (x, y) in themeswitch's 120×50 space, opacity, and how far x
/// moves at night (the clouds part to both sides).
const CLOUDS: [(f64, f64, f64, f64); 4] = [
    (-10.0, 20.0, 0.55, -60.0),
    (65.0, 20.0, 0.55, 70.0),
    (0.0, 30.0, 1.0, -60.0),
    (55.0, 30.0, 1.0, 70.0),
];
/// themeswitch's galaxy cell (80×50); bright stars twinkle, faint ones hold still.
const STARS: [(f64, f64, bool); 18] = [
    (40.0, 21.0, true),
    (48.0, 6.0, false),
    (68.0, 30.0, true),
    (4.0, 24.0, false),
    (8.0, 28.0, false),
    (21.0, 6.0, true),
    (51.0, 27.0, false),
    (28.0, 39.0, false),
    (67.0, 8.0, false),
    (26.0, 14.0, false),
    (63.0, 20.0, false),
    (16.0, 35.0, false),
    (60.0, 35.0, false),
    (36.0, 6.0, true),
    (56.0, 12.0, true),
    (43.0, 37.0, true),
    (23.0, 27.0, true),
    (12.0, 12.0, true),
];
/// Scale of a cloud puff relative to themeswitch's 17px circle.
const PUFF_SCALE: f64 = 1.3;
/// CubicEase EaseInOut, which themeswitch uses for every move.
fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t.powi(3)
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}
/// Day/night toggle after Elsht666 「按钮-全月」 and JamesnetGroup/themeswitch, drawn in a 200×90
/// design space: the knob is the sun by day and the full moon by night, ringed by halos; clouds
/// part to both sides as stars rise. Mirrored by `design/toggle-lab.html`.
fn draw_toggle(cr: &cairo::Context, width: i32, height: i32, t: &Toggle) {
    use std::f64::consts::TAU;
    let _ = cr.save();
    let scale = TOGGLE_SCALE * (1.0 + 0.07 * t.lift);
    cr.translate(width as f64 / 2.0, height as f64 / 2.0 - 2.0);
    cr.scale(scale, scale);
    cr.translate(-100.0, -45.0);
    let k = t.progress.clamp(0.0, 1.0);
    let day = 1.0 - k;
    let slide = ease_in_out(k);
    // Soft drop shadow from stacked translucent pills.
    let shadow = mix(0x2a68ad, 0x000000, k);
    for i in 0..5 {
        let grow = i as f64 * 4.0;
        pill(
            cr,
            10.0 - grow / 2.0,
            12.0 - grow / 2.0,
            180.0 + grow,
            82.0 + grow,
        );
        cr.set_source_rgba(shadow.0, shadow.1, shadow.2, (0.2 + 0.05 * k) / 6.0);
        let _ = cr.fill();
    }
    let _ = cr.save();
    pill(cr, 0.0, 0.0, 200.0, 90.0);
    cr.clip();
    let g = cairo::LinearGradient::new(27.5, -27.5, 172.5, 117.5);
    stop(&g, 0.0, mix(0x4a90d9, 0x070d1c, k), 1.0);
    stop(&g, 0.55, mix(0x6fb0ee, 0x111a30, k), 1.0);
    stop(&g, 1.0, mix(0x9bcbf5, 0x1c2a48, k), 1.0);
    let _ = cr.set_source(g);
    let _ = cr.paint();
    // Stars rise into place as night falls; bright ones twinkle while the window is active.
    if k > 0.0 {
        for (i, (x, y, bright)) in STARS.iter().enumerate() {
            let twinkle = if *bright {
                t.motion * (1.0 - (TAU * (t.clock - i as f64 * 0.37) / 2.2).cos()) / 2.0
            } else {
                0.0
            };
            let alpha = if *bright {
                k * (1.0 - 0.6 * twinkle)
            } else {
                k * 0.45
            };
            let r = if *bright { 1.9 } else { 1.3 } * (1.0 + 0.5 * twinkle);
            cr.set_source_rgba(1.0, 1.0, 1.0, alpha);
            disc(cr, 14.0 + x * 1.7, 8.0 + y * 1.5 + 10.0 * day, r);
            let _ = cr.fill();
        }
    }
    let (cx, cy) = (45.0 + 110.0 * t.position, 45.0);
    // Halo rings around the knob, breathing gently while the window is active.
    let breathe = 1.0 + t.motion * 0.04 * (1.0 - (TAU * t.clock / 3.0).cos()) / 2.0;
    for (grow, alpha) in [(44.0, 0.07), (29.0, 0.1), (15.0, 0.14)] {
        cr.set_source_rgba(1.0, 1.0, 1.0, alpha * (day + 0.45 * k));
        disc(cr, cx, cy, (37.0 + grow) * breathe);
        let _ = cr.fill();
    }
    // Two cloud layers along the bottom; at night they part to both sides and fade.
    for (j, (x, y, alpha, away)) in CLOUDS.iter().enumerate() {
        let sway = t.motion * 3.0 * (TAU * (t.clock / 7.0 + j as f64 * 0.25)).sin();
        let (ox, oy) = ((x + 22.0 + away * slide) * 1.6 + sway, y * 1.6 + 4.0);
        for (px, py) in PUFFS {
            disc(
                cr,
                ox + (px + 8.5) * PUFF_SCALE,
                oy + (py + 8.5) * PUFF_SCALE,
                8.5 * PUFF_SCALE,
            );
        }
        cr.set_source_rgba(1.0, 1.0, 1.0, alpha * (1.0 - 0.85 * k));
        let _ = cr.fill();
    }
    // Knob: the sun by day, the full moon by night; craters surface in the second half.
    let r = 37.0;
    cr.set_source_rgba(0.0, 0.0, 0.0, 0.16 + 0.12 * k);
    disc(cr, cx, cy + 3.0, r + 2.0);
    let _ = cr.fill();
    let glow_color = mix(0xffc94d, 0xffebaa, k);
    let glow = cairo::RadialGradient::new(cx, cy, r * 0.8, cx, cy, r + 14.0);
    stop(&glow, 0.0, glow_color, 0.75 * breathe - 0.2 * k);
    stop(&glow, 1.0, glow_color, 0.0);
    let _ = cr.set_source(glow);
    disc(cr, cx, cy, r + 14.0);
    let _ = cr.fill();
    let (fx, fy) = (cx - r * 0.3, cy - r * 0.32);
    let ball = cairo::RadialGradient::new(fx, fy, 0.0, fx, fy, r * 1.75);
    stop(&ball, 0.0, mix(0xfff1b8, 0xffffff, k), 1.0);
    stop(&ball, 0.55, mix(0xffc23d, 0xfff6d9, k), 1.0);
    stop(&ball, 1.0, mix(0xf59e0b, 0xe9d79a, k), 1.0);
    let _ = cr.set_source(ball);
    disc(cr, cx, cy, r);
    let _ = cr.fill();
    let crater = ((k - 0.4) / 0.6).clamp(0.0, 1.0);
    if crater > 0.0 {
        cr.set_source_rgba(214.0 / 255.0, 196.0 / 255.0, 140.0 / 255.0, 0.5 * crater);
        for (dx, dy, cr0) in [
            (-11.0, -10.0, 8.0),
            (12.0, 4.0, 6.0),
            (-5.0, 15.0, 4.5),
            (14.0, -15.0, 3.5),
        ] {
            disc(cr, cx + dx, cy + dy, cr0);
        }
        let _ = cr.fill();
    }
    let shine = cairo::LinearGradient::new(0.0, cy - r, 0.0, cy + r);
    shine.add_color_stop_rgba(0.0, 1.0, 1.0, 1.0, 0.45);
    shine.add_color_stop_rgba(0.12, 1.0, 1.0, 1.0, 0.0);
    shine.add_color_stop_rgba(0.85, 0.0, 0.0, 0.0, 0.0);
    shine.add_color_stop_rgba(1.0, 0.0, 0.0, 0.0, 0.1);
    let _ = cr.set_source(shine);
    disc(cr, cx, cy, r);
    let _ = cr.fill();
    let _ = cr.restore();
    // 2px border, brighter while hovered.
    let alpha = (0.25 + 0.2 * t.lift) * day + (0.08 + 0.1 * t.lift) * k;
    pill(cr, 1.0, 1.0, 198.0, 88.0);
    cr.set_line_width(2.0);
    cr.set_source_rgba(1.0, 1.0, 1.0, alpha);
    let _ = cr.stroke();
    let _ = cr.restore();
}
/// The prototype's `CLOUD` path (viewBox 120×64), with its SVG arcs converted to Cairo arcs.
fn cloud_path(cr: &cairo::Context) {
    cr.move_to(28.0, 60.0);
    cr.arc(27.892, 42.0, 18.0, 1.5648, 4.6071);
    cr.arc(51.756, 27.651, 26.0, -3.0046, -0.4646);
    cr.arc(77.219, 35.876, 20.0, -1.682, -0.351);
    cr.arc(91.167, 44.253, 16.0, -1.264, 1.3928);
    cr.close_path();
}
/// Fills a `CLOUD` at `(x, y)` scaled by `s`, with a vertical gradient over the cloud's height.
fn cloud(
    cr: &cairo::Context,
    x: f64,
    y: f64,
    s: f64,
    top: (f64, f64, f64, f64),
    bottom: (f64, f64, f64, f64),
) {
    let _ = cr.save();
    cr.translate(x, y);
    cr.scale(s, s);
    let g = cairo::LinearGradient::new(0.0, 1.65, 0.0, 60.0);
    g.add_color_stop_rgba(0.0, top.0, top.1, top.2, top.3);
    g.add_color_stop_rgba(1.0, bottom.0, bottom.1, bottom.2, bottom.3);
    let _ = cr.set_source(g);
    cloud_path(cr);
    let _ = cr.fill();
    let _ = cr.restore();
}
fn is_dark(widget: &impl IsA<gtk::Widget>) -> bool {
    widget.root().is_some_and(|root| root.has_css_class("dark"))
}
/// Static sidebar decoration: two translucent clouds by day, sparse stars by night.
fn draw_rail_sky(area: &gtk::DrawingArea, cr: &cairo::Context, width: i32, height: i32) {
    let (w, h) = (width as f64, height as f64);
    if is_dark(area) {
        cr.set_source_rgba(1.0, 1.0, 1.0, 0.8);
        for i in 0..14 {
            disc(
                cr,
                w * ((i * 41) % 95) as f64 / 100.0 + 1.0,
                h * ((i * 29) % 70) as f64 / 100.0 + 1.0,
                1.0,
            );
        }
        let _ = cr.fill();
        return;
    }
    for (x, bottom, size, alpha) in [
        (-22.0, 112.0, 138.0, 0.3),
        (w + 16.0 - 86.0, 196.0, 86.0, 0.22),
    ] {
        let s = size / 120.0;
        cloud(
            cr,
            x,
            h - bottom - 64.0 * s,
            s,
            (1.0, 1.0, 1.0, alpha),
            (1.0, 1.0, 1.0, alpha * 0.55),
        );
    }
}
#[derive(Clone, Copy, PartialEq)]
enum Weather {
    Clear,
    Cloud,
    Storm,
}
impl Weather {
    fn class(self) -> &'static str {
        match self {
            Weather::Clear => "clear",
            Weather::Cloud => "cloudy",
            Weather::Storm => "storm",
        }
    }
}
/// Sky panel art: night stars across the panel and the 176×120 weather illustration at the top right.
/// Static; a state change rebuilds the home page, a theme change only redraws.
fn draw_weather(
    area: &gtk::DrawingArea,
    cr: &cairo::Context,
    width: i32,
    height: i32,
    weather: Weather,
) {
    let night = is_dark(area);
    let (w, h) = (width as f64, height as f64);
    if night && weather != Weather::Storm {
        cr.set_source_rgba(
            1.0,
            1.0,
            1.0,
            if weather == Weather::Clear {
                0.85
            } else {
                0.35
            },
        );
        for i in 0..18 {
            disc(
                cr,
                w * ((i * 37 + 39) % 97) as f64 / 100.0 + 1.0,
                h * ((i * 53 + 21) % 89) as f64 / 100.0 + 1.0,
                1.0,
            );
        }
        let _ = cr.fill();
    }
    let _ = cr.save();
    cr.translate(w - 30.0 - 176.0, 6.0);
    cr.scale(0.8, 0.8);
    let glow = match weather {
        Weather::Clear => 1.0,
        Weather::Cloud => 0.35,
        Weather::Storm => 0.0,
    };
    let body = match weather {
        Weather::Clear => 1.0,
        Weather::Cloud => 0.6,
        Weather::Storm => 0.0,
    };
    if glow > 0.0 {
        let g = cairo::RadialGradient::new(138.0, 50.0, 0.0, 138.0, 50.0, 58.0);
        let (color, alpha) = if night {
            (0xffecb0, 0.35)
        } else {
            (0xffe680, 0.55)
        };
        let inner = if night { 0.4 } else { 0.45 };
        stop(&g, 0.0, rgb(color), alpha * glow);
        stop(&g, inner, rgb(color), alpha * glow);
        stop(&g, 1.0, rgb(color), 0.0);
        let _ = cr.set_source(g);
        disc(cr, 138.0, 50.0, 58.0);
        let _ = cr.fill();
    }
    if body > 0.0 {
        if night {
            sphere(
                cr,
                138.0,
                50.0,
                28.0,
                (0.34, 0.32),
                &[(0.0, 0xffffff), (0.55, 0xfff6d9), (1.0, 0xf2e3a8)],
                body,
            );
            let crater = rgb(0xecdca6);
            for (x, y, r, alpha) in [
                (128.0, 44.0, 5.0, 0.55),
                (147.0, 60.0, 3.5, 0.5),
                (146.0, 39.0, 2.5, 0.45),
            ] {
                cr.set_source_rgba(crater.0, crater.1, crater.2, alpha * body);
                disc(cr, x, y, r);
                let _ = cr.fill();
            }
        } else {
            sphere(
                cr,
                138.0,
                50.0,
                30.0,
                (0.36, 0.34),
                &[(0.0, 0xfff5c0), (0.7, 0xffd84d), (1.0, 0xffc107)],
                body,
            );
        }
    }
    let (top, bottom, mid) = match (night, weather) {
        (false, Weather::Storm) => (0xe3e7ec, 0xa9b2bd, None),
        (false, _) => (0xffffff, 0xd6e6f7, Some(0xf3f8fe)),
        (true, Weather::Storm) => (0x5a5258, 0x352d33, None),
        (true, _) => (0x5d6c8c, 0x36425c, None),
    };
    let fill = |cr: &cairo::Context, x: f64, y: f64, s: f64, alpha: f64| {
        let _ = cr.save();
        cr.translate(x, y);
        cr.scale(s, s);
        let g = cairo::LinearGradient::new(0.0, 1.65, 0.0, 60.0);
        stop(&g, 0.0, rgb(top), alpha);
        if let Some(mid) = mid {
            stop(&g, 0.7, rgb(mid), alpha);
        }
        stop(&g, 1.0, rgb(bottom), alpha);
        let _ = cr.set_source(g);
        cloud_path(cr);
        let _ = cr.fill();
        let _ = cr.restore();
    };
    if weather != Weather::Clear {
        fill(cr, 6.0, 24.0, 0.82, 0.75);
    }
    // Main cloud with the prototype's drop shadow (dy 6, blur 6, #1b4f86 at 0.22).
    let shade = rgb(0x1b4f86);
    for (i, spread) in [6.0, 4.0, 2.0].into_iter().enumerate() {
        let _ = cr.save();
        cr.translate(62.0 - spread, 56.0 - spread * 0.6);
        let s = 1.3 * (1.0 + spread / 60.0);
        cr.scale(s, s);
        cloud_path(cr);
        cr.set_source_rgba(
            shade.0,
            shade.1,
            shade.2,
            0.22 / 3.0 * (i as f64 + 1.0) / 2.0,
        );
        let _ = cr.fill();
        let _ = cr.restore();
    }
    fill(
        cr,
        62.0,
        50.0,
        1.3,
        if night && weather == Weather::Clear {
            0.5
        } else {
            1.0
        },
    );
    if weather == Weather::Storm {
        let rain = rgb(if night { 0x8ea3c7 } else { 0xd7ebff });
        cr.set_source_rgba(rain.0, rain.1, rain.2, 0.9);
        cr.set_line_width(3.0);
        for x in [112.0, 134.0, 156.0, 178.0] {
            cr.move_to(x, 136.0);
            cr.rel_line_to(-6.0, 12.0);
        }
        let _ = cr.stroke();
    }
    let _ = cr.restore();
}
fn send(s: &Rc<RefCell<Ui>>, command: Command) -> bool {
    let sent = s.borrow().tx.try_send(command).is_ok();
    if !sent {
        s.borrow().feedback.set_text("操作队列已满，请稍后重试")
    }
    sent
}
fn clear(b: &gtk::Box) {
    while let Some(child) = b.first_child() {
        b.remove(&child);
    }
}
fn label(box_: &gtk::Box, text: &str) {
    let l = gtk::Label::new(Some(text));
    l.set_xalign(0.0);
    l.set_wrap(true);
    box_.append(&l);
}
/// A wrapped, left-aligned label with the given style classes.
fn text(parent: &gtk::Box, value: &str, classes: &[&str]) -> gtk::Label {
    let l = gtk::Label::new(Some(value));
    l.set_xalign(0.0);
    l.set_wrap(true);
    l.set_wrap_mode(gtk::pango::WrapMode::WordChar);
    l.set_css_classes(classes);
    parent.append(&l);
    l
}
fn centered(parent: &gtk::Box, value: &str, classes: &[&str]) -> gtk::Label {
    let l = text(parent, value, classes);
    l.set_xalign(0.5);
    l.set_justify(gtk::Justification::Center);
    l
}
fn button(box_: &gtk::Box, text: &str, f: impl Fn() + 'static) -> gtk::Button {
    let b = gtk::Button::with_label(text);
    if matches!(
        text,
        "立即连接"
            | "保存"
            | "添加认证账号"
            | "添加 WiFi"
            | "保存并添加账号"
            | "恢复自动认证"
            | "下载更新"
            | "立即安装"
    ) {
        b.add_css_class("primary");
    }
    if text.contains("删除") || text == "断开连接" || text == "清除日志" {
        b.add_css_class("danger");
    }
    b.connect_clicked(move |_| f());
    box_.append(&b);
    b
}
fn icon_button(parent: &gtk::Box, icon: &str, name: &str, f: impl Fn() + 'static) -> gtk::Button {
    let b = gtk::Button::from_icon_name(icon);
    b.set_tooltip_text(Some(name));
    b.update_property(&[gtk::accessible::Property::Label(name)]);
    b.connect_clicked(move |_| f());
    parent.append(&b);
    b
}
fn row(parent: &gtk::Box, spacing: i32) -> gtk::Box {
    let r = gtk::Box::new(gtk::Orientation::Horizontal, spacing);
    parent.append(&r);
    r
}
fn column(parent: &gtk::Box, spacing: i32, classes: &[&str]) -> gtk::Box {
    let c = gtk::Box::new(gtk::Orientation::Vertical, spacing);
    c.set_css_classes(classes);
    parent.append(&c);
    c
}
fn spacer(parent: &gtk::Box) {
    let s = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    s.set_hexpand(true);
    parent.append(&s);
}
/// `.card` with an `h3`-style heading separated by a bottom rule, as in App.css.
fn card(parent: &gtk::Box, title: &str) -> gtk::Box {
    let card = gtk::Box::new(gtk::Orientation::Vertical, 14);
    card.add_css_class("card");
    if !title.is_empty() {
        let heading = gtk::Label::new(Some(title));
        heading.set_xalign(0.0);
        heading.add_css_class("card-title");
        card.append(&heading);
    }
    parent.append(&card);
    card
}
fn badge(parent: &gtk::Box, value: &str, classes: &[&str]) -> gtk::Label {
    let b = gtk::Label::new(Some(value));
    b.add_css_class("badge");
    for class in classes {
        b.add_css_class(class);
    }
    b.set_valign(gtk::Align::Center);
    parent.append(&b);
    b
}
/// A `gtk::DropDown` styled like an input (`.select` in netmate.css); `up` opens the list above,
/// for the controls at the bottom of the logs page. Keyboard handling is GTK's own.
fn dropdown(items: &[&str], name: &str, selected: u32, up: bool) -> gtk::DropDown {
    let d = gtk::DropDown::from_strings(items);
    d.add_css_class("select");
    d.set_selected(selected);
    d.update_property(&[gtk::accessible::Property::Label(name)]);
    if up {
        d.add_css_class("up");
        let mut child = d.first_child();
        while let Some(widget) = child {
            if let Some(popover) = widget.downcast_ref::<gtk::Popover>() {
                popover.set_position(gtk::PositionType::Top);
            }
            child = widget.next_sibling();
        }
    }
    d
}
fn page_title(body: &gtk::Box, title: &str) -> gtk::Box {
    let row = gtk::Box::new(gtk::Orientation::Horizontal, 10);
    row.add_css_class("page-title-row");
    let l = gtk::Label::new(Some(title));
    l.set_xalign(0.0);
    l.add_css_class("page-title");
    row.append(&l);
    body.append(&row);
    row
}
fn priority_class(priority: u64) -> &'static str {
    match priority {
        0..=3 => "prio-highest",
        4..=6 => "prio-high",
        7..=10 => "prio-normal",
        11..=20 => "prio-low",
        _ => "prio-lowest",
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
/// Queues a configuration edit; edits apply to the newest config, one save at a time.
fn mutate(state: &Rc<RefCell<Ui>>, edit: impl Fn(&mut Value) + 'static) {
    let idle = {
        let mut ui = state.borrow_mut();
        ui.edits.push(Box::new(edit));
        !ui.saving && !ui.config.is_null()
    };
    if idle {
        flush(state);
    }
}
fn flush(state: &Rc<RefCell<Ui>>) {
    let config = {
        let mut ui = state.borrow_mut();
        if ui.edits.is_empty() {
            return;
        }
        let edits: Vec<Edit> = ui.edits.drain(..).collect();
        let mut config = ui.config.clone();
        for edit in &edits {
            edit(&mut config);
        }
        ui.saving = true;
        config
    };
    if !send(state, Command::SaveConfig(config)) {
        state.borrow_mut().saving = false;
    }
}
fn go(state: &Rc<RefCell<Ui>>, page: &str) {
    state.borrow_mut().page = page.into();
    render(state);
}
fn now_ms() -> u64 {
    netmate_core::model::now()
}
fn remaining(deadline: &Value) -> Option<u64> {
    let deadline = deadline.as_u64()?;
    Some(deadline.saturating_sub(now_ms()).div_ceil(1000))
}
fn start_ticking(state: &Rc<RefCell<Ui>>) {
    if state.borrow().countdowns.is_empty() {
        return;
    }
    tick(&state.borrow());
    if state.borrow().ticking {
        return;
    }
    state.borrow_mut().ticking = true;
    let weak = Rc::downgrade(state);
    glib::timeout_add_seconds_local(1, move || {
        let Some(state) = weak.upgrade() else {
            return glib::ControlFlow::Break;
        };
        if state.borrow().countdowns.is_empty() || state.borrow().page != "运行状态" {
            state.borrow_mut().ticking = false;
            return glib::ControlFlow::Break;
        }
        tick(&state.borrow());
        glib::ControlFlow::Continue
    });
}
fn tick(ui: &Ui) {
    for (label, heartbeat) in &ui.countdowns {
        if *heartbeat {
            match remaining(&ui.network["nextHeartbeatAt"]).filter(|s| *s > 0) {
                Some(s) => {
                    label.set_text(&format!("{s}s 后检测"));
                    label.set_visible(true);
                }
                None => label.set_visible(false),
            }
        } else {
            match remaining(&ui.network["nextRetryAt"]) {
                Some(s) => {
                    label.set_text(&format!("剩余 {s} 秒后重试"));
                    label.set_visible(true);
                }
                None => label.set_visible(false),
            }
        }
    }
}
/// Only the fields the home cards render; countdown deadlines are read live by `tick`.
fn home_signature(ui: &Ui) -> String {
    let mut s = ui.network.clone();
    if let Some(map) = s.as_object_mut() {
        for key in ["sequence", "logRevision", "notification", "revision"] {
            map.remove(key);
        }
        for key in ["nextHeartbeatAt", "nextRetryAt"] {
            let present = !map.get(key).is_none_or(Value::is_null);
            map.insert(key.into(), present.into());
        }
    }
    json!([s, ui.config["revision"], ui.config.is_null()]).to_string()
}
fn refresh_home(state: &Rc<RefCell<Ui>>) {
    let signature = {
        let ui = state.borrow();
        if ui.page != "运行状态" {
            return;
        }
        home_signature(&ui)
    };
    if state.borrow().home_signature == signature {
        return;
    }
    let home = {
        let mut ui = state.borrow_mut();
        ui.home_signature = signature;
        ui.countdowns.clear();
        ui.sky_art = None;
        ui.home.clone()
    };
    clear(&home);
    let (snapshot, config) = {
        let ui = state.borrow();
        (ui.network.clone(), ui.config.clone())
    };
    pause_banner(state, &home, &config);
    if snapshot.is_null() || config.is_null() {
        let loading = card(&home, "");
        loading.add_css_class("loading-card");
        let spinner = gtk::Spinner::new();
        spinner.set_size_request(64, 64);
        spinner.start();
        loading.append(&spinner);
        centered(&loading, "正在检测 WiFi 连接...", &["notice-title"]);
        centered(&loading, "请稍候，正在检查网络连接状态", &["secondary"]);
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
    let place = format!("当前 WiFi · {ssid}");
    let view = if !wifi {
        let mut chips = vec![("连接到 WiFi 后才能使用网络认证功能".to_string(), "")];
        if heartbeat_on {
            chips.push(("心跳检测已暂停".into(), "alert"));
        }
        Sky {
            weather: Weather::Storm,
            place: "网络连接状态".into(),
            title: "未连接 WiFi".into(),
            body: "当前设备未连接到任何 WiFi 网络，请先连接 WiFi。".into(),
            chips,
            action: None,
        }
    } else if rule.is_none() && snapshot["requiresAuth"] != true {
        let same_name = rules(&config).iter().any(|w| w.ssid == ssid);
        Sky {
            weather: Weather::Cloud,
            place,
            title: if same_name {
                "请选择当前 WiFi 规则"
            } else {
                "该 WiFi 未配置"
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
            chips: vec![("点击左侧菜单的\"配置设置\"添加 WiFi 配置".into(), "")],
            action: None,
        }
    } else if !rule
        .as_ref()
        .map(|w| w.requires_auth)
        .unwrap_or(snapshot["requiresAuth"] == true)
    {
        Sky {
            weather: if online {
                Weather::Clear
            } else {
                Weather::Cloud
            },
            place,
            title: "无需认证".into(),
            body: if online {
                "当前 WiFi 无需校园网认证，互联网可达。"
            } else {
                "当前 WiFi 无需校园网认证，互联网暂不可达。"
            }
            .into(),
            chips: vec![
                ("此 WiFi 已配置为「无需认证」".into(), "strong"),
                ("如家庭 WiFi、手机热点等网络".into(), ""),
            ],
            action: None,
        }
    } else if login_accounts(&config, &n, rule.as_ref()).is_empty() {
        let s = state.clone();
        Sky {
            weather: Weather::Cloud,
            place,
            title: "未配置账户".into(),
            body: "该 WiFi 需要校园网认证，但尚未关联账户。请前往\"配置设置\"添加账户并关联到此 WiFi。"
                .into(),
            chips: vec![("点击左侧菜单的\"配置设置\"添加账户并关联".into(), "")],
            action: Some(Box::new(move |footer: &gtk::Box| {
                let s = s.clone();
                button(footer, "添加认证账号", move || go(&s, "配置设置"));
            })),
        }
    } else {
        let authenticated = snapshot["authenticated"] == true;
        let connecting = matches!(
            snapshot["phase"].as_str(),
            Some("connecting" | "authenticating" | "verifying")
        );
        let s = state.clone();
        let action: Box<dyn Fn(&gtk::Box)> = Box::new(move |footer: &gtk::Box| {
            if authenticated {
                let s = s.clone();
                button(footer, "断开连接", move || {
                    send(&s, Command::Logout);
                });
            } else if connecting {
                let b = button(footer, "正在认证...", || {});
                b.add_css_class("primary");
                b.set_sensitive(false);
            } else {
                let s = s.clone();
                button(footer, "立即连接", move || {
                    send(&s, Command::Login);
                });
            }
        });
        Sky {
            weather: if authenticated && online {
                Weather::Clear
            } else {
                Weather::Cloud
            },
            place,
            title: if authenticated {
                if online {
                    "已认证并联网"
                } else {
                    "已认证，互联网不可达"
                }
            } else {
                "需要认证"
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
            chips: vec![
                (
                    if rule.is_some() {
                        "此 WiFi 已配置为「需要认证」"
                    } else {
                        "根据当前网络信息识别为校园网"
                    }
                    .into(),
                    "strong",
                ),
                ("如校园网 CMCC/CUCC/CTCC".into(), ""),
            ],
            action: Some(action),
        }
    };
    sky_panel(state, &home, view, &snapshot, &config);
    recovery_failures(&home, &snapshot);
    if wifi {
        metric_strip(state, &home, &snapshot, &config);
    }
    let cols = gtk::Box::new(gtk::Orientation::Horizontal, 16);
    cols.set_homogeneous(true);
    cols.add_css_class("home-cols");
    if wifi {
        wifi_details(state, &cols, &snapshot, &config);
    } else if heartbeat_on {
        heartbeat_paused(&cols);
    }
    switcher(state, &cols, &snapshot, &config, rule.as_ref());
    if cols.first_child().is_some() {
        home.append(&cols);
    }
    start_ticking(state);
}
fn pause_banner(state: &Rc<RefCell<Ui>>, parent: &gtk::Box, config: &Value) {
    if config["settings"]["autoAuthPaused"] != true {
        return;
    }
    let banner = card(parent, "");
    text(&banner, "自动认证已暂停", &[]);
    let actions = row(&banner, 0);
    let s = state.clone();
    button(&actions, "恢复自动认证", move || {
        mutate(&s, |c| c["settings"]["autoAuthPaused"] = json!(false))
    });
}
/// Copy for the sky panel; the recovery phase, when active, replaces it in `sky_panel`.
struct Sky {
    weather: Weather,
    place: String,
    title: String,
    body: String,
    /// Chip text and an extra style class (`strong`, `alert` or none).
    chips: Vec<(String, &'static str)>,
    action: Option<Box<dyn Fn(&gtk::Box)>>,
}
/// The weather panel at the top of the home page: copy on the left, actions at the bottom right and
/// a static Cairo illustration behind them.
fn sky_panel(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    mut view: Sky,
    snapshot: &Value,
    config: &Value,
) {
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
    let panel = gtk::Overlay::new();
    panel.add_css_class("sky");
    panel.set_overflow(gtk::Overflow::Hidden);
    let content = gtk::Box::new(gtk::Orientation::Horizontal, 18);
    content.add_css_class("sky-content");
    let copy = column(&content, 0, &["sky-copy"]);
    copy.set_hexpand(true);
    copy.set_valign(gtk::Align::End);
    let actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
    actions.add_css_class("sky-actions");
    actions.set_valign(gtk::Align::End);
    content.append(&actions);
    let chips = gtk::Box::new(gtk::Orientation::Horizontal, 6);
    chips.add_css_class("sky-chips");
    if let Some((status, failed)) = recovering {
        view.weather = if failed {
            Weather::Storm
        } else {
            Weather::Cloud
        };
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
        text(&copy, "WiFi 自动重连", &["sky-where"]);
        text(&copy, status, &["sky-title"]);
        let mut body = vec![];
        if !ssid.is_empty() {
            body.push(format!("目标 WiFi：{ssid}"));
        }
        if let Some(message) = snapshot["message"].as_str().filter(|m| !m.is_empty()) {
            body.push(message.to_string());
        }
        if !body.is_empty() {
            text(&copy, &body.join("\n"), &["sky-body"]);
        }
        copy.append(&chips);
        let countdown = gtk::Label::new(None);
        countdown.add_css_class("sky-chip");
        countdown.set_visible(false);
        chips.append(&countdown);
        state.borrow_mut().countdowns.push((countdown, false));
        let attempt = snapshot["attempt"].as_u64().unwrap_or(0);
        let max = snapshot["maxAttempts"].as_u64().unwrap_or(0);
        if max > 0 {
            let progress = row(&copy, 10);
            progress.add_css_class("sky-progress");
            let bar = gtk::ProgressBar::new();
            bar.add_css_class("sky-bar");
            bar.set_fraction((attempt as f64 / max as f64).clamp(0.0, 1.0));
            bar.set_hexpand(true);
            bar.set_valign(gtk::Align::Center);
            bar.update_property(&[gtk::accessible::Property::Label("尝试进度")]);
            progress.append(&bar);
            text(
                &progress,
                &format!("第 {attempt} / {max} 次"),
                &["sky-chip"],
            );
        }
        if failed {
            let s = state.clone();
            button(&actions, "立即重试", move || {
                send(&s, Command::Retry);
            });
        }
        if phase != "failed" && phase != "cancelled" {
            let s = state.clone();
            button(&actions, "停止恢复", move || {
                send(&s, Command::StopRecovery);
            });
        }
        // The home action stays reachable; while connecting it would only repeat the title.
        if failed && let Some(action) = view.action.as_ref() {
            action(&actions);
        }
    } else {
        text(&copy, &view.place, &["sky-where"]);
        text(&copy, &view.title, &["sky-title"]);
        text(&copy, &view.body, &["sky-body"]);
        copy.append(&chips);
        for (chip, class) in &view.chips {
            let l = gtk::Label::new(Some(chip.as_str()));
            l.add_css_class("sky-chip");
            if !class.is_empty() {
                l.add_css_class(class);
            }
            chips.append(&l);
        }
        if let Some(action) = view.action.as_ref() {
            action(&actions);
        }
    }
    panel.add_css_class(view.weather.class());
    let art = gtk::DrawingArea::builder()
        .accessible_role(gtk::AccessibleRole::Presentation)
        .can_target(false)
        .build();
    let weather = view.weather;
    art.set_draw_func(move |area, cr, width, height| {
        draw_weather(area, cr, width, height, weather)
    });
    panel.set_child(Some(&art));
    panel.add_overlay(&content);
    panel.set_measure_overlay(&content, true);
    parent.append(&panel);
    state.borrow_mut().sky_art = Some(art);
}
/// WifiReconnectFailedCard: per-network reasons once every WiFi has failed.
fn recovery_failures(parent: &gtk::Box, snapshot: &Value) {
    let failures = snapshot["failures"].as_array().cloned().unwrap_or_default();
    if failures.is_empty() || !matches!(snapshot["phase"].as_str(), Some("failed" | "cooldown")) {
        return;
    }
    let f = card(parent, "所有 WiFi 连接失败");
    f.add_css_class("progress-card");
    f.add_css_class("tone-danger");
    for failure in failures {
        text(
            &f,
            &format!(
                "{}：{}",
                failure["ssid"].as_str().unwrap_or(""),
                failure["reason"].as_str().unwrap_or("")
            ),
            &[],
        );
    }
}
fn signal_grade(percent: i32) -> (&'static str, &'static str) {
    match percent {
        75.. => ("优秀", "grade-excellent"),
        50..=74 => ("良好", "grade-good"),
        25..=49 => ("一般", "grade-fair"),
        _ => ("较差", "grade-poor"),
    }
}
fn speed_grade(speed: i32) -> (&'static str, &'static str) {
    match speed {
        500.. => ("优秀", "grade-excellent"),
        200..=499 => ("良好", "grade-good"),
        100..=199 => ("一般", "grade-fair"),
        50..=99 => ("较差", "grade-poor"),
        _ => ("很差", "grade-bad"),
    }
}
/// One cell of the metric strip: caption above a value row.
fn strip_cell(strip: &gtk::Box, title: &str) -> gtk::Box {
    let c = gtk::Box::new(gtk::Orientation::Vertical, 2);
    c.add_css_class("strip-cell");
    if strip.first_child().is_some() {
        c.add_css_class("divided");
    }
    text(&c, title, &["metric-title"]);
    let value = gtk::Box::new(gtk::Orientation::Horizontal, 6);
    c.append(&value);
    strip.append(&c);
    value
}
fn strip_value(cell: &gtk::Box, value: &str, grade: Option<(&str, &str)>) {
    let v = gtk::Label::new(Some(value));
    v.add_css_class("metric-value");
    v.set_selectable(true);
    cell.append(&v);
    if let Some((label, class)) = grade {
        if !class.is_empty() {
            v.add_css_class(class);
        }
        let g = gtk::Label::new(Some(label));
        g.set_css_classes(&["metric-grade", class]);
        g.set_valign(gtk::Align::Center);
        cell.append(&g);
    }
}
/// Signal, speed, band, internet and heartbeat in one card; the countdown label is the only
/// widget the one-second tick touches.
fn metric_strip(state: &Rc<RefCell<Ui>>, parent: &gtk::Box, snapshot: &Value, config: &Value) {
    let n = network(snapshot);
    let strip = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    strip.set_homogeneous(true);
    strip.set_css_classes(&["card", "strip"]);
    parent.append(&strip);
    let cell = strip_cell(&strip, "信号强度");
    match n.rssi {
        Some(rssi) => {
            let percent = ((rssi + 100) * 100 / 60).clamp(0, 100);
            strip_value(&cell, &format!("{percent}%"), Some(signal_grade(percent)));
        }
        None => strip_value(&cell, "未知", None),
    }
    let cell = strip_cell(&strip, "连接速度");
    match n.link_speed.filter(|s| *s > 0) {
        Some(speed) => strip_value(&cell, &format!("{speed} Mbps"), Some(speed_grade(speed))),
        None => strip_value(&cell, "未知", None),
    }
    let band = match n.frequency.unwrap_or(0) {
        5925.. => "6GHz",
        4900..=5924 => "5GHz",
        2400..=2500 => "2.4GHz",
        _ => "未知",
    };
    strip_value(&strip_cell(&strip, "频段"), band, None);
    let online = snapshot["internetReachable"] == true;
    let cell = strip_cell(&strip, "互联网");
    strip_value(&cell, if online { "可达" } else { "不可达" }, None);
    if let Some(v) = cell.first_child() {
        v.add_css_class(if online {
            "grade-excellent"
        } else {
            "grade-bad"
        });
    }
    if config["settings"]["enableHeartbeat"] != true {
        let cell = strip_cell(&strip, "心跳检测");
        strip_value(&cell, "已关闭", None);
        if let Some(v) = cell.first_child() {
            v.add_css_class("secondary");
        }
        return;
    }
    let interval = config["settings"]["heartbeatIntervalSeconds"]
        .as_u64()
        .unwrap_or(30);
    let cell = strip_cell(&strip, &format!("心跳检测 · 每 {interval} 秒"));
    let dot = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    dot.set_size_request(8, 8);
    dot.set_valign(gtk::Align::Center);
    dot.set_css_classes(&["dot", if online { "dot-ok" } else { "dot-bad" }]);
    cell.append(&dot);
    let state_label = gtk::Label::new(Some(if online { "正常" } else { "异常" }));
    state_label.set_css_classes(&[
        "metric-value",
        if online {
            "grade-excellent"
        } else {
            "grade-bad"
        },
    ]);
    cell.append(&state_label);
    let countdown = gtk::Label::new(None);
    countdown.set_css_classes(&["metric-grade", "secondary", "countdown"]);
    countdown.set_valign(gtk::Align::Center);
    countdown.set_visible(false);
    cell.append(&countdown);
    state.borrow_mut().countdowns.push((countdown, true));
}
/// Card header: title, a flexible gap and an optional trailing widget.
fn panel_card(parent: &gtk::Box, title: &str) -> (gtk::Box, gtk::Box) {
    let c = gtk::Box::new(gtk::Orientation::Vertical, 0);
    c.set_css_classes(&["card", "panel"]);
    let head = row(&c, 10);
    head.add_css_class("panel-head");
    text(&head, title, &["panel-title"]);
    spacer(&head);
    parent.append(&c);
    (c, head)
}
/// 网络详情: key/value table with right-aligned values.
fn wifi_details(state: &Rc<RefCell<Ui>>, parent: &gtk::Box, snapshot: &Value, config: &Value) {
    let n = network(snapshot);
    let (c, head) = panel_card(parent, "网络详情");
    let s = state.clone();
    let refresh = icon_button(
        &head,
        "view-refresh-symbolic",
        "刷新 WiFi 信息",
        move || {
            send(&s, Command::Snapshot);
        },
    );
    refresh.add_css_class("icon-btn");
    let table = gtk::Grid::new();
    table.add_css_class("kv");
    table.set_column_spacing(24);
    table.set_row_spacing(10);
    c.append(&table);
    let unknown = |v: &Option<String>| v.clone().unwrap_or_else(|| "未知".into());
    let channel = n
        .channel
        .map(|c| c.to_string())
        .unwrap_or_else(|| "未知".into());
    for (i, (key, value, mono)) in [
        ("WiFi 名称", unknown(&n.ssid), false),
        ("IPv4 地址", unknown(&n.ipv4), true),
        ("IPv6 地址", unknown(&n.ipv6), true),
        ("BSSID", unknown(&n.bssid), true),
        ("WiFi 信道", channel, true),
        ("安全类型", unknown(&n.security), false),
    ]
    .into_iter()
    .enumerate()
    {
        let k = gtk::Label::new(Some(key));
        k.set_xalign(0.0);
        k.set_valign(gtk::Align::Start);
        k.add_css_class("kv-key");
        table.attach(&k, 0, i as i32, 1, 1);
        let v = gtk::Label::new(Some(value.as_str()));
        v.set_xalign(1.0);
        v.set_hexpand(true);
        v.set_wrap(true);
        v.set_wrap_mode(gtk::pango::WrapMode::Char);
        v.set_justify(gtk::Justification::Right);
        v.set_selectable(true);
        v.add_css_class("kv-value");
        if mono {
            v.add_css_class("mono");
        }
        table.attach(&v, 1, i as i32, 1, 1);
    }
    if config["settings"]["enableHeartbeat"] != true {
        return;
    }
    let mut notes = vec![];
    if let Some(message) = snapshot["message"].as_str().filter(|m| !m.is_empty()) {
        notes.push(message.to_string());
    }
    if snapshot["monitorDegraded"] == true {
        notes.push("系统网络事件监听不可用，已改为定时检测".into());
    }
    if !notes.is_empty() {
        text(
            &c,
            &notes.join("\n"),
            &["secondary", "small", "muted-box", "panel-note"],
        );
    }
}
/// Left column while no WiFi is connected and heartbeat is enabled.
fn heartbeat_paused(parent: &gtk::Box) {
    let (c, head) = panel_card(parent, "心跳检测 (已暂停)");
    let dot = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    dot.set_size_request(8, 8);
    dot.set_valign(gtk::Align::Center);
    dot.set_css_classes(&["dot", "dot-idle"]);
    head.prepend(&dot);
    text(
        &c,
        "当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。",
        &["secondary", "small", "panel-text"],
    );
}
/// WifiSwitcherCard: configured networks ordered by priority, in fixed columns so badges and
/// actions line up: icon | name and subtitle | badge (84) | action (68).
fn switcher(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    snapshot: &Value,
    config: &Value,
    current: Option<&WifiRule>,
) {
    let mut list = rules(config);
    if list.is_empty() {
        return;
    }
    list.sort_by_key(|w| w.priority);
    let switching = matches!(
        snapshot["phase"].as_str(),
        Some("connecting" | "authenticating" | "verifying")
    );
    let (c, head) = panel_card(parent, "切换 WiFi");
    text(&head, "按优先级排序", &["secondary", "small"]);
    let rows = column(&c, 0, &["wifi-list"]);
    for wifi in list {
        let is_current = current.is_some_and(|r| r.id == wifi.id);
        let item = row(&rows, 12);
        item.add_css_class("wifi-row");
        if is_current {
            item.add_css_class("current");
        }
        let icon = gtk::Image::from_icon_name("network-wireless-symbolic");
        icon.set_pixel_size(18);
        icon.add_css_class("wifi-icon");
        item.append(&icon);
        let info = column(&item, 1, &[]);
        info.set_hexpand(true);
        info.set_valign(gtk::Align::Center);
        let name = text(&info, &wifi.ssid, &["wifi-row-name"]);
        name.set_wrap(false);
        name.set_ellipsize(gtk::pango::EllipsizeMode::End);
        let mut sub = vec![format!("优先级 {}", wifi.priority)];
        sub.extend(wifi.security.clone());
        sub.extend(wifi.bssid.clone());
        let sub = text(&info, &sub.join(" · "), &["secondary", "small"]);
        sub.set_wrap(false);
        sub.set_ellipsize(gtk::pango::EllipsizeMode::End);
        let tag = if wifi.requires_auth {
            badge(&item, "校园网认证", &["badge-auth", "wifi-tag"])
        } else {
            badge(&item, "普通热点", &["badge-open", "wifi-tag"])
        };
        tag.set_size_request(84, -1);
        tag.set_ellipsize(gtk::pango::EllipsizeMode::End);
        if is_current {
            let cur = gtk::Box::new(gtk::Orientation::Horizontal, 4);
            cur.add_css_class("wifi-current");
            cur.set_size_request(68, -1);
            cur.set_halign(gtk::Align::End);
            cur.set_valign(gtk::Align::Center);
            let mark = gtk::Image::from_icon_name("object-select-symbolic");
            mark.set_pixel_size(14);
            cur.append(&mark);
            cur.append(&gtk::Label::new(Some("当前")));
            item.append(&cur);
        } else {
            let s = state.clone();
            let id = wifi.id.clone();
            let b = button(&item, "切换", move || {
                send(&s, Command::Connect { id: id.clone() });
            });
            b.add_css_class("wifi-switch");
            b.set_size_request(68, -1);
            b.set_valign(gtk::Align::Center);
            b.update_property(&[gtk::accessible::Property::Label(&format!(
                "切换到 {}",
                wifi.ssid
            ))]);
            b.set_sensitive(!switching);
        }
    }
}
fn scrolled(body: &gtk::Box) -> (gtk::ScrolledWindow, gtk::Box) {
    let content = gtk::Box::new(gtk::Orientation::Vertical, 24);
    content.add_css_class("page-content");
    let scroll = gtk::ScrolledWindow::builder()
        .vexpand(true)
        .hscrollbar_policy(gtk::PolicyType::Never)
        .child(&content)
        .build();
    body.append(&scroll);
    (scroll, content)
}
/// A group whose accessible name differs from its visible heading (CI looks pages up by name).
fn named(parent: &gtk::Box, name: &str, spacing: i32) -> gtk::Box {
    let group = gtk::Box::builder()
        .orientation(gtk::Orientation::Vertical)
        .spacing(spacing)
        .accessible_role(gtk::AccessibleRole::Group)
        .build();
    group.update_property(&[gtk::accessible::Property::Label(name)]);
    parent.append(&group);
    group
}
/// Restores the scroll offset once the rebuilt page has been allocated.
fn restore_scroll(scroll: &gtk::ScrolledWindow, target: f64) {
    if target <= 0.0 {
        return;
    }
    let adjustment = scroll.vadjustment();
    let handler: Rc<RefCell<Option<glib::SignalHandlerId>>> = Rc::default();
    let slot = handler.clone();
    let id = adjustment.connect_changed(move |a| {
        a.set_value(target.min(a.upper() - a.page_size()));
        if a.upper() - a.page_size() >= target
            && let Some(id) = slot.borrow_mut().take()
        {
            a.disconnect(id);
        }
    });
    *handler.borrow_mut() = Some(id);
    let weak = adjustment.downgrade();
    glib::timeout_add_local_once(Duration::from_millis(800), move || {
        if let (Some(a), Some(id)) = (weak.upgrade(), handler.borrow_mut().take()) {
            a.disconnect(id);
        }
    });
}
fn render(state: &Rc<RefCell<Ui>>) {
    let (body, page) = {
        let ui = state.borrow();
        (ui.body.clone(), ui.page.clone())
    };
    let offset = {
        let ui = state.borrow();
        if ui.rendered_page == page {
            ui.scroll
                .as_ref()
                .map(|s| s.vadjustment().value())
                .unwrap_or(0.0)
        } else {
            0.0
        }
    };
    clear(&body);
    {
        let mut ui = state.borrow_mut();
        for (key, item) in &ui.navigation {
            item.set_active(key == &page);
        }
        ui.countdowns.clear();
        ui.home_signature.clear();
        ui.sky_art = None;
        ui.scroll = None;
        ui.rendered_page = page.clone();
    }
    match page.as_str() {
        "运行状态" => {
            page_title(&body, "运行状态");
            let (scroll, content) = scrolled(&body);
            let home = named(&content, "网络连接状态", 16);
            let mut ui = state.borrow_mut();
            ui.home = home;
            ui.scroll = Some(scroll);
            drop(ui);
            refresh_home(state);
        }
        "配置设置" => {
            page_title(&body, "配置设置");
            let (scroll, content) = scrolled(&body);
            settings_page(state, &content);
            restore_scroll(&scroll, offset);
            state.borrow_mut().scroll = Some(scroll);
        }
        "日志" => logs_page(state, &body),
        _ => {
            page_title(&body, "关于");
            let (scroll, content) = scrolled(&body);
            about_page(state, &content);
            state.borrow_mut().scroll = Some(scroll);
        }
    }
}
fn draft(state: &Rc<RefCell<Ui>>, key: &str, default: &str) -> String {
    state
        .borrow()
        .drafts
        .get(key)
        .cloned()
        .unwrap_or_else(|| default.into())
}
fn set_draft(state: &Rc<RefCell<Ui>>, key: &str, value: &str) {
    state.borrow_mut().drafts.insert(key.into(), value.into());
}
fn form_group(parent: &gtk::Box, title: &str) -> gtk::Box {
    let group = column(parent, 8, &["form-group"]);
    text(&group, title, &["form-label"]);
    group
}
/// An add-form field whose text is kept in `drafts` across re-renders.
fn draft_entry(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    key: &'static str,
    title: &str,
    name: &str,
    placeholder: &str,
    secret: bool,
) -> gtk::Entry {
    let group = form_group(parent, title);
    let e = gtk::Entry::new();
    e.set_text(&draft(state, key, ""));
    e.set_placeholder_text(Some(placeholder));
    e.set_visibility(!secret);
    e.update_property(&[gtk::accessible::Property::Label(name)]);
    e.add_css_class("form-control");
    let s = state.clone();
    e.connect_changed(move |e| set_draft(&s, key, &e.text()));
    group.append(&e);
    e
}
fn toggle_row(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    title: &str,
    desc: &str,
    checked: bool,
    edit: impl Fn(&mut Value, bool) + Clone + 'static,
) {
    let group = row(parent, 8);
    group.add_css_class("form-group");
    let c = gtk::CheckButton::with_label(title);
    c.set_active(checked);
    group.append(&c);
    if !desc.is_empty() {
        let d = text(&group, &format!("({desc})"), &["secondary", "small"]);
        d.set_hexpand(true);
    }
    let s = state.clone();
    c.connect_toggled(move |c| {
        let value = c.is_active();
        let edit = edit.clone();
        mutate(&s, move |config| edit(config, value));
    });
}
/// Number settings save 600 ms after the last change, so typing does not save every digit.
fn number_row(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    key: &'static str,
    title: &str,
    range: (f64, f64),
    value: f64,
) {
    let group = form_group(parent, title);
    let n = gtk::SpinButton::with_range(range.0, range.1, 1.0);
    n.set_value(value);
    n.update_property(&[gtk::accessible::Property::Label(title)]);
    n.add_css_class("form-control");
    group.append(&n);
    let pending: Rc<RefCell<Option<glib::SourceId>>> = Rc::default();
    let s = state.clone();
    n.connect_value_changed(move |n| {
        if let Some(id) = pending.borrow_mut().take() {
            id.remove();
        }
        let value = n.value_as_int();
        let s = s.clone();
        let slot = pending.clone();
        *pending.borrow_mut() = Some(glib::timeout_add_local_once(
            Duration::from_millis(600),
            move || {
                slot.borrow_mut().take();
                mutate(&s, move |c| c["settings"][key] = json!(value));
            },
        ));
    });
}
fn settings_page(state: &Rc<RefCell<Ui>>, content: &gtk::Box) {
    let config = state.borrow().config.clone();
    if config.is_null() {
        let c = card(content, "");
        text(&c, "加载中...", &[]);
        return;
    }
    let settings = config["settings"].clone();
    let general = card(content, "通用设置");
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
        toggle_row(
            state,
            &general,
            title,
            desc,
            settings[key] == true,
            move |c, v| c["settings"][key] = json!(v),
        );
    }
    let numbers = column(&general, 0, &["divider-top"]);
    let mut fields = vec![];
    if settings["enableHeartbeat"] == true {
        fields.push((
            "heartbeatIntervalSeconds",
            "心跳检测间隔 (秒)",
            (5.0, 300.0),
        ));
        fields.push((
            "heartbeatFailureThreshold",
            "连续失败阈值 (次，已在线后连续检测失败达到该次数才重新认证)",
            (1.0, 10.0),
        ));
    }
    fields.push((
        "wifiReconnectRetries",
        "每个 WiFi 最多尝试次数（含首次）",
        (1.0, 10.0),
    ));
    fields.push((
        "wifiReconnectCooldownMinutes",
        "冷却期时长 (分钟，全部 WiFi 失败后暂停重连；0 为不冷却)",
        (0.0, 1440.0),
    ));
    for (key, title, range) in fields {
        let value = settings[key].as_f64().unwrap_or(range.0);
        number_row(state, &numbers, key, title, range, value);
    }
    let notices = card(content, "通知设置");
    for (key, title) in [
        ("wifiDisconnected", "WiFi 断开"),
        ("reconnectSuccess", "自动重连成功"),
        ("reconnectFailed", "自动重连全部失败"),
        ("authRecovered", "认证恢复成功"),
    ] {
        toggle_row(
            state,
            &notices,
            title,
            "",
            settings["notificationSettings"][key] != false,
            move |c, v| c["settings"]["notificationSettings"][key] = json!(v),
        );
    }
    pause_banner(state, content, &config);
    nearby(state, content, &config);
    accounts(state, content, &config);
    wifis(state, content, &config);
}
fn nearby(state: &Rc<RefCell<Ui>>, content: &gtk::Box, config: &Value) {
    let c = card(content, "附近 WiFi");
    text(
        &c,
        "扫描附近网络，选择后添加配置或编辑已保存的网络。",
        &["secondary"],
    );
    let actions = row(&c, 0);
    let scanning = state.borrow().scanning;
    let s = state.clone();
    let b = button(
        &actions,
        if scanning {
            "扫描中…"
        } else {
            "扫描附近 WiFi"
        },
        move || {
            if send(&s, Command::Scan) {
                s.borrow_mut().scanning = true;
                if let Some(b) = s.borrow().scan_button.as_ref() {
                    b.set_label("扫描中…");
                    b.set_sensitive(false);
                }
            }
        },
    );
    b.set_sensitive(!scanning);
    state.borrow_mut().scan_button = Some(b);
    let scan = state.borrow().scan.clone();
    let Some(networks) = scan.as_array() else {
        return;
    };
    if networks.is_empty() {
        text(
            &c,
            "未发现网络，请确认 WiFi 已开启，或手动填写 WiFi 名称。",
            &["secondary"],
        );
        return;
    }
    let list = column(&c, 0, &["list"]);
    for value in networks {
        let n: Network = serde_json::from_value(value.clone()).unwrap_or_default();
        let saved = current_rule(config, &n);
        let item = row(&list, 12);
        item.add_css_class("list-row");
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
        let l = text(&item, &parts.join(" · "), &[]);
        l.set_hexpand(true);
        let s = state.clone();
        let ssid = n.ssid.clone().unwrap_or_default();
        let b = match saved {
            Some(rule) => {
                let id = rule.id.clone();
                button(&item, "编辑", move || {
                    let rule = s.borrow().config["wifiRules"]
                        .as_array()
                        .and_then(|r| r.iter().find(|w| w["id"] == json!(id)).cloned());
                    if let Some(rule) = rule {
                        wifi_editor(&s, rule);
                    }
                })
            }
            None => button(&item, "选择", move || {
                set_draft(&s, "wifi.ssid", n.ssid.as_deref().unwrap_or(""));
                set_draft(&s, "wifi.security", n.security.as_deref().unwrap_or(""));
                set_draft(&s, "wifi.bssid", n.bssid.as_deref().unwrap_or(""));
                render(&s);
            }),
        };
        b.update_property(&[gtk::accessible::Property::Label(&format!(
            "{}网络 {ssid}",
            b.label().unwrap_or_default()
        ))]);
    }
}
fn empty_box(parent: &gtk::Box, icon: &str, message: &str) {
    let b = column(parent, 8, &["empty-box"]);
    let image = gtk::Image::from_icon_name(icon);
    image.set_pixel_size(32);
    image.add_css_class("faded");
    b.append(&image);
    centered(&b, message, &["secondary"]);
}
fn accounts(state: &Rc<RefCell<Ui>>, content: &gtk::Box, config: &Value) {
    let c = named(content, "账号配置", 14);
    c.add_css_class("card");
    text(&c, "账号管理", &["card-title"]);
    let list = config["accounts"].as_array().cloned().unwrap_or_default();
    if list.is_empty() {
        empty_box(
            &c,
            "avatar-default-symbolic",
            "暂无账号，请添加账号以使用登录功能",
        );
    }
    let rows = column(&c, 0, &["list"]);
    for account in list {
        let item = row(&rows, 12);
        item.add_css_class("list-row");
        let info = column(&item, 4, &[]);
        info.set_hexpand(true);
        let title = row(&info, 8);
        let username = account["username"].as_str().unwrap_or("").to_string();
        text(&title, &username, &["strong"]);
        badge(
            &title,
            isp_label(account["isp"].as_str().unwrap_or("")),
            &["badge-isp"],
        );
        text(
            &info,
            account["serverUrl"].as_str().unwrap_or(""),
            &["secondary", "small"],
        );
        let actions = row(&item, 8);
        actions.set_valign(gtk::Align::Center);
        let id = account["id"].clone();
        let current = config["currentAccountId"] == id;
        let s = state.clone();
        let use_id = id.clone();
        let b = button(
            &actions,
            if current {
                "使用中"
            } else {
                "使用此账号"
            },
            move || {
                let id = use_id.clone();
                mutate(&s, move |c| c["currentAccountId"] = id.clone());
            },
        );
        b.add_css_class("compact");
        if current {
            b.add_css_class("primary");
            b.set_sensitive(false);
        }
        let s = state.clone();
        let edit = account.clone();
        button(&actions, "编辑", move || account_editor(&s, edit.clone())).update_property(&[
            gtk::accessible::Property::Label(&format!("编辑账号 {username}")),
        ]);
        let s = state.clone();
        let b = icon_button(
            &actions,
            "user-trash-symbolic",
            &format!("删除账号 {username}"),
            move || remove_account(&s, id.clone()),
        );
        b.add_css_class("danger");
    }
    text(&c, "添加新账号", &["form-heading"]);
    let user = draft_entry(
        state,
        &c,
        "account.username",
        "用户名",
        "用户名",
        "请输入学号/用户名",
        false,
    );
    let password = draft_entry(
        state,
        &c,
        "account.password",
        "密码",
        "密码",
        "请输入密码",
        true,
    );
    let isp = form_group(&c, "运营商");
    let values = ["campus", "cmcc", "cucc", "ctcc"];
    let selected = draft(state, "account.isp", "campus");
    let choice = dropdown(
        &values.map(isp_label),
        "运营商",
        values.iter().position(|v| *v == selected).unwrap_or(0) as u32,
        false,
    );
    let s = state.clone();
    choice.connect_selected_notify(move |d| {
        if let Some(value) = values.get(d.selected() as usize) {
            set_draft(&s, "account.isp", value);
        }
    });
    isp.append(&choice);
    if !state.borrow().drafts.contains_key("account.server") {
        set_draft(state, "account.server", "http://10.10.102.50:801");
    }
    let server = draft_entry(
        state,
        &c,
        "account.server",
        "登录服务器地址",
        "登录服务器地址",
        "",
        false,
    );
    if let Some(error) = state.borrow().drafts.get("account.error") {
        text(&c, error, &["error-text"]);
    }
    let s = state.clone();
    let b = button(&c, "保存并添加账号", move || {
        let username = user.text().trim().to_string();
        let secret = password.text().to_string();
        let error = if username.is_empty() || secret.is_empty() {
            Some("请输入用户名和密码")
        } else if s.borrow().config["accounts"]
            .as_array()
            .is_some_and(|a| a.iter().any(|a| a["username"] == json!(username)))
        {
            Some("该用户名已存在")
        } else {
            None
        };
        if let Some(error) = error {
            set_draft(&s, "account.error", error);
            render(&s);
            return;
        }
        s.borrow_mut().drafts.remove("account.error");
        let id = format!("account-{}", now_ms());
        let account = json!({"id":id,"name":username,"username":username,"serverUrl":server.text().trim(),"isp":draft(&s,"account.isp","campus"),"passwordEdit":{"action":"replace","value":secret}});
        s.borrow_mut().clear_on_save.push("account.".into());
        mutate(&s, move |c| {
            c["accounts"].as_array_mut().unwrap().push(account.clone());
            if c["currentAccountId"].is_null() {
                c["currentAccountId"] = json!(id);
            }
        });
    });
    b.add_css_class("primary");
    b.set_hexpand(true);
}
fn remove_account(state: &Rc<RefCell<Ui>>, id: Value) {
    mutate(state, move |c| {
        c["accounts"]
            .as_array_mut()
            .unwrap()
            .retain(|a| a["id"] != id);
        if c["currentAccountId"] == id {
            c["currentAccountId"] = Value::Null;
        }
        for w in c["wifiRules"].as_array_mut().unwrap() {
            if let Some(ids) = w["linkedAccountIds"].as_array_mut() {
                ids.retain(|linked| linked != &id);
            }
        }
    });
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
fn wifis(state: &Rc<RefCell<Ui>>, content: &gtk::Box, config: &Value) {
    let c = card(content, "WiFi 配置");
    text(
        &c,
        "配置WiFi网络及其连接选项。新添加的WiFi默认启用自动重连，WiFi断开后会自动尝试重新连接。点击刷新图标按钮可切换自动重连状态。",
        &["secondary", "small"],
    );
    let accounts = config["accounts"].as_array().cloned().unwrap_or_default();
    let list = config["wifiRules"].as_array().cloned().unwrap_or_default();
    if list.is_empty() {
        empty_box(&c, "network-wireless-symbolic", "暂无 WiFi 配置");
    }
    let rows = column(&c, 0, &["list"]);
    for wifi in list {
        let item = row(&rows, 12);
        item.add_css_class("list-row");
        let info = column(&item, 4, &[]);
        info.set_hexpand(true);
        let title = row(&info, 6);
        let ssid = wifi["ssid"].as_str().unwrap_or("").to_string();
        text(&title, &ssid, &["strong"]);
        let auth = wifi["requiresAuth"] == true;
        let auto = wifi["autoConnect"] == true;
        let priority = wifi["priority"].as_u64().unwrap_or(10);
        if auth {
            badge(&title, "需要认证", &["badge-auth"]);
        } else {
            badge(&title, "无需认证", &["badge-open"]);
        }
        badge(
            &title,
            &format!("★ 优先级 {priority}"),
            &[priority_class(priority)],
        );
        if auto {
            badge(&title, "自动重连", &["badge-auto"]);
        } else {
            badge(&title, "手动连接", &["badge-manual"]);
        }
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
                text(
                    &info,
                    "未关联账号（账号可能已删除）",
                    &["error-text", "small"],
                );
            } else {
                text(
                    &info,
                    &format!("关联账号: {}", linked.join("，")),
                    &["secondary", "small"],
                );
            }
        }
        let actions = row(&item, 8);
        actions.set_valign(gtk::Align::Center);
        let id = wifi["id"].clone();
        let s = state.clone();
        let toggle_id = id.clone();
        let b = icon_button(
            &actions,
            "view-refresh-symbolic",
            &if auto {
                format!("禁用 {ssid} 自动重连")
            } else {
                format!("启用 {ssid} 自动重连")
            },
            move || {
                let id = toggle_id.clone();
                mutate(&s, move |c| {
                    for w in c["wifiRules"].as_array_mut().unwrap() {
                        if w["id"] == id {
                            w["autoConnect"] = json!(w["autoConnect"] != true);
                        }
                    }
                });
            },
        );
        b.add_css_class(if auto { "auto-on" } else { "auto-off" });
        let s = state.clone();
        let connect = id.as_str().unwrap_or("").to_string();
        button(&actions, "连接", move || {
            send(
                &s,
                Command::Connect {
                    id: connect.clone(),
                },
            );
        })
        .update_property(&[gtk::accessible::Property::Label(&format!("连接 {ssid}"))]);
        let s = state.clone();
        let edit = wifi.clone();
        button(&actions, "编辑", move || wifi_editor(&s, edit.clone())).update_property(&[
            gtk::accessible::Property::Label(&format!("编辑 WiFi {ssid}")),
        ]);
        let s = state.clone();
        let b = icon_button(
            &actions,
            "user-trash-symbolic",
            &format!("删除 WiFi {ssid}"),
            move || {
                let id = id.clone();
                mutate(&s, move |c| {
                    c["wifiRules"]
                        .as_array_mut()
                        .unwrap()
                        .retain(|w| w["id"] != id)
                });
            },
        );
        b.add_css_class("danger");
    }
    text(&c, "添加 WiFi", &["form-heading"]);
    let ssid = draft_entry(
        state,
        &c,
        "wifi.ssid",
        "WiFi 名称 (SSID)",
        "WiFi 名称",
        "请输入 WiFi 名称",
        false,
    );
    let security = draft_entry(
        state,
        &c,
        "wifi.security",
        "安全类型（留空自动识别）",
        "安全类型",
        "WPA2 / WPA3 / WPA2-WPA3 / Open",
        false,
    );
    let bssid = draft_entry(
        state,
        &c,
        "wifi.bssid",
        "BSSID（可选，限定接入点）",
        "BSSID",
        "aa:bb:cc:dd:ee:ff",
        false,
    );
    let password = draft_entry(
        state,
        &c,
        "wifi.password",
        "WiFi 密码",
        "WiFi 密码",
        "请输入 WiFi 密码（可选）",
        true,
    );
    let auth = draft(state, "wifi.auth", "1") == "1";
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
            draft(state, "wifi.auto", "1") == "1",
        ),
    ] {
        let group = row(&c, 8);
        group.add_css_class("form-group");
        let check = gtk::CheckButton::with_label(title);
        check.set_active(value);
        group.append(&check);
        text(&group, &format!("({desc})"), &["secondary", "small"]);
        let s = state.clone();
        check.connect_toggled(move |check| {
            set_draft(&s, key, if check.is_active() { "1" } else { "0" });
            if key == "wifi.auth" {
                s.borrow_mut().drafts.remove("wifi.account");
                render(&s);
            }
        });
    }
    if auth {
        let group = form_group(&c, "关联账号");
        if accounts.is_empty() {
            text(&group, "请先在上方「账号管理」添加账号", &["warning-box"]);
        } else {
            let selected = draft(state, "wifi.account", "");
            let mut first: Option<gtk::ToggleButton> = None;
            for account in &accounts {
                let id = account["id"].as_str().unwrap_or("").to_string();
                let name = account["username"].as_str().unwrap_or("").to_string();
                let t = gtk::ToggleButton::new();
                let inner = gtk::Box::new(gtk::Orientation::Vertical, 2);
                text(&inner, &name, &["strong"]);
                text(
                    &inner,
                    &format!(
                        "{} · {}",
                        isp_label(account["isp"].as_str().unwrap_or("")),
                        account["serverUrl"].as_str().unwrap_or("")
                    ),
                    &["secondary", "tiny"],
                );
                t.set_child(Some(&inner));
                t.add_css_class("choice");
                t.update_property(&[gtk::accessible::Property::Label(&format!(
                    "选择账号 {name}"
                ))]);
                t.set_group(first.as_ref());
                t.set_active(selected == id);
                let s = state.clone();
                t.connect_toggled(move |t| {
                    if t.is_active() {
                        set_draft(&s, "wifi.account", &id);
                    }
                });
                group.append(&t);
                first.get_or_insert(t);
            }
        }
    }
    let group = form_group(&c, "优先级");
    let priority = gtk::SpinButton::with_range(1.0, 99.0, 1.0);
    priority.set_value(draft(state, "wifi.priority", "10").parse().unwrap_or(10.0));
    priority.update_property(&[gtk::accessible::Property::Label("WiFi 优先级")]);
    priority.add_css_class("form-control");
    let s = state.clone();
    priority.connect_value_changed(move |p| {
        set_draft(&s, "wifi.priority", &p.value_as_int().to_string())
    });
    group.append(&priority);
    text(
        &group,
        "数字越小优先级越高（1=最高，99=最低，默认=10）",
        &["secondary", "small"],
    );
    if let Some(error) = state.borrow().drafts.get("wifi.error") {
        text(&c, error, &["error-text"]);
    }
    let s = state.clone();
    let add = button(&c, "添加 WiFi", move || {
        let name = ssid.text().trim().to_string();
        let secret = password.text().to_string();
        let typed = security.text().trim().to_string();
        let resolved =
            if !secret.is_empty() && (typed.is_empty() || typed.eq_ignore_ascii_case("open")) {
                Some("WPA2".to_string())
            } else {
                Some(typed.clone()).filter(|t| !t.is_empty())
            };
        let ap = Some(bssid.text().trim().to_string()).filter(|b| !b.is_empty());
        let auth = draft(&s, "wifi.auth", "1") == "1";
        let account = draft(&s, "wifi.account", "");
        // Without a typed security or BSSID any rule with the same name counts as a duplicate.
        let loose = typed.is_empty() && ap.is_none();
        let exists = s.borrow().config["wifiRules"]
            .as_array()
            .is_some_and(|rules| {
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
            set_draft(&s, "wifi.error", error);
            render(&s);
            return;
        }
        s.borrow_mut().drafts.remove("wifi.error");
        let rule = json!({
            "id": format!("wifi-{}", now_ms()),
            "ssid": name,
            "passwordEdit": if secret.is_empty() { json!({"action":"clear"}) } else { json!({"action":"replace","value":secret}) },
            "security": resolved,
            "bssid": ap,
            "priority": priority_value(&s),
            "autoConnect": draft(&s, "wifi.auto", "1") == "1",
            "requiresAuth": auth,
            "linkedAccountIds": if auth { vec![account] } else { vec![] },
        });
        s.borrow_mut().clear_on_save.push("wifi.".into());
        mutate(&s, move |c| {
            c["wifiRules"].as_array_mut().unwrap().push(rule.clone())
        });
    });
    add.set_sensitive(!(auth && accounts.is_empty()));
}
fn priority_value(state: &Rc<RefCell<Ui>>) -> u64 {
    draft(state, "wifi.priority", "10")
        .parse::<u64>()
        .unwrap_or(10)
        .clamp(1, 99)
}
fn entry(box_: &gtk::Box, title: &str, value: &str) -> gtk::Entry {
    let group = form_group(box_, title);
    let e = gtk::Entry::new();
    e.set_text(value);
    e.update_property(&[gtk::accessible::Property::Label(title)]);
    e.set_hexpand(true);
    e.add_css_class("form-control");
    group.append(&e);
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
    d.add_css_class("dialog");
    if state.borrow().window.has_css_class("dark") {
        d.add_css_class("dark");
    }
    let box_ = gtk::Box::new(gtk::Orientation::Vertical, 8);
    box_.add_css_class("dialog-body");
    let heading = gtk::Label::new(Some(title));
    heading.set_xalign(0.0);
    heading.add_css_class("card-title");
    box_.append(&heading);
    let scroll = gtk::ScrolledWindow::builder()
        .child(&box_)
        .vexpand(true)
        .hscrollbar_policy(gtk::PolicyType::Never)
        .build();
    d.set_child(Some(&scroll));
    (d, box_)
}
fn put_item(state: &Rc<RefCell<Ui>>, field: &'static str, item: Value) {
    mutate(state, move |config| {
        let items = config[field].as_array_mut().unwrap();
        if let Some(i) = items.iter().position(|old| old["id"] == item["id"]) {
            items[i] = item.clone();
        } else {
            items.push(item.clone())
        }
    });
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
fn account_editor(state: &Rc<RefCell<Ui>>, old: Value) {
    let (d, b) = dialog(state, "编辑账号");
    let name = entry(&b, "显示名称", old["name"].as_str().unwrap_or(""));
    let user = entry(&b, "用户名", old["username"].as_str().unwrap_or(""));
    let pw = entry(&b, "密码（留空保留）", "");
    pw.set_visibility(false);
    let clear = check(&b, "清空已保存密码", false);
    let server = entry(
        &b,
        "登录服务器地址",
        old["serverUrl"].as_str().unwrap_or(""),
    );
    let group = form_group(&b, "运营商");
    let values = ["campus", "cmcc", "cucc", "ctcc"];
    let isp = dropdown(
        &values.map(isp_label),
        "运营商",
        values
            .iter()
            .position(|v| Some(*v) == old["isp"].as_str())
            .unwrap_or(0) as u32,
        false,
    );
    group.append(&isp);
    let actions = row(&b, 8);
    let s = state.clone();
    let dialog = d.clone();
    let id = old["id"].clone();
    button(&actions, "保存", move || {
        put_item(
            &s,
            "accounts",
            json!({"id":id,"name":name.text().as_str(),"username":user.text().trim(),"serverUrl":server.text().trim(),"isp":values[isp.selected() as usize],"passwordEdit":password(&pw,&clear)}),
        );
        dialog.close();
    });
    let s = state.clone();
    let dialog = d.clone();
    button(&actions, "删除账号", move || {
        remove_account(&s, old["id"].clone());
        dialog.close();
    });
    d.present();
}
fn wifi_editor(state: &Rc<RefCell<Ui>>, old: Value) {
    let (d, b) = dialog(state, "编辑 WiFi");
    let ssid = entry(&b, "WiFi 名称 (SSID)", old["ssid"].as_str().unwrap_or(""));
    let pw = entry(&b, "WiFi 密码（留空保留）", "");
    pw.set_visibility(false);
    let clear = check(&b, "清空密码（开放网络）", false);
    let sec = entry(
        &b,
        "安全类型（留空自动识别）",
        old["security"].as_str().unwrap_or(""),
    );
    let bssid = entry(
        &b,
        "BSSID（可选，限定接入点）",
        old["bssid"].as_str().unwrap_or(""),
    );
    let group = form_group(&b, "优先级");
    let priority = gtk::SpinButton::with_range(1.0, 99.0, 1.0);
    priority.set_value(old["priority"].as_f64().unwrap_or(10.0));
    priority.update_property(&[gtk::accessible::Property::Label("WiFi 优先级")]);
    group.append(&priority);
    let auto = check(&b, "断开后自动重连", old["autoConnect"] == true);
    let auth = check(&b, "需要校园网认证", old["requiresAuth"] == true);
    let group = form_group(&b, "关联账号（按下面顺序尝试；可调整序号）");
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
        let line = row(&group, 12);
        let c = check(
            &line,
            a["name"]
                .as_str()
                .filter(|s| !s.is_empty())
                .or(a["username"].as_str())
                .unwrap_or("账号"),
            active,
        );
        c.set_hexpand(true);
        let order = gtk::SpinButton::with_range(1.0, 100.0, 1.0);
        order.set_value(
            old["linkedAccountIds"]
                .as_array()
                .and_then(|ids| ids.iter().position(|v| v == &json!(id)))
                .map(|p| p + 1)
                .unwrap_or(100) as f64,
        );
        line.append(&order);
        linked.push((id, c, order));
    }
    let actions = row(&b, 8);
    let s = state.clone();
    let id = old["id"].clone();
    let dialog = d.clone();
    button(&actions, "保存", move || {
        let mut ids: Vec<_> = linked.iter().filter(|(_, c, _)| c.is_active()).collect();
        ids.sort_by_key(|(_, _, n)| n.value_as_int());
        let value = json!({"id":id,"ssid":ssid.text().trim(),"passwordEdit":password(&pw,&clear),"security":if sec.text().is_empty(){Value::Null}else{json!(sec.text().as_str())},"bssid":if bssid.text().is_empty(){Value::Null}else{json!(bssid.text().as_str())},"priority":priority.value_as_int(),"autoConnect":auto.is_active(),"requiresAuth":auth.is_active(),"linkedAccountIds":ids.iter().map(|(id,_,_)|id).collect::<Vec<_>>()});
        put_item(&s, "wifiRules", value);
        dialog.close();
    });
    let s = state.clone();
    let dialog = d.clone();
    button(&actions, "删除网络", move || {
        let id = old["id"].clone();
        mutate(&s, move |c| {
            c["wifiRules"]
                .as_array_mut()
                .unwrap()
                .retain(|w| w["id"] != id)
        });
        dialog.close();
    });
    d.present();
}
fn about_page(state: &Rc<RefCell<Ui>>, content: &gtk::Box) {
    // Prototype layout: a hero card across the top, then features | update and project cards.
    let grid = gtk::Grid::new();
    grid.add_css_class("about");
    grid.set_column_spacing(16);
    grid.set_row_spacing(16);
    grid.set_column_homogeneous(true);
    content.append(&grid);
    let hero = gtk::Box::new(gtk::Orientation::Horizontal, 20);
    hero.set_css_classes(&["card", "about-hero"]);
    grid.attach(&hero, 0, 0, 2, 1);
    let mark = gtk::Box::new(gtk::Orientation::Vertical, 0);
    mark.add_css_class("about-mark");
    mark.set_size_request(64, 64);
    mark.set_valign(gtk::Align::Center);
    let icon = gtk::Image::from_icon_name("network-wireless-symbolic");
    icon.set_pixel_size(34);
    icon.set_vexpand(true);
    mark.append(&icon);
    hero.append(&mark);
    let names = column(&hero, 2, &[]);
    names.set_hexpand(true);
    names.set_valign(gtk::Align::Center);
    text(&names, "NetMate", &["about-name"]);
    text(&names, "智能 WiFi 管理工具", &["secondary"]);
    let version = badge(
        &hero,
        concat!("版本 ", env!("CARGO_PKG_VERSION")),
        &["version-pill"],
    );
    version.set_valign(gtk::Align::Center);
    let features = gtk::Box::new(gtk::Orientation::Vertical, 9);
    features.add_css_class("card");
    grid.attach(&features, 0, 1, 1, 1);
    text(&features, "核心功能", &["card-title"]);
    for item in [
        "WiFi 自动重连（三阶段优先级切换）",
        "校园网认证自动登录",
        "多账户管理",
        "网络状态监控",
        "心跳检测与断线重连",
    ] {
        let line = row(&features, 10);
        line.add_css_class("feature");
        let image = gtk::Image::from_icon_name("object-select-symbolic");
        image.set_pixel_size(16);
        image.add_css_class("ok-icon");
        line.append(&image);
        text(&line, item, &[]);
    }
    let side = gtk::Box::new(gtk::Orientation::Vertical, 16);
    grid.attach(&side, 1, 1, 1, 1);
    let update = card(&side, "更新检查");
    let status = text(&update, "", &["secondary", "small"]);
    status.set_selectable(true);
    let actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
    update.append(&actions);
    {
        let mut ui = state.borrow_mut();
        ui.update_label = status;
        ui.update_actions = actions;
    }
    update_view(state);
    let links = card(&side, "项目信息");
    links.set_spacing(8);
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
        let link = gtk::LinkButton::with_label(url, title);
        link.set_halign(gtk::Align::Start);
        link.add_css_class("about-link");
        links.append(&link);
    }
    text(
        &links,
        "© 2026 NetMate. All rights reserved.",
        &["secondary", "small"],
    );
    let quit = row(&links, 0);
    let s = state.clone();
    let b = button(&quit, "退出 NetMate", move || {
        send(&s, Command::Quit);
    });
    b.add_css_class("danger");
}
/// About page update row; the agent's update state decides which actions are offered.
fn update_view(state: &Rc<RefCell<Ui>>) {
    let (label, actions, update) = {
        let ui = state.borrow();
        (
            ui.update_label.clone(),
            ui.update_actions.clone(),
            ui.update.clone(),
        )
    };
    clear(&actions);
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
    label.set_text(&message);
    let s = state.clone();
    let add = |title: &str, command: Command| {
        let s = s.clone();
        button(&actions, title, move || update_command(&s, command.clone()))
    };
    match phase {
        "downloading" => {
            add("查看下载进度", Command::UpdateStatus);
            add("取消下载", Command::UpdateCancel);
        }
        "downloaded" => {
            add("立即安装", Command::UpdateInstall);
        }
        _ if available.is_some() => {
            add("下载更新", Command::UpdateDownload);
        }
        _ => {}
    }
    add("检查更新", Command::UpdateCheck).set_sensitive(!checking && phase != "downloading");
}
fn update_command(state: &Rc<RefCell<Ui>>, command: Command) {
    let checking = matches!(command, Command::UpdateCheck);
    if send(state, command) && checking {
        state.borrow_mut().update["checking"] = json!(true);
        update_view(state);
    }
}
/// Polls the download while the About page shows it, as the old update panel did.
fn poll_update(state: &Rc<RefCell<Ui>>) {
    let weak = Rc::downgrade(state);
    glib::timeout_add_local_once(Duration::from_secs(1), move || {
        if let Some(state) = weak.upgrade()
            && state.borrow().page == "关于"
            && state.borrow().update["state"] == "downloading"
        {
            send(&state, Command::UpdateStatus);
        }
    });
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
fn format_time(ms: u64) -> String {
    glib::DateTime::from_unix_local((ms / 1000) as i64)
        .and_then(|t| t.format("%Y-%m-%d %H:%M:%S"))
        .map(|t| t.to_string())
        .unwrap_or_default()
}
fn reload_logs(state: &Rc<RefCell<Ui>>) {
    let q = {
        let mut ui = state.borrow_mut();
        ui.query.cursor = None;
        ui.cursors.clear();
        ui.query.clone()
    };
    send(state, Command::Logs(q));
}
fn logs_page(state: &Rc<RefCell<Ui>>, body: &gtk::Box) {
    let heading = gtk::Box::new(gtk::Orientation::Horizontal, 16);
    heading.add_css_class("logs-heading");
    body.append(&heading);
    let titles = column(&heading, 6, &[]);
    titles.set_hexpand(true);
    page_title(&titles, "运行日志");
    text(
        &titles,
        "连接、认证与恢复记录，保留最近 7 天",
        &["secondary", "small"],
    );
    let s = state.clone();
    let refresh = button(&heading, "刷新", move || reload_logs(&s));
    refresh.set_valign(gtk::Align::Center);
    let panel = gtk::Box::new(gtk::Orientation::Vertical, 0);
    panel.add_css_class("card");
    panel.add_css_class("logs-card");
    panel.set_vexpand(true);
    body.append(&panel);
    let toolbar = row(&panel, 12);
    toolbar.add_css_class("logs-toolbar");
    let keyword = gtk::SearchEntry::new();
    keyword.set_placeholder_text(Some("搜索消息或详情"));
    keyword.update_property(&[gtk::accessible::Property::Label("搜索全部保留历史")]);
    keyword.set_text(&state.borrow().query.keyword);
    keyword.set_hexpand(true);
    keyword.set_valign(gtk::Align::Center);
    toolbar.append(&keyword);
    let source = gtk::Entry::new();
    source.set_placeholder_text(Some("全部来源"));
    source.update_property(&[gtk::accessible::Property::Label("来源")]);
    source.set_text(&state.borrow().query.source);
    source.set_width_chars(10);
    source.set_valign(gtk::Align::Center);
    toolbar.append(&source);
    let hours = gtk::SpinButton::with_range(0.0, 168.0, 1.0);
    hours.set_tooltip_text(Some("最近小时（0=全部）"));
    hours.set_valign(gtk::Align::Center);
    hours.update_property(&[gtk::accessible::Property::Label("最近小时")]);
    if let Some(start) = state.borrow().query.start_time {
        hours.set_value(((now_ms().saturating_sub(start)) / 3_600_000).max(1) as f64);
    }
    toolbar.append(&hours);
    let s = state.clone();
    let apply = {
        let keyword = keyword.clone();
        move || {
            let mut ui = s.borrow_mut();
            ui.query.keyword = keyword.text().to_string();
            ui.query.source = source.text().to_string();
            ui.query.start_time = if hours.value_as_int() > 0 {
                Some(now_ms().saturating_sub(hours.value_as_int() as u64 * 3_600_000))
            } else {
                None
            };
            drop(ui);
            reload_logs(&s);
        }
    };
    let apply = Rc::new(apply);
    let run = apply.clone();
    keyword.connect_activate(move |_| run());
    let run = apply.clone();
    let filter = button(&toolbar, "筛选", move || run());
    filter.set_valign(gtk::Align::Center);
    let controls = row(&panel, 12);
    controls.add_css_class("logs-controls");
    let levels = row(&controls, 2);
    levels.add_css_class("seg");
    levels.set_valign(gtk::Align::Center);
    let current = state.borrow().query.level.clone();
    let mut first: Option<gtk::ToggleButton> = None;
    for value in ["", "info", "success", "warn", "error", "debug"] {
        let t = gtk::ToggleButton::with_label(if value.is_empty() {
            "全部"
        } else {
            level_label(value)
        });
        t.add_css_class("log-filter");
        t.set_group(first.as_ref());
        t.set_active(current == value || (value.is_empty() && current == "all"));
        let s = state.clone();
        t.connect_toggled(move |t| {
            if t.is_active() {
                s.borrow_mut().query.level = value.into();
                reload_logs(&s);
            }
        });
        levels.append(&t);
        first.get_or_insert(t);
    }
    spacer(&controls);
    let count = text(&controls, "", &["secondary", "small", "log-count"]);
    count.set_wrap(false);
    count.set_valign(gtk::Align::Center);
    let model = state.borrow().log_model.clone();
    let selection = gtk::SingleSelection::new(Some(model));
    selection.set_autoselect(false);
    let factory = gtk::SignalListItemFactory::new();
    factory.connect_setup(|_, item| {
        let item = item.downcast_ref::<gtk::ListItem>().unwrap();
        // Four columns as in the prototype: time | level | source | message.
        let entry = gtk::Box::new(gtk::Orientation::Horizontal, 12);
        entry.add_css_class("log-row");
        let meta = gtk::Box::new(gtk::Orientation::Horizontal, 12);
        for class in ["log-time", "log-level", "log-source"] {
            let l = gtk::Label::new(None);
            l.set_xalign(0.0);
            l.add_css_class(class);
            meta.append(&l);
        }
        entry.append(&meta);
        let message = gtk::Label::new(None);
        message.set_xalign(0.0);
        message.set_ellipsize(gtk::pango::EllipsizeMode::End);
        message.set_hexpand(true);
        message.add_css_class("log-message");
        entry.append(&message);
        item.set_child(Some(&entry));
    });
    // A weak reference: the list lives inside `state.body`, so a strong one would form a cycle.
    let weak = Rc::downgrade(state);
    factory.connect_bind(move |_, item| {
        let item = item.downcast_ref::<gtk::ListItem>().unwrap();
        let (Some(entry), Some(s)) = (item.child().and_downcast::<gtk::Box>(), weak.upgrade())
        else {
            return;
        };
        let ui = s.borrow();
        let Some(log) = ui.log_entries.get(item.position() as usize) else {
            return;
        };
        let meta = entry.first_child().and_downcast::<gtk::Box>().unwrap();
        let time = meta.first_child().and_downcast::<gtk::Label>().unwrap();
        let level = time.next_sibling().and_downcast::<gtk::Label>().unwrap();
        let source = level.next_sibling().and_downcast::<gtk::Label>().unwrap();
        let message = meta.next_sibling().and_downcast::<gtk::Label>().unwrap();
        let kind = log["level"].as_str().unwrap_or("");
        time.set_text(&format_time(log["timestamp"].as_u64().unwrap_or(0)));
        level.set_text(level_label(kind));
        level.set_css_classes(&["log-level", &format!("level-{kind}")]);
        source.set_text(log["source"].as_str().unwrap_or("应用"));
        message.set_text(&log["message"].as_str().unwrap_or("").replace('\n', " "));
    });
    let list = gtk::ListView::new(Some(selection), Some(factory));
    list.add_css_class("log-list");
    list.set_single_click_activate(true);
    let s = state.clone();
    list.connect_activate(move |_, index| {
        let entry = s.borrow().log_entries.get(index as usize).cloned();
        if let Some(entry) = entry {
            log_detail(&s, &entry);
        }
    });
    let pane = gtk::Overlay::new();
    pane.set_vexpand(true);
    pane.set_child(Some(
        &gtk::ScrolledWindow::builder()
            .vexpand(true)
            .hscrollbar_policy(gtk::PolicyType::Never)
            .child(&list)
            .build(),
    ));
    let empty = gtk::Label::new(Some("正在读取日志…"));
    empty.add_css_class("logs-empty");
    empty.set_valign(gtk::Align::Center);
    empty.set_halign(gtk::Align::Center);
    empty.set_justify(gtk::Justification::Center);
    pane.add_overlay(&empty);
    panel.append(&pane);
    let footer = row(&panel, 12);
    footer.add_css_class("logs-footer");
    let s = state.clone();
    button(&footer, "上一页", move || {
        let mut ui = s.borrow_mut();
        if let Some(cursor) = ui.cursors.pop() {
            ui.query.cursor = cursor;
            let q = ui.query.clone();
            drop(ui);
            send(&s, Command::Logs(q));
        }
    });
    let s = state.clone();
    button(&footer, "下一页", move || {
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
    spacer(&footer);
    let scope = dropdown(&["全部保留日志", "当前筛选结果"], "导出范围", 0, true);
    scope.set_tooltip_text(Some("导出范围"));
    footer.append(&scope);
    let format = dropdown(&["可读文本 LOG", "结构化 JSON"], "格式", 0, true);
    format.set_tooltip_text(Some("格式"));
    footer.append(&format);
    let s = state.clone();
    let export = button(&footer, "导出日志", move || {
        let query = if scope.selected() == 1 {
            let mut q = s.borrow().query.clone();
            q.cursor = None;
            q
        } else {
            LogQuery::default()
        };
        send(
            &s,
            Command::ExportLogs {
                query,
                format: (if format.selected() == 1 {
                    "json"
                } else {
                    "text"
                })
                .into(),
            },
        );
    });
    export.set_valign(gtk::Align::Center);
    let s = state.clone();
    let clear_button = button(&footer, "清除日志", move || {
        let (d, b) = dialog(&s, "清除日志");
        label(&b, "清空全部保留日志？此操作无法撤销。");
        let actions = row(&b, 8);
        let s = s.clone();
        let dialog = d.clone();
        let confirm = button(&actions, "确认清空", move || {
            send(&s, Command::ClearLogs);
            dialog.close();
        });
        confirm.add_css_class("danger");
        let dialog = d.clone();
        button(&actions, "取消", move || dialog.close());
        d.present();
    });
    clear_button.set_valign(gtk::Align::Center);
    {
        let mut ui = state.borrow_mut();
        ui.log_count = count;
        ui.log_empty = empty;
    }
    log_status(state, None);
    send(state, Command::Logs(state.borrow().query.clone()));
}
fn log_status(state: &Rc<RefCell<Ui>>, total: Option<u64>) {
    let ui = state.borrow();
    let loaded = ui.log_entries.len() as u64;
    if let Some(total) = total {
        ui.log_count
            .set_text(&format!("共 {} 条，已加载 {loaded} 条", total.max(loaded)));
    }
    let filtered = !ui.query.keyword.is_empty()
        || !ui.query.source.is_empty()
        || ui.query.start_time.is_some()
        || !(ui.query.level.is_empty() || ui.query.level == "all");
    ui.log_empty.set_visible(loaded == 0);
    if total.is_some() {
        ui.log_empty.set_text(if filtered {
            "没有匹配的日志"
        } else {
            "暂无日志记录\n记录会在连接、认证或设置变更后显示"
        });
    }
}
fn log_detail(state: &Rc<RefCell<Ui>>, entry: &Value) {
    let (d, b) = dialog(state, "日志详情");
    let kind = entry["level"].as_str().unwrap_or("");
    let level = text(
        &b,
        level_label(kind),
        &["log-level", &format!("level-{kind}")],
    );
    level.set_halign(gtk::Align::Start);
    text(
        &b,
        &format_time(entry["timestamp"].as_u64().unwrap_or(0)),
        &["secondary", "mono"],
    );
    text(
        &b,
        entry["source"].as_str().unwrap_or("应用"),
        &["secondary"],
    );
    let detail = format!(
        "{}{}",
        entry["message"].as_str().unwrap_or(""),
        if entry["data"].is_null() {
            String::new()
        } else {
            format!(
                "\n\n{}",
                serde_json::to_string_pretty(&entry["data"]).unwrap_or_default()
            )
        }
    );
    let view = gtk::TextView::new();
    view.set_editable(false);
    view.set_wrap_mode(gtk::WrapMode::WordChar);
    view.add_css_class("log-detail");
    view.buffer().set_text(&detail);
    b.append(&view);
    let actions = row(&b, 8);
    let window = d.clone();
    button(&actions, "复制详情", move || {
        window.clipboard().set_text(&detail);
    });
    d.present();
}
fn apply_state(state: &Rc<RefCell<Ui>>, v: Value) {
    if v["phase"] == "exiting" {
        state.borrow().window.close();
        return;
    }
    let query = {
        let mut s = state.borrow_mut();
        let refresh = s.page == "日志"
            && s.query.cursor.is_none()
            && v["logRevision"] != s.network["logRevision"];
        s.network = v;
        refresh.then(|| s.query.clone())
    };
    refresh_home(state);
    if let Some(query) = query {
        send(state, Command::Logs(query));
    }
}
/// Replies carry no command on failure, so pending flags are reset here and the config is re-read.
fn on_error(state: &Rc<RefCell<Ui>>, error: &str) {
    let (saving, scanning, checking) = {
        let mut ui = state.borrow_mut();
        ui.feedback.set_text(error);
        let flags = (ui.saving, ui.scanning, ui.update["checking"] == true);
        ui.saving = false;
        ui.scanning = false;
        ui.clear_on_save.clear();
        if flags.2 {
            ui.update["checking"] = json!(false);
            ui.update["error"] = json!(error);
        }
        flags
    };
    if saving {
        send(state, Command::Config);
    }
    if scanning && let Some(b) = state.borrow().scan_button.as_ref() {
        b.set_label("扫描附近 WiFi");
        b.set_sensitive(true);
    }
    if checking && state.borrow().page == "关于" {
        update_view(state);
    }
}
fn on_reply(state: &Rc<RefCell<Ui>>, command: Command, value: Value) {
    match command {
        Command::UiReady { .. } => {}
        Command::Snapshot => apply_state(state, value),
        Command::Config | Command::SaveConfig(_) => {
            let page = {
                let mut ui = state.borrow_mut();
                ui.config = value;
                if matches!(command, Command::SaveConfig(_)) {
                    ui.saving = false;
                    let prefixes: Vec<String> = ui.clear_on_save.drain(..).collect();
                    ui.drafts
                        .retain(|key, _| !prefixes.iter().any(|p| key.starts_with(p.as_str())));
                    ui.feedback.set_text("配置已保存并生效");
                }
                ui.page.clone()
            };
            flush(state);
            if page == "运行状态" && state.borrow().rendered_page == page {
                refresh_home(state);
            } else if page != "日志" {
                render(state);
            }
        }
        Command::Scan => {
            {
                let mut ui = state.borrow_mut();
                ui.scan = value;
                ui.scanning = false;
            }
            if state.borrow().page == "配置设置" {
                render(state);
            }
        }
        Command::Logs(ref query) => {
            let total = {
                let mut s = state.borrow_mut();
                let generation = value["generation"].as_u64().unwrap_or(0);
                if s.page != "日志" || s.query != *query || generation < s.log_generation {
                    return;
                }
                s.log_generation = generation;
                s.log_entries = value["entries"].as_array().cloned().unwrap_or_default();
                s.next = if value["hasMore"] == true {
                    value["nextCursor"].as_str().map(str::to_owned)
                } else {
                    None
                };
                let rows: Vec<String> = s.log_entries.iter().map(|e| e["id"].to_string()).collect();
                (
                    s.log_model.clone(),
                    rows,
                    value["total"].as_u64().unwrap_or(0),
                )
            };
            // The list binds rows from `log_entries`, so the model changes only after the borrow ends.
            let (model, rows, total) = total;
            let rows: Vec<&str> = rows.iter().map(String::as_str).collect();
            model.splice(0, model.n_items(), &rows);
            log_status(state, Some(total));
        }
        Command::ClearLogs => {
            let model = {
                let mut s = state.borrow_mut();
                s.log_generation = value.as_u64().unwrap_or(s.log_generation + 1);
                s.log_entries.clear();
                s.log_model.clone()
            };
            model.splice(0, model.n_items(), &[]);
            reload_logs(state);
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
        Command::UpdateCheck => {
            let latest = value.is_null();
            state.borrow_mut().update =
                json!({"release": value, "latest": latest, "checking": false});
        }
        Command::UpdateDownload | Command::UpdateStatus => {
            let mut ui = state.borrow_mut();
            if let Some(fields) = value.as_object() {
                for (key, field) in fields {
                    ui.update[key] = field.clone();
                }
            }
        }
        Command::UpdateCancel => {
            state.borrow_mut().update["state"] = json!("idle");
            state.borrow().feedback.set_text("已取消下载");
        }
        Command::UpdateInstall => state.borrow().feedback.set_text("正在安装更新…"),
        _ => state.borrow().feedback.set_text(&if value == true {
            "操作已提交".into()
        } else {
            value.to_string()
        }),
    }
    if matches!(
        command,
        Command::UpdateCheck
            | Command::UpdateDownload
            | Command::UpdateStatus
            | Command::UpdateCancel
    ) && state.borrow().page == "关于"
    {
        update_view(state);
        poll_update(state);
    }
}
