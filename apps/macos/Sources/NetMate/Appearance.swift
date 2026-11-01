import AppKit

// Visual source of truth: design/netmate-card.html (「校园一卡通」), ported to GTK in
// apps/native-ui/src/linux.rs and netmate.css; the day/night toggle is design/toggle-pen.html.
enum NetMateColors {
    static func hex(_ value: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                green: CGFloat((value >> 8) & 255) / 255,
                blue: CGFloat(value & 255) / 255, alpha: 1)
    }
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> NSColor {
        NSColor(name: nil) { appearance in hex(isDark(appearance) ? dark : light) }
    }
    /// A light/dark pair with separate opacities, e.g. `rgba(201,162,74,.18)` / `rgba(217,184,94,.16)`.
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

    // Tokens (netmate.css `window.netmate` and `.dark`).
    static let ground = adaptive(0xecebe6, 0x14181c)
    static let field = adaptive(0xf6f5f1, 0x1b2026)
    static let line = adaptive(0xd6d4cd, 0x2a3138)
    static let ink = adaptive(0x1d2329, 0xe8e6df)
    static let text = ink
    static let secondary = adaptive(0x5c636a, 0x9aa1a7)
    static let faint = adaptive(0xb5b2aa, 0x3a434c)
    static let gold = adaptive(0xc9a24a, 0xd9b85e)
    static let goldText = adaptive(0x87661c, 0xd9b85e)
    static let goldSoft = adaptive(0xc9a24a, 0.18, 0xd9b85e, 0.16)
    static let ok = adaptive(0x2f7d5b, 0x5cc795)
    static let warn = adaptive(0x9a5f0c, 0xe8a94e)
    static let bad = adaptive(0xb8372b, 0xf07b6e)
    static let rail = adaptive(0x1d2329, 0x0d1013)
    static let rail2 = adaptive(0x2b333b, 0x1d2329)
    static let railText = hex(0xe8e6df)
    static let railText2 = hex(0x9aa1a7)
    static let railLine = NSColor.white.withAlphaComponent(0.08)
    static let railHover = NSColor.white.withAlphaComponent(0.05)
    static let faceText = hex(0xf1efe8)
    static let faceText2 = hex(0xa9afb5)
    static let deck1 = adaptive(0xcfcdc6, 0x262c33)
    static let deck2 = adaptive(0xdddbd5, 0x1f252b)
    static let primary = adaptive(0x1d2329, 0xd9b85e)
    static let onPrimary = adaptive(0xffffff, 0x1a1606)

    // Names the pages use, mapped onto the tokens.
    static let caption = secondary
    static let label = secondary
    static let heading = text
    static let errorText = bad
    static let rule = line
    static let excellent = ok
    static let good = ok
    static let fair = warn
    static let poor = warn
    static let idle = secondary

    /// Card face gradient stops (`--face-a`, `--face-b`) for the resolved theme.
    static func face(dark: Bool) -> [NSColor] {
        dark ? [hex(0x323d47), hex(0x232a32)] : [hex(0x26313b), hex(0x1a2128)]
    }
    /// The gold chip gradient (`#ecd48c` → `#b88f35`), the same in both themes.
    static let chip = [hex(0xecd48c), hex(0xb88f35)]
    /// Log level text colour (`.level-*`).
    static func level(_ level: String) -> NSColor {
        switch level {
        case "success": return ok
        case "warn": return warn
        case "error": return bad
        default: return secondary
        }
    }
    /// `.lamp.<tone>`: the dot colour and the opacity of its 5 px ring; the same in both themes.
    static func lamp(_ tone: String) -> (UInt32, CGFloat) {
        switch tone {
        case "ok": return (0x5cc795, 0.2)
        case "warn": return (0xe8a94e, 0.22)
        case "bad": return (0xf07b6e, 0.22)
        default: return (0x9aa1a7, 0.2)
        }
    }
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

/// CSS `cubic-bezier(x1, y1, x2, y2)` evaluated at progress `x`.
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

final class NetMateBackground: NSView {
    var onAppearanceChange: ((Bool) -> Void)?
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance(); needsDisplay = true
        onAppearanceChange?(NetMateColors.isDark(effectiveAppearance))
    }
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) { NetMateColors.ground.setFill(); dirtyRect.fill() }
}

/// `.rail`: the flat graphite column.
final class NetMateSidebar: NSView {
    override var isFlipped: Bool { true }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) { NetMateColors.rail.setFill(); dirtyRect.fill() }
}

