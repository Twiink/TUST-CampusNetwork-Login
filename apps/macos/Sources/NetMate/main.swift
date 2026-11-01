import AppKit
import ObjectiveC
import NetMateIPC

// Page structure and behaviour follow apps/native-ui/src/linux.rs, which mirrors the original
// React pages under apps/desktop/src/pages; colours come from Appearance.swift (netmate.css).

private var actionKey: UInt8 = 0
final class Action: NSObject {
    let body: () -> Void
    init(_ body: @escaping () -> Void) { self.body = body }
    @objc func invoke() { body() }
}
typealias JSON = [String: Any]
typealias Edit = (inout JSON) -> Void

func str(_ value: Any?) -> String? {
    guard let value, !(value is NSNull) else { return nil }
    if let s = value as? String { return s }
    return "\(value)"
}
func int(_ value: Any?) -> Int? { (value as? NSNumber)?.intValue }
func flag(_ value: Any?) -> Bool { (value as? Bool) == true }
func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
func describe(_ error: Error) -> String {
    guard let ipc = error as? IPCError else { return "\(error)" }
    switch ipc {
    case .backend(let message): return message
    case .unavailable: return "无法连接后台服务"
    case .invalidFrame: return "后台响应格式无效"
    }
}
/// netmate_core::model::security: normalises a security label for identity comparison.
func normalizedSecurity(_ value: String) -> String {
    var s = value.lowercased()
    for c in ["-", "_", " "] { s = s.replacingOccurrences(of: c, with: "") }
    if s.contains("eap") || s.contains("enterprise") { return "enterprise" }
    if s.contains("sae") || s.contains("wpa3") { return s.contains("wpa2") || s.contains("psk") ? "wpa2wpa3" : "wpa3" }
    if s.contains("wpa2") || s.contains("psk") { return "wpa2" }
    if s.contains("wpa") { return "wpa" }
    if s.contains("wep") { return "wep" }
    return "open"
}
func securityMatches(_ expected: String, _ actual: String) -> Bool {
    let e = normalizedSecurity(expected), a = normalizedSecurity(actual)
    return e == a || (e == "wpa2wpa3" && (a == "wpa2" || a == "wpa3"))
}
/// Network::matches: same SSID, and BSSID/security when the rule names them.
func networkMatches(_ n: JSON, _ rule: JSON) -> Bool {
    guard let ssid = str(n["ssid"]), ssid == str(rule["ssid"]) else { return false }
    if let bssid = str(rule["bssid"]) {
        guard let actual = str(n["bssid"]), actual.caseInsensitiveCompare(bssid) == .orderedSame else { return false }
    }
    if let security = str(rule["security"]) {
        guard let actual = str(n["security"]), securityMatches(security, actual) else { return false }
    }
    return true
}
func ispLabel(_ isp: String) -> String {
    ["campus": "校园网", "cmcc": "中国移动", "cucc": "中国联通", "ctcc": "中国电信"][isp] ?? isp
}
func levelLabel(_ level: String) -> String {
    ["info": "信息", "success": "成功", "warn": "警告", "error": "错误", "debug": "调试"][level] ?? level
}
let timeFormatter: DateFormatter = {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss"; return f
}()
func formatTime(_ ms: Any?) -> String {
    guard let ms = (ms as? NSNumber)?.doubleValue else { return "" }
    return timeFormatter.string(from: Date(timeIntervalSince1970: ms / 1000))
}

final class App: NSObject, NSApplicationDelegate, NSWindowDelegate, NSTableViewDataSource, NSTableViewDelegate, NSTextFieldDelegate {
    let client = Client()
    var window: NSWindow!
    let pageHost = NSView()
    let feedback = NSTextField(wrappingLabelWithString: "")
    var navigation = [String: NetMateButton]()
    let themeSwitch = DayNightButton()
    var config = JSON()
    var snapshot = JSON()
    var page = "运行状态"
    var renderedPage = ""
    var pageScroll: NSScrollView?
    var readySent = false
    // Home page
    var home: NSStackView?
    var homeSignature = ""
    /// Countdown views; `true` reads the heartbeat deadline, `false` the retry deadline.
    var countdowns = [(NSView, NSTextField, Bool)]()
    var ticker: Timer?
    // Settings page
    var scan: [JSON]?
    var scanning = false
    weak var scanButton: NetMateButton?
    /// Unsaved add-form input survives re-renders after each configuration save.
    var drafts = [String: String]()
    var clearOnSave = [String]()
    var saving = false
    var edits = [Edit]()
    var changeHandlers = [ObjectIdentifier: (String) -> Void]()
    var debounces = [String: Timer]()
    // About page
    var update = JSON()
    var updateLabel: NSTextField?
    var updateActions: NSStackView?
    // Log page
    var entries = [JSON]()
    var table: NSTableView?
    var query = JSON()
    var cursors = [String?]()
    var cursor: String?
    var nextCursor: String?
    var logCount: NSTextField?
    var logEmpty: NSTextField?
    var logRequest = 0
    var logGeneration = 0

