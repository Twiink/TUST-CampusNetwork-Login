//! GDI surfaces preserve the incumbent design without a browser or a GPU renderer.
use super::*;
use windows::Win32::{Graphics::Dwm::*, System::Registry::*};

#[derive(Clone, Copy)]
pub struct Palette {
    pub start: COLORREF,
    pub middle: COLORREF,
    pub end: COLORREF,
    pub card: COLORREF,
    pub sidebar: COLORREF,
    pub border: COLORREF,
    pub text: COLORREF,
    pub secondary: COLORREF,
    pub primary: COLORREF,
}
pub const fn rgb(value: u32) -> COLORREF {
    COLORREF(((value & 255) << 16) | (value & 0xff00) | ((value >> 16) & 255))
}
impl Palette {
    pub fn new(dark: bool) -> Self {
        if dark {
            Self {
                start: rgb(0x0f172a),
                middle: rgb(0x172236),
                end: rgb(0x1e293b),
                card: rgb(0x1c283b),
                sidebar: rgb(0x121d30),
                border: rgb(0x354053),
                text: rgb(0xf1f5f9),
                secondary: rgb(0xcbd5e1),
                primary: rgb(0x38bdf8),
            }
        } else {
            Self {
                start: rgb(0xf0f9ff),
                middle: rgb(0xe0f2fe),
                end: rgb(0xdbeafe),
                card: rgb(0xedf7fe),
                sidebar: rgb(0xeaf6ff),
                border: rgb(0xffffff),
                text: rgb(0x1e293b),
                secondary: rgb(0x64748b),
                primary: rgb(0x0284c7),
            }
        }
    }
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
pub unsafe fn titlebar(h: HWND, dark: bool) {
    let value = i32::from(dark);
    let _ = DwmSetWindowAttribute(
        h,
        DWMWA_USE_IMMERSIVE_DARK_MODE,
        (&value as *const i32).cast(),
        4,
    );
}
pub unsafe fn font(size: i32, weight: i32, dpi: u32) -> HFONT {
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
        w!("Microsoft YaHei UI"),
    )
}
pub fn scale(value: i32, dpi: u32) -> i32 {
    (value as i64 * dpi as i64 / 96) as i32
}
pub fn content_scale(width: i32, dpi: u32) -> f64 {
    ((width as f64 * 96.0 / dpi as f64 - 248.0) / 850.0).clamp(0.6, 1.0)
}
pub unsafe fn rounded(dc: HDC, r: RECT, radius: i32, fill: COLORREF, border: COLORREF) {
    let brush = CreateSolidBrush(fill);
    let pen = CreatePen(PS_SOLID, 1, border);
    let old_brush = SelectObject(dc, brush.into());
    let old_pen = SelectObject(dc, pen.into());
    let _ = RoundRect(dc, r.left, r.top, r.right, r.bottom, radius, radius);
    SelectObject(dc, old_pen);
    SelectObject(dc, old_brush);
    let _ = DeleteObject(pen.into());
    let _ = DeleteObject(brush.into());
}
pub unsafe fn background(dc: HDC, rect: RECT, p: Palette, dpi: u32, cards: &[RECT], scroll: i32) {
    let vertex = |x, y, c: COLORREF| TRIVERTEX {
        x,
        y,
        Red: ((c.0 & 255) << 8) as u16,
        Green: (c.0 & 0xff00) as u16,
        Blue: ((c.0 >> 8) & 0xff00) as u16,
        Alpha: 0xffff,
    };
    let vertices = [
        vertex(0, 0, p.start),
        vertex(rect.right, 0, p.middle),
        vertex(0, rect.bottom, p.middle),
        vertex(rect.right, rect.bottom, p.end),
    ];
    let triangles = [
        GRADIENT_TRIANGLE {
            Vertex1: 0,
            Vertex2: 1,
            Vertex3: 2,
        },
        GRADIENT_TRIANGLE {
            Vertex1: 1,
            Vertex2: 2,
            Vertex3: 3,
        },
    ];
    let _ = GradientFill(
        dc,
        &vertices,
        triangles.as_ptr().cast(),
        2,
        GRADIENT_FILL_TRIANGLE,
    );
    let brush = CreateSolidBrush(p.sidebar);
    FillRect(
        dc,
        &RECT {
            left: 0,
            top: 0,
            right: scale(194, dpi),
            bottom: rect.bottom,
        },
        brush,
    );
    let _ = DeleteObject(brush.into());
    let content_scale = content_scale(rect.right, dpi);
    for card in cards {
        let r = RECT {
            left: scale(224 + (card.left as f64 * content_scale) as i32, dpi),
            top: scale(card.top + 80 - scroll, dpi),
            right: scale(224 + (card.right as f64 * content_scale) as i32, dpi),
            bottom: scale(card.bottom + 80 - scroll, dpi),
        };
        rounded(dc, r, scale(48, dpi), p.card, p.border);
    }
}
pub unsafe fn icon(dc: HDC, id: u32, x: i32, y: i32, dpi: u32, color: COLORREF) {
    let pen = CreatePen(PS_SOLID, scale(2, dpi).max(1), color);
    let old_pen = SelectObject(dc, pen.into());
    let old_brush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    let at = |a: i32, b: i32| (x + scale(a, dpi), y + scale(b, dpi));
    let line = |a: i32, b: i32, c: i32, d: i32| {
        let (a, b) = at(a, b);
        let (c, d) = at(c, d);
        let _ = MoveToEx(dc, a, b, None);
        let _ = LineTo(dc, c, d);
    };
    let circle = |a: i32, b: i32, c: i32, d: i32| {
        let (a, b) = at(a, b);
        let (c, d) = at(c, d);
        let _ = Ellipse(dc, a, b, c, d);
    };
    match id {
        1 => {
            circle(1, 1, 19, 19);
            circle(6, 1, 14, 19);
            line(1, 10, 19, 10);
        }
        5 => {
            circle(3, 3, 17, 17);
            circle(7, 7, 13, 13);
            for (a, b, c, d) in [
                (10, 0, 10, 3),
                (10, 17, 10, 20),
                (0, 10, 3, 10),
                (17, 10, 20, 10),
                (2, 2, 4, 4),
                (16, 16, 18, 18),
                (2, 18, 4, 16),
                (16, 4, 18, 2),
            ] {
                line(a, b, c, d);
            }
        }
        4 => {
            line(3, 1, 13, 1);
            line(13, 1, 18, 6);
            line(18, 6, 18, 19);
            line(18, 19, 3, 19);
            line(3, 19, 3, 1);
            line(6, 10, 15, 10);
            line(6, 14, 15, 14);
        }
        _ => {
            circle(1, 1, 19, 19);
            line(10, 9, 10, 15);
            circle(9, 5, 11, 7);
        }
    }
    SelectObject(dc, old_brush);
    SelectObject(dc, old_pen);
    let _ = DeleteObject(pen.into());
}
pub unsafe fn button(item: &DRAWITEMSTRUCT, page: u16, dark: bool, font: HFONT, dpi: u32) {
    let p = Palette::new(dark);
    let id = item.CtlID;
    if id == 901 {
        let dc = item.hDC;
        let bounds = item.rcItem;
        let left = (bounds.right - bounds.left - scale(72, dpi)) / 2;
        let top = (bounds.bottom - bounds.top - scale(32, dpi)) / 2;
        let rect = RECT {
            left,
            top,
            right: left + scale(72, dpi),
            bottom: top + scale(32, dpi),
        };
        rounded(
            dc,
            rect,
            scale(32, dpi),
            rgb(if dark { 0x191e32 } else { 0x4685c0 }),
            p.border,
        );
        let old_pen = SelectObject(dc, GetStockObject(NULL_PEN));
        let circle = |x: i32, y: i32, r: i32, color: COLORREF| {
            let brush = CreateSolidBrush(color);
            let old = SelectObject(dc, brush.into());
            let _ = Ellipse(
                dc,
                left + scale(x - r, dpi),
                top + scale(y - r, dpi),
                left + scale(x + r, dpi),
                top + scale(y + r, dpi),
            );
            SelectObject(dc, old);
            let _ = DeleteObject(brush.into());
        };
        if dark {
            for (x, y) in [(12, 9), (22, 19), (30, 8)] {
                circle(x, y, 1, rgb(0xffffff));
            }
        } else {
            for (x, y, r) in [(55, 25, 7), (64, 23, 7), (43, 27, 5)] {
                circle(x, y, r, rgb(0xe0f2fe));
            }
        }
        circle(
            if dark { 56 } else { 16 },
            16,
            12,
            rgb(if dark { 0xc3c8d2 } else { 0xffc323 }),
        );
        if dark {
            for (x, y, r) in [(54, 12, 3), (60, 19, 2), (50, 20, 1)] {
                circle(x, y, r, rgb(0x96a0b4));
            }
        }
        SelectObject(dc, old_pen);
        if item.itemState.0 & ODS_FOCUS.0 != 0 {
            let _ = DrawFocusRect(dc, &bounds);
        }
        return;
    }
    let navigation = matches!(id, 1 | 4 | 5 | 6);
    let active = if id == 5 {
        matches!(page, 2 | 3 | 5 | 7 | 8 | 9)
    } else if id == 4 {
        matches!(page, 4 | 10)
    } else {
        page as u32 == id
    };
    let primary = matches!(id, 20 | 50 | 60);
    let fill = if primary {
        if dark { rgb(0x38bdf8) } else { rgb(0x0ea5e9) }
    } else if navigation && !active {
        p.sidebar
    } else {
        p.card
    };
    let rect = item.rcItem;
    rounded(
        item.hDC,
        rect,
        scale(if navigation { 32 } else { 24 }, dpi),
        fill,
        if navigation && !active {
            fill
        } else {
            p.border
        },
    );
    let old = SelectObject(item.hDC, font.into());
    let _ = SetBkMode(item.hDC, TRANSPARENT);
    let _ = SetTextColor(
        item.hDC,
        if primary {
            if dark { p.start } else { rgb(0xffffff) }
        } else if matches!(id, 21 | 32 | 45 | 75) {
            rgb(if dark { 0xfca5a5 } else { 0xb91c1c })
        } else if navigation && !active {
            p.secondary
        } else {
            p.primary
        },
    );
    let mut text = vec![0u16; (GetWindowTextLengthW(item.hwndItem) + 1).max(1) as usize];
    let length = GetWindowTextW(item.hwndItem, &mut text);
    text.truncate(length.max(0) as usize);
    let mut r = rect;
    if navigation {
        icon(
            item.hDC,
            id,
            r.left + scale(12, dpi),
            r.top + (r.bottom - r.top - scale(20, dpi)) / 2,
            dpi,
            if active { p.primary } else { p.secondary },
        );
        r.left += scale(42, dpi);
    }
    DrawTextW(
        item.hDC,
        &mut text,
        &mut r,
        DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | if navigation { DT_LEFT } else { DT_CENTER },
    );
    if item.itemState.0 & ODS_FOCUS.0 != 0 {
        let focus = RECT {
            left: rect.left + 4,
            top: rect.top + 4,
            right: rect.right - 4,
            bottom: rect.bottom - 4,
        };
        let _ = DrawFocusRect(item.hDC, &focus);
    }
    SelectObject(item.hDC, old);
}