/// `.brand-card`: a 30×21 card with its 9×7 gold chip, the rail's brand mark.
final class NetMateBrandCard: NSView {
    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: 30, height: 21) }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false
        setContentHuggingPriority(.required, for: .horizontal); setContentHuggingPriority(.required, for: .vertical)
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let hex = NetMateColors.hex
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: bounds, cornerWidth: 4, cornerHeight: 4, transform: nil)); ctx.clip()
        cssLinearGradient(ctx, bounds, angle: 135, [hex(0x3a4651), hex(0x2a333c)], [0, 1])
        ctx.restoreGState()
        // inset 0 0 0 1px rgba(255, 255, 255, .08)
        ctx.addPath(CGPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerWidth: 3.5, cornerHeight: 3.5, transform: nil))
        ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.08).cgColor); ctx.setLineWidth(1); ctx.strokePath()
        let chip = CGRect(x: 5, y: 6, width: 9, height: 7)
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: chip, cornerWidth: 2, cornerHeight: 2, transform: nil)); ctx.clip()
        cssLinearGradient(ctx, chip, angle: 135, NetMateColors.chip, [0, 1])
        ctx.restoreGState()
    }
}

/// A rounded, optionally filled and stroked container around a padded stack. `topRule`,
/// `bottomRule` and `leftRule` draw the section rules and hairlines of the card design.
class NetMateBox: NSView {
    let content = NSStackView()
    var fill: NSColor? { didSet { needsDisplay = true } }
    var stroke: NSColor? { didSet { needsDisplay = true } }
    var lineWidth: CGFloat = 1 { didSet { needsDisplay = true } }
    var dashed = false { didSet { needsDisplay = true } }
    /// Clamped to half the height, so a large value draws a pill.
    var radius: CGFloat = 8 { didSet { needsDisplay = true } }
    var topRule: NSColor? { didSet { needsDisplay = true } }
    var topRuleWidth: CGFloat = 1 { didSet { needsDisplay = true } }
    var bottomRule: NSColor? { didSet { needsDisplay = true } }
    var bottomRuleWidth: CGFloat = 1 { didSet { needsDisplay = true } }
    var leftRule: NSColor? { didSet { needsDisplay = true } }
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
        if fill != nil || stroke != nil {
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
        if let topRule {
            topRule.setFill()
            NSBezierPath(rect: NSRect(x: 0, y: isFlipped ? 0 : bounds.height - topRuleWidth, width: bounds.width, height: topRuleWidth)).fill()
        }
        if let bottomRule {
            bottomRule.setFill()
            NSBezierPath(rect: NSRect(x: 0, y: isFlipped ? bounds.height - bottomRuleWidth : 0, width: bounds.width, height: bottomRuleWidth)).fill()
        }
        if let leftRule {
            leftRule.setFill()
            NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1, height: bounds.height)).fill()
        }
    }
}

