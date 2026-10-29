import XCTest
@testable import NetMateIPC
final class ProtocolTests: XCTestCase {
    func testNativeDataNamespaceIsIndependent() {
        let path=Client.directory.path
        XCTAssertTrue(path.hasSuffix("NetMateNative") || ProcessInfo.processInfo.environment["NETMATE_DATA_DIR"] != nil)
    }
}
