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
    /// A status poll is scheduled; at most one runs at a time.
    update_poll: bool,
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
        let sidebar = gtk::Box::new(gtk::Orientation::Vertical, 0);
        sidebar.add_css_class("rail");
        sidebar.set_width_request(200);
        // Brand: a small card with its chip, the same object as the home page's account card.
        let brand = gtk::Box::new(gtk::Orientation::Horizontal, 12);
        brand.add_css_class("brand");
        let brand_card = gtk::Box::new(gtk::Orientation::Vertical, 0);
        brand_card.add_css_class("brand-card");
        brand_card.set_size_request(30, 21);
        brand_card.set_valign(gtk::Align::Center);
        let brand_chip = gtk::Box::new(gtk::Orientation::Vertical, 0);
        brand_chip.add_css_class("brand-chip");
        brand_chip.set_size_request(9, 7);
        brand_chip.set_halign(gtk::Align::Start);
        brand_chip.set_valign(gtk::Align::Start);
        brand_card.append(&brand_chip);
        brand.append(&brand_card);
        let brand_text = gtk::Box::new(gtk::Orientation::Vertical, 0);
        brand_text.set_valign(gtk::Align::Center);
        text(&brand_text, "NetMate", &["brand-name"]);
        text(&brand_text, "天津科技大学校园网", &["brand-sub"]);
        brand.append(&brand_text);
        sidebar.append(&brand);
        let navs = gtk::Box::new(gtk::Orientation::Vertical, 4);
        navs.add_css_class("navs");
        sidebar.append(&navs);
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
            home: gtk::Box::new(gtk::Orientation::Vertical, 0),
            home_signature: String::new(),
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
            update_poll: false,
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
            let row = gtk::Box::new(gtk::Orientation::Horizontal, 12);
            let image = gtk::Image::from_icon_name(icon);
            image.set_pixel_size(18);
            row.append(&image);
            row.append(&gtk::Label::new(Some(title)));
            item.set_child(Some(&row));
            item.update_property(&[gtk::accessible::Property::Label(title)]);
            let ui = state.clone();
            item.connect_clicked(move |_| {
                ui.borrow_mut().page = page.into();
                render(&ui);
            });
            navs.append(&item);
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
            theme: Tween::at(if dark { 1.0 } else { 0.0 }),
            knob: Tween::at(knob_x(dark, false)),
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
        theme_accessibility(&appearance, dark);
        let weak = Rc::downgrade(&state);
        let area = drawing.downgrade();
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
            crate::theme::save_later(dark, client::report);
        });
        let foot = gtk::Box::new(gtk::Orientation::Vertical, 8);
        foot.add_css_class("rail-foot");
        foot.append(&appearance);
        let caption = gtk::Label::new(Some("白天 / 黑夜"));
        caption.add_css_class("rail-caption");
        caption.set_halign(gtk::Align::Center);
        foot.append(&caption);
        sidebar.append(&foot);
        glib::spawn_future_local({
            let state = state.clone();
            async move {
                while let Ok(event) = rx.recv().await {
                    match event {
                        Event::State(v) => apply_state(&state, v),
                        Event::Error(command, e) => on_error(&state, command, &e),
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
        // Reports the first painted frame with a config once; the handler then goes away.
        let painting = Rc::new(RefCell::new(
            None::<(gtk::gdk::FrameClock, glib::SignalHandlerId)>,
        ));
        window.connect_map(move |window| {
            if ready.get() {
                return;
            }
            // A remapped surface may get a new clock; move the handler onto it.
            if let Some((old, id)) = painting.borrow_mut().take() {
                old.disconnect(id);
            }
            if let Some(clock) = window.frame_clock() {
                let ready = ready.clone();
                let weak = weak.clone();
                let slot = painting.clone();
                let id = clock.connect_after_paint(move |_| {
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
                        let slot = slot.clone();
                        glib::idle_add_local_once(move || {
                            if let Some((clock, id)) = slot.borrow_mut().take() {
                                clock.disconnect(id);
                            }
                        });
                    }
                });
                *painting.borrow_mut() = Some((clock, id));
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
/// Size of the day/night toggle's drawing area: the pen's 5.625em × 2.5em switch at 16px per em
/// (90×40), plus 3px on each side for its outer highlight.
const TOGGLE_BOX: (i32, i32) = (96, 46);
const TOGGLE_EM: f64 = 16.0;
const TOGGLE_W: f64 = 5.625;
const TOGGLE_H: f64 = 2.5;
const SUN_D: f64 = 2.125;
const SUN_OFFSET: f64 = (TOGGLE_H - SUN_D) / 2.0;
/// While hovered the sun leans 0.187em towards the middle.
const SUN_LEAN: f64 = 0.187;
/// Every transition in the pen is `0.3s ease`.
const SWITCH_US: f64 = 300_000.0;
/// A CSS transition: retargeting starts a fresh 0.3 s run from the current value, as a browser
/// does when a transition is interrupted.
#[derive(Default)]
struct Tween {
    from: f64,
    to: f64,
    value: f64,
    started: Option<i64>,
}
impl Tween {
    fn at(value: f64) -> Self {
        Self {
            from: value,
            to: value,
            value,
            started: None,
        }
    }
    fn set(&mut self, to: f64) {
        if self.to != to {
            self.from = self.value;
            self.to = to;
            self.started = None;
        }
    }
    fn snap(&mut self) {
        self.value = self.to;
        self.from = self.to;
        self.started = None;
    }
    fn moving(&self) -> bool {
        self.value != self.to
    }
    fn step(&mut self, now: i64) {
        if !self.moving() {
            return;
        }
        let start = *self.started.get_or_insert(now);
        let k = ((now - start) as f64 / SWITCH_US).clamp(0.0, 1.0);
        self.value = self.from + (self.to - self.from) * ease(k);
        if k >= 1.0 {
            self.snap();
        }
    }
}
/// Frame state of the toggle. The tick callback only runs while a transition is in progress.
#[derive(Default)]
struct Toggle {
    night: bool,
    hover: bool,
    /// Day 0 .. night 1: background colour, clouds, stars and the moon mask.
    theme: Tween,
    /// The sun's left edge in em, hover lean included.
    knob: Tween,
    ticking: bool,
}
fn knob_x(night: bool, hover: bool) -> f64 {
    let lean = if hover { SUN_LEAN } else { 0.0 };
    if night {
        TOGGLE_W - SUN_D - SUN_OFFSET - lean
    } else {
        SUN_OFFSET + lean
    }
}
fn animations_enabled() -> bool {
    gtk::Settings::default().is_none_or(|s| s.is_gtk_enable_animations())
}
/// Starts the frame clock for a switch or hover change; it stops itself once nothing moves.
fn animate_toggle(anim: &Rc<RefCell<Toggle>>, area: &gtk::DrawingArea) {
    {
        let mut t = anim.borrow_mut();
        let (night, hover) = (t.night, t.hover);
        t.theme.set(if night { 1.0 } else { 0.0 });
        t.knob.set(knob_x(night, hover));
        if !animations_enabled() {
            t.theme.snap();
            t.knob.snap();
            drop(t);
            area.queue_draw();
            return;
        }
        if t.ticking {
            return;
        }
        t.ticking = true;
    }
    let anim = anim.clone();
    area.add_tick_callback(move |area, clock| {
        let now = clock.frame_time();
        let mut t = anim.borrow_mut();
        t.theme.step(now);
        t.knob.step(now);
        area.queue_draw();
        if t.theme.moving() || t.knob.moving() {
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
type Rect = (f64, f64, f64, f64);
/// CSS `box-shadow` on a pill (a circle when square). `shape` is the shadow's own box, already
/// offset and spread; the blur fades its edge over ±`blur`. An inset shadow fills outside `shape`.
fn soft_shadow(
    cr: &cairo::Context,
    (x, y, w, h): Rect,
    blur: f64,
    color: (f64, f64, f64),
    alpha: f64,
    inset: bool,
) {
    const LAYERS: usize = 6;
    let each = 1.0 - (1.0 - alpha).powf(1.0 / LAYERS as f64);
    let _ = cr.save();
    cr.set_fill_rule(cairo::FillRule::EvenOdd);
    cr.set_source_rgba(color.0, color.1, color.2, each);
    for i in 0..LAYERS {
        let e = blur * ((i as f64 + 0.5) / LAYERS as f64 * 2.0 - 1.0);
        if inset {
            cr.rectangle(x - 10.0, y - 10.0, w + 20.0, h + 20.0);
        }
        pill(cr, x - e, y - e, w + 2.0 * e, h + 2.0 * e);
        let _ = cr.fill();
    }
    let _ = cr.restore();
}
/// `box-shadow: inset ox oy blur color` on the pill `b`.
fn inset_shadow(
    cr: &cairo::Context,
    b: Rect,
    (ox, oy): (f64, f64),
    blur: f64,
    color: (f64, f64, f64),
    alpha: f64,
) {
    let _ = cr.save();
    pill(cr, b.0, b.1, b.2, b.3);
    cr.clip();
    soft_shadow(cr, (b.0 + ox, b.1 + oy, b.2, b.3), blur, color, alpha, true);
    let _ = cr.restore();
}
/// The pen's cloud: a 1.25em circle plus its box-shadow copies, (x, y, spread) in em from the
/// circle's centre. Back puffs are listed after the front ones in CSS, so they paint beneath.
const CLOUD_FRONT: [(f64, f64, f64); 8] = [
    (0.0, 0.0, 0.0),
    (0.937, 0.312, 0.0),
    (1.437, 0.375, 0.0),
    (2.187, 0.0, 0.0),
    (2.937, 0.312, 0.0),
    (3.625, -0.062, 0.0),
    (4.5, -0.312, 0.0),
    (4.625, -1.75, 0.437),
];
const CLOUD_BACK: [(f64, f64, f64); 8] = [
    (-0.312, -0.312, 0.0),
    (0.5, -0.125, 0.0),
    (1.25, -0.062, 0.0),
    (2.0, -0.312, 0.0),
    (2.625, 0.0, 0.0),
    (3.375, -0.437, 0.0),
    (4.0, -0.625, 0.0),
    (4.125, -2.125, 0.437),
];
/// Centres of the seven sparkles in the pen's star SVG (viewBox 144×55).
const SPARKLES: [(f64, f64); 7] = [
    (136.996, 4.3545),
    (34.9956, 23.3545),
    (3.9956, 36.3545),
    (57.9956, 25.3545),
    (84.9956, 25.3545),
    (139.996, 36.3545),
    (102.996, 50.3545),
];
/// One sparkle as cubic segments around its centre, starting from the left tip (-3.9956, 0).
const SPARKLE: [[f64; 6]; 9] = [
    [-2.8842, -0.055, -1.9405, -0.5042, -1.1643, -1.3476],
    [-0.3881, -2.191, 0.0, -3.1903, 0.0, -4.3545],
    [0.0, -3.1903, 0.3881, -2.191, 1.1643, -1.3476],
    [1.9405, -0.5042, 2.8842, -0.0642, 4.0044, 0.0],
    [3.2723, 0.0366, 2.602, 0.2475, 1.9846, 0.6508],
    [1.376, 1.045, 0.8908, 1.5767, 0.5292, 2.2368],
    [0.1764, 2.8968, 0.0, 3.6027, 0.0, 4.3728],
    [0.0, 3.2085, -0.3881, 2.2001, -1.1643, 1.3567],
    [-1.9405, 0.5042, -2.8842, 0.055, -3.9956, 0.0],
];
/// Moon craters: (left, top, size) in em inside the moon mask.
const CRATERS: [(f64, f64, f64); 3] = [(0.3, 0.75, 0.75), (1.375, 0.9, 0.375), (0.8, 0.3, 0.25)];
/// Day/night switch ported from CodePen linxiang-webcraft/pvbvLBN ("Animated Day/Night Theme
/// Toggle", kept as `design/toggle-pen.html`), drawn in its em units: the sun knob slides right
/// while a moon mask slides over it, the clouds sink away and the stars drop in.
fn draw_toggle(cr: &cairo::Context, width: i32, height: i32, t: &Toggle) {
    let _ = cr.save();
    cr.translate(
        (width as f64 - TOGGLE_W * TOGGLE_EM) / 2.0,
        (height as f64 - TOGGLE_H * TOGGLE_EM) / 2.0,
    );
    cr.scale(TOGGLE_EM, TOGGLE_EM);
    let k = t.theme.value.clamp(0.0, 1.0);
    let frame = (0.0, 0.0, TOGGLE_W, TOGGLE_H);
    let black = (0.0, 0.0, 0.0);
    // Outer highlight: 0.06em 0.06em 0.125em rgba(255, 255, 255, 0.94).
    soft_shadow(
        cr,
        (0.06, 0.06, TOGGLE_W, TOGGLE_H),
        0.125,
        (1.0, 1.0, 1.0),
        0.94,
        false,
    );
    let _ = cr.save();
    pill(cr, frame.0, frame.1, frame.2, frame.3);
    cr.clip();
    let bg = mix(0x3d7eae, 0x1d1f2c, k);
    cr.set_source_rgb(bg.0, bg.1, bg.2);
    let _ = cr.paint();
    // Clouds hang from (0.3em, 2em) and sink 3em at night.
    let (cx, cy) = (0.3 + 0.625, 2.0 + 0.625 + 3.0 * k);
    for (puffs, color) in [(CLOUD_BACK, 0xaacadf), (CLOUD_FRONT, 0xf3fdff)] {
        let c = rgb(color);
        cr.set_source_rgb(c.0, c.1, c.2);
        for (dx, dy, spread) in puffs {
            disc(cr, cx + dx, cy + dy, 0.625 + spread);
        }
        let _ = cr.fill();
    }
    // Stars: 2.75em wide at 0.3em; 2em above the frame by day, 0.5em down at night.
    let _ = cr.save();
    cr.translate(0.3, -2.0 + 2.5 * k);
    cr.scale(2.75 / 144.0, 2.75 / 144.0);
    for (x, y) in SPARKLES {
        cr.move_to(x - 3.9956, y);
        for [a, b, c, d, e, f] in SPARKLE {
            cr.curve_to(x + a, y + b, x + c, y + d, x + e, y + f);
        }
        cr.close_path();
    }
    cr.set_source_rgb(1.0, 1.0, 1.0);
    let _ = cr.fill();
    let _ = cr.restore();
    // Sun: box-shadows paint last-listed first, so the halo rings go under the drop shadows.
    let sun = (t.knob.value, SUN_OFFSET, SUN_D, SUN_D);
    let r = SUN_D / 2.0;
    let (sx, sy) = (sun.0 + r, sun.1 + r);
    for spread in [1.875, 1.25, 0.625] {
        cr.set_source_rgba(1.0, 1.0, 1.0, 0.1);
        disc(cr, sx, sy, r + spread);
        let _ = cr.fill();
    }
    soft_shadow(
        cr,
        (sun.0, sun.1 + 0.05, SUN_D, SUN_D),
        0.125,
        black,
        0.25,
        false,
    );
    soft_shadow(
        cr,
        (sun.0 + 0.05, sun.1 + 0.125, SUN_D, SUN_D),
        0.125,
        black,
        0.25,
        false,
    );
    let gold = rgb(0xecca2f);
    cr.set_source_rgb(gold.0, gold.1, gold.2);
    disc(cr, sx, sy, r);
    let _ = cr.fill();
    inset_shadow(cr, sun, (0.0, -0.05), 0.05, rgb(0xa1872a), 1.0);
    inset_shadow(cr, sun, (0.05, 0.05), 0.05, rgb(0xfeffef), 0.61);
    // Moon mask: slides in from the right, clipped to the sun's circle.
    let _ = cr.save();
    disc(cr, sx, sy, r);
    cr.clip();
    let moon = (sun.0 + SUN_D * (1.0 - k), sun.1, SUN_D, SUN_D);
    let grey = rgb(0xc4c9d1);
    cr.set_source_rgb(grey.0, grey.1, grey.2);
    disc(cr, moon.0 + r, moon.1 + r, r);
    let _ = cr.fill();
    inset_shadow(cr, moon, (0.0, -0.062), 0.062, rgb(0x969696), 1.0);
    inset_shadow(cr, moon, (0.062, 0.062), 0.062, rgb(0xfeffef), 0.61);
    let pit = rgb(0x959db1);
    for (left, top, size) in CRATERS {
        let crater = (moon.0 + left, moon.1 + top, size, size);
        cr.set_source_rgb(pit.0, pit.1, pit.2);
        disc(cr, crater.0 + size / 2.0, crater.1 + size / 2.0, size / 2.0);
        let _ = cr.fill();
        inset_shadow(cr, crater, (0.0, 0.03), 0.06, black, 0.25);
    }
    let _ = cr.restore();
    // The container's ::after: inset 0 0.05em 0.187em rgba(0, 0, 0, 0.5).
    inset_shadow(cr, frame, (0.0, 0.05), 0.187, black, 0.5);
    let _ = cr.restore();
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
/// A plain section: an optional heading over an ink rule, then its rows. No card container.
fn card(parent: &gtk::Box, title: &str) -> gtk::Box {
    let card = gtk::Box::new(gtk::Orientation::Vertical, 0);
    card.add_css_class("sec");
    if !title.is_empty() {
        let heading = gtk::Label::new(Some(title));
        heading.set_xalign(0.0);
        heading.add_css_class("sec-title");
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
        let edits: Vec<Edit> = std::mem::take(&mut ui.edits);
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
        let mut notes = vec![("连接到 WiFi 后才能使用网络认证功能".to_string(), "")];
        if heartbeat_on {
            notes.push(("心跳检测已暂停".into(), "bad"));
        }
        Face {
            tone: "bad",
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
            tone: "idle",
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
            notes: vec![("点击左侧菜单的\"配置设置\"添加 WiFi 配置".into(), "")],
            action: None,
        }
    } else if !rule
        .as_ref()
        .map(|w| w.requires_auth)
        .unwrap_or(snapshot["requiresAuth"] == true)
    {
        Face {
            tone: if online { "ok" } else { "warn" },
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
                ("此 WiFi 已配置为「无需认证」".into(), "gold"),
                ("如家庭 WiFi、手机热点等网络".into(), ""),
            ],
            action: None,
        }
    } else if accounts.is_empty() {
        let s = state.clone();
        Face {
            tone: "idle",
            void: true,
            backs: 0,
            issuer: "TUST · 校园网认证",
            place: ssid.clone(),
            status: "未配置账户".into(),
            headline: "还差一个账号".into(),
            body: "该 WiFi 需要校园网认证，但尚未关联账户。请前往\"配置设置\"添加账户并关联到此 WiFi。"
                .into(),
            meta: vec![("WiFi 规则", "需要认证".into()), ("关联账户", "无".into())],
            notes: vec![("点击左侧菜单的\"配置设置\"添加账户并关联".into(), "")],
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
        let isp = accounts[0]["isp"].as_str().unwrap_or("");
        Face {
            tone: if authenticated && online {
                "ok"
            } else {
                "warn"
            },
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
                    "gold",
                ),
                ("如校园网 CMCC/CUCC/CTCC".into(), ""),
            ],
            action: Some(action),
        }
    };
    account_card(state, &home, view, number.as_deref(), &snapshot, &config);
    if wifi {
        metric_strip(state, &home, &snapshot, &config);
    }
    let cols = gtk::Box::new(gtk::Orientation::Horizontal, 32);
    cols.set_homogeneous(true);
    cols.add_css_class("home-cols");
    let left = column(&cols, 24, &[]);
    recovery_failures(&left, &snapshot);
    if wifi {
        wifi_details(state, &left, &snapshot, &config);
    } else if heartbeat_on {
        heartbeat_paused(&left);
    }
    if left.first_child().is_none() {
        cols.remove(&left);
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
    let banner = row(parent, 12);
    banner.add_css_class("banner");
    let message = text(&banner, "自动认证已暂停", &["banner-text"]);
    message.set_hexpand(true);
    message.set_valign(gtk::Align::Center);
    let s = state.clone();
    button(&banner, "恢复自动认证", move || {
        mutate(&s, |c| c["settings"]["autoAuthPaused"] = json!(false))
    });
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
/// Note text plus an extra style class (`gold`, `bad` or none).
type CardNote = (String, &'static str);
/// Copy for the home account card and the column beside it; the recovery phase, when active,
/// replaces the status, copy, meta and actions in `account_card`.
struct Face {
    /// Lamp colour class: `ok`, `warn`, `bad` or `idle`.
    tone: &'static str,
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
    /// Note text and an extra style class (`gold`, `bad` or none).
    notes: Vec<CardNote>,
    action: Option<Box<dyn Fn(&gtk::Box)>>,
}
/// Pins an overlay child at `(x, y)` with a fixed size, so the deck needs no CSS transforms.
fn place(widget: &impl IsA<gtk::Widget>, x: i32, y: i32, width: i32, height: i32) {
    widget.set_halign(gtk::Align::Start);
    widget.set_valign(gtk::Align::Start);
    widget.set_margin_start(x);
    widget.set_margin_top(y);
    widget.set_size_request(width, height);
}
/// The top of the home page: the account card deck on the left, headline, copy, notes and
/// actions beside it. The magnetic stripe at the card's foot is the retry progress.
fn account_card(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    mut view: Face,
    number: Option<&str>,
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
    let hero = row(parent, 40);
    hero.add_css_class("hero");
    let deck = gtk::Overlay::new();
    deck.add_css_class("deck");
    deck.set_valign(gtk::Align::Center);
    let frame = gtk::Box::new(gtk::Orientation::Vertical, 0);
    frame.set_size_request(456, 298);
    deck.set_child(Some(&frame));
    hero.append(&deck);
    let side = column(&hero, 12, &["side"]);
    side.set_hexpand(true);
    side.set_valign(gtk::Align::Center);
    // Notes wrap onto new lines in the narrow column beside the card.
    let notes = gtk::FlowBox::new();
    notes.add_css_class("notes");
    notes.set_selection_mode(gtk::SelectionMode::None);
    notes.set_column_spacing(6);
    notes.set_row_spacing(6);
    notes.set_max_children_per_line(4);
    notes.set_halign(gtk::Align::Start);
    let actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
    actions.add_css_class("acts");
    let mut progress = None;
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
        view.tone = if failed { "bad" } else { "warn" };
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
            progress = Some((attempt as f64 / max as f64).clamp(0.0, 1.0));
        }
        view.notes.clear();
        let countdown = gtk::Label::new(None);
        countdown.add_css_class("note");
        countdown.set_visible(false);
        countdown.set_halign(gtk::Align::Start);
        notes.insert(&countdown, -1);
        state.borrow_mut().countdowns.push((countdown, false));
        if failed {
            let s = state.clone();
            button(&actions, "立即重试", move || {
                send(&s, Command::Retry);
            })
            .add_css_class("primary");
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
    } else if let Some(action) = view.action.as_ref() {
        action(&actions);
    }
    let backs = if view.void { 0 } else { view.backs };
    for (class, x, y, w, h) in [("back-2", 45, 11, 409, 257), ("back-1", 24, 16, 424, 266)]
        .into_iter()
        .skip(2 - backs)
    {
        let back = gtk::Box::new(gtk::Orientation::Vertical, 0);
        back.set_css_classes(&["card-back", class]);
        place(&back, x, y, w, h);
        deck.add_overlay(&back);
    }
    let face = gtk::Overlay::new();
    face.add_css_class("id-card");
    if view.void {
        face.add_css_class("void");
    }
    face.set_overflow(gtk::Overflow::Hidden);
    place(&face, 0, 22, 440, 276);
    let body = gtk::Box::new(gtk::Orientation::Vertical, 0);
    body.add_css_class("id-body");
    face.set_child(Some(&body));
    let top = row(&body, 12);
    top.add_css_class("id-top");
    text(&top, view.issuer, &[]).set_wrap(false);
    spacer(&top);
    let place_label = text(&top, &view.place, &[]);
    place_label.set_wrap(false);
    place_label.set_ellipsize(gtk::pango::EllipsizeMode::End);
    chip(&body, "chip", (46, 34));
    let status = row(&body, 13);
    status.add_css_class("id-status");
    let lamp = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    lamp.set_css_classes(&["lamp", view.tone]);
    lamp.set_size_request(12, 12);
    lamp.set_valign(gtk::Align::Center);
    status.append(&lamp);
    let title = text(&status, &view.status, &["id-title"]);
    title.set_wrap(false);
    title.set_ellipsize(gtk::pango::EllipsizeMode::End);
    let gap = gtk::Box::new(gtk::Orientation::Vertical, 0);
    gap.set_vexpand(true);
    body.append(&gap);
    let digits = text(
        &body,
        if view.void {
            "•••• •••• ••"
        } else {
            number.unwrap_or("•••• •••• ••")
        },
        &["id-number"],
    );
    digits.set_wrap(false);
    digits.set_selectable(!view.void && number.is_some());
    let meta = row(&body, 26);
    meta.add_css_class("id-meta");
    for (key, value) in &view.meta {
        let cell = column(&meta, 0, &[]);
        text(&cell, key, &["id-meta-key"]).set_wrap(false);
        let v = text(&cell, value, &["id-meta-value"]);
        v.set_wrap(false);
        v.set_ellipsize(gtk::pango::EllipsizeMode::End);
    }
    if let Some(fraction) = progress {
        let stripe = gtk::ProgressBar::new();
        stripe.add_css_class("stripe");
        stripe.set_fraction(fraction);
        stripe.set_valign(gtk::Align::End);
        stripe.update_property(&[gtk::accessible::Property::Label("尝试进度")]);
        face.add_overlay(&stripe);
    }
    deck.add_overlay(&face);
    text(&side, &view.headline, &["side-title"]);
    if !view.body.is_empty() {
        text(&side, &view.body, &["side-body"]);
    }
    for (note, class) in &view.notes {
        let l = gtk::Label::new(Some(note.as_str()));
        l.add_css_class("note");
        if !class.is_empty() {
            l.add_css_class(class);
        }
        l.set_halign(gtk::Align::Start);
        notes.insert(&l, -1);
    }
    if notes.first_child().is_some() {
        // Notes are text, not choices: keep the flow box's children out of the focus chain.
        let mut child = notes.first_child();
        while let Some(widget) = child {
            widget.set_focusable(false);
            child = widget.next_sibling();
        }
        side.append(&notes);
    }
    if actions.first_child().is_some() {
        side.append(&actions);
    }
}
/// The card's gold chip: a pad outline and a contact line drawn as child boxes, since GTK CSS
/// has no `::before`/`::after`.
fn chip(parent: &gtk::Box, class: &str, size: (i32, i32)) {
    let chip = gtk::Overlay::new();
    chip.add_css_class(class);
    chip.set_halign(gtk::Align::Start);
    chip.set_size_request(size.0, size.1);
    let pad = gtk::Box::new(gtk::Orientation::Vertical, 0);
    pad.add_css_class("chip-pad");
    chip.set_child(Some(&pad));
    let line = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    line.add_css_class("chip-line");
    line.set_valign(gtk::Align::Start);
    chip.add_overlay(&line);
    parent.append(&chip);
}
/// WifiReconnectFailedCard: per-network reasons once every WiFi has failed.
fn recovery_failures(parent: &gtk::Box, snapshot: &Value) {
    let failures = snapshot["failures"].as_array().cloned().unwrap_or_default();
    if failures.is_empty() || !matches!(snapshot["phase"].as_str(), Some("failed" | "cooldown")) {
        return;
    }
    let (c, _) = panel_card(parent, "本轮尝试");
    for failure in failures {
        let item = column(&c, 2, &["fail-row"]);
        text(
            &item,
            failure["ssid"].as_str().unwrap_or(""),
            &["fail-name"],
        );
        text(
            &item,
            failure["reason"].as_str().unwrap_or(""),
            &["secondary", "small"],
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
    // Only the grade word carries the colour; the number stays in ink.
    if let Some((label, class)) = grade {
        let g = gtk::Label::new(Some(label));
        g.set_css_classes(&["metric-grade", class]);
        g.set_valign(gtk::Align::Center);
        cell.append(&g);
    }
}
/// Signal, speed, band, internet and heartbeat under one ink rule; the countdown label is the only
/// widget the one-second tick touches.
fn metric_strip(state: &Rc<RefCell<Ui>>, parent: &gtk::Box, snapshot: &Value, config: &Value) {
    let n = network(snapshot);
    let strip = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    strip.set_homogeneous(true);
    strip.add_css_class("metrics");
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
/// A section: title over an ink rule, a flexible gap and an optional trailing widget; rows
/// below it are split by hairlines instead of sitting in a card.
fn panel_card(parent: &gtk::Box, title: &str) -> (gtk::Box, gtk::Box) {
    let c = gtk::Box::new(gtk::Orientation::Vertical, 0);
    c.add_css_class("sec");
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
    refresh.add_css_class("quiet");
    let unknown = |v: &Option<String>| v.clone().unwrap_or_else(|| "未知".into());
    let channel = n
        .channel
        .map(|c| c.to_string())
        .unwrap_or_else(|| "未知".into());
    for (key, value, mono) in [
        ("WiFi 名称", unknown(&n.ssid), false),
        ("IPv4 地址", unknown(&n.ipv4), true),
        ("IPv6 地址", unknown(&n.ipv6), true),
        ("BSSID", unknown(&n.bssid), true),
        ("WiFi 信道", channel, true),
        ("安全类型", unknown(&n.security), false),
    ] {
        let line = row(&c, 16);
        line.add_css_class("kv");
        let k = text(&line, key, &["kv-key"]);
        k.set_wrap(false);
        k.set_valign(gtk::Align::Center);
        let v = text(&line, &value, &["kv-value"]);
        v.set_xalign(1.0);
        v.set_hexpand(true);
        v.set_valign(gtk::Align::Center);
        v.set_wrap_mode(gtk::pango::WrapMode::Char);
        v.set_justify(gtk::Justification::Right);
        v.set_selectable(true);
        if mono {
            v.add_css_class("mono");
        }
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
        text(&c, &notes.join("\n"), &["secondary", "small", "panel-note"]);
    }
}
/// Left column while no WiFi is connected and heartbeat is enabled.
fn heartbeat_paused(parent: &gtk::Box) {
    let (c, _) = panel_card(parent, "心跳检测 (已暂停)");
    text(
        &c,
        "当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。",
        &["secondary", "small", "panel-text"],
    );
}
/// WifiSwitcherCard: configured networks ordered by priority, in fixed columns so badges and
/// actions line up: priority (44) | name and subtitle | badge (92) | action (70).
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
        let number = text(&item, &format!("{:02}", wifi.priority), &["wifi-rank"]);
        number.set_wrap(false);
        number.set_size_request(44, -1);
        number.set_valign(gtk::Align::Center);
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
        let slot = row(&item, 0);
        slot.set_size_request(92, -1);
        let tag = if wifi.requires_auth {
            badge(&slot, "校园网认证", &["badge-auth", "wifi-tag"])
        } else {
            badge(&slot, "普通热点", &["badge-open", "wifi-tag"])
        };
        tag.set_ellipsize(gtk::pango::EllipsizeMode::End);
        let end = row(&item, 0);
        end.set_size_request(70, -1);
        end.set_halign(gtk::Align::End);
        spacer(&end);
        if is_current {
            let cur = gtk::Box::new(gtk::Orientation::Horizontal, 4);
            cur.add_css_class("wifi-current");
            cur.set_valign(gtk::Align::Center);
            let mark = gtk::Image::from_icon_name("object-select-symbolic");
            mark.set_pixel_size(14);
            cur.append(&mark);
            cur.append(&gtk::Label::new(Some("当前")));
            end.append(&cur);
        } else {
            let s = state.clone();
            let id = wifi.id.clone();
            let b = button(&end, "切换", move || {
                send(&s, Command::Connect { id: id.clone() });
            });
            b.add_css_class("wifi-switch");
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
        ui.scroll = None;
        ui.rendered_page = page.clone();
    }
    match page.as_str() {
        "运行状态" => {
            page_title(&body, "运行状态");
            let (scroll, content) = scrolled(&body);
            let home = named(&content, "网络连接状态", 22);
            let mut ui = state.borrow_mut();
            ui.home = home;
            ui.scroll = Some(scroll);
            drop(ui);
            refresh_home(state);
        }
        "配置设置" => {
            let heading = page_title(&body, "配置设置");
            heading.set_spacing(14);
            text(&heading, "修改后立即保存并生效", &["page-subtitle"])
                .set_valign(gtk::Align::Center);
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
/// A settings row: name with an optional description on the left, a switch on the right.
fn toggle_row(
    state: &Rc<RefCell<Ui>>,
    parent: &gtk::Box,
    title: &str,
    desc: &str,
    checked: bool,
    edit: impl Fn(&mut Value, bool) + Clone + 'static,
) {
    let line = row(parent, 24);
    line.add_css_class("set");
    let copy = column(&line, 2, &[]);
    copy.set_hexpand(true);
    copy.set_valign(gtk::Align::Center);
    text(&copy, title, &["set-label"]);
    if !desc.is_empty() {
        text(&copy, desc, &["set-desc"]);
    }
    let c = gtk::Switch::new();
    c.set_active(checked);
    c.set_valign(gtk::Align::Center);
    c.update_property(&[gtk::accessible::Property::Label(title)]);
    line.append(&c);
    let s = state.clone();
    c.connect_active_notify(move |c| {
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
    let line = row(parent, 24);
    line.add_css_class("set");
    let name = text(&line, title, &["set-label"]);
    name.set_hexpand(true);
    name.set_valign(gtk::Align::Center);
    let n = gtk::SpinButton::with_range(range.0, range.1, 1.0);
    n.set_value(value);
    n.set_valign(gtk::Align::Center);
    n.set_width_chars(4);
    n.update_property(&[gtk::accessible::Property::Label(title)]);
    n.add_css_class("stepper");
    line.append(&n);
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
    pause_banner(state, content, &config);
    accounts(state, content, &config);
    wifis(state, content, &config);
    // Two columns as in the prototype: 通用设置 | 附近 WiFi and 通知设置.
    let cols = row(content, 32);
    cols.set_homogeneous(true);
    let left = column(&cols, 24, &[]);
    let right = column(&cols, 24, &[]);
    let general = card(&left, "通用设置");
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
    let numbers = column(&general, 0, &[]);
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
    nearby(state, &right, &config);
    let notices = card(&right, "通知设置");
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
}
fn nearby(state: &Rc<RefCell<Ui>>, content: &gtk::Box, config: &Value) {
    let (c, actions) = panel_card(content, "附近 WiFi");
    text(
        &c,
        "扫描附近网络，选择后添加配置或编辑已保存的网络。",
        &["secondary", "small", "sec-note"],
    );
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
    b.add_css_class("quiet");
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
            &["secondary", "small", "sec-note"],
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
    let c = named(content, "账号配置", 0);
    c.add_css_class("sec");
    let head = row(&c, 10);
    head.add_css_class("panel-head");
    text(&head, "账号管理", &["panel-title"]);
    spacer(&head);
    text(&head, "按顺序依次认证", &["secondary", "small"]);
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
        let id = account["id"].clone();
        let current = config["currentAccountId"] == id;
        let item = row(&rows, 14);
        item.add_css_class("acct");
        // A small card face: gold chip for the account in use, greyed out for the others.
        let mini = gtk::Box::new(gtk::Orientation::Vertical, 0);
        mini.set_css_classes(&["mini-card", if current { "on" } else { "off" }]);
        mini.set_size_request(58, 38);
        mini.set_valign(gtk::Align::Center);
        let mini_chip = gtk::Box::new(gtk::Orientation::Vertical, 0);
        mini_chip.add_css_class("mini-chip");
        mini_chip.set_size_request(14, 10);
        mini_chip.set_halign(gtk::Align::Start);
        mini_chip.set_valign(gtk::Align::Start);
        mini.append(&mini_chip);
        item.append(&mini);
        let info = column(&item, 2, &[]);
        info.set_hexpand(true);
        info.set_valign(gtk::Align::Center);
        let username = account["username"].as_str().unwrap_or("").to_string();
        text(&info, &username, &["acct-name"]);
        let mut sub = vec![isp_label(account["isp"].as_str().unwrap_or("")).to_string()];
        sub.extend(
            account["serverUrl"]
                .as_str()
                .filter(|u| !u.is_empty())
                .map(str::to_owned),
        );
        text(&info, &sub.join(" · "), &["secondary", "small"]);
        let actions = row(&item, 6);
        actions.set_valign(gtk::Align::Center);
        if current {
            let inuse = text(&actions, "使用中", &["inuse"]);
            inuse.set_wrap(false);
            inuse.set_valign(gtk::Align::Center);
        } else {
            let s = state.clone();
            let use_id = id.clone();
            button(&actions, "使用此账号", move || {
                let id = use_id.clone();
                mutate(&s, move |c| c["currentAccountId"] = id.clone());
            });
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
    // Fields side by side as in the prototype: 用户名 | 密码 | 运营商, then server and the button.
    let fields = row(&c, 10);
    fields.add_css_class("form");
    fields.set_homogeneous(true);
    let user = draft_entry(
        state,
        &fields,
        "account.username",
        "用户名",
        "用户名",
        "请输入学号/用户名",
        false,
    );
    let password = draft_entry(
        state,
        &fields,
        "account.password",
        "密码",
        "密码",
        "请输入密码",
        true,
    );
    let isp = form_group(&fields, "运营商");
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
    let submit = row(&c, 10);
    submit.add_css_class("form");
    let server = draft_entry(
        state,
        &submit,
        "account.server",
        "登录服务器地址",
        "登录服务器地址",
        "",
        false,
    );
    if let Some(group) = server.parent() {
        group.set_hexpand(true);
    }
    let s = state.clone();
    let b = button(&submit, "保存并添加账号", move || {
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
            client::list(c, "accounts").push(account.clone());
            if c["currentAccountId"].is_null() {
                c["currentAccountId"] = json!(id);
            }
        });
    });
    b.set_valign(gtk::Align::End);
    if let Some(error) = state.borrow().drafts.get("account.error") {
        text(&c, error, &["error-text"]);
    }
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
        for w in client::list(c, "wifiRules") {
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
        &["secondary", "small", "sec-note"],
    );
    let accounts = config["accounts"].as_array().cloned().unwrap_or_default();
    let list = config["wifiRules"].as_array().cloned().unwrap_or_default();
    if list.is_empty() {
        empty_box(&c, "network-wireless-symbolic", "暂无 WiFi 配置");
    }
    let rows = column(&c, 0, &["list"]);
    for wifi in list {
        let item = row(&rows, 12);
        item.add_css_class("rule");
        let ssid = wifi["ssid"].as_str().unwrap_or("").to_string();
        let auth = wifi["requiresAuth"] == true;
        let auto = wifi["autoConnect"] == true;
        let priority = wifi["priority"].as_u64().unwrap_or(10);
        let number = text(&item, &format!("{priority:02}"), &["rule-rank"]);
        number.set_wrap(false);
        number.set_size_request(44, -1);
        number.set_valign(gtk::Align::Center);
        number.set_tooltip_text(Some(&format!("优先级 {priority}")));
        let info = column(&item, 2, &[]);
        info.set_hexpand(true);
        info.set_valign(gtk::Align::Center);
        text(&info, &ssid, &["rule-name"]);
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
                text(
                    &info,
                    "未关联账号（账号可能已删除）",
                    &["error-text", "small"],
                );
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
        text(&info, &sub.join(" · "), &["secondary", "small"]);
        if auth {
            badge(&item, "需要认证", &["badge-auth"]);
        } else {
            badge(&item, "无需认证", &["badge-open"]);
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
                    for w in client::list(c, "wifiRules") {
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
        mutate(&s, move |c| client::list(c, "wifiRules").push(rule.clone()));
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
    heading.add_css_class("dialog-title");
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
        let items = client::list(config, field);
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
    // Prototype layout: a version card beside the name, then features | update and project info.
    let hero = row(content, 36);
    hero.add_css_class("about-hero");
    let face = gtk::Box::new(gtk::Orientation::Vertical, 0);
    face.set_css_classes(&["id-card", "id-body", "about-card"]);
    face.set_size_request(320, 200);
    face.set_valign(gtk::Align::Center);
    hero.append(&face);
    let top = row(&face, 12);
    top.add_css_class("id-top");
    text(&top, "NETMATE", &[]).set_wrap(false);
    spacer(&top);
    text(&top, concat!("v", env!("CARGO_PKG_VERSION")), &["mono"]).set_wrap(false);
    chip(&face, "chip", (46, 34));
    text(&face, "NetMate", &["id-title"]).set_wrap(false);
    let gap = gtk::Box::new(gtk::Orientation::Vertical, 0);
    gap.set_vexpand(true);
    face.append(&gap);
    text(&face, "TUST CAMPUS NETWORK", &["id-number", "small-number"]).set_wrap(false);
    let names = column(&hero, 8, &[]);
    names.set_hexpand(true);
    names.set_valign(gtk::Align::Center);
    text(&names, "NetMate", &["about-name"]);
    text(&names, "智能 WiFi 管理工具", &["side-body"]);
    let version = badge(
        &names,
        concat!("版本 ", env!("CARGO_PKG_VERSION")),
        &["version-pill"],
    );
    version.set_halign(gtk::Align::Start);
    let grid = gtk::Grid::new();
    grid.add_css_class("about");
    grid.set_column_spacing(32);
    grid.set_row_spacing(24);
    grid.set_column_homogeneous(true);
    content.append(&grid);
    let features = gtk::Box::new(gtk::Orientation::Vertical, 0);
    features.add_css_class("sec");
    grid.attach(&features, 0, 0, 1, 1);
    text(&features, "核心功能", &["sec-title"]);
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
    let side = gtk::Box::new(gtk::Orientation::Vertical, 24);
    grid.attach(&side, 1, 0, 1, 1);
    let update = card(&side, "更新检查");
    let line = row(&update, 12);
    line.add_css_class("kv");
    let status = text(&line, "", &["secondary"]);
    status.set_selectable(true);
    status.set_hexpand(true);
    status.set_valign(gtk::Align::Center);
    let actions = gtk::Box::new(gtk::Orientation::Horizontal, 8);
    actions.set_valign(gtk::Align::Center);
    line.append(&actions);
    {
        let mut ui = state.borrow_mut();
        ui.update_label = status;
        ui.update_actions = actions;
    }
    update_view(state);
    let links = card(&side, "项目信息");
    let link_row = row(&links, 24);
    link_row.add_css_class("kv");
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
        link_row.append(&link);
    }
    let quit = row(&links, 12);
    quit.add_css_class("kv");
    let copyright = text(
        &quit,
        "© 2026 NetMate. All rights reserved.",
        &["secondary", "small"],
    );
    copyright.set_hexpand(true);
    copyright.set_valign(gtk::Align::Center);
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
    if phase == "downloading" {
        poll_update(state);
    }
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
/// Each status reply re-renders the view, which schedules the next poll.
fn poll_update(state: &Rc<RefCell<Ui>>) {
    if std::mem::replace(&mut state.borrow_mut().update_poll, true) {
        return;
    }
    let weak = Rc::downgrade(state);
    glib::timeout_add_local_once(Duration::from_secs(1), move || {
        if let Some(state) = weak.upgrade() {
            state.borrow_mut().update_poll = false;
            if state.borrow().page == "关于" && state.borrow().update["state"] == "downloading" {
                send(&state, Command::UpdateStatus);
            }
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
    let heading = page_title(body, "运行日志");
    heading.set_spacing(14);
    let subtitle = text(
        &heading,
        "连接、认证与恢复记录，保留最近 7 天",
        &["page-subtitle"],
    );
    subtitle.set_wrap(false);
    subtitle.set_valign(gtk::Align::Center);
    spacer(&heading);
    let s = state.clone();
    let refresh = button(&heading, "刷新", move || reload_logs(&s));
    refresh.set_valign(gtk::Align::Center);
    let panel = gtk::Box::new(gtk::Orientation::Vertical, 0);
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
/// Only the failed command's pending flag is reset; a lost subscription changes no flag.
fn on_error(state: &Rc<RefCell<Ui>>, command: Option<Command>, error: &str) {
    let (saving, scanning, checking) = {
        let mut ui = state.borrow_mut();
        ui.feedback.set_text(error);
        let flags = (
            ui.saving && matches!(command, Some(Command::SaveConfig(_))),
            ui.scanning && matches!(command, Some(Command::Scan)),
            ui.update["checking"] == true && matches!(command, Some(Command::UpdateCheck)),
        );
        if flags.0 {
            ui.saving = false;
            ui.clear_on_save.clear();
        }
        if flags.1 {
            ui.scanning = false;
        }
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
                    let prefixes: Vec<String> = std::mem::take(&mut ui.clear_on_save);
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
    }
}