/// `.badge` (20 px high, 4 px radius, outline only) and the outlined `.note` beside the card.
final class NetMateBadge: NetMateBox {
    let label = NSTextField(labelWithString: "")
    init(_ text: String, _ color: NSColor = NetMateColors.secondary, border: NSColor = NetMateColors.line, size: CGFloat = 11.5,
         padding: NSEdgeInsets = NSEdgeInsets(top: 3, left: 7, bottom: 3, right: 7), radius: CGFloat = 4) {
        super.init(.horizontal, padding: padding, spacing: 0)
        self.radius = radius
        label.font = .systemFont(ofSize: size, weight: .medium)
        label.lineBreakMode = .byTruncatingTail
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        content.addArrangedSubview(label)
        set(text, color, border: border)
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    func set(_ text: String, _ color: NSColor, border: NSColor) {
        label.stringValue = text; label.textColor = color; stroke = border
    }
}

/// A divider: the 1 px hairline, or the 1.5 px ink rule under section headings.
final class NetMateRule: NSView {
    var color: NSColor { didSet { needsDisplay = true } }
    var thickness: CGFloat { didSet { invalidateIntrinsicContentSize(); needsDisplay = true } }
    init(_ color: NSColor = NetMateColors.line, thickness: CGFloat = 1) {
        self.color = color; self.thickness = thickness
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override var intrinsicContentSize: NSSize { NSSize(width: NSView.noIntrinsicMetric, height: thickness) }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) { color.setFill(); NSBezierPath(rect: bounds).fill() }
}

/// `.metrics`: five equal cells under a 1.5 px ink rule; the cells draw their own left hairline.
final class NetMateStrip: NetMateBox {
    init() {
        // The cells start below the rule, so their left hairlines do not cross it.
        super.init(.horizontal, padding: NSEdgeInsets(top: 1.5, left: 0, bottom: 0, right: 0), spacing: 0)
        topRule = NetMateColors.ink; topRuleWidth = 1.5
        content.distribution = .fillEqually; content.alignment = .top
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
}

/// A clickable account choice in the WiFi form (`button.choice`), exposed as a button.
final class NetMateTile: NetMateBox {
    var onPress: (() -> Void)?
    var enabled = true { didSet { updateLook() } }
    var selected = false { didSet { updateLook() } }
    init() {
        super.init(.vertical, padding: NSEdgeInsets(top: 8, left: 12, bottom: 8, right: 12), spacing: 2)
        radius = 8; lineWidth = 1
        setAccessibilityElement(true); setAccessibilityRole(.button)
        updateLook()
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    private func updateLook() {
        fill = NetMateColors.field
        stroke = selected ? NetMateColors.gold : NetMateColors.line
        lineWidth = selected ? 1.5 : 1
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

/// One log row in four columns: time 160 | level 46 | source 84 | message, on a single line.
final class NetMateLogCell: NSTableCellView {
    static let reuse = NSUserInterfaceItemIdentifier("log-row")
    let time = NSTextField(labelWithString: "")
    let level = NSTextField(labelWithString: "")
    let source = NSTextField(labelWithString: "")
    let message = NSTextField(labelWithString: "")
    init() {
        super.init(frame: .zero)
        identifier = Self.reuse
        for field in [time, source] {
            field.font = .monospacedSystemFont(ofSize: 12.5, weight: .regular); field.textColor = NetMateColors.secondary
            field.lineBreakMode = .byTruncatingTail
        }
        level.font = .systemFont(ofSize: 12, weight: .bold)
        level.lineBreakMode = .byTruncatingTail
        message.font = .systemFont(ofSize: 13.5); message.textColor = NetMateColors.text
        message.lineBreakMode = .byTruncatingTail
        message.maximumNumberOfLines = 1
        message.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        message.setContentHuggingPriority(.init(1), for: .horizontal)
        let row = NSStackView(views: [time, level, source, message])
        row.orientation = .horizontal; row.spacing = 12; row.alignment = .centerY
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            time.widthAnchor.constraint(equalToConstant: 160),
            level.widthAnchor.constraint(equalToConstant: 46),
            source.widthAnchor.constraint(equalToConstant: 84),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 2),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -2),
            row.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
}

/// Remains an NSButton for keyboard control, focus and accessibility; the face follows
/// netmate.css: 34 px, radius 8, field fill with a line border.
final class NetMateButton: NSButton {
    var navigation = false
    /// Selected navigation item, or the checked state of a choice/segment button.
    var selectedPage = false { didSet { needsDisplay = true } }
    var symbol: String?
    var primary = false
    var destructive = false
    /// `button.choice`.
    var choice = false
    /// A log level segment (`button.log-filter` inside `.seg`).
    var chip = false
    /// `button.wifi-switch`: 28 px high.
    var compact = false { didSet { invalidateIntrinsicContentSize() } }
    /// `button.quiet`: 28 px, borderless, secondary text.
    var quiet = false { didSet { invalidateIntrinsicContentSize(); needsDisplay = true } }
    /// Icon and text colour override (`auto-on` / `auto-off`).
    var tint: NSColor?
    private var hovered = false
    private var drawFont: NSFont {
        if navigation { return .systemFont(ofSize: 15, weight: selectedPage ? .semibold : .medium) }
        return .systemFont(ofSize: chip ? 12.5 : 13.5, weight: .medium)
    }
    override var intrinsicContentSize: NSSize {
        if navigation { return NSSize(width: 172, height: 42) }
        let height: CGFloat = chip ? 24 : (quiet || compact ? 28 : 34)
        if title.isEmpty { return NSSize(width: height, height: height) }
        let text = (title as NSString).size(withAttributes: [.font: drawFont])
        let padding: CGFloat = chip ? 22 : (quiet ? 16 : (compact ? 24 : 30))
        return NSSize(width: ceil(text.width) + padding + (symbol == nil ? 0 : 22), height: height)
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
        let c = NetMateColors.self
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current?.cgContext.setAlpha(isEnabled ? 1 : 0.55)
        let r: CGFloat = chip ? 5 : 8
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: r, yRadius: r)
        var fill: NSColor?
        var stroke: NSColor?
        var color: NSColor
        var iconColor: NSColor?
        let active = hovered && isEnabled
        if navigation {
            color = selectedPage ? NSColor.white : (active ? c.railText : c.railText2)
            if selectedPage { fill = c.rail2; iconColor = c.gold } else if active || isHighlighted { fill = c.railHover }
        } else if chip {
            if selectedPage { fill = c.ink; color = c.ground } else { color = active ? c.text : c.secondary }
        } else if quiet {
            color = active ? c.text : (destructive ? c.bad : c.secondary)
            if active { fill = c.field }
        } else if primary {
            fill = c.primary; stroke = c.primary; color = c.onPrimary
        } else {
            fill = c.field; stroke = active ? c.secondary : c.line
            color = destructive ? c.bad : c.text
            if choice { if selectedPage { stroke = c.gold } else { color = c.secondary } }
        }
        if let tint { color = tint }
        if let fill { fill.setFill(); path.fill() }
        if let stroke { stroke.setStroke(); path.lineWidth = 1; path.stroke() }
        if primary && active { NSColor.white.withAlphaComponent(0.08).setFill(); path.fill() }
        if isHighlighted && !navigation { NSColor.black.withAlphaComponent(0.06).setFill(); path.fill() }
        var textRect = bounds.insetBy(dx: navigation ? 12 : 10, dy: 0)
        if let symbol, let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: navigation ? 15 : 13, weight: .medium)
                .applying(NSImage.SymbolConfiguration(paletteColors: [iconColor ?? color]))) {
            let side: CGFloat = navigation ? 18 : 16
            let fitted = image.size.width > 0 ? NSSize(width: side, height: side * image.size.height / image.size.width) : NSSize(width: side, height: side)
            if title.isEmpty {
                image.draw(in: NSRect(x: (bounds.width - fitted.width) / 2, y: (bounds.height - fitted.height) / 2, width: fitted.width, height: fitted.height))
            } else {
                let x: CGFloat = navigation ? 12 : 13
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
            // `:focus-visible`: a 2 px gold outline.
            c.gold.setStroke()
            let ring = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: r, yRadius: r)
            ring.lineWidth = 2; ring.stroke()
        }
    }
}

/// The day/night switch from the CodePen "Animated Day/Night Theme Toggle"
/// (design/toggle-pen.html), ported from `draw_toggle` in apps/native-ui/src/linux.rs. It is drawn
/// in the pen's em units at 16 pt per em: a 5.625×2.5 em pill on a 96×46 view (3 pt for the outer
/// highlight). The sun knob slides right and the moon mask covers it, two cloud layers sink 3 em
/// and seven sparkles drop in. Every move is a 0.3 s CSS `ease`; a retarget restarts from the
/// current value. Hover leans the sun 0.187 em toward the middle. The frame timer runs only while
/// something moves; with Reduce Motion the switch jumps to its end state. It stays an NSButton
/// whose title is the accessible name.
final class DayNightButton: NSButton {
    static let em: CGFloat = 16
    static let width: CGFloat = 5.625
    static let height: CGFloat = 2.5
    static let sunD: CGFloat = 2.125
    static let sunOffset: CGFloat = (height - sunD) / 2
    static let sunLean: CGFloat = 0.187
    static let duration: TimeInterval = 0.3
    /// The pen's cloud: a 1.25 em circle plus its box-shadow copies, (x, y, spread) in em from the
    /// circle's centre. The back layer paints first.
    static let cloudFront: [(CGFloat, CGFloat, CGFloat)] = [
        (0, 0, 0), (0.937, 0.312, 0), (1.437, 0.375, 0), (2.187, 0, 0),
        (2.937, 0.312, 0), (3.625, -0.062, 0), (4.5, -0.312, 0), (4.625, -1.75, 0.437)
    ]
    static let cloudBack: [(CGFloat, CGFloat, CGFloat)] = [
        (-0.312, -0.312, 0), (0.5, -0.125, 0), (1.25, -0.062, 0), (2.0, -0.312, 0),
        (2.625, 0, 0), (3.375, -0.437, 0), (4.0, -0.625, 0), (4.125, -2.125, 0.437)
    ]
    /// Centres of the seven sparkles in the pen's star SVG (viewBox 144×55).
    static let sparkles: [(CGFloat, CGFloat)] = [
        (136.996, 4.3545), (34.9956, 23.3545), (3.9956, 36.3545), (57.9956, 25.3545),
        (84.9956, 25.3545), (139.996, 36.3545), (102.996, 50.3545)
    ]
    /// One sparkle as cubic segments (c1x, c1y, c2x, c2y, x, y) around its centre, starting from
    /// the left tip (-3.9956, 0).
    static let sparkle: [[CGFloat]] = [
        [-2.8842, -0.055, -1.9405, -0.5042, -1.1643, -1.3476],
        [-0.3881, -2.191, 0.0, -3.1903, 0.0, -4.3545],
        [0.0, -3.1903, 0.3881, -2.191, 1.1643, -1.3476],
        [1.9405, -0.5042, 2.8842, -0.0642, 4.0044, 0.0],
        [3.2723, 0.0366, 2.602, 0.2475, 1.9846, 0.6508],
        [1.376, 1.045, 0.8908, 1.5767, 0.5292, 2.2368],
        [0.1764, 2.8968, 0.0, 3.6027, 0.0, 4.3728],
        [0.0, 3.2085, -0.3881, 2.2001, -1.1643, 1.3567],
        [-1.9405, 0.5042, -2.8842, 0.055, -3.9956, 0.0]
    ]
    /// Moon craters: (left, top, size) in em inside the moon mask.
    static let craters: [(CGFloat, CGFloat, CGFloat)] = [(0.3, 0.75, 0.75), (1.375, 0.9, 0.375), (0.8, 0.3, 0.25)]

