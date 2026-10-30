import AppKit

// Visual source of truth: design/netmate-sky.html with design/app.css (tokens, layout) and
// design/toggle.css (day/night toggle); porting rules in design/PORT-SPEC.md.
enum NetMateColors {
    static func hex(_ value: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                green: CGFloat((value >> 8) & 255) / 255,
                blue: CGFloat(value & 255) / 255, alpha: 1)
    }
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> NSColor {
        NSColor(name: nil) { appearance in hex(isDark(appearance) ? dark : light) }
    }
    /// A light/dark pair with separate opacities, e.g. `#e1eefb` / `rgba(240,217,138,.13)`.
    static func adaptive(_ light: UInt32, _ lightAlpha: CGFloat, _ dark: UInt32, _ darkAlpha: CGFloat) -> NSColor {
        NSColor(name: nil) { appearance in
            isDark(appearance) ? hex(dark).withAlphaComponent(darkAlpha) : hex(light).withAlphaComponent(lightAlpha)
        }
    }
    static func isDark(_ appearance: NSAppearance) -> Bool {
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
    }
    /// Linear blend of two sRGB hex colours (used by the toggle transition).
    static func mix(_ a: UInt32, _ b: UInt32, _ t: CGFloat, alpha: CGFloat = 1) -> NSColor {
        let t = max(0, min(1, t))
        func channel(_ shift: UInt32) -> CGFloat {
            let x = CGFloat((a >> shift) & 255), y = CGFloat((b >> shift) & 255)
            return (x + (y - x) * t) / 255
        }
        return NSColor(srgbRed: channel(16), green: channel(8), blue: channel(0), alpha: alpha)
    }

    // Tokens (app.css :root and .night).
    static let ground = adaptive(0xeaf3fc, 0x0a1222)
    static let surface = adaptive(0xffffff, 0x111c31)
    static let surface2 = adaptive(0xf2f7fc, 0x16233b)
    static let line = adaptive(0xd9e6f2, 0x22324d)
    static let text = adaptive(0x0f2a44, 0xe4ebf5)
    static let secondary = adaptive(0x4f6a84, 0x94a6bf)
    static let accent = adaptive(0x2370c0, 0xf0d98a)
    static let accentSoft = adaptive(0xe1eefb, 1, 0xf0d98a, 0.13)
    static let onAccent = adaptive(0xffffff, 0x1a1606)
    static let ok = adaptive(0x17865c, 0x5fd39f)
    static let okSoft = adaptive(0xe0f4ea, 1, 0x5fd39f, 0.12)
    static let warn = adaptive(0xa8650a, 0xf2b45a)
    static let warnSoft = adaptive(0xfbf0dc, 1, 0xf2b45a, 0.12)
    static let bad = adaptive(0xc93838, 0xff7b7b)
    static let badSoft = adaptive(0xfbe5e5, 1, 0xff7b7b, 0.12)
    static let railText = adaptive(0xffffff, 0xe4ebf5)
    static let railText2 = adaptive(0xffffff, 0.78, 0x94a6bf, 1)
    static let railActive = adaptive(0xffffff, 0.2, 0xf0d98a, 0.12)
    static let railHover = adaptive(0xffffff, 0.1, 0xffffff, 0.1)
    static let railActiveText = adaptive(0xffffff, 0xf0d98a)
    static let skyText = NSColor.white

    // Names the pages already use, mapped onto the tokens.
    static let caption = secondary
    static let label = secondary
    static let primary = accent
    static let heading = text
    static let success = ok
    static let danger = bad
    static let errorText = bad
    static let warningText = warn
    static let warningFill = warnSoft
    static let warningStroke = adaptive(0xa8650a, 0.3, 0xf2b45a, 0.3)
    static let rule = line
    static let cardFill = surface
    static let cardStroke = line
    static let rowFill = surface
    static let rowStroke = line
    static let fieldFill = surface
    static let fieldStroke = line
    static let metricFill = surface2
    static let mutedFill = surface2
    static let mutedTitle = secondary
    static let emptyStroke = line
    static let pillText = accent
    static let pillFill = accentSoft
    static let badgeText = secondary
    static let badgeFill = surface2
    static let authFill = accentSoft
    static let openText = ok
    static let openFill = okSoft
    static let currentText = onAccent
    static let selectedFill = accentSoft
    static let excellent = ok
    static let good = accent
    static let fair = warn
    static let poor = warn
    static let idle = secondary

    /// `.badge.ok` for the top priorities, the plain grey badge otherwise.
    static func priority(_ value: Int) -> (NSColor, NSColor) {
        value <= 3 ? (ok, okSoft) : (secondary, surface2)
    }
    /// Log level text colour (`.lvl.*`); the level is plain coloured text, so the fill is clear.
    static func level(_ level: String) -> (NSColor, NSColor) {
        switch level {
        case "info": return (accent, .clear)
        case "success": return (ok, .clear)
        case "warn": return (warn, .clear)
        case "error": return (bad, .clear)
        default: return (secondary, .clear)
        }
    }
    /// Sky panel gradient stops (160°) per weather and theme.
    static func sky(_ weather: String, dark: Bool) -> [UInt32] {
        switch (weather, dark) {
        case ("cloud", false): return [0x6b8fb6, 0x9db8d4, 0xc9d8e6]
        case ("storm", false): return [0x56606f, 0x7d8795, 0xa5adb8]
        case ("cloud", true): return [0x141b2c, 0x253149, 0x34415a]
        case ("storm", true): return [0x1d1416, 0x3a2427, 0x4b3033]
        case (_, true): return [0x070d1c, 0x111a30, 0x1f3156]
        default: return [0x3d84d0, 0x6fb0ee, 0xa9d3f7]
        }
    }
}

/// `CLOUD` from design/app.js (viewBox units, y down), drawn through `transform`.
func netMateCloud(_ transform: CGAffineTransform) -> NSBezierPath {
    let p = CGMutablePath()
    func deg(_ d: CGFloat) -> CGFloat { d * .pi / 180 }
    p.move(to: CGPoint(x: 28, y: 60))
    // The SVG arcs converted to centre form; the sweep flag 1 means increasing angles.
    p.addArc(center: CGPoint(x: 27.892, y: 42), radius: 18, startAngle: deg(89.655), endAngle: deg(263.968), clockwise: false)
    p.addArc(center: CGPoint(x: 51.756, y: 27.651), radius: 26, startAngle: deg(-172.151), endAngle: deg(-26.622), clockwise: false)
    p.addArc(center: CGPoint(x: 77.219, y: 35.876), radius: 20, startAngle: deg(-96.371), endAngle: deg(-20.11), clockwise: false)
    p.addArc(center: CGPoint(x: 91.167, y: 44.253), radius: 16, startAngle: deg(-72.42), endAngle: deg(79.803), clockwise: false)
    p.closeSubpath()
    var t = transform
    guard let moved = p.copy(using: &t) else { return NSBezierPath() }
    return NSBezierPath(cgPath: moved)
}

