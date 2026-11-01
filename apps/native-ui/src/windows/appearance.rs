//! GDI surfaces for the campus-card theme (`design/netmate-card.html`, `netmate.css` and
//! `linux.rs`) without a browser or a GPU renderer. Colors come from the theme tokens;
//! translucent fills are blended over the color behind them.
use super::*;
use std::time::Instant;
use windows::Win32::{Graphics::Dwm::*, System::Registry::*};

/// Theme tokens from `netmate.css` (`.netmate` and `.netmate.dark`).
#[derive(Clone, Copy)]
pub struct Palette {
    pub ground: COLORREF,
    /// Inputs, buttons and the segmented level filter.
    pub field: COLORREF,
    /// Hairlines and outlines.
    pub line: COLORREF,
    /// Body text, also the ink of section rules.
    pub text: COLORREF,
    pub text2: COLORREF,
    pub faint: COLORREF,
    pub gold: COLORREF,
    pub gold_text: COLORREF,
    /// `--gold-soft` over the ground: focus and selection rings.
    pub gold_soft: COLORREF,
    pub ok: COLORREF,
    pub warn: COLORREF,
    pub bad: COLORREF,
    pub rail: COLORREF,
    /// The checked navigation item.
    pub rail2: COLORREF,
    pub rail_text: COLORREF,
    pub rail_text2: COLORREF,
    /// The card face gradient (135°) and the text on it.
    pub face_a: COLORREF,
    pub face_b: COLORREF,
    pub face_text: COLORREF,
    pub face_text2: COLORREF,
    /// Cards stacked behind the face.
    pub deck1: COLORREF,
    pub deck2: COLORREF,
    pub primary: COLORREF,
    pub on_primary: COLORREF,
}
pub const fn rgb(value: u32) -> COLORREF {
    COLORREF(((value & 255) << 16) | (value & 0xff00) | ((value >> 16) & 255))
}
/// Blends `fg` (0xRRGGBB) at `alpha` percent over `bg`, like an rgba() fill in the CSS.
pub fn mix(fg: u32, bg: COLORREF, alpha: u32) -> COLORREF {
    blend(rgb(fg), bg, alpha as f64 / 100.0)
}
/// Blends two COLORREFs: `t` = 1 gives `fg`, 0 gives `bg`.
pub fn blend(fg: COLORREF, bg: COLORREF, t: f64) -> COLORREF {
    let t = t.clamp(0.0, 1.0);
    let channel = |shift: u32| {
        let f = ((fg.0 >> shift) & 255) as f64;
        let b = ((bg.0 >> shift) & 255) as f64;
        ((f * t + b * (1.0 - t)).round() as u32) << shift
    };
    COLORREF(channel(0) | channel(8) | channel(16))
}
impl Palette {
    pub fn new(dark: bool) -> Self {
        if dark {
            let ground = rgb(0x14181c);
            Self {
                ground,
                field: rgb(0x1b2026),
                line: rgb(0x2a3138),
                text: rgb(0xe8e6df),
                text2: rgb(0x9aa1a7),
                faint: rgb(0x3a434c),
                gold: rgb(0xd9b85e),
                gold_text: rgb(0xd9b85e),
                gold_soft: mix(0xd9b85e, ground, 16),
                ok: rgb(0x5cc795),
                warn: rgb(0xe8a94e),
                bad: rgb(0xf07b6e),
                rail: rgb(0x0d1013),
                rail2: rgb(0x1d2329),
                rail_text: rgb(0xe8e6df),
                rail_text2: rgb(0x9aa1a7),
                face_a: rgb(0x323d47),
                face_b: rgb(0x232a32),
                face_text: rgb(0xf1efe8),
                face_text2: rgb(0xa9afb5),
                deck1: rgb(0x262c33),
                deck2: rgb(0x1f252b),
                primary: rgb(0xd9b85e),
                on_primary: rgb(0x1a1606),
            }
        } else {
            let ground = rgb(0xecebe6);
            Self {
                ground,
                field: rgb(0xf6f5f1),
                line: rgb(0xd6d4cd),
                text: rgb(0x1d2329),
                text2: rgb(0x5c636a),
                faint: rgb(0xb5b2aa),
                gold: rgb(0xc9a24a),
                gold_text: rgb(0x87661c),
                gold_soft: mix(0xc9a24a, ground, 18),
                ok: rgb(0x2f7d5b),
                warn: rgb(0x9a5f0c),
                bad: rgb(0xb8372b),
                rail: rgb(0x1d2329),
                rail2: rgb(0x2b333b),
                rail_text: rgb(0xe8e6df),
                rail_text2: rgb(0x9aa1a7),
                face_a: rgb(0x26313b),
                face_b: rgb(0x1a2128),
                face_text: rgb(0xf1efe8),
                face_text2: rgb(0xa9afb5),
                deck1: rgb(0xcfcdc6),
                deck2: rgb(0xdddbd5),
                primary: rgb(0x1d2329),
                on_primary: rgb(0xffffff),
            }
        }
    }
}
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Font {
    #[default]
    Normal,
    Small,
    Tiny,
    Strong,
    /// Buttons and key/value values (weight 500).
    Medium,
    /// `.sec-title` and `.panel-title`.
    Section,
    Title,
    Brand,
    Nav,
    NavOn,
    /// `.side-title`, the headline beside the card.
    Side,
    Notice,
    /// `.id-title`, the status on the card face.
    Face,
    /// `.about-name` and the About card title.
    Name,
    Metric,
    /// `.id-number`, the card number.
    Number,
    /// `.wifi-rank` and `.rule-rank`.
    Rank,
    Mono,
    /// `.acct-name`.
    Code,
    /// `.id-meta-key`.
    Key,
    /// `.id-meta-value`.
    Meta,
}
pub const FONT_COUNT: usize = 21;
/// Size, weight and face (0 Microsoft YaHei UI, 1 Consolas) for each `Font`, in CSS pixels.
pub const FONTS: [(i32, i32, u8); FONT_COUNT] = [
    (14, 400, 0),
    (13, 400, 0),
    (12, 400, 0),
    (14, 600, 0),
    (14, 500, 0),
    (13, 600, 0),
    (22, 700, 0),
    (18, 700, 0),
    (15, 500, 0),
    (15, 600, 0),
    (21, 700, 0),
    (20, 700, 0),
    (34, 700, 0),
    (30, 700, 0),
    (18, 700, 0),
    (19, 400, 1),
    (21, 700, 1),
    (13, 400, 1),
    (14, 600, 1),
    (11, 400, 0),
    (13, 500, 0),
];
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Ink {
    #[default]
    Text,
    Secondary,
    Faint,
    Gold,
    GoldText,
    Ok,
    Warn,
    Bad,
    /// Text on the card face.
    Face,
    FaceSoft,
    /// `--rail-text-2`, the caption under the day/night switch.
    Rail,
    /// Log levels: 0 info, 1 success, 2 warn, 3 error, 4 debug.
    Level(u8),
}
impl Ink {
    pub fn color(self, dark: bool) -> COLORREF {
        let p = Palette::new(dark);
        match self {
            Ink::Text => p.text,
            Ink::Secondary => p.text2,
            Ink::Faint => p.faint,
            Ink::Gold => p.gold,
            Ink::GoldText => p.gold_text,
            Ink::Ok | Ink::Level(1) => p.ok,
            Ink::Warn | Ink::Level(2) => p.warn,
            Ink::Bad | Ink::Level(3) => p.bad,
            Ink::Face => p.face_text,
            Ink::FaceSoft => p.face_text2,
            Ink::Rail => p.rail_text2,
            Ink::Level(_) => p.text2,
        }
    }
}
/// Outline tags (`.badge`, `.note`): no fill, coloured text and border.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Badge {
    Neutral,
    /// `.badge-auth`, `.note.gold` and `.version-pill`.
    Auth,
    /// `.note.bad`.
    Bad,
    Level(u8),
}
/// Text and border colours of a tag.
fn badge_colors(badge: Badge, dark: bool) -> (COLORREF, COLORREF) {
    let p = Palette::new(dark);
    match badge {
        Badge::Neutral => (p.text2, p.line),
        Badge::Auth => (p.gold_text, p.gold),
        Badge::Bad => (p.bad, p.bad),
        Badge::Level(kind) => {
            let ink = Ink::Level(kind).color(dark);
            (ink, ink)
        }
    }
}
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Shape {
    #[default]
    Text,
    /// Keeps a UI Automation name (the accessible group name in linux.rs) without drawing.
    Hidden,
    /// The status lamp on the card face: 0 idle, 1 ok, 2 warn, 3 bad, with its 5px ring.
    Lamp(u8),
    /// 3 check mark, 4 loading ring.
    Glyph(u8, Ink),
    /// An outline icon (same ids as `icon`) centered in the control.
    Icon(u8, Ink),
    /// The rail brand: a small card with a gold chip, "NetMate" and the school name.
    Brand,
    /// The card's gold chip (46×34); `true` is the grey chip of the empty dashed card.
    Chip(bool),
    /// The small card face of an account row; `true` for the account in use.
    Mini(bool),
}
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub struct Look {
    pub font: Font,
    pub ink: Ink,
    pub badge: Option<Badge>,
    /// 0 left, 1 center, 2 right.
    pub align: u8,
    pub single: bool,
    pub shape: Shape,
}
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Btn {
    #[default]
    Normal,
    Nav,
    Toggle,
    Primary,
    Danger,
    /// `button.quiet`: transparent with secondary text.
    Quiet,
    Choice(bool),
    /// A level of the segmented log filter (`.log-filter`).
    Pill(bool),
    /// The "切换" button of a WiFi row; the window text carries the full accessible name.
    Switch,
    /// The refresh icon that toggles a rule's auto reconnect (`.auto-on` / `.auto-off`).
    Auto(bool),
    /// `.icon-btn.quiet` with the refresh icon; the window text is the accessible name.
    Refresh,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Surface {
    /// A 1px hairline.
    Rule,
    /// The 1.5px ink rule under a section title and above the metrics and the log list.
    Ink,
    Field,
    /// `.empty-box`: a dashed outline.
    Dashed,
    /// `.banner`: a gold outline.
    Banner,
    /// `.warning-box`: a warn outline.
    Warning,
    /// The card face (radius 16, 135° gradient); `true` is the empty dashed card.
    Face(bool),
    /// A card behind the face: 1 or 2.
    Back(u8),
    /// The magnetic stripe at the foot of the face; the fill is the retry progress in permille.
    Stripe(u16),
}
pub unsafe fn system_dark() -> bool {
    let mut light = 1u32;
    let mut size = 4u32;
    let _ = RegGetValueW(
        HKEY_CURRENT_USER,
        w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
        w!("AppsUseLightTheme"),
        RRF_RT_REG_DWORD,
        None,
        Some((&mut light as *mut u32).cast()),
        Some(&mut size),
    );
    light == 0
}
/// Minutes to add to local time to get UTC, from the active time zone (no Win32_System_Time).
pub unsafe fn time_bias() -> i64 {
    let mut bias = 0u32;
    let mut size = 4u32;
    let _ = RegGetValueW(
        HKEY_LOCAL_MACHINE,
        w!("SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation"),
        w!("ActiveTimeBias"),
        RRF_RT_REG_DWORD,
        None,
        Some((&mut bias as *mut u32).cast()),
        Some(&mut size),
    );
    bias as i32 as i64
}
/// False when the user turned off "Show animations in Windows" (the reduced-motion setting).
pub unsafe fn animations_enabled() -> bool {
    let mut enabled = windows::core::BOOL(1);
    let ok = SystemParametersInfoW(
        SPI_GETCLIENTAREAANIMATION,
        0,
        Some((&mut enabled as *mut windows::core::BOOL).cast()),
        SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
    );
    ok.is_err() || enabled.as_bool()
}
/// The switch's drawing box: the pen's 5.625em × 2.5em switch at 16px per em (90×40), plus
/// 3px on each side for its outer highlight (`TOGGLE_BOX` in linux.rs).
pub const TOGGLE_BOX: (i32, i32) = (96, 46);
const TOGGLE_EM: f64 = 16.0;
const TOGGLE_W: f64 = 5.625;
const TOGGLE_H: f64 = 2.5;
const SUN_D: f64 = 2.125;
const SUN_OFFSET: f64 = (TOGGLE_H - SUN_D) / 2.0;
/// While hovered the sun leans 0.187em towards the middle.
const SUN_LEAN: f64 = 0.187;
/// Every transition in the pen is `0.3s ease`.
const SWITCH_S: f64 = 0.3;
/// A CSS transition: retargeting starts a fresh 0.3 s run from the current value, as a browser
/// does when a transition is interrupted.
#[derive(Clone, Copy, Default)]
struct Tween {
    from: f64,
    to: f64,
    value: f64,
    started: Option<Instant>,
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
    fn step(&mut self, now: Instant) {
        if !self.moving() {
            return;
        }
        let start = *self.started.get_or_insert(now);
        let k = (now.duration_since(start).as_secs_f64() / SWITCH_S).clamp(0.0, 1.0);
        self.value = self.from + (self.to - self.from) * ease(k);
        if k >= 1.0 {
            self.snap();
        }
    }
}
/// Frame state of the day/night switch (mirrors `Toggle` in linux.rs). The window procedure
/// runs its 16 ms timer only while a transition is in progress.
#[derive(Clone, Copy, Default)]
pub struct Toggle {
    pub night: bool,
    pub hover: bool,
    /// Day 0 .. night 1: background colour, clouds, stars and the moon mask.
    theme: Tween,
    /// The sun's left edge in em, hover lean included.
    knob: Tween,
    pub ticking: bool,
}
fn knob_x(night: bool, hover: bool) -> f64 {
    let lean = if hover { SUN_LEAN } else { 0.0 };
    if night {
        TOGGLE_W - SUN_D - SUN_OFFSET - lean
    } else {
        SUN_OFFSET + lean
    }
}
impl Toggle {
    pub fn new(night: bool) -> Self {
        Toggle {
            night,
            theme: Tween::at(f64::from(u8::from(night))),
            knob: Tween::at(knob_x(night, false)),
            ..Toggle::default()
        }
    }
    /// Points both transitions at the current night and hover state; a reversal continues
    /// from the current frame.
    pub fn retarget(&mut self) {
        self.theme.set(f64::from(u8::from(self.night)));
        self.knob.set(knob_x(self.night, self.hover));
    }
    /// Jumps to the end state (system animations are off).
    pub fn settle(&mut self) {
        self.retarget();
        self.theme.snap();
        self.knob.snap();
        self.ticking = false;
    }
    /// Advances one frame; returns false once nothing moves.
    pub fn step(&mut self, now: Instant) -> bool {
        self.theme.step(now);
        self.knob.step(now);
        self.theme.moving() || self.knob.moving()
    }
}
/// CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)).
fn ease(t: f64) -> f64 {
    bezier(0.25, 0.1, 0.25, 1.0, t)
}
fn bezier(x1: f64, y1: f64, x2: f64, y2: f64, t: f64) -> f64 {
    let curve = |a: f64, b: f64, s: f64| {
        3.0 * a * s * (1.0 - s) * (1.0 - s) + 3.0 * b * s * s * (1.0 - s) + s * s * s
    };
    let t = t.clamp(0.0, 1.0);
    // x(s) is monotonic for these control points, so bisection finds s.
    let (mut low, mut high) = (0.0, 1.0);
    for _ in 0..24 {
        let mid = (low + high) / 2.0;
        if curve(x1, x2, mid) < t {
            low = mid;
        } else {
            high = mid;
        }
    }
    curve(y1, y2, (low + high) / 2.0)
}
pub unsafe fn titlebar(h: HWND, dark: bool) {
    let value = i32::from(dark);
    let _ = DwmSetWindowAttribute(
        h,
        DWMWA_USE_IMMERSIVE_DARK_MODE,
        (&value as *const i32).cast(),
        4,
    );
}
pub unsafe fn font(size: i32, weight: i32, dpi: u32, face: u8) -> HFONT {
    CreateFontW(
        -scale(size, dpi),
        0,
        0,
        0,
        weight,
        0,
        0,
        0,
        DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS,
        CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY,
        0,
        match face {
            1 => w!("Consolas"),
            _ => w!("Microsoft YaHei UI"),
        },
    )
}
pub fn scale(value: i32, dpi: u32) -> i32 {
    (value as i64 * dpi as i64 / 96) as i32
}
pub fn content_scale(width: i32, dpi: u32) -> f64 {
    ((width as f64 * 96.0 / dpi as f64 - 248.0) / 850.0).clamp(0.6, 1.0)
}
const WHITE: COLORREF = rgb(0xffffff);
/// Width of the sidebar rail in 96-DPI units.
pub const RAIL: i32 = 194;
/// The gold chip gradient (`#ecd48c` → `#b88f35` at 135°).
const CHIP: [(f64, u32); 2] = [(0.0, 0xecd48c), (1.0, 0xb88f35)];
/// The chip's pad outline and contact line: rgba(80, 58, 14, 0.38) over the chip.
const CHIP_INK: u32 = 0x503a0e;
unsafe fn fill(dc: HDC, r: RECT, color: COLORREF) {
    let brush = CreateSolidBrush(color);
    FillRect(dc, &r, brush);
    let _ = DeleteObject(brush.into());
}
/// A filled circle without an outline, in device pixels.
unsafe fn ellipse(dc: HDC, cx: f64, cy: f64, r: f64, color: COLORREF) {
    let brush = CreateSolidBrush(color);
    let old_brush = SelectObject(dc, brush.into());
    let old_pen = SelectObject(dc, GetStockObject(NULL_PEN));
    let _ = Ellipse(
        dc,
        (cx - r).round() as i32,
        (cy - r).round() as i32,
        (cx + r).round() as i32 + 1,
        (cy + r).round() as i32 + 1,
    );
    SelectObject(dc, old_pen);
    SelectObject(dc, old_brush);
    let _ = DeleteObject(brush.into());
}
/// The device rectangle of a content surface for the current size and scroll offset.
fn surface_rect(root: RECT, r: RECT, dpi: u32, scroll: i32) -> RECT {
    let k = content_scale(root.right, dpi);
    RECT {
        left: scale(super::LEFT + (r.left as f64 * k) as i32, dpi),
        top: scale(r.top + super::TOP - scroll, dpi),
        right: scale(super::LEFT + (r.right as f64 * k) as i32, dpi),
        bottom: scale(r.bottom + super::TOP - scroll, dpi),
    }
}
/// What `background` paints at a point, computed from the surface list instead of reading
/// pixels back. Translucent fills on top of it (the lamp ring, faded buttons) blend over this.
pub struct Backdrop<'a> {
    pub root: RECT,
    pub dark: bool,
    pub dpi: u32,
    pub surfaces: &'a [(RECT, Surface)],
    pub scroll: i32,
    /// Device position of the control being drawn; `at` takes control coordinates.
    pub origin: (i32, i32),
}
impl Backdrop<'_> {
    pub fn at(&self, x: f64, y: f64) -> COLORREF {
        self.window_at(
            x + self.origin.0 as f64,
            y + self.origin.1 as f64,
            self.surfaces.len(),
        )
    }
    fn window_at(&self, x: f64, y: f64, below: usize) -> COLORREF {
        let p = Palette::new(self.dark);
        let inside = |r: &RECT| {
            x >= r.left as f64 && x < r.right as f64 && y >= r.top as f64 && y < r.bottom as f64
        };
        for (index, (r, kind)) in self.surfaces[..below].iter().enumerate().rev() {
            let r = surface_rect(self.root, *r, self.dpi, self.scroll);
            if !inside(&r) {
                continue;
            }
            return match *kind {
                // Outlines are transparent: the color behind them shows through.
                Surface::Dashed | Surface::Banner | Surface::Warning | Surface::Face(true) => {
                    continue;
                }
                Surface::Rule => p.line,
                Surface::Ink => p.text,
                Surface::Field => p.field,
                Surface::Back(1) => p.deck1,
                Surface::Back(_) => p.deck2,
                Surface::Face(false) => face_at(&p, r, x, y),
                Surface::Stripe(permille) => {
                    let split =
                        r.left as f64 + (r.right - r.left) as f64 * permille as f64 / 1000.0;
                    if x < split {
                        rgb(0xe8a94e)
                    } else {
                        blend(WHITE, self.window_at(x, y, index), 0.08)
                    }
                }
            };
        }
        if x < scale(RAIL, self.dpi) as f64 {
            p.rail
        } else {
            p.ground
        }
    }
}
/// The face gradient color at (x, y) of a face whose device rectangle is `r`.
fn face_at(p: &Palette, r: RECT, x: f64, y: f64) -> COLORREF {
    at_stops(
        &[(0.0, p.face_a), (1.0, p.face_b)],
        gradient_t(r, 135.0, x, y),
    )
}
/// Saves the DC and intersects its clip with `region` (logical units); returns the saved state.
unsafe fn clip_region(dc: HDC, region: HRGN) -> i32 {
    let saved = SaveDC(dc);
    let mut origin = POINT::default();
    let _ = GetViewportOrgEx(dc, &mut origin);
    // Clip regions are in device units; owner-draw painting may have moved the viewport.
    let _ = OffsetRgn(region, origin.x, origin.y);
    let _ = ExtSelectClipRgn(dc, Some(region), RGN_AND);
    let _ = DeleteObject(region.into());
    saved
}
unsafe fn clip_round(dc: HDC, r: RECT, diameter: i32) -> i32 {
    clip_region(
        dc,
        CreateRoundRectRgn(r.left, r.top, r.right + 1, r.bottom + 1, diameter, diameter),
    )
}
fn at_stops(stops: &[(f64, COLORREF)], t: f64) -> COLORREF {
    let t = t.clamp(0.0, 1.0);
    for pair in stops.windows(2) {
        let ((a, ca), (b, cb)) = (pair[0], pair[1]);
        if t <= b {
            return blend(cb, ca, if b > a { (t - a) / (b - a) } else { 1.0 });
        }
    }
    stops[stops.len() - 1].1
}
/// Position 0..1 of (x, y) along a CSS linear-gradient line of `angle` degrees over `r`.
fn gradient_t(r: RECT, angle: f64, x: f64, y: f64) -> f64 {
    let (w, h) = ((r.right - r.left) as f64, (r.bottom - r.top) as f64);
    let a = angle.to_radians();
    let (dx, dy) = (a.sin(), -a.cos());
    let length = (w * dx).abs() + (h * dy).abs();
    ((x - r.left as f64 - w / 2.0) * dx + (y - r.top as f64 - h / 2.0) * dy) / length.max(1.0) + 0.5
}
fn vertex(x: i32, y: i32, c: COLORREF) -> TRIVERTEX {
    TRIVERTEX {
        x,
        y,
        Red: ((c.0 & 255) << 8) as u16,
        Green: (c.0 & 0xff00) as u16,
        Blue: ((c.0 >> 8) & 0xff00) as u16,
        Alpha: 0xffff,
    }
}
/// A CSS `linear-gradient(angle, stops)` over `r`, as one triangle mesh.
unsafe fn linear(dc: HDC, r: RECT, stops: &[(f64, COLORREF)], angle: f64) {
    let (w, h) = ((r.right - r.left) as f64, (r.bottom - r.top) as f64);
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let (columns, rows) = (12usize, 8usize);
    let mut vertices = Vec::with_capacity((columns + 1) * (rows + 1));
    for j in 0..=rows {
        for i in 0..=columns {
            let x = r.left as f64 + w * i as f64 / columns as f64;
            let y = r.top as f64 + h * j as f64 / rows as f64;
            let t = gradient_t(r, angle, x, y);
            vertices.push(vertex(
                x.round() as i32,
                y.round() as i32,
                at_stops(stops, t),
            ));
        }
    }
    let mut mesh = Vec::with_capacity(columns * rows * 2);
    for j in 0..rows {
        for i in 0..columns {
            let a = (j * (columns + 1) + i) as u32;
            let c = a + columns as u32 + 1;
            mesh.push(GRADIENT_TRIANGLE {
                Vertex1: a,
                Vertex2: a + 1,
                Vertex3: c,
            });
            mesh.push(GRADIENT_TRIANGLE {
                Vertex1: a + 1,
                Vertex2: c,
                Vertex3: c + 1,
            });
        }
    }
    let _ = GradientFill(
        dc,
        &vertices,
        mesh.as_ptr().cast(),
        mesh.len() as u32,
        GRADIENT_FILL_TRIANGLE,
    );
}
/// A rounded rectangle filled with a 135° gradient of `stops` (0xRRGGBB).
unsafe fn gradient_round(dc: HDC, r: RECT, diameter: i32, stops: &[(f64, u32)]) {
    let stops: Vec<(f64, COLORREF)> = stops.iter().map(|(t, c)| (*t, rgb(*c))).collect();
    let saved = clip_round(dc, r, diameter);
    linear(dc, r, &stops, 135.0);
    let _ = RestoreDC(dc, saved);
}
unsafe fn shape(
    dc: HDC,
    r: RECT,
    diameter: i32,
    fill: COLORREF,
    border: COLORREF,
    pen: PEN_STYLE,
    width: i32,
) {
    let brush = CreateSolidBrush(fill);
    let pen_object = CreatePen(pen, width, border);
    let old_brush = SelectObject(dc, brush.into());
    let old_pen = SelectObject(dc, pen_object.into());
    // Dashed pens fill their gaps with the background color unless the mode is transparent.
    let _ = SetBkMode(dc, TRANSPARENT);
    let _ = RoundRect(dc, r.left, r.top, r.right, r.bottom, diameter, diameter);
    SelectObject(dc, old_pen);
    SelectObject(dc, old_brush);
    let _ = DeleteObject(pen_object.into());
    let _ = DeleteObject(brush.into());
}
pub unsafe fn rounded(dc: HDC, r: RECT, diameter: i32, fill: COLORREF, border: COLORREF) {
    shape(dc, r, diameter, fill, border, PS_SOLID, 1);
}
/// A rounded border without a fill.
unsafe fn outline(dc: HDC, r: RECT, diameter: i32, color: COLORREF, width: i32) {
    let pen = CreatePen(PS_INSIDEFRAME, width, color);
    let old_pen = SelectObject(dc, pen.into());
    let old_brush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    let _ = RoundRect(dc, r.left, r.top, r.right, r.bottom, diameter, diameter);
    SelectObject(dc, old_brush);
    SelectObject(dc, old_pen);
    let _ = DeleteObject(pen.into());
}
/// Paints one surface; `behind` is the color under its center, for translucent fills.
unsafe fn surface(dc: HDC, r: RECT, kind: Surface, p: Palette, dpi: u32, behind: COLORREF) {
    match kind {
        Surface::Rule => fill(dc, r, p.line),
        Surface::Ink => {
            let width = (1.5 * dpi as f64 / 96.0).round().max(1.0) as i32;
            fill(
                dc,
                RECT {
                    bottom: r.top + width,
                    ..r
                },
                p.text,
            )
        }
        Surface::Field => rounded(dc, r, scale(16, dpi), p.field, p.line),
        Surface::Dashed => shape(dc, r, scale(20, dpi), p.ground, p.faint, PS_DASH, 1),
        Surface::Banner => outline(dc, r, scale(16, dpi), p.gold, 1),
        Surface::Warning => outline(dc, r, scale(16, dpi), p.warn, 1),
        Surface::Face(true) => shape(dc, r, scale(32, dpi), p.ground, p.faint, PS_DASH, 1),
        Surface::Face(false) => {
            let saved = clip_round(dc, r, scale(32, dpi));
            linear(dc, r, &[(0.0, p.face_a), (1.0, p.face_b)], 135.0);
            // inset 0 1px rgba(255, 255, 255, 0.06).
            fill(
                dc,
                RECT {
                    bottom: r.top + 1,
                    ..r
                },
                blend(WHITE, p.face_a, 0.06),
            );
            let _ = RestoreDC(dc, saved);
        }
        Surface::Back(level) => rounded(
            dc,
            r,
            scale(30, dpi),
            if level == 1 { p.deck1 } else { p.deck2 },
            p.line,
        ),
        Surface::Stripe(permille) => {
            // The stripe spans the face's foot, so the face's rounded corners clip it.
            let radius = scale(32, dpi);
            let saved = clip_region(
                dc,
                CreateRoundRectRgn(
                    r.left,
                    r.bottom - radius,
                    r.right + 1,
                    r.bottom + 1,
                    radius,
                    radius,
                ),
            );
            fill(dc, r, blend(WHITE, behind, 0.08));
            let split = r.left + ((r.right - r.left) as i64 * permille as i64 / 1000) as i32;
            if split > r.left {
                fill(dc, RECT { right: split, ..r }, rgb(0xe8a94e));
            }
            let _ = RestoreDC(dc, saved);
        }
    }
}
/// The window background: ground, the rail with its hairlines, then every surface in creation
/// order.
pub unsafe fn background(
    dc: HDC,
    rect: RECT,
    dark: bool,
    dpi: u32,
    surfaces: &[(RECT, Surface)],
    scroll: i32,
) {
    let p = Palette::new(dark);
    let mut clip = RECT::default();
    let _ = GetClipBox(dc, &mut clip);
    fill(dc, rect, p.ground);
    let rail_width = scale(RAIL, dpi);
    if clip.left < rail_width {
        fill(
            dc,
            RECT {
                left: 0,
                top: 0,
                right: rail_width,
                bottom: rect.bottom,
            },
            p.rail,
        );
        // `.navs` and `.rail-foot`: white 8% hairlines above the items and above the switch.
        let hairline = blend(WHITE, p.rail, 0.08);
        for y in [88, super::toggle_y(rect.bottom, dpi) - 18] {
            fill(
                dc,
                RECT {
                    left: scale(14, dpi),
                    top: scale(y, dpi),
                    right: rail_width - scale(14, dpi),
                    bottom: scale(y, dpi) + 1,
                },
                hairline,
            );
        }
    }
    let backdrop = Backdrop {
        root: rect,
        dark,
        dpi,
        surfaces,
        scroll,
        origin: (0, 0),
    };
    for (index, (r, kind)) in surfaces.iter().enumerate() {
        let r = surface_rect(rect, *r, dpi, scroll);
        if r.bottom < clip.top || r.top > clip.bottom || r.right < clip.left || r.left > clip.right
        {
            continue;
        }
        let behind = if matches!(kind, Surface::Stripe(_)) {
            backdrop.window_at(
                (r.left + r.right) as f64 / 2.0,
                (r.top + r.bottom) as f64 / 2.0,
                index,
            )
        } else {
            p.ground
        };
        surface(dc, r, *kind, p, dpi, behind);
    }
}
/// Outline icons from `app.js` (24-unit viewBox) drawn `size` pixels wide at (x, y).
/// 1 WiFi, 5 sliders, 4 document, 6 info, 7 refresh, 8 chevron down, 9 chevron up, 10 check.
pub unsafe fn icon(dc: HDC, id: u32, x: i32, y: i32, size: i32, color: COLORREF) {
    let pen = CreatePen(PS_SOLID, (size / 11).max(1), color);
    let old_pen = SelectObject(dc, pen.into());
    let old_brush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    let at = |a: f64, b: f64| POINT {
        x: x + (a * size as f64 / 24.0).round() as i32,
        y: y + (b * size as f64 / 24.0).round() as i32,
    };
    let lines = |points: &[(f64, f64)]| {
        let points: Vec<POINT> = points.iter().map(|(a, b)| at(*a, *b)).collect();
        let _ = Polyline(dc, &points);
    };
    let arc = |cx: f64, cy: f64, r: f64, from: (f64, f64), to: (f64, f64)| {
        // Counterclockwise from `from` to `to`, as GDI draws arcs by default.
        let (a, b) = (at(cx - r, cy - r), at(cx + r, cy + r));
        let (s, e) = (at(from.0, from.1), at(to.0, to.1));
        let _ = windows::Win32::Graphics::Gdi::Arc(dc, a.x, a.y, b.x, b.y, s.x, s.y, e.x, e.y);
    };
    let dot = |cx: f64, cy: f64, r: f64| {
        let (a, b) = (at(cx - r, cy - r), at(cx + r, cy + r));
        let _ = Ellipse(dc, a.x, a.y, b.x + 1, b.y + 1);
    };
    match id {
        1 => {
            arc(12.0, 21.0, 16.0, (22.58, 9.0), (1.42, 9.0));
            arc(12.0, 21.0, 11.0, (19.08, 12.55), (5.0, 12.55));
            arc(12.0, 21.0, 6.0, (15.48, 16.11), (8.53, 16.11));
            dot(12.0, 20.0, 1.0);
        }
        5 => {
            for (a, b, c, d) in [
                (4.0, 21.0, 4.0, 14.0),
                (4.0, 10.0, 4.0, 3.0),
                (12.0, 21.0, 12.0, 12.0),
                (12.0, 8.0, 12.0, 3.0),
                (20.0, 21.0, 20.0, 16.0),
                (20.0, 12.0, 20.0, 3.0),
                (1.0, 14.0, 7.0, 14.0),
                (9.0, 8.0, 15.0, 8.0),
                (17.0, 16.0, 23.0, 16.0),
            ] {
                lines(&[(a, b), (c, d)]);
            }
        }
        4 => {
            lines(&[
                (14.0, 2.0),
                (6.0, 2.0),
                (4.0, 4.0),
                (4.0, 20.0),
                (6.0, 22.0),
                (18.0, 22.0),
                (20.0, 20.0),
                (20.0, 8.0),
                (14.0, 2.0),
            ]);
            lines(&[(14.0, 2.0), (14.0, 8.0), (20.0, 8.0)]);
            lines(&[(8.0, 13.0), (16.0, 13.0)]);
            lines(&[(8.0, 17.0), (13.0, 17.0)]);
        }
        7 => {
            arc(12.0, 12.0, 9.0, (18.36, 5.64), (21.0, 12.0));
            lines(&[(18.36, 5.64), (21.0, 8.0)]);
            lines(&[(21.0, 3.0), (21.0, 8.0), (16.0, 8.0)]);
        }
        8 => lines(&[(6.0, 9.0), (12.0, 15.0), (18.0, 9.0)]),
        9 => lines(&[(6.0, 15.0), (12.0, 9.0), (18.0, 15.0)]),
        10 => lines(&[(20.0, 6.0), (9.0, 17.0), (4.0, 12.0)]),
        _ => {
            dot(12.0, 12.0, 10.0);
            lines(&[(12.0, 16.0), (12.0, 12.0)]);
            dot(12.0, 8.0, 0.5);
        }
    }
    SelectObject(dc, old_brush);
    SelectObject(dc, old_pen);
    let _ = DeleteObject(pen.into());
}
/// Pen glyphs: 3 a check mark, anything else the loading ring.
unsafe fn glyph(dc: HDC, r: RECT, kind: u8, color: COLORREF) {
    let size = (r.right - r.left).min(r.bottom - r.top);
    let x = r.left + (r.right - r.left - size) / 2;
    let y = r.top + (r.bottom - r.top - size) / 2;
    let pen = CreatePen(PS_SOLID, (size / 14).max(2), color);
    let old_pen = SelectObject(dc, pen.into());
    let old_brush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    let at = |a: i32, b: i32| POINT {
        x: x + size * a / 100,
        y: y + size * b / 100,
    };
    if kind == 3 {
        let points: Vec<POINT> = [(14, 52), (40, 76), (86, 26)]
            .iter()
            .map(|(a, b)| at(*a, *b))
            .collect();
        let _ = Polyline(dc, &points);
    } else {
        let a = at(8, 8);
        let b = at(92, 92);
        let _ = windows::Win32::Graphics::Gdi::Arc(dc, a.x, a.y, b.x, b.y, b.x, a.y, a.x, a.y);
    }
    SelectObject(dc, old_brush);
    SelectObject(dc, old_pen);
    let _ = DeleteObject(pen.into());
}
unsafe fn window_text(h: HWND) -> Vec<u16> {
    let mut text = vec![0u16; (GetWindowTextLengthW(h) + 1).max(1) as usize];
    let length = GetWindowTextW(h, &mut text);
    text.truncate(length.max(0) as usize);
    text
}
unsafe fn draw(
    dc: HDC,
    text: &str,
    r: RECT,
    font: isize,
    color: COLORREF,
    format: DRAW_TEXT_FORMAT,
) {
    // A zero-length buffer hands DrawTextW a dangling pointer, which fast-fails the process.
    if text.is_empty() {
        return;
    }
    let old = SelectObject(dc, HGDIOBJ(font as *mut _));
    let _ = SetTextColor(dc, color);
    let _ = SetBkMode(dc, TRANSPARENT);
    let mut text: Vec<u16> = text.encode_utf16().collect();
    let mut r = r;
    DrawTextW(dc, &mut text, &mut r, format | DT_NOPREFIX);
    SelectObject(dc, old);
}
/// The card's gold chip with its pad outline and contact line; the empty card's chip is grey.
unsafe fn chip(dc: HDC, r: RECT, void: bool, p: &Palette, dpi: u32) {
    let diameter = scale(14, dpi);
    if void {
        rounded(dc, r, diameter, p.line, p.line);
        return;
    }
    let saved = clip_round(dc, r, diameter);
    linear(dc, r, &CHIP.map(|(t, c)| (t, rgb(c))), 135.0);
    let middle = at_stops(&CHIP.map(|(t, c)| (t, rgb(c))), 0.5);
    let ink = blend(rgb(CHIP_INK), middle, 0.38);
    let pad = RECT {
        left: r.left + scale(15, dpi),
        top: r.top + scale(8, dpi),
        right: r.right - scale(15, dpi),
        bottom: r.bottom - scale(8, dpi),
    };
    outline(dc, pad, scale(6, dpi), ink, 1);
    let line = r.top + scale(16, dpi);
    fill(
        dc,
        RECT {
            top: line,
            bottom: line + 1,
            ..r
        },
        ink,
    );
    let _ = RestoreDC(dc, saved);
}
pub unsafe fn static_text(
    item: &DRAWITEMSTRUCT,
    look: Look,
    dark: bool,
    fonts: &[isize],
    dpi: u32,
    bd: &Backdrop,
) {
    let dc = item.hDC;
    let r = item.rcItem;
    let p = Palette::new(dark);
    match look.shape {
        Shape::Hidden => return,
        Shape::Lamp(tone) => {
            let (color, alpha) = match tone {
                1 => (0x5cc795, 0.2),
                2 => (0xe8a94e, 0.22),
                3 => (0xf07b6e, 0.22),
                _ => (0x9aa1a7, 0.2),
            };
            let (cx, cy) = (
                (r.left + r.right) as f64 / 2.0,
                (r.top + r.bottom) as f64 / 2.0,
            );
            let unit = dpi as f64 / 96.0;
            ellipse(
                dc,
                cx,
                cy,
                11.0 * unit,
                blend(rgb(color), bd.at(cx, cy), alpha),
            );
            ellipse(dc, cx, cy, 6.0 * unit, rgb(color));
            return;
        }
        Shape::Glyph(kind, ink) => {
            glyph(dc, r, kind, ink.color(dark));
            return;
        }
        Shape::Icon(id, ink) => {
            let size = (r.right - r.left).min(r.bottom - r.top);
            icon(
                dc,
                id as u32,
                r.left + (r.right - r.left - size) / 2,
                r.top + (r.bottom - r.top - size) / 2,
                size,
                ink.color(dark),
            );
            return;
        }
        Shape::Chip(void) => {
            chip(dc, r, void, &p, dpi);
            return;
        }
        Shape::Mini(on) => {
            let small = RECT {
                left: r.left + scale(7, dpi),
                top: r.top + scale(9, dpi),
                right: r.left + scale(21, dpi),
                bottom: r.top + scale(19, dpi),
            };
            if on {
                let saved = clip_round(dc, r, scale(12, dpi));
                linear(dc, r, &[(0.0, p.face_a), (1.0, p.face_b)], 135.0);
                let _ = RestoreDC(dc, saved);
                gradient_round(dc, small, scale(4, dpi), &CHIP);
            } else {
                rounded(dc, r, scale(12, dpi), p.line, p.line);
                rounded(dc, small, scale(4, dpi), p.faint, p.faint);
            }
            return;
        }
        Shape::Brand => {
            // `.brand-card` 30×21 with its chip, then the name over the school name.
            let card = RECT {
                left: r.left,
                top: r.top + (r.bottom - r.top - scale(21, dpi)) / 2,
                right: r.left + scale(30, dpi),
                bottom: r.top + (r.bottom - r.top + scale(21, dpi)) / 2,
            };
            gradient_round(dc, card, scale(8, dpi), &[(0.0, 0x3a4651), (1.0, 0x2a333c)]);
            outline(
                dc,
                card,
                scale(8, dpi),
                blend(WHITE, rgb(0x323c46), 0.08),
                1,
            );
            let small = RECT {
                left: card.left + scale(5, dpi),
                top: card.top + scale(6, dpi),
                right: card.left + scale(14, dpi),
                bottom: card.top + scale(13, dpi),
            };
            gradient_round(dc, small, scale(4, dpi), &CHIP);
            let text = String::from_utf16_lossy(&window_text(item.hwndItem));
            let left = card.right + scale(12, dpi);
            let middle = r.top + scale(24, dpi);
            draw(
                dc,
                &text,
                RECT {
                    left,
                    bottom: middle,
                    ..r
                },
                fonts[Font::Brand as usize],
                p.rail_text,
                DT_SINGLELINE | DT_BOTTOM | DT_LEFT,
            );
            draw(
                dc,
                "天津科技大学校园网",
                RECT {
                    left,
                    top: middle,
                    ..r
                },
                fonts[Font::Tiny as usize],
                p.rail_text2,
                DT_SINGLELINE | DT_TOP | DT_LEFT | DT_END_ELLIPSIS,
            );
            return;
        }
        Shape::Text => {}
    }
    let text = String::from_utf16_lossy(&window_text(item.hwndItem));
    let font = fonts[look.font as usize];
    let align = match look.align {
        1 => DT_CENTER,
        2 => DT_RIGHT,
        _ => DT_LEFT,
    };
    if let Some(badge) = look.badge {
        // Empty tags stay hidden, like the countdown note before its first tick.
        if text.is_empty() {
            return;
        }
        let (fg, border) = badge_colors(badge, dark);
        outline(dc, r, scale(8, dpi), border, 1);
        draw(
            dc,
            &text,
            r,
            font,
            fg,
            DT_SINGLELINE | DT_VCENTER | DT_CENTER | DT_END_ELLIPSIS,
        );
        return;
    }
    let format = if look.single {
        DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS
    } else {
        DT_WORDBREAK | DT_TOP
    };
    draw(dc, &text, r, font, look.ink.color(dark), format | align);
}
#[allow(clippy::too_many_arguments)]
pub unsafe fn button(
    item: &DRAWITEMSTRUCT,
    kind: Btn,
    active: bool,
    dark: bool,
    fonts: &[isize],
    dpi: u32,
    text: &str,
    bd: &Backdrop,
) {
    let p = Palette::new(dark);
    let dc = item.hDC;
    let rect = item.rcItem;
    let disabled = item.itemState.0 & ODS_DISABLED.0 != 0;
    let pressed = item.itemState.0 & ODS_SELECTED.0 != 0;
    let behind = bd.at(
        (rect.left + rect.right) as f64 / 2.0,
        (rect.top + rect.bottom) as f64 / 2.0,
    );
    let d8 = scale(16, dpi);
    let normal = if pressed { p.line } else { p.field };
    // Transparent buttons (rail items, quiet buttons, idle filter levels) leave `behind`.
    let quiet = if pressed { p.field } else { behind };
    let (fill, border, color, font, diameter) = match kind {
        Btn::Nav if active => (p.rail2, p.rail2, WHITE, Font::NavOn, d8),
        Btn::Nav => {
            let fill = if pressed {
                blend(WHITE, behind, 0.05)
            } else {
                behind
            };
            let color = if pressed { p.rail_text } else { p.rail_text2 };
            (fill, fill, color, Font::Nav, d8)
        }
        Btn::Primary => (p.primary, p.primary, p.on_primary, Font::Medium, d8),
        Btn::Danger => (normal, p.line, p.bad, Font::Medium, d8),
        Btn::Quiet | Btn::Refresh => (quiet, quiet, p.text2, Font::Medium, d8),
        Btn::Choice(true) => (p.field, p.gold, p.text, Font::Medium, d8),
        Btn::Choice(false) => (normal, p.line, p.text2, Font::Normal, d8),
        Btn::Pill(true) => (p.text, p.text, p.ground, Font::Small, scale(10, dpi)),
        Btn::Pill(false) => (quiet, quiet, p.text2, Font::Small, scale(10, dpi)),
        Btn::Auto(on) => (
            normal,
            p.line,
            if on { p.ok } else { p.text2 },
            Font::Medium,
            d8,
        ),
        _ => (normal, p.line, p.text, Font::Medium, d8),
    };
    let fade = |c: COLORREF| if disabled { blend(c, behind, 0.55) } else { c };
    let (fill, border, color) = (fade(fill), fade(border), fade(color));
    if kind == Btn::Choice(true) {
        // The 3px gold-soft ring sits inside the control, around the bordered button.
        let ring = scale(3, dpi);
        rounded(dc, rect, diameter + 2 * ring, p.gold_soft, p.gold_soft);
        let inner = RECT {
            left: rect.left + ring,
            top: rect.top + ring,
            right: rect.right - ring,
            bottom: rect.bottom - ring,
        };
        rounded(dc, inner, diameter, fill, border);
    } else if fill != behind || border != behind {
        rounded(dc, rect, diameter, fill, border);
    }
    let mut r = rect;
    match kind {
        Btn::Nav => {
            let size = scale(19, dpi);
            icon(
                dc,
                item.CtlID % 10,
                r.left + scale(12, dpi),
                r.top + (r.bottom - r.top - size) / 2,
                size,
                if active { fade(p.gold) } else { color },
            );
            r.left += scale(43, dpi);
            draw(
                dc,
                text,
                r,
                fonts[font as usize],
                color,
                DT_SINGLELINE | DT_VCENTER | DT_LEFT,
            );
        }
        Btn::Refresh | Btn::Auto(_) => {
            let size = scale(17, dpi);
            icon(
                dc,
                7,
                r.left + (r.right - r.left - size) / 2,
                r.top + (r.bottom - r.top - size) / 2,
                size,
                color,
            );
        }
        // The WiFi row button shows "切换"; its window text names the network for UI Automation.
        Btn::Switch => draw(
            dc,
            "切换",
            r,
            fonts[Font::Medium as usize],
            color,
            DT_SINGLELINE | DT_VCENTER | DT_CENTER,
        ),
        _ if text.contains('\n') => {
            let (first, second) = text.split_once('\n').unwrap_or((text, ""));
            let pad = scale(14, dpi);
            let middle = (r.top + r.bottom) / 2;
            let top = RECT {
                left: r.left + pad,
                top: r.top,
                right: r.right - pad,
                bottom: middle + scale(2, dpi),
            };
            draw(
                dc,
                first,
                top,
                fonts[Font::Strong as usize],
                color,
                DT_SINGLELINE | DT_BOTTOM | DT_END_ELLIPSIS,
            );
            let bottom = RECT {
                left: r.left + pad,
                top: middle + scale(4, dpi),
                right: r.right - pad,
                bottom: r.bottom,
            };
            draw(
                dc,
                second,
                bottom,
                fonts[Font::Tiny as usize],
                fade(p.text2),
                DT_SINGLELINE | DT_TOP | DT_END_ELLIPSIS,
            );
        }
        _ => draw(
            dc,
            text,
            r,
            fonts[font as usize],
            color,
            DT_SINGLELINE | DT_VCENTER | DT_CENTER | DT_END_ELLIPSIS,
        ),
    }
    if item.itemState.0 & ODS_FOCUS.0 != 0 {
        // `:focus-visible`: a 2px gold outline, drawn inside the control.
        outline(dc, rect, diameter, p.gold, scale(2, dpi).max(1));
    }
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
type Rgb = [f64; 3];
fn hex(value: u32) -> Rgb {
    [
        ((value >> 16) & 255) as f64 / 255.0,
        ((value >> 8) & 255) as f64 / 255.0,
        (value & 255) as f64 / 255.0,
    ]
}
fn hex_mix(a: u32, b: u32, k: f64) -> Rgb {
    let (a, b) = (hex(a), hex(b));
    [
        a[0] + (b[0] - a[0]) * k,
        a[1] + (b[1] - a[1]) * k,
        a[2] + (b[2] - a[2]) * k,
    ]
}
/// A horizontal pill (a circle when square) in device pixels, described by its distance field.
#[derive(Clone, Copy)]
struct Pill {
    x0: f64,
    x1: f64,
    cy: f64,
    r: f64,
}
impl Pill {
    fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        let r = h.min(w) / 2.0;
        // For a circle both ends round to the same centre; `max` keeps x0 <= x1 for `clamp`.
        Pill {
            x0: x + r,
            x1: (x + w - r).max(x + r),
            cy: y + h / 2.0,
            r,
        }
    }
    /// Signed distance to the edge, negative inside.
    fn distance(&self, x: f64, y: f64) -> f64 {
        let dx = x - x.clamp(self.x0, self.x1);
        dx.hypot(y - self.cy) - self.r
    }
    fn bounds(&self, pad: f64) -> (f64, f64, f64, f64) {
        (
            self.x0 - self.r - pad,
            self.cy - self.r - pad,
            self.x1 + self.r + pad,
            self.cy + self.r + pad,
        )
    }
    /// The same pill grown by `e` on every side (shrunk when negative), as a CSS spread.
    fn grow(&self, e: f64) -> Self {
        Pill {
            r: (self.r + e).max(0.0),
            ..*self
        }
    }
    fn offset(&self, dx: f64, dy: f64) -> Self {
        Pill {
            x0: self.x0 + dx,
            x1: self.x1 + dx,
            cy: self.cy + dy,
            r: self.r,
        }
    }
}
/// Antialiased coverage of a filled circle at a pixel center.
fn disc_cover(x: f64, y: f64, (cx, cy, r): (f64, f64, f64)) -> f64 {
    (r - (x - cx).hypot(y - cy) + 0.5).clamp(0.0, 1.0)
}
/// Even-odd point-in-polygon test.
fn inside(polygon: &[(f64, f64)], x: f64, y: f64) -> bool {
    let mut hit = false;
    let Some(&last) = polygon.last() else {
        return false;
    };
    let mut previous = last;
    for &(xi, yi) in polygon {
        let (xj, yj) = previous;
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
            hit = !hit;
        }
        previous = (xi, yi);
    }
    hit
}
/// Software compositing over a 32-bit DIB: GDI has no alpha blending for shapes, so the
/// switch is rasterized here with antialiased coverage and true translucency. `clips` acts like
/// Cairo's clip stack: every shape is weighted by the coverage of each clip pill.
struct Canvas<'a> {
    pixels: &'a mut [u32],
    width: i32,
    height: i32,
    clips: Vec<Pill>,
}
impl Canvas<'_> {
    /// Blends `paint` over the pixels inside `bounds`, weighted by `cover` and the clips.
    fn shape(
        &mut self,
        (left, top, right, bottom): (f64, f64, f64, f64),
        cover: impl Fn(f64, f64) -> f64,
        paint: impl Fn(f64, f64) -> (Rgb, f64),
    ) {
        let x0 = (left.floor() as i32).max(0);
        let y0 = (top.floor() as i32).max(0);
        let x1 = (right.ceil() as i32).min(self.width);
        let y1 = (bottom.ceil() as i32).min(self.height);
        for iy in y0..y1 {
            for ix in x0..x1 {
                let (x, y) = (ix as f64 + 0.5, iy as f64 + 0.5);
                // Clips first, so `cover` only runs where the shape can show.
                let mut weight = 1.0;
                for clip in &self.clips {
                    weight *= (0.5 - clip.distance(x, y)).clamp(0.0, 1.0);
                }
                if weight <= 0.0 {
                    continue;
                }
                weight *= cover(x, y);
                if weight <= 0.0 {
                    continue;
                }
                let (color, alpha) = paint(x, y);
                let a = (alpha * weight).clamp(0.0, 1.0);
                if a <= 0.0 {
                    continue;
                }
                let slot = &mut self.pixels[(iy * self.width + ix) as usize];
                let old = *slot;
                let channel = |shift: u32, value: f64| {
                    let below = ((old >> shift) & 255) as f64 / 255.0;
                    (((below + (value - below) * a) * 255.0).round() as u32).min(255) << shift
                };
                *slot = channel(16, color[0]) | channel(8, color[1]) | channel(0, color[2]);
            }
        }
    }
    fn solid_disc(&mut self, circle: (f64, f64, f64), color: Rgb, alpha: f64) {
        self.discs(&[circle], color, alpha);
    }
    /// Fills the union of circles once, so overlaps do not darken.
    fn discs(&mut self, circles: &[(f64, f64, f64)], color: Rgb, alpha: f64) {
        if alpha <= 0.0 || circles.is_empty() {
            return;
        }
        let mut b = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
        for (cx, cy, r) in circles {
            b = (
                b.0.min(cx - r - 1.0),
                b.1.min(cy - r - 1.0),
                b.2.max(cx + r + 1.0),
                b.3.max(cy + r + 1.0),
            );
        }
        self.shape(
            b,
            |x, y| {
                circles
                    .iter()
                    .fold(0.0, |best: f64, c| best.max(disc_cover(x, y, *c)))
            },
            |_, _| (color, alpha),
        );
    }
    fn pill(&mut self, pill: Pill, color: Rgb, alpha: f64) {
        self.shape(
            pill.bounds(1.0),
            |x, y| (0.5 - pill.distance(x, y)).clamp(0.0, 1.0),
            |_, _| (color, alpha),
        );
    }
    /// Fills the union of polygons, with 4×4 supersampled coverage. A sample is only tested
    /// against the polygons whose bounds contain it.
    fn polygons(&mut self, polygons: &[Vec<(f64, f64)>], color: Rgb, alpha: f64) {
        let boxes: Vec<(f64, f64, f64, f64)> = polygons
            .iter()
            .map(|polygon| {
                polygon
                    .iter()
                    .fold((f64::MAX, f64::MAX, f64::MIN, f64::MIN), |b, &(x, y)| {
                        (b.0.min(x), b.1.min(y), b.2.max(x), b.3.max(y))
                    })
            })
            .collect();
        let mut b = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
        for &(x0, y0, x1, y1) in &boxes {
            b = (
                b.0.min(x0 - 1.0),
                b.1.min(y0 - 1.0),
                b.2.max(x1 + 1.0),
                b.3.max(y1 + 1.0),
            );
        }
        self.shape(
            b,
            |x, y| {
                let mut hits = 0;
                for sy in 0..4 {
                    for sx in 0..4 {
                        let px = x - 0.5 + (sx as f64 + 0.5) / 4.0;
                        let py = y - 0.5 + (sy as f64 + 0.5) / 4.0;
                        let covered = polygons.iter().zip(boxes.iter()).any(
                            |(polygon, &(x0, y0, x1, y1))| {
                                (x0..=x1).contains(&px)
                                    && (y0..=y1).contains(&py)
                                    && inside(polygon, px, py)
                            },
                        );
                        if covered {
                            hits += 1;
                        }
                    }
                }
                hits as f64 / 16.0
            },
            |_, _| (color, alpha),
        );
    }
    /// CSS `box-shadow` on a pill as in linux.rs: six stacked layers spread across ±`blur`
    /// stand in for the Gaussian blur. An inset shadow fills outside `shape`, within the clips.
    fn soft_shadow(&mut self, shape: Pill, blur: f64, color: Rgb, alpha: f64, inset: bool) {
        const LAYERS: usize = 6;
        let each = 1.0 - (1.0 - alpha).powf(1.0 / LAYERS as f64);
        let area = self
            .clips
            .last()
            .map_or(shape.bounds(blur + 1.0), |clip| clip.bounds(1.0));
        for i in 0..LAYERS {
            let e = blur * ((i as f64 + 0.5) / LAYERS as f64 * 2.0 - 1.0);
            let layer = shape.grow(e);
            if inset {
                self.shape(
                    area,
                    |x, y| (0.5 + layer.distance(x, y)).clamp(0.0, 1.0),
                    |_, _| (color, each),
                );
            } else {
                self.pill(layer, color, each);
            }
        }
    }
    /// `box-shadow: inset dx dy blur color` on the pill `b`.
    fn inset_shadow(&mut self, b: Pill, (dx, dy): (f64, f64), blur: f64, color: Rgb, alpha: f64) {
        self.clips.push(b);
        self.soft_shadow(b.offset(dx, dy), blur, color, alpha, true);
        self.clips.pop();
    }
}
/// The day/night switch ported from CodePen "Animated Day/Night Theme Toggle" (kept as
/// `design/toggle-pen.html`) exactly as `draw_toggle` in linux.rs, drawn in its em units: the
/// sun knob slides right while a moon mask slides over it, the clouds sink away and the stars
/// drop in.
fn toggle_scene(canvas: &mut Canvas, dpi: u32, t: &Toggle) {
    let s = TOGGLE_EM * dpi as f64 / 96.0;
    let ox = (canvas.width as f64 - TOGGLE_W * s) / 2.0;
    let oy = (canvas.height as f64 - TOGGLE_H * s) / 2.0;
    let at = |x: f64, y: f64| (ox + x * s, oy + y * s);
    let rect = |(x, y, w, h): (f64, f64, f64, f64)| {
        let (px, py) = at(x, y);
        Pill::new(px, py, w * s, h * s)
    };
    let disc = |x: f64, y: f64, r: f64| {
        let (px, py) = at(x, y);
        (px, py, r * s)
    };
    let k = t.theme.value.clamp(0.0, 1.0);
    let frame = (0.0, 0.0, TOGGLE_W, TOGGLE_H);
    let white = [1.0, 1.0, 1.0];
    let black = [0.0, 0.0, 0.0];
    // Outer highlight: 0.06em 0.06em 0.125em rgba(255, 255, 255, 0.94).
    canvas.soft_shadow(
        rect((0.06, 0.06, TOGGLE_W, TOGGLE_H)),
        0.125 * s,
        white,
        0.94,
        false,
    );
    // `cr.paint()` inside the frame clip: only the clip's own edge coverage applies.
    canvas.clips.push(rect(frame));
    let background = hex_mix(0x3d7eae, 0x1d1f2c, k);
    canvas.shape(
        rect(frame).bounds(1.0),
        |_, _| 1.0,
        |_, _| (background, 1.0),
    );
    // Clouds hang from (0.3em, 2em) and sink 3em at night.
    let (cx, cy) = (0.3 + 0.625, 2.0 + 0.625 + 3.0 * k);
    for (puffs, color) in [(CLOUD_BACK, 0xaacadf), (CLOUD_FRONT, 0xf3fdff)] {
        let circles = puffs.map(|(dx, dy, spread)| disc(cx + dx, cy + dy, 0.625 + spread));
        canvas.discs(&circles, hex(color), 1.0);
    }
    // Stars: 2.75em wide at 0.3em; 2em above the frame by day, 0.5em down at night.
    let unit = 2.75 / 144.0;
    let (sx0, sy0) = (0.3, -2.0 + 2.5 * k);
    let star = |x: f64, y: f64| at(sx0 + x * unit, sy0 + y * unit);
    let sparkles: Vec<Vec<(f64, f64)>> = SPARKLES
        .iter()
        .map(|&(x, y)| {
            let mut from = (x - 3.9956, y);
            let mut points = vec![star(from.0, from.1)];
            for [a, b, c, d, e, f] in SPARKLE {
                let (p1, p2, p3) = ((x + a, y + b), (x + c, y + d), (x + e, y + f));
                for i in 1..=8 {
                    let u = i as f64 / 8.0;
                    let v = 1.0 - u;
                    let bez = |p0: f64, q1: f64, q2: f64, q3: f64| {
                        v * v * v * p0
                            + 3.0 * v * v * u * q1
                            + 3.0 * v * u * u * q2
                            + u * u * u * q3
                    };
                    points.push(star(
                        bez(from.0, p1.0, p2.0, p3.0),
                        bez(from.1, p1.1, p2.1, p3.1),
                    ));
                }
                from = p3;
            }
            points
        })
        .collect();
    canvas.polygons(&sparkles, white, 1.0);
    // Sun: box-shadows paint last-listed first, so the halo rings go under the drop shadows.
    let sun = (t.knob.value, SUN_OFFSET, SUN_D, SUN_D);
    let r = SUN_D / 2.0;
    let (sx, sy) = (sun.0 + r, sun.1 + r);
    for spread in [1.875, 1.25, 0.625] {
        canvas.solid_disc(disc(sx, sy, r + spread), white, 0.1);
    }
    canvas.soft_shadow(
        rect((sun.0, sun.1 + 0.05, SUN_D, SUN_D)),
        0.125 * s,
        black,
        0.25,
        false,
    );
    canvas.soft_shadow(
        rect((sun.0 + 0.05, sun.1 + 0.125, SUN_D, SUN_D)),
        0.125 * s,
        black,
        0.25,
        false,
    );
    canvas.solid_disc(disc(sx, sy, r), hex(0xecca2f), 1.0);
    canvas.inset_shadow(rect(sun), (0.0, -0.05 * s), 0.05 * s, hex(0xa1872a), 1.0);
    canvas.inset_shadow(
        rect(sun),
        (0.05 * s, 0.05 * s),
        0.05 * s,
        hex(0xfeffef),
        0.61,
    );
    // Moon mask: slides in from the right, clipped to the sun's circle.
    canvas.clips.push(rect(sun));
    let moon = (sun.0 + SUN_D * (1.0 - k), sun.1, SUN_D, SUN_D);
    canvas.solid_disc(disc(moon.0 + r, moon.1 + r, r), hex(0xc4c9d1), 1.0);
    canvas.inset_shadow(rect(moon), (0.0, -0.062 * s), 0.062 * s, hex(0x969696), 1.0);
    canvas.inset_shadow(
        rect(moon),
        (0.062 * s, 0.062 * s),
        0.062 * s,
        hex(0xfeffef),
        0.61,
    );
    for (left, top, size) in CRATERS {
        let crater = (moon.0 + left, moon.1 + top, size, size);
        canvas.solid_disc(
            disc(crater.0 + size / 2.0, crater.1 + size / 2.0, size / 2.0),
            hex(0x959db1),
            1.0,
        );
        canvas.inset_shadow(rect(crater), (0.0, 0.03 * s), 0.06 * s, black, 0.25);
    }
    canvas.clips.pop();
    // The container's ::after: inset 0 0.05em 0.187em rgba(0, 0, 0, 0.5).
    canvas.inset_shadow(rect(frame), (0.0, 0.05 * s), 0.187 * s, black, 0.5);
    canvas.clips.pop();
}
/// The day/night switch, centered in `bounds` (`TOGGLE_BOX` at 96 DPI). The pixels already in
/// `dc` (the window background) are read into a 32-bit DIB, the switch is composited over them
/// with alpha, and the result is copied back.
pub unsafe fn toggle(dc: HDC, bounds: RECT, dpi: u32, t: &Toggle, focus: bool) {
    let (width, height) = (bounds.right - bounds.left, bounds.bottom - bounds.top);
    if width <= 0 || height <= 0 {
        return;
    }
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative height: rows run top to bottom.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let Ok(bitmap) = CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0) else {
        return;
    };
    if bits.is_null() {
        let _ = DeleteObject(bitmap.into());
        return;
    }
    let memory = CreateCompatibleDC(Some(dc));
    let old = SelectObject(memory, bitmap.into());
    let _ = BitBlt(
        memory,
        0,
        0,
        width,
        height,
        Some(dc),
        bounds.left,
        bounds.top,
        SRCCOPY,
    );
    let _ = GdiFlush();
    let pixels = std::slice::from_raw_parts_mut(bits.cast::<u32>(), (width * height) as usize);
    toggle_scene(
        &mut Canvas {
            pixels,
            width,
            height,
            clips: Vec::new(),
        },
        dpi,
        t,
    );
    let _ = BitBlt(
        dc,
        bounds.left,
        bounds.top,
        width,
        height,
        Some(memory),
        0,
        0,
        SRCCOPY,
    );
    SelectObject(memory, old);
    let _ = DeleteDC(memory);
    let _ = DeleteObject(bitmap.into());
    if focus {
        let s = TOGGLE_EM * dpi as f64 / 96.0;
        let (cx, cy) = (
            (bounds.left + bounds.right) as f64 / 2.0,
            (bounds.top + bounds.bottom) as f64 / 2.0,
        );
        let ring = RECT {
            left: (cx - TOGGLE_W * s / 2.0).round() as i32 - 3,
            top: (cy - TOGGLE_H * s / 2.0).round() as i32 - 3,
            right: (cx + TOGGLE_W * s / 2.0).round() as i32 + 3,
            bottom: (cy + TOGGLE_H * s / 2.0).round() as i32 + 3,
        };
        let _ = DrawFocusRect(dc, &ring);
    }
}
/// The face of a dropdown (`dropdown.select > button`): field, text and a chevron; `open` adds
/// the gold border, the 3px gold-soft ring and flips the chevron.
#[allow(clippy::too_many_arguments)]
pub unsafe fn combo_face(
    dc: HDC,
    r: RECT,
    dark: bool,
    fonts: &[isize],
    dpi: u32,
    text: &str,
    open: bool,
    focus: bool,
    disabled: bool,
) {
    let p = Palette::new(dark);
    let ring = scale(3, dpi);
    // The control is 3px larger on every side than the field so the ring has room.
    let field = RECT {
        left: r.left + ring,
        top: r.top + ring,
        right: r.right - ring,
        bottom: r.bottom - ring,
    };
    let d8 = scale(16, dpi);
    if open {
        rounded(dc, r, d8 + 2 * ring, p.gold_soft, p.gold_soft);
    }
    let border = if open || focus { p.gold } else { p.line };
    rounded(dc, field, d8, p.field, border);
    let color = if disabled {
        blend(p.text, p.field, 0.55)
    } else {
        p.text
    };
    let pad = scale(12, dpi);
    let size = scale(16, dpi);
    draw(
        dc,
        text,
        RECT {
            left: field.left + pad,
            right: field.right - pad - size - scale(8, dpi),
            ..field
        },
        fonts[Font::Normal as usize],
        color,
        DT_SINGLELINE | DT_VCENTER | DT_LEFT | DT_END_ELLIPSIS,
    );
    icon(
        dc,
        if open { 9 } else { 8 },
        field.right - pad - size,
        field.top + (field.bottom - field.top - size) / 2,
        size,
        if open { p.gold_text } else { p.text2 },
    );
}
/// One option in the dropdown list: a line-colored hover fill, gold text and a check mark for
/// the chosen value.
pub unsafe fn combo_item(
    item: &DRAWITEMSTRUCT,
    dark: bool,
    fonts: &[isize],
    dpi: u32,
    text: &str,
    chosen: bool,
) {
    let p = Palette::new(dark);
    let dc = item.hDC;
    let r = item.rcItem;
    fill(dc, r, p.field);
    if item.itemState.0 & ODS_SELECTED.0 != 0 {
        let inset = scale(4, dpi);
        let hot = RECT {
            left: r.left + inset,
            top: r.top + 1,
            right: r.right - inset,
            bottom: r.bottom - 1,
        };
        rounded(dc, hot, scale(12, dpi), p.line, p.line);
    }
    let size = scale(14, dpi);
    let x = r.left + scale(14, dpi);
    let weight = if chosen { Font::Strong } else { Font::Normal };
    if chosen {
        icon(
            dc,
            10,
            x,
            r.top + (r.bottom - r.top - size) / 2,
            size,
            p.gold_text,
        );
    }
    draw(
        dc,
        text,
        RECT {
            left: x + size + scale(8, dpi),
            ..r
        },
        fonts[weight as usize],
        if chosen { p.gold_text } else { p.text },
        DT_SINGLELINE | DT_VCENTER | DT_LEFT | DT_END_ELLIPSIS,
    );
}