    /// One animated value: a retarget restarts the 0.3 s `ease` from wherever the value is now,
    /// as a CSS transition does when it is interrupted.
    struct Tween {
        var from: CGFloat
        var to: CGFloat
        var value: CGFloat
        var started: TimeInterval?
        init(_ value: CGFloat) { from = value; to = value; self.value = value; started = nil }
        mutating func set(_ target: CGFloat) {
            if to != target { from = value; to = target; started = nil }
        }
        mutating func snap() { value = to; from = to; started = nil }
        var moving: Bool { value != to }
        mutating func step(_ now: TimeInterval) {
            guard moving else { return }
            let start = started ?? now
            started = start
            let k = CGFloat(max(0, min(1, (now - start) / DayNightButton.duration)))
            value = from + (to - from) * cubicBezier(0.25, 0.1, 0.25, 1, k)
            if k >= 1 { snap() }
        }
    }

    var dark = false {
        didSet {
            title = dark ? "切换至白天模式" : "切换至黑夜模式"
            setAccessibilityLabel(title); toolTip = title
            animate()
        }
    }
    private var hovered = false
    /// Day 0 … night 1: background colour, clouds, stars and the moon mask.
    private var theme = Tween(0)
    /// The sun's left edge in em, hover lean included.
    private var knob = Tween(DayNightButton.knobX(night: false, hover: false))
    private var timer: Timer?
    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }
    private var reduceMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    static func knobX(night: Bool, hover: Bool) -> CGFloat {
        let lean = hover ? sunLean : 0
        return night ? width - sunD - sunOffset - lean : sunOffset + lean
    }
    /// A pill (a circle when square) built from two half circles, as in the Cairo port.
    static func pill(_ r: CGRect) -> CGPath {
        let p = CGMutablePath()
        let rad = min(r.width, r.height) / 2
        p.addArc(center: CGPoint(x: r.maxX - rad, y: r.minY + rad), radius: rad, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: false)
        p.addArc(center: CGPoint(x: r.minX + rad, y: r.minY + rad), radius: rad, startAngle: .pi / 2, endAngle: .pi * 1.5, clockwise: false)
        p.closeSubpath()
        return p
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        title = "切换至黑夜模式"; setAccessibilityLabel(title); toolTip = title
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }

    override var intrinsicContentSize: NSSize { NSSize(width: 96, height: 46) }
    // The pen's y-down em space maps directly onto a flipped view.
    override var isFlipped: Bool { true }

    private var hoverArea: NSTrackingArea?
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverArea { removeTrackingArea(hoverArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); hoverArea = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; animate() }
    override func mouseExited(with event: NSEvent) { hovered = false; animate() }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil { timer?.invalidate(); timer = nil; theme.snap(); knob.snap() }
    }
    override func becomeFirstResponder() -> Bool { needsDisplay = true; return super.becomeFirstResponder() }
    override func resignFirstResponder() -> Bool { needsDisplay = true; return super.resignFirstResponder() }

    /// Retargets both tweens and starts the frame timer; it stops itself once nothing moves.
    private func animate() {
        theme.set(dark ? 1 : 0)
        knob.set(DayNightButton.knobX(night: dark, hover: hovered))
        needsDisplay = true
        if reduceMotion || window?.isVisible != true {
            theme.snap(); knob.snap()
            timer?.invalidate(); timer = nil
            return
        }
        guard timer == nil else { return }
        let t = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in self?.advance() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }
    private func advance() {
        let t = now
        theme.step(t); knob.step(t)
        needsDisplay = true
        if !theme.moving && !knob.moving { timer?.invalidate(); timer = nil }
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let em = DayNightButton.em, w = DayNightButton.width, h = DayNightButton.height, d = DayNightButton.sunD
        let k = max(0, min(1, theme.value))
        func rgb(_ value: UInt32, _ alpha: CGFloat = 1) -> CGColor { NetMateColors.hex(value).withAlphaComponent(alpha).cgColor }
        func disc(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) { ctx.addEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)) }
        /// CSS `box-shadow` on a pill: six even-odd layers spread across ±`blur`. An inset shadow
        /// fills outside `shape` (the caller clips to the element).
        func softShadow(_ shape: CGRect, _ blur: CGFloat, _ color: UInt32, _ alpha: CGFloat, inset: Bool) {
            let layers = 6
            let each = 1 - pow(1 - alpha, 1 / CGFloat(layers))
            ctx.setFillColor(rgb(color, each))
            for i in 0..<layers {
                let e = blur * ((CGFloat(i) + 0.5) / CGFloat(layers) * 2 - 1)
                if inset { ctx.addRect(shape.insetBy(dx: -10, dy: -10)) }
                ctx.addPath(DayNightButton.pill(shape.insetBy(dx: -e, dy: -e)))
                ctx.fillPath(using: .evenOdd)
            }
        }
        /// `box-shadow: inset dx dy blur color` on the pill `b`.
        func insetShadow(_ b: CGRect, _ dx: CGFloat, _ dy: CGFloat, _ blur: CGFloat, _ color: UInt32, _ alpha: CGFloat) {
            ctx.saveGState()
            ctx.addPath(DayNightButton.pill(b)); ctx.clip()
            softShadow(b.offsetBy(dx: dx, dy: dy), blur, color, alpha, inset: true)
            ctx.restoreGState()
        }
        ctx.saveGState()
        ctx.translateBy(x: (bounds.width - w * em) / 2, y: (bounds.height - h * em) / 2)
        ctx.scaleBy(x: em, y: em)
        let box = CGRect(x: 0, y: 0, width: w, height: h)
        // Outer highlight: 0.06em 0.06em 0.125em rgba(255, 255, 255, 0.94).
        softShadow(CGRect(x: 0.06, y: 0.06, width: w, height: h), 0.125, 0xffffff, 0.94, inset: false)
        ctx.saveGState()
        ctx.addPath(DayNightButton.pill(box)); ctx.clip()
        ctx.setFillColor(NetMateColors.mix(0x3d7eae, 0x1d1f2c, k).cgColor); ctx.fill(box)
        // Clouds hang from (0.3em, 2em) and sink 3em at night.
        let cx: CGFloat = 0.3 + 0.625, cy: CGFloat = 2.0 + 0.625 + 3 * k
        for (puffs, color) in [(DayNightButton.cloudBack, UInt32(0xaacadf)), (DayNightButton.cloudFront, UInt32(0xf3fdff))] {
            for (dx, dy, spread) in puffs { disc(cx + dx, cy + dy, 0.625 + spread) }
            ctx.setFillColor(rgb(color)); ctx.fillPath()
        }
        // Stars: 2.75em wide at 0.3em; 2em above the frame by day, 0.5em down at night.
        ctx.saveGState()
        ctx.translateBy(x: 0.3, y: -2 + 2.5 * k)
        ctx.scaleBy(x: 2.75 / 144, y: 2.75 / 144)
        for (x, y) in DayNightButton.sparkles {
            ctx.move(to: CGPoint(x: x - 3.9956, y: y))
            for s in DayNightButton.sparkle {
                ctx.addCurve(to: CGPoint(x: x + s[4], y: y + s[5]),
                             control1: CGPoint(x: x + s[0], y: y + s[1]),
                             control2: CGPoint(x: x + s[2], y: y + s[3]))
            }
            ctx.closePath()
        }
        ctx.setFillColor(rgb(0xffffff)); ctx.fillPath()
        ctx.restoreGState()
        // Sun: box-shadows paint last-listed first, so the halo rings go under the drop shadows.
        let sun = CGRect(x: knob.value, y: DayNightButton.sunOffset, width: d, height: d)
        let r = d / 2
        let sx = sun.minX + r, sy = sun.minY + r
        for spread: CGFloat in [1.875, 1.25, 0.625] {
            ctx.setFillColor(rgb(0xffffff, 0.1)); disc(sx, sy, r + spread); ctx.fillPath()
        }
        softShadow(sun.offsetBy(dx: 0, dy: 0.05), 0.125, 0x000000, 0.25, inset: false)
        softShadow(sun.offsetBy(dx: 0.05, dy: 0.125), 0.125, 0x000000, 0.25, inset: false)
        ctx.setFillColor(rgb(0xecca2f)); disc(sx, sy, r); ctx.fillPath()
        insetShadow(sun, 0, -0.05, 0.05, 0xa1872a, 1)
        insetShadow(sun, 0.05, 0.05, 0.05, 0xfeffef, 0.61)
        // Moon mask: slides in from the right, clipped to the sun's circle.
        ctx.saveGState()
        disc(sx, sy, r); ctx.clip()
        let moon = sun.offsetBy(dx: d * (1 - k), dy: 0)
        ctx.setFillColor(rgb(0xc4c9d1)); disc(moon.minX + r, moon.minY + r, r); ctx.fillPath()
        insetShadow(moon, 0, -0.062, 0.062, 0x969696, 1)
        insetShadow(moon, 0.062, 0.062, 0.062, 0xfeffef, 0.61)
        for (left, top, size) in DayNightButton.craters {
            let crater = CGRect(x: moon.minX + left, y: moon.minY + top, width: size, height: size)
            ctx.setFillColor(rgb(0x959db1)); disc(crater.midX, crater.midY, size / 2); ctx.fillPath()
            insetShadow(crater, 0, 0.03, 0.06, 0x000000, 0.25)
        }
        ctx.restoreGState()
        // The container's ::after: inset 0 0.05em 0.187em rgba(0, 0, 0, 0.5).
        insetShadow(box, 0, 0.05, 0.187, 0x000000, 0.5)
        ctx.restoreGState()
        ctx.restoreGState()
        if window?.firstResponder === self {
            NetMateColors.gold.setStroke()
            let ring = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: (bounds.height - 2) / 2, yRadius: (bounds.height - 2) / 2)
            ring.lineWidth = 2; ring.stroke()
        }
    }
}