/// Fills `path` top to bottom with a gradient spanning its bounds (SVG `objectBoundingBox`).
/// The current context must be y-down (a flipped view).
func fillVertical(_ path: NSBezierPath, _ colors: [NSColor], _ locations: [CGFloat]) {
    guard let ctx = NSGraphicsContext.current?.cgContext else { return }
    ctx.saveGState()
    ctx.addPath(path.cgPath); ctx.clip()
    cssLinearGradient(ctx, path.bounds, angle: 180, colors, locations)
    ctx.restoreGState()
}

final class NetMateBackground: NSView {
    var onAppearanceChange: ((Bool) -> Void)?
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance(); needsDisplay = true
        onAppearanceChange?(NetMateColors.isDark(effectiveAppearance))
    }
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) { NetMateColors.ground.setFill(); dirtyRect.fill() }
}

/// `.rail`: vertical gradient with static day clouds or night stars (no animation).
final class NetMateSidebar: NSView {
    override var isFlipped: Bool { true }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let dark = NetMateColors.isDark(effectiveAppearance)
        let hex = NetMateColors.hex
        cssLinearGradient(ctx, bounds, angle: 180, [hex(dark ? 0x070d1c : 0x2a68ad), hex(dark ? 0x15213b : 0x4a90d9)], [0, 1])
        if dark {
            NSColor.white.withAlphaComponent(0.8).setFill()
            for i in 0..<14 {
                let x = bounds.width * CGFloat((i * 41) % 95) / 100, y = bounds.height * CGFloat((i * 29) % 70) / 100
                NSBezierPath(ovalIn: NSRect(x: x, y: y, width: 2, height: 2)).fill()
            }
            return
        }
        // .rc1: 138 wide, left -22, bottom 112; .rc2: 86 wide, right -16, bottom 196.
        for (width, x, bottom, alpha) in [(138.0, -22.0, 112.0, 0.3), (86.0, Double(bounds.width) - 86 + 16, 196.0, 0.22)] {
            let w = CGFloat(width), s = w / 120, h = 64 * s
            let origin = CGPoint(x: CGFloat(x), y: bounds.height - CGFloat(bottom) - h)
            let cloud = netMateCloud(CGAffineTransform(translationX: origin.x, y: origin.y).scaledBy(x: s, y: s))
            fillVertical(cloud, [NSColor.white.withAlphaComponent(CGFloat(alpha)), NSColor.white.withAlphaComponent(CGFloat(alpha) * 0.55)], [0, 1])
        }
    }
}

/// CSS `cubic-bezier(x1, y1, x2, y2)` evaluated at progress `x`; y may overshoot [0, 1].
func cubicBezier(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat, _ x: CGFloat) -> CGFloat {
    if x <= 0 { return 0 }
    if x >= 1 { return 1 }
    func curve(_ t: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat { 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t }
    var lo: CGFloat = 0, hi: CGFloat = 1
    for _ in 0..<24 {
        let mid = (lo + hi) / 2
        if curve(mid, x1, x2) < x { lo = mid } else { hi = mid }
    }
    return curve((lo + hi) / 2, y1, y2)
}

/// A rounded, optionally filled and stroked container around a padded stack.
class NetMateBox: NSView {
    let content = NSStackView()
    var fill: NSColor? { didSet { needsDisplay = true } }
    var stroke: NSColor? { didSet { needsDisplay = true } }
    var lineWidth: CGFloat = 1 { didSet { needsDisplay = true } }
    var dashed = false { didSet { needsDisplay = true } }
    /// Clamped to half the height, so a large value draws a pill.
    var radius: CGFloat = 14 { didSet { needsDisplay = true } }
    /// `topAligned` lets the box grow taller than its content (equal-height columns).
    init(_ orientation: NSUserInterfaceLayoutOrientation = .vertical,
         padding: NSEdgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0),
         spacing: CGFloat = 8, topAligned: Bool = false) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        content.orientation = orientation
        content.alignment = orientation == .vertical ? .leading : .centerY
        content.distribution = .fill
        content.spacing = spacing
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        let bottom = topAligned
            ? content.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -padding.bottom)
            : content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -padding.bottom)
        if topAligned {
            // Hugs the content unless a sibling forces it taller.
            let hug = content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -padding.bottom)
            hug.priority = .defaultLow; hug.isActive = true
        }
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: padding.left),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -padding.right),
            content.topAnchor.constraint(equalTo: topAnchor, constant: padding.top),
            bottom
        ])
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance(); needsDisplay = true
    }
    override func draw(_ dirtyRect: NSRect) {
        guard fill != nil || stroke != nil else { return }
        let inset = stroke == nil ? 0 : lineWidth / 2
        let rect = bounds.insetBy(dx: inset, dy: inset)
        let r = max(0, min(radius, rect.height / 2, rect.width / 2))
        let shape = NSBezierPath(roundedRect: rect, xRadius: r, yRadius: r)
        if let fill { fill.setFill(); shape.fill() }
        if let stroke {
            stroke.setStroke(); shape.lineWidth = lineWidth
            if dashed { shape.setLineDash([6, 4], count: 2, phase: 0) }
            shape.stroke()
        }
    }
}

/// `.panel`: surface fill, 1 px line border, 14 px radius. The CSS shadow is not drawn.
final class NetMateCard: NetMateBox {
    init(padding: NSEdgeInsets = NSEdgeInsets(top: 18, left: 20, bottom: 18, right: 20), topAligned: Bool = false) {
        super.init(.vertical, padding: padding, spacing: 12, topAligned: topAligned)
        fill = NetMateColors.cardFill; stroke = NetMateColors.cardStroke; radius = 14
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    /// Tinted border used by the recovery failure card.
    var tint: NSColor? { didSet { stroke = tint ?? NetMateColors.cardStroke } }
}

/// `.badge` (22 px high, 6 px radius) and the sky panel chips.
final class NetMateBadge: NetMateBox {
    let label = NSTextField(labelWithString: "")
    init(_ text: String, _ color: NSColor, _ background: NSColor, size: CGFloat = 12,
         padding: NSEdgeInsets = NSEdgeInsets(top: 3, left: 8, bottom: 3, right: 8), radius: CGFloat = 6) {
        super.init(.horizontal, padding: padding, spacing: 0)
        self.radius = radius
        label.font = .systemFont(ofSize: size, weight: .semibold)
        label.lineBreakMode = .byTruncatingTail
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        content.addArrangedSubview(label)
        set(text, color, background)
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    func set(_ text: String, _ color: NSColor, _ background: NSColor) {
        label.stringValue = text; label.textColor = color; fill = background
    }
    /// A fixed-width column badge with centred text (WiFi rows).
    func fixWidth(_ width: CGFloat) {
        label.alignment = .center
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        widthAnchor.constraint(equalToConstant: width).isActive = true
    }
}

/// A 1 px divider in the line colour.
final class NetMateRule: NSView {
    override var intrinsicContentSize: NSSize { NSSize(width: NSView.noIntrinsicMetric, height: 1) }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) { NetMateColors.rule.setFill(); bounds.fill() }
}

/// A rounded progress trough (the sky panel's `.sky-bar` uses white on translucent white).
final class NetMateProgress: NSView {
    var fraction: CGFloat = 0 { didSet { needsDisplay = true } }
    var color: NSColor = NetMateColors.accent { didSet { needsDisplay = true } }
    var trough: NSColor = NetMateColors.surface2 { didSet { needsDisplay = true } }
    var barHeight: CGFloat = 6 { didSet { invalidateIntrinsicContentSize() } }
    override var intrinsicContentSize: NSSize { NSSize(width: NSView.noIntrinsicMetric, height: barHeight) }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        trough.setFill()
        NSBezierPath(roundedRect: bounds, xRadius: bounds.height / 2, yRadius: bounds.height / 2).fill()
        let width = bounds.width * max(0, min(1, fraction))
        guard width > 0 else { return }
        color.setFill()
        NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: width, height: bounds.height), xRadius: bounds.height / 2, yRadius: bounds.height / 2).fill()
    }
}