    func applicationDidFinishLaunching(_ note: Notification) {
        if let existing = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "com.netmate.native").first(where: {
            $0.processIdentifier != ProcessInfo.processInfo.processIdentifier && ["netmate-ui", "NetMate"].contains($0.executableURL?.lastPathComponent ?? "")
        }) {
            existing.activate(options: .activateIgnoringOtherApps); NSApp.terminate(nil); return
        }
        if let theme = UserDefaults.standard.string(forKey: "netmate.appearance") {
            NSApp.appearance = NSAppearance(named: theme == "dark" ? .darkAqua : .aqua)
        }
        NSApp.setActivationPolicy(.regular)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "NetMate"; window.titlebarAppearsTransparent = true; window.minSize = NSSize(width: 980, height: 660)
        window.standardWindowButton(.closeButton)?.setAccessibilityIdentifier("netmate-close")
        window.delegate = self; window.center()
        let root = NetMateBackground()
        root.onAppearanceChange = { [weak self] dark in self?.themeSwitch.dark = dark }
        window.contentView = root
        let sidebar = NetMateSidebar(); sidebar.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(sidebar)
        // `.rail`: the brand card, a hairline, the page list, then the theme switch at the foot.
        let menu = NSStackView(); menu.orientation = .vertical; menu.alignment = .leading; menu.spacing = 4
        menu.translatesAutoresizingMaskIntoConstraints = false; sidebar.addSubview(menu)
        let brand = hstack(12, in: menu)
        brand.edgeInsets = NSEdgeInsets(top: 0, left: 4, bottom: 0, right: 4)
        brand.addArrangedSubview(NetMateBrandCard(frame: .zero))
        let brandNames = vstack(1, in: brand, fill: false)
        tag("NetMate", in: brandNames, size: 18, weight: .bold, color: NetMateColors.railText)
        tag("天津科技大学校园网", in: brandNames, size: 11.5, color: NetMateColors.railText2)
        menu.setCustomSpacing(22, after: brand)
        let navRule = NetMateRule(NetMateColors.railLine); menu.addArrangedSubview(navRule); fillWidth(navRule, menu)
        menu.setCustomSpacing(18, after: navRule)
        for (name, title, symbol) in [("运行状态", "运行状态", "wifi"), ("配置设置", "配置设置", "slider.vertical.3"), ("日志", "运行日志", "doc.text"), ("关于", "关于", "info.circle")] {
            let b = button(title, in: menu) { [weak self] in self?.go(name) }
            b.navigation = true; b.symbol = symbol
            b.widthAnchor.constraint(equalToConstant: 172).isActive = true
            navigation[name] = b
        }
        let footRule = NetMateRule(NetMateColors.railLine); sidebar.addSubview(footRule)
        let themeAction = Action { [weak self] in self?.switchTheme() }
        themeSwitch.target = themeAction; themeSwitch.action = #selector(Action.invoke)
        objc_setAssociatedObject(themeSwitch, &actionKey, themeAction, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        themeSwitch.translatesAutoresizingMaskIntoConstraints = false; sidebar.addSubview(themeSwitch)
        themeSwitch.dark = NetMateColors.isDark(window.effectiveAppearance)
        let themeCaption = NSTextField(labelWithString: "白天 / 黑夜")
        themeCaption.font = .systemFont(ofSize: 12); themeCaption.textColor = NetMateColors.railText2
        themeCaption.translatesAutoresizingMaskIntoConstraints = false; sidebar.addSubview(themeCaption)
        let main = NSStackView(); main.orientation = .vertical; main.alignment = .leading; main.spacing = 12
        main.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(main)
        pageHost.translatesAutoresizingMaskIntoConstraints = false
        main.addArrangedSubview(pageHost)
        feedback.font = .systemFont(ofSize: 12.5); feedback.textColor = NetMateColors.secondary; feedback.isSelectable = true
        main.addArrangedSubview(feedback)
        NSLayoutConstraint.activate([
            // The rail is 200 wide with 26/14/20 padding; the navigation items are 172 wide.
            sidebar.leadingAnchor.constraint(equalTo: root.leadingAnchor), sidebar.topAnchor.constraint(equalTo: root.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: root.bottomAnchor), sidebar.widthAnchor.constraint(equalToConstant: 200),
            menu.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor, constant: 14), menu.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: -14),
            menu.topAnchor.constraint(equalTo: sidebar.topAnchor, constant: 26),
            // `.rail-foot`: a hairline, 18 above the 96×46 switch, and the caption 8 below it.
            footRule.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor, constant: 14), footRule.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: -14),
            footRule.topAnchor.constraint(greaterThanOrEqualTo: menu.bottomAnchor, constant: 16),
            footRule.bottomAnchor.constraint(equalTo: themeSwitch.topAnchor, constant: -18),
            themeSwitch.centerXAnchor.constraint(equalTo: sidebar.centerXAnchor), themeSwitch.bottomAnchor.constraint(equalTo: themeCaption.topAnchor, constant: -8),
            themeSwitch.widthAnchor.constraint(equalToConstant: 96), themeSwitch.heightAnchor.constraint(equalToConstant: 46),
            themeCaption.centerXAnchor.constraint(equalTo: sidebar.centerXAnchor), themeCaption.bottomAnchor.constraint(equalTo: sidebar.bottomAnchor, constant: -20),
            // `.main`: padding 26 32 24.
            main.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: 32), main.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -32),
            main.topAnchor.constraint(equalTo: root.topAnchor, constant: 26), main.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -24),
            pageHost.widthAnchor.constraint(equalTo: main.widthAnchor), feedback.widthAnchor.constraint(equalTo: main.widthAnchor),
            pageHost.heightAnchor.constraint(greaterThanOrEqualToConstant: 400)
        ])
        pageHost.setContentHuggingPriority(.init(1), for: .vertical)
        render(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        loadInitialConfig()
    }
    /// The agent may still be starting; the first config is retried until it answers, so the
    /// window never stays on its loading state.
    func loadInitialConfig(attempt: Int = 0) {
        request("config", nil, { [weak self] value in
            guard let self else { return }
            self.configReceived(value, saved: false)
            self.startSubscription()
        }, failed: { [weak self] _ in
            let delay = min(5.0, 0.5 * Double(attempt + 1))
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { self?.loadInitialConfig(attempt: attempt + 1) }
        })
    }

    func startSubscription() {
        // A dedicated thread: the subscription blocks for the life of the window.
        Thread.detachNewThread { [weak self] in
            var reconnecting = false
            while let self {
                do {
                    // The initial config request has bootstrapped the agent. On a restart,
                    // request a fresh snapshot before subscribing to its new socket.
                    let first = try self.client.request("snapshot")
                    DispatchQueue.main.async { if let value = first as? JSON { self.applyState(value) } }
                    // A restarted agent may hold a newer revision than the open form.
                    if reconnecting, let fresh = try? self.client.request("config") {
                        DispatchQueue.main.async { if !self.saving { self.configReceived(fresh, saved: false) } }
                    }
                    reconnecting = true
                    try self.client.subscribe { value in DispatchQueue.main.async { self.applyState(value) } }
                } catch {
                    DispatchQueue.main.async { self.feedback.stringValue = "后台连接中断，正在重连" }
                }
                Thread.sleep(forTimeInterval: 1)
            }
        }
    }
    func applyState(_ value: JSON) {
        if value["phase"] as? String == "exiting" { NSApp.terminate(nil); return }
        let refresh = page == "日志" && cursor == nil && (value["logRevision"] as? NSNumber != snapshot["logRevision"] as? NSNumber)
        snapshot = value
        if feedback.stringValue == "后台连接中断，正在重连" { feedback.stringValue = "" }
        refreshHome()
        if refresh { loadLogs() }
    }
    func switchTheme() {
        let dark = !NetMateColors.isDark(window.effectiveAppearance)
        UserDefaults.standard.set(dark ? "dark" : "light", forKey: "netmate.appearance")
        NSApp.appearance = NSAppearance(named: dark ? .darkAqua : .aqua); themeSwitch.dark = dark
        func invalidate(_ view: NSView) { view.needsDisplay = true; view.subviews.forEach(invalidate) }
        if let root = window.contentView { invalidate(root) }
        for sheet in window.sheets { if let view = sheet.contentView { invalidate(view) } }
    }
    func windowWillClose(_ notification: Notification) {
        if let closing = notification.object as? NSWindow, closing !== window { window.endSheet(closing); closing.contentView = nil } else { NSApp.terminate(nil) }
    }
    /// Called from a button inside the sheet: the views (and the running action) are released
    /// after the action returns, not while it still executes.
    func closeSheet(_ sheet: NSWindow) {
        window.endSheet(sheet); sheet.orderOut(nil)
        DispatchQueue.main.async { sheet.contentView = nil; sheet.close() }
    }

    // MARK: IPC

    func request(_ op: String, _ args: Any? = nil, _ done: @escaping (Any) -> Void = { _ in }, failed: ((String) -> Void)? = nil) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                let result = try self.client.request(op, args)
                DispatchQueue.main.async { done(result) }
            } catch {
                let message = describe(error)
                DispatchQueue.main.async { self.feedback.stringValue = message; failed?(message) }
            }
        }
    }
    func list(_ key: String) -> [JSON] { config[key] as? [JSON] ?? [] }
    var settingsValue: JSON { config["settings"] as? JSON ?? [:] }
    func setting(_ key: String, _ value: Any) -> Edit {
        { c in var s = c["settings"] as? JSON ?? [:]; s[key] = value; c["settings"] = s }
    }
    /// Queues a configuration edit; edits apply to the newest config, one save at a time.
    func mutate(_ edit: @escaping Edit) {
        edits.append(edit)
        if !saving && !config.isEmpty { flush() }
    }
    func flush() {
        guard !edits.isEmpty else { return }
        var next = config
        for edit in edits { edit(&next) }
        edits = []; saving = true
        request("save_config", next, { [weak self] value in self?.configReceived(value, saved: true) }, failed: { [weak self] _ in
            guard let self else { return }
            self.saving = false; self.clearOnSave = []
            self.request("config") { [weak self] value in self?.configReceived(value, saved: false) }
        })
    }
    func configReceived(_ value: Any, saved: Bool) {
        config = value as? JSON ?? [:]
        if saved {
            saving = false
            let prefixes = clearOnSave; clearOnSave = []
            drafts = drafts.filter { key, _ in !prefixes.contains { key.hasPrefix($0) } }
            feedback.stringValue = "配置已保存并生效"
        }
        flush()
        if page == "运行状态" && renderedPage == page { refreshHome() } else if page != "日志" { render() }
        if !readySent {
            readySent = true
            window.displayIfNeeded()
            request("ui_ready", ["pid": ProcessInfo.processInfo.processIdentifier])
        }
    }
    func go(_ name: String) { page = name; render() }

    // MARK: View helpers

    func retain(_ action: Action, on object: NSObject) {
        objc_setAssociatedObject(object, &actionKey, action, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
    func bind(_ control: NSControl, _ fn: @escaping () -> Void) {
        let action = Action(fn); control.target = action; control.action = #selector(Action.invoke); retain(action, on: control)
    }
    func onChange(_ field: NSTextField, _ fn: @escaping (String) -> Void) {
        field.delegate = self; changeHandlers[ObjectIdentifier(field)] = fn
    }
    func controlTextDidChange(_ obj: Notification) {
        guard let field = obj.object as? NSTextField else { return }
        changeHandlers[ObjectIdentifier(field)]?(field.stringValue)
    }
    func vstack(_ spacing: CGFloat = 8, in parent: NSStackView? = nil, fill: Bool = true) -> NSStackView {
        let s = NSStackView(); s.orientation = .vertical; s.alignment = .leading; s.spacing = spacing; s.distribution = .fill
        s.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
        s.translatesAutoresizingMaskIntoConstraints = false
        if let parent { parent.addArrangedSubview(s); if fill { fillWidth(s, parent) } }
        return s
    }
    func hstack(_ spacing: CGFloat = 8, in parent: NSStackView? = nil, fill: Bool = false) -> NSStackView {
        let s = NSStackView(); s.orientation = .horizontal; s.alignment = .centerY; s.spacing = spacing; s.distribution = .fill
        s.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
        s.translatesAutoresizingMaskIntoConstraints = false
        if let parent { parent.addArrangedSubview(s); if fill { fillWidth(s, parent) } }
        return s
    }
    func fillWidth(_ view: NSView, _ parent: NSView) { view.widthAnchor.constraint(equalTo: parent.widthAnchor).isActive = true }
    func spacer(in parent: NSStackView) {
        let s = NSView(); s.translatesAutoresizingMaskIntoConstraints = false
        s.setContentHuggingPriority(.init(1), for: .horizontal); s.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        parent.addArrangedSubview(s)
    }
    /// A wrapped, selectable label constrained to its parent's width.
    @discardableResult func text(_ value: String, in parent: NSStackView, size: CGFloat = 15, weight: NSFont.Weight = .regular,
                                 color: NSColor = NetMateColors.text, center: Bool = false, mono: Bool = false) -> NSTextField {
        let field = NSTextField(wrappingLabelWithString: value)
        field.isSelectable = true
        field.font = mono ? .monospacedSystemFont(ofSize: size, weight: weight) : .systemFont(ofSize: size, weight: weight)
        field.textColor = color
        if center { field.alignment = .center }
        parent.addArrangedSubview(field)
        field.widthAnchor.constraint(lessThanOrEqualTo: parent.widthAnchor).isActive = true
        field.setContentCompressionResistancePriority(.init(249), for: .horizontal)
        return field
    }
    /// A single-line label that keeps its size inside rows.
    @discardableResult func tag(_ value: String, in parent: NSStackView, size: CGFloat = 15, weight: NSFont.Weight = .regular, color: NSColor = NetMateColors.text) -> NSTextField {
        let field = NSTextField(labelWithString: value)
        field.font = .systemFont(ofSize: size, weight: weight); field.textColor = color
        field.lineBreakMode = .byTruncatingTail
        parent.addArrangedSubview(field)
        return field
    }
    @discardableResult func button(_ title: String, in box: NSStackView, name: String? = nil, _ fn: @escaping () -> Void) -> NetMateButton {
        let action = Action(fn)
        let b = NetMateButton(title: title, target: action, action: #selector(Action.invoke))
        b.primary = ["立即连接", "保存", "添加认证账号", "添加 WiFi", "保存并添加账号", "恢复自动认证", "下载更新", "立即安装"].contains(title)
        b.destructive = title.contains("删除") || ["断开连接", "清除日志", "确认清空"].contains(title)
        b.font = .systemFont(ofSize: 13.5, weight: .medium)
        let accessible = name ?? title
        b.setAccessibilityLabel(accessible); b.setAccessibilityIdentifier(accessible)
        retain(action, on: b); box.addArrangedSubview(b)
        b.setContentHuggingPriority(.init(750), for: .horizontal)
        return b
    }
    @discardableResult func iconButton(_ symbol: String, _ name: String, in box: NSStackView, _ fn: @escaping () -> Void) -> NetMateButton {
        let b = button("", in: box, name: name, fn)
        b.symbol = symbol; b.toolTip = name; b.invalidateIntrinsicContentSize()
        return b
    }
    func icon(_ symbol: String, size: CGFloat, color: NSColor, in parent: NSStackView) {
        guard let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil) else { return }
        let view = NSImageView(image: image)
        view.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: size, weight: .regular)
        view.contentTintColor = color
        parent.addArrangedSubview(view)
    }
    /// A single-line label with optional letter spacing (in em) and a monospaced face.
    @discardableResult func label(_ value: String, in parent: NSStackView, size: CGFloat, weight: NSFont.Weight = .regular,
                                  color: NSColor, tracking: CGFloat = 0, mono: Bool = false) -> NSTextField {
        let font: NSFont = mono ? .monospacedSystemFont(ofSize: size, weight: weight) : .systemFont(ofSize: size, weight: weight)
        let field = NSTextField(labelWithString: value)
        field.font = font; field.textColor = color; field.lineBreakMode = .byTruncatingTail
        if tracking != 0 {
            let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail
            field.attributedStringValue = NSAttributedString(string: value, attributes: [.font: font, .foregroundColor: color, .kern: tracking * size, .paragraphStyle: paragraph])
        }
        parent.addArrangedSubview(field)
        return field
    }
    /// `.badge`: an outlined 11.5 px tag.
    @discardableResult func badge(_ value: String, _ color: NSColor, border: NSColor, in parent: NSStackView) -> NetMateBadge {
        let b = NetMateBadge(value, color, border: border); parent.addArrangedSubview(b); return b
    }
    /// `.note`: the outlined pills beside the home card; `kind` is `gold`, `bad` or empty.
    func note(_ value: String, _ kind: String) -> NetMateBadge {
        let color = kind == "gold" ? NetMateColors.goldText : (kind == "bad" ? NetMateColors.bad : NetMateColors.secondary)
        let border = kind == "gold" ? NetMateColors.gold : (kind == "bad" ? NetMateColors.bad : NetMateColors.line)
        let n = NetMateBadge(value, color, border: border, size: 12, padding: NSEdgeInsets(top: 2, left: 8, bottom: 2, right: 8), radius: 5)
        n.label.font = .systemFont(ofSize: 12)
        return n
    }
    func rule(in parent: NSStackView) { let r = NetMateRule(); parent.addArrangedSubview(r); fillWidth(r, parent) }
    /// `.sec`: a section whose heading sits on a 1.5 px ink rule; its rows are split by hairlines
    /// instead of sitting on a card.
    func section(_ title: String, in parent: NSStackView) -> NetMateBox {
        let s = NetMateBox(.vertical, spacing: 0)
        parent.addArrangedSubview(s); fillWidth(s, parent)
        if !title.isEmpty { sectionHead(title, in: s.content) }
        return s
    }
    /// `.panel-head`: the 13 px title, a flexible gap and room for trailing widgets; returns the row.
    @discardableResult func sectionHead(_ title: String, in parent: NSStackView) -> NSStackView {
        let head = NetMateBox(.horizontal, padding: NSEdgeInsets(top: 0, left: 0, bottom: 6, right: 0), spacing: 10)
        head.bottomRule = NetMateColors.ink; head.bottomRuleWidth = 1.5
        parent.addArrangedSubview(head); fillWidth(head, parent)
        head.heightAnchor.constraint(greaterThanOrEqualToConstant: 34).isActive = true
        label(title, in: head.content, size: 13, weight: .semibold, color: NetMateColors.text, tracking: 0.06)
        spacer(in: head.content)
        return head.content
    }
    /// A section with a head row; returns the section body and the head row.
    func panel(_ title: String, in parent: NSStackView) -> (NSStackView, NSStackView) {
        let s = section("", in: parent)
        let head = sectionHead(title, in: s.content)
        return (s.content, head)
    }
    /// A row on a 1 px hairline (`.set`, `.acct`, `.rule`, `.list-row`, `.kv`, `.feature` …).
    func hairRow(in parent: NSStackView, _ orientation: NSUserInterfaceLayoutOrientation = .horizontal,
                 padding: NSEdgeInsets = NSEdgeInsets(top: 10, left: 0, bottom: 10, right: 0), spacing: CGFloat = 12, minHeight: CGFloat = 0) -> NetMateBox {
        let r = NetMateBox(orientation, padding: padding, spacing: spacing)
        r.bottomRule = NetMateColors.line
        parent.addArrangedSubview(r); fillWidth(r, parent)
        if minHeight > 0 { r.heightAnchor.constraint(greaterThanOrEqualToConstant: minHeight).isActive = true }
        return r
    }
    /// `.dialog-title` in the edit sheets.
    func cardTitle(_ title: String, in parent: NSStackView) {
        let heading = tag(title, in: parent, size: 18, weight: .bold, color: NetMateColors.heading)
        parent.setCustomSpacing(14, after: heading)
    }
    func box(_ orientation: NSUserInterfaceLayoutOrientation, in parent: NSStackView, padding: NSEdgeInsets, spacing: CGFloat = 8,
             fill: NSColor?, stroke: NSColor? = nil, radius: CGFloat = 8, fullWidth: Bool = true) -> NetMateBox {
        let b = NetMateBox(orientation, padding: padding, spacing: spacing)
        b.fill = fill; b.stroke = stroke; b.radius = radius
        parent.addArrangedSubview(b); if fullWidth { fillWidth(b, parent) }
        return b
    }
    func insets(_ v: CGFloat, _ h: CGFloat) -> NSEdgeInsets { NSEdgeInsets(top: v, left: h, bottom: v, right: h) }
    /// Rows of equal-width cells, `columns` per row.
    func grid(_ views: [NSView], columns: Int, in parent: NSStackView, spacing: CGFloat = 12) {
        let rows = vstack(spacing, in: parent)
        var index = 0
        while index < views.count {
            let line = hstack(spacing, in: rows, fill: true)
            line.distribution = .fillEqually; line.alignment = .top
            for column in 0..<columns {
                if index + column < views.count { line.addArrangedSubview(views[index + column]) } else { line.addArrangedSubview(NSView()) }
            }
            index += columns
        }
    }
    /// `.page-title-row`: the 22 px title in a row at least 40 high.
    func pageTitle(_ title: String, in parent: NSStackView? = nil) -> NSStackView {
        let row = hstack(14, in: parent)
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: 40).isActive = true
        tag(title, in: row, size: 22, weight: .bold, color: NetMateColors.heading)
        return row
    }
    /// `.dd`: a styled select whose choice runs `fn` with the selected index.
    func dropdown(_ items: [String], name: String, selected: Int = 0, upward: Bool = false, _ fn: ((Int) -> Void)? = nil) -> NetMateSelect {
        let popup = NetMateSelect(items, name: name)
        popup.opensUpward = upward
        popup.selectItem(at: max(0, min(selected, items.count - 1)))
        if let fn { bind(popup) { [weak popup] in fn(popup?.indexOfSelectedItem ?? 0) } }
        return popup
    }
    /// `.form-group`: a 12.5 px label over its control; in a row the groups share the width.
    func formGroup(_ title: String, in parent: NSStackView) -> NSStackView {
        let vertical = parent.orientation == .vertical
        let group = vstack(8, in: parent, fill: vertical)
        text(title, in: group, size: 12.5, color: NetMateColors.label)
        if vertical { parent.setCustomSpacing(10, after: group) }
        return group
    }
    func inputField(_ value: String, secure: Bool = false, placeholder: String = "", name: String) -> NSTextField {
        let f: NSTextField = secure ? NSSecureTextField(string: value) : NSTextField(string: value)
        f.placeholderString = placeholder; f.font = .systemFont(ofSize: 13.5)
        f.bezelStyle = .roundedBezel; f.controlSize = .large
        f.setAccessibilityLabel(name); f.setAccessibilityIdentifier(name)
        return f
    }
    func entry(_ title: String, _ value: String, secure: Bool = false, in parent: NSStackView) -> NSTextField {
        let group = formGroup(title, in: parent)
        let f = inputField(value, secure: secure, name: title)
        group.addArrangedSubview(f); fillWidth(f, group)
        return f
    }
    func draft(_ key: String, _ fallback: String = "") -> String { drafts[key] ?? fallback }
    /// An add-form field whose text is kept in `drafts` across re-renders.
    func draftEntry(_ key: String, _ title: String, _ name: String, _ placeholder: String, secure: Bool = false, in parent: NSStackView) -> NSTextField {
        let group = formGroup(title, in: parent)
        let f = inputField(draft(key), secure: secure, placeholder: placeholder, name: name)
        onChange(f) { [weak self] value in self?.drafts[key] = value }
        group.addArrangedSubview(f); fillWidth(f, group)
        return f
    }
    @discardableResult func check(_ title: String, _ value: Bool, in parent: NSStackView, _ fn: ((Bool) -> Void)? = nil) -> NSButton {
        let b = NSButton(checkboxWithTitle: title, target: nil, action: nil)
        b.state = value ? .on : .off; b.font = .systemFont(ofSize: 13.5)
        if let fn { bind(b) { [weak b] in fn(b?.state == .on) } }
        parent.addArrangedSubview(b)
        return b
    }
    /// A form checkbox with its explanation inline: `label (desc)`.
    func checkRow(_ title: String, _ desc: String, _ value: Bool, in parent: NSStackView, _ fn: @escaping (Bool) -> Void) {
        let line = hstack(8, in: parent)
        check(title, value, in: line, fn)
        if !desc.isEmpty { tag("(\(desc))", in: line, size: 12.5, color: NetMateColors.secondary) }
        parent.setCustomSpacing(10, after: line)
    }
    /// `.set`: label and description on the left, a switch on the right, over a hairline.
    func setRow(_ title: String, _ desc: String, _ value: Bool, in parent: NSStackView, _ fn: @escaping (Bool) -> Void) {
        let line = hairRow(in: parent, padding: insets(10, 0), spacing: 24, minHeight: 46)
        let copy = vstack(2, in: line.content, fill: false)
        copy.setContentHuggingPriority(.init(1), for: .horizontal)
        text(title, in: copy, size: 14, weight: .medium)
        if !desc.isEmpty { text(desc, in: copy, size: 12.5, color: NetMateColors.secondary) }
        let toggle = NSSwitch()
        toggle.state = value ? .on : .off
        toggle.setAccessibilityLabel(title)
        bind(toggle) { [weak toggle] in fn(toggle?.state == .on) }
        line.content.addArrangedSubview(toggle)
    }
    /// A group of buttons where exactly one is selected; `chip` draws the log level `.seg` track.
    func choices(_ items: [(String, String)], selected: String, chip: Bool, columns: Int, in parent: NSStackView, _ fn: @escaping (String) -> Void) {
        let buttons = NSHashTable<NetMateButton>.weakObjects()
        var views = [NSView]()
        for (value, title) in items {
            let b = NetMateButton(title: title, target: nil, action: nil)
            b.choice = !chip; b.chip = chip; b.selectedPage = value == selected
            b.font = .systemFont(ofSize: chip ? 12.5 : 13.5, weight: .medium)
            b.setAccessibilityLabel(title); b.setAccessibilityIdentifier(title)
            bind(b) { [weak b] in
                guard let b else { return }
                for other in buttons.allObjects { other.selectedPage = other === b }
                fn(value)
            }
            buttons.add(b); views.append(b)
        }
        if columns > 0 {
            grid(views, columns: columns, in: parent, spacing: 10)
        } else {
            let track = box(.horizontal, in: parent, padding: insets(3, 3), spacing: 2, fill: NetMateColors.field, stroke: NetMateColors.line, radius: 8, fullWidth: false)
            views.forEach { track.content.addArrangedSubview($0) }
        }
    }
    /// `.empty-box`: a dashed outline with a faded icon.
    func emptyBox(_ symbol: String, _ message: String, in parent: NSStackView) {
        let previous = parent.arrangedSubviews.last
        let b = box(.vertical, in: parent, padding: insets(24, 24), fill: nil, stroke: NetMateColors.faint, radius: 10)
        if let previous { parent.setCustomSpacing(12, after: previous) }
        b.lineWidth = 1.5; b.dashed = true; b.content.alignment = .centerX
        icon(symbol, size: 28, color: NetMateColors.secondary.withAlphaComponent(0.5), in: b.content)
        text(message, in: b.content, size: 14, color: NetMateColors.secondary, center: true)
    }
}