/// `.chip`: the 46×34 gold contact chip with its pad outline and contact line; grey when void.
final class NetMateChip: NSView {
    var void = false { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: 46, height: 34) }
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
        let shape = NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7)
        if void { NetMateColors.line.setFill(); shape.fill(); return }
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: bounds, cornerWidth: 7, cornerHeight: 7, transform: nil)); ctx.clip()
        cssLinearGradient(ctx, bounds, angle: 135, NetMateColors.chip, [0, 1])
        let ink = NSColor(srgbRed: 80 / 255, green: 58 / 255, blue: 14 / 255, alpha: 0.38).cgColor
        ctx.setStrokeColor(ink); ctx.setLineWidth(1)
        // `.chip-pad`: inset 8 15, radius 3.
        let pad = CGRect(x: 15.5, y: 8.5, width: bounds.width - 31, height: bounds.height - 17)
        ctx.addPath(CGPath(roundedRect: pad, cornerWidth: 3, cornerHeight: 3, transform: nil)); ctx.strokePath()
        // `.chip-line`: a contact line 16 px from the top.
        ctx.move(to: CGPoint(x: 0, y: 16.5)); ctx.addLine(to: CGPoint(x: bounds.width, y: 16.5)); ctx.strokePath()
        ctx.restoreGState()
    }
}