/// The metric strip: one card whose arranged cells are separated by vertical lines.
final class NetMateStrip: NetMateBox {
    init() {
        super.init(.horizontal, spacing: 0)
        fill = NetMateColors.cardFill; stroke = NetMateColors.cardStroke; radius = 14
        content.distribution = .fillEqually; content.alignment = .top
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override func layout() { super.layout(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NetMateColors.line.setFill()
        for cell in content.arrangedSubviews.dropFirst() where !cell.isHidden {
            let x = convert(cell.frame.origin, from: content).x
            NSRect(x: round(x), y: 1, width: 1, height: bounds.height - 2).fill()
        }
    }
}

/// A list row with a top divider; the current row gets `accent-soft` and a 3 px accent bar.
final class NetMateListRow: NetMateBox {
    var divider = false { didSet { needsDisplay = true } }
    var current = false { didSet { fill = current ? NetMateColors.accentSoft : nil } }
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if divider { NetMateColors.line.setFill(); NSRect(x: 0, y: 0, width: bounds.width, height: 1).fill() }
        if current { NetMateColors.accent.setFill(); NSRect(x: 0, y: 0, width: 3, height: bounds.height).fill() }
    }
}

/// A clickable box (account choice in the WiFi form) exposed to accessibility as a button.
final class NetMateTile: NetMateBox {
    var onPress: (() -> Void)?
    var enabled = true { didSet { updateLook() } }
    var selected = false { didSet { updateLook() } }
    init() {
        super.init(.vertical, padding: NSEdgeInsets(top: 12, left: 14, bottom: 12, right: 14), spacing: 6)
        radius = 9; lineWidth = 1
        setAccessibilityElement(true); setAccessibilityRole(.button)
        updateLook()
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    private func updateLook() {
        fill = selected ? NetMateColors.selectedFill : NetMateColors.rowFill
        stroke = selected ? NetMateColors.accent : NetMateColors.rowStroke
        alphaValue = enabled || selected ? 1 : 0.6
        setAccessibilityEnabled(enabled)
    }
    override func hitTest(_ point: NSPoint) -> NSView? { super.hitTest(point) == nil ? nil : self }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {
        if enabled, bounds.contains(convert(event.locationInWindow, from: nil)) { onPress?() }
    }
    override func accessibilityPerformPress() -> Bool {
        guard enabled else { return false }
        onPress?(); return true
    }
}

/// One row of the log list: time, level, source and the message on a second line.
final class NetMateLogCell: NSTableCellView {
    static let reuse = NSUserInterfaceItemIdentifier("log-row")
    let time = NSTextField(labelWithString: "")
    let level = NetMateBadge("", NetMateColors.badgeText, .clear, padding: NSEdgeInsets(top: 1, left: 0, bottom: 1, right: 0))
    let source = NSTextField(labelWithString: "")
    let message = NSTextField(labelWithString: "")
    init() {
        super.init(frame: .zero)
        identifier = Self.reuse
        for field in [time, source] {
            field.font = .monospacedSystemFont(ofSize: 12.5, weight: .regular); field.textColor = NetMateColors.caption
        }
        level.label.font = .systemFont(ofSize: 12, weight: .bold)
        message.font = .systemFont(ofSize: 13.5); message.textColor = NetMateColors.text
        message.lineBreakMode = .byTruncatingTail
        message.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        source.lineBreakMode = .byTruncatingTail
        source.setContentCompressionResistancePriority(.init(2), for: .horizontal)
        let meta = NSStackView(views: [time, level, source]); meta.orientation = .horizontal; meta.spacing = 12; meta.alignment = .centerY
        let stack = NSStackView(views: [meta, message]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 4
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -16),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            message.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -16)
        ])
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
}

/// Fills `rect` with a CSS `linear-gradient(<angle>deg, …)` in a y-down context.
func cssLinearGradient(_ ctx: CGContext, _ rect: CGRect, angle: CGFloat, _ colors: [NSColor], _ locations: [CGFloat]) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let gradient = CGGradient(colorsSpace: space, colors: colors.map { $0.cgColor } as CFArray, locations: locations) else { return }
    let a = angle * .pi / 180
    let dir = CGPoint(x: sin(a), y: -cos(a))
    let half = (abs(rect.width * sin(a)) + abs(rect.height * cos(a))) / 2
    let c = CGPoint(x: rect.midX, y: rect.midY)
    ctx.drawLinearGradient(gradient, start: CGPoint(x: c.x - dir.x * half, y: c.y - dir.y * half),
                           end: CGPoint(x: c.x + dir.x * half, y: c.y + dir.y * half),
                           options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
}
/// A radial gradient disc, `focus` given as a fraction of the disc's box (CSS `circle at x% y%`).
func radialDisc(_ ctx: CGContext, center: CGPoint, radius: CGFloat, focus: CGPoint = CGPoint(x: 0.5, y: 0.5),
                _ colors: [NSColor], _ locations: [CGFloat]) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let gradient = CGGradient(colorsSpace: space, colors: colors.map { $0.cgColor } as CFArray, locations: locations) else { return }
    let start = CGPoint(x: center.x - radius + 2 * radius * focus.x, y: center.y - radius + 2 * radius * focus.y)
    // CSS `circle at x% y%` defaults to `farthest-corner` of the disc's box.
    let reach = radius * 2 * hypot(max(focus.x, 1 - focus.x), max(focus.y, 1 - focus.y))
    ctx.saveGState()
    ctx.addEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)); ctx.clip()
    ctx.drawRadialGradient(gradient, startCenter: start, startRadius: 0, endCenter: start, endRadius: reach, options: [.drawsAfterEndLocation])
    ctx.restoreGState()
}
/// A soft glow (CSS box-shadow with blur) around a disc.
func glow(_ ctx: CGContext, center: CGPoint, radius: CGFloat, blur: CGFloat, _ color: NSColor) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let clear = color.withAlphaComponent(0)
    guard let gradient = CGGradient(colorsSpace: space, colors: [color.cgColor, color.cgColor, clear.cgColor] as CFArray,
                                    locations: [0, radius / (radius + blur), 1]) else { return }
    ctx.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius + blur, options: [])
}