// MARK: Rendering and the 运行状态 page
extension App {
    func scrolled(in parent: NSView) -> (NSScrollView, NSStackView) {
        let content = TopAlignedStack(); content.orientation = .vertical; content.alignment = .leading; content.spacing = 24
        content.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 24, right: 0)
        content.translatesAutoresizingMaskIntoConstraints = false
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.drawsBackground = false
        scroll.autohidesScrollers = true
        scroll.documentView = content; scroll.translatesAutoresizingMaskIntoConstraints = false
        parent.addSubview(scroll)
        NSLayoutConstraint.activate([
            content.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.contentView.leadingAnchor),
            content.topAnchor.constraint(equalTo: scroll.contentView.topAnchor)
        ])
        return (scroll, content)
    }
    /// The page column: a title row on top and the remaining height for `body`.
    func layout(_ top: NSView?, _ body: NSView, gap: CGFloat = 32) {
        if let top {
            top.translatesAutoresizingMaskIntoConstraints = false; pageHost.addSubview(top)
            NSLayoutConstraint.activate([
                top.leadingAnchor.constraint(equalTo: pageHost.leadingAnchor), top.trailingAnchor.constraint(equalTo: pageHost.trailingAnchor),
                top.topAnchor.constraint(equalTo: pageHost.topAnchor)
            ])
        }
        NSLayoutConstraint.activate([
            body.leadingAnchor.constraint(equalTo: pageHost.leadingAnchor), body.trailingAnchor.constraint(equalTo: pageHost.trailingAnchor),
            body.bottomAnchor.constraint(equalTo: pageHost.bottomAnchor),
            body.topAnchor.constraint(equalTo: top?.bottomAnchor ?? pageHost.topAnchor, constant: top == nil ? 0 : gap)
        ])
    }
    func render() {
        let offset = renderedPage == page ? (pageScroll?.contentView.bounds.origin.y ?? 0) : 0
        logRequest += 1; entries = []; table = nil; logCount = nil; logEmpty = nil
        home = nil; homeSignature = ""; countdowns = []; updateLabel = nil; updateActions = nil
        changeHandlers = [:]; pageScroll = nil
        pageHost.subviews.forEach { $0.removeFromSuperview() }
        for (name, item) in navigation { item.selectedPage = name == page }
        renderedPage = page
        if page == "日志" { logsPage(); return }
        let titleRow = pageTitle(["运行状态": "运行状态", "配置设置": "配置设置"][page] ?? "关于")
        if page == "配置设置" { tag("修改后立即保存并生效", in: titleRow, size: 13, color: NetMateColors.secondary) }
        let (scroll, content) = scrolled(in: pageHost)
        layout(titleRow, scroll, gap: 8)
        pageScroll = scroll
        switch page {
        case "运行状态":
            // A group whose accessible name is the ready marker CI looks up.
            let group = vstack(22, in: content)
            group.setAccessibilityElement(true); group.setAccessibilityRole(.group)
            group.setAccessibilityLabel("网络连接状态"); group.setAccessibilityIdentifier("网络连接状态")
            home = group
            refreshHome()
        case "配置设置":
            settingsPage(content)
            if offset > 0 {
                content.layoutSubtreeIfNeeded()
                DispatchQueue.main.async { scroll.contentView.scroll(to: NSPoint(x: 0, y: offset)); scroll.reflectScrolledClipView(scroll.contentView) }
            }
        default:
            aboutPage(content)
        }
    }

    /// Only the fields the home cards render; countdown deadlines are read live by `tick`.
    func homeSignatureValue() -> String {
        var s = snapshot
        for key in ["sequence", "logRevision", "notification", "revision"] { s.removeValue(forKey: key) }
        for key in ["nextHeartbeatAt", "nextRetryAt"] { s[key] = str(s[key]) != nil }
        let data = (try? JSONSerialization.data(withJSONObject: [s, config["revision"] ?? NSNull(), config.isEmpty] as [Any], options: [.sortedKeys])) ?? Data()
        return String(data: data, encoding: .utf8) ?? ""
    }
    /// "2023101234" → "2023 1012 34", printed like the number on a campus card.
    func cardNumber(_ username: String) -> String {
        let chars = Array(username)
        return stride(from: 0, to: chars.count, by: 4).map { String(chars[$0..<min($0 + 4, chars.count)]) }.joined(separator: " ")
    }
    func refreshHome() {
        guard page == "运行状态", let home else { return }
        let signature = homeSignatureValue()
        guard signature != homeSignature else { return }
        homeSignature = signature; countdowns = []
        home.arrangedSubviews.forEach { home.removeArrangedSubview($0); $0.removeFromSuperview() }
        pauseBanner(in: home)
        if snapshot.isEmpty || config.isEmpty {
            let loading = vstack(8, in: home)
            loading.alignment = .centerX; loading.edgeInsets = insets(48, 32)
            let spinner = NSProgressIndicator(); spinner.style = .spinning; spinner.controlSize = .large; spinner.startAnimation(nil)
            loading.addArrangedSubview(spinner)
            loading.setCustomSpacing(16, after: spinner)
            text("正在检测 WiFi 连接...", in: loading, size: 20, weight: .bold, center: true)
            text("请稍候，正在检查网络连接状态", in: loading, size: 14, color: NetMateColors.secondary, center: true)
            return
        }
        let n = snapshot["network"] as? JSON ?? [:]
        let wifi = str(n["ssid"]) != nil
        let ssid = str(n["ssid"]) ?? ""
        let heartbeatOn = flag(settingsValue["enableHeartbeat"])
        let online = flag(snapshot["internetReachable"])
        let rule = wifi ? currentRule(n) : nil
        let accounts = wifi ? loginAccounts(n, rule) : []
        let number = accounts.first.flatMap { str($0["username"]) }.map(cardNumber)
        // Each extra account in the login order shows as one more card behind the front one.
        let backs = min(2, max(0, accounts.count - 1))
        var view: Face
        if !wifi {
            var notes = [("连接到 WiFi 后才能使用网络认证功能", "")]
            if heartbeatOn { notes.append(("心跳检测已暂停", "bad")) }
            view = Face(tone: "bad", void: true, issuer: "TUST · 校园网认证", place: "无 WiFi", status: "未连接 WiFi",
                        headline: "先连上 WiFi", body: "当前设备未连接到任何 WiFi 网络，请先连接 WiFi。",
                        meta: [("WiFi", "无"), ("心跳检测", heartbeatOn ? "已暂停" : "已关闭")], notes: notes)
        } else if rule == nil && !flag(snapshot["requiresAuth"]) {
            let sameName = list("wifiRules").contains { str($0["ssid"]) == ssid }
            view = Face(tone: "idle", void: true, issuer: "TUST · 未配置", place: ssid,
                        status: sameName ? "请选择当前 WiFi 规则" : "该 WiFi 未配置",
                        headline: sameName ? "选择 WiFi 规则" : "添加这个 WiFi",
                        body: sameName ? "同名 WiFi 身份信息不足或规则不匹配，请在配置设置中选择安全类型及 BSSID 后重试。" : "当前连接的 WiFi \"\(ssid)\" 尚未配置，请前往\"配置设置\"添加此 WiFi 的配置。",
                        meta: [("WiFi", ssid), ("WiFi 规则", sameName ? "未匹配" : "未配置")],
                        notes: [("点击左侧菜单的\"配置设置\"添加 WiFi 配置", "")])
        } else if !(rule.map({ flag($0["requiresAuth"]) }) ?? flag(snapshot["requiresAuth"])) {
            view = Face(tone: online ? "ok" : "warn", void: false, issuer: "TUST · 无需认证", place: ssid, status: "无需认证",
                        headline: online ? "互联网可达" : "互联网暂不可达",
                        body: online ? "当前 WiFi 无需校园网认证，互联网可达。" : "当前 WiFi 无需校园网认证，互联网暂不可达。",
                        meta: [("WiFi", ssid), ("WiFi 规则", "无需认证"), ("互联网", online ? "可达" : "不可达")],
                        notes: [("此 WiFi 已配置为「无需认证」", "gold"), ("如家庭 WiFi、手机热点等网络", "")])
        } else if accounts.isEmpty {
            view = Face(tone: "idle", void: true, issuer: "TUST · 校园网认证", place: ssid, status: "未配置账户",
                        headline: "还差一个账号", body: "该 WiFi 需要校园网认证，但尚未关联账户。请前往\"配置设置\"添加账户并关联到此 WiFi。",
                        meta: [("WiFi 规则", "需要认证"), ("关联账户", "无")],
                        notes: [("点击左侧菜单的\"配置设置\"添加账户并关联", "")])
            view.action = { [weak self] actions in
                _ = self?.button("添加认证账号", in: actions) { [weak self] in self?.go("配置设置") }
            }
        } else {
            let authenticated = flag(snapshot["authenticated"])
            let connecting = ["connecting", "authenticating", "verifying"].contains(snapshot["phase"] as? String ?? "")
            view = Face(tone: authenticated && online ? "ok" : "warn", void: false, backs: backs, issuer: "TUST · 校园网认证", place: ssid,
                        status: authenticated ? (online ? "已认证并联网" : "已认证，互联网不可达") : "需要认证",
                        headline: authenticated ? (online ? "一切正常" : "正在检查互联网") : (connecting ? "正在认证" : "等待认证"),
                        body: authenticated ? (online ? "当前 WiFi 已通过认证且可访问互联网。" : "门户已确认认证成功，正在检查互联网连接。") : "当前 WiFi 需要校园网认证，请点击下方按钮进行认证。",
                        meta: [("运营商", ispLabel(str(accounts[0]["isp"]) ?? "")), ("关联账户", "\(accounts.count) 个"),
                               ("WiFi 规则", rule != nil ? "需要认证" : "自动识别")],
                        notes: [(rule != nil ? "此 WiFi 已配置为「需要认证」" : "根据当前网络信息识别为校园网", "gold"), ("如校园网 CMCC/CUCC/CTCC", "")])
            view.action = { [weak self] actions in
                guard let self else { return }
                if authenticated {
                    self.button("断开连接", in: actions) { [weak self] in self?.request("logout") }
                } else if connecting {
                    let b = self.button("正在认证...", in: actions) {}
                    b.primary = true; b.isEnabled = false
                } else {
                    self.button("立即连接", in: actions) { [weak self] in self?.request("login") }
                }
            }
        }
        accountCard(view, number: number, in: home)
        if wifi { metricStrip(n, in: home) }
        // Two equal, top-aligned columns: 本轮尝试 and 网络详情 | 切换 WiFi.
        let cols = hstack(32, in: home, fill: true)
        cols.distribution = .fillEqually; cols.alignment = .top
        let left = vstack(24, in: cols, fill: false)
        recoveryFailures(in: left)
        if wifi { wifiDetails(n, in: left) } else if heartbeatOn { heartbeatPaused(in: left) }
        if left.arrangedSubviews.isEmpty { cols.removeArrangedSubview(left); left.removeFromSuperview() }
        switcher(current: rule, in: cols)
        if cols.arrangedSubviews.isEmpty { home.removeArrangedSubview(cols); cols.removeFromSuperview() }
        startTicking()
    }
    /// The same rule the agent applies: the most specific matching identity wins.
    func currentRule(_ n: JSON) -> JSON? {
        func score(_ w: JSON) -> Int { (str(w["bssid"]) == nil ? 0 : 1) + (str(w["security"]) == nil ? 0 : 1) }
        var best: JSON?
        for w in list("wifiRules") where networkMatches(n, w) {
            if best == nil || score(w) > score(best!) { best = w }
        }
        return best
    }
    /// resolveLoginAccounts: linked accounts in order, else the preferred account.
    func loginAccounts(_ n: JSON, _ rule: JSON?) -> [JSON] {
        let accounts = list("accounts")
        if rule == nil && list("wifiRules").contains(where: { str($0["ssid"]) == str(n["ssid"]) }) { return [] }
        if let rule {
            let linked = (rule["linkedAccountIds"] as? [String] ?? []).compactMap { id in accounts.first { str($0["id"]) == id } }
            if !linked.isEmpty { return linked }
        }
        guard let current = str(config["currentAccountId"]) else { return [] }
        return accounts.filter { str($0["id"]) == current }
    }
    func pauseBanner(in parent: NSStackView) {
        guard flag(settingsValue["autoAuthPaused"]) else { return }
        // `.banner`: gold outline, the message in gold text, the action on the right.
        let banner = box(.horizontal, in: parent, padding: NSEdgeInsets(top: 8, left: 14, bottom: 8, right: 8), spacing: 12,
                         fill: nil, stroke: NetMateColors.gold, radius: 8)
        let message = tag("自动认证已暂停", in: banner.content, size: 14, weight: .semibold, color: NetMateColors.goldText)
        message.setContentHuggingPriority(.init(1), for: .horizontal)
        button("恢复自动认证", in: banner.content) { [weak self] in
            guard let self else { return }
            self.mutate(self.setting("autoAuthPaused", false))
        }
    }
    func grade(_ value: Int, _ steps: [(Int, String, NSColor)], _ fallback: (String, NSColor)) -> (String, NSColor) {
        for (minimum, label, color) in steps where value >= minimum { return (label, color) }
        return fallback
    }
    /// Copy for the home account card and the column beside it; an active recovery phase
    /// replaces the status, copy, meta and actions in `accountCard`.
    struct Face {
        /// Lamp colour: `ok`, `warn`, `bad` or `idle`.
        var tone: String
        /// An empty dashed outline instead of a card face: no WiFi, no rule or no account.
        var void: Bool
        /// Cards stacked behind the front one (0–2).
        var backs = 0
        var issuer: String
        var place: String
        var status: String
        var headline: String
        var body: String
        var meta: [(String, String)]
        /// Note text and its style: `gold`, `bad` or empty.
        var notes: [(String, String)]
        var action: ((NSStackView) -> Void)? = nil
    }
    /// The top of the home page: the account card deck on the left, headline, copy, notes and
    /// actions beside it. The magnetic stripe at the card's foot is the retry progress.
    func accountCard(_ initial: Face, number: String?, in parent: NSStackView) {
        var view = initial
        let phase = snapshot["phase"] as? String ?? ""
        let states: [String: (String, Bool)] = ["connecting": ("正在连接", false), "authenticating": ("正在认证", false), "verifying": ("正在确认联网", false),
                                                "cooldown": ("等待下一轮重连", true), "failed": ("连接失败", true), "cancelled": ("已取消", true)]
        // Notes stack one per line in the narrow column beside the card.
        let notes = vstack(6); notes.alignment = .leading
        let actions = hstack(8)
        var progress: (CGFloat, Int, Int)?
        if let state = states[phase] {
            let (status, failed) = state
            let target = str(snapshot["targetId"]).flatMap { id in list("wifiRules").first { str($0["id"]) == id }.flatMap { str($0["ssid"]) } }
            let ssid = target ?? str((snapshot["network"] as? JSON)?["ssid"]) ?? ""
            let allFailed = failed && !(snapshot["failures"] as? [JSON] ?? []).isEmpty
            view.void = false
            view.tone = failed ? "bad" : "warn"
            view.status = status
            view.headline = allFailed ? "所有 WiFi 连接失败" : "WiFi 自动重连"
            var lines = [String]()
            if !ssid.isEmpty { lines.append("目标 WiFi：\(ssid)") }
            if let message = str(snapshot["message"]), !message.isEmpty { lines.append(message) }
            view.body = lines.joined(separator: "\n")
            view.meta = []
            if !ssid.isEmpty { view.place = ssid; view.meta.append(("目标 WiFi", ssid)) }
            let attempt = int(snapshot["attempt"]) ?? 0, maxAttempts = int(snapshot["maxAttempts"]) ?? 0
            if maxAttempts > 0 {
                view.meta.append(("尝试", "第 \(attempt) / \(maxAttempts) 次"))
                progress = (max(0, min(1, CGFloat(attempt) / CGFloat(maxAttempts))), attempt, maxAttempts)
            }
            view.notes = []
            let countdown = note("", "")
            countdown.isHidden = true
            notes.addArrangedSubview(countdown)
            countdowns.append((countdown as NSView, countdown.label, false))
            if failed { button("立即重试", in: actions) { [weak self] in self?.request("retry") }.primary = true }
            if phase != "failed" && phase != "cancelled" { button("停止恢复", in: actions) { [weak self] in self?.request("stop_recovery") } }
            // The home action stays reachable; while connecting it would only repeat the title.
            if failed { view.action?(actions) }
        } else {
            view.action?(actions)
        }
        let hero = hstack(40, in: parent, fill: true)
        hero.alignment = .centerY
        let deck = NetMateDeck(backs: view.void ? 0 : view.backs, shadow: !view.void)
        hero.addArrangedSubview(deck)
        let card = NetMateCardFace(void: view.void)
        deck.addFace(card)
        let face = card.content
        let c = NetMateColors.self
        let ink = view.void ? c.text : c.faceText
        let muted = view.void ? c.secondary : c.faceText2
        // `.id-top`: issuer and place in 11.5 px, tracked 0.12 em.
        let top = hstack(12, in: face, fill: true)
        let issuer = label(view.issuer, in: top, size: 11.5, color: muted, tracking: 0.12)
        issuer.setContentCompressionResistancePriority(.required, for: .horizontal)
        spacer(in: top)
        let place = label(view.place, in: top, size: 11.5, color: muted, tracking: 0.12)
        place.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        face.setCustomSpacing(18, after: top)
        let chip = NetMateChip(frame: .zero); chip.void = view.void
        face.addArrangedSubview(chip)
        face.setCustomSpacing(14, after: chip)
        // The lamp's 22 px box holds the 12 px dot and its 5 px ring; 8 + 5 keeps the 13 px gap.
        let status = hstack(8, in: face, fill: true)
        let lamp = NetMateLamp(frame: .zero); lamp.tone = view.tone
        status.addArrangedSubview(lamp)
        let title = label(view.status, in: status, size: 34, weight: .bold, color: ink, tracking: 0.01)
        title.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        let gap = NSView(); gap.translatesAutoresizingMaskIntoConstraints = false
        gap.setContentHuggingPriority(.init(1), for: .vertical)
        gap.setContentCompressionResistancePriority(.init(1), for: .vertical)
        face.addArrangedSubview(gap)
        let real = !view.void && number != nil
        let digits = label(real ? number ?? "" : "•••• •••• ••", in: face, size: 19, color: view.void ? c.faint : c.faceText, tracking: 0.2, mono: true)
        digits.isSelectable = real
        face.setCustomSpacing(8, after: digits)
        let meta = hstack(26, in: face)
        meta.alignment = .top
        for (key, value) in view.meta {
            let cell = vstack(0, in: meta, fill: false)
            tag(key, in: cell, size: 11, color: muted)
            let v = tag(value, in: cell, size: 13, weight: .medium, color: ink)
            v.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        }
        if let progress {
            let (fraction, attempt, maxAttempts) = progress
            let stripe = NetMateStripe(); stripe.fraction = fraction
            stripe.translatesAutoresizingMaskIntoConstraints = false
            stripe.setAccessibilityElement(true); stripe.setAccessibilityRole(.progressIndicator)
            stripe.setAccessibilityLabel("尝试进度"); stripe.setAccessibilityValue("\(attempt) / \(maxAttempts)")
            card.addSubview(stripe)
            NSLayoutConstraint.activate([
                stripe.leadingAnchor.constraint(equalTo: card.leadingAnchor), stripe.trailingAnchor.constraint(equalTo: card.trailingAnchor),
                stripe.bottomAnchor.constraint(equalTo: card.bottomAnchor), stripe.heightAnchor.constraint(equalToConstant: 6)
            ])
        }
        let side = vstack(12, in: hero, fill: false)
        side.setContentHuggingPriority(.init(1), for: .horizontal)
        side.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        text(view.headline, in: side, size: 21, weight: .bold)
        if !view.body.isEmpty { text(view.body, in: side, size: 14, color: c.secondary) }
        for (value, kind) in view.notes { notes.addArrangedSubview(note(value, kind)) }
        if !notes.arrangedSubviews.isEmpty { side.addArrangedSubview(notes) }
        if !actions.arrangedSubviews.isEmpty { side.addArrangedSubview(actions) }
    }
    /// WifiReconnectFailedCard: per-network reasons once every WiFi has failed.
    func recoveryFailures(in parent: NSStackView) {
        let failures = snapshot["failures"] as? [JSON] ?? []
        guard !failures.isEmpty, ["failed", "cooldown"].contains(snapshot["phase"] as? String ?? "") else { return }
        let (c, _) = panel("本轮尝试", in: parent)
        for failure in failures {
            let item = hairRow(in: c, .vertical, padding: insets(10, 0), spacing: 2)
            text(str(failure["ssid"]) ?? "", in: item.content, size: 14, weight: .semibold)
            text(str(failure["reason"]) ?? "", in: item.content, size: 12.5, color: NetMateColors.secondary)
        }
    }
    /// One strip cell: caption above a value row; cells after the first carry a left hairline.
    func stripCell(_ title: String, in strip: NetMateStrip) -> NSStackView {
        let divided = !strip.content.arrangedSubviews.isEmpty
        let cell = NetMateBox(.vertical, padding: NSEdgeInsets(top: 9, left: divided ? 16 : 0, bottom: 0, right: 8), spacing: 2)
        if divided { cell.leftRule = NetMateColors.line }
        strip.content.addArrangedSubview(cell)
        let caption = tag(title, in: cell.content, size: 11.5, color: NetMateColors.secondary)
        caption.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        let value = hstack(6, in: cell.content)
        value.alignment = .firstBaseline
        return value
    }
    /// Only the grade word carries the colour unless `color` says otherwise; the number stays in ink.
    func stripValue(_ value: String, color: NSColor = NetMateColors.ink, grade: (String, NSColor)? = nil, in row: NSStackView) {
        let v = tag(value, in: row, size: 18, weight: .bold, color: color)
        v.isSelectable = true
        v.setContentCompressionResistancePriority(.init(2), for: .horizontal)
        if let grade { tag(grade.0, in: row, size: 11.5, color: grade.1) }
    }
    /// Signal, speed, band, internet and heartbeat under one ink rule; the countdown label is the
    /// only view the one-second tick touches.
    func metricStrip(_ n: JSON, in parent: NSStackView) {
        let strip = NetMateStrip(); parent.addArrangedSubview(strip); fillWidth(strip, parent)
        var cell = stripCell("信号强度", in: strip)
        if let rssi = int(n["rssi"]) {
            let percent = max(0, min(100, (rssi + 100) * 100 / 60))
            stripValue("\(percent)%", grade: grade(percent, [(75, "优秀", NetMateColors.excellent), (50, "良好", NetMateColors.good), (25, "一般", NetMateColors.fair)], ("较差", NetMateColors.poor)), in: cell)
        } else { stripValue("未知", in: cell) }
        cell = stripCell("连接速度", in: strip)
        if let s = int(n["linkSpeed"]), s > 0 {
            stripValue("\(s) Mbps", grade: grade(s, [(500, "优秀", NetMateColors.excellent), (200, "良好", NetMateColors.good), (100, "一般", NetMateColors.fair), (50, "较差", NetMateColors.poor)], ("很差", NetMateColors.bad)), in: cell)
        } else { stripValue("未知", in: cell) }
        let f = int(n["frequency"]) ?? 0
        stripValue(f >= 5925 ? "6GHz" : (4900...5924).contains(f) ? "5GHz" : (2400...2500).contains(f) ? "2.4GHz" : "未知", in: stripCell("频段", in: strip))
        let online = flag(snapshot["internetReachable"])
        stripValue(online ? "可达" : "不可达", color: online ? NetMateColors.ok : NetMateColors.bad, in: stripCell("互联网", in: strip))
        guard flag(settingsValue["enableHeartbeat"]) else {
            stripValue("已关闭", color: NetMateColors.secondary, in: stripCell("心跳检测", in: strip)); return
        }
        cell = stripCell("心跳检测 · 每 \(int(settingsValue["heartbeatIntervalSeconds"]) ?? 30) 秒", in: strip)
        stripValue(online ? "正常" : "异常", color: online ? NetMateColors.ok : NetMateColors.bad, in: cell)
        let countdown = tag("", in: cell, size: 11.5, color: NetMateColors.secondary)
        countdown.font = .monospacedDigitSystemFont(ofSize: 11.5, weight: .regular)
        countdown.isHidden = true
        countdowns.append((countdown as NSView, countdown, true))
    }
    /// A `.kv` row: key on the left, the value right-aligned and char-wrapped.
    func kvRow(_ key: String, _ value: String, mono: Bool, in parent: NSStackView) {
        let line = hairRow(in: parent, padding: insets(4, 0), spacing: 16, minHeight: 42)
        let k = tag(key, in: line.content, size: 14, color: NetMateColors.secondary)
        k.setContentHuggingPriority(.required, for: .horizontal)
        k.setContentCompressionResistancePriority(.required, for: .horizontal)
        let v = NSTextField(wrappingLabelWithString: value)
        v.isSelectable = true; v.alignment = .right; v.lineBreakMode = .byCharWrapping
        v.font = mono ? .monospacedSystemFont(ofSize: 13, weight: .medium) : .systemFont(ofSize: 14, weight: .medium)
        v.textColor = NetMateColors.text
        v.setContentHuggingPriority(.init(1), for: .horizontal)
        v.setContentCompressionResistancePriority(.init(249), for: .horizontal)
        line.content.addArrangedSubview(v)
    }
    /// 网络详情: key/value rows with right-aligned values.
    func wifiDetails(_ n: JSON, in parent: NSStackView) {
        let (c, head) = panel("网络详情", in: parent)
        iconButton("arrow.clockwise", "刷新 WiFi 信息", in: head) { [weak self] in
            self?.request("snapshot") { value in if let value = value as? JSON { self?.applyState(value) } }
        }.quiet = true
        for (key, value, mono) in [("WiFi 名称", str(n["ssid"]), false), ("IPv4 地址", str(n["ipv4"]), true), ("IPv6 地址", str(n["ipv6"]), true),
                                   ("BSSID", str(n["bssid"]), true), ("WiFi 信道", str(n["channel"]), true), ("安全类型", str(n["security"]), false)] {
            kvRow(key, value ?? "未知", mono: mono, in: c)
        }
        guard flag(settingsValue["enableHeartbeat"]) else { return }
        var notes = [String]()
        if let message = str(snapshot["message"]), !message.isEmpty { notes.append(message) }
        if flag(snapshot["monitorDegraded"]) { notes.append("系统网络事件监听不可用，已改为定时检测") }
        if !notes.isEmpty {
            let row = hairRow(in: c, .vertical, padding: insets(10, 0))
            text(notes.joined(separator: "\n"), in: row.content, size: 12.5, color: NetMateColors.secondary)
        }
    }
    /// Left column while no WiFi is connected and heartbeat is enabled.
    func heartbeatPaused(in parent: NSStackView) {
        let (c, _) = panel("心跳检测 (已暂停)", in: parent)
        let row = hairRow(in: c, .vertical, padding: insets(10, 0))
        text("当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。", in: row.content, size: 12.5, color: NetMateColors.secondary)
    }
    /// WifiSwitcherCard: configured networks ordered by priority, in fixed columns so badges and
    /// actions line up: rank 44 | name and subtitle | badge 92 | action 70.
    func switcher(current: JSON?, in cols: NSStackView) {
        let rules = list("wifiRules").sorted { (int($0["priority"]) ?? 10) < (int($1["priority"]) ?? 10) }
        guard !rules.isEmpty else { return }
        let switching = ["connecting", "authenticating", "verifying"].contains(snapshot["phase"] as? String ?? "")
        let column = vstack(0, in: cols, fill: false)
        let (c, head) = panel("切换 WiFi", in: column)
        tag("按优先级排序", in: head, size: 12.5, color: NetMateColors.secondary)
        for wifi in rules {
            let id = str(wifi["id"]) ?? "", ssid = str(wifi["ssid"]) ?? ""
            let priority = int(wifi["priority"]) ?? 10
            let isCurrent = current.map { str($0["id"]) == id } ?? false
            let item = hairRow(in: c, padding: insets(10, 0), spacing: 12)
            let rank = label(String(format: "%02ld", priority), in: item.content, size: 21, weight: .bold,
                             color: isCurrent ? NetMateColors.gold : NetMateColors.faint, mono: true)
            rank.widthAnchor.constraint(equalToConstant: 44).isActive = true
            let info = vstack(1, in: item.content, fill: false)
            info.setContentHuggingPriority(.init(1), for: .horizontal)
            info.setContentCompressionResistancePriority(.init(1), for: .horizontal)
            let name = tag(ssid, in: info, size: 14, weight: .semibold)
            let sub = tag((["优先级 \(priority)"] + [str(wifi["security"]), str(wifi["bssid"])].compactMap { $0 }).joined(separator: " · "),
                          in: info, size: 12.5, color: NetMateColors.secondary)
            for l in [name, sub] { l.setContentCompressionResistancePriority(.init(1), for: .horizontal) }
            let slot = hstack(0, in: item.content)
            slot.widthAnchor.constraint(equalToConstant: 92).isActive = true
            let auth = flag(wifi["requiresAuth"])
            badge(auth ? "校园网认证" : "普通热点", auth ? NetMateColors.goldText : NetMateColors.secondary,
                  border: auth ? NetMateColors.gold : NetMateColors.line, in: slot)
            let end = hstack(4, in: item.content)
            end.widthAnchor.constraint(equalToConstant: 70).isActive = true
            spacer(in: end)
            if isCurrent {
                icon("checkmark", size: 12, color: NetMateColors.ok, in: end)
                tag("当前", in: end, size: 13, weight: .semibold, color: NetMateColors.ok)
            } else {
                let b = button("切换", in: end, name: "切换到 \(ssid)") { [weak self] in self?.request("connect", ["id": id]) }
                b.compact = true
                b.isEnabled = !switching
            }
        }
    }
    func startTicking() {
        guard !countdowns.isEmpty else { return }
        tick()
        guard ticker == nil else { return }
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            guard let self, !self.countdowns.isEmpty, self.page == "运行状态" else { timer.invalidate(); self?.ticker = nil; return }
            self.tick()
        }
    }
    func tick() {
        func remaining(_ key: String) -> Int64? {
            guard let deadline = (snapshot[key] as? NSNumber)?.int64Value else { return nil }
            return (max(0, deadline - nowMs()) + 999) / 1000
        }
        for (view, label, heartbeat) in countdowns {
            if heartbeat {
                if let s = remaining("nextHeartbeatAt"), s > 0 { label.stringValue = "\(s)s 后检测"; view.isHidden = false } else { view.isHidden = true }
            } else {
                if let s = remaining("nextRetryAt") { label.stringValue = "剩余 \(s) 秒后重试"; view.isHidden = false } else { view.isHidden = true }
            }
        }
    }
}