/// `.lamp`: a 12 px status dot with a 5 px translucent ring (22 px box).
final class NetMateLamp: NSView {
    var tone = "idle" { didSet { needsDisplay = true } }
    override var intrinsicContentSize: NSSize { NSSize(width: 22, height: 22) }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false
        setContentHuggingPriority(.required, for: .horizontal); setContentHuggingPriority(.required, for: .vertical)
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override func draw(_ dirtyRect: NSRect) {
        let (color, ring) = NetMateColors.lamp(tone)
        let c = NSPoint(x: bounds.midX, y: bounds.midY)
        NetMateColors.hex(color).withAlphaComponent(ring).setFill()
        NSBezierPath(ovalIn: NSRect(x: c.x - 11, y: c.y - 11, width: 22, height: 22)).fill()
        NetMateColors.hex(color).setFill()
        NSBezierPath(ovalIn: NSRect(x: c.x - 6, y: c.y - 6, width: 12, height: 12)).fill()
    }
}

/// `.id-card`: the 135° face gradient with radius 16, or the dashed outline of `.id-card.void`.
/// Its `content` stack is the padded `.id-body`.
final class NetMateCardFace: NetMateBox {
    var void = false { didSet { needsDisplay = true } }
    init(void: Bool, padding: NSEdgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)) {
        super.init(.vertical, padding: padding, spacing: 0)
        self.void = void
        radius = 16
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        if void {
            NetMateColors.faint.setStroke()
            let outline = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.75, dy: 0.75), xRadius: 15.25, yRadius: 15.25)
            outline.lineWidth = 1.5; outline.setLineDash([6, 4], count: 2, phase: 0); outline.stroke()
            return
        }
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: bounds, cornerWidth: 16, cornerHeight: 16, transform: nil)); ctx.clip()
        cssLinearGradient(ctx, bounds, angle: 135, NetMateColors.face(dark: NetMateColors.isDark(effectiveAppearance)), [0, 1])
        // inset 0 1px rgba(255, 255, 255, .06)
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.06).cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: bounds.width, height: 1))
        ctx.restoreGState()
    }
}

/// The magnetic stripe at the foot of the card face, which doubles as the retry progress. It is
/// pinned to the face's bottom edge and clips itself to the face's rounded corners.
final class NetMateStripe: NSView {
    var fraction: CGFloat = 0 { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: NSView.noIntrinsicMetric, height: 6) }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let faceHeight = max(superview?.bounds.height ?? 0, 32 + bounds.height)
        ctx.saveGState()
        let face = CGRect(x: 0, y: bounds.height - faceHeight, width: bounds.width, height: faceHeight)
        ctx.addPath(CGPath(roundedRect: face, cornerWidth: 16, cornerHeight: 16, transform: nil)); ctx.clip()
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.08).cgColor); ctx.fill(bounds)
        ctx.setFillColor(NetMateColors.hex(0xe8a94e).cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: bounds.width * max(0, min(1, fraction)), height: bounds.height))
        ctx.restoreGState()
    }
}