enum NetMateButtonStyle { case normal, onSky, ghostSky }

/// Remains an NSButton for keyboard control, focus and accessibility.
final class NetMateButton: NSButton {
    var navigation = false
    /// Selected navigation item, or the checked state of a choice/chip button.
    var selectedPage = false { didSet { needsDisplay = true } }
    var symbol: String?
    var primary = false
    var destructive = false
    /// `button.choice` and the log level segment (`.seg button`).
    var choice = false
    var chip = false
    var compact = false
    var look = NetMateButtonStyle.normal { didSet { needsDisplay = true } }
    /// Icon colour override (`auto-on` / `auto-off`).
    var tint: NSColor?
    private var hovered = false
    private var small: Bool { compact || chip }
    private var drawFont: NSFont {
        if navigation { return .systemFont(ofSize: 14, weight: .semibold) }
        return .systemFont(ofSize: chip ? 12.5 : 13.5, weight: .semibold)
    }
    override var intrinsicContentSize: NSSize {
        if navigation { return NSSize(width: 172, height: 42) }
        if title.isEmpty { return NSSize(width: 36, height: 36) }
        let text = (title as NSString).size(withAttributes: [.font: drawFont])
        let padding: CGFloat = chip ? 22 : (small ? 24 : 32)
        return NSSize(width: ceil(text.width) + padding + (symbol == nil ? 0 : 23), height: chip ? 28 : (small ? 32 : 36))
    }
    private var hoverArea: NSTrackingArea?
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverArea { removeTrackingArea(hoverArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); hoverArea = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        let dark = NetMateColors.isDark(effectiveAppearance)
        let c = NetMateColors.self
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current?.cgContext.setAlpha(isEnabled ? 1 : 0.55)
        let r: CGFloat = navigation ? 10 : (chip ? 7 : 9)
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: r, yRadius: r)
        var fill: NSColor?
        var stroke: NSColor?
        var color: NSColor
        let active = hovered && isEnabled
        if navigation {
            color = selectedPage ? c.railActiveText : (active ? c.railText : c.railText2)
            if selectedPage { fill = c.railActive } else if active || isHighlighted { fill = c.railHover }
        } else if look == .onSky {
            fill = dark ? c.hex(0xf0d98a) : NSColor.white.withAlphaComponent(0.95)
            color = dark ? c.hex(0x1a1606) : c.hex(0x12406f)
        } else if look == .ghostSky {
            stroke = NSColor.white.withAlphaComponent(active ? 0.8 : 0.55); color = .white
            if active { fill = NSColor.white.withAlphaComponent(0.1) }
        } else if primary {
            fill = c.accent; stroke = c.accent; color = c.onAccent
        } else if chip {
            // `.seg button`: the selected segment is a raised surface, others are bare text.
            if selectedPage { fill = dark ? c.line : c.surface } else if active { fill = c.surface.withAlphaComponent(0.5) }
            color = selectedPage ? c.text : c.secondary
        } else if choice && selectedPage {
            fill = c.accentSoft; stroke = c.accent; color = c.accent
        } else {
            fill = active ? c.surface2 : c.surface; stroke = c.line
            color = destructive ? c.bad : c.text
        }
        if let tint { color = tint }
        if let fill { fill.setFill(); path.fill() }
        if let stroke { stroke.setStroke(); path.lineWidth = 1; path.stroke() }
        if primary && active { NSColor.white.withAlphaComponent(0.06).setFill(); path.fill() }
        if isHighlighted && !navigation { NSColor.black.withAlphaComponent(0.06).setFill(); path.fill() }
        var textRect = bounds.insetBy(dx: navigation ? 12 : 10, dy: 0)
        if let symbol, let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: navigation ? 15 : 14, weight: .semibold)
                .applying(NSImage.SymbolConfiguration(paletteColors: [color]))) {
            let side: CGFloat = navigation ? 19 : 17
            let fitted = image.size.width > 0 ? NSSize(width: side, height: side * image.size.height / image.size.width) : NSSize(width: side, height: side)
            if title.isEmpty {
                image.draw(in: NSRect(x: (bounds.width - fitted.width) / 2, y: (bounds.height - fitted.height) / 2, width: fitted.width, height: fitted.height))
            } else {
                let x: CGFloat = navigation ? 12 : 14
                image.draw(in: NSRect(x: x, y: (bounds.height - fitted.height) / 2, width: fitted.width, height: fitted.height))
                let start = x + side + (navigation ? 12 : 6)
                textRect.origin.x = start; textRect.size.width = bounds.width - start - 10
            }
        }
        if !title.isEmpty {
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = navigation || symbol != nil ? .left : .center; paragraph.lineBreakMode = .byTruncatingTail
            let size = (title as NSString).size(withAttributes: [.font: drawFont])
            textRect.origin.y = (bounds.height - size.height) / 2; textRect.size.height = size.height
            (title as NSString).draw(in: textRect, withAttributes: [.font: drawFont, .foregroundColor: color, .paragraphStyle: paragraph])
        }
        if window?.firstResponder === self {
            (navigation ? NSColor.white : NSColor.keyboardFocusIndicatorColor).setStroke(); path.lineWidth = 2; path.stroke()
        }
    }
}

/// The day/night toggle after Elsht666「按钮-全月」and JamesnetGroup/themeswitch, mirrored from
/// `draw_toggle` in apps/native-ui/src/linux.rs and design/toggle-lab.html. Drawn in a 200×90 design
/// space at 0.44 scale: the knob is the sun by day and a full moon by night, ringed by halos; clouds
/// part to both sides as stars rise. It stays an NSButton whose title is the accessible name.
/// The frame timer runs only while switching, easing hover, or while the window is key, visible
/// and unoccluded (ambient halo breathing, cloud sway and star twinkle); otherwise it stops.
final class DayNightButton: NSButton {
    static let scale: CGFloat = 0.44
    static let switchDuration: TimeInterval = 0.55
    static let liftDuration: TimeInterval = 0.2
    /// themeswitch's cloud cell: nine 17 px circles in a 60×30 grid (left, top of each circle).
    static let puffs: [(CGFloat, CGFloat)] = [(26, 1), (38, 1), (10, 12), (23, 12), (32, 13), (43, 8), (16, 3), (5, 2), (0, 8)]
    /// Cloud cells along the bottom: (x, y) in themeswitch's 120×50 space, opacity, and how far x
    /// moves at night (the clouds part to both sides).
    static let clouds: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [(-10, 20, 0.55, -60), (65, 20, 0.55, 70), (0, 30, 1, -60), (55, 30, 1, 70)]
    /// themeswitch's galaxy cell (80×50); bright stars twinkle, faint ones hold still.
    static let stars: [(CGFloat, CGFloat, Bool)] = [
        (40, 21, true), (48, 6, false), (68, 30, true), (4, 24, false), (8, 28, false), (21, 6, true),
        (51, 27, false), (28, 39, false), (67, 8, false), (26, 14, false), (63, 20, false), (16, 35, false),
        (60, 35, false), (36, 6, true), (56, 12, true), (43, 37, true), (23, 27, true), (12, 12, true)
    ]
    /// Scale of a cloud puff relative to themeswitch's 17 px circle.
    static let puffScale: CGFloat = 1.3