// MARK: 配置设置
extension App {
    /// `.set` with a number: the label on the left, field and stepper on the right; it saves
    /// 600 ms after the last change.
    func numberRow(_ key: String, _ title: String, _ range: ClosedRange<Int>, _ value: Int, in parent: NSStackView) {
        let line = hairRow(in: parent, padding: insets(10, 0), spacing: 24, minHeight: 46)
        let name = text(title, in: line.content, size: 14, weight: .medium)
        name.setContentHuggingPriority(.init(1), for: .horizontal)
        let field = inputField("\(value)", name: title)
        field.font = .monospacedDigitSystemFont(ofSize: 13.5, weight: .regular)
        field.alignment = .right
        field.widthAnchor.constraint(equalToConstant: 72).isActive = true
        let stepper = NSStepper(); stepper.minValue = Double(range.lowerBound); stepper.maxValue = Double(range.upperBound)
        stepper.increment = 1; stepper.valueWraps = false; stepper.integerValue = value
        stepper.setAccessibilityLabel(title)
        line.content.addArrangedSubview(field); line.content.addArrangedSubview(stepper)
        line.content.setCustomSpacing(4, after: field)
        let schedule: (Int) -> Void = { [weak self] number in
            guard let self else { return }
            self.debounces[key]?.invalidate()
            self.debounces[key] = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: false) { [weak self] _ in
                guard let self else { return }
                self.debounces[key] = nil
                self.mutate(self.setting(key, number))
            }
        }
        onChange(field) { text in
            guard let number = Int(text.trimmingCharacters(in: .whitespaces)) else { return }
            let clamped = min(max(number, range.lowerBound), range.upperBound)
            stepper.integerValue = clamped; schedule(clamped)
        }
        bind(stepper) { [weak stepper, weak field] in
            guard let stepper else { return }
            field?.stringValue = "\(stepper.integerValue)"; schedule(stepper.integerValue)
        }
    }
    func settingsPage(_ content: NSStackView) {
        guard !config.isEmpty else { text("加载中...", in: content); return }
        let settings = settingsValue
        pauseBanner(in: content)
        accounts(in: content)
        wifis(in: content)
        // Two columns as in the prototype: 通用设置 | 附近 WiFi and 通知设置.
        let cols = hstack(32, in: content, fill: true)
        cols.distribution = .fillEqually; cols.alignment = .top
        let left = vstack(24, in: cols, fill: false)
        let right = vstack(24, in: cols, fill: false)
        let general = section("通用设置", in: left).content
        for (key, title, desc) in [
            ("autoLaunch", "开机自动启动", ""),
            ("enableHeartbeat", "启用心跳检测", "按间隔检测网络；关闭后仅在 WiFi 变化时检测，另有 30 秒兜底检查"),
            ("autoReconnect", "断线自动重连", "认证失效时自动登录；WiFi 断开时按优先级重连已开启自动连接的 WiFi"),
            ("startupAutoConnect", "启动时自动连接", "启动时若未连接 WiFi，按优先级连接已配置的 WiFi"),
            ("keepCurrentConnection", "保持当前连接", "启动时已连接其他 WiFi 则不切换；关闭后切换到附近最高优先级的已配置 WiFi"),
            ("autoUpdate", "自动检查更新", "启动后自动检查新版本")
        ] {
            setRow(title, desc, flag(settings[key]), in: general) { [weak self] value in
                guard let self else { return }
                self.mutate(self.setting(key, value))
            }
        }
        var fields = [(String, String, ClosedRange<Int>)]()
        if flag(settings["enableHeartbeat"]) {
            fields.append(("heartbeatIntervalSeconds", "心跳检测间隔 (秒)", 5...300))
            fields.append(("heartbeatFailureThreshold", "连续失败阈值 (次，已在线后连续检测失败达到该次数才重新认证)", 1...10))
        }
        fields.append(("wifiReconnectRetries", "每个 WiFi 最多尝试次数（含首次）", 1...10))
        fields.append(("wifiReconnectCooldownMinutes", "冷却期时长 (分钟，全部 WiFi 失败后暂停重连；0 为不冷却)", 0...1440))
        for (key, title, range) in fields { numberRow(key, title, range, int(settings[key]) ?? range.lowerBound, in: general) }
        nearby(in: right)
        let notices = section("通知设置", in: right).content
        let current = settings["notificationSettings"] as? JSON ?? [:]
        for (key, title) in [("wifiDisconnected", "WiFi 断开"), ("reconnectSuccess", "自动重连成功"), ("reconnectFailed", "自动重连全部失败"), ("authRecovered", "认证恢复成功")] {
            setRow(title, "", (current[key] as? Bool) != false, in: notices) { [weak self] value in
                self?.mutate { c in
                    var s = c["settings"] as? JSON ?? [:]
                    var n = s["notificationSettings"] as? JSON ?? [:]
                    n[key] = value; s["notificationSettings"] = n; c["settings"] = s
                }
            }
        }
    }
    /// `.sec-note`: a small secondary line on its own hairline.
    func sectionNote(_ value: String, in parent: NSStackView) {
        let row = hairRow(in: parent, .vertical, padding: insets(10, 0))
        text(value, in: row.content, size: 12.5, color: NetMateColors.secondary)
    }
    func nearby(in content: NSStackView) {
        let (c, head) = panel("附近 WiFi", in: content)
        sectionNote("扫描附近网络，选择后添加配置或编辑已保存的网络。", in: c)
        let b = button(scanning ? "扫描中…" : "扫描附近 WiFi", in: head) { [weak self] in
            guard let self, !self.scanning else { return }
            self.scanning = true
            if let b = self.scanButton { b.title = "扫描中…"; b.isEnabled = false; b.invalidateIntrinsicContentSize() }
            self.request("scan", nil, { [weak self] value in
                guard let self else { return }
                self.scan = value as? [JSON] ?? []; self.scanning = false
                if self.page == "配置设置" { self.render() }
            }, failed: { [weak self] _ in
                guard let self else { return }
                self.scanning = false
                if let b = self.scanButton { b.title = "扫描附近 WiFi"; b.isEnabled = true; b.invalidateIntrinsicContentSize() }
            })
        }
        b.quiet = true
        b.isEnabled = !scanning; scanButton = b
        guard let networks = scan else { return }
        if networks.isEmpty { sectionNote("未发现网络，请确认 WiFi 已开启，或手动填写 WiFi 名称。", in: c); return }
        for n in networks {
            let saved = currentRule(n)
            let item = hairRow(in: c, padding: insets(9, 0), spacing: 12)
            var parts = [str(n["ssid"]) ?? ""]
            if let rssi = int(n["rssi"]) { parts.append("\(max(0, min(100, (rssi + 100) * 100 / 60)))%") }
            if let s = str(n["security"]) { parts.append(s) }
            if let b = str(n["bssid"]) { parts.append(b) }
            if saved != nil { parts.append("已保存") }
            let l = text(parts.joined(separator: " · "), in: item.content, size: 14)
            l.setContentHuggingPriority(.init(1), for: .horizontal)
            spacer(in: item.content)
            let ssid = str(n["ssid"]) ?? ""
            if let saved {
                let id = str(saved["id"])
                button("编辑", in: item.content, name: "编辑网络 \(ssid)") { [weak self] in
                    guard let self, let rule = self.list("wifiRules").first(where: { str($0["id"]) == id }) else { return }
                    self.wifiEditor(rule)
                }
            } else {
                button("选择", in: item.content, name: "选择网络 \(ssid)") { [weak self] in
                    guard let self else { return }
                    self.drafts["wifi.ssid"] = str(n["ssid"]) ?? ""
                    self.drafts["wifi.security"] = str(n["security"]) ?? ""
                    self.drafts["wifi.bssid"] = str(n["bssid"]) ?? ""
                    self.render()
                }
            }
        }
    }
    /// `.form-heading`: 12.5 px semibold, tracked, 16 above.
    func formHeading(_ title: String, in parent: NSStackView) {
        if let last = parent.arrangedSubviews.last { parent.setCustomSpacing(16, after: last) }
        let h = label(title, in: parent, size: 12.5, weight: .semibold, color: NetMateColors.secondary, tracking: 0.06)
        parent.setCustomSpacing(14, after: h)
    }
    func accounts(in content: NSStackView) {
        let panel = section("", in: content)
        // CI finds this page through the section's accessible name.
        panel.setAccessibilityElement(true); panel.setAccessibilityRole(.group)
        panel.setAccessibilityLabel("账号配置"); panel.setAccessibilityIdentifier("账号配置")
        let c = panel.content
        let head = sectionHead("账号管理", in: c)
        tag("按顺序依次认证", in: head, size: 12.5, color: NetMateColors.secondary)
        let accounts = list("accounts")
        if accounts.isEmpty { emptyBox("person.crop.circle", "暂无账号，请添加账号以使用登录功能", in: c) }
        for account in accounts {
            let item = hairRow(in: c, padding: insets(12, 0), spacing: 14)
            let id = str(account["id"])
            let isCurrent = id != nil && id == str(config["currentAccountId"])
            // A small card face: gold chip for the account in use, greyed out for the others.
            let mini = NetMateMiniCard(frame: .zero); mini.on = isCurrent
            item.content.addArrangedSubview(mini)
            let info = vstack(2, in: item.content, fill: false)
            info.setContentHuggingPriority(.init(1), for: .horizontal)
            info.setContentCompressionResistancePriority(.init(1), for: .horizontal)
            let username = str(account["username"]) ?? ""
            label(username, in: info, size: 14, weight: .semibold, color: NetMateColors.text, tracking: 0.06, mono: true)
            let sub = ([ispLabel(str(account["isp"]) ?? "")] + [str(account["serverUrl"])].compactMap { $0 }.filter { !$0.isEmpty }).joined(separator: " · ")
            tag(sub, in: info, size: 12.5, color: NetMateColors.secondary).setContentCompressionResistancePriority(.init(1), for: .horizontal)
            let actions = hstack(6, in: item.content)
            if isCurrent {
                let inuse = tag("使用中", in: actions, size: 12.5, weight: .semibold, color: NetMateColors.ok)
                actions.setCustomSpacing(12, after: inuse)
            } else {
                button("使用此账号", in: actions) { [weak self] in
                    self?.mutate { c in c["currentAccountId"] = id.map { $0 as Any } ?? NSNull() }
                }
            }
            button("编辑", in: actions, name: "编辑账号 \(username)") { [weak self] in self?.accountEditor(account) }
            iconButton("trash", "删除账号 \(username)", in: actions) { [weak self] in self?.removeAccount(id) }.destructive = true
        }
        formHeading("添加新账号", in: c)
        // Fields side by side as in the prototype: 用户名 | 密码 | 运营商, then server and the button.
        let fields = hstack(10, in: c, fill: true)
        fields.distribution = .fillEqually; fields.alignment = .top
        let user = draftEntry("account.username", "用户名", "用户名", "请输入学号/用户名", in: fields)
        let password = draftEntry("account.password", "密码", "密码", "请输入密码", secure: true, in: fields)
        let isp = formGroup("运营商", in: fields)
        let ispValues = ["campus", "cmcc", "cucc", "ctcc"]
        let ispSelect = dropdown(ispValues.map(ispLabel), name: "运营商", selected: ispValues.firstIndex(of: draft("account.isp", "campus")) ?? 0) { [weak self] index in
            self?.drafts["account.isp"] = ispValues[index]
        }
        isp.addArrangedSubview(ispSelect); fillWidth(ispSelect, isp)
        c.setCustomSpacing(10, after: fields)
        if drafts["account.server"] == nil { drafts["account.server"] = "http://10.10.102.50:801" }
        let submit = hstack(10, in: c, fill: true)
        submit.alignment = .bottom
        let server = draftEntry("account.server", "登录服务器地址", "登录服务器地址", "", in: submit)
        server.superview?.setContentHuggingPriority(.init(1), for: .horizontal)
        button("保存并添加账号", in: submit) { [weak self] in
            guard let self else { return }
            let username = user.stringValue.trimmingCharacters(in: .whitespaces)
            let secret = password.stringValue
            var error: String?
            if username.isEmpty || secret.isEmpty { error = "请输入用户名和密码" }
            else if self.list("accounts").contains(where: { str($0["username"]) == username }) { error = "该用户名已存在" }
            if let error { self.drafts["account.error"] = error; self.render(); return }
            self.drafts.removeValue(forKey: "account.error")
            let id = "account-\(nowMs())"
            let account: JSON = ["id": id, "name": username, "username": username,
                                 "serverUrl": server.stringValue.trimmingCharacters(in: .whitespaces),
                                 "isp": self.draft("account.isp", "campus"),
                                 "passwordEdit": ["action": "replace", "value": secret]]
            self.clearOnSave.append("account.")
            self.mutate { c in
                var list = c["accounts"] as? [JSON] ?? []; list.append(account); c["accounts"] = list
                if str(c["currentAccountId"]) == nil { c["currentAccountId"] = id }
            }
        }
        if let error = drafts["account.error"] {
            c.setCustomSpacing(10, after: submit)
            text(error, in: c, size: 13, color: NetMateColors.errorText)
        }
    }
    func removeAccount(_ id: String?) {
        mutate { c in
            c["accounts"] = (c["accounts"] as? [JSON] ?? []).filter { str($0["id"]) != id }
            if str(c["currentAccountId"]) == id { c["currentAccountId"] = NSNull() }
            c["wifiRules"] = (c["wifiRules"] as? [JSON] ?? []).map { rule -> JSON in
                var rule = rule
                rule["linkedAccountIds"] = (rule["linkedAccountIds"] as? [String] ?? []).filter { $0 != id }
                return rule
            }
        }
    }
    func sameIdentity(_ rule: JSON, _ ssid: String, _ security: String?, _ bssid: String?) -> Bool {
        guard str(rule["ssid"]) == ssid else { return false }
        if security == nil && bssid == nil { return true }
        return str(rule["security"]).map(normalizedSecurity) == security.map(normalizedSecurity)
            && str(rule["bssid"])?.lowercased() == bssid?.lowercased()
    }
    func wifis(in content: NSStackView) {
        let c = section("WiFi 配置", in: content).content
        sectionNote("配置WiFi网络及其连接选项。新添加的WiFi默认启用自动重连，WiFi断开后会自动尝试重新连接。点击刷新图标按钮可切换自动重连状态。", in: c)
        let accounts = list("accounts")
        let rules = list("wifiRules")
        if rules.isEmpty { emptyBox("wifi", "暂无 WiFi 配置", in: c) }
        for wifi in rules {
            let item = hairRow(in: c, padding: insets(11, 0), spacing: 12)
            let ssid = str(wifi["ssid"]) ?? ""
            let auth = flag(wifi["requiresAuth"]), auto = flag(wifi["autoConnect"])
            let priority = int(wifi["priority"]) ?? 10
            let rank = label(String(format: "%02ld", priority), in: item.content, size: 21, weight: .bold, color: NetMateColors.gold, mono: true)
            rank.widthAnchor.constraint(equalToConstant: 44).isActive = true
            rank.toolTip = "优先级 \(priority)"
            let info = vstack(2, in: item.content, fill: false)
            info.setContentHuggingPriority(.init(1), for: .horizontal)
            info.setContentCompressionResistancePriority(.init(1), for: .horizontal)
            tag(ssid, in: info, size: 14, weight: .semibold).setContentCompressionResistancePriority(.init(1), for: .horizontal)
            var sub = [String]()
            if auth {
                let linked = (wifi["linkedAccountIds"] as? [String] ?? []).compactMap { id in accounts.first { str($0["id"]) == id } }
                    .map { "\(str($0["username"]) ?? "") (\(ispLabel(str($0["isp"]) ?? "")) - \(str($0["serverUrl"]) ?? ""))" }
                if linked.isEmpty { text("未关联账号（账号可能已删除）", in: info, size: 12.5, color: NetMateColors.errorText) }
                else { sub.append("关联账号: \(linked.joined(separator: "，"))") }
            }
            sub.append(auto ? "断开后自动重连" : "手动连接")
            text(sub.joined(separator: " · "), in: info, size: 12.5, color: NetMateColors.secondary)
            if auth { badge("需要认证", NetMateColors.goldText, border: NetMateColors.gold, in: item.content) }
            else { badge("无需认证", NetMateColors.secondary, border: NetMateColors.line, in: item.content) }
            let actions = hstack(8, in: item.content)
            let id = str(wifi["id"]) ?? ""
            let toggle = iconButton("arrow.clockwise", auto ? "禁用 \(ssid) 自动重连" : "启用 \(ssid) 自动重连", in: actions) { [weak self] in
                self?.mutate { c in
                    c["wifiRules"] = (c["wifiRules"] as? [JSON] ?? []).map { w -> JSON in
                        var w = w; if str(w["id"]) == id { w["autoConnect"] = !flag(w["autoConnect"]) }; return w
                    }
                }
            }
            toggle.tint = auto ? NetMateColors.ok : NetMateColors.secondary
            button("连接", in: actions, name: "连接 \(ssid)") { [weak self] in self?.request("connect", ["id": id]) }
            button("编辑", in: actions, name: "编辑 WiFi \(ssid)") { [weak self] in self?.wifiEditor(wifi) }
            iconButton("trash", "删除 WiFi \(ssid)", in: actions) { [weak self] in
                self?.mutate { c in c["wifiRules"] = (c["wifiRules"] as? [JSON] ?? []).filter { str($0["id"]) != id } }
            }.destructive = true
        }
        formHeading("添加 WiFi", in: c)
        let ssid = draftEntry("wifi.ssid", "WiFi 名称 (SSID)", "WiFi 名称", "请输入 WiFi 名称", in: c)
        let security = draftEntry("wifi.security", "安全类型（留空自动识别）", "安全类型", "WPA2 / WPA3 / WPA2-WPA3 / Open", in: c)
        let bssid = draftEntry("wifi.bssid", "BSSID（可选，限定接入点）", "BSSID", "aa:bb:cc:dd:ee:ff", in: c)
        let password = draftEntry("wifi.password", "WiFi 密码", "WiFi 密码", "请输入 WiFi 密码（可选）", secure: true, in: c)
        let auth = draft("wifi.auth", "1") == "1"
        for (key, title, desc, value) in [("wifi.auth", "需要校园网认证", "关闭则视为家庭/热点网络", auth),
                                          ("wifi.auto", "断开后自动重连", "关闭后需手动连接此 WiFi", draft("wifi.auto", "1") == "1")] {
            checkRow(title, desc, value, in: c) { [weak self] on in
                guard let self else { return }
                self.drafts[key] = on ? "1" : "0"
                if key == "wifi.auth" { self.drafts.removeValue(forKey: "wifi.account"); self.render() }
            }
        }
        if auth {
            let group = formGroup("关联账号", in: c)
            if accounts.isEmpty {
                let warning = box(.vertical, in: group, padding: insets(8, 12), fill: nil, stroke: NetMateColors.warn, radius: 8)
                text("请先在上方「账号管理」添加账号", in: warning.content, size: 13.5, color: NetMateColors.warn)
            } else {
                let tiles = NSHashTable<NetMateTile>.weakObjects()
                let selected = draft("wifi.account")
                for account in accounts {
                    let id = str(account["id"]) ?? "", name = str(account["username"]) ?? ""
                    let tile = NetMateTile(); tile.selected = selected == id
                    tile.setAccessibilityLabel("选择账号 \(name)")
                    tag(name, in: tile.content, size: 14, weight: .semibold)
                    tag("\(ispLabel(str(account["isp"]) ?? "")) · \(str(account["serverUrl"]) ?? "")", in: tile.content, size: 12, color: NetMateColors.secondary)
                    tile.onPress = { [weak self, weak tile] in
                        self?.drafts["wifi.account"] = id
                        for other in tiles.allObjects { other.selected = other === tile }
                    }
                    tiles.add(tile)
                    group.addArrangedSubview(tile); fillWidth(tile, group)
                }
            }
        }
        let group = formGroup("优先级", in: c)
        let line = hstack(4, in: group)
        let priority = inputField(draft("wifi.priority", "10"), name: "WiFi 优先级")
        priority.font = .monospacedDigitSystemFont(ofSize: 13.5, weight: .regular)
        priority.widthAnchor.constraint(equalToConstant: 140).isActive = true
        let stepper = NSStepper(); stepper.minValue = 1; stepper.maxValue = 99; stepper.increment = 1
        stepper.integerValue = Int(draft("wifi.priority", "10")) ?? 10
        stepper.setAccessibilityLabel("WiFi 优先级")
        line.addArrangedSubview(priority); line.addArrangedSubview(stepper)
        onChange(priority) { [weak self, weak stepper] value in
            self?.drafts["wifi.priority"] = value
            if let n = Int(value) { stepper?.integerValue = n }
        }
        bind(stepper) { [weak self, weak stepper, weak priority] in
            guard let stepper else { return }
            priority?.stringValue = "\(stepper.integerValue)"; self?.drafts["wifi.priority"] = "\(stepper.integerValue)"
        }
        text("数字越小优先级越高（1=最高，99=最低，默认=10）", in: group, size: 12.5, color: NetMateColors.secondary)
        if let error = drafts["wifi.error"] {
            let message = text(error, in: c, size: 13, color: NetMateColors.errorText)
            c.setCustomSpacing(10, after: message)
        }
        let add = button("添加 WiFi", in: c) { [weak self] in
            guard let self else { return }
            let name = ssid.stringValue.trimmingCharacters(in: .whitespaces)
            let secret = password.stringValue
            let typed = security.stringValue.trimmingCharacters(in: .whitespaces)
            let resolved: String? = !secret.isEmpty && (typed.isEmpty || typed.lowercased() == "open") ? "WPA2" : (typed.isEmpty ? nil : typed)
            let typedBssid = bssid.stringValue.trimmingCharacters(in: .whitespaces)
            let ap: String? = typedBssid.isEmpty ? nil : typedBssid
            let auth = self.draft("wifi.auth", "1") == "1"
            let account = self.draft("wifi.account")
            // Without a typed security or BSSID any rule with the same name counts as a duplicate.
            let loose = typed.isEmpty && ap == nil
            let exists = self.list("wifiRules").contains { loose ? self.sameIdentity($0, name, nil, nil) : self.sameIdentity($0, name, resolved, ap) }
            var error: String?
            if name.isEmpty { error = "请输入 WiFi 名称" }
            else if exists { error = "该 WiFi 配置已存在" }
            else if auth && account.isEmpty { error = "需要认证的 WiFi 必须选择关联账号" }
            if let error { self.drafts["wifi.error"] = error; self.render(); return }
            self.drafts.removeValue(forKey: "wifi.error")
            let rule: JSON = [
                "id": "wifi-\(nowMs())", "ssid": name,
                "passwordEdit": secret.isEmpty ? ["action": "clear"] : ["action": "replace", "value": secret],
                "security": resolved.map { $0 as Any } ?? NSNull(), "bssid": ap.map { $0 as Any } ?? NSNull(),
                "priority": min(max(Int(self.draft("wifi.priority", "10")) ?? 10, 1), 99),
                "autoConnect": self.draft("wifi.auto", "1") == "1", "requiresAuth": auth,
                "linkedAccountIds": auth ? [account] : [String]()
            ]
            self.clearOnSave.append("wifi.")
            self.mutate { c in var list = c["wifiRules"] as? [JSON] ?? []; list.append(rule); c["wifiRules"] = list }
        }
        add.isEnabled = !(auth && accounts.isEmpty)
    }
}

