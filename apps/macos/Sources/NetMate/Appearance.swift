import AppKit

// Source of truth: apps/desktop/src/App.css and components/Sidebar.tsx.
enum NetMateColors {
    static func hex(_ value: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                green: CGFloat((value >> 8) & 255) / 255,
                blue: CGFloat(value & 255) / 255, alpha: 1)
    }
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> NSColor {
        NSColor(name: nil) { appearance in hex(isDark(appearance) ? dark : light) }
    }
    static func isDark(_ appearance: NSAppearance) -> Bool {
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
    }
    static let text = adaptive(0x1e293b, 0xf1f5f9)
    static let secondary = adaptive(0x64748b, 0xcbd5e1)
    static let primary = adaptive(0x0284c7, 0x38bdf8)
    static let heading = adaptive(0x0c4a6e, 0xe2e8f0)
    static let success = adaptive(0x15803d, 0x4ade80)
    static let danger = adaptive(0xb91c1c, 0xfca5a5)
}

final class NetMateBackground: NSView {
    var onAppearanceChange: ((Bool) -> Void)?
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance(); needsDisplay = true
        onAppearanceChange?(NetMateColors.isDark(effectiveAppearance))
    }
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        let dark = NetMateColors.isDark(effectiveAppearance)
        let colors = dark ? [0x0f172a, 0x1e293b] : [0xf0f9ff, 0xe0f2fe, 0xdbeafe]
        NSGradient(colors: colors.map { NetMateColors.hex(UInt32($0)) })?.draw(in: bounds, angle: -45)
    }
}

final class NetMateSidebar: NSView {
    override func draw(_ dirtyRect: NSRect) {
        let dark = NetMateColors.isDark(effectiveAppearance)
        (dark ? NetMateColors.hex(0x0f172a).withAlphaComponent(0.4) : NSColor.white.withAlphaComponent(0.3)).setFill()
        bounds.fill()
        NSColor.white.withAlphaComponent(dark ? 0.1 : 0.7).setStroke()
        let line = NSBezierPath(); line.move(to: NSPoint(x: bounds.maxX - 0.5, y: 0))
        line.line(to: NSPoint(x: bounds.maxX - 0.5, y: bounds.maxY)); line.stroke()
    }
}

final class NetMateCard: NSView {
    let content = NSStackView()
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        content.orientation = .vertical; content.alignment = .leading; content.spacing = 12
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 32),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -32),
            content.topAnchor.constraint(equalTo: topAnchor, constant: 28),
            content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -28)
        ])
    }
    required init?(coder: NSCoder) { fatalError("Programmatic view") }
    override func draw(_ dirtyRect: NSRect) {
        let dark = NetMateColors.isDark(effectiveAppearance)
        let shape = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 24, yRadius: 24)
        (dark ? NetMateColors.hex(0x1e293b).withAlphaComponent(0.6) : NSColor.white.withAlphaComponent(0.4)).setFill()
        shape.fill()
        NSColor.white.withAlphaComponent(dark ? 0.1 : 0.7).setStroke(); shape.stroke()
    }
}