    var dark = false {
        didSet {
            title = dark ? "切换至白天模式" : "切换至黑夜模式"
            setAccessibilityLabel(title); toolTip = title
            guard dark != oldValue else { return }
            let next: CGFloat = dark ? 1 : 0
            if window?.isVisible != true || reduceMotion {
                position = next; progress = next; goal = next; transitionStart = nil
                needsDisplay = true; updateClock(); return
            }
            from = (position, progress); goal = next; transitionStart = now
            updateClock()
        }
    }
    /// Knob position, 0 = day (left) … 1 = night (right); overshoots during the switch.
    private var position: CGFloat = 0
    /// Colour and opacity blend between the day and night scenes.
    private var progress: CGFloat = 0
    private var from: (CGFloat, CGFloat) = (0, 0)
    /// Scene the switch is heading to (0 day, 1 night). Not `target`, which NSControl owns.
    private var goal: CGFloat = 0
    private var transitionStart: TimeInterval?
    private var hovered = false
    /// Hover emphasis 0…1 (scale 1.07, brighter border).
    private var lift: CGFloat = 0
    /// The window is key, shown and unoccluded: clouds sway, the halo breathes and stars twinkle.
    private var ambient = false
    /// Strength of the ambient motion 0…1; eases in and out so pausing never jumps.
    private var motion: CGFloat = 0
    /// Seconds of drift and twinkle accumulated while `motion` > 0.
    private var clock: TimeInterval = 0
    private var lastFrame: TimeInterval = 0
    private var timer: Timer?
    private var observers: [NSObjectProtocol] = []
    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }
    private var reduceMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    override var intrinsicContentSize: NSSize { NSSize(width: 100, height: 54) }
    override var isFlipped: Bool { true }

    private var hoverArea: NSTrackingArea?
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverArea { removeTrackingArea(hoverArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); hoverArea = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; updateClock() }
    override func mouseExited(with event: NSEvent) { hovered = false; updateClock() }
    override func viewWillMove(toWindow newWindow: NSWindow?) {
        super.viewWillMove(toWindow: newWindow)
        removeObservers()
    }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { ambient = false; timer?.invalidate(); timer = nil; return }
        let center = NotificationCenter.default
        let names: [Notification.Name] = [NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification,
                                          NSWindow.didBecomeMainNotification, NSWindow.didResignMainNotification,
                                          NSWindow.didMiniaturizeNotification, NSWindow.didDeminiaturizeNotification,
                                          NSWindow.didChangeOcclusionStateNotification, NSWindow.willCloseNotification]
        for name in names {
            observers.append(center.addObserver(forName: name, object: window, queue: .main) { [weak self] note in
                self?.refreshAmbient(closing: note.name == NSWindow.willCloseNotification)
            })
        }
        for name in [NSApplication.didHideNotification, NSApplication.didUnhideNotification] {
            observers.append(center.addObserver(forName: name, object: NSApp, queue: .main) { [weak self] _ in self?.refreshAmbient() })
        }
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshAmbient() })
        refreshAmbient()
    }
    private func removeObservers() {
        observers.forEach { NotificationCenter.default.removeObserver($0); NSWorkspace.shared.notificationCenter.removeObserver($0) }
        observers = []
    }
    override func becomeFirstResponder() -> Bool { needsDisplay = true; return super.becomeFirstResponder() }
    override func resignFirstResponder() -> Bool { needsDisplay = true; return super.resignFirstResponder() }

    /// Ambient motion only while the window is key (or main), shown, not minimised and not occluded.
    private func refreshAmbient(closing: Bool = false) {
        guard let window else { ambient = false; updateClock(); return }
        ambient = !closing && (window.isKeyWindow || window.isMainWindow) && window.isVisible && !window.isMiniaturized
            && window.occlusionState.contains(.visible) && !NSApp.isHidden
        // The hover tracking area only reports while key, so drop a hover left over from before.
        if !ambient { hovered = false }
        updateClock()
    }

    /// Starts the frame timer when something moves and stops it as soon as nothing does.
    private func updateClock() {
        if reduceMotion {
            position = goal; progress = goal; transitionStart = nil
            lift = hovered ? 1 : 0; motion = 0
            timer?.invalidate(); timer = nil; needsDisplay = true; return
        }
        if timer == nil && isMoving {
            lastFrame = now
            let t = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in self?.advance() }
            RunLoop.main.add(t, forMode: .common)
            timer = t
        }
        needsDisplay = true
    }
    private var lively: Bool { (hovered || ambient) && window != nil }
    private var isMoving: Bool {
        transitionStart != nil || progress != goal || position != goal
            || lift != (hovered ? 1 : 0) || motion != (lively ? 1 : 0) || lively
    }
    private func advance() {
        let t = now, dt = max(0, min(0.1, t - lastFrame))
        lastFrame = t
        if transitionStart != nil || progress != goal || position != goal {
            let start = transitionStart ?? t
            transitionStart = start
            let k = CGFloat(min(1, max(0, (t - start) / Self.switchDuration)))
            position = from.0 + (goal - from.0) * cubicBezier(0.68, -0.1, 0.265, 1.2, k)
            progress = from.1 + (goal - from.1) * cubicBezier(0.25, 0.1, 0.25, 1, k)
            if k >= 1 { position = goal; progress = goal; transitionStart = nil }
        }
        let step = CGFloat(dt / Self.liftDuration)
        let liftTarget: CGFloat = hovered ? 1 : 0
        lift = lift < liftTarget ? min(liftTarget, lift + step) : max(liftTarget, lift - step)
        let motionTarget: CGFloat = lively ? 1 : 0
        motion = motion < motionTarget ? min(motionTarget, motion + step) : max(motionTarget, motion - step)
        if motion > 0 { clock += dt }
        needsDisplay = true
        if !isMoving { timer?.invalidate(); timer = nil }
    }

    /// CubicEase EaseInOut, which themeswitch uses for every move.
    private static func easeInOut(_ t: CGFloat) -> CGFloat {
        t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        func mix(_ a: UInt32, _ b: UInt32, _ t: CGFloat, _ alpha: CGFloat = 1) -> CGColor { NetMateColors.mix(a, b, t, alpha: alpha).cgColor }
        func white(_ alpha: CGFloat) -> CGColor { NSColor(white: 1, alpha: max(0, min(1, alpha))).cgColor }
        func gradient(_ stops: [(CGFloat, CGColor)]) -> CGGradient? {
            CGGradient(colorsSpace: space, colors: stops.map { $0.1 } as CFArray, locations: stops.map { $0.0 })
        }
        func disc(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) { ctx.addEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)) }
        func pill(_ rect: CGRect) -> CGPath {
            let r = min(rect.width, rect.height) / 2
            return CGPath(roundedRect: rect, cornerWidth: r, cornerHeight: r, transform: nil)
        }
        let tau = CGFloat.pi * 2
        let k = max(0, min(1, progress)), day = 1 - k, slide = Self.easeInOut(k)
        let clock = CGFloat(self.clock)
        let scale = Self.scale * (1 + 0.07 * lift)
        ctx.saveGState()
        // The view is flipped, so the y-down design space maps directly.
        ctx.translateBy(x: bounds.midX, y: bounds.midY - 2)
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: -100, y: -45)

        // Soft drop shadow from stacked translucent pills.
        for i in 0..<5 {
            let grow = CGFloat(i) * 4
            ctx.addPath(pill(CGRect(x: 10 - grow / 2, y: 12 - grow / 2, width: 180 + grow, height: 82 + grow)))
            ctx.setFillColor(mix(0x2a68ad, 0x000000, k, (0.2 + 0.05 * k) / 6)); ctx.fillPath()
        }
        ctx.saveGState()
        ctx.addPath(pill(CGRect(x: 0, y: 0, width: 200, height: 90))); ctx.clip()
        if let g = gradient([(0, mix(0x4a90d9, 0x070d1c, k)), (0.55, mix(0x6fb0ee, 0x111a30, k)), (1, mix(0x9bcbf5, 0x1c2a48, k))]) {
            ctx.drawLinearGradient(g, start: CGPoint(x: 27.5, y: -27.5), end: CGPoint(x: 172.5, y: 117.5),
                                   options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        // Stars rise into place as night falls; bright ones twinkle while the window is active.
        if k > 0 {
            for (i, star) in Self.stars.enumerated() {
                let (x, y, bright) = star
                let twinkle = bright ? motion * (1 - cos(tau * (clock - CGFloat(i) * 0.37) / 2.2)) / 2 : 0
                let alpha = bright ? k * (1 - 0.6 * twinkle) : k * 0.45
                let r = (bright ? 1.9 : 1.3) * (1 + 0.5 * twinkle)
                ctx.setFillColor(white(alpha)); disc(14 + x * 1.7, 8 + y * 1.5 + 10 * day, r); ctx.fillPath()
            }
        }
        let cx = 45 + 110 * position, cy: CGFloat = 45
        // Halo rings around the knob, breathing gently while the window is active.
        let breathe = 1 + motion * 0.04 * (1 - cos(tau * clock / 3)) / 2
        for (grow, alpha) in [(CGFloat(44), CGFloat(0.07)), (29, 0.1), (15, 0.14)] {
            ctx.setFillColor(white(alpha * (day + 0.45 * k))); disc(cx, cy, (37 + grow) * breathe); ctx.fillPath()
        }
        // Two cloud layers along the bottom; at night they part to both sides and fade.
        let p = Self.puffScale
        for (j, cloud) in Self.clouds.enumerated() {
            let (x, y, alpha, away) = cloud
            let sway = motion * 3 * sin(tau * (clock / 7 + CGFloat(j) * 0.25))
            let ox = (x + 22 + away * slide) * 1.6 + sway, oy = y * 1.6 + 4
            for (px, py) in Self.puffs { disc(ox + (px + 8.5) * p, oy + (py + 8.5) * p, 8.5 * p) }
            ctx.setFillColor(white(alpha * (1 - 0.85 * k))); ctx.fillPath()
        }
        // Knob: the sun by day, the full moon by night; craters surface after 40 %.
        let r: CGFloat = 37
        ctx.setFillColor(NSColor(white: 0, alpha: 0.16 + 0.12 * k).cgColor); disc(cx, cy + 3, r + 2); ctx.fillPath()
        let glowAlpha = max(0, 0.75 * breathe - 0.2 * k)
        if let g = gradient([(0, mix(0xffc94d, 0xffebaa, k, glowAlpha)), (1, mix(0xffc94d, 0xffebaa, k, 0))]) {
            ctx.saveGState(); disc(cx, cy, r + 14); ctx.clip()
            ctx.drawRadialGradient(g, startCenter: CGPoint(x: cx, y: cy), startRadius: r * 0.8, endCenter: CGPoint(x: cx, y: cy),
                                   endRadius: r + 14, options: [.drawsBeforeStartLocation])
            ctx.restoreGState()
        }
        if let g = gradient([(0, mix(0xfff1b8, 0xffffff, k)), (0.55, mix(0xffc23d, 0xfff6d9, k)), (1, mix(0xf59e0b, 0xe9d79a, k))]) {
            let focus = CGPoint(x: cx - r * 0.3, y: cy - r * 0.32)
            ctx.saveGState(); disc(cx, cy, r); ctx.clip()
            ctx.drawRadialGradient(g, startCenter: focus, startRadius: 0, endCenter: focus, endRadius: r * 1.75, options: [.drawsAfterEndLocation])
            ctx.restoreGState()
        }
        let crater = max(0, min(1, (k - 0.4) / 0.6))
        if crater > 0 {
            ctx.setFillColor(NSColor(srgbRed: 214 / 255, green: 196 / 255, blue: 140 / 255, alpha: 0.5 * crater).cgColor)
            for (dx, dy, cr) in [(CGFloat(-11), CGFloat(-10), CGFloat(8)), (12, 4, 6), (-5, 15, 4.5), (14, -15, 3.5)] { disc(cx + dx, cy + dy, cr) }
            ctx.fillPath()
        }
        if let g = gradient([(0, white(0.45)), (0.12, white(0)), (0.85, NSColor(white: 0, alpha: 0).cgColor), (1, NSColor(white: 0, alpha: 0.1).cgColor)]) {
            ctx.saveGState(); disc(cx, cy, r); ctx.clip()
            ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: cy - r), end: CGPoint(x: 0, y: cy + r), options: [])
            ctx.restoreGState()
        }
        ctx.restoreGState()
        // 2 px border, brighter while hovered.
        let border = (0.25 + 0.2 * lift) * day + (0.08 + 0.1 * lift) * k
        ctx.addPath(pill(CGRect(x: 1, y: 1, width: 198, height: 88)))
        ctx.setStrokeColor(white(border)); ctx.setLineWidth(2); ctx.strokePath()
        if window?.firstResponder === self {
            ctx.addPath(pill(CGRect(x: -6, y: -6, width: 212, height: 102)))
            ctx.setStrokeColor(NSColor.keyboardFocusIndicatorColor.cgColor); ctx.setLineWidth(2 / scale); ctx.strokePath()
        }
        ctx.restoreGState()
    }
}