// MARK: Edit sheets
extension App {
    func makeSheet(_ title: String, height: CGFloat = 620) -> (NSWindow, NSStackView) {
        let sheet = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: height), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        // The app holds the sheet; AppKit must not release it on close as well.
        sheet.isReleasedWhenClosed = false
        sheet.title = title; sheet.delegate = self
        let background = NetMateBackground()
        sheet.contentView = background
        let (scroll, box) = scrolled(in: background)
        box.spacing = 8
        box.edgeInsets = NSEdgeInsets(top: 28, left: 32, bottom: 28, right: 32)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: background.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: background.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: background.topAnchor), scroll.bottomAnchor.constraint(equalTo: background.bottomAnchor)
        ])
        cardTitle(title, in: box)
        window.beginSheet(sheet)
        return (sheet, box)
    }
    func passwordEdit(_ field: NSTextField, _ clear: NSButton) -> JSON {
        if clear.state == .on { return ["action": "clear"] }
        if field.stringValue.isEmpty { return ["action": "keep"] }
        return ["action": "replace", "value": field.stringValue]
    }
    func putItem(_ field: String, _ item: JSON) {
        mutate { c in
            var items = c[field] as? [JSON] ?? []
            if let i = items.firstIndex(where: { str($0["id"]) == str(item["id"]) }) { items[i] = item } else { items.append(item) }
            c[field] = items
        }
    }
    func accountEditor(_ old: JSON) {
        let (sheet, b) = makeSheet("编辑账号")
        let name = entry("显示名称", str(old["name"]) ?? "", in: b)
        let user = entry("用户名", str(old["username"]) ?? "", in: b)
        let pw = entry("密码（留空保留）", "", secure: true, in: b)
        let clear = check("清空已保存密码", false, in: b)
        let server = entry("登录服务器地址", str(old["serverUrl"]) ?? "", in: b)
        let group = formGroup("运营商", in: b)
        let values = ["campus", "cmcc", "cucc", "ctcc"]
        let isp = dropdown(values.map(ispLabel), name: "运营商", selected: values.firstIndex(of: str(old["isp"]) ?? "") ?? 0)
        group.addArrangedSubview(isp); fillWidth(isp, group)
        let actions = hstack(8, in: b)
        let id = old["id"] ?? NSNull()
        button("保存", in: actions) { [weak self] in
            guard let self else { return }
            self.putItem("accounts", ["id": id, "name": name.stringValue, "username": user.stringValue.trimmingCharacters(in: .whitespaces),
                                      "serverUrl": server.stringValue.trimmingCharacters(in: .whitespaces),
                                      "isp": values[max(0, isp.indexOfSelectedItem)], "passwordEdit": self.passwordEdit(pw, clear)])
            self.closeSheet(sheet)
        }
        button("删除账号", in: actions) { [weak self] in self?.removeAccount(str(id)); self?.closeSheet(sheet) }
        button("取消", in: actions) { [weak self] in self?.closeSheet(sheet) }
    }
    func wifiEditor(_ old: JSON) {
        let (sheet, b) = makeSheet("编辑 WiFi", height: 680)
        let ssid = entry("WiFi 名称 (SSID)", str(old["ssid"]) ?? "", in: b)
        let pw = entry("WiFi 密码（留空保留）", "", secure: true, in: b)
        let clear = check("清空密码（开放网络）", false, in: b)
        let sec = entry("安全类型（留空自动识别）", str(old["security"]) ?? "", in: b)
        let bssid = entry("BSSID（可选，限定接入点）", str(old["bssid"]) ?? "", in: b)
        let priority = entry("优先级", "\(int(old["priority"]) ?? 10)", in: b)
        priority.setAccessibilityLabel("WiFi 优先级")
        let auto = check("断开后自动重连", flag(old["autoConnect"]), in: b)
        let auth = check("需要校园网认证", flag(old["requiresAuth"]), in: b)
        let group = formGroup("关联账号（按下面顺序尝试；可调整序号）", in: b)
        let ids = old["linkedAccountIds"] as? [String] ?? []
        var linked = [(String, NSButton, NSTextField)]()
        for account in list("accounts") {
            let id = str(account["id"]) ?? ""
            let line = hstack(12, in: group, fill: true)
            let title = str(account["name"]).flatMap { $0.isEmpty ? nil : $0 } ?? str(account["username"]) ?? "账号"
            let checked = check(title, ids.contains(id), in: line)
            checked.setContentHuggingPriority(.init(1), for: .horizontal)
            let order = inputField("\((ids.firstIndex(of: id) ?? 99) + 1)", name: "\(title) 尝试顺序")
            order.widthAnchor.constraint(equalToConstant: 80).isActive = true
            line.addArrangedSubview(order)
            linked.append((id, checked, order))
        }
        let actions = hstack(8, in: b)
        let id = old["id"] ?? NSNull()
        button("保存", in: actions) { [weak self] in
            guard let self else { return }
            let order = linked.filter { $0.1.state == .on }.sorted { $0.2.integerValue < $1.2.integerValue }.map { $0.0 }
            let security = sec.stringValue.trimmingCharacters(in: .whitespaces)
            let ap = bssid.stringValue.trimmingCharacters(in: .whitespaces)
            self.putItem("wifiRules", [
                "id": id, "ssid": ssid.stringValue.trimmingCharacters(in: .whitespaces), "passwordEdit": self.passwordEdit(pw, clear),
                "security": security.isEmpty ? NSNull() : security as Any, "bssid": ap.isEmpty ? NSNull() : ap as Any,
                "priority": min(max(priority.integerValue, 1), 99), "autoConnect": auto.state == .on,
                "requiresAuth": auth.state == .on, "linkedAccountIds": order
            ])
            self.closeSheet(sheet)
        }
        button("删除网络", in: actions) { [weak self] in
            self?.mutate { c in c["wifiRules"] = (c["wifiRules"] as? [JSON] ?? []).filter { str($0["id"]) != str(id) } }
            self?.closeSheet(sheet)
        }
        button("取消", in: actions) { [weak self] in self?.closeSheet(sheet) }
    }
}

