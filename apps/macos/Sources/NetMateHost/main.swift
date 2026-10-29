import AppKit
import CoreWLAN
import CoreLocation
import UserNotifications
import Network
import NetMateIPC
final class Host: NSObject,NSApplicationDelegate,CWEventDelegate,CLLocationManagerDelegate {
    let client=Client();var status:NSStatusItem!;let location=CLLocationManager();let wifi=CWWiFiClient.shared();var lastNotice:UInt64=0;let pathMonitor=NWPathMonitor(requiredInterfaceType:.wifi);var observers=[NSObjectProtocol]()
    func applicationDidFinishLaunching(_ note:Notification){NSApp.setActivationPolicy(.accessory);status=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength);status.button?.title="NM";let menu=NSMenu();for(title,selector)in[("打开 NetMate",#selector(open)),("立即登录",#selector(login)),("注销并暂停认证",#selector(logout)),("恢复网络",#selector(retry)),("退出 NetMate",#selector(quit))]{let item=NSMenuItem(title:title,action:selector,keyEquivalent:"");item.target=self;menu.addItem(item)};status.menu=menu;location.delegate=self;location.requestWhenInUseAuthorization();wifi.delegate=self
        pathMonitor.pathUpdateHandler={ [weak self] _ in self?.command("network_changed") };pathMonitor.start(queue:DispatchQueue(label:"netmate-network"))
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName:NSWorkspace.willSleepNotification,object:nil,queue:nil){[weak self]_ in self?.power(true)})
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName:NSWorkspace.didWakeNotification,object:nil,queue:nil){[weak self]_ in self?.power(false)})

        for event in [CWEventType.ssidDidChange,.bssidDidChange,.powerDidChange,.linkDidChange]{do{try wifi.startMonitoringEvent(with:event)}catch{command("monitor_degraded")}}
        UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.sound]){_,_ in}
        DispatchQueue.global(qos:.utility).async{[weak self]in guard let self else{return};do{try self.client.subscribe{snapshot in DispatchQueue.main.async{if snapshot["phase"] as? String=="exiting"{NSApp.terminate(nil);return};self.status.button?.title=(snapshot["internetReachable"] as? Bool==true) ? "NM ✓":"NM";if let notice=snapshot["notification"] as? [String:Any],let id=notice["id"] as? UInt64,id != self.lastNotice {self.lastNotice=id;let content=UNMutableNotificationContent();content.title=notice["title"] as? String ?? "NetMate";content.body=notice["message"] as? String ?? "";UNUserNotificationCenter.current().add(UNNotificationRequest(identifier:String(id),content:content,trigger:nil))}}}}catch{DispatchQueue.main.async{NSApp.terminate(nil)}}}
    }
    func command(_ op:String){DispatchQueue.global(qos:.utility).async{[client]in _=try? client.request(op)}}
    func power(_ sleeping:Bool){DispatchQueue.global(qos:.utility).async{[client]in _=try? client.request("system_suspend",sleeping)}}
    @objc func open(){command("open_ui")};@objc func login(){command("login")};@objc func logout(){command("logout")};@objc func retry(){command("retry")};@objc func quit(){command("quit");NSApp.terminate(nil)}
    func ssidDidChangeForWiFiInterface(withName name:String){command("network_changed")}
    func bssidDidChangeForWiFiInterface(withName name:String){command("network_changed")}
    func powerStateDidChangeForWiFiInterface(withName name:String){command("network_changed")}
    func linkDidChangeForWiFiInterface(withName name:String){command("network_changed")}
    func clientConnectionInterrupted(){command("monitor_degraded")}
    func clientConnectionInvalidated(){command("monitor_degraded")}
}
let delegate=Host();NSApplication.shared.delegate=delegate;NSApplication.shared.run()