/// About page `.about-mark`: a 64 px rounded square in the sky gradient with a WiFi glyph.
final class NetMateAppMark: NSView {
    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: 64, height: 64) }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false
        setContentHuggingPriority(.required, for: .horizontal); setContentHuggingPriority(.required, for: .vertical)
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let dark = NetMateColors.isDark(effectiveAppearance)
        let hex = NetMateColors.hex
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: bounds, cornerWidth: 16, cornerHeight: 16, transform: nil)); ctx.clip()
        let colors = dark ? [hex(0x070d1c), hex(0x111a30), hex(0x1f3156)] : [hex(0x3d84d0), hex(0x6fb0ee), hex(0xa9d3f7)]
        cssLinearGradient(ctx, bounds, angle: 160, colors, [0, dark ? 0.55 : 0.6, 1])
        ctx.restoreGState()
        let tint = dark ? hex(0xf0d98a) : NSColor.white
        guard let image = NSImage(systemSymbolName: "wifi", accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 28, weight: .semibold)
                .applying(NSImage.SymbolConfiguration(paletteColors: [tint]))) else { return }
        let side: CGFloat = 34
        let size = image.size.width > 0 ? NSSize(width: side, height: side * image.size.height / image.size.width) : NSSize(width: side, height: side)
        image.draw(in: NSRect(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2, width: size.width, height: size.height),
                   from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
    }
}