// MARK: 关于
extension App {
    /// Prototype layout: a version card beside the name, then 核心功能 | 更新检查 and 项目信息.
    func aboutPage(_ content: NSStackView) {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.0.0"
        let hero = hstack(36, in: content, fill: true)
        let card = NetMateCardFace(void: false)
        card.translatesAutoresizingMaskIntoConstraints = false
        hero.addArrangedSubview(card)
        NSLayoutConstraint.activate([card.widthAnchor.constraint(equalToConstant: 320), card.heightAnchor.constraint(equalToConstant: 200)])
        let face = card.content
        let top = hstack(12, in: face, fill: true)
        label("NETMATE", in: top, size: 11.5, color: NetMateColors.faceText2, tracking: 0.12)
        spacer(in: top)
        label("v\(version)", in: top, size: 11.5, color: NetMateColors.faceText2, mono: true)
        face.setCustomSpacing(18, after: top)
        let chip = NetMateChip(frame: .zero)
        face.addArrangedSubview(chip)
        face.setCustomSpacing(14, after: chip)
        label("NetMate", in: face, size: 30, weight: .bold, color: NetMateColors.faceText, tracking: 0.01)
        let gap = NSView(); gap.translatesAutoresizingMaskIntoConstraints = false
        gap.setContentHuggingPriority(.init(1), for: .vertical)
        gap.setContentCompressionResistancePriority(.init(1), for: .vertical)
        face.addArrangedSubview(gap)
        label("TUST CAMPUS NETWORK", in: face, size: 14, color: NetMateColors.faceText, tracking: 0.2, mono: true)
        let names = vstack(8, in: hero, fill: false)
        names.setContentHuggingPriority(.init(1), for: .horizontal)
        tag("NetMate", in: names, size: 30, weight: .bold, color: NetMateColors.heading)
        tag("智能 WiFi 管理工具", in: names, size: 14, color: NetMateColors.secondary)
        badge("版本 \(version)", NetMateColors.goldText, border: NetMateColors.gold, in: names)
        // Two equal columns: 核心功能 | 更新检查 and 项目信息.
        let columns = hstack(32, in: content, fill: true)
        columns.distribution = .fillEqually; columns.alignment = .top
        let left = vstack(0, in: columns, fill: false)
        let features = section("核心功能", in: left).content
        for item in ["WiFi 自动重连（三阶段优先级切换）", "校园网认证自动登录", "多账户管理", "网络状态监控", "心跳检测与断线重连"] {
            let line = hairRow(in: features, padding: insets(4, 0), spacing: 10, minHeight: 40)
            icon("checkmark", size: 13, color: NetMateColors.ok, in: line.content)
            tag(item, in: line.content, size: 14)
        }
        let side = vstack(24, in: columns, fill: false)
        let updates = section("更新检查", in: side).content
        let updateRow = hairRow(in: updates, padding: insets(4, 0), spacing: 12, minHeight: 42)
        let status = text("", in: updateRow.content, size: 14, color: NetMateColors.secondary)
        status.setContentHuggingPriority(.init(1), for: .horizontal)
        let actions = hstack(8, in: updateRow.content)
        updateLabel = status; updateActions = actions
        updateView()
        let links = section("项目信息", in: side).content
        let linkRow = hairRow(in: links, padding: insets(4, 0), spacing: 24, minHeight: 42)
        for (title, url) in [("GitHub 仓库", "https://github.com/Twiink/TUST-CampusNetwork-Login"),
                             ("问题反馈", "https://github.com/Twiink/TUST-CampusNetwork-Login/issues")] {
            let link = NSButton(title: title, target: nil, action: nil)
            link.isBordered = false
            link.attributedTitle = NSAttributedString(string: title, attributes: [.foregroundColor: NetMateColors.goldText, .font: NSFont.systemFont(ofSize: 14, weight: .semibold)])
            link.setAccessibilityLabel(title); link.toolTip = url
            bind(link) { if let target = URL(string: url) { _ = NSWorkspace.shared.open(target) } }
            linkRow.content.addArrangedSubview(link)
        }
        let quitRow = hairRow(in: links, padding: insets(4, 0), spacing: 12, minHeight: 42)
        let copyright = text("© 2026 NetMate. All rights reserved.", in: quitRow.content, size: 12.5, color: NetMateColors.secondary)
        copyright.setContentHuggingPriority(.init(1), for: .horizontal)
        button("退出 NetMate", in: quitRow.content) { [weak self] in self?.request("quit") }.destructive = true
    }
    /// About page update row; the agent's update state decides which actions are offered.
    func updateView() {
        guard let label = updateLabel, let actions = updateActions else { return }
        actions.arrangedSubviews.forEach { actions.removeArrangedSubview($0); $0.removeFromSuperview() }
        let phase = update["state"] as? String ?? ""
        let available = str((update["release"] as? JSON)?["version"])
        let checking = flag(update["checking"])
        var message: String
        if checking { message = "正在检查更新..." }
        else if let error = str(update["error"]) { message = "更新失败：\(error)" }
        else {
            switch phase {
            case "downloading":
                if let r = (update["received"] as? NSNumber)?.int64Value, let t = (update["total"] as? NSNumber)?.int64Value, t > 0 { message = "正在下载更新 \(r * 100 / t)%" }
                else { message = "正在下载更新..." }
            case "downloaded": message = "更新已下载，可以安装"
            case "failed": message = "下载失败，请重试"
            default:
                if let available { message = "发现新版本 \(available)" }
                else if flag(update["latest"]) { message = "当前已是最新版本" }
                else { message = "点击检查是否有新版本" }
            }
        }
        label.stringValue = message
        func add(_ title: String, _ op: String) -> NetMateButton {
            button(title, in: actions) { [weak self] in self?.updateCommand(op) }
        }
        switch phase {
        case "downloading": _ = add("查看下载进度", "update_status"); _ = add("取消下载", "update_cancel")
        case "downloaded": _ = add("立即安装", "update_install")
        default: if available != nil { _ = add("下载更新", "update_download") }
        }
        add("检查更新", "update_check").isEnabled = !checking && phase != "downloading"
    }
    func updateCommand(_ op: String) {
        if op == "update_check" { update["checking"] = true; updateView() }
        request(op, nil, { [weak self] value in
            guard let self else { return }
            switch op {
            case "update_check":
                self.update = ["release": value, "latest": value is NSNull, "checking": false]
            case "update_download", "update_status":
                for (key, field) in value as? JSON ?? [:] { self.update[key] = field }
            case "update_cancel":
                self.update["state"] = "idle"; self.feedback.stringValue = "已取消下载"
            default:
                self.feedback.stringValue = "正在安装更新…"
            }
            if self.page == "关于" && op != "update_install" { self.updateView(); self.pollUpdate() }
        }, failed: { [weak self] message in
            guard let self, op == "update_check" else { return }
            self.update["checking"] = false; self.update["error"] = message
            if self.page == "关于" { self.updateView() }
        })
    }
    /// Polls the download while the About page shows it, as the old update panel did.
    func pollUpdate() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self, self.page == "关于", self.update["state"] as? String == "downloading" else { return }
            self.updateCommand("update_status")
        }
    }
}