/// Remains an NSButton for keyboard control, focus and accessibility.
final class NetMateButton: NSButton {
    var navigation = false
    var selectedPage = false
    var symbol: String?
    var primary = false
    var destructive = false
    override var intrinsicContentSize: NSSize {
        let text = (title as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 15)])
        return NSSize(width: max(navigation ? 170 : 96, text.width + 40), height: navigation ? 48 : 40)
    }
    override func draw(_ dirtyRect: NSRect) {
        let dark = NetMateColors.isDark(effectiveAppearance)
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 16, yRadius: 16)
        let accent = NetMateColors.hex(dark ? 0x38bdf8 : 0x0ea5e9)
        let fill: NSColor = primary ? accent : destructive ? NetMateColors.hex(0xef4444).withAlphaComponent(0.1) : dark ? NetMateColors.hex(0x1e293b).withAlphaComponent(0.6) : .white.withAlphaComponent(0.4)
        if !navigation || selectedPage || isHighlighted {
            fill.withAlphaComponent(isHighlighted ? 0.75 : fill.alphaComponent).setFill(); path.fill()
            NSColor.white.withAlphaComponent(dark ? 0.1 : 0.7).setStroke(); path.stroke()
        }
        let color: NSColor = primary ? (dark ? NetMateColors.hex(0x0f172a) : .white) : destructive ? NetMateColors.danger : navigation && !selectedPage ? NetMateColors.secondary : NetMateColors.primary
        var textRect = bounds.insetBy(dx: 16, dy: 0)
        if let symbol, let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [color])) {
            image.draw(in: NSRect(x: 14, y: (bounds.height - 18) / 2, width: 18, height: 18))
            textRect.origin.x = 42; textRect.size.width -= 26
        }
        let style = NSMutableParagraphStyle(); style.alignment = navigation ? .left : .center
        let font = NSFont.systemFont(ofSize: 15, weight: primary || selectedPage ? .semibold : .regular)
        let size = (title as NSString).size(withAttributes: [.font: font])
        textRect.origin.y = (bounds.height - size.height) / 2; textRect.size.height = size.height
        (title as NSString).draw(in: textRect, withAttributes: [.font: font, .foregroundColor: color, .paragraphStyle: style])
        if window?.firstResponder === self {
            NSColor.keyboardFocusIndicatorColor.setStroke(); path.lineWidth = 2; path.stroke()
        }
    }
}

final class DayNightButton: NSButton {
    var dark = false { didSet { title = dark ? "切换至白天模式" : "切换至黑夜模式"; needsDisplay = true } }
    override var intrinsicContentSize: NSSize { NSSize(width: 84, height: 44) }
    override func draw(_ dirtyRect: NSRect) {
        let pill = NSRect(x: (bounds.width - 72) / 2, y: (bounds.height - 32) / 2, width: 72, height: 32)
        NetMateColors.hex(dark ? 0x191e32 : 0x4685c0).setFill()
        NSBezierPath(roundedRect: pill, xRadius: 16, yRadius: 16).fill()
        func circle(_ x: CGFloat, _ y: CGFloat, _ radius: CGFloat, _ color: NSColor) {
            color.setFill(); NSBezierPath(ovalIn: NSRect(x: pill.minX + x - radius, y: pill.minY + y - radius, width: radius * 2, height: radius * 2)).fill()
        }
        if dark {
            for (x, y) in [(12.0, 23.0), (22.0, 13.0), (30.0, 24.0)] { circle(CGFloat(x), CGFloat(y), 0.9, .white) }
        } else {
            NSGraphicsContext.saveGraphicsState(); NSBezierPath(roundedRect: pill, xRadius: 16, yRadius: 16).addClip()
            for (x, y, r) in [(55.0, 4.0, 12.0), (66.0, 9.0, 10.0), (40.0, 0.0, 10.0)] { circle(CGFloat(x), CGFloat(y), CGFloat(r), NetMateColors.hex(0xe0f2fe)) }
            NSGraphicsContext.restoreGraphicsState()
        }
        circle(dark ? 56 : 16, 16, 12, NetMateColors.hex(dark ? 0xc3c8d2 : 0xffc323))
        if dark {
            for (x, y, r) in [(54.0, 20.0, 3.0), (60.0, 13.0, 2.0), (50.0, 12.0, 1.5)] { circle(CGFloat(x), CGFloat(y), CGFloat(r), NetMateColors.hex(0x96a0b4)) }
        }
        if window?.firstResponder === self { NSColor.keyboardFocusIndicatorColor.setStroke(); NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 20, yRadius: 20).stroke() }
    }
}

final class TopAlignedStack: NSStackView {
    override var isFlipped: Bool { true }
}
