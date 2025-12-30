import Foundation
import SystemConfiguration.CaptiveNetwork
import CoreLocation
import Network

@objc(WifiModule)
class WifiModule: NSObject {

  private let locationManager = CLLocationManager()

  override init() {
    super.init()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// 获取当前连接的 WiFi SSID
  @objc
  func getCurrentSSID(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      if let interfaces = CNCopySupportedInterfaces() as? [String] {
        for interface in interfaces {
          if let networkInfo = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any],
             let ssid = networkInfo[kCNNetworkInfoKeySSID as String] as? String {
            resolve(ssid)
            return
          }
        }
      }
      resolve(nil)
    }
  }

  /// 获取当前设备的 IPv4 地址
  @objc
  func getIPAddress(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    var address: String?
    var ifaddr: UnsafeMutablePointer<ifaddrs>?

    guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
      resolve(nil)
      return
    }

    defer { freeifaddrs(ifaddr) }

    for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
      let interface = ptr.pointee
      let addrFamily = interface.ifa_addr.pointee.sa_family

      if addrFamily == UInt8(AF_INET) {
        let name = String(cString: interface.ifa_name)
        if name == "en0" {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                     &hostname, socklen_t(hostname.count), nil, socklen_t(0), NI_NUMERICHOST)
          address = String(cString: hostname)
        }
      }
    }

    resolve(address)
  }

  /// 获取当前设备的 IPv6 地址
  @objc
  func getIPv6Address(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    var address: String?
    var ifaddr: UnsafeMutablePointer<ifaddrs>?

    guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
      resolve(nil)
      return
    }

    defer { freeifaddrs(ifaddr) }

    for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
      let interface = ptr.pointee
      let addrFamily = interface.ifa_addr.pointee.sa_family

      if addrFamily == UInt8(AF_INET6) {
        let name = String(cString: interface.ifa_name)
        if name == "en0" {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                     &hostname, socklen_t(hostname.count), nil, socklen_t(0), NI_NUMERICHOST)
          let ipv6 = String(cString: hostname)
          // 排除链路本地地址
          if !ipv6.hasPrefix("fe80") {
            address = ipv6
          }
        }
      }
    }

    resolve(address)
  }

  /// 获取 MAC 地址（iOS 不再允许获取真实 MAC 地址）
  @objc
  func getMacAddress(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // iOS 不再允许应用获取真实的 MAC 地址
    resolve(nil)
  }

  /// 检查 WiFi 是否已启用
  @objc
  func isWifiEnabled(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // iOS 没有直接的 API 检查 WiFi 是否启用
    // 通过检查是否能获取到网络接口来间接判断
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
      resolve(false)
      return
    }
    defer { freeifaddrs(ifaddr) }

    for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
      let name = String(cString: ptr.pointee.ifa_name)
      if name == "en0" {
        resolve(true)
        return
      }
    }
    resolve(false)
  }

  /// 检查是否已连接到 WiFi
  @objc
  func isConnected(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      if let interfaces = CNCopySupportedInterfaces() as? [String] {
        for interface in interfaces {
          if let networkInfo = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any],
             networkInfo[kCNNetworkInfoKeySSID as String] != nil {
            resolve(true)
            return
          }
        }
      }
      resolve(false)
    }
  }

  /// 获取完整的网络信息
  @objc
  func getNetworkInfo(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    var result: [String: Any] = [
      "wifiEnabled": false,
      "connected": false,
      "ssid": NSNull(),
      "ipv4": NSNull(),
      "ipv6": NSNull(),
      "mac": NSNull()
    ]

    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
      resolve(result)
      return
    }
    defer { freeifaddrs(ifaddr) }

    var hasEn0 = false
    var ipv4: String?
    var ipv6: String?

    for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
      let interface = ptr.pointee
      let name = String(cString: interface.ifa_name)

      if name == "en0" {
        hasEn0 = true
        let addrFamily = interface.ifa_addr.pointee.sa_family

        if addrFamily == UInt8(AF_INET) {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                     &hostname, socklen_t(hostname.count), nil, socklen_t(0), NI_NUMERICHOST)
          ipv4 = String(cString: hostname)
        } else if addrFamily == UInt8(AF_INET6) {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                     &hostname, socklen_t(hostname.count), nil, socklen_t(0), NI_NUMERICHOST)
          let ip = String(cString: hostname)
          if !ip.hasPrefix("fe80") {
            ipv6 = ip
          }
        }
      }
    }

    result["wifiEnabled"] = hasEn0
    if let ipv4 = ipv4 {
      result["ipv4"] = ipv4
    }
    if let ipv6 = ipv6 {
      result["ipv6"] = ipv6
    }

    // 获取 SSID（需要在主线程）
    DispatchQueue.main.async {
      if let interfaces = CNCopySupportedInterfaces() as? [String] {
        for interface in interfaces {
          if let networkInfo = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any],
             let ssid = networkInfo[kCNNetworkInfoKeySSID as String] as? String {
            result["connected"] = true
            result["ssid"] = ssid
            break
          }
        }
      }
      resolve(result)
    }
  }

  /// 检查是否有位置权限
  @objc
  func checkLocationPermission(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let status = CLLocationManager.authorizationStatus()
    let hasPermission = (status == .authorizedWhenInUse || status == .authorizedAlways)
    resolve(hasPermission)
  }
}