// MARK: 运行日志
extension App {
    /// Toolbar fields share the 34 px control height and are centred in their row.
    func logControlHeight(_ view: NSView) { view.heightAnchor.constraint(equalToConstant: 34).isActive = true }
    func reloadLogs() { cursor = nil; cursors = []; loadLogs() }
    func logsPage() {
        let heading = pageTitle("运行日志")
        let subtitle = tag("连接、认证与恢复记录，保留最近 7 天", in: heading, size: 13, color: NetMateColors.secondary)
        subtitle.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        spacer(in: heading)
        // The prototype's refresh button carries the accessible name 搜索 / 刷新.
        button("刷新", in: heading, name: "搜索 / 刷新") { [weak self] in self?.reloadLogs() }
        // No card: toolbar, level filter, the list under an ink rule, and the footer.
        let panel = NetMateBox(.vertical, spacing: 0)
        pageHost.addSubview(panel)
        layout(heading, panel, gap: 8)
        let c = panel.content
        // Toolbar: keyword, source, recent hours, 筛选; no caption labels, names live in tooltips.
        let toolbar = hstack(12, in: c, fill: true)
        toolbar.alignment = .centerY
        toolbar.edgeInsets = NSEdgeInsets(top: 4, left: 0, bottom: 10, right: 0)
        // A plain text field so XCUITest lists it under `textFields`; Return applies the filter.
        let keyword = inputField(str(query["keyword"]) ?? "", placeholder: "搜索消息或详情", name: "搜索全部保留历史")
        keyword.setContentHuggingPriority(.init(1), for: .horizontal)
        toolbar.addArrangedSubview(keyword); logControlHeight(keyword)
        let source = inputField(str(query["source"]) ?? "", placeholder: "全部来源", name: "来源")
        source.widthAnchor.constraint(equalToConstant: 140).isActive = true
        source.toolTip = "来源"
        toolbar.addArrangedSubview(source); logControlHeight(source)
        var hoursValue = 0
        if let start = (query["startTime"] as? NSNumber)?.int64Value { hoursValue = max(1, Int((nowMs() - start) / 3_600_000)) }
        let hours = inputField("\(hoursValue)", name: "最近小时")
        hours.font = .monospacedDigitSystemFont(ofSize: 13.5, weight: .regular)
        hours.widthAnchor.constraint(equalToConstant: 110).isActive = true
        hours.toolTip = "最近小时（0=全部）"
        toolbar.addArrangedSubview(hours); logControlHeight(hours)
        let apply: () -> Void = { [weak self, weak keyword, weak source, weak hours] in
            guard let self, let keyword, let source, let hours else { return }
            self.query["keyword"] = keyword.stringValue
            self.query["source"] = source.stringValue
            let h = min(max(hours.integerValue, 0), 168)
            if h > 0 { self.query["startTime"] = nowMs() - Int64(h) * 3_600_000 } else { self.query.removeValue(forKey: "startTime") }
            self.reloadLogs()
        }
        bind(keyword, apply)
        button("筛选", in: toolbar, apply)
        // `.seg` level filter and the count.
        let controls = hstack(12, in: c, fill: true)
        controls.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 12, right: 0)
        let current = str(query["level"]) ?? ""
        let levels = vstack(0, in: controls, fill: false)
        choices(["", "info", "success", "warn", "error", "debug"].map { ($0, $0.isEmpty ? "全部" : levelLabel($0)) },
                selected: current == "all" ? "" : current, chip: true, columns: 0, in: levels) { [weak self] value in
            self?.query["level"] = value; self?.reloadLogs()
        }
        spacer(in: controls)
        let count = tag("", in: controls, size: 12.5, color: NetMateColors.secondary)
        count.maximumNumberOfLines = 1; count.cell?.wraps = false
        count.setContentCompressionResistancePriority(.required, for: .horizontal)
        count.setContentHuggingPriority(.required, for: .horizontal)
        logCount = count
        let top = NetMateRule(NetMateColors.ink, thickness: 1.5); c.addArrangedSubview(top); fillWidth(top, c)
        // The list: one four-column row per entry, split by hairlines.
        let table = NSTableView()
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("entry")); column.title = "日志"
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column); table.headerView = nil
        table.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        table.delegate = self; table.dataSource = self; table.rowHeight = 34
        table.backgroundColor = .clear; table.gridStyleMask = .solidHorizontalGridLineMask
        table.gridColor = NetMateColors.rule; table.intercellSpacing = NSSize(width: 0, height: 1)
        table.selectionHighlightStyle = .regular; table.style = .plain
        table.target = self; table.action = #selector(logDetails)
        table.setAccessibilityLabel("日志列表")
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.drawsBackground = false; scroll.autohidesScrollers = true
        scroll.documentView = table; scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.setContentHuggingPriority(.init(1), for: .vertical)
        scroll.setContentCompressionResistancePriority(.init(1), for: .vertical)
        c.addArrangedSubview(scroll); fillWidth(scroll, c)
        scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 160).isActive = true
        let empty = NSTextField(wrappingLabelWithString: "正在读取日志…")
        empty.alignment = .center; empty.textColor = NetMateColors.caption; empty.font = .systemFont(ofSize: 14)
        empty.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(empty)
        NSLayoutConstraint.activate([empty.centerXAnchor.constraint(equalTo: scroll.centerXAnchor), empty.centerYAnchor.constraint(equalTo: scroll.centerYAnchor)])
        logEmpty = empty
        self.table = table
        table.sizeLastColumnToFit()
        // Footer: paging, then the scope and format selects, export and clear.
        let footer = hstack(12, in: c, fill: true)
        footer.alignment = .centerY
        footer.edgeInsets = NSEdgeInsets(top: 12, left: 0, bottom: 0, right: 0)
        button("上一页", in: footer) { [weak self] in
            guard let self, !self.cursors.isEmpty else { return }
            self.cursor = self.cursors.removeLast(); self.loadLogs()
        }
        button("下一页", in: footer) { [weak self] in
            guard let self, let next = self.nextCursor else { return }
            self.cursors.append(self.cursor); self.cursor = next; self.loadLogs()
        }
        spacer(in: footer)
        // NetMateSelect's 40 px frame is the 34 px face plus its 3 px open-state ring.
        let scope = dropdown(["全部保留日志", "当前筛选结果"], name: "导出范围", upward: true)
        scope.widthAnchor.constraint(greaterThanOrEqualToConstant: 156).isActive = true
        scope.toolTip = "导出范围"; footer.addArrangedSubview(scope)
        let format = dropdown(["可读文本 LOG", "结构化 JSON"], name: "格式", upward: true)
        format.widthAnchor.constraint(greaterThanOrEqualToConstant: 156).isActive = true
        format.toolTip = "格式"; footer.addArrangedSubview(format)
        button("导出日志", in: footer) { [weak self] in
            guard let self else { return }
            self.request("export_logs", ["query": scope.indexOfSelectedItem == 1 ? self.query : JSON(),
                                         "format": format.indexOfSelectedItem == 1 ? "json" : "text"] as JSON) { [weak self] value in
                guard let path = (value as? JSON)?["path"] as? String else { return }
                self?.feedback.stringValue = "日志已导出：\(path)"
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            }
        }
        button("清除日志", in: footer) { [weak self] in
            guard let self else { return }
            let alert = NSAlert(); alert.messageText = "清除日志"; alert.informativeText = "清空全部保留日志？此操作无法撤销。"
            alert.addButton(withTitle: "确认清空"); alert.addButton(withTitle: "取消")
            alert.buttons.first?.hasDestructiveAction = true
            alert.beginSheetModal(for: self.window) { [weak self] response in
                guard let self, response == .alertFirstButtonReturn else { return }
                self.request("clear_logs") { [weak self] generation in
                    guard let self else { return }
                    self.logGeneration = int(generation) ?? (self.logGeneration + 1)
                    self.entries = []; self.table?.reloadData()
                    self.reloadLogs()
                }
            }
        }
        logStatus(nil)
        loadLogs()
    }
    func loadLogs() {
        logRequest += 1
        let token = logRequest
        var q = query
        q["cursor"] = cursor.map { $0 as Any } ?? NSNull()
        q["limit"] = 200
        request("logs", q) { [weak self] value in
            guard let self, self.page == "日志", self.logRequest == token, let result = value as? JSON,
                  let generation = int(result["generation"]), generation >= self.logGeneration else { return }
            self.logGeneration = generation
            self.entries = result["entries"] as? [JSON] ?? []
            self.nextCursor = flag(result["hasMore"]) ? result["nextCursor"] as? String : nil
            self.table?.reloadData()
            self.logStatus(int(result["total"]) ?? 0)
        }
    }
    func logStatus(_ total: Int?) {
        let loaded = entries.count
        if let total { logCount?.stringValue = "共 \(max(total, loaded)) 条，已加载 \(loaded) 条" }
        let level = str(query["level"]) ?? ""
        let filtered = !(str(query["keyword"]) ?? "").isEmpty || !(str(query["source"]) ?? "").isEmpty || query["startTime"] != nil || !(level.isEmpty || level == "all")
        logEmpty?.isHidden = loaded > 0
        if total != nil { logEmpty?.stringValue = filtered ? "没有匹配的日志" : "暂无日志记录\n记录会在连接、认证或设置变更后显示" }
    }
    func numberOfRows(in tableView: NSTableView) -> Int { entries.count }
    func tableView(_ tableView: NSTableView, viewFor column: NSTableColumn?, row: Int) -> NSView? {
        let cell = (tableView.makeView(withIdentifier: NetMateLogCell.reuse, owner: nil) as? NetMateLogCell) ?? NetMateLogCell()
        let entry = entries[row]
        let kind = str(entry["level"]) ?? ""
        cell.time.stringValue = formatTime(entry["timestamp"])
        cell.level.stringValue = levelLabel(kind)
        cell.level.textColor = NetMateColors.level(kind)
        cell.level.font = .systemFont(ofSize: 12, weight: kind == "debug" ? .regular : .bold)
        cell.source.stringValue = str(entry["source"]) ?? "应用"
        cell.message.stringValue = (str(entry["message"]) ?? "").replacingOccurrences(of: "\n", with: " ")
        cell.setAccessibilityLabel("\(cell.time.stringValue) \(levelLabel(kind)) \(cell.source.stringValue) \(cell.message.stringValue)")
        return cell
    }
    @objc func logDetails() {
        guard let table, table.clickedRow >= 0, table.clickedRow < entries.count else { return }
        let entry = entries[table.clickedRow]
        table.deselectAll(nil)
        let (sheet, b) = makeSheet("日志详情", height: 560)
        let kind = str(entry["level"]) ?? ""
        let color = NetMateColors.level(kind)
        b.addArrangedSubview(NetMateBadge(levelLabel(kind), color, border: kind == "info" || kind == "debug" ? NetMateColors.line : color))
        text(formatTime(entry["timestamp"]), in: b, color: NetMateColors.secondary, mono: true)
        text(str(entry["source"]) ?? "应用", in: b, color: NetMateColors.secondary)
        var detail = str(entry["message"]) ?? ""
        if let data = entry["data"], !(data is NSNull) {
            if JSONSerialization.isValidJSONObject(data), let encoded = try? JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]) {
                detail += "\n\n" + (String(data: encoded, encoding: .utf8) ?? "")
            } else {
                detail += "\n\n\(data)"
            }
        }
        let body = box(.vertical, in: b, padding: insets(12, 12), fill: NetMateColors.field, stroke: NetMateColors.line, radius: 8)
        text(detail, in: body.content, size: 13, mono: true)
        let actions = hstack(8, in: b)
        button("复制详情", in: actions) {
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(detail, forType: .string)
        }
        button("关闭", in: actions) { [weak self] in self?.closeSheet(sheet) }
    }
}

let delegate = App()
NSApplication.shared.delegate = delegate
NSApplication.shared.run()