/// The sky panel behind the home page's status copy: gradient by weather and theme, night stars,
/// and the static 176×120 weather illustration (220×150 viewBox) at the top right.
final class NetMateSky: NSView {
    /// "clear", "cloud" or "storm".
    var weather = "clear" { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let dark = NetMateColors.isDark(effectiveAppearance)
        let hex = NetMateColors.hex
        let shape = CGPath(roundedRect: bounds, cornerWidth: 16, cornerHeight: 16, transform: nil)
        ctx.saveGState()
        ctx.addPath(shape); ctx.clip()
        cssLinearGradient(ctx, bounds, angle: 160, NetMateColors.sky(weather, dark: dark).map(hex), [0, 0.6, 1])
        if dark && weather != "storm" {
            ctx.setFillColor(NSColor.white.withAlphaComponent(weather == "clear" ? 0.85 : 0.35).cgColor)
            for i in 0..<18 {
                let x = bounds.width * CGFloat((i * 37 + 39) % 97) / 100, y = bounds.height * CGFloat((i * 53 + 21) % 89) / 100
                ctx.fillEllipse(in: CGRect(x: x, y: y, width: 2, height: 2))
            }
        }
        // `.wx`: right 30, top 6, 176×120 for the 220×150 viewBox.
        let art = CGRect(x: bounds.maxX - 30 - 176, y: 6, width: 176, height: 120)
        ctx.translateBy(x: art.minX, y: art.minY); ctx.scaleBy(x: 176 / 220, y: 120 / 150)
        let body = CGPoint(x: 138, y: 50)
        // Glow and sun or moon.
        let glowAlpha: CGFloat = weather == "storm" ? 0 : (dark ? 1 : (weather == "cloud" ? 0.35 : 1))
        if glowAlpha > 0 {
            let color = dark ? hex(0xffecb0) : hex(0xffe680)
            let inner: CGFloat = dark ? 0.4 : 0.45, alpha: CGFloat = dark ? 0.35 : 0.55
            if let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor] as CFArray, locations: [0, inner, 1]) {
                ctx.saveGState(); ctx.setAlpha(glowAlpha)
                ctx.drawRadialGradient(g, startCenter: body, startRadius: 0, endCenter: body, endRadius: 58, options: [])
                ctx.restoreGState()
            }
        }
        if weather != "storm" {
            ctx.saveGState(); ctx.setAlpha(weather == "cloud" ? 0.6 : 1)
            if dark {
                radialDisc(ctx, center: body, radius: 28, focus: CGPoint(x: 0.34, y: 0.32), [hex(0xffffff), hex(0xfff6d9), hex(0xf2e3a8)], [0, 0.55, 1])
                let crater = hex(0xecdca6)
                for (x, y, r, a) in [(128.0, 44.0, 5.0, 0.55), (147.0, 60.0, 3.5, 0.5), (146.0, 39.0, 2.5, 0.45)] {
                    ctx.setFillColor(crater.withAlphaComponent(CGFloat(a)).cgColor)
                    ctx.fillEllipse(in: CGRect(x: CGFloat(x - r), y: CGFloat(y - r), width: CGFloat(r * 2), height: CGFloat(r * 2)))
                }
            } else {
                radialDisc(ctx, center: body, radius: 30, focus: CGPoint(x: 0.36, y: 0.34), [hex(0xfff5c0), hex(0xffd84d), hex(0xffc107)], [0, 0.7, 1])
            }
            ctx.restoreGState()
        }
        // Cloud fill: day white, storm grey, night blue-grey, night storm mauve-grey.
        let stops: [NSColor]
        let locations: [CGFloat]
        switch (dark, weather == "storm") {
        case (false, false): stops = [hex(0xffffff), hex(0xf3f8fe), hex(0xd6e6f7)]; locations = [0, 0.7, 1]
        case (false, true): stops = [hex(0xe3e7ec), hex(0xa9b2bd)]; locations = [0, 1]
        case (true, false): stops = [hex(0x5d6c8c), hex(0x36425c)]; locations = [0, 1]
        case (true, true): stops = [hex(0x5a5258), hex(0x352d33)]; locations = [0, 1]
        }
        func cloud(_ transform: CGAffineTransform, alpha: CGFloat, shadow: Bool) {
            let path = netMateCloud(transform)
            ctx.saveGState(); ctx.setAlpha(alpha)
            if shadow {
                ctx.saveGState()
                ctx.setShadow(offset: CGSize(width: 0, height: -5), blur: 9, color: hex(0x1b4f86).withAlphaComponent(0.22).cgColor)
                ctx.addPath(path.cgPath); ctx.setFillColor(stops[stops.count - 1].cgColor); ctx.fillPath()
                ctx.restoreGState()
            }
            fillVertical(path, stops, locations)
            ctx.restoreGState()
        }
        if weather != "clear" { cloud(CGAffineTransform(translationX: 6, y: 24).scaledBy(x: 0.82, y: 0.82), alpha: 0.75, shadow: false) }
        cloud(CGAffineTransform(translationX: 62, y: 50).scaledBy(x: 1.3, y: 1.3), alpha: dark && weather == "clear" ? 0.5 : 1, shadow: true)
        if weather == "storm" {
            ctx.setStrokeColor((dark ? hex(0x8ea3c7) : hex(0xd7ebff)).withAlphaComponent(0.9).cgColor)
            ctx.setLineWidth(3); ctx.setLineCap(.butt)
            for x in [112.0, 134.0, 156.0, 178.0] {
                ctx.move(to: CGPoint(x: x, y: 136)); ctx.addLine(to: CGPoint(x: x - 6, y: 148))
            }
            ctx.strokePath()
        }
        ctx.restoreGState()
    }
}

