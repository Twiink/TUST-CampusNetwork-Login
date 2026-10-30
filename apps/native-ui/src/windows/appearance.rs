//! GDI surfaces for the sky theme in `design/` (PORT-SPEC.md) without a browser or a GPU renderer.
//! Colors come from the prototype tokens; translucent fills are blended over the color behind them.
use super::*;
use windows::Win32::{Graphics::Dwm::*, System::Registry::*};

/// Theme tokens from `design/app.css` (`:root` and `.night`).
#[derive(Clone, Copy)]
pub struct Palette {
    pub ground: COLORREF,
    /// `--surface`, the card and input color.
    pub card: COLORREF,
    pub surface2: COLORREF,
    /// `--line`.
    pub border: COLORREF,
    pub text: COLORREF,
    pub secondary: COLORREF,
    /// `--accent`.
    pub primary: COLORREF,
    pub accent_soft: COLORREF,
    pub on_accent: COLORREF,
    pub ok: COLORREF,
    pub warn: COLORREF,
    pub bad: COLORREF,
    pub ok_soft: COLORREF,
    pub warn_soft: COLORREF,
    pub bad_soft: COLORREF,
    pub rail_a: COLORREF,
    pub rail_b: COLORREF,
    pub rail_text: COLORREF,
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
            let card = rgb(0x111c31);
            Self {
                ground: rgb(0x0a1222),
                card,
                surface2: rgb(0x16233b),
                border: rgb(0x22324d),
                text: rgb(0xe4ebf5),
                secondary: rgb(0x94a6bf),
                primary: rgb(0xf0d98a),
                accent_soft: mix(0xf0d98a, card, 13),
                on_accent: rgb(0x1a1606),
                ok: rgb(0x5fd39f),
                warn: rgb(0xf2b45a),
                bad: rgb(0xff7b7b),
                ok_soft: mix(0x5fd39f, card, 12),
                warn_soft: mix(0xf2b45a, card, 12),
                bad_soft: mix(0xff7b7b, card, 12),
                rail_a: rgb(0x070d1c),
                rail_b: rgb(0x15213b),
                rail_text: rgb(0xe4ebf5),
            }
        } else {
            Self {
                ground: rgb(0xeaf3fc),
                card: rgb(0xffffff),
                surface2: rgb(0xf2f7fc),
                border: rgb(0xd9e6f2),
                text: rgb(0x0f2a44),
                secondary: rgb(0x4f6a84),
                primary: rgb(0x2370c0),
                accent_soft: rgb(0xe1eefb),
                on_accent: rgb(0xffffff),
                ok: rgb(0x17865c),
                warn: rgb(0xa8650a),
                bad: rgb(0xc93838),
                ok_soft: rgb(0xe0f4ea),
                warn_soft: rgb(0xfbf0dc),
                bad_soft: rgb(0xfbe5e5),
                rail_a: rgb(0x2a68ad),
                rail_b: rgb(0x4a90d9),
                rail_text: rgb(0xffffff),
            }
        }
    }
    /// Field background for edits, combo boxes and read-only text.
    pub fn input(&self, _dark: bool) -> COLORREF {
        self.card
    }
    /// `--rail-text-2` over the rail color at `y` of `height`.
    pub fn rail_text2(&self, dark: bool, behind: COLORREF) -> COLORREF {
        if dark {
            rgb(0x94a6bf)
        } else {
            blend(rgb(0xffffff), behind, 0.78)
        }
    }
    /// The rail gradient color at `y` of a rail `height` pixels tall.
    pub fn rail_at(&self, y: i32, height: i32) -> COLORREF {
        blend(self.rail_b, self.rail_a, y as f64 / height.max(1) as f64)
    }
}
/// Sky panel gradient stops (160°) for 0 clear, 1 cloudy, 2 rain.
pub fn sky_stops(state: u8, dark: bool) -> [COLORREF; 3] {
    let stops = match (dark, state) {
        (false, 0) => [0x3d84d0, 0x6fb0ee, 0xa9d3f7],
        (false, 1) => [0x6b8fb6, 0x9db8d4, 0xc9d8e6],
        (false, _) => [0x56606f, 0x7d8795, 0xa5adb8],
        (true, 0) => [0x070d1c, 0x111a30, 0x1f3156],
        (true, 1) => [0x141b2c, 0x253149, 0x34415a],
        (true, _) => [0x1d1416, 0x3a2427, 0x4b3033],
    };
    stops.map(rgb)
}
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Font {
    #[default]
    Normal,
    Small,
    Tiny,
    Strong,
    Badge,
    Card,
    Section,
    Title,
    Brand,
    Notice,
    Name,
    Metric,
    Mono,
}
/// Size, weight and face (0 YaHei UI, 1 Consolas, 2 Segoe UI Emoji) for each `Font`, in CSS pixels.
pub const FONTS: [(i32, i32, u8); 13] = [
    (14, 400, 0),
    (13, 400, 0),
    (12, 400, 0),
    (14, 700, 0),
    (12, 600, 0),
    (16, 700, 0),
    (15, 700, 0),
    (26, 800, 0),
    (19, 800, 0),
    (22, 700, 0),
    (30, 800, 0),
    (17, 700, 0),
    (13, 400, 1),
];
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Ink {
    #[default]
    Text,
    Secondary,
    Heading,
    /// Text on the sidebar rail.
    Brand,
    Primary,
    Danger,
    Warning,
    Success,
    Good,
    Poor,
    Error,
    Level(u8),
    Muted,
    /// White text on the sky panel.
    OnSky,
    /// `.where` and body copy on the sky panel (white at about 90%).
    OnSkySoft,
    /// `--rail-text-2`, the caption under the day/night switch.
    Rail,
}
impl Ink {
    pub fn color(self, dark: bool) -> COLORREF {
        let p = Palette::new(dark);
        match self {
            Ink::Text | Ink::Heading => p.text,
            Ink::Secondary | Ink::Muted => p.secondary,
            Ink::Brand => p.rail_text,
            Ink::Primary => p.primary,
            Ink::Danger | Ink::Error => p.bad,
            Ink::Warning | Ink::Poor => p.warn,
            Ink::Success => p.ok,
            Ink::Good => rgb(if dark { 0x7db4f0 } else { 0x2370c0 }),
            Ink::Level(0) => rgb(if dark { 0x7db4f0 } else { 0x2370c0 }),
            Ink::Level(1) => p.ok,
            Ink::Level(2) => p.warn,
            Ink::Level(3) => p.bad,
            Ink::Level(4) => rgb(if dark { 0xc9a8f5 } else { 0x7e4fc0 }),
            Ink::Level(_) => p.secondary,
            Ink::OnSky => rgb(0xffffff),
            Ink::OnSkySoft => rgb(if dark { 0xdfe6f2 } else { 0xf0f6fd }),
            Ink::Rail => p.rail_text2(dark, p.rail_b),
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Badge {
    Neutral,
    /// `.badge.accent`.
    Sky,
    Green,
    Prio(u8),
    Level(u8),
    /// A chip on the sky panel; `true` is the red alert chip.
    Chip(bool),
}
pub fn badge_colors(badge: Badge, dark: bool) -> (COLORREF, COLORREF) {
    let p = Palette::new(dark);
    match badge {
        Badge::Neutral => (p.surface2, p.secondary),
        Badge::Sky => (p.accent_soft, p.primary),
        Badge::Green => (p.ok_soft, p.ok),
        // Chips sample the sky behind them in `static_text`; this is the fallback.
        Badge::Chip(alert) => (
            if alert {
                rgb(0xff5a5a)
            } else {
                mix(0xffffff, sky_stops(0, dark)[1], 20)
            },
            rgb(0xffffff),
        ),
        Badge::Prio(priority) => (
            rgb(match priority {
                0..=3 => 0xc93838,
                4..=6 => 0xd9822b,
                7..=10 => 0x2370c0,
                11..=20 => 0x17865c,
                _ => 0x6b7a8c,
            }),
            rgb(0xffffff),
        ),
        Badge::Level(kind) => {
            let ink = Ink::Level(kind).color(dark);
            let soft = match kind {
                1 => p.ok_soft,
                2 => p.warn_soft,
                3 => p.bad_soft,
                5 => p.surface2,
                _ => blend(ink, p.card, if dark { 0.14 } else { 0.11 }),
            };
            (soft, ink)
        }
    }
}
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum Shape {
    #[default]
    Text,
    /// Keeps a UI Automation name (the accessible group name in linux.rs) without drawing.
    Hidden,
    Dot(Ink),
    /// 0 WiFi off, 1 warning, 2 success, 3 check mark, 4 loading ring.
    Glyph(u8, Ink),
    /// A row of badges taken from the control's badge list.
    Pills,
    /// The sky panel illustration: 0 clear, 1 cloudy, 2 rain.
    Weather(u8),
    /// WiFi icon and "NetMate" on the rail.
    Brand,
    /// An outline icon (same ids as `icon`) centered in the control.
    Icon(u8, Ink),
    /// The About hero's app mark: a sky-gradient rounded square with the WiFi glyph.
    Mark,
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
    Choice(bool),
    Pill(bool),
    /// The "切换" button of a WiFi row; the window text carries the full accessible name.
    Switch,
    Auto(bool),
    /// `.btn.on-sky`: solid white (night: accent) on the sky panel.
    OnSky,
    /// `.btn.ghost-sky`: transparent with a white border on the sky panel.
    GhostSky,
    /// `.icon-btn` with the refresh icon; the window text is the accessible name.
    Refresh,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Surface {
    Card,
    Row,
    Dashed,
    Tint(u32),
    Rule,
    Field,
    /// The sky panel: 0 clear, 1 cloudy, 2 rain.
    Sky(u8),
    /// `.sky-bar` track and fill.
    SkyTrack,
    SkyFill,
    /// The current WiFi row: accent-soft fill with a 3px accent bar on the left.
    Current,
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
/// Frame state of the day/night switch (mirrors `Toggle` in linux.rs). The window procedure
/// runs its 16 ms timer only while something moves or the window is active.
#[derive(Clone, Copy, Default)]
pub struct Toggle {
    pub night: bool,
    /// Knob position, 0 = day (left) .. 1 = night (right); overshoots during the switch.
    pub position: f64,
    /// Colour and opacity blend between the day and night scenes.
    pub progress: f64,
    pub from: (f64, f64),
    pub target: f64,
    pub started: Option<std::time::Instant>,
    pub hover: bool,
    /// The window is shown and active: halos breathe, clouds sway and stars twinkle.
    pub ambient: bool,
    /// Strength of the ambient motion 0..1; eases in and out so pausing never jumps.
    pub motion: f64,
    /// Hover emphasis 0..1 (scale 1.07, brighter border).
    pub lift: f64,
    /// Seconds of sway and twinkle accumulated while the motion runs.
    pub clock: f64,
    pub last: Option<std::time::Instant>,
    pub ticking: bool,
}
const SWITCH_S: f64 = 0.55;
const LIFT_S: f64 = 0.2;
impl Toggle {
    pub fn new(night: bool) -> Self {
        let end = f64::from(u8::from(night));
        Toggle {
            night,
            position: end,
            progress: end,
            target: end,
            ..Toggle::default()
        }
    }
    /// Jumps to the end state with no ambient motion (system animations are off).
    pub fn settle(&mut self) {
        let target = f64::from(u8::from(self.night));
        self.position = target;
        self.progress = target;
        self.target = target;
        self.started = None;
        self.lift = if self.hover { 1.0 } else { 0.0 };
        self.motion = 0.0;
        self.ticking = false;
    }
    /// Restarts the switch transition when the target changed; a reversal continues from the
    /// current frame.
    pub fn retarget(&mut self) {
        let target = f64::from(u8::from(self.night));
        if self.target != target || (self.started.is_none() && self.progress != target) {
            self.from = (self.position, self.progress);
            self.target = target;
            self.started = None;
        }
    }
    /// Advances one frame; returns false once nothing moves and the window is not active.
    pub fn step(&mut self, now: std::time::Instant) -> bool {
        let dt = self
            .last
            .map_or(0.0, |last| now.duration_since(last).as_secs_f64());
        self.last = Some(now);
        if self.progress != self.target || self.position != self.target {
            let start = *self.started.get_or_insert(now);
            let k = (now.duration_since(start).as_secs_f64() / SWITCH_S).clamp(0.0, 1.0);
            let (target, (from_position, from_progress)) = (self.target, self.from);
            self.position = from_position + (target - from_position) * overshoot(k);
            self.progress = from_progress + (target - from_progress) * css_ease(k);
            if k >= 1.0 {
                self.position = target;
                self.progress = target;
                self.started = None;
            }
        }
        let approach = |value: f64, target: f64| {
            let step = dt / LIFT_S;
            if value < target {
                (value + step).min(target)
            } else {
                (value - step).max(target)
            }
        };
        let lift_target = if self.hover { 1.0 } else { 0.0 };
        self.lift = approach(self.lift, lift_target);
        let lively = self.hover || self.ambient;
        let motion_target = if lively { 1.0 } else { 0.0 };
        self.motion = approach(self.motion, motion_target);
        if self.motion > 0.0 {
            self.clock += dt;
        }
        let moving = self.progress != self.target
            || self.position != self.target
            || self.lift != lift_target
            || self.motion != motion_target;
        moving || lively
    }
}
/// The knob's cubic-bezier(0.68, -0.1, 0.265, 1.2), which overshoots slightly.
fn overshoot(t: f64) -> f64 {
    bezier(0.68, -0.1, 0.265, 1.2, t)
}
/// CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)).
fn css_ease(t: f64) -> f64 {
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
/// CubicEase EaseInOut, which themeswitch uses for every move.
fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t.powi(3)
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
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
            2 => w!("Segoe UI Emoji"),
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
/// pixels back. Translucent fills on top of it (chips, the rail selection) blend over this.
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
                Surface::Card | Surface::Field | Surface::Dashed => p.card,
                Surface::Row => p.surface2,
                Surface::Rule => p.border,
                Surface::Tint(c) => mix(c, p.card, if self.dark { 12 } else { 9 }),
                Surface::Current => p.accent_soft,
                Surface::SkyFill => {
                    if self.dark {
                        p.primary
                    } else {
                        WHITE
                    }
                }
                Surface::SkyTrack => blend(WHITE, self.window_at(x, y, index), 0.28),
                Surface::Sky(state) => {
                    let s = sky_stops(state, self.dark);
                    at_stops(
                        &[(0.0, s[0]), (0.6, s[1]), (1.0, s[2])],
                        gradient_t(r, 160.0, x, y),
                    )
                }
            };
        }
        if x < scale(194, self.dpi) as f64 {
            p.rail_at(y as i32, self.root.bottom)
        } else {
            p.ground
        }
    }
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
/// The prototype `CLOUD` path (a 120×64 viewBox) as four circles and a box, `w` pixels wide.
unsafe fn cloud_region(x: f64, y: f64, w: f64) -> HRGN {
    let k = w / 120.0;
    let px = |v: f64| (x + v * k).round() as i32;
    let py = |v: f64| (y + v * k).round() as i32;
    let region = CreateRectRgn(px(27.0), py(40.0), px(94.0), py(60.0));
    for (cx, cy, r) in [
        (27.0, 42.0, 18.0),
        (51.8, 27.6, 26.0),
        (77.0, 35.0, 20.0),
        (94.0, 44.0, 16.0),
    ] {
        let part = CreateEllipticRgn(px(cx - r), py(cy - r), px(cx + r) + 1, py(cy + r) + 1);
        let _ = CombineRgn(Some(region), Some(region), Some(part), RGN_OR);
        let _ = DeleteObject(part.into());
    }
    region
}
unsafe fn solid_cloud(dc: HDC, x: f64, y: f64, w: f64, color: COLORREF) {
    let region = cloud_region(x, y, w);
    let brush = CreateSolidBrush(color);
    let _ = FillRgn(dc, region, brush);
    let _ = DeleteObject(brush.into());
    let _ = DeleteObject(region.into());
}
unsafe fn gradient_cloud(dc: HDC, x: f64, y: f64, w: f64, stops: &[(f64, COLORREF)]) {
    let saved = clip_region(dc, cloud_region(x, y, w));
    let r = RECT {
        left: x.floor() as i32,
        top: y.floor() as i32,
        right: (x + w).ceil() as i32,
        bottom: (y + w * 64.0 / 120.0).ceil() as i32,
    };
    linear(dc, r, stops, 180.0);
    let _ = RestoreDC(dc, saved);
}
/// A radial glow: rings fading from `alpha` at `inner` to nothing at `outer`.
#[allow(clippy::too_many_arguments)]
unsafe fn glow(
    dc: HDC,
    cx: f64,
    cy: f64,
    inner: f64,
    outer: f64,
    color: COLORREF,
    alpha: f64,
    bg: COLORREF,
) {
    let steps = 8;
    for i in 0..steps {
        let f = i as f64 / steps as f64;
        let radius = outer - (outer - inner) * f;
        ellipse(
            dc,
            cx,
            cy,
            radius,
            blend(color, bg, alpha * (f + 1.0 / steps as f64)),
        );
    }
}
/// A sphere shaded like a CSS radial gradient whose center is at `light` (fractions of the box).
#[allow(clippy::too_many_arguments)]
unsafe fn orb(
    dc: HDC,
    cx: f64,
    cy: f64,
    r: f64,
    stops: &[(f64, u32)],
    light: (f64, f64),
    opacity: f64,
    bg: COLORREF,
) {
    let stops: Vec<(f64, COLORREF)> = stops.iter().map(|(t, c)| (*t, rgb(*c))).collect();
    let (lx, ly) = (
        cx + (light.0 - 0.5) * 2.0 * r,
        cy + (light.1 - 0.5) * 2.0 * r,
    );
    let steps = 10;
    for i in 0..steps {
        let f = i as f64 / steps as f64;
        let radius = r * (1.0 - f);
        let color = at_stops(&stops, 1.0 - f);
        ellipse(
            dc,
            cx + (lx - cx) * f,
            cy + (ly - cy) * f,
            radius,
            blend(color, bg, opacity),
        );
    }
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
    let pen = CreatePen(pen, width, border);
    let old_brush = SelectObject(dc, brush.into());
    let old_pen = SelectObject(dc, pen.into());
    let _ = RoundRect(dc, r.left, r.top, r.right, r.bottom, diameter, diameter);
    SelectObject(dc, old_pen);
    SelectObject(dc, old_brush);
    let _ = DeleteObject(pen.into());
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
/// Star positions (percent of the box) for the night sky panel, after `stars(18, 3)` in app.js.
fn sky_stars() -> impl Iterator<Item = (f64, f64)> {
    (0..18).map(|i| (((i * 37 + 39) % 97) as f64, ((i * 53 + 21) % 89) as f64))
}
/// Paints one surface; `behind` is the color under its center, for translucent fills.
#[allow(clippy::too_many_arguments)]
unsafe fn surface(
    dc: HDC,
    r: RECT,
    kind: Surface,
    p: Palette,
    dark: bool,
    dpi: u32,
    behind: COLORREF,
) {
    let d9 = scale(18, dpi);
    match kind {
        Surface::Card => rounded(dc, r, scale(28, dpi), p.card, p.border),
        Surface::Row => rounded(dc, r, scale(20, dpi), p.surface2, p.border),
        Surface::Dashed => shape(dc, r, scale(20, dpi), p.card, p.border, PS_DASH, 1),
        Surface::Tint(c) => {
            let fill = mix(c, p.card, if dark { 12 } else { 9 });
            rounded(dc, r, scale(20, dpi), fill, fill)
        }
        Surface::Field => rounded(dc, r, d9, p.input(dark), p.border),
        Surface::Rule => fill(dc, r, p.border),
        Surface::Sky(state) => {
            let saved = clip_round(dc, r, scale(32, dpi));
            let s = sky_stops(state, dark);
            let stops = [(0.0, s[0]), (0.6, s[1]), (1.0, s[2])];
            linear(dc, r, &stops, 160.0);
            if dark && state < 2 {
                let alpha = if state == 0 { 0.85 } else { 0.35 };
                let (w, h) = ((r.right - r.left) as f64, (r.bottom - r.top) as f64);
                let radius = (dpi as f64 / 96.0).max(1.0);
                for (x, y) in sky_stars() {
                    let (x, y) = (r.left as f64 + w * x / 100.0, r.top as f64 + h * y / 100.0);
                    let behind = at_stops(&stops, gradient_t(r, 160.0, x, y));
                    ellipse(dc, x, y, radius, blend(WHITE, behind, alpha));
                }
            }
            let _ = RestoreDC(dc, saved);
        }
        Surface::SkyTrack => {
            let color = blend(WHITE, behind, 0.28);
            rounded(dc, r, r.bottom - r.top, color, color)
        }
        Surface::SkyFill => {
            let color = if dark { p.primary } else { WHITE };
            rounded(dc, r, r.bottom - r.top, color, color)
        }
        Surface::Current => {
            fill(dc, r, p.accent_soft);
            fill(
                dc,
                RECT {
                    right: r.left + scale(3, dpi).max(2),
                    ..r
                },
                p.primary,
            );
        }
    }
}
/// The window background: ground, the sidebar sky, then every surface in creation order.
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
    let rail_width = scale(194, dpi);
    let height = rect.bottom;
    if clip.left < rail_width {
        let rail = RECT {
            left: 0,
            top: 0,
            right: rail_width,
            bottom: height,
        };
        linear(dc, rail, &[(0.0, p.rail_a), (1.0, p.rail_b)], 180.0);
        if dark {
            let radius = (dpi as f64 / 96.0).max(1.0);
            for i in 0..14 {
                let x = rail_width as f64 * ((i * 41) % 95) as f64 / 100.0;
                let y = height as f64 * ((i * 29) % 70) as f64 / 100.0;
                ellipse(
                    dc,
                    x + radius,
                    y + radius,
                    radius,
                    blend(WHITE, p.rail_at(y as i32, height), 0.8),
                );
            }
        } else {
            // Two static clouds from `.rail-sky` (.rc1 and .rc2).
            for (width, x, bottom, alpha) in [(138, -22, 112, 0.3), (86, 194 + 16 - 86, 196, 0.22)]
            {
                let w = scale(width, dpi) as f64;
                let y = (height - scale(bottom, dpi)) as f64 - w * 64.0 / 120.0;
                let behind = p.rail_at((y + w * 0.3) as i32, height);
                solid_cloud(dc, scale(x, dpi) as f64, y, w, blend(WHITE, behind, alpha));
            }
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
        let behind = if *kind == Surface::SkyTrack {
            backdrop.window_at(
                (r.left + r.right) as f64 / 2.0,
                (r.top + r.bottom) as f64 / 2.0,
                index,
            )
        } else {
            p.card
        };
        surface(dc, r, *kind, p, dark, dpi, behind);
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
/// Notice icons drawn with pens: WiFi off, warning, success, a check mark and a loading ring.
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
    let lines = |points: &[(i32, i32)]| {
        let points: Vec<POINT> = points.iter().map(|(a, b)| at(*a, *b)).collect();
        let _ = Polyline(dc, &points);
    };
    match kind {
        0 => {
            for (inset, top) in [(6, 30), (22, 46)] {
                let a = at(inset, top);
                let b = at(100 - inset, 100 + top - 2 * inset);
                let third = a.y + (b.y - a.y) / 3;
                let _ = windows::Win32::Graphics::Gdi::Arc(
                    dc, a.x, a.y, b.x, b.y, b.x, third, a.x, third,
                );
            }
            let _ = Ellipse(dc, at(44, 72).x, at(44, 72).y, at(56, 84).x, at(56, 84).y);
            lines(&[(12, 12), (88, 88)]);
        }
        1 => {
            lines(&[(50, 8), (94, 88), (6, 88), (50, 8)]);
            lines(&[(50, 36), (50, 62)]);
            lines(&[(50, 72), (50, 76)]);
        }
        2 => {
            let _ = Ellipse(dc, at(6, 6).x, at(6, 6).y, at(94, 94).x, at(94, 94).y);
            lines(&[(28, 52), (44, 68), (72, 36)]);
        }
        3 => lines(&[(14, 52), (40, 76), (86, 26)]),
        _ => {
            let a = at(8, 8);
            let b = at(92, 92);
            let _ = windows::Win32::Graphics::Gdi::Arc(dc, a.x, a.y, b.x, b.y, b.x, a.y, a.x, a.y);
        }
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
    let old = SelectObject(dc, HGDIOBJ(font as *mut _));
    let _ = SetTextColor(dc, color);
    let _ = SetBkMode(dc, TRANSPARENT);
    let mut text: Vec<u16> = text.encode_utf16().collect();
    let mut r = r;
    DrawTextW(dc, &mut text, &mut r, format | DT_NOPREFIX);
    SelectObject(dc, old);
}
unsafe fn text_width(dc: HDC, text: &str, font: isize) -> i32 {
    let old = SelectObject(dc, HGDIOBJ(font as *mut _));
    let text: Vec<u16> = text.encode_utf16().collect();
    let mut size = SIZE::default();
    let _ = GetTextExtentPoint32W(dc, &text, &mut size);
    SelectObject(dc, old);
    size.cx
}
/// Badge fill and text; chips on the sky panel blend over the color already painted behind them.
fn badge_paint(r: RECT, badge: Badge, dark: bool, bd: &Backdrop) -> (COLORREF, COLORREF) {
    match badge {
        Badge::Chip(alert) => {
            let behind = bd.at(
                (r.left + r.right) as f64 / 2.0,
                (r.top + r.bottom) as f64 / 2.0,
            );
            (
                if alert {
                    blend(rgb(0xff5a5a), behind, 0.85)
                } else {
                    blend(WHITE, behind, 0.2)
                },
                WHITE,
            )
        }
        _ => badge_colors(badge, dark),
    }
}
/// Draws a row of badges starting at (x, y); clipping happens at the item edge.
#[allow(clippy::too_many_arguments)]
unsafe fn pills(
    dc: HDC,
    badges: &[(String, Badge)],
    x: i32,
    y: i32,
    dark: bool,
    fonts: &[isize],
    dpi: u32,
    bd: &Backdrop,
) {
    let font = fonts[Font::Badge as usize];
    let mut x = x;
    for (text, badge) in badges {
        let width = text_width(dc, text, font) + scale(16, dpi);
        let r = RECT {
            left: x,
            top: y,
            right: x + width,
            bottom: y + scale(22, dpi),
        };
        let (fill, fg) = badge_paint(r, *badge, dark, bd);
        rounded(dc, r, scale(12, dpi), fill, fill);
        draw(
            dc,
            text,
            r,
            font,
            fg,
            DT_SINGLELINE | DT_VCENTER | DT_CENTER,
        );
        x += width + scale(6, dpi);
    }
}
/// The sky panel illustration (a 220×150 viewBox) scaled into `r`; static, one frame per state.
unsafe fn weather(dc: HDC, r: RECT, state: u8, dark: bool, bd: &Backdrop) {
    let k = (r.right - r.left) as f64 / 220.0;
    let px = |v: f64| r.left as f64 + v * k;
    let py = |v: f64| r.top as f64 + v * k;
    let behind = |x: f64, y: f64| bd.at(x, y);
    let (cx, cy) = (px(138.0), py(50.0));
    let sun_bg = behind(cx, cy);
    let cloud_bg = |x: f64, y: f64, s: f64| behind(px(x) + 60.0 * s * k, py(y) + 40.0 * s * k);
    let back_bg = cloud_bg(6.0, 24.0, 0.82);
    let main_bg = cloud_bg(62.0, 50.0, 1.3);
    let rain_bg = behind(px(140.0), py(142.0));
    // Sun or moon, with its glow.
    let (orb_opacity, glow_opacity) = match (dark, state) {
        (false, 0) => (1.0, 1.0),
        (false, 1) => (0.6, 0.35),
        (true, 0) => (1.0, 1.0),
        (true, 1) => (0.6, 1.0),
        _ => (0.0, 0.0),
    };
    if orb_opacity > 0.0 {
        let bg = sun_bg;
        if dark {
            glow(
                dc,
                cx,
                cy,
                58.0 * k * 0.4,
                58.0 * k,
                rgb(0xffecb0),
                0.35 * glow_opacity,
                bg,
            );
            orb(
                dc,
                cx,
                cy,
                28.0 * k,
                &[(0.0, 0xffffff), (0.55, 0xfff6d9), (1.0, 0xf2e3a8)],
                (0.34, 0.32),
                orb_opacity,
                bg,
            );
            let surface = blend(rgb(0xfff6d9), bg, orb_opacity);
            for (x, y, radius, alpha) in [
                (128.0, 44.0, 5.0, 0.55),
                (147.0, 60.0, 3.5, 0.5),
                (146.0, 39.0, 2.5, 0.45),
            ] {
                ellipse(
                    dc,
                    px(x),
                    py(y),
                    radius * k,
                    blend(rgb(0xecdca6), surface, alpha * orb_opacity),
                );
            }
        } else {
            glow(
                dc,
                cx,
                cy,
                58.0 * k * 0.45,
                58.0 * k,
                rgb(0xffe680),
                0.55 * glow_opacity,
                bg,
            );
            orb(
                dc,
                cx,
                cy,
                30.0 * k,
                &[(0.0, 0xfff5c0), (0.7, 0xffd84d), (1.0, 0xffc107)],
                (0.36, 0.34),
                orb_opacity,
                bg,
            );
        }
    }
    let (top, bottom) = match (dark, state) {
        (false, 2) => (0xe3e7ec, 0xa9b2bd),
        (true, 2) => (0x5a5258, 0x352d33),
        (true, _) => (0x5d6c8c, 0x36425c),
        _ => (0xffffff, 0xd6e6f7),
    };
    let cloud = |x: f64, y: f64, s: f64, opacity: f64, bg: COLORREF| {
        let w = 120.0 * s * k;
        let (a, b) = (
            blend(rgb(top), bg, opacity),
            blend(rgb(bottom), bg, opacity),
        );
        let middle = if top == 0xffffff {
            blend(rgb(0xf3f8fe), bg, opacity)
        } else {
            blend(a, b, 0.3)
        };
        (px(x), py(y), w, [(0.0, a), (0.7, middle), (1.0, b)], bg)
    };
    // Back cloud: hidden when clear.
    if state != 0 {
        let (x, y, w, stops, _) = cloud(6.0, 24.0, 0.82, 0.75, back_bg);
        gradient_cloud(dc, x, y, w, &stops);
    }
    let main_opacity = if dark && state == 0 { 0.5 } else { 1.0 };
    let (x, y, w, stops, bg) = cloud(62.0, 50.0, 1.3, main_opacity, main_bg);
    // feDropShadow(0, 6, blur 6, #1b4f86 at 22%), without the blur.
    solid_cloud(
        dc,
        x,
        y + 5.0 * k,
        w,
        blend(
            rgb(if dark { 0x000000 } else { 0x1b4f86 }),
            bg,
            0.12 * main_opacity,
        ),
    );
    gradient_cloud(dc, x, y, w, &stops);
    if state == 2 {
        let color = blend(rgb(if dark { 0x8ea3c7 } else { 0xd7ebff }), rain_bg, 0.9);
        let pen = CreatePen(PS_SOLID, (3.0 * k).round().max(1.0) as i32, color);
        let old = SelectObject(dc, pen.into());
        for x in [112.0, 134.0, 156.0, 178.0] {
            let _ = MoveToEx(dc, px(x).round() as i32, py(136.0).round() as i32, None);
            let _ = LineTo(dc, px(x - 6.0).round() as i32, py(148.0).round() as i32);
        }
        SelectObject(dc, old);
        let _ = DeleteObject(pen.into());
    }
}
pub unsafe fn static_text(
    item: &DRAWITEMSTRUCT,
    look: Look,
    dark: bool,
    fonts: &[isize],
    dpi: u32,
    badges: &[(String, Badge)],
    bd: &Backdrop,
) {
    let dc = item.hDC;
    let r = item.rcItem;
    match look.shape {
        Shape::Hidden => return,
        Shape::Pills => {
            pills(dc, badges, r.left, r.top, dark, fonts, dpi, bd);
            return;
        }
        Shape::Dot(ink) => {
            let c = ink.color(dark);
            rounded(dc, r, r.bottom - r.top, c, c);
            return;
        }
        Shape::Glyph(kind, ink) => {
            glyph(dc, r, kind, ink.color(dark));
            return;
        }
        Shape::Weather(state) => {
            weather(dc, r, state, dark, bd);
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
        Shape::Mark => {
            // `.about-mark`: radius 16, `--sky-clear` at 160°, white (night: moon gold) glyph.
            let saved = clip_round(dc, r, scale(32, dpi));
            let s = sky_stops(0, dark);
            linear(dc, r, &[(0.0, s[0]), (0.6, s[1]), (1.0, s[2])], 160.0);
            let _ = RestoreDC(dc, saved);
            let size = scale(34, dpi);
            icon(
                dc,
                1,
                r.left + (r.right - r.left - size) / 2,
                r.top + (r.bottom - r.top - size) / 2,
                size,
                rgb(if dark { 0xf0d98a } else { 0xffffff }),
            );
            return;
        }
        Shape::Brand => {
            let p = Palette::new(dark);
            let size = scale(26, dpi);
            icon(
                dc,
                1,
                r.left,
                r.top + (r.bottom - r.top - size) / 2,
                size,
                p.rail_text,
            );
            let text = String::from_utf16_lossy(&window_text(item.hwndItem));
            draw(
                dc,
                &text,
                RECT {
                    left: r.left + size + scale(10, dpi),
                    ..r
                },
                fonts[Font::Brand as usize],
                p.rail_text,
                DT_SINGLELINE | DT_VCENTER | DT_LEFT,
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
        if text.is_empty() {
            return;
        }
        let (fill, fg) = badge_paint(r, badge, dark, bd);
        rounded(dc, r, scale(12, dpi), fill, fill);
        draw(
            dc,
            &text,
            r,
            font,
            fg,
            DT_SINGLELINE | DT_VCENTER | DT_CENTER,
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
    let d9 = scale(18, dpi);
    let normal = (if pressed { p.surface2 } else { p.card }, p.border, p.text);
    let (fill, border, color, font, diameter) = match kind {
        Btn::Nav => {
            let fill = if active {
                if dark {
                    mix(0xf0d98a, behind, 12)
                } else {
                    blend(WHITE, behind, 0.2)
                }
            } else if pressed {
                blend(WHITE, behind, 0.1)
            } else {
                behind
            };
            let color = match (active, dark) {
                (true, true) => p.primary,
                (true, false) => p.rail_text,
                _ => p.rail_text2(dark, behind),
            };
            (fill, fill, color, Font::Strong, scale(20, dpi))
        }
        Btn::Primary => (p.primary, p.primary, p.on_accent, Font::Strong, d9),
        Btn::Danger => (normal.0, p.border, p.bad, Font::Strong, d9),
        Btn::Choice(selected) => {
            if selected {
                (p.accent_soft, p.primary, p.primary, Font::Strong, d9)
            } else {
                (normal.0, p.border, p.text, Font::Normal, d9)
            }
        }
        // `.seg button`: the selected level is raised on the segmented track.
        Btn::Pill(selected) => {
            if selected {
                (
                    if dark { p.border } else { p.card },
                    if dark {
                        p.border
                    } else {
                        mix(0x000000, p.card, 10)
                    },
                    p.text,
                    Font::Strong,
                    scale(14, dpi),
                )
            } else {
                (
                    p.surface2,
                    p.surface2,
                    p.secondary,
                    Font::Strong,
                    scale(14, dpi),
                )
            }
        }
        Btn::Auto(on) => (
            normal.0,
            p.border,
            if on { p.ok } else { p.secondary },
            Font::Strong,
            d9,
        ),
        Btn::OnSky => {
            if dark {
                (p.primary, p.primary, p.on_accent, Font::Strong, d9)
            } else {
                let fill = blend(WHITE, behind, 0.95);
                (fill, fill, rgb(0x12406f), Font::Strong, d9)
            }
        }
        Btn::GhostSky => (
            if pressed {
                blend(WHITE, behind, 0.12)
            } else {
                behind
            },
            blend(WHITE, behind, 0.55),
            WHITE,
            Font::Strong,
            d9,
        ),
        _ => (normal.0, normal.1, normal.2, Font::Strong, d9),
    };
    let fade = |c: COLORREF| if disabled { blend(c, behind, 0.55) } else { c };
    let (fill, border, color) = (fade(fill), fade(border), fade(color));
    if kind == Btn::Nav && fill == behind {
        // Inactive rail items are transparent; the rail gradient is already painted.
    } else if kind == Btn::GhostSky && !pressed {
        outline(dc, rect, diameter, border, 1);
    } else {
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
                color,
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
        Btn::Refresh => {
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
            fonts[Font::Strong as usize],
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
                fade(p.secondary),
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
        let focus = RECT {
            left: rect.left + 3,
            top: rect.top + 3,
            right: rect.right - 3,
            bottom: rect.bottom - 3,
        };
        let _ = DrawFocusRect(dc, &focus);
    }
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
/// The 200×90 design is drawn at this scale (88×40 at 96 DPI).
const TOGGLE_SCALE: f64 = 0.44;
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
/// Color and alpha at `t` along gradient stops, padded at both ends like Cairo.
fn ramp(stops: &[(f64, Rgb, f64)], t: f64) -> (Rgb, f64) {
    let t = t.clamp(0.0, 1.0);
    for pair in stops.windows(2) {
        let ((a, ca, aa), (b, cb, ab)) = (pair[0], pair[1]);
        if t <= b {
            let f = if b > a { (t - a) / (b - a) } else { 1.0 };
            let lerp = |x: f64, y: f64| x + (y - x) * f;
            return (
                [lerp(ca[0], cb[0]), lerp(ca[1], cb[1]), lerp(ca[2], cb[2])],
                lerp(aa, ab),
            );
        }
    }
    let (_, c, a) = stops[stops.len() - 1];
    (c, a)
}
/// A horizontal pill in device pixels, described by its distance field.
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
        Pill {
            x0: x + r,
            x1: x + w - r,
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
}
/// Antialiased coverage of a filled circle at a pixel center.
fn disc_cover(x: f64, y: f64, (cx, cy, r): (f64, f64, f64)) -> f64 {
    (r - (x - cx).hypot(y - cy) + 0.5).clamp(0.0, 1.0)
}
/// Software compositing over a 32-bit DIB: GDI has no alpha blending for shapes, so the
/// switch is rasterized here with antialiased coverage and true translucency.
struct Canvas<'a> {
    pixels: &'a mut [u32],
    width: i32,
    height: i32,
    clip: Option<Pill>,
}
impl Canvas<'_> {
    /// Blends `paint` over the pixels inside `bounds`, weighted by `cover` and the clip.
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
                let mut weight = cover(x, y);
                if let Some(clip) = self.clip {
                    weight *= (0.5 - clip.distance(x, y)).clamp(0.0, 1.0);
                }
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
    fn pill(&mut self, pill: Pill, paint: impl Fn(f64, f64) -> (Rgb, f64)) {
        self.shape(
            pill.bounds(1.0),
            |x, y| (0.5 - pill.distance(x, y)).clamp(0.0, 1.0),
            paint,
        );
    }
}
/// Paints the day/night switch after Elsht666 「按钮-全月」 and JamesnetGroup/themeswitch, as
/// `draw_toggle` in linux.rs and `design/toggle-lab.html`: the knob is the sun by day and the
/// full moon by night, ringed by three halos; clouds part to both sides as stars rise.
fn toggle_scene(canvas: &mut Canvas, dpi: u32, t: &Toggle) {
    use std::f64::consts::TAU;
    let unit = dpi as f64 / 96.0;
    let s = TOGGLE_SCALE * unit * (1.0 + 0.07 * t.lift);
    let (ox, oy) = (
        canvas.width as f64 / 2.0,
        canvas.height as f64 / 2.0 - 2.0 * unit,
    );
    // Design space (200×90) to device pixels.
    let p = |x: f64, y: f64| (ox + (x - 100.0) * s, oy + (y - 45.0) * s);
    let pill = |x: f64, y: f64, w: f64, h: f64| {
        let (px, py) = p(x, y);
        Pill::new(px, py, w * s, h * s)
    };
    let k = t.progress.clamp(0.0, 1.0);
    let day = 1.0 - k;
    let slide = ease_in_out(k);
    let white = [1.0, 1.0, 1.0];
    // Soft drop shadow from stacked translucent pills.
    let shadow = hex_mix(0x2a68ad, 0x000000, k);
    for i in 0..5 {
        let grow = i as f64 * 4.0;
        let shape = pill(
            10.0 - grow / 2.0,
            12.0 - grow / 2.0,
            180.0 + grow,
            82.0 + grow,
        );
        canvas.pill(shape, |_, _| (shadow, (0.2 + 0.05 * k) / 6.0));
    }
    let frame = pill(0.0, 0.0, 200.0, 90.0);
    canvas.clip = Some(frame);
    // 135° background gradient.
    let (ax, ay) = p(27.5, -27.5);
    let (bx, by) = p(172.5, 117.5);
    let (gx, gy) = (bx - ax, by - ay);
    let length = gx * gx + gy * gy;
    let background = [
        (0.0, hex_mix(0x4a90d9, 0x070d1c, k), 1.0),
        (0.55, hex_mix(0x6fb0ee, 0x111a30, k), 1.0),
        (1.0, hex_mix(0x9bcbf5, 0x1c2a48, k), 1.0),
    ];
    canvas.shape(
        frame.bounds(1.0),
        |_, _| 1.0,
        |x, y| ramp(&background, ((x - ax) * gx + (y - ay) * gy) / length),
    );
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
            let (sx, sy) = p(14.0 + x * 1.7, 8.0 + y * 1.5 + 10.0 * day);
            canvas.solid_disc((sx, sy, r * s), white, alpha);
        }
    }
    let (cx, cy) = p(45.0 + 110.0 * t.position, 45.0);
    // Halo rings around the knob, breathing gently while the window is active.
    let breathe = 1.0 + t.motion * 0.04 * (1.0 - (TAU * t.clock / 3.0).cos()) / 2.0;
    for (grow, alpha) in [(44.0, 0.07), (29.0, 0.1), (15.0, 0.14)] {
        canvas.solid_disc(
            (cx, cy, (37.0 + grow) * breathe * s),
            white,
            alpha * (day + 0.45 * k),
        );
    }
    // Two cloud layers along the bottom; at night they part to both sides and fade.
    for (j, (x, y, alpha, away)) in CLOUDS.iter().enumerate() {
        let sway = t.motion * 3.0 * (TAU * (t.clock / 7.0 + j as f64 * 0.25)).sin();
        let (ox, oy) = ((x + 22.0 + away * slide) * 1.6 + sway, y * 1.6 + 4.0);
        let puffs = PUFFS.map(|(px, py)| {
            let (dx, dy) = p(ox + (px + 8.5) * PUFF_SCALE, oy + (py + 8.5) * PUFF_SCALE);
            (dx, dy, 8.5 * PUFF_SCALE * s)
        });
        canvas.discs(&puffs, white, alpha * (1.0 - 0.85 * k));
    }
    // Knob: the sun by day, the full moon by night; craters surface after 40% progress.
    let r = 37.0 * s;
    canvas.solid_disc(
        (cx, cy + 3.0 * s, r + 2.0 * s),
        [0.0, 0.0, 0.0],
        0.16 + 0.12 * k,
    );
    let glow_color = hex_mix(0xffc94d, 0xffebaa, k);
    let (inner, outer) = (r * 0.8, r + 14.0 * s);
    let glow = [
        (0.0, glow_color, (0.75 * breathe - 0.2 * k).clamp(0.0, 1.0)),
        (1.0, glow_color, 0.0),
    ];
    canvas.shape(
        (
            cx - outer - 1.0,
            cy - outer - 1.0,
            cx + outer + 1.0,
            cy + outer + 1.0,
        ),
        |x, y| disc_cover(x, y, (cx, cy, outer)),
        |x, y| ramp(&glow, ((x - cx).hypot(y - cy) - inner) / (outer - inner)),
    );
    let (fx, fy) = (cx - r * 0.3, cy - r * 0.32);
    let ball = [
        (0.0, hex_mix(0xfff1b8, 0xffffff, k), 1.0),
        (0.55, hex_mix(0xffc23d, 0xfff6d9, k), 1.0),
        (1.0, hex_mix(0xf59e0b, 0xe9d79a, k), 1.0),
    ];
    let knob = (cx - r - 1.0, cy - r - 1.0, cx + r + 1.0, cy + r + 1.0);
    canvas.shape(
        knob,
        |x, y| disc_cover(x, y, (cx, cy, r)),
        |x, y| ramp(&ball, (x - fx).hypot(y - fy) / (r * 1.75)),
    );
    let crater = ((k - 0.4) / 0.6).clamp(0.0, 1.0);
    if crater > 0.0 {
        let craters = [
            (-11.0, -10.0, 8.0),
            (12.0, 4.0, 6.0),
            (-5.0, 15.0, 4.5),
            (14.0, -15.0, 3.5),
        ]
        .map(|(dx, dy, radius)| (cx + dx * s, cy + dy * s, radius * s));
        canvas.discs(
            &craters,
            [214.0 / 255.0, 196.0 / 255.0, 140.0 / 255.0],
            0.5 * crater,
        );
    }
    let shine = [
        (0.0, white, 0.45),
        (0.12, white, 0.0),
        (0.85, [0.0, 0.0, 0.0], 0.0),
        (1.0, [0.0, 0.0, 0.0], 0.1),
    ];
    canvas.shape(
        knob,
        |x, y| disc_cover(x, y, (cx, cy, r)),
        |_, y| ramp(&shine, (y - (cy - r)) / (2.0 * r)),
    );
    canvas.clip = None;
    // 2px border, brighter while hovered.
    let alpha = (0.25 + 0.2 * t.lift) * day + (0.08 + 0.1 * t.lift) * k;
    let edge = pill(1.0, 1.0, 198.0, 88.0);
    let half = s;
    canvas.shape(
        edge.bounds(half + 1.0),
        |x, y| (half + 0.5 - edge.distance(x, y).abs()).clamp(0.0, 1.0),
        |_, _| (white, alpha),
    );
}
/// The day/night switch, centered in `bounds` (a 100×54 box at 96 DPI). The pixels already in
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
            clip: None,
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
        let s = TOGGLE_SCALE * dpi as f64 / 96.0;
        let (cx, cy) = (
            (bounds.left + bounds.right) as f64 / 2.0,
            (bounds.top + bounds.bottom) as f64 / 2.0 - 2.0 * dpi as f64 / 96.0,
        );
        let ring = RECT {
            left: (cx - 100.0 * s).round() as i32 - 3,
            top: (cy - 45.0 * s).round() as i32 - 3,
            right: (cx + 100.0 * s).round() as i32 + 3,
            bottom: (cy + 45.0 * s).round() as i32 + 3,
        };
        let _ = DrawFocusRect(dc, &ring);
    }
}
/// The face of a dropdown (`.input.dd-btn`): field, text and a chevron; `open` adds the accent
/// border, the 3px accent-soft ring and flips the chevron.
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
    let d9 = scale(18, dpi);
    if open {
        rounded(dc, r, d9 + 2 * ring, p.accent_soft, p.accent_soft);
    }
    let border = if open || focus { p.primary } else { p.border };
    rounded(dc, field, d9, p.card, border);
    let color = if disabled {
        blend(p.text, p.card, 0.55)
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
        if open { p.primary } else { p.secondary },
    );
}
/// One option in the dropdown list (`.dd-pop li`): hover fill, accent text and a check mark
/// for the chosen value.
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
    fill(dc, r, p.card);
    if item.itemState.0 & ODS_SELECTED.0 != 0 {
        let inset = scale(4, dpi);
        let hot = RECT {
            left: r.left + inset,
            top: r.top + 1,
            right: r.right - inset,
            bottom: r.bottom - 1,
        };
        rounded(dc, hot, scale(14, dpi), p.surface2, p.surface2);
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
            p.primary,
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
        if chosen { p.primary } else { p.text },
        DT_SINGLELINE | DT_VCENTER | DT_LEFT | DT_END_ELLIPSIS,
    );
}
