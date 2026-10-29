// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "NetMate", platforms: [.macOS("27.0")], products: [.library(name:"NetMateIPC",targets:["NetMateIPC"]),.executable(name:"netmate-ui",targets:["NetMate"]),.executable(name:"netmate-host",targets:["NetMateHost"])], targets:[.target(name:"NetMateIPC"),.executableTarget(name:"NetMate",dependencies:["NetMateIPC"]),.executableTarget(name:"NetMateHost",dependencies:["NetMateIPC"]),.testTarget(name:"NetMateIPCTests",dependencies:["NetMateIPC"])], swiftLanguageModes:[.v5])