/// A coloured status dot with the 3 px soft ring (`.dot.ok` / `.dot.bad`).
final class NetMateDot: NSView {
    var color: NSColor = NetMateColors.secondary { didSet { needsDisplay = true } }
    var ring: NSColor? { didSet { needsDisplay = true } }
    override var intrinsicContentSize: NSSize { NSSize(width: 14, height: 14) }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        let c = NSPoint(x: bounds.midX, y: bounds.midY)
        if let ring { ring.setFill(); NSBezierPath(ovalIn: NSRect(x: c.x - 7, y: c.y - 7, width: 14, height: 14)).fill() }
        color.setFill(); NSBezierPath(ovalIn: NSRect(x: c.x - 4, y: c.y - 4, width: 8, height: 8)).fill()
    }
}

/// The `.dd` select: an input-like face (36 high, radius 9, line border, chevron) drawn over a
/// native NSPopUpButton, which keeps its menu, arrow/Return/Esc handling and accessibility. While
/// the menu is open the border turns accent with a 3 px accent-soft ring and the chevron flips; the
/// selected item is shown in accent with the system check mark. The menu itself stays a system menu.
final class NetMateSelect: NSPopUpButton, NSMenuDelegate {
    private var isOpen = false { didSet { needsDisplay = true } }
    private var hovered = false
    /// Opens the menu above the control (log footer) instead of below it.
    var opensUpward = false
    init(_ items: [String], name: String) {
        super.init(frame: .zero, pullsDown: false)
        addItems(withTitles: items)
        isBordered = false
        font = .systemFont(ofSize: 13.5, weight: .medium)
        setAccessibilityLabel(name)
        menu?.delegate = self
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    /// Native path (keyboard, VoiceOver): tint the selected item while the menu shows.
    func menuWillOpen(_ menu: NSMenu) {
        isOpen = true
        if menu === self.menu { for item in menu.items { decorate(item, chosen: item === selectedItem) } }
    }
    func menuDidClose(_ menu: NSMenu) { isOpen = false }
    private func decorate(_ item: NSMenuItem, chosen: Bool) {
        item.attributedTitle = NSAttributedString(string: item.title, attributes: [
            .font: NSFont.systemFont(ofSize: 13.5, weight: chosen ? .semibold : .regular),
            .foregroundColor: chosen ? NetMateColors.accent : NetMateColors.text
        ])
    }
    override var intrinsicContentSize: NSSize {
        let f = font ?? NSFont.systemFont(ofSize: 13.5)
        let widest = itemTitles.map { ($0 as NSString).size(withAttributes: [.font: f]).width }.max() ?? 0
        // 36 high face plus 3 px on each side for the open-state ring.
        return NSSize(width: ceil(widest) + 12 + 8 + 16 + 12 + 6, height: 42)
    }
    private var hoverArea: NSTrackingArea?
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverArea { removeTrackingArea(hoverArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); hoverArea = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    /// A click pops a separate menu 6 px below the control (or above it), like `.dd-pop`, so the
    /// native menu over the control is only used by keyboard and accessibility presses.
    override func mouseDown(with event: NSEvent) {
        guard isEnabled else { return }
        let pop = NSMenu(); pop.autoenablesItems = false; pop.minimumWidth = bounds.width; pop.delegate = self
        for (index, title) in itemTitles.enumerated() {
            let item = NSMenuItem(title: title, action: #selector(pick(_:)), keyEquivalent: "")
            item.target = self; item.tag = index
            item.state = index == indexOfSelectedItem ? .on : .off
            decorate(item, chosen: index == indexOfSelectedItem)
            pop.addItem(item)
        }
        // `popUp(positioning:at:in:)` places the menu's top-left corner.
        let height = pop.size.height, gap: CGFloat = 6
        let y: CGFloat
        if opensUpward { y = isFlipped ? -gap - height : bounds.height + gap + height }
        else { y = isFlipped ? bounds.height + gap : -gap }
        _ = pop.popUp(positioning: nil, at: NSPoint(x: 0, y: y), in: self)
    }
    @objc private func pick(_ item: NSMenuItem) {
        selectItem(at: item.tag)
        if let action { _ = sendAction(action, to: target) }
        needsDisplay = true
    }
    override func draw(_ dirtyRect: NSRect) {
        let c = NetMateColors.self
        // The 36 px face, inset 3 px for the open-state ring.
        let rect = NSRect(x: 3.5, y: (bounds.height - 35) / 2, width: bounds.width - 7, height: 35)
        let face = NSBezierPath(roundedRect: rect, xRadius: 9, yRadius: 9)
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current?.cgContext.setAlpha(isEnabled ? 1 : 0.55)
        if isOpen {
            c.accentSoft.setStroke()
            let ring = NSBezierPath(roundedRect: rect.insetBy(dx: -1.5, dy: -1.5), xRadius: 10.5, yRadius: 10.5)
            ring.lineWidth = 3; ring.stroke()
        }
        c.surface.setFill(); face.fill()
        let border = isOpen ? c.accent : (hovered ? (c.accent.blended(withFraction: 0.55, of: c.line) ?? c.line) : c.line)
        border.setStroke(); face.lineWidth = 1; face.stroke()
        let title = titleOfSelectedItem ?? ""
        let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [.font: font ?? NSFont.systemFont(ofSize: 13.5), .foregroundColor: c.text, .paragraphStyle: paragraph]
        let size = (title as NSString).size(withAttributes: attributes)
        (title as NSString).draw(in: NSRect(x: rect.minX + 12, y: rect.midY - size.height / 2, width: rect.width - 12 - 32, height: size.height),
                                 withAttributes: attributes)
        // Chevron `m6 9 6 6 6-6` in a 16 px box; it points up while open.
        let box = NSRect(x: rect.maxX - 12 - 16, y: rect.midY - 8, width: 16, height: 16)
        let u = box.width / 24
        // `down` is +y in a flipped view and -y otherwise.
        let down: CGFloat = (isFlipped ? 1 : -1) * (isOpen ? -1 : 1)
        let chevron = NSBezierPath()
        chevron.move(to: NSPoint(x: box.minX + 6 * u, y: box.midY - down * 3 * u))
        chevron.line(to: NSPoint(x: box.minX + 12 * u, y: box.midY + down * 3 * u))
        chevron.line(to: NSPoint(x: box.minX + 18 * u, y: box.midY - down * 3 * u))
        chevron.lineWidth = 2.2 * u; chevron.lineCapStyle = .round; chevron.lineJoinStyle = .round
        (isOpen ? c.accent : c.secondary).setStroke(); chevron.stroke()
        if window?.firstResponder === self && !isOpen {
            NSColor.keyboardFocusIndicatorColor.setStroke()
            let f = NSBezierPath(roundedRect: rect.insetBy(dx: -1, dy: -1), xRadius: 10, yRadius: 10); f.lineWidth = 2; f.stroke()
        }
    }
}

final class TopAlignedStack: NSStackView {
    override var isFlipped: Bool { true }
}
