import XCTest
import NetMateIPC
final class NativeUITests: XCTestCase {
    func testOneHundredWindowLifecycles() throws {
        let app=XCUIApplication()
        let profile=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:profile,withIntermediateDirectories:true)
        defer {
            app.terminate()
            if FileManager.default.fileExists(atPath:profile.appendingPathComponent("agent.sock").path) {
                _ = try? Client(directory:profile).request("quit")
            }
            try? FileManager.default.removeItem(at:profile)
        }
        app.launchEnvironment["NETMATE_DATA_DIR"]=profile.path
        for cycle in 0..<100 {
            app.launch()
            XCTAssertTrue(app.buttons["关于"].waitForExistence(timeout:15))
            if cycle == 0 {
                for (theme, toggle, nextToggle) in [("light","切换至白天模式","切换至黑夜模式"),("dark","切换至黑夜模式","切换至白天模式")] {
                    if app.buttons[toggle].exists { app.buttons[toggle].click() }
                    XCTAssertTrue(app.buttons[nextToggle].waitForExistence(timeout:5))
                    for (page,ready) in [("运行状态","网络连接状态"),("配置设置","账号配置"),("运行日志","搜索全部保留历史"),("关于","检查更新")] {
                        app.buttons[page].click()
                        let control=app.descendants(matching:.any).matching(identifier:ready).firstMatch
                        XCTAssertTrue(control.waitForExistence(timeout:5))
                        let image=XCTAttachment(screenshot:app.screenshot());image.name="\(theme)-\(page)";image.lifetime = .keepAlways;add(image)
                    }
                }
                app.buttons["运行日志"].click()
                let search=app.textFields["搜索全部保留历史"]
                search.click();search.typeText("draft-filter")
                app.buttons["切换至白天模式"].click()
                XCTAssertEqual(search.value as? String,"draft-filter")
            } else {
                XCTAssertTrue(app.buttons["切换至黑夜模式"].exists)
            }
            app.buttons["关于"].click()
            XCTAssertTrue(app.buttons["检查更新"].exists)
            app.buttons["netmate-close"].click()
            XCTAssertTrue(app.wait(for:.notRunning,timeout:10))
        }
    }
}
