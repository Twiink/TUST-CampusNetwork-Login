import AppKit
import ObjectiveC
private var actionKey:UInt8=0
import NetMateIPC
final class Action:NSObject{let body:()->Void;init(_ body:@escaping()->Void){self.body=body};@objc func invoke(){body()}}
final class App:NSObject,NSApplicationDelegate,NSWindowDelegate,NSTableViewDataSource,NSTableViewDelegate {
    let client=Client();var window:NSWindow!;var body=TopAlignedStack();let feedback=NSTextField(wrappingLabelWithString:"");let status=NSTextField(wrappingLabelWithString:"");var config=[String:Any]();var snapshot=[String:Any]();var page="运行状态";var entries=[[String:Any]]();var table:NSTableView?;var query=[String:Any]();var cursors=[String?]();var cursor:String?;var nextCursor:String?
    let wifiStatus=NSTextField(wrappingLabelWithString:"")
    let accountStatus=NSTextField(wrappingLabelWithString:"")
    let heartbeatStatus=NSTextField(wrappingLabelWithString:"")
    var navigation=[String:NetMateButton]()
    let themeSwitch=DayNightButton()
    var logRequest=0
    var logGeneration=0
    func applicationDidFinishLaunching(_ note:Notification){
        if let existing=NSRunningApplication.runningApplications(withBundleIdentifier:Bundle.main.bundleIdentifier ?? "com.netmate.native").first(where:{$0.processIdentifier != ProcessInfo.processInfo.processIdentifier && ["netmate-ui","NetMate"].contains($0.executableURL?.lastPathComponent ?? "")}){existing.activate(options:.activateIgnoringOtherApps);NSApp.terminate(nil);return}
        if let theme=UserDefaults.standard.string(forKey:"netmate.appearance"){NSApp.appearance=NSAppearance(named:theme=="dark" ? .darkAqua:.aqua)}
        NSApp.setActivationPolicy(.regular)
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1100,height:820),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="NetMate";window.titlebarAppearsTransparent=true;window.minSize=NSSize(width:980,height:660)
        window.standardWindowButton(.closeButton)?.setAccessibilityIdentifier("netmate-close");window.delegate=self;window.center()
        let root=NetMateBackground();root.onAppearanceChange={[weak self]dark in self?.themeSwitch.dark=dark};window.contentView=root
        let sidebar=NetMateSidebar();sidebar.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(sidebar)
        let menu=NSStackView();menu.orientation = .vertical;menu.alignment = .leading;menu.spacing=8;menu.translatesAutoresizingMaskIntoConstraints=false;sidebar.addSubview(menu)
        let brand=NSTextField(labelWithString:"NetMate");brand.font = .systemFont(ofSize:23,weight:.heavy);brand.textColor=NetMateColors.adaptive(0x0369a1,0x38bdf8);menu.addArrangedSubview(brand);menu.setCustomSpacing(32,after:brand)
        for(name,symbol)in[("运行状态","globe"),("配置设置","gearshape"),("日志","doc.text"),("关于","info.circle")]{let b=button(name=="日志" ? "运行日志":name,in:menu){[weak self]in self?.page=name;self?.render()};b.navigation=true;b.symbol=symbol;b.widthAnchor.constraint(equalToConstant:170).isActive=true;navigation[name]=b}
        let themeAction=Action{[weak self]in self?.switchTheme()};themeSwitch.target=themeAction;themeSwitch.action=#selector(Action.invoke);objc_setAssociatedObject(themeSwitch,&actionKey,themeAction,.OBJC_ASSOCIATION_RETAIN_NONATOMIC);themeSwitch.translatesAutoresizingMaskIntoConstraints=false;sidebar.addSubview(themeSwitch);themeSwitch.dark=NetMateColors.isDark(window.effectiveAppearance)
        let main=NSStackView();main.orientation = .vertical;main.alignment = .leading;main.spacing=12;main.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(main)
        body.orientation = .vertical;body.alignment = .leading;body.spacing=24;body.translatesAutoresizingMaskIntoConstraints=false
        let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.drawsBackground=false;scroll.documentView=body;scroll.translatesAutoresizingMaskIntoConstraints=false;main.addArrangedSubview(scroll)
        feedback.font = .systemFont(ofSize:13);feedback.textColor=NetMateColors.secondary;feedback.isSelectable=true;main.addArrangedSubview(feedback)
        NSLayoutConstraint.activate([
            sidebar.leadingAnchor.constraint(equalTo:root.leadingAnchor),sidebar.topAnchor.constraint(equalTo:root.topAnchor),sidebar.bottomAnchor.constraint(equalTo:root.bottomAnchor),sidebar.widthAnchor.constraint(equalToConstant:194),
            menu.leadingAnchor.constraint(equalTo:sidebar.leadingAnchor,constant:12),menu.topAnchor.constraint(equalTo:sidebar.topAnchor,constant:32),
            themeSwitch.centerXAnchor.constraint(equalTo:sidebar.centerXAnchor),themeSwitch.bottomAnchor.constraint(equalTo:sidebar.bottomAnchor,constant:-32),themeSwitch.widthAnchor.constraint(equalToConstant:84),themeSwitch.heightAnchor.constraint(equalToConstant:44),
            main.leadingAnchor.constraint(equalTo:sidebar.trailingAnchor,constant:48),main.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-48),main.topAnchor.constraint(equalTo:root.topAnchor,constant:40),main.bottomAnchor.constraint(equalTo:root.bottomAnchor,constant:-24),
            scroll.widthAnchor.constraint(equalTo:main.widthAnchor),scroll.heightAnchor.constraint(greaterThanOrEqualToConstant:400),body.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor),body.leadingAnchor.constraint(equalTo:scroll.contentView.leadingAnchor),body.topAnchor.constraint(equalTo:scroll.contentView.topAnchor),feedback.widthAnchor.constraint(equalTo:main.widthAnchor)
        ])
        scroll.setContentHuggingPriority(.defaultLow,for:.vertical)
        render();window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        request("config"){[weak self]value in
            guard let self else{return}
            self.config=value as? [String:Any] ?? [:];self.render();self.window.displayIfNeeded()
            self.request("ui_ready",["pid":ProcessInfo.processInfo.processIdentifier]);self.startSubscription()
        }
    }
    func startSubscription(){
        DispatchQueue.global(qos:.utility).async{[weak self]in
            while let self {
                do {
                    // The initial config request has bootstrapped the agent. On a restart,
                    // request a fresh snapshot before subscribing to its new socket.
                    _ = try self.client.request("snapshot")
                    try self.client.subscribe{value in DispatchQueue.main.async{
                        if value["phase"] as? String=="exiting"{NSApp.terminate(nil);return}
                        let refresh=self.page=="日志" && self.cursor==nil && (value["logRevision"] as? UInt64 != self.snapshot["logRevision"] as? UInt64)
                        self.snapshot=value;self.refreshStatus();if refresh{self.loadLogs()}
                    }}
                } catch {DispatchQueue.main.async{self.feedback.stringValue="后台连接中断，正在重连"}}
                Thread.sleep(forTimeInterval:1)
            }
        }
    }
    func switchTheme(){
        let dark = !NetMateColors.isDark(window.effectiveAppearance)
        UserDefaults.standard.set(dark ? "dark":"light",forKey:"netmate.appearance");NSApp.appearance=NSAppearance(named:dark ? .darkAqua:.aqua);themeSwitch.dark=dark
        func invalidate(_ view:NSView){view.needsDisplay=true;view.subviews.forEach(invalidate)}
        if let root=window.contentView{invalidate(root)}
    }
    func windowWillClose(_ notification:Notification){if let closing=notification.object as? NSWindow,closing !== window {window.endSheet(closing);closing.contentView=nil}else{NSApp.terminate(nil)}}
    func closeSheet(_ sheet:NSWindow){window.endSheet(sheet);sheet.contentView=nil;sheet.close()}
    func request(_ op:String,_ args:Any?=nil,_ done:@escaping(Any)->Void={_ in}){DispatchQueue.global(qos:.userInitiated).async{[weak self]in guard let self else{return};do{let result=try self.client.request(op,args);DispatchQueue.main.async{self.feedback.stringValue="";done(result)}}catch{DispatchQueue.main.async{self.feedback.stringValue="\(error)"}}}}
    @discardableResult func button(_ title:String,in box:NSStackView?=nil,_ fn:@escaping()->Void)->NetMateButton{
        let action=Action(fn);let b=NetMateButton(title:title,target:action,action:#selector(Action.invoke));b.primary=["立即连接","保存并应用","保存"].contains(title);b.destructive=title.hasPrefix("删除") || title=="断开连接" || title=="清空日志"
        b.font = .systemFont(ofSize:15);b.setAccessibilityLabel(title);objc_setAssociatedObject(b,&actionKey,action,.OBJC_ASSOCIATION_RETAIN_NONATOMIC);(box ?? body).addArrangedSubview(b);return b
    }
    @discardableResult func label(_ value:String,in box:NSStackView?=nil)->NSTextField{
        let field=NSTextField(wrappingLabelWithString:value);field.isSelectable=true;field.font = .systemFont(ofSize:15);field.textColor=NetMateColors.text
        let parent=box ?? body;parent.addArrangedSubview(field);field.widthAnchor.constraint(lessThanOrEqualTo:parent.widthAnchor).isActive=true;return field
    }
    func card(_ title:String,in parent:NSStackView?=nil,fullWidth:Bool=true)->NetMateCard{
        let container=NetMateCard();let parent=parent ?? body;parent.addArrangedSubview(container)
        if fullWidth{container.widthAnchor.constraint(equalTo:parent.widthAnchor).isActive=true}
        let heading=label(title,in:container.content);heading.font = .systemFont(ofSize:19,weight:.bold);heading.textColor=NetMateColors.heading;return container
    }
    func field(_ title:String,_ value:String="",secure:Bool=false,in box:NSStackView)->NSTextField{label(title,in:box);let field:NSTextField=secure ? NSSecureTextField(string:value):NSTextField(string:value);field.placeholderString=title;field.setAccessibilityLabel(title);field.widthAnchor.constraint(greaterThanOrEqualToConstant:360).isActive=true;box.addArrangedSubview(field);return field}
    func toggle(_ title:String,_ value:Bool,in box:NSStackView)->NSButton{let b=NSButton(checkboxWithTitle:title,target:nil,action:nil);b.state=value ? .on:.off;box.addArrangedSubview(b);return b}
    func list(_ key:String)->[[String:Any]]{config[key] as? [[String:Any]] ?? []}
    func save(_ value:[String:Any]){request("save_config",value){[weak self]value in self?.config=value as? [String:Any] ?? [:];self?.render();self?.window.displayIfNeeded();self?.request("ui_ready",["pid":ProcessInfo.processInfo.processIdentifier])}}
    func render(){
        logRequest+=1;entries=[];table=nil
        for view in body.arrangedSubviews{body.removeArrangedSubview(view);view.removeFromSuperview()}
        for(name,item)in navigation{item.selectedPage=name==page || name=="配置设置" && ["账号","WiFi","设置"].contains(page);item.needsDisplay=true}
        let heading=label(page=="日志" ? "运行日志":page);heading.font = .systemFont(ofSize:34,weight:.heavy);heading.textColor=NetMateColors.heading
        switch page{
        case "运行状态":
            let row=NSStackView();row.orientation = .horizontal;row.alignment = .top;row.distribution = .fillEqually;row.spacing=24;body.addArrangedSubview(row);row.widthAnchor.constraint(equalTo:body.widthAnchor).isActive=true
            let connection=card("网络连接状态",in:row,fullWidth:false).content
            status.font = .systemFont(ofSize:28,weight:.bold);connection.addArrangedSubview(status)
            let actions=NSStackView();actions.spacing=10;connection.addArrangedSubview(actions)
            button("立即连接",in:actions){[weak self]in self?.request("login")};button("断开连接",in:actions){[weak self]in self?.request("logout")}
            let account=card("当前账号",in:row,fullWidth:false).content;accountStatus.font = .systemFont(ofSize:15);accountStatus.textColor=NetMateColors.text;account.addArrangedSubview(accountStatus);accountStatus.widthAnchor.constraint(lessThanOrEqualTo:account.widthAnchor).isActive=true
            button("配置账号",in:account){[weak self]in self?.page="配置设置";self?.render()}
            let wifi=card("当前 WiFi").content;wifiStatus.font = .systemFont(ofSize:15);wifiStatus.textColor=NetMateColors.text;wifi.addArrangedSubview(wifiStatus);wifiStatus.widthAnchor.constraint(lessThanOrEqualTo:wifi.widthAnchor).isActive=true
            let heartbeat=card("心跳检测").content;heartbeatStatus.font = .systemFont(ofSize:15);heartbeatStatus.textColor=NetMateColors.secondary;heartbeat.addArrangedSubview(heartbeatStatus);heartbeatStatus.widthAnchor.constraint(lessThanOrEqualTo:heartbeat.widthAnchor).isActive=true
            let recovery=NSStackView();recovery.spacing=12;heartbeat.addArrangedSubview(recovery);button("立即恢复网络",in:recovery){[weak self]in self?.request("retry")};button("停止当前恢复",in:recovery){[weak self]in self?.request("stop_recovery")};refreshStatus()
        case "配置设置","账号","WiFi","设置":accounts(in:card("账号配置").content);wifis(in:card("WiFi 配置").content);settings(in:card("通用设置").content)
        case "日志":logs(in:card("运行日志").content)
        default:
            let box=card("NetMate").content;label("版本 \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.0.0")\n校园网自动登录助手",in:box)
            for(title,op)in[("检查更新","update_check"),("下载更新","update_download"),("查看下载进度","update_status"),("取消下载","update_cancel"),("校验并安装更新","update_install")]{button(title,in:box){[weak self]in self?.request(op){value in self?.feedback.stringValue="\(value)"}}}
        }
    }
    func accounts(in box:NSStackView){
        button("添加认证账号",in:box){[weak self]in self?.editAccount(nil)}
        for account in list("accounts"){let row=NSStackView();row.spacing=12;box.addArrangedSubview(row);let text=label("\(account["name"] ?? "")  \(account["username"] ?? "")",in:row);text.setContentHuggingPriority(.defaultLow,for:.horizontal);button("编辑",in:row){[weak self]in self?.editAccount(account)}}
    }
    func wifis(in box:NSStackView){
        let tools=NSStackView();tools.spacing=12;box.addArrangedSubview(tools)
        button("扫描附近 WiFi",in:tools){[weak self]in self?.request("scan"){value in guard let self else{return};let(sheet,box)=self.sheet("附近网络");for network in value as? [[String:Any]] ?? []{self.button("\(network["ssid"] ?? "") · \(network["security"] ?? "")",in:box){self.closeSheet(sheet);self.editWifi(nil,seed:network)}}}}
        button("添加 WiFi",in:tools){[weak self]in self?.editWifi(nil)}
        for wifi in list("wifiRules"){let row=NSStackView();row.spacing=12;box.addArrangedSubview(row);let text=label("\(wifi["ssid"] ?? "") · 优先级 \(wifi["priority"] ?? 10)",in:row);text.setContentHuggingPriority(.defaultLow,for:.horizontal);button("连接",in:row){[weak self]in self?.request("connect",["id":wifi["id"] ?? ""])};button("编辑",in:row){[weak self]in self?.editWifi(wifi)}}
    }
    func refreshStatus(){
        let n=snapshot["network"] as? [String:Any] ?? [:];let online=snapshot["internetReachable"] as? Bool ?? false
        status.stringValue=online ? "已连接":(["connecting","authenticating"].contains(snapshot["phase"] as? String ?? "") ? "连接中…":"未连接");status.textColor=online ? NetMateColors.success:NetMateColors.danger
        wifiStatus.stringValue="\(n["ssid"] ?? "未连接 WiFi")\nIPv4  \(n["ipv4"] ?? "未知")    IPv6  \(n["ipv6"] ?? "未知")\nBSSID  \(n["bssid"] ?? "未知")\n信号 \(n["rssi"] ?? "未知") dBm    频率 \(n["frequency"] ?? "未知") MHz    速率 \(n["linkSpeed"] ?? "未知") Mbps"
        let account=list("accounts").first{$0["id"] as? String==config["currentAccountId"] as? String};accountStatus.stringValue=account.map{"\($0["username"] ?? "")\n\($0["serverUrl"] ?? "")"} ?? "尚未配置认证账号，请添加账号并关联 WiFi。"
        let settings=config["settings"] as? [String:Any] ?? [:];heartbeatStatus.stringValue="\((settings["enableHeartbeat"] as? Bool ?? false) ? "心跳检测已开启":"心跳检测已关闭") · 每 \(settings["heartbeatIntervalSeconds"] ?? 30) 秒检测一次\n\(snapshot["message"] ?? "等待网络状态")"
    }
    func sheet(_ title:String)->(NSWindow,NSStackView){let sheet=NSWindow(contentRect:NSRect(x:0,y:0,width:520,height:600),styleMask:[.titled,.closable],backing:.buffered,defer:false);sheet.title=title;sheet.delegate=self;let box=TopAlignedStack();box.translatesAutoresizingMaskIntoConstraints=false;box.orientation = .vertical;box.alignment = .leading;box.spacing=8;box.edgeInsets=NSEdgeInsets(top:16,left:16,bottom:16,right:16);let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.documentView=box;sheet.contentView=scroll;NSLayoutConstraint.activate([box.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor),box.leadingAnchor.constraint(equalTo:scroll.contentView.leadingAnchor),box.topAnchor.constraint(equalTo:scroll.contentView.topAnchor)]);button("取消",in:box){[weak self]in self?.closeSheet(sheet)};window.beginSheet(sheet);return(sheet,box)}
    func password(_ field:NSTextField,_ clear:NSButton)->[String:Any]{clear.state == .on ? ["action":"clear"]:field.stringValue.isEmpty ? ["action":"keep"]:["action":"replace","value":field.stringValue]}
    func upsert(_ field:String,_ item:[String:Any]){var values=list(field);if let index=values.firstIndex(where:{$0["id"] as? String==item["id"] as? String}){values[index]=item}else{values.append(item)};var next=config;next[field]=values;save(next)}
    func editAccount(_ old:[String:Any]?){let(sheet,box)=sheet("认证账号");let old=old ?? ["id":UUID().uuidString,"isp":"campus","serverUrl":"http://10.10.102.50:801"];let name=field("显示名称",old["name"] as? String ?? "",in:box);let user=field("账号",old["username"] as? String ?? "",in:box);let pass=field("密码（留空保留）",secure:true,in:box);let clear=toggle("清空密码",false,in:box);let server=field("认证服务器",old["serverUrl"] as? String ?? "",in:box);label("运营商",in:box);let isp=NSPopUpButton();isp.addItems(withTitles:["校园网","中国移动","中国联通","中国电信"]);let ids=["campus","cmcc","cucc","ctcc"];isp.selectItem(at:ids.firstIndex(of:old["isp"] as? String ?? "campus") ?? 0);box.addArrangedSubview(isp);button("保存",in:box){[self]in upsert("accounts",["id":old["id"]!,"name":name.stringValue,"username":user.stringValue,"serverUrl":server.stringValue,"isp":ids[isp.indexOfSelectedItem],"passwordEdit":password(pass,clear)]);closeSheet(sheet)};button("设为当前账号",in:box){[self]in var next=config;next["currentAccountId"]=old["id"];save(next);closeSheet(sheet)};button("删除账号",in:box){[self]in var next=config;next["accounts"]=list("accounts").filter{$0["id"] as? String != old["id"] as? String};if next["currentAccountId"] as? String==old["id"] as? String{next["currentAccountId"]=NSNull()};next["wifiRules"]=list("wifiRules").map{item in var item=item;item["linkedAccountIds"]=(item["linkedAccountIds"] as? [String] ?? []).filter{$0 != old["id"] as? String};return item};save(next);closeSheet(sheet)}}
    func editWifi(_ old:[String:Any]?,seed:[String:Any]=[:]){let(sheet,box)=sheet("WiFi 配置");let old=old ?? ["id":UUID().uuidString,"priority":10,"autoConnect":true];let ssid=field("WiFi 名称",old["ssid"] as? String ?? seed["ssid"] as? String ?? "",in:box);let pass=field("密码（留空保留）",secure:true,in:box);let clear=toggle("清空密码（开放网络）",false,in:box);let security=field("安全类型",old["security"] as? String ?? seed["security"] as? String ?? "Open",in:box);let bssid=field("BSSID（可留空）",old["bssid"] as? String ?? "",in:box);let priority=field("优先级 1–99","\(old["priority"] ?? 10)",in:box);let auto=toggle("允许自动连接",old["autoConnect"] as? Bool ?? false,in:box);let auth=toggle("需要校园网认证",old["requiresAuth"] as? Bool ?? false,in:box);var linked=[(String,NSButton,NSTextField)]();for account in list("accounts"){let id=account["id"] as? String ?? "";let ids=old["linkedAccountIds"] as? [String] ?? [];let checked=toggle(account["name"] as? String ?? account["username"] as? String ?? "账号",ids.contains(id),in:box);let order=field("尝试顺序","\((ids.firstIndex(of:id) ?? 99)+1)",in:box);linked.append((id,checked,order))};button("保存",in:box){[self]in let ids=linked.filter{$0.1.state == .on}.sorted{($0.2.integerValue)<($1.2.integerValue)}.map{$0.0};upsert("wifiRules",["id":old["id"]!,"ssid":ssid.stringValue,"passwordEdit":password(pass,clear),"security":security.stringValue.isEmpty ? NSNull():security.stringValue as Any,"bssid":bssid.stringValue.isEmpty ? NSNull():bssid.stringValue as Any,"priority":priority.integerValue,"autoConnect":auto.state == .on,"requiresAuth":auth.state == .on,"linkedAccountIds":ids]);closeSheet(sheet)};button("删除网络",in:box){[self]in var next=config;next["wifiRules"]=list("wifiRules").filter{$0["id"] as? String != old["id"] as? String};save(next);closeSheet(sheet)}}
    func settings(in box:NSStackView){let settings=config["settings"] as? [String:Any] ?? [:];var flags=[String:NSButton]();for(key,title)in[("autoLaunch","开机自启"),("enableHeartbeat","启用心跳"),("autoReconnect","断线自动恢复"),("startupAutoConnect","启动时自动连接"),("keepCurrentConnection","保持当前连接"),("autoUpdate","自动检查更新")]{flags[key]=toggle(title,settings[key] as? Bool ?? false,in:box)};var numbers=[String:NSTextField]();for(key,title)in[("heartbeatIntervalSeconds","心跳间隔（秒）"),("heartbeatFailureThreshold","连续失败阈值"),("wifiReconnectRetries","每 WiFi 尝试次数（含首次）"),("wifiReconnectCooldownMinutes","冷却（分钟）")]{numbers[key]=field(title,"\(settings[key] ?? 0)",in:box)};let notices=settings["notificationSettings"] as? [String:Bool] ?? [:];var notificationFields=[String:NSButton]();for(key,title)in[("wifiDisconnected","WiFi 断开通知"),("reconnectSuccess","恢复成功通知"),("reconnectFailed","恢复失败通知"),("authRecovered","认证恢复通知")]{notificationFields[key]=toggle(title,notices[key] ?? true,in:box)};button("保存并应用",in:box){[self]in var next=config;var settings=settings;for(k,v)in flags{settings[k]=v.state == .on};for(k,v)in numbers{settings[k]=v.integerValue};settings["notificationSettings"]=notificationFields.mapValues{$0.state == .on};next["settings"]=settings;save(next)}}
    func logs(in box:NSStackView){let source=field("来源（可留空）",query["source"] as? String ?? "",in:box);let hours=field("最近小时（0=全部保留历史）","0",in:box);let level=NSPopUpButton();level.addItems(withTitles:["all","debug","info","success","warn","error"]);box.addArrangedSubview(level);let search=field("搜索全部保留历史",query["keyword"] as? String ?? "",in:box);button("搜索 / 刷新",in:box){[self]in query["keyword"]=search.stringValue;query["source"]=source.stringValue;query["level"]=level.titleOfSelectedItem ?? "all";if hours.integerValue>0{query["startTime"]=Int64(Date().timeIntervalSince1970*1000)-Int64(min(hours.integerValue,168))*3600000}else{query.removeValue(forKey:"startTime")};cursor=nil;cursors=[];loadLogs()};let table=NSTableView();let column=NSTableColumn(identifier:NSUserInterfaceItemIdentifier("entry"));column.title="日志";column.width=760;table.addTableColumn(column);table.delegate=self;table.dataSource=self;table.rowHeight=40;table.target=self;table.doubleAction=#selector(logDetails);let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.drawsBackground=false;table.backgroundColor = .clear;scroll.documentView=table;scroll.heightAnchor.constraint(equalToConstant:350).isActive=true;scroll.widthAnchor.constraint(equalTo:box.widthAnchor).isActive=true;box.addArrangedSubview(scroll);self.table=table;button("上一页",in:box){[self]in if !cursors.isEmpty{cursor=cursors.removeLast();loadLogs()}};button("下一页",in:box){[self]in if let nextCursor{cursors.append(cursor);cursor=nextCursor;loadLogs()}};for(title,filter,format)in[("导出全部",false,"text"),("导出筛选",true,"text"),("导出 JSON",false,"json")]{button(title,in:box){[self]in request("export_logs",["query":filter ? query:[:],"format":format]){value in if let path=(value as? [String:Any])?["path"] as? String{NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:path)])}}}};button("清空日志",in:box){[self]in let alert=NSAlert();alert.messageText="清空全部保留日志？";alert.addButton(withTitle:"清空");alert.addButton(withTitle:"取消");alert.beginSheetModal(for:window){response in if response == .alertFirstButtonReturn{self.request("clear_logs"){generation in self.logGeneration=(generation as? Int) ?? (self.logGeneration+1);self.cursor=nil;self.cursors=[];self.loadLogs()}}}};loadLogs()}
    func loadLogs(){logRequest+=1;let token=logRequest;var q=query;q["cursor"]=cursor.map{$0 as Any} ?? NSNull();q["limit"]=200;request("logs",q){[weak self]value in guard let self,self.page=="日志",self.logRequest==token,let result=value as? [String:Any],let generation=result["generation"] as? Int,generation>=self.logGeneration else{return};self.logGeneration=generation;self.entries=result["entries"] as? [[String:Any]] ?? [];self.nextCursor=(result["hasMore"] as? Bool==true) ? result["nextCursor"] as? String:nil;self.table?.reloadData()}}
    func numberOfRows(in tableView:NSTableView)->Int{entries.count}
    func tableView(_ tableView:NSTableView,viewFor column:NSTableColumn?,row:Int)->NSView?{let id=NSUserInterfaceItemIdentifier("log-row");let field=(tableView.makeView(withIdentifier:id,owner:nil) as? NSTextField) ?? NSTextField(labelWithString:"");field.identifier=id;field.stringValue="[\(entries[row]["level"] ?? "")] \(entries[row]["source"] ?? "")  \(entries[row]["message"] ?? "")";field.lineBreakMode = .byTruncatingTail;return field}
    @objc func logDetails(){guard let table,table.clickedRow>=0 else{return};let alert=NSAlert();alert.messageText="日志详情";let data=(try? JSONSerialization.data(withJSONObject:entries[table.clickedRow],options:[.prettyPrinted,.sortedKeys])) ?? Data();alert.informativeText=String(data:data,encoding:.utf8) ?? "";alert.addButton(withTitle:"关闭");alert.addButton(withTitle:"复制");alert.beginSheetModal(for:window){response in if response == .alertSecondButtonReturn{NSPasteboard.general.clearContents();NSPasteboard.general.setString(alert.informativeText,forType:.string)}}}
}
let delegate=App();NSApplication.shared.delegate=delegate;NSApplication.shared.run()
