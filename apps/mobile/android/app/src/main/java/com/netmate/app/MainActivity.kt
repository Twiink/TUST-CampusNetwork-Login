package com.netmate.app
import android.Manifest
import android.app.*
import android.os.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.view.*
import android.view.inputmethod.EditorInfo
import android.content.res.Configuration
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.text.InputType
import android.widget.*
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.core.content.FileProvider
import androidx.core.widget.doAfterTextChanged
import com.netmate.app.auth.AutoAuthWifiRule
import com.netmate.app.auth.WifiFacts
import com.netmate.app.auth.WifiSecurity
import com.netmate.app.ipc.*
import com.netmate.app.service.BackgroundService
import org.json.*
import java.io.File
import java.util.UUID

/**
 * Platform Views only. Configuration and network ownership remain in :network.
 * Layout, spacing and colours follow the React Native pages in src/screens and src/components.
 */
class MainActivity : Activity() {
    private enum class Tone { Primary, Danger, Pill, Muted, Tinted, Delete, Plain, Link, Outline, OutlineDanger }
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
    // Home
    private var homeBody:LinearLayout?=null
    private var homeSignature=""
    private var countdown:TextView?=null
    private var countdownAt=0L
    // Settings
    private var scroller:ScrollView?=null
    private var restoreScroll=0
    private var saving=false
    private var pendingRefresh=false
    private val pending=mutableListOf<(JSONObject)->Unit>()
    private val debounces=mutableMapOf<String,Runnable>()
    private var nearbyCard:LinearLayout?=null
    private var nearby:List<JSONObject>?=null
    private var scanning=false
    private var scanError=""
    private var wifiForm:WifiForm?=null
    private var updateCard:LinearLayout?=null
    private var updateState=JSONObject()
    private var updateMessage=""
    private var updateBusy=false
    private var release:JSONObject?=null
    // Logs
    private var emptyLogs:TextView?=null
    private var logStatus:TextView?=null
    private var logChips:LinearLayout?=null
    private var exportPanel:LinearLayout?=null
    private var exportFiltered=false
    private var exportJson=false
    private var logAdapter:LogAdapter?=null
    private var cursor:String?=null
    private var nextCursor:String?=null
    private val cursors=mutableListOf<String?>()
    private var logQuery=JSONObject()
    private var logGeneration=0
    private class WifiForm(val card:View,val ssid:EditText,val security:EditText,val bssid:EditText)
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
    private val tick=object:Runnable{override fun run(){val label=countdown ?: return;val left=countdownAt-System.currentTimeMillis();label.text="剩余 ${maxOf(0L,(left+999)/1000)} 秒后重试";if(left>0)handler.postDelayed(this,1000)}}
    private val pollUpdate=object:Runnable{override fun run(){
        if(!visible||page!="设置")return
        call("update_state",silent=true){updateState=it as JSONObject;renderUpdate();if(updateState.str("state")=="downloading"){handler.removeCallbacks(this);handler.postDelayed(this,1000)}}
    }}
    private val connection=object:ServiceConnection{
        override fun onServiceConnected(name:ComponentName,binder:IBinder){
            remote=INetwork.Stub.asInterface(binder)
            if(visible){
                call("config"){
                    config=it as JSONObject
                    render()
                    if(!fullyDrawn){fullyDrawn=true;markFullyDrawn()}
                    remote?.subscribe(events)
                    if(config.optBoolean("autoUpdate",true)&&BuildConfig.UPDATE_ENDPOINT.isNotEmpty()){
                        call("update_check",silent=true){val latest=it as JSONObject;if(latest.has("version")){release=latest;updateMessage="新版本 ${latest.str("version")} 可用";renderUpdate()}}
                    }
                }
            }
        }
        override fun onServiceDisconnected(name:ComponentName){remote=null;feedback.text="后台连接已断开，请重新打开应用"}
    }
    override fun onCreate(state:Bundle?){
        setTheme(if(darkMode)R.style.NetMateDark else R.style.NetMateLight);super.onCreate(state);page=state?.getString("page") ?: "运行状态";setContentView(R.layout.activity_main)
        content=findViewById(R.id.content);feedback=findViewById(R.id.feedback)
        feedback.visibility=View.GONE
        feedback.doAfterTextChanged{feedback.visibility=if(it.isNullOrEmpty())View.GONE else View.VISIBLE}
        val root=findViewById<View>(R.id.root)
        val toggle=findViewById<DayNightToggle>(R.id.appearance_toggle)
        toggle.setOnClickListener{
            darkMode=!darkMode;appearance.dark=darkMode
            getSharedPreferences("netmate_native_ui_v1",MODE_PRIVATE).edit().putString("theme",if(darkMode)"dark"else"light").apply()
            theme.applyStyle(if(darkMode)R.style.NetMateDark else R.style.NetMateLight,true)
            applyAppearance(animate=true)
        }
        applyAppearance()
        root.setOnApplyWindowInsetsListener{view,insets->val bars=insets.getInsets(WindowInsets.Type.systemBars());val keyboard=insets.getInsets(WindowInsets.Type.ime());view.setPadding(0,0,0,maxOf(0,keyboard.bottom-bars.bottom))
            // The top bar gradient runs under the status bar, as the rail does on the desktop.
            findViewById<View>(R.id.top_bar).setPadding(dp(18),bars.top+dp(14),dp(14),dp(10))
            findViewById<LinearLayout>(R.id.navigation).setPadding(dp(8),dp(6),dp(8),bars.bottom+dp(14));insets}
        navigation()
    }
    override fun onSaveInstanceState(state:Bundle){state.putString("page",page);super.onSaveInstanceState(state)}
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(visible&&page=="设置")rerender()}
    /** .phone .tabbar: surface bar with a top line; the active tab has an accent-soft pill behind its icon. */
    private fun navigation(){
        val nav=findViewById<LinearLayout>(R.id.navigation);nav.removeAllViews();nav.setTag(R.id.painter,null);nav.themed{background=appearance.tabBar()}
        for((key,title)in listOf("运行状态" to "运行状态","设置" to "配置设置","日志" to "运行日志")){
            val active=page==key
            nav.addView(Button(this).apply{
                text=title;textSize=12f;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(56);gravity=Gravity.CENTER
                setPadding(0,dp(6),0,dp(6));compoundDrawablePadding=dp(4);isSelected=active;contentDescription=title
                themed{background=appearance.pressable(ColorDrawable(Color.TRANSPARENT),16f);setTextColor(if(active)appearance.text else appearance.secondary);typeface=appearance.weight(600);setCompoundDrawablesWithIntrinsicBounds(null,appearance.tabIcon(title,active),null,null)}
                setOnClickListener{page=key;render()}
            },LinearLayout.LayoutParams(0,-2,1f))
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
    // Ambient toggle motion (halo, clouds, stars) runs only while resumed and focused; nothing ticks in the background.
    private var resumed=false
    private var focused=false
    private fun ambient(immediate:Boolean=false)=findViewById<DayNightToggle>(R.id.appearance_toggle).setActive(resumed&&focused,immediate)
    override fun onResume(){super.onResume();resumed=true;ambient()}
    override fun onPause(){resumed=false;ambient();super.onPause()}
    override fun onWindowFocusChanged(hasFocus:Boolean){super.onWindowFocusChanged(hasFocus);focused=hasFocus;ambient()}
    override fun onStop(){
        resumed=false;focused=false;ambient(immediate=true)
        dialogs.toList().forEach{it.dismiss()};dialogs.clear();activeDialog?.dismiss();activeDialog=null;visible=false;generation++;handler.removeCallbacksAndMessages(null)
        runCatching{remote?.unsubscribe(events)};if(bound)unbindService(connection);bound=false;remote=null
        clearPage();saving=false;pending.clear();pendingRefresh=false;debounces.clear();scanning=false;updateBusy=false
        logAdapter?.items=emptyList();logAdapter=null;config=JSONObject();status=JSONObject();content.removeAllViews();super.onStop()
    }
    private fun call(op:String,args:JSONObject=JSONObject(),silent:Boolean=false,failed:(String)->Unit={},done:(Any)->Unit={}){
        val service=remote ?: return
        val token=generation
        service.request(JSONObject().put("version",1).put("op",op).put("args",args).toString(),object:IResult.Stub(){
            override fun complete(response:String){
                runOnUiThread{
                    if(!visible||token!=generation)return@runOnUiThread
                    val reply=JSONObject(response)
                    if(reply.has("error")){
                        val message=reply.optString("error")
                        if(!silent)feedback.text=message
                        failed(message)
                    }else{
                        if(!silent)feedback.text=""
                        done(reply.opt("result") ?: JSONObject.NULL)
                        if(op=="login"||op=="logout")call("config",silent=true){config=it as JSONObject;updateStatus()}
                    }
                }
            }
        })
    }
    // ---- Shared view helpers (GlassView, text styles, buttons and inputs of the RN pages) ----
    private fun dp(value:Int)=appearance.dp(value)
    private fun JSONObject.str(key:String):String=if(isNull(key))"" else optString(key)
    private fun JSONArray?.strings():List<String> = if(this==null) emptyList() else (0 until length()).map{getString(it)}
    /** Stores a painter on the view and runs it; a theme switch re-runs every painter in place. */
    private fun <T:View> T.themed(paint:T.()->Unit):T{val previous=getTag(R.id.painter) as? Runnable;setTag(R.id.painter,Runnable{previous?.run();paint()});paint();return this}
    private fun repaint(view:View){(view.getTag(R.id.painter) as? Runnable)?.run();if(view is ViewGroup)for(i in 0 until view.childCount)repaint(view.getChildAt(i))}
    private fun applyAppearance(animate:Boolean=false){
        val root=findViewById<View>(R.id.root);root.background=appearance.background()
        // The top bar is blue by day and navy by night, so status bar icons stay light; the tab bar is a surface.
        val flags=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(if(darkMode)0 else WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,flags)
        findViewById<View>(R.id.top_bar).background=appearance.topBar()
        findViewById<TextView>(R.id.brand).apply{setTextColor(appearance.railText);setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("运行状态",appearance.railText,26),null,null,null)}
        val toggle=findViewById<DayNightToggle>(R.id.appearance_toggle)
        toggle.setNight(darkMode,animate);toggle.contentDescription=if(darkMode)"切换至白天模式"else"切换至黑夜模式"
        findViewById<TextView>(R.id.page_title).setTextColor(appearance.text);feedback.setTextColor(appearance.secondary)
        repaint(root);logAdapter?.notifyDataSetChanged()
    }
    private fun LinearLayout.box(vertical:Boolean=true,params:LinearLayout.LayoutParams=LinearLayout.LayoutParams(-1,-2)):LinearLayout{val child=LinearLayout(this@MainActivity).apply{orientation=if(vertical)LinearLayout.VERTICAL else LinearLayout.HORIZONTAL;if(!vertical)gravity=Gravity.CENTER_VERTICAL};addView(child,params);return child}
    private fun LinearLayout.text(value:CharSequence,size:Float=15f,weight:Int=400,color:()->Int={appearance.text}):TextView{
        val view=TextView(this@MainActivity).apply{text=value;textSize=size;typeface=appearance.weight(weight);themed{setTextColor(color())}}
        addView(view,LinearLayout.LayoutParams(if(orientation==LinearLayout.HORIZONTAL)-2 else -1,-2));return view
    }
    private fun LinearLayout.secondary(value:CharSequence,size:Float=12f)=text(value,size){appearance.secondary}
    private fun margins(top:Int=0,bottom:Int=0,start:Int=0,end:Int=0,width:Int=-1)=LinearLayout.LayoutParams(width,-2).apply{topMargin=dp(top);bottomMargin=dp(bottom);marginStart=dp(start);marginEnd=dp(end)}
    /** .group-title (13sp/700, secondary) above a .panel: surface, 1dp line stroke, radius 14. */
    private fun card(parent:LinearLayout,title:String?=null,padding:Int=16):LinearLayout{
        if(title!=null)parent.text(title,13f,700){appearance.secondary}.apply{layoutParams=margins(top=8,bottom=8,start=4)}
        return parent.box(params=margins(bottom=16)).apply{setPadding(dp(padding),dp(padding),dp(padding),dp(padding));themed{background=appearance.surface()}}
    }
    private fun LinearLayout.subHeader(value:String)=text(value,14f,700).apply{layoutParams=margins(top=8,bottom=12)}
    private class Look(val radius:Float,val fill:Int,val stroke:Int?,val color:Int)
    /** .btn variants: radius 9; primary = accent fill, danger = surface with bad text, others surface + line. */
    private fun look(tone:Tone)=when(tone){
        Tone.Primary,Tone.Pill->Look(9f,appearance.primary,null,appearance.onPrimary)
        Tone.Danger,Tone.Delete,Tone.OutlineDanger->Look(9f,appearance.card,appearance.line,appearance.danger)
        Tone.Muted->Look(9f,appearance.surface2,null,appearance.secondary)
        Tone.Tinted->Look(9f,appearance.accentSoft,null,appearance.primary)
        Tone.Plain,Tone.Outline->Look(9f,appearance.card,appearance.line,appearance.text)
        Tone.Link->Look(9f,Color.TRANSPARENT,null,appearance.primary)
    }
    private fun paintButton(button:TextView,tone:Tone){
        val look=look(tone);button.alpha=if(button.isEnabled||tone==Tone.Muted)1f else .55f
        button.background=appearance.pressable(appearance.rounded(look.radius,look.fill,look.stroke),look.radius);button.setTextColor(look.color)
    }
    private fun LinearLayout.button(label:String,tone:Tone=Tone.Primary,params:LinearLayout.LayoutParams?=null,action:()->Unit):Button{
        val view=Button(this@MainActivity).apply{
            val large=tone in listOf(Tone.Primary,Tone.Danger)
            text=label;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(if(large)44 else 36)
            textSize=if(large)14f else 13.5f;typeface=appearance.weight(600)
            setPadding(dp(16),dp(if(large)10 else 6),dp(16),dp(if(large)10 else 6))
            themed{paintButton(this,tone)};setOnClickListener{action()}
        }
        addView(view,params ?: if(orientation==LinearLayout.HORIZONTAL)LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(8)} else margins(top=10))
        return view
    }
    private fun Button.enable(value:Boolean,tone:Tone){isEnabled=value;paintButton(this,tone)}
    private fun LinearLayout.label(value:String)=text(value,12.5f,600){appearance.secondary}.apply{layoutParams=margins(bottom=6)}
    /** .input: surface, 1dp line border, radius 9. contentDescription keeps the field addressable. */
    private fun LinearLayout.input(label:String?,value:String="",hint:String=label.orEmpty(),password:Boolean=false,numeric:Boolean=false,description:String=label ?: hint,radius:Float=9f,params:LinearLayout.LayoutParams?=null):EditText{
        if(label!=null)this.label(label)
        val field=EditText(this@MainActivity).apply{
            setText(value);this.hint=hint;contentDescription=description;textSize=15f;isSingleLine=true;setPadding(dp(12),dp(10),dp(12),dp(10))
            inputType=if(password)InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else if(numeric)InputType.TYPE_CLASS_NUMBER else InputType.TYPE_CLASS_TEXT
            themed{setTextColor(appearance.text);setHintTextColor(appearance.secondary);background=appearance.rounded(radius,appearance.fieldFill,appearance.outline)}
        }
        addView(field,params ?: margins(bottom=16));return field
    }
    /** .switch: accent track when on; the thumb is white (night: on-accent when on). */
    private fun Switch.tint(){themed{
        thumbTintList=ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(if(darkMode)appearance.onPrimary else Color.WHITE,Color.WHITE))
        trackTintList=ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(appearance.primary,appearance.line))
    }}
    /** settingRow: label 16/600, optional 12sp description, switch on the right, 1dp bottom line. */
    private fun LinearLayout.switchRow(label:String,description:String?,value:Boolean,last:Boolean=false,changed:(Boolean)->Unit):Switch{
        val row=box(false).apply{setPadding(0,dp(12),0,dp(12));minimumHeight=dp(52);if(!last)themed{background=appearance.bottomLine()}}
        val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(16)})
        texts.text(label,14f,600);if(description!=null)texts.secondary(description,12.5f).apply{layoutParams=margins(top=2)}
        val toggle=Switch(this@MainActivity).apply{isChecked=value;contentDescription=label;tint();setOnCheckedChangeListener{_,on->changed(on)}}
        row.addView(toggle,LinearLayout.LayoutParams(-2,-2));return toggle
    }
    /** .badge: 22dp high, radius 6, 12sp/600. */
    private fun badge(parent:LinearLayout,value:String,fill:()->Int,color:()->Int,stroke:(()->Int)?=null):TextView=parent.text(value,12f,600,color).apply{
        setPadding(dp(8),dp(2),dp(8),dp(2));minHeight=dp(22);gravity=Gravity.CENTER;maxLines=1;layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(6)}
        themed{background=appearance.rounded(6f,fill(),stroke?.invoke())}
    }
    private fun selected(action:(Int)->Unit)=object:AdapterView.OnItemSelectedListener{
        override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){action(position)}
        override fun onNothingSelected(parent:AdapterView<*>?){}
    }
    /**
     * PORT-SPEC §6 dropdown: the face looks like an input with a chevron; while the popup is open the stroke turns accent
     * and the chevron points up. The popup is a surface with radius 11 and 34dp rows; the selected row is accent with a check.
     * The platform Spinner keeps keyboard navigation and flips the popup upwards when there is no room below.
     */
    private inner class Dropdown(options:List<String>,description:String):Spinner(this@MainActivity,null,android.R.attr.spinnerStyle,Spinner.MODE_DROPDOWN){
        private var expanded=false
        init{
            contentDescription=description;minimumHeight=dp(36);dropDownVerticalOffset=dp(6)
            adapter=object:ArrayAdapter<String>(this@MainActivity,0,options){
                override fun getView(position:Int,convertView:View?,parent:ViewGroup):View=((convertView as? TextView) ?: TextView(this@MainActivity)).apply{
                    text=getItem(position);textSize=14f;typeface=appearance.weight(500);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END
                    gravity=Gravity.CENTER_VERTICAL or Gravity.START;minHeight=dp(36);setPadding(dp(12),0,dp(36),0);setTextColor(appearance.text)
                }
                override fun getDropDownView(position:Int,convertView:View?,parent:ViewGroup):View=((convertView as? TextView) ?: TextView(this@MainActivity)).apply{
                    val chosen=position==selectedItemPosition
                    text=getItem(position);textSize=13.5f;maxLines=1;gravity=Gravity.CENTER_VERTICAL;minHeight=dp(34);setPadding(dp(10),0,dp(12),0);compoundDrawablePadding=dp(8)
                    typeface=appearance.weight(if(chosen)600 else 400);setTextColor(if(chosen)appearance.primary else appearance.text)
                    setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("check",if(chosen)appearance.primary else Color.TRANSPARENT,14),null,null,null)
                    background=appearance.pressable(appearance.rounded(7f,Color.TRANSPARENT),7f)
                }
            }
            themed{paintFace()}
        }
        private fun paintFace(){background=appearance.dropdown(expanded);setPopupBackgroundDrawable(appearance.popup());(adapter as? ArrayAdapter<*>)?.notifyDataSetChanged()}
        override fun performClick():Boolean{expanded=true;paintFace();return super.performClick()}
        /** The popup takes window focus while it is open; focus coming back means it closed. */
        override fun onWindowFocusChanged(hasWindowFocus:Boolean){super.onWindowFocusChanged(hasWindowFocus);if(hasWindowFocus&&expanded){expanded=false;paintFace()}}
    }
    private fun clearPage(){
        homeBody=null;homeSignature="";countdown=null;scroller=null;nearbyCard=null;wifiForm=null;updateCard=null
        emptyLogs=null;logStatus=null;logChips=null;exportPanel=null;handler.removeCallbacks(tick);handler.removeCallbacks(pollUpdate)
    }
    private fun column(scroll:Boolean=true):LinearLayout{
        content.removeAllViews();clearPage()
        val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,0,0,dp(if(scroll)24 else 0))}
        if(scroll){val view=ScrollView(this).apply{isVerticalScrollBarEnabled=false;clipToPadding=false;addView(box)};scroller=view;content.addView(view)}else content.addView(box)
        return box
    }
    private fun array(field:String)=config.optJSONArray(field) ?: JSONArray()
    private fun items(field:String)=(0 until array(field).length()).map{array(field).getJSONObject(it)}
    private fun render(){
        if(!visible)return
        if(page !in listOf("运行状态","设置","日志"))page="设置"
        navigation();findViewById<TextView>(R.id.page_title).text=when(page){"日志"->"运行日志";"设置"->"配置设置";else->page}
        when(page){"运行状态"->home();"日志"->logs();else->settings()}
    }
    /** Rebuilds the current page without losing the scroll position. */
    private fun rerender(){restoreScroll=scroller?.scrollY ?: 0;render();val target=restoreScroll;scroller?.post{scroller?.scrollTo(0,target)}}
    // ---- 运行状态 (HomeScreen.tsx) ----
    private fun home(){
        val root=column()
        homeBody=root.box();homeSignature="";updateStatus()
        call("snapshot"){status=it as JSONObject;updateStatus()}
    }
    private fun rule(item:JSONObject)=AutoAuthWifiRule(item.str("ssid"),item.optBoolean("requiresAuth"),item.optJSONArray("linkedAccountIds").strings(),"",item.optBoolean("autoConnect"),item.optInt("priority",10),item.str("id"),item.str("security").ifBlank{null},item.str("bssid").ifBlank{null})
    /** Mirrors AutoAuthPolicy rule selection: best identity score, then the lower priority number. */
    private fun currentRule(network:JSONObject):JSONObject?{
        val ssid=network.str("ssid");val security=network.str("security");val bssid=network.str("bssid")
        return items("wifiRules").map{it to WifiSecurity.match(rule(it),ssid,security,bssid)}.filter{it.second>0}
            .sortedWith(compareByDescending<Pair<JSONObject,Int>>{it.second}.thenBy{it.first.optInt("priority",10)}).firstOrNull()?.first
    }
    private fun linkedAccount(rule:JSONObject?):JSONObject?{
        val accounts=items("accounts")
        return rule?.optJSONArray("linkedAccountIds").strings().firstNotNullOfOrNull{id->accounts.firstOrNull{it.str("id")==id}}
            ?: accounts.firstOrNull{it.str("id")==config.str("currentAccountId")}
    }
    private fun updateStatus(){
        val body=homeBody ?: return
        val network=status.optJSONObject("network") ?: JSONObject();val progress=status.optJSONObject("progress") ?: JSONObject()
        val loaded=status.has("timestamp")
        val rule=currentRule(network);val account=linkedAccount(rule)
        val requiresAuth=rule?.optBoolean("requiresAuth") ?: status.optBoolean("requiresAuth")
        val branch=when{
            !loaded->"loading"
            !status.optBoolean("wifiConnected")->"offline"
            rule==null && !status.optBoolean("requiresAuth")->"unconfigured"
            !requiresAuth->"open"
            account==null->"account"
            else->"full"
        }
        val signature=listOf(branch,network,status.optBoolean("authenticated"),status.optBoolean("internetReachable"),status.optBoolean("authenticating"),status.optBoolean("paused"),status.optBoolean("requiresAuth"),progress,rule,account?.str("username"),account?.str("serverUrl"),config.optBoolean("authPaused"),array("wifiRules"),config.optBoolean("heartbeatEnabled",true),config.optInt("heartbeatIntervalSeconds",30)).joinToString("\u0001")
        if(signature==homeSignature)return
        homeSignature=signature;body.removeAllViews();countdown=null;handler.removeCallbacks(tick)
        sky(body,branch,network,progress,account)
        if(branch=="loading")return
        if(branch=="offline"){
            val paused=card(body,padding=0)
            val header=panelHeader(paused,"心跳检测 (已暂停)")
            header.addView(View(this).apply{themed{background=appearance.rounded(4f,appearance.secondary)}},0,LinearLayout.LayoutParams(dp(8),dp(8)).apply{marginEnd=dp(10)})
            paused.secondary("当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。",12.5f).apply{setPadding(dp(16),dp(4),dp(16),dp(16))}
        }else{
            metrics(body,network)
            details(body,network,if(branch=="full")account else null)
        }
        wifiList(body,rule)
    }
    /** White text on the sky panel. */
    private fun LinearLayout.onSky(value:CharSequence,size:Float,weight:Int=400,opacity:Float=1f)=text(value,size,weight){Color.WHITE}.apply{alpha=opacity}
    /** .btn.on-sky (solid) and .btn.ghost-sky (outlined). */
    private fun LinearLayout.skyButton(label:String,solid:Boolean,enabled:Boolean=true,action:()->Unit):Button=button(label,Tone.Plain,LinearLayout.LayoutParams(-2,dp(36)).apply{marginEnd=dp(8)},action).apply{
        contentDescription=label;isEnabled=enabled;minimumHeight=dp(36);setPadding(dp(16),0,dp(16),0)
        themed{
            val fill=if(!solid)Color.TRANSPARENT else if(darkMode)appearance.primary else 0xf2ffffff.toInt()
            background=appearance.pressable(appearance.rounded(9f,fill,if(solid)null else 0x8cffffff.toInt()),9f)
            setTextColor(if(!solid)Color.WHITE else if(darkMode)appearance.onPrimary else 0xff12406f.toInt());alpha=if(isEnabled)1f else .55f
        }
    }
    /**
     * Sky panel (PORT-SPEC §5.2): clear when online, cloudy while connecting or recovering, rain when offline or not connected.
     * The illustration is a static drawable; a state change builds a new one. Recovery details from AutoAuthStatus are shown
     * inside the panel with the attempt bar, the retry countdown chip and the recovery actions.
     */
    private fun sky(body:LinearLayout,branch:String,network:JSONObject,progress:JSONObject,account:JSONObject?){
        val state=progress.str("status")
        val recovering=state in listOf("connecting","awaiting-system","authenticating","verifying","cooldown")
        val wifi=status.optBoolean("wifiConnected");val connecting=status.optBoolean("authenticating");val authenticated=status.optBoolean("authenticated")
        val online=wifi&&!connecting&&(authenticated||status.optBoolean("internetReachable"))
        val weather=when{branch=="loading"||recovering||connecting->Weather.Cloud;online->Weather.Clear;else->Weather.Storm}
        val ssid=network.str("ssid").ifBlank{"未知"}
        val (where,title,description)=when(branch){
            "loading"->Triple("网络连接状态","正在获取网络状态","请稍候，正在检查网络连接状态")
            "offline"->Triple("网络连接状态","未连接 WiFi","当前设备未连接到任何 WiFi 网络，请先连接 WiFi。连接到 WiFi 后才能使用网络认证功能。")
            "unconfigured"->{
                val sameName=items("wifiRules").any{it.str("ssid")==network.str("ssid")}
                Triple("当前 WiFi",if(sameName)"请选择当前 WiFi 规则" else "该 WiFi 未配置",
                    if(sameName)"同名 WiFi 身份信息不足或规则不匹配，请在配置设置中选择安全类型及 BSSID 后重试。" else "当前连接的 WiFi \"$ssid\" 尚未配置，请前往\"配置设置\"添加此 WiFi 的配置。")
            }
            "open"->Triple("当前 WiFi","无需认证","$ssid 已配置为\"无需认证\"（如家庭 WiFi、手机热点等），可直接使用。")
            "account"->Triple("当前 WiFi","未配置账户","该 WiFi 需要校园网认证，但尚未关联账户。请前往\"配置设置\"添加账户并关联到此 WiFi。")
            else->Triple("当前 WiFi",if(connecting)"连接中..." else if(online)"已连接" else "未连接",if(online)"$ssid · IP: ${network.str("ipv4").ifBlank{"未知"}}" else "$ssid 需要校园网认证")
        }
        val panel=FrameLayout(this).apply{contentDescription="网络连接状态";minimumHeight=dp(210);themed{background=appearance.sky(weather)}}
        body.addView(panel,margins(bottom=16))
        val copy=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(64),dp(20),dp(20))}
        panel.addView(copy,FrameLayout.LayoutParams(-1,-2))
        copy.onSky(where,13f,opacity=.88f)
        copy.onSky(title,24f,800).apply{layoutParams=margins(top=6,bottom=6);accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
        copy.onSky(description,13.5f,opacity=.9f).apply{setLineSpacing(dp(2).toFloat(),1f)}
        val chips=scrollingRow(copy,margins(top=12))
        fun chip(value:String,alert:Boolean=false)=chips.text(value,12f,600){Color.WHITE}.apply{
            setPadding(dp(8),dp(2),dp(8),dp(2));minHeight=dp(22);gravity=Gravity.CENTER;maxLines=1;layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(6)}
            background=appearance.rounded(6f,if(alert)0xd9ff5a5a.toInt() else 0x33ffffff)
        }
        // AutoAuthStatus association line, split into chips.
        if(wifi){
            val requires=status.optBoolean("requiresAuth")
            chip(if(requires)"需要认证" else "无需认证")
            if(requires)chip(if(authenticated)"已认证" else "未认证")
            chip(if(status.optBoolean("internetReachable"))"互联网可达" else "互联网不可达")
            if(account!=null)chip("${ispLabel(account.str("isp"))} · ${account.str("username")}")
        }
        val paused=status.optBoolean("paused")||config.optBoolean("authPaused")
        if(paused)chip("自动认证已暂停",alert=true)
        if(state.isNotEmpty()&&state!="idle"){
            val attempt=progress.optInt("attempt");val max=progress.optInt("maxAttempts")
            val label=when(state){"cooldown"->"等待下一轮重连";"awaiting-system"->"请在系统 WiFi 中确认连接";"authenticating"->"正在认证";"verifying"->"正在确认联网";"cancelled"->"恢复已停止";"connecting"->"正在连接 WiFi";"success"->"网络已恢复";else->"WiFi 连接失败"}
            copy.onSky("$label · ${progress.str("ssid")} ${if(attempt>0)"第 $attempt / $max 次" else ""}".trim(),14f,600).apply{layoutParams=margins(top=12);accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
            val reason=progress.str("reason").ifBlank{progress.str("message")};if(reason.isNotBlank())copy.onSky(reason,13f,opacity=.9f).apply{layoutParams=margins(top=4)}
            if(attempt>0&&max>0){
                val bar=View(this).apply{contentDescription="尝试进度 $attempt / $max";themed{background=SkyBarDrawable(attempt.toFloat()/max,if(darkMode)appearance.primary else Color.WHITE,resources.displayMetrics.density)}}
                copy.addView(bar,LinearLayout.LayoutParams(-1,dp(5)).apply{topMargin=dp(14)})
            }
            val next=progress.optLong("nextRetryAt")
            if(next>0){countdownAt=next;countdown=chip("");tick.run()}
            val failed=progress.optJSONArray("failedList")
            if(failed!=null)for(i in 0 until failed.length()){val item=failed.getJSONObject(i);copy.onSky("${item.str("ssid")}：${item.str("reason")}",13f,opacity=.9f).apply{layoutParams=margins(top=4)}}
        }
        val actions=scrollingRow(copy,margins(top=16))
        when(branch){
            "account"->actions.skyButton("添加认证账号",true){page="设置";render()}
            "full"->{
                val label=if(authenticated)"注销登录" else if(connecting)"正在连接..." else "立即连接"
                actions.skyButton(label,!authenticated,enabled=!connecting){call(if(authenticated)"logout" else "login")}
            }
        }
        if(paused)actions.skyButton("恢复自动认证",false){call("login")}
        if(state in listOf("failed","cooldown","cancelled"))actions.skyButton("立即重试",false){call("retry")}
        if(state in listOf("awaiting-system","failed","cooldown"))actions.skyButton("打开系统 WiFi",false){startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))}
        if(state in listOf("connecting","awaiting-system","authenticating","verifying","cooldown"))actions.skyButton("停止恢复",false){call("stop_recovery")}
        if(actions.childCount==0)(actions.parent as View).visibility=View.GONE
    }
    /** .panel-h: 15sp/700 title with an optional trailing view. */
    private fun panelHeader(box:LinearLayout,title:String):LinearLayout{
        val header=box.box(false).apply{setPadding(dp(16),dp(12),dp(12),dp(4));minimumHeight=dp(52)}
        header.text(title,15f,700).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f)}
        return header
    }
    /** Metric strip: two columns with line separators; the heartbeat cell takes the last row. */
    private fun metrics(body:LinearLayout,network:JSONObject){
        val strip=card(body,padding=0)
        fun row(first:Boolean)=strip.box(false).apply{gravity=Gravity.NO_GRAVITY;isBaselineAligned=false;if(!first)themed{background=appearance.topLine()}}
        fun cell(parent:LinearLayout,label:String,divider:Boolean):LinearLayout{
            val cell=parent.box(params=LinearLayout.LayoutParams(0,-1,1f)).apply{setPadding(dp(16),dp(12),dp(16),dp(12));if(divider)themed{background=appearance.startLine()}}
            cell.secondary(label,12.5f);return cell
        }
        fun value(cell:LinearLayout,main:String,note:String?,color:()->Int){
            val line=cell.box(false,margins(top=2)).apply{gravity=Gravity.BOTTOM}
            line.text(main,17f,700,color).apply{fontFeatureSettings="tnum"}
            if(note!=null)line.text(note,12.5f,600,color).apply{layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(4);bottomMargin=dp(2)}}
        }
        fun grade(index:Int):()->Int={when(index){0,1->appearance.success;2->appearance.warning;else->appearance.danger}}
        val signal=if(network.isNull("signal"))-1 else network.optInt("signal",-1)
        val signalGrade=when{signal>=75->0;signal>=50->1;signal>=25->2;else->4}
        val speed=if(network.isNull("linkSpeed"))-1 else network.optInt("linkSpeed",-1)
        val speedGrade=when{speed>=500->0;speed>=200->1;speed>=100->2;speed>=50->3;else->4}
        val frequency=if(network.isNull("frequency"))0 else network.optInt("frequency")
        val reachable=status.optBoolean("internetReachable")
        val top=row(true)
        value(cell(top,"信号强度",false),if(signal<0)"未知" else "$signal%",if(signal<0)null else arrayOf("优秀","良好","一般","","较差")[signalGrade],if(signal<0)({appearance.secondary}) else grade(signalGrade))
        value(cell(top,"连接速度",true),if(speed<0)"未知" else "$speed Mbps",if(speed<0)null else arrayOf("优秀","良好","一般","较差","很差")[speedGrade],if(speed<0)({appearance.secondary}) else grade(speedGrade))
        val middle=row(false)
        value(cell(middle,"频段",false),when{frequency>=5925->"6GHz";frequency>=4900->"5GHz";frequency>0->"2.4GHz";else->"未知"},null){appearance.text}
        value(cell(middle,"互联网",true),if(reachable)"可达" else "不可达",null){if(reachable)appearance.success else appearance.danger}
        // The snapshot carries no next-heartbeat time, so this cell shows the interval and the current result only.
        val enabled=config.optBoolean("heartbeatEnabled",true)
        val beat=cell(row(false),if(enabled)"心跳检测 · 每 ${config.optInt("heartbeatIntervalSeconds",30)} 秒" else "心跳检测 · 已关闭",false)
        val line=beat.box(false,margins(top=4))
        line.addView(View(this).apply{themed{background=appearance.rounded(7f,if(reachable)appearance.success else appearance.danger,if(reachable)appearance.successSoft else appearance.dangerSoft,3f)}},LinearLayout.LayoutParams(dp(14),dp(14)).apply{marginEnd=dp(7)})
        line.text(if(reachable)"正常" else "异常",17f,700){if(reachable)appearance.success else appearance.danger}
    }
    /** 网络详情: key/value table with right-aligned values and a refresh icon button. */
    private fun details(body:LinearLayout,network:JSONObject,account:JSONObject?){
        val box=card(body,padding=0)
        val header=panelHeader(box,"网络详情")
        header.addView(ImageButton(this).apply{contentDescription="刷新 WiFi 信息";scaleType=ImageView.ScaleType.CENTER;setOnClickListener{call("snapshot"){status=it as JSONObject;updateStatus()}}
            themed{setImageDrawable(appearance.icon("refresh",appearance.text,17));background=appearance.pressable(appearance.rounded(9f,appearance.card,appearance.line))}},LinearLayout.LayoutParams(dp(36),dp(36)))
        val frequency=if(network.isNull("frequency"))0 else network.optInt("frequency")
        val dns=network.optJSONArray("dns").strings().joinToString(", ")
        val rows=listOf("WiFi 名称" to network.str("ssid"),"IPv4 地址" to network.str("ipv4"),"IPv6 地址" to network.str("ipv6"),"网关" to network.str("gateway"),"DNS" to dns,"BSSID" to network.str("bssid"),
            "WiFi 信道" to if(frequency>0)WifiFacts.channel(frequency).takeIf{it>0}?.toString().orEmpty() else "","安全类型" to network.str("security"),
            "认证账号" to account?.str("username").orEmpty(),"服务器" to account?.str("serverUrl").orEmpty()).filter{it.second.isNotBlank()}
        val table=box.box().apply{setPadding(dp(16),dp(8),dp(16),dp(16))}
        val mono=setOf("IPv4 地址","IPv6 地址","网关","DNS","BSSID")
        for((label,value)in rows){
            val row=table.box(false,margins(bottom=10)).apply{gravity=Gravity.TOP}
            row.secondary(label,13f).apply{layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(24)}}
            row.text(value,13.5f).apply{gravity=Gravity.END;layoutParams=LinearLayout.LayoutParams(0,-2,1f);setTextIsSelectable(true);fontFeatureSettings="tnum";if(label in mono){typeface=Typeface.MONOSPACE;textSize=13f}}
        }
    }
    /** 切换 WiFi: configured rules by priority; two-line rows with the badge under the name and the action centred on the right. */
    private fun wifiList(body:LinearLayout,current:JSONObject?){
        val box=card(body,padding=0)
        val header=panelHeader(box,"切换 WiFi")
        header.secondary("按优先级排序",12.5f).apply{layoutParams=LinearLayout.LayoutParams(-2,-2)}
        val list=box.box(params=margins(top=6,bottom=4))
        val rules=items("wifiRules").sortedBy{it.optInt("priority",10)}
        if(rules.isEmpty())list.secondary("暂无 WiFi 配置，可在配置设置中添加",13f).apply{setPadding(dp(16),dp(8),dp(16),dp(12))}
        val connected=status.optBoolean("wifiConnected")
        rules.forEachIndexed{i,wifi->
            val id=wifi.str("id");val ssid=wifi.str("ssid");val auth=wifi.optBoolean("requiresAuth")
            val active=connected&&current!=null&&current.str("id")==id
            val row=list.box(false).apply{setPadding(dp(16),dp(12),dp(16),dp(12));minimumHeight=dp(64);themed{background=if(active)appearance.currentRow(i>0) else if(i>0)appearance.topLine() else null}}
            row.addView(ImageView(this).apply{importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;themed{setImageDrawable(appearance.icon("wifi",appearance.secondary))}},LinearLayout.LayoutParams(dp(18),dp(18)).apply{marginEnd=dp(12)})
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(10)})
            texts.text(ssid,14f,600).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            texts.secondary("优先级 ${wifi.optInt("priority",10)} · ${wifi.str("security").ifBlank{"未知安全类型"}}",12.5f).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            val tags=texts.box(false,margins(top=6))
            badge(tags,if(auth)"校园网认证" else "普通热点",{if(auth)appearance.accentSoft else appearance.surface2},{if(auth)appearance.primary else appearance.secondary}).apply{(layoutParams as LinearLayout.LayoutParams).marginStart=0}
            if(active)row.text("当前",12.5f,700){appearance.primary}.apply{
                gravity=Gravity.CENTER;compoundDrawablePadding=dp(4);layoutParams=LinearLayout.LayoutParams(dp(68),-2);contentDescription="当前 WiFi $ssid"
                themed{setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("check",appearance.primary,14),null,null,null)}
            } else row.button("切换",Tone.Plain,LinearLayout.LayoutParams(dp(68),dp(32))){call("connect",JSONObject().put("id",id)){feedback.text="正在连接 $ssid"}}.apply{contentDescription="切换到 WiFi $ssid";minimumHeight=dp(32);setPadding(0,0,0,0)}
        }
    }
    // ---- 配置设置 (SettingsScreen.tsx and components/settings) ----
    /** Queues config edits and applies them to the newest revision; one save_config runs at a time. */
    private fun mutate(structural:Boolean=false,edit:(JSONObject)->Unit){pending.add(edit);if(structural)pendingRefresh=true;flush()}
    private fun flush(){
        if(saving||pending.isEmpty())return
        val next=JSONObject(config.toString());val edits=pending.toList();pending.clear()
        try{edits.forEach{it(next)}}catch(e:Exception){feedback.text=e.message;return}
        saving=true
        call("save_config",next,failed={saving=false;pendingRefresh=false;call("config",silent=true){config=it as JSONObject;if(page=="设置")rerender()}}){
            config=it as JSONObject;saving=false;feedback.text="已保存并应用"
            if(pending.isNotEmpty())flush() else if(pendingRefresh){pendingRefresh=false;if(page=="设置")rerender()}
        }
    }
    private fun debounce(key:String,action:()->Unit){debounces[key]?.let{handler.removeCallbacks(it)};val task=Runnable{debounces.remove(key);action()};debounces[key]=task;handler.postDelayed(task,600)}
    private fun settings(){
        val root=column()
        if(config.optBoolean("authPaused")){val paused=card(root,padding=16);paused.text("自动认证已暂停",15f,600);paused.button("恢复自动认证",Tone.Link,LinearLayout.LayoutParams(-2,-2)){call("login"){feedback.text="已恢复自动认证";config.put("authPaused",false);rerender()}}.apply{setPadding(0,dp(12),dp(12),dp(12))}}
        generalSettings(root);notificationSettings(root)
        updateCard=card(root,padding=16);renderUpdate();call("update_state",silent=true){updateState=it as JSONObject;renderUpdate();if(updateState.str("state")=="downloading")handler.postDelayed(pollUpdate,1000)}
        permissions(root)
        nearbyCard=card(root,padding=16);renderNearby()
        accounts(root);wifis(root)
    }
    private fun generalSettings(root:LinearLayout){
        val box=card(root,"通用设置")
        fun flag(key:String,label:String,description:String?,default:Boolean,last:Boolean=false,changed:(Boolean)->Unit={})=box.switchRow(label,description,config.optBoolean(key,default),last){on->mutate{it.put(key,on)};changed(on)}
        flag("autoLaunch","开机自动启动",null,false)
        // SettingsScreen shows the heartbeat fields after the last switch row.
        val heartbeat=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        flag("heartbeatEnabled","启用心跳检测","自动检测网络连接状态",true){on->heartbeat.visibility=if(on)View.VISIBLE else View.GONE}
        flag("enabled","断线自动重连","校园网认证失效时自动登录；WiFi 断开时按优先级重连已开启自动连接的 WiFi",true)
        flag("startupAutoConnect","启动时自动连接","后台服务启动时若未连接 WiFi，按优先级连接已配置的 WiFi",false)
        flag("keepCurrentConnection","保持当前连接","启动时已连接其他 WiFi 则不切换；关闭后会建议切换到最高优先级的已配置 WiFi",true)
        flag("autoUpdate","自动检查更新","启动时检查 GitHub 新版本（12 小时内只检查一次）",true,last=true)
        box.addView(heartbeat,LinearLayout.LayoutParams(-1,-2));heartbeat.visibility=if(config.optBoolean("heartbeatEnabled",true))View.VISIBLE else View.GONE
        heartbeat.addView(View(this).apply{themed{setBackgroundColor(appearance.line)}},LinearLayout.LayoutParams(-1,dp(1)).apply{topMargin=dp(16);bottomMargin=dp(16)})
        fun number(parent:LinearLayout,key:String,label:String,unit:String,shortUnit:String,range:IntRange,default:Int,description:String){
            val current=config.optInt(key,default)
            val header=parent.box(params=margins()).apply{setPadding(0,dp(12),0,dp(12))}
            header.text(label,16f,600);val value=header.secondary("当前值: $current $unit").apply{layoutParams=margins(top=4)}
            val row=parent.box(false,margins(bottom=16)).apply{setPadding(dp(16),dp(12),dp(16),dp(12))}
            val field=row.input(null,current.toString(),"${range.first}-${range.last}",numeric=true,description=description,radius=12f,params=LinearLayout.LayoutParams(0,-2,1f)).apply{setPadding(dp(16),dp(10),dp(16),dp(10));typeface=appearance.weight(600)}
            row.text(shortUnit,14f,600){appearance.secondary}.apply{layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(12)}}
            field.doAfterTextChanged{text->val number=text?.toString()?.toIntOrNull();if(number!=null&&number in range){value.text="当前值: $number $unit";debounce(key){mutate{it.put(key,number)}}}else debounces.remove(key)?.let{handler.removeCallbacks(it)}}
        }
        number(heartbeat,"heartbeatIntervalSeconds","心跳检测间隔","秒","秒",15..300,30,"心跳间隔（秒）")
        number(heartbeat,"failureThreshold","连续失败阈值","次","次",1..10,3,"连续失败阈值")
        number(box,"wifiRetries","每个 WiFi 最多尝试次数（含首次）","次","次",1..10,3,"WiFi 重试次数")
        number(box,"wifiCooldownMinutes","冷却期时长","分钟","分",0..1440,5,"冷却期时长（分钟）")
    }
    private fun notificationSettings(root:LinearLayout){
        val box=card(root,"通知设置")
        val labels=listOf("wifiDisconnected" to "WiFi 断开","reconnectSuccess" to "自动重连成功","reconnectFailed" to "自动重连全部失败","authRecovered" to "认证恢复成功")
        val current=config.optJSONObject("notifications") ?: JSONObject()
        labels.forEachIndexed{i,(key,label)->box.switchRow(label,null,current.optBoolean(key,true),i==labels.lastIndex){on->mutate{next->next.put("notifications",JSONObject((next.optJSONObject("notifications") ?: JSONObject()).toString()).put(key,on))}}}
    }
    /** UpdateCard.tsx: current version, status message and the action for the current download state. */
    private fun renderUpdate(){
        val box=updateCard ?: return;box.removeAllViews()
        box.text("应用更新",18f,600);box.secondary("当前版本 ${BuildConfig.VERSION_NAME}",14f).apply{layoutParams=margins(top=4)}
        val state=updateState.str("state")
        val message=if(updateBusy)"正在处理…" else updateMessage.ifBlank{updateState.str("error").ifBlank{updateState.str("message")}}
        if(message.isNotBlank())box.text(message,14f).apply{accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE;layoutParams=margins(top=8)}
        fun action(label:String,op:String,done:(JSONObject)->Unit){
            box.button(label,Tone.Link,LinearLayout.LayoutParams(-2,-2)){
                updateBusy=true;updateMessage="";renderUpdate()
                call(op,silent=true,failed={updateBusy=false;updateMessage=it;renderUpdate()}){result->updateBusy=false;done(result as JSONObject);renderUpdate()}
            }.apply{contentDescription=label;setPadding(0,dp(12),dp(16),dp(12));enable(!updateBusy,Tone.Link)}
        }
        when(state){
            "downloading"->{box.text("下载进度 ${updateState.optInt("progress")}%",14f).apply{contentDescription="下载进度";layoutParams=margins(top=8)};action("取消下载","update_cancel"){updateState=it}}
            "downloaded"->{
                box.text("版本 ${updateState.str("version")} 已下载并通过校验",14f).apply{layoutParams=margins(top=8)}
                val allowed=updateState.optBoolean("installAllowed",true)
                if(!allowed)box.secondary("安装需要允许此应用安装更新。授权后返回此页继续安装。",13f)
                action(if(allowed)"安装更新" else "授权安装更新","update_install"){updateMessage=if(it.str("state")=="permission-required")"授权后请返回并点击安装更新" else "请在系统安装器中确认更新";handler.post(pollUpdate)}
                action("删除下载","update_cancel"){updateState=it}
            }
            else->{
                val row=box.box(false,margins(top=4))
                fun act(label:String,op:String,done:(JSONObject)->Unit){
                    row.button(label,Tone.Link,LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(8)}){
                        updateBusy=true;updateMessage="";renderUpdate()
                        call(op,silent=true,failed={updateBusy=false;updateMessage=it;renderUpdate()}){result->updateBusy=false;done(result as JSONObject);renderUpdate()}
                    }.apply{contentDescription=label;setPadding(0,dp(12),dp(8),dp(12));enable(!updateBusy,Tone.Link)}
                }
                act("检查更新","update_check"){release=it.takeIf{r->r.has("version")};updateMessage=release?.let{r->"新版本 ${r.str("version")} 可用"} ?: "当前已是最新版本"}
                if(release!=null||state=="failed")act(if(state=="failed")"重试下载" else "下载更新","update_download"){updateState=it;handler.removeCallbacks(pollUpdate);handler.postDelayed(pollUpdate,1000)}
            }
        }
    }
    private fun granted(permission:String)=checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED
    /** PermissionsCard.tsx: each permission with its state and an action when it is not granted. */
    private fun permissions(root:LinearLayout):View{
        val power=getSystemService(PowerManager::class.java)
        val list=listOf(
            Triple("位置权限","读取当前 WiFi 名称，判断是否需要校园网认证",granted(Manifest.permission.ACCESS_FINE_LOCATION)) to {requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),17)},
            Triple("附近 WiFi 设备","Android 13 及以上需要此权限才能管理 WiFi 连接",granted(Manifest.permission.NEARBY_WIFI_DEVICES)) to {requestPermissions(arrayOf(Manifest.permission.NEARBY_WIFI_DEVICES),18)},
            Triple("通知权限","显示后台自动认证状态和结果",granted(Manifest.permission.POST_NOTIFICATIONS)) to {requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),19)},
            Triple("允许后台运行","不受电池优化限制，避免后台自动认证被系统停止",power.isIgnoringBatteryOptimizations(packageName)) to {startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:$packageName")))},
            Triple("后台位置权限（可选）","应用在后台时也能读取 WiFi 名称，使 WiFi 规则在后台生效",granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) to {startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))},
        )
        val box=card(root,"权限状态")
        list.forEachIndexed{i,(item,request)->
            val (title,description,ok)=item
            val row=box.box(false).apply{setPadding(0,dp(12),0,dp(12));if(i<list.lastIndex)themed{background=appearance.bottomLine()}}
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(12)})
            texts.text(title,16f,600);texts.secondary(description).apply{layoutParams=margins(top=4)}
            texts.text(if(ok)"已开启" else "未开启",12f,600){if(ok)appearance.success else appearance.warning}.apply{layoutParams=margins(top=4)}
            if(!ok)row.button(if(i>=3)"去设置" else "开启",Tone.Tinted,LinearLayout.LayoutParams(-2,-2)){request()}.apply{contentDescription="${text}$title"}
        }
        box.button("重新运行权限引导",Tone.Link,LinearLayout.LayoutParams(-2,-2).apply{topMargin=dp(8)}){
            val missing=listOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.NEARBY_WIFI_DEVICES,Manifest.permission.POST_NOTIFICATIONS).filterNot(::granted)
            if(missing.isNotEmpty())requestPermissions(missing.toTypedArray(),17) else if(!power.isIgnoringBatteryOptimizations(packageName))startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:$packageName"))) else startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))
        }.apply{setPadding(0,dp(12),dp(12),dp(12))}
        return box
    }
    /** NearbyWifi.tsx: scan, then select a network for the add form or edit the saved rule. */
    private fun renderNearby(){
        val box=nearbyCard ?: return;box.removeAllViews()
        box.text("附近 WiFi",18f,600)
        box.button(if(scanning)"扫描中…" else "扫描附近 WiFi",Tone.Link,LinearLayout.LayoutParams(-2,-2)){
            scanning=true;scanError="";renderNearby()
            call("scan",silent=true,failed={scanning=false;scanError=it;renderNearby()}){result->scanning=false;val array=result as JSONArray;nearby=(0 until array.length()).map(array::getJSONObject);renderNearby()}
        }.apply{setPadding(0,dp(12),dp(12),dp(12));enable(!scanning,Tone.Link)}
        if(scanError.isNotBlank())box.text(scanError,14f){appearance.danger}.apply{accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE}
        val found=nearby ?: return
        if(found.isEmpty())box.text("未发现网络，请开启 WiFi 和定位服务，或手动添加。",14f)
        found.forEachIndexed{i,network->
            val saved=items("wifiRules").map{it to WifiSecurity.match(rule(it),network.str("ssid"),network.str("security"),network.str("bssid"))}.filter{it.second>0}.maxByOrNull{it.second}?.first
            val signal=((network.optInt("rssi",-100)+100)*100/60).coerceIn(0,100)
            val row=box.box(false).apply{setPadding(0,dp(8),0,dp(8));if(i<found.lastIndex)themed{background=appearance.bottomLine()}}
            row.text("${network.str("ssid")} · $signal% · ${network.str("security")}${if(network.str("bssid").isNotBlank())" · ${network.str("bssid")}" else ""}${if(saved!=null)" · 已保存" else ""}",14f).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f)}
            row.button(if(saved!=null)"编辑" else "选择",Tone.Link,LinearLayout.LayoutParams(-2,-2)){
                if(saved!=null)wifiEditor(saved) else wifiForm?.let{form->form.ssid.setText(network.str("ssid"));form.security.setText(network.str("security"));form.bssid.setText(network.str("bssid"));scroller?.post{scroller?.smoothScrollTo(0,form.card.top)}}
            }.apply{contentDescription="${text}网络 ${network.str("ssid")}"}
        }
    }
    private val ispValues=listOf("campus","cmcc","cucc","ctcc")
    private val ispLabels=listOf("校园网","中国移动","中国联通","中国电信")
    private fun ispLabel(value:String)=ispLabels.getOrElse(ispValues.indexOf(value)){value.ifBlank{"校园网"}}
    private fun passwordEdit(value:String,clear:Boolean)=JSONObject().put("action",if(clear)"clear" else if(value.isNotEmpty())"replace" else "keep").apply{if(value.isNotEmpty())put("value",value)}
    private fun LinearLayout.ispPicker(selected:String):Spinner{
        label("运营商")
        val picker=Dropdown(ispLabels,"运营商").apply{setSelection(ispValues.indexOf(selected).coerceAtLeast(0))}
        addView(picker,LinearLayout.LayoutParams(-1,dp(36)).apply{bottomMargin=dp(16)});return picker
    }
    /** AccountsCard.tsx: account list with 使用 / 编辑 / 删除, then the add form. */
    private fun accounts(root:LinearLayout):View{
        val box=card(root,"账号管理").apply{contentDescription="账号配置"}
        val list=box.box(params=margins(bottom=20))
        for(account in items("accounts")){
            val id=account.str("id");val current=config.str("currentAccountId")==id
            val row=list.box(false).apply{setPadding(0,dp(16),0,dp(16));themed{background=appearance.bottomLine()}}
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(8)})
            val name=texts.box(false);name.text(account.str("username"),17f,700).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            badge(name,ispLabel(account.str("isp")),{appearance.alpha(appearance.primary,0x20)},{appearance.primary},{appearance.alpha(appearance.primary,0x30)})
            texts.secondary(account.str("serverUrl"),13f).apply{layoutParams=margins(top=4)}
            val actions=row.box(false,LinearLayout.LayoutParams(-2,-2))
            actions.button(if(current)"使用中" else "使用",if(current)Tone.Muted else Tone.Pill,LinearLayout.LayoutParams(-2,-2)){mutate{it.put("currentAccountId",id)};config.put("currentAccountId",id);rerender()}.apply{isEnabled=!current;contentDescription="使用账号 ${account.str("username")}"}
            actions.button("编辑",Tone.Plain,LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(4)}){accountEditor(account)}.apply{contentDescription="编辑账号 ${account.str("username")}"}
            actions.button("删除",Tone.Delete,LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(4)}){confirmRemoveAccount(account)}.apply{setPadding(dp(12),dp(8),dp(12),dp(8));contentDescription="删除账号 ${account.str("username")}"}
        }
        box.subHeader("添加新账号")
        val username=box.input("用户名",hint="请输入学号/用户名")
        val password=box.input("密码",hint="请输入密码",password=true)
        val isp=box.ispPicker("campus")
        val server=box.input("服务器地址","http://10.10.102.50:801","http://...")
        box.button("保存并添加账号"){
            if(username.text.isBlank()){feedback.text="请输入账号";return@button}
            val item=JSONObject().put("id",UUID.randomUUID().toString()).put("name",username.text.toString().trim()).put("username",username.text.toString().trim()).put("serverUrl",server.text.toString().trim()).put("isp",ispValues[isp.selectedItemPosition]).put("passwordEdit",passwordEdit(password.text.toString(),false))
            mutate(structural=true){next->next.put("accounts",JSONArray(items("accounts",next)+item));if(next.str("currentAccountId").isBlank())next.put("currentAccountId",item.str("id"))}
        }
        return box
    }
    private fun items(field:String,source:JSONObject)=(source.optJSONArray(field) ?: JSONArray()).let{a->(0 until a.length()).map{a.getJSONObject(it)}}
    private fun confirmRemoveAccount(account:JSONObject){
        AlertDialog.Builder(this).setTitle("删除账号").setMessage("确定删除账号 ${account.str("username")}？").setPositiveButton("删除"){_,_->
            val id=account.str("id")
            mutate(structural=true){next->
                next.put("accounts",JSONArray(items("accounts",next).filter{it.str("id")!=id}))
                if(next.str("currentAccountId")==id)next.put("currentAccountId",JSONObject.NULL)
                next.put("wifiRules",JSONArray(items("wifiRules",next).map{w->w.put("linkedAccountIds",JSONArray(w.optJSONArray("linkedAccountIds").strings().filter{it!=id}))}))
            }
        }.setNegativeButton("取消",null).show().also(::track)
    }
    private fun priorityColor(priority:Int)=when{priority<=3->0xffef4444.toInt();priority<=6->0xfff97316.toInt();priority<=10->0xff3b82f6.toInt();priority<=20->0xff22c55e.toInt();else->0xff6b7280.toInt()}
    private fun systemOnly(security:String)=WifiSecurity.systemSettingsOnly(security)
    /** WifiConfigCard.tsx: rule list with badges, 编辑 / 连接 / auto-connect switch / 删除, then the add form. */
    private fun wifis(root:LinearLayout):View{
        val box=card(root,"WiFi 配置")
        box.secondary("配置需要自动连接的 WiFi 网络。启用心跳检测后，断线时会按优先级尝试切换网络。").apply{layoutParams=margins(bottom=16)}
        val list=box.box(params=margins(bottom=20))
        val rules=items("wifiRules").sortedBy{it.optInt("priority",10)}
        if(rules.isEmpty())list.text("暂无 WiFi 配置",15f){appearance.secondary}.apply{gravity=Gravity.CENTER;setPadding(dp(20),dp(20),dp(20),dp(20));themed{background=appearance.rounded(16f,appearance.alpha(appearance.card,0x40))}}
        val accounts=items("accounts")
        for(wifi in rules){
            val id=wifi.str("id");val ssid=wifi.str("ssid");val priority=wifi.optInt("priority",10);val auth=wifi.optBoolean("requiresAuth");val system=systemOnly(wifi.str("security"))
            val row=list.box(false).apply{setPadding(0,dp(16),0,dp(16));themed{background=appearance.bottomLine()}}
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(8)})
            texts.text(ssid,17f,700).apply{layoutParams=margins(bottom=6)}
            val badges=texts.box(false,margins(bottom=4))
            badge(badges,if(auth)"需要认证" else "无需认证",{if(auth)0xfffef3c7.toInt() else 0xffd1fae5.toInt()},{if(auth)0xff92400e.toInt() else 0xff065f46.toInt()}).apply{(layoutParams as LinearLayout.LayoutParams).marginStart=0}
            badge(badges,"⭐ 优先级 $priority",{appearance.alpha(priorityColor(priority),0x20)},{priorityColor(priority)})
            if(system)texts.secondary("此安全类型通过系统 WiFi 设置连接，自动连接不可用",13f)
            if(auth){
                val linked=wifi.optJSONArray("linkedAccountIds").strings().mapNotNull{lid->accounts.firstOrNull{it.str("id")==lid}}
                texts.secondary("关联账号: ${if(linked.isEmpty())"未关联 (可能已删除)" else linked.joinToString(" / "){"${it.str("username")} (${ispLabel(it.str("isp"))})"}}",13f).apply{layoutParams=margins(top=4)}
            }
            val actions=row.box(params=LinearLayout.LayoutParams(-2,-2)).apply{gravity=Gravity.CENTER_HORIZONTAL}
            val top=actions.box(false,LinearLayout.LayoutParams(-2,-2))
            top.button("编辑",Tone.Plain,LinearLayout.LayoutParams(-2,-2)){wifiEditor(wifi)}.apply{setPadding(dp(10),dp(8),dp(10),dp(8));contentDescription="编辑 WiFi $ssid"}
            top.button("连接",Tone.Plain,LinearLayout.LayoutParams(-2,-2)){call("connect",JSONObject().put("id",id)){feedback.text="正在连接 $ssid"}}.apply{setPadding(dp(10),dp(8),dp(10),dp(8));contentDescription="连接 WiFi $ssid"}
            val bottom=actions.box(false,LinearLayout.LayoutParams(-2,-2))
            bottom.addView(Switch(this).apply{contentDescription="自动连接 $ssid";isEnabled=!system;isChecked=wifi.optBoolean("autoConnect")&&!system;tint();setOnCheckedChangeListener{_,on->mutate{next->next.put("wifiRules",JSONArray(items("wifiRules",next).map{if(it.str("id")==id)it.put("autoConnect",on) else it}))}}},LinearLayout.LayoutParams(-2,-2))
            bottom.button("删除",Tone.Delete,LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(4)}){
                AlertDialog.Builder(this).setTitle("删除 WiFi").setMessage("确定删除 WiFi $ssid？").setPositiveButton("删除"){_,_->mutate(structural=true){next->next.put("wifiRules",JSONArray(items("wifiRules",next).filter{it.str("id")!=id}))}}.setNegativeButton("取消",null).show().also(::track)
            }.apply{setPadding(dp(12),dp(8),dp(12),dp(8));contentDescription="删除 WiFi $ssid"}
        }
        val form=box.box()
        form.subHeader("添加 WiFi")
        val ssid=form.input("WiFi 名称 (SSID)",hint="请输入 WiFi 名称")
        val security=form.input("安全类型",hint="WPA2 / WPA3 / WPA2-WPA3 / Open")
        val bssid=form.input("BSSID（可选）",hint="aa:bb:cc:dd:ee:ff")
        val password=form.input("WiFi 密码",hint="请输入 WiFi 密码（可选）",password=true)
        wifiForm=WifiForm(box,ssid,security,bssid)
        val linked=mutableListOf<String>()
        val accountBox=dialogBox()
        val auth=form.switchRow("需要校园网认证",null,false,last=true){on->accountBox.visibility=if(on)View.VISIBLE else View.GONE}
        form.addView(accountBox,LinearLayout.LayoutParams(-1,-2));accountBox.visibility=View.GONE
        accountChooser(accountBox,linked)
        val priority=form.input("优先级","10","请输入优先级（1-99，数字越小优先级越高）",numeric=true,params=margins(top=12,bottom=20))
        form.button("添加 WiFi"){
            val value=priority.text.toString().toIntOrNull()
            if(ssid.text.isBlank()){feedback.text="请输入 WiFi 名称";return@button}
            if(value==null||value !in 1..99){feedback.text="优先级需为 1–99";return@button}
            val item=JSONObject().put("id",UUID.randomUUID().toString()).put("ssid",ssid.text.toString().trim()).put("priority",value).put("security",security.text.toString().trim().ifBlank{null}).put("bssid",bssid.text.toString().trim().ifBlank{null})
                .put("autoConnect",true).put("requiresAuth",auth.isChecked).put("linkedAccountIds",JSONArray(if(auth.isChecked)linked else emptyList<String>())).put("passwordEdit",passwordEdit(password.text.toString(),false))
            mutate(structural=true){next->next.put("wifiRules",JSONArray(items("wifiRules",next)+item))}
        }
        return box
    }
    /** Linked accounts in try order; the order follows the account list, as in the RN picker. */
    private fun accountChooser(parent:LinearLayout,linked:MutableList<String>){
        val accounts=items("accounts")
        parent.label("关联账号").apply{(layoutParams as LinearLayout.LayoutParams).topMargin=dp(12)}
        if(accounts.isEmpty()){parent.secondary("请先添加账号",13f);return}
        for(account in accounts){
            val id=account.str("id")
            parent.addView(CheckBox(this).apply{text="${account.str("username")} (${ispLabel(account.str("isp"))})";isChecked=id in linked;minHeight=dp(44);themed{setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.primary)}
                setOnCheckedChangeListener{_,on->linked.remove(id);if(on){linked.add(id);linked.sortBy{lid->accounts.indexOfFirst{it.str("id")==lid}}}}},LinearLayout.LayoutParams(-1,-2))
        }
    }
    private fun editDialog(title:String,box:LinearLayout,onSave:()->Unit){
        box.setPadding(dp(24),dp(8),dp(24),0)
        val scroll=ScrollView(this).apply{addView(box)}
        val dialog=AlertDialog.Builder(this).setTitle(title).setView(scroll).setPositiveButton("保存",null).setNegativeButton("取消",null).create()
        dialog.setOnShowListener{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener{try{onSave();dialog.dismiss()}catch(e:Exception){feedback.text=e.message}}}
        activeDialog=dialog;dialog.show();track(dialog)
    }
    private fun dialogBox()=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
    private fun accountEditor(previous:JSONObject){
        val box=dialogBox()
        val username=box.input("用户名",previous.str("username"),"请输入学号/用户名")
        val password=box.input("密码",hint=if(previous.optBoolean("hasPassword"))"留空保留已保存密码" else "请输入密码",password=true)
        val clear=CheckBox(this).apply{text="清空已保存密码";themed{setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.primary)}};box.addView(clear,margins(bottom=12))
        val isp=box.ispPicker(previous.str("isp"))
        val server=box.input("服务器地址",previous.str("serverUrl"),"http://...")
        editDialog("编辑账号",box){
            require(username.text.isNotBlank()){"请输入账号"}
            val id=previous.str("id")
            val item=JSONObject().put("id",id).put("name",username.text.toString().trim()).put("username",username.text.toString().trim()).put("serverUrl",server.text.toString().trim()).put("isp",ispValues[isp.selectedItemPosition]).put("passwordEdit",passwordEdit(password.text.toString(),clear.isChecked))
            mutate(structural=true){next->next.put("accounts",JSONArray(items("accounts",next).map{if(it.str("id")==id)item else it}))}
        }
    }
    private fun wifiEditor(previous:JSONObject){
        val box=dialogBox()
        val ssid=box.input("WiFi 名称 (SSID)",previous.str("ssid"),"请输入 WiFi 名称")
        val security=box.input("安全类型",previous.str("security"),"WPA2 / WPA3 / WPA2-WPA3 / Open")
        val bssid=box.input("BSSID（可选）",previous.str("bssid"),"aa:bb:cc:dd:ee:ff")
        val password=box.input("WiFi 密码",hint="留空保留已保存密码",password=true)
        val clear=CheckBox(this).apply{text="清空密码（开放网络）";themed{setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.primary)}};box.addView(clear,margins(bottom=12))
        val priority=box.input("优先级",previous.optInt("priority",10).toString(),"1-99",numeric=true)
        val auto=box.switchRow("允许自动连接",null,previous.optBoolean("autoConnect",true)){}
        val linked=previous.optJSONArray("linkedAccountIds").strings().toMutableList()
        val accountBox=dialogBox()
        val auth=box.switchRow("需要校园网认证",null,previous.optBoolean("requiresAuth"),last=true){on->accountBox.visibility=if(on)View.VISIBLE else View.GONE}
        box.addView(accountBox,LinearLayout.LayoutParams(-1,-2));accountBox.visibility=if(auth.isChecked)View.VISIBLE else View.GONE
        accountChooser(accountBox,linked)
        editDialog("编辑 WiFi",box){
            val value=priority.text.toString().toIntOrNull();require(value!=null&&value in 1..99){"优先级需为 1–99"};require(ssid.text.isNotBlank()){"请输入 WiFi 名称"}
            val id=previous.str("id")
            val item=JSONObject().put("id",id).put("ssid",ssid.text.toString().trim()).put("priority",value).put("security",security.text.toString().trim().ifBlank{null}).put("bssid",bssid.text.toString().trim().ifBlank{null})
                .put("autoConnect",auto.isChecked).put("requiresAuth",auth.isChecked).put("linkedAccountIds",JSONArray(linked)).put("passwordEdit",passwordEdit(password.text.toString(),clear.isChecked))
            mutate(structural=true){next->next.put("wifiRules",JSONArray(items("wifiRules",next).map{if(it.str("id")==id)item else it}))}
        }
    }
    // ---- 运行日志 (LogsScreen.tsx) ----
    private val logLevels=listOf("all" to "全部","info" to "信息","success" to "成功","warn" to "警告","error" to "错误","debug" to "调试")
    private fun levelColor(level:String)=when(level){
        "info"->appearance.primary
        "success"->appearance.success
        "warn"->appearance.warning
        "error"->appearance.danger
        "debug"->appearance.secondary
        else->appearance.text
    }
    /** Logs toolbar button: 36dp like every logs control, 1dp border, radius 9, 12sp text; active uses the accent border. */
    private fun LinearLayout.logButton(label:String,active:()->Boolean={false},params:LinearLayout.LayoutParams=LinearLayout.LayoutParams(-2,dp(36)).apply{marginEnd=dp(6)},action:()->Unit):Button{
        val view=Button(this@MainActivity).apply{
            text=label;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(36);textSize=12f;setPadding(dp(11),0,dp(11),0);contentDescription=label;gravity=Gravity.CENTER
            themed{val on=active();isSelected=on;typeface=appearance.weight(if(on)600 else 400);setTextColor(appearance.text);alpha=if(isEnabled)1f else .5f
                setTextColor(if(on)appearance.primary else appearance.text)
                background=appearance.pressable(appearance.rounded(9f,if(on)appearance.accentSoft else appearance.card,if(on)appearance.primary else appearance.line),9f)}
            setOnClickListener{action()}
        }
        addView(view,params);return view
    }
    private fun scrollingRow(parent:LinearLayout,params:LinearLayout.LayoutParams):LinearLayout{
        val row=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
        parent.addView(HorizontalScrollView(this).apply{isHorizontalScrollBarEnabled=false;addView(row)},params);return row
    }
    private fun logs(){
        val root=column(false)
        val heading=root.box(false,margins(bottom=16))
        heading.secondary("连接、认证与恢复记录，保留最近 7 天").apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(12)}}
        heading.logButton("刷新",params=LinearLayout.LayoutParams(-2,dp(36))){cursor=null;cursors.clear();loadLogs()}.apply{contentDescription="搜索 / 刷新";compoundDrawablePadding=dp(6);themed{setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("refresh",appearance.text,16),null,null,null)}}
        val workspace=root.box(params=LinearLayout.LayoutParams(-1,0,1f).apply{bottomMargin=dp(12)}).apply{clipToOutline=true;themed{background=appearance.surface()}}
        // Search and filter share one 36dp height and are centred vertically, as in the Linux toolbar.
        val toolbar=workspace.box(false).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12));themed{background=appearance.bottomLine()}}
        val keyword=EditText(this).apply{
            setText(logQuery.str("keyword"));hint="搜索消息或详情";contentDescription="搜索全部保留历史";textSize=13f;isSingleLine=true;setPadding(dp(12),0,dp(12),0);imeOptions=EditorInfo.IME_ACTION_SEARCH
            compoundDrawablePadding=dp(8)
            themed{setTextColor(appearance.text);setHintTextColor(appearance.secondary);background=appearance.rounded(9f,appearance.card,appearance.line);setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("search",appearance.secondary,16),null,null,null)}
            setOnEditorActionListener{view,_,_->logQuery.put("keyword",view.text.toString());cursor=null;cursors.clear();loadLogs();true}
        }
        toolbar.addView(keyword,LinearLayout.LayoutParams(0,dp(36),1f).apply{marginEnd=dp(10)})
        toolbar.logButton("筛选",{logQuery.str("source").isNotBlank()||logQuery.has("startTime")},LinearLayout.LayoutParams(-2,dp(36))){logFilters()}
        val chips=scrollingRow(workspace,margins().apply{setMargins(dp(12),dp(10),dp(12),0)});logChips=chips
        for((level,label)in logLevels)chips.logButton(label,{logQuery.optString("level","all")==level}){logQuery.put("level",level).put("keyword",keyword.text.toString());cursor=null;cursors.clear();repaint(chips);loadLogs()}
        val statusLine=workspace.box(false).apply{setPadding(dp(12),dp(8),dp(12),dp(8))}
        // The count stays on one line; a narrow screen ellipsizes it instead of wrapping.
        logStatus=statusLine.text("正在读取日志…",11f){appearance.secondary}.apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);maxLines=1;isSingleLine=true;ellipsize=android.text.TextUtils.TruncateAt.END;accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
        statusLine.logButton("上一页",params=LinearLayout.LayoutParams(-2,dp(36)).apply{marginStart=dp(6)}){if(cursors.isNotEmpty()){cursor=cursors.removeAt(cursors.lastIndex);loadLogs()}}
        statusLine.logButton("下一页",params=LinearLayout.LayoutParams(-2,dp(36)).apply{marginStart=dp(6)}){nextCursor?.let{cursors.add(cursor);cursor=it;loadLogs()}}
        val frame=FrameLayout(this);workspace.addView(frame,LinearLayout.LayoutParams(-1,0,1f))
        val list=RecyclerView(this).apply{layoutManager=LinearLayoutManager(this@MainActivity);setItemViewCacheSize(2)}
        logAdapter=LogAdapter();list.adapter=logAdapter;frame.addView(list,FrameLayout.LayoutParams(-1,-1))
        val empty=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(16),dp(42),dp(16),dp(42))}
        emptyLogs=empty.text("正在读取日志…",16f,500).apply{gravity=Gravity.CENTER;layoutParams=margins(bottom=12)}
        empty.secondary("连接、认证或设置变更后，记录会显示在这里").apply{gravity=Gravity.CENTER}
        frame.addView(empty,FrameLayout.LayoutParams(-1,-2))
        // Footer as on Linux: the scope and format dropdowns sit directly in the row with export and clear, all 36dp and
        // vertically centred. At the bottom of the screen the dropdown popup opens upwards.
        val panel=workspace.box(false).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(10),dp(12),dp(10));themed{background=appearance.topLine()}}
        exportPanel=panel
        panel.addView(Dropdown(listOf("全部保留日志","当前筛选结果"),"导出范围").apply{setSelection(if(exportFiltered)1 else 0);onItemSelectedListener=selected{exportFiltered=it==1}},LinearLayout.LayoutParams(0,dp(36),1f).apply{marginEnd=dp(6)})
        panel.addView(Dropdown(listOf("可读文本 LOG","结构化 JSON"),"格式").apply{setSelection(if(exportJson)1 else 0);onItemSelectedListener=selected{exportJson=it==1}},LinearLayout.LayoutParams(0,dp(36),1f).apply{marginEnd=dp(6)})
        panel.logButton("导出",{true}){exportLogs()}.apply{contentDescription="导出日志"}
        panel.logButton("清空",params=LinearLayout.LayoutParams(-2,dp(36))){clearLogs()}.apply{contentDescription="清空日志"}
        loadLogs()
    }
    private fun logFilters(){
        val options=dialogBox()
        // No caption labels, as on Linux; the hint and content description still name each field.
        val source=options.input(null,logQuery.str("source"),"全部来源",description="来源（可留空）")
        val hours=options.input(null,if(logQuery.has("startTime"))((System.currentTimeMillis()-logQuery.optLong("startTime")+1800000)/3600000).coerceIn(1L,168L).toString() else "0","0 = 全部保留历史",numeric=true,description="最近小时（0=全部保留历史）")
        editDialog("筛选全部历史",options){
            val h=hours.text.toString().toIntOrNull() ?: 0;require(h in 0..168){"请输入 0–168 小时"}
            logQuery.put("source",source.text.toString().trim());if(h>0)logQuery.put("startTime",System.currentTimeMillis()-h*3600000L)else logQuery.remove("startTime")
            cursor=null;cursors.clear()
            render()
        }
    }
    private fun exportLogs(){
        val json=exportJson
        call("export_logs",JSONObject().put("format",if(json)"json"else"text").put("query",if(exportFiltered)logQuery else JSONObject())){result->
            val file=File((result as JSONObject).getString("path"));val uri=FileProvider.getUriForFile(this,"$packageName.files",file)
            feedback.text="导出文件已生成，请在系统分享面板中保存或分享"
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(if(json)"application/json"else"text/plain").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"分享日志"))
        }
    }
    private fun clearLogs(){AlertDialog.Builder(this).setMessage("清空全部保留日志？").setPositiveButton("清空"){_,_->logGeneration++;call("clear_logs"){cursor=null;cursors.clear();loadLogs()}}.setNegativeButton("取消",null).show().also(::track)}
    private fun loadLogs(){
        val token=++logGeneration
        call("logs",JSONObject(logQuery.toString()).put("cursor",cursor).put("limit",200),failed={if(page=="日志"&&token==logGeneration){emptyLogs?.text="日志读取失败";(emptyLogs?.parent as? View)?.visibility=View.VISIBLE}}){result->
            if(page!="日志"||token!=logGeneration)return@call
            val p=result as JSONObject;val a=p.getJSONArray("entries")
            logAdapter?.items=(0 until a.length()).map(a::getJSONObject);logAdapter?.notifyDataSetChanged()
            nextCursor=if(p.optBoolean("hasMore"))p.optString("nextCursor")else null
            val filtered=logQuery.str("keyword").isNotBlank()||logQuery.str("source").isNotBlank()||logQuery.has("startTime")||logQuery.optString("level","all")!="all"
            (emptyLogs?.parent as? View)?.visibility=if(a.length()==0)View.VISIBLE else View.GONE
            emptyLogs?.text=if(filtered)"没有匹配的日志" else "暂无日志记录"
            logStatus?.text="共 ${maxOf(p.optLong("total"),a.length().toLong())} 条，已加载 ${a.length()} 条${if(cursors.isNotEmpty())" · 第 ${cursors.size+1} 页" else ""}"
        }
    }
    private inner class LogAdapter:RecyclerView.Adapter<LogHolder>(){
        var items=emptyList<JSONObject>()
        private val dateFormat=java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT,java.text.DateFormat.MEDIUM)
        override fun getItemCount()=items.size
        override fun onCreateViewHolder(parent:ViewGroup,kind:Int):LogHolder{
            val row=LinearLayout(this@MainActivity).apply{orientation=LinearLayout.VERTICAL;minimumHeight=dp(76);setPadding(dp(14),dp(13),dp(14),dp(13));layoutParams=RecyclerView.LayoutParams(-1,-2)}
            val meta=row.box(false,margins(bottom=8))
            val time=meta.text("",10f).apply{typeface=Typeface.MONOSPACE}
            val level=meta.text("",11f,600).apply{setPadding(dp(6),dp(3),dp(6),dp(3));layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(8);marginEnd=dp(8)}}
            val source=meta.text("",10f).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            val message=row.text("",13f).apply{setLineSpacing(dp(4).toFloat(),1f);maxLines=3;ellipsize=android.text.TextUtils.TruncateAt.END}
            return LogHolder(row,time,level,source,message)
        }
        override fun onBindViewHolder(holder:LogHolder,position:Int){
            val entry=items[position];val level=entry.optString("level")
            holder.row.background=appearance.pressable(appearance.bottomLine(),0f)
            holder.time.setTextColor(appearance.secondary);holder.source.setTextColor(appearance.secondary);holder.message.setTextColor(appearance.text)
            holder.time.text=dateFormat.format(java.util.Date(entry.optLong("timestamp")))
            holder.level.text=logLevels.firstOrNull{it.first==level}?.second ?: level;holder.level.setTextColor(levelColor(level));holder.level.background=appearance.rounded(6f,appearance.surface2)
            holder.source.text=entry.str("source").ifBlank{"应用"};holder.message.text=entry.optString("message")
            holder.row.contentDescription="${holder.level.text}，${holder.source.text}，${holder.message.text}"
            holder.row.setOnClickListener{
                val details=entry.toString(2)
                AlertDialog.Builder(this@MainActivity).setTitle("日志详情").setMessage(details).setPositiveButton("复制"){_,_->
                    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("NetMate 日志",details));feedback.text="已复制"
                }.setNegativeButton("关闭",null).show().also(::track)
            }
        }
    }
    private class LogHolder(val row:LinearLayout,val time:TextView,val level:TextView,val source:TextView,val message:TextView):RecyclerView.ViewHolder(row)
}