/// The home account card deck: up to two card backs behind the 440×276 face, plus the face's
/// drop shadow (0 20px 34px -20px). The deck is 456×298 as in linux.rs, with 16 pt below for
/// the shadow.
final class NetMateDeck: NSView {
    let backs: Int
    let shadow: Bool
    static let faceRect = CGRect(x: 0, y: 22, width: 440, height: 276)
    init(backs: Int, shadow: Bool) {
        self.backs = max(0, min(2, backs)); self.shadow = shadow
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        for axis in [NSLayoutConstraint.Orientation.horizontal, .vertical] {
            setContentHuggingPriority(.required, for: axis)
            setContentCompressionResistancePriority(.required, for: axis)
        }
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: 456, height: 314) }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    /// Pins the face at (0, 22) with its fixed 440×276 size.
    func addFace(_ face: NSView) {
        face.translatesAutoresizingMaskIntoConstraints = false
        addSubview(face)
        let r = Self.faceRect
        NSLayoutConstraint.activate([
            face.leadingAnchor.constraint(equalTo: leadingAnchor, constant: r.minX),
            face.topAnchor.constraint(equalTo: topAnchor, constant: r.minY),
            face.widthAnchor.constraint(equalToConstant: r.width),
            face.heightAnchor.constraint(equalToConstant: r.height)
        ])
    }
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        // back-2 (45, 11, 409×257) then back-1 (24, 16, 424×266); one back keeps back-1 only.
        let cards: [(CGRect, NSColor)] = [(CGRect(x: 45, y: 11, width: 409, height: 257), NetMateColors.deck2),
                                          (CGRect(x: 24, y: 16, width: 424, height: 266), NetMateColors.deck1)]
        for (rect, color) in cards.suffix(backs) {
            let shape = NSBezierPath(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), xRadius: 15, yRadius: 15)
            color.setFill(); shape.fill()
            NetMateColors.line.setStroke(); shape.lineWidth = 1; shape.stroke()
        }
        guard shadow else { return }
        // The spread of -20 shrinks the shadow box; the face covers the box itself.
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -20), blur: 34,
                      color: NSColor(srgbRed: 10 / 255, green: 14 / 255, blue: 18 / 255, alpha: 0.6).cgColor)
        ctx.addPath(CGPath(roundedRect: Self.faceRect.insetBy(dx: 20, dy: 20), cornerWidth: 8, cornerHeight: 8, transform: nil))
        ctx.setFillColor(NetMateColors.hex(0x1a2128).cgColor); ctx.fillPath()
        ctx.restoreGState()
    }
}

/// `.mini-card`: a 58×38 card face for an account row; the account in use shows the gold chip.
final class NetMateMiniCard: NSView {
    var on = false { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: 58, height: 38) }
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
        let chip = CGRect(x: 7, y: 9, width: 14, height: 10)
        if !on {
            NetMateColors.line.setFill(); NSBezierPath(roundedRect: bounds, xRadius: 6, yRadius: 6).fill()
            NetMateColors.faint.setFill(); NSBezierPath(roundedRect: chip, xRadius: 2, yRadius: 2).fill()
            return
        }
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: bounds, cornerWidth: 6, cornerHeight: 6, transform: nil)); ctx.clip()
        cssLinearGradient(ctx, bounds, angle: 135, NetMateColors.face(dark: NetMateColors.isDark(effectiveAppearance)), [0, 1])
        ctx.restoreGState()
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: chip, cornerWidth: 2, cornerHeight: 2, transform: nil)); ctx.clip()
        cssLinearGradient(ctx, chip, angle: 135, NetMateColors.chip, [0, 1])
        ctx.restoreGState()
    }
}

/// The `.select` dropdown: an input-like face (34 high, radius 8, line border, chevron) drawn over
/// a native NSPopUpButton, which keeps its menu, arrow/Return/Esc handling and accessibility. While
/// the menu is open the border turns gold with a 3 px gold-soft ring and the chevron flips; the
/// selected item is shown in gold text with the system check mark. The menu stays a system menu.
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
            .foregroundColor: chosen ? NetMateColors.goldText : NetMateColors.text
        ])
    }
    override var intrinsicContentSize: NSSize {
        let f = font ?? NSFont.systemFont(ofSize: 13.5)
        let widest = itemTitles.map { ($0 as NSString).size(withAttributes: [.font: f]).width }.max() ?? 0
        // 34 high face plus 3 px on each side for the open-state ring.
        return NSSize(width: ceil(widest) + 12 + 8 + 16 + 12 + 6, height: 40)
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
    /// A click pops a separate menu 6 px below the control (or above it), so the native menu over
    /// the control is only used by keyboard and accessibility presses.
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
        // The 34 px face, inset 3 px for the open-state ring.
        let rect = NSRect(x: 3.5, y: (bounds.height - 33) / 2, width: bounds.width - 7, height: 33)
        let face = NSBezierPath(roundedRect: rect, xRadius: 8, yRadius: 8)
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current?.cgContext.setAlpha(isEnabled ? 1 : 0.55)
        if isOpen {
            c.goldSoft.setStroke()
            let ring = NSBezierPath(roundedRect: rect.insetBy(dx: -1.5, dy: -1.5), xRadius: 9.5, yRadius: 9.5)
            ring.lineWidth = 3; ring.stroke()
        }
        c.field.setFill(); face.fill()
        let border = isOpen ? c.gold : (hovered ? c.secondary : c.line)
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
        (isOpen ? c.goldText : c.secondary).setStroke(); chevron.stroke()
        if window?.firstResponder === self && !isOpen {
            c.gold.setStroke()
            let f = NSBezierPath(roundedRect: rect.insetBy(dx: -1, dy: -1), xRadius: 9, yRadius: 9); f.lineWidth = 2; f.stroke()
        }
    }
}

final class TopAlignedStack: NSStackView {
    override var isFlipped: Bool { true }
}
