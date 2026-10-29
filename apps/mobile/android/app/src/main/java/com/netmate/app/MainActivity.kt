package com.netmate.app
import android.Manifest
import android.app.*
import android.os.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.view.*
import android.content.res.Configuration
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.InsetDrawable
import android.widget.*
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.core.content.FileProvider
import androidx.core.widget.doAfterTextChanged
import com.netmate.app.ipc.*
import com.netmate.app.service.BackgroundService
import org.json.*
import java.io.File
import java.util.UUID

/** Platform Views only. Configuration and network ownership remain in :network. */
class MainActivity : Activity() {
    private var darkMode=true
    private val appearance by lazy { NetMateAppearance(darkMode,resources.displayMetrics.density) }
    override fun attachBaseContext(base:Context){
        darkMode=base.getSharedPreferences("netmate_native_ui_v1",Context.MODE_PRIVATE).getString("theme","dark")!="light"
        val configuration=Configuration(base.resources.configuration)
        configuration.uiMode=(configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or if(darkMode)Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        super.attachBaseContext(base.createConfigurationContext(configuration))
    }
    private var remote: INetwork? = null
    private var bound=false
    private var visible=false
    private var fullyDrawn=false
    private var generation=0
    private val handler=Handler(Looper.getMainLooper())
    private lateinit var content: FrameLayout
    private lateinit var feedback: TextView
    private var activeDialog: Dialog? = null
    private val dialogs=mutableSetOf<Dialog>()
    private fun track(dialog:Dialog){dialogs.add(dialog);dialog.setOnDismissListener{dialogs.remove(dialog)}}
    private var page="运行状态"
    private var config=JSONObject()
    private var status=JSONObject()
    private var connectionAction:Button?=null
    private var emptyLogs:TextView?=null
    private var stateLabel:TextView?=null
    private var wifiLabel:TextView?=null
    private var accountLabel:TextView?=null
    private var heartbeatLabel:TextView?=null
    private var logAdapter:LogAdapter?=null
    private var cursor:String?=null
    private var nextCursor:String?=null
    private val cursors=mutableListOf<String?>()
    private var logQuery=JSONObject()
    private var logGeneration=0
    private val events=object:IEvents.Stub(){
        override fun changed(snapshot:String){
            runOnUiThread{
                if(visible){
                    val next=JSONObject(snapshot)
                    val refresh=page=="日志" && cursor==null && next.optLong("logRevision")!=status.optLong("logRevision")
                    status=next;updateStatus()
                    if(refresh){handler.removeCallbacks(refreshLogs);handler.postDelayed(refreshLogs,150)}
                }
            }
        }
    }
    private val refreshLogs=Runnable{if(visible && page=="日志" && cursor==null)loadLogs()}
    private val connection=object:ServiceConnection{
        override fun onServiceConnected(name:ComponentName,binder:IBinder){
            remote=INetwork.Stub.asInterface(binder)
            if(visible){
                remote?.subscribe(events)
                call("config"){
                    config=it as JSONObject
                    render()
                    if(!fullyDrawn){fullyDrawn=true;markFullyDrawn()}
                    if(config.optBoolean("autoUpdate",true)&&BuildConfig.UPDATE_ENDPOINT.isNotEmpty()){
                        call("update_check",silent=true)
                    }
                }
            }
        }
        override fun onServiceDisconnected(name:ComponentName){remote=null;feedback.text="后台连接已断开，请重新打开应用"}
    }
    override fun onCreate(state:Bundle?){
        setTheme(if(darkMode)R.style.NetMateDark else R.style.NetMateLight);super.onCreate(state);page=state?.getString("page") ?: "运行状态";setContentView(R.layout.activity_main)
        content=findViewById(R.id.content);feedback=findViewById(R.id.feedback);feedback.setTextColor(appearance.secondary)
        feedback.visibility=View.GONE
        feedback.doAfterTextChanged{feedback.visibility=if(it.isNullOrEmpty())View.GONE else View.VISIBLE}
        val root=findViewById<View>(R.id.root);root.background=appearance.background()
        findViewById<TextView>(R.id.page_title).setTextColor(appearance.text)
        val toggle=findViewById<Button>(R.id.appearance_toggle);toggle.text="";toggle.background=InsetDrawable(DayNightDrawable(darkMode),appearance.dp(4),appearance.dp(8),appearance.dp(4),appearance.dp(8));toggle.contentDescription=if(darkMode)"切换至白天模式"else"切换至黑夜模式"
        toggle.tag="theme"
        toggle.setOnClickListener{
            darkMode=!darkMode;appearance.dark=darkMode
            getSharedPreferences("netmate_native_ui_v1",MODE_PRIVATE).edit().putString("theme",if(darkMode)"dark"else"light").apply()
            theme.applyStyle(if(darkMode)R.style.NetMateDark else R.style.NetMateLight,true)
            applyAppearance();updateStatus()
        }
        applyAppearance()
        root.setOnApplyWindowInsetsListener{view,insets->val bars=insets.getInsets(WindowInsets.Type.systemBars());val keyboard=insets.getInsets(WindowInsets.Type.ime());view.setPadding(0,bars.top,0,maxOf(0,keyboard.bottom-bars.bottom));findViewById<LinearLayout>(R.id.navigation).setPadding(0,appearance.dp(8),0,bars.bottom+appearance.dp(8));insets}
        navigation()
    }
    override fun onSaveInstanceState(state:Bundle){state.putString("page",page);super.onSaveInstanceState(state)}
    private fun navigation(){
        val nav=findViewById<LinearLayout>(R.id.navigation);nav.removeAllViews();nav.tag="navigation";nav.background=appearance.surface(0,if(darkMode)0x800f172a.toInt()else 0x4dffffff)
        for((key,title)in listOf("运行状态" to "运行状态","设置" to "配置设置","日志" to "运行日志")){
            val active=if(key=="设置")page in listOf("设置","账号","WiFi","关于")else page==key
            nav.addView(Button(this).apply{tag="tab";text=title;textSize=13f;minHeight=appearance.dp(64);minimumWidth=0;isAllCaps=false;setTextColor(if(active)appearance.primary else appearance.secondary);typeface=Typeface.create("sans-serif",if(active)Typeface.BOLD else Typeface.NORMAL);background=null;setPadding(0,appearance.dp(8),0,appearance.dp(4));setCompoundDrawablesWithIntrinsicBounds(null,appearance.icon(title,active),null,null);compoundDrawablePadding=appearance.dp(6);isSelected=active;contentDescription=title;setOnClickListener{page=key;render()}},LinearLayout.LayoutParams(0,-2,1f))
        }
    }
    private fun markFullyDrawn(){
        val listener=object:ViewTreeObserver.OnDrawListener{
            var sent=false
            override fun onDraw(){
                if(sent)return
                sent=true
                content.post{content.viewTreeObserver.removeOnDrawListener(this);if(visible)reportFullyDrawn()}
            }
        }
        content.viewTreeObserver.addOnDrawListener(listener);content.invalidate()
    }
    override fun onStart(){super.onStart();visible=true;generation++;try{startForegroundService(Intent(this,BackgroundService::class.java).setAction(BackgroundService.ACTION_START))}catch(e:Exception){feedback.text="后台服务未启动：${e.message}"};bound=bindService(Intent(this,NetworkService::class.java),connection,Context.BIND_AUTO_CREATE)}
    override fun onStop(){dialogs.toList().forEach{it.dismiss()};dialogs.clear();activeDialog?.dismiss();activeDialog=null;visible=false;generation++;handler.removeCallbacksAndMessages(null);runCatching{remote?.unsubscribe(events)};if(bound)unbindService(connection);bound=false;remote=null;connectionAction=null;emptyLogs=null;stateLabel=null;wifiLabel=null;accountLabel=null;heartbeatLabel=null;logAdapter?.items=emptyList();logAdapter=null;config=JSONObject();status=JSONObject();content.removeAllViews();super.onStop()}
    private fun call(op:String,args:JSONObject=JSONObject(),silent:Boolean=false,done:(Any)->Unit={}){
        val service=remote ?: return
        val token=generation
        service.request(JSONObject().put("version",1).put("op",op).put("args",args).toString(),object:IResult.Stub(){
            override fun complete(response:String){
                runOnUiThread{
                    if(!visible||token!=generation)return@runOnUiThread
                    val reply=JSONObject(response)
                    if(reply.has("error")){
                        if(!silent)feedback.text=reply.optString("error")
                    }else{
                        if(!silent)feedback.text=""
                        done(reply.opt("result") ?: JSONObject.NULL)
                        if(op=="login"||op=="logout")call("config",silent=true){config=it as JSONObject;updateStatus()}
                    }
                }
            }
        })
    }
    private fun column(scroll:Boolean=true):LinearLayout{content.removeAllViews();connectionAction=null;emptyLogs=null;stateLabel=null;wifiLabel=null;accountLabel=null;heartbeatLabel=null;val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,0,0,appearance.dp(24))};if(scroll)content.addView(ScrollView(this).apply{addView(box)})else content.addView(box);return box}
    private fun LinearLayout.label(text:String,size:Float=16f):TextView=TextView(this@MainActivity).apply{this.text=text;textSize=size;tag="text";setTextColor(appearance.text);setPadding(0,appearance.dp(6),0,appearance.dp(10));this@label.addView(this)}
    private fun section(parent:LinearLayout,title:String):LinearLayout{
        val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;tag="card";background=appearance.surface();setPadding(appearance.dp(20),appearance.dp(20),appearance.dp(20),appearance.dp(20));elevation=appearance.dp(1).toFloat()}
        parent.addView(box,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=appearance.dp(20)})
        box.label(title,18f).setTypeface(null,Typeface.BOLD);return box
    }
    private fun paintAction(button:Button){
        val text=button.text.toString()
        val primary=text in listOf("立即连接","保存并应用","保存","添加账号","添加认证账号")
        val destructive=text.startsWith("删除")||text in listOf("断开连接","注销登录","清空日志")
        button.background=appearance.button(primary,destructive)
        button.setTextColor(if(destructive)appearance.danger else if(primary)appearance.onPrimary else appearance.primary)
    }
    private fun applyAppearance(){
        val root=findViewById<View>(R.id.root);root.background=appearance.background()
        val flags=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(if(darkMode)0 else flags,flags)
        fun paint(view:View){
            when(view.tag){
                "card"->view.background=appearance.surface()
                "navigation"->view.background=appearance.surface(0,if(darkMode)0x800f172a.toInt()else 0x4dffffff)
                "theme"->{view.background=InsetDrawable(DayNightDrawable(darkMode),appearance.dp(4),appearance.dp(8),appearance.dp(4),appearance.dp(8));view.contentDescription=if(darkMode)"切换至白天模式"else"切换至黑夜模式"}
                "entry"->{val field=view as EditText;field.setTextColor(appearance.text);field.setHintTextColor(appearance.secondary);field.background=appearance.surface(12)}
                "check"->{val field=view as CheckBox;field.setTextColor(appearance.text);field.buttonTintList=ColorStateList.valueOf(appearance.primary)}
                "action"->paintAction(view as Button)
                "tab"->{val button=view as Button;button.setTextColor(if(button.isSelected)appearance.primary else appearance.secondary);button.setCompoundDrawablesWithIntrinsicBounds(null,appearance.icon(button.text.toString(),button.isSelected),null,null)}
                "secondary"->(view as TextView).setTextColor(appearance.secondary)
                "log"->{(view as TextView).setTextColor(appearance.text);view.background=appearance.surface(10)}
                else->if(view is TextView)view.setTextColor(appearance.text)
            }
            if(view is ViewGroup)for(i in 0 until view.childCount)paint(view.getChildAt(i))
        }
        feedback.tag="secondary";paint(root)
    }
    private fun actionRow(parent:LinearLayout):LinearLayout=LinearLayout(this).apply{
        orientation=LinearLayout.HORIZONTAL;parent.addView(this,LinearLayout.LayoutParams(-1,-2).apply{topMargin=appearance.dp(4)})
    }
    private fun LinearLayout.action(text:String,action:()->Unit):Button{
        val button=Button(this@MainActivity).apply{tag="action";this.text=text;textSize=14f;isAllCaps=false;minHeight=appearance.dp(48);setPadding(appearance.dp(12),appearance.dp(8),appearance.dp(12),appearance.dp(8));setOnClickListener{action()}}
        paintAction(button)
        addView(button,if(orientation==LinearLayout.HORIZONTAL)LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=appearance.dp(6)}else LinearLayout.LayoutParams(-1,-2).apply{topMargin=appearance.dp(8)})
        return button
    }
    private fun LinearLayout.field(label:String,value:String="",password:Boolean=false,numeric:Boolean=false):EditText{label(label);return EditText(this@MainActivity).apply{tag="entry";setText(value);hint=label;contentDescription=label;setTextColor(appearance.text);setHintTextColor(appearance.secondary);background=appearance.surface(12);setPadding(appearance.dp(14),appearance.dp(12),appearance.dp(14),appearance.dp(12));isSingleLine=true;inputType=if(password)android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD else if(numeric)android.text.InputType.TYPE_CLASS_NUMBER else android.text.InputType.TYPE_CLASS_TEXT;this@field.addView(this)}}
    private fun LinearLayout.check(label:String,value:Boolean):CheckBox=CheckBox(this@MainActivity).apply{tag="check";text=label;isChecked=value;setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.primary);minHeight=appearance.dp(48);this@check.addView(this)}
    private fun array(field:String)=config.optJSONArray(field) ?: JSONArray()
    private fun items(field:String)=(0 until array(field).length()).map{array(field).getJSONObject(it)}
    private fun save(next:JSONObject){call("save_config",next){config=it as JSONObject;feedback.text="已保存并应用";render()}}
    private fun render(){if(!visible)return;navigation();findViewById<TextView>(R.id.page_title).text=when(page){"日志"->"运行日志";"设置"->"配置设置";"关于"->"关于 NetMate";else->page};when(page){"运行状态"->home();"账号"->accounts();"WiFi"->wifis();"日志"->logs();"设置"->settings();else->about()}}
    private fun home(){
        val root=column();val connection=section(root,"网络状态")
        stateLabel=connection.label("正在获取网络状态",24f).apply{gravity=Gravity.CENTER;setTypeface(null,Typeface.BOLD);setPadding(appearance.dp(20),appearance.dp(12),appearance.dp(20),appearance.dp(12))}
        connectionAction=connection.action("立即连接"){call(if(status.optBoolean("authenticated"))"logout"else"login")}
        val wifi=section(root,"当前 WiFi");wifiLabel=wifi.label("")
        val wifiActions=actionRow(wifi);wifiActions.action("WiFi 设置"){startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))};wifiActions.action("管理 WiFi"){page="设置";render()}
        val account=section(root,"首选认证账号");accountLabel=account.label("")
        val heartbeat=section(root,"自动认证");heartbeatLabel=heartbeat.label("").apply{tag="secondary"}
        val recovery=actionRow(heartbeat);recovery.action("立即恢复"){call("retry")};recovery.action("停止恢复"){call("stop_recovery")}
        updateStatus();call("snapshot"){status=it as JSONObject;updateStatus()}
    }
    private fun updateStatus(){
        val network=status.optJSONObject("network") ?: JSONObject();val progress=status.optJSONObject("progress") ?: JSONObject()
        val online=status.optBoolean("internetReachable");stateLabel?.text=if(online)"已连接"else if(status.optBoolean("authenticating"))"连接中…"else"未连接";stateLabel?.setTextColor(if(online)appearance.success else appearance.danger)
        stateLabel?.background=appearance.surface(50,((if(online)appearance.success else appearance.danger)and 0x00ffffff)or 0x20000000)
        connectionAction?.let{button->val connecting=status.optBoolean("authenticating");button.text=if(connecting)"正在连接…"else if(status.optBoolean("authenticated"))"注销登录"else"立即连接";button.isEnabled=!connecting;paintAction(button)}
        wifiLabel?.text="${network.optString("ssid","未连接 WiFi")}\nIPv4  ${network.optString("ipv4","未知")}\nIPv6  ${network.optString("ipv6","未知")}\nBSSID  ${network.optString("bssid","未知")}\n信号  ${network.opt("signal") ?: "未知"}    频率  ${network.opt("frequency") ?: "未知"} MHz\n速率  ${network.opt("linkSpeed") ?: "未知"} Mbps"
        val account=items("accounts").firstOrNull{it.optString("id")==config.optString("currentAccountId")}
        accountLabel?.text=account?.let{"用户名  ${it.optString("username")}\n服务器  ${it.optString("serverUrl")}"} ?: "尚未配置认证账号，请在配置设置中添加账号并关联 WiFi。"
        heartbeatLabel?.text="${if(config.optBoolean("heartbeatEnabled",true))"心跳检测已开启"else"心跳检测已关闭"}  ·  每 ${config.optInt("heartbeatIntervalSeconds",30)} 秒检测一次\n${if(status.optBoolean("paused"))"自动认证已暂停"else if(status.optBoolean("authenticated"))"门户已认证"else progress.optString("reason","等待网络状态")}";heartbeatLabel?.setTextColor(appearance.secondary)
    }
    private fun accounts(parent:LinearLayout?=null){val box=parent ?: column();box.action("添加账号"){accountEditor(null)};items("accounts").forEach{a->box.label("${a.optString("name",a.getString("username"))}${if(config.optString("currentAccountId")==a.getString("id"))" · 当前账号" else ""}",18f);box.action("编辑 ${a.getString("username")}"){accountEditor(a)};box.action("设为当前账号"){save(JSONObject(config.toString()).put("currentAccountId",a.getString("id")))}}}
    private fun editDialog(title:String,box:LinearLayout,onSave:()->Unit){val scroll=ScrollView(this).apply{addView(box);setPadding(20,0,20,0)};val dialog=AlertDialog.Builder(this).setTitle(title).setView(scroll).setPositiveButton("保存",null).setNegativeButton("取消",null).create();dialog.setOnShowListener{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{try{onSave();dialog.dismiss()}catch(e:Exception){feedback.text=e.message}}};activeDialog=dialog;dialog.show();track(dialog)}
    private fun accountEditor(previous:JSONObject?){val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};val name=box.field("显示名称",previous?.optString("name").orEmpty());val username=box.field("账号",previous?.optString("username").orEmpty());val password=box.field(if(previous?.optBoolean("hasPassword")==true)"密码（留空保留）" else "密码",password=true);val clear=box.check("清空已保存密码",false);val server=box.field("认证服务器",previous?.optString("serverUrl") ?: "http://10.10.102.50:801");val isp=Spinner(this);val values=listOf("campus","cmcc","cucc","ctcc");isp.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,listOf("校园网","中国移动","中国联通","中国电信"));isp.setSelection(values.indexOf(previous?.optString("isp")).coerceAtLeast(0));box.addView(isp)
        if(previous!=null)box.action("删除账号"){val id=previous.getString("id");val next=JSONObject(config.toString());next.put("accounts",JSONArray(items("accounts").filter{it.getString("id")!=id}));if(next.optString("currentAccountId")==id)next.put("currentAccountId",JSONObject.NULL);items("wifiRules").forEach{w->w.put("linkedAccountIds",JSONArray((0 until (w.optJSONArray("linkedAccountIds") ?: JSONArray()).length()).map{w.getJSONArray("linkedAccountIds").getString(it)}.filter{it!=id}))};next.put("wifiRules",array("wifiRules"));save(next)}
        editDialog("认证账号",box){require(username.text.isNotBlank()){"请输入账号"};val item=JSONObject().put("id",previous?.getString("id") ?: UUID.randomUUID().toString()).put("name",name.text.toString()).put("username",username.text.toString()).put("serverUrl",server.text.toString()).put("isp",values[isp.selectedItemPosition]);item.put("passwordEdit",passwordEdit(password.text.toString(),clear.isChecked));val list=items("accounts").filter{it.getString("id")!=item.getString("id")}.toMutableList();list.add(item);save(JSONObject(config.toString()).put("accounts",JSONArray(list)).apply{if(optString("currentAccountId").isBlank()||isNull("currentAccountId"))put("currentAccountId",item.getString("id"))})}
    }
    private fun passwordEdit(value:String,clear:Boolean)=JSONObject().put("action",if(clear)"clear" else if(value.isNotEmpty())"replace" else "keep").apply{if(value.isNotEmpty())put("value",value)}
    private fun wifis(parent:LinearLayout?=null){val box=parent ?: column();box.action("扫描附近 WiFi"){feedback.text="正在等待系统扫描…";call("scan"){result->val networks=result as JSONArray;val names=(0 until networks.length()).map{networks.getJSONObject(it)};AlertDialog.Builder(this).setTitle("附近网络").setItems(names.map{"${it.optString("ssid")} · ${it.optString("security")} · ${it.optInt("rssi")} dBm"}.toTypedArray()){_,i->wifiEditor(null,names[i])}.setNegativeButton("取消",null).show().also(::track)}};box.action("手动添加 WiFi"){wifiEditor(null)};items("wifiRules").forEach{w->box.label("${w.getString("ssid")} · 优先级 ${w.optInt("priority",10)}",18f);box.action("编辑网络"){wifiEditor(w)};box.action("连接 ${w.getString("ssid")}"){call("connect",JSONObject().put("id",w.getString("id")))}}}
    private fun wifiEditor(previous:JSONObject?,scan:JSONObject?=null){val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};val ssid=box.field("WiFi 名称",previous?.optString("ssid") ?: scan?.optString("ssid").orEmpty());val password=box.field("密码（留空保留）",password=true);val clear=box.check("清空密码（开放网络）",false);val priority=box.field("优先级 1–99",previous?.optInt("priority",10)?.toString() ?: "10",numeric=true);val security=box.field("安全类型",previous?.optString("security") ?: scan?.optString("security").orEmpty());val bssid=box.field("BSSID（可留空）",previous?.optString("bssid").orEmpty());val auto=box.check("允许自动连接",previous?.optBoolean("autoConnect") ?: true);val auth=box.check("需要校园网认证",previous?.optBoolean("requiresAuth") ?: false);val linked=mutableListOf<String>();previous?.optJSONArray("linkedAccountIds")?.let{for(i in 0 until it.length())linked.add(it.getString(i))};box.action("选择关联账号和尝试顺序"){val accounts=items("accounts");val chosen=BooleanArray(accounts.size){linked.contains(accounts[it].getString("id"))};AlertDialog.Builder(this).setTitle("按账号列表顺序尝试").setMultiChoiceItems(accounts.map{it.optString("name",it.getString("username"))}.toTypedArray(),chosen){_,i,on->chosen[i]=on}.setPositiveButton("确定"){_,_->linked.clear();accounts.forEachIndexed{i,a->if(chosen[i])linked.add(a.getString("id"))}}.show().also(::track)}
        if(previous!=null)box.action("删除网络"){save(JSONObject(config.toString()).put("wifiRules",JSONArray(items("wifiRules").filter{it.getString("id")!=previous.getString("id")})))}
        editDialog("WiFi 配置",box){val p=priority.text.toString().toInt();require(p in 1..99);val item=JSONObject().put("id",previous?.getString("id") ?: UUID.randomUUID().toString()).put("ssid",ssid.text.toString()).put("priority",p).put("security",security.text.toString().ifBlank{null}).put("bssid",bssid.text.toString().ifBlank{null}).put("autoConnect",auto.isChecked).put("requiresAuth",auth.isChecked).put("linkedAccountIds",JSONArray(linked)).put("passwordEdit",passwordEdit(password.text.toString(),clear.isChecked));val list=items("wifiRules").filter{it.getString("id")!=item.getString("id")}.toMutableList();list.add(item);save(JSONObject(config.toString()).put("wifiRules",JSONArray(list)))}
    }
    private fun settings(){val root=column();accounts(section(root,"账号配置"));wifis(section(root,"WiFi 配置"));val permissions=section(root,"权限设置");permissions.action("授权定位、附近设备和通知"){requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.NEARBY_WIFI_DEVICES,Manifest.permission.POST_NOTIFICATIONS),17)};permissions.action("后台权限与电池设置"){startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))};val info=section(root,"关于");info.action("关于 NetMate 与更新"){page="关于";render()};val box=section(root,"通用设置");val flags=listOf("enabled" to "断线自动恢复","heartbeatEnabled" to "启用心跳检测","startupAutoConnect" to "启动时自动连接","keepCurrentConnection" to "保持当前连接","autoLaunch" to "开机自启","autoUpdate" to "自动检查更新").associate{(key,label)->key to box.check(label,config.optBoolean(key,key in listOf("enabled","heartbeatEnabled","keepCurrentConnection","autoUpdate")))};val interval=box.field("心跳间隔（秒）",config.optInt("heartbeatIntervalSeconds",30).toString(),numeric=true);val threshold=box.field("连续失败阈值",config.optInt("failureThreshold",3).toString(),numeric=true);val retries=box.field("每个 WiFi 尝试次数（含首次）",config.optInt("wifiRetries",3).toString(),numeric=true);val cooldown=box.field("全部失败后冷却（分钟）",config.optInt("wifiCooldownMinutes",5).toString(),numeric=true);val notifications=config.optJSONObject("notifications") ?: JSONObject();val notices=listOf("wifiDisconnected" to "WiFi 断开通知","reconnectSuccess" to "恢复成功通知","reconnectFailed" to "恢复失败通知","authRecovered" to "认证恢复通知").associate{(key,label)->key to box.check(label,notifications.optBoolean(key,true))};box.action("保存并应用"){try{val next=JSONObject(config.toString());flags.forEach{(k,v)->next.put(k,v.isChecked)};val i=interval.text.toString().toInt();val t=threshold.text.toString().toInt();val r=retries.text.toString().toInt();val c=cooldown.text.toString().toInt();require(i in 15..300 && t in 1..10 && r in 1..10 && c in 0..1440){"请检查间隔、次数和冷却范围"};next.put("heartbeatIntervalSeconds",i).put("failureThreshold",t).put("wifiRetries",r).put("wifiCooldownMinutes",c).put("notifications",JSONObject().apply{notices.forEach{(k,v)->put(k,v.isChecked)}});save(next)}catch(e:Exception){feedback.text=e.message}}}
    private fun logs(){
        val box=column(false)
        val toolbar=actionRow(box)
        toolbar.action("筛选"){logFilters()};toolbar.action("刷新"){cursor=null;cursors.clear();loadLogs()};toolbar.action("导出"){exportLogs()};toolbar.action("清空日志"){clearLogs()}
        emptyLogs=box.label("正在读取日志…",14f).apply{tag="secondary"}
        val list=RecyclerView(this).apply{layoutManager=LinearLayoutManager(this@MainActivity);setItemViewCacheSize(2)}
        logAdapter=LogAdapter();list.adapter=logAdapter;box.addView(list,LinearLayout.LayoutParams(-1,0,1f).apply{topMargin=appearance.dp(12)})
        val pagination=actionRow(box)
        pagination.action("上一页"){if(cursors.isNotEmpty()){cursor=cursors.removeAt(cursors.lastIndex);loadLogs()}}
        pagination.action("下一页"){nextCursor?.let{cursors.add(cursor);cursor=it;loadLogs()}}
        loadLogs()
    }
    private fun logFilters(){
        val options=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        val keyword=options.field("搜索全部保留历史",logQuery.optString("keyword"))
        val source=options.field("来源（可留空）",logQuery.optString("source"))
        val hours=options.field("最近小时（0=全部保留历史）","0",numeric=true)
        val levels=listOf("all","debug","info","success","warn","error")
        val level=Spinner(this);level.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,listOf("全部级别","调试","信息","成功","警告","错误"));level.setSelection(levels.indexOf(logQuery.optString("level","all")).coerceAtLeast(0));options.addView(level)
        editDialog("日志筛选",options){val h=hours.text.toString().toInt();require(h in 0..168){"请输入 0–168 小时"};logQuery.put("keyword",keyword.text.toString()).put("source",source.text.toString()).put("level",levels[level.selectedItemPosition]);if(h>0)logQuery.put("startTime",System.currentTimeMillis()-h*3600000L)else logQuery.remove("startTime");cursor=null;cursors.clear();loadLogs()}
    }
    private fun exportLogs(){
        AlertDialog.Builder(this).setItems(arrayOf("全部历史 · 文本","当前筛选 · 文本","全部历史 · JSON","当前筛选 · JSON")){_,i->
            call("export_logs",JSONObject().put("format",if(i>=2)"json"else"text").put("query",if(i%2==0)JSONObject()else logQuery)){result->
                val file=File((result as JSONObject).getString("path"));val uri=FileProvider.getUriForFile(this,"$packageName.files",file)
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(if(i>=2)"application/json"else"text/plain").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"分享日志"))
            }
        }.show().also(::track)
    }
    private fun clearLogs(){AlertDialog.Builder(this).setMessage("清空全部保留日志？").setPositiveButton("清空"){_,_->logGeneration++;call("clear_logs"){cursor=null;cursors.clear();loadLogs()}}.setNegativeButton("取消",null).show().also(::track)}
    private fun loadLogs(){val token=++logGeneration;call("logs",JSONObject(logQuery.toString()).put("cursor",cursor).put("limit",200)){result->if(page!="日志"||token!=logGeneration)return@call;val p=result as JSONObject;val a=p.getJSONArray("entries");logAdapter?.items=(0 until a.length()).map(a::getJSONObject);logAdapter?.notifyDataSetChanged();nextCursor=if(p.optBoolean("hasMore"))p.optString("nextCursor")else null;emptyLogs?.visibility=if(a.length()==0)View.VISIBLE else View.GONE;emptyLogs?.text="暂无匹配的日志记录";feedback.text="共 ${p.optLong("total")} 条 · 本页 ${a.length()} 条${if(nextCursor!=null)" · 可加载更早记录" else ""}"}}
    private inner class LogAdapter:RecyclerView.Adapter<LogHolder>(){
        var items=emptyList<JSONObject>()
        private val dateFormat=java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT,java.text.DateFormat.MEDIUM)
        override fun getItemCount()=items.size
        override fun onCreateViewHolder(parent:ViewGroup,kind:Int)=LogHolder(TextView(this@MainActivity).apply{
            tag="log";setPadding(appearance.dp(14),appearance.dp(12),appearance.dp(14),appearance.dp(12))
            maxLines=3;ellipsize=android.text.TextUtils.TruncateAt.END;textSize=14f;setTextColor(appearance.text);background=appearance.surface(10)
            layoutParams=RecyclerView.LayoutParams(-1,-2).apply{bottomMargin=appearance.dp(8)}
        })
        override fun onBindViewHolder(holder:LogHolder,position:Int){
            val entry=items[position]
            holder.text.setTextColor(appearance.text);holder.text.background=appearance.surface(10)
            holder.text.text="${dateFormat.format(java.util.Date(entry.optLong("timestamp")))}  [${entry.optString("level")}] ${entry.optString("source")}\n${entry.optString("message")}"
            holder.text.setOnClickListener{
                val details=entry.toString(2)
                AlertDialog.Builder(this@MainActivity).setTitle("日志详情").setMessage(details).setPositiveButton("复制"){_,_->
                    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("NetMate 日志",details));feedback.text="已复制"
                }.setNegativeButton("关闭",null).show().also(::track)
            }
        }
    }
    private class LogHolder(val text:TextView):RecyclerView.ViewHolder(text)
    private fun about(){val root=column();val box=section(root,"NetMate ${BuildConfig.VERSION_NAME}");box.label("WiFi 连接管理与校园网认证");box.action("检查更新"){call("update_check"){feedback.text=it.toString()}};box.action("下载更新"){call("update_download"){pollUpdate()}};box.action("查看下载进度"){pollUpdate()};box.action("取消下载"){call("update_cancel")};box.action("校验并安装更新"){call("update_install"){feedback.text=it.toString()}}}
    private fun pollUpdate(){if(!visible||page!="关于")return;call("update_state"){val result=it as JSONObject;feedback.text="${result.optString("state")} · ${result.optLong("received")} / ${result.optLong("total")} 字节";if(result.optString("state")=="downloading")handler.postDelayed({pollUpdate()},1000)}}
}
