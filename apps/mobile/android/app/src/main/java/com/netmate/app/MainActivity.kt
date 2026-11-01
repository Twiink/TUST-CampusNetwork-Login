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
    /** Value and grade labels of the signal and speed cells, patched in place as they fluctuate. */
    private var liveMetrics:List<Pair<TextView,TextView?>> = emptyList()
    private var countdown:TextView?=null
    private var countdownAt=0L
    // Settings
    private var scroller:ScrollView?=null
    private var restoreScroll=0
    private var saving=false
    /** The config sent by the running save_config, so later edits can build on it. */
    private var inFlight:JSONObject?=null
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
            // The graphite top bar runs under the status bar, as the rail does on the desktop.
            findViewById<View>(R.id.top_bar).setPadding(dp(18),bars.top+dp(14),dp(14),dp(10))
            findViewById<LinearLayout>(R.id.navigation).setPadding(dp(8),dp(6),dp(8),bars.bottom+dp(14));insets}
        navigation()
    }
    override fun onSaveInstanceState(state:Bundle){state.putString("page",page);super.onSaveInstanceState(state)}
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(visible&&page=="设置")rerender()}
    /** Bottom rail: graphite bar with a white hairline on top; the selected tab is a rail-2 block with a gold icon. */
    /** The page the bottom bar was last built for; theme switches repaint it through its painters. */
    private var navigationPage:String?=null
    private fun navigation(){
        val nav=findViewById<LinearLayout>(R.id.navigation)
        if(navigationPage==page&&nav.childCount>0)return
        navigationPage=page;nav.removeAllViews();nav.setTag(R.id.painter,null);nav.themed{background=appearance.tabBar()}
        for((key,title)in listOf("运行状态" to "运行状态","设置" to "配置设置","日志" to "运行日志")){
            val active=page==key
            nav.addView(Button(this).apply{
                text=title;textSize=12f;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(56);gravity=Gravity.CENTER
                setPadding(0,dp(6),0,dp(6));compoundDrawablePadding=dp(4);isSelected=active;contentDescription=title
                themed{background=appearance.tab(active);setTextColor(if(active)Color.WHITE else appearance.railText2);typeface=appearance.weight(if(active)600 else 500);setCompoundDrawablesWithIntrinsicBounds(null,appearance.tabIcon(title,active),null,null)}
                setOnClickListener{page=key;render()}
            },LinearLayout.LayoutParams(0,-2,1f).apply{marginStart=dp(4);marginEnd=dp(4)})
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
    // Binding first queues NetworkService ahead of the foreground service's start work on the
    // :network main thread, so the config reply that gates the first frame is not delayed.
    override fun onStart(){super.onStart();visible=true;generation++;bound=bindService(Intent(this,NetworkService::class.java),connection,Context.BIND_AUTO_CREATE);try{startForegroundService(Intent(this,BackgroundService::class.java).setAction(BackgroundService.ACTION_START))}catch(e:Exception){feedback.text="后台服务未启动：${e.message}"}}
    override fun onStop(){
        // The toggle only animates during a switch; a switch still running ends at its final frame.
        findViewById<DayNightToggle>(R.id.appearance_toggle).stop()
        dialogs.toList().forEach{it.dismiss()};dialogs.clear();activeDialog?.dismiss();activeDialog=null
        // Debounced number edits and edits queued behind a running save are sent before the
        // connection goes away; the service applies them even though no reply is shown.
        debounces.values.toList().forEach{handler.removeCallbacks(it);it.run()};debounces.clear()
        flushOnLeave()
        visible=false;generation++;handler.removeCallbacksAndMessages(null)
        runCatching{remote?.unsubscribe(events)};if(bound)unbindService(connection);bound=false;remote=null
        clearPage();saving=false;inFlight=null;pending.clear();pendingRefresh=false;debounces.clear();scanning=false;updateBusy=false
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
        // The window draws the page ground; a root background of the same colour would make the
        // software renderer fill the whole screen twice per frame.
        val root=findViewById<View>(R.id.root);root.background=null;window.setBackgroundDrawable(appearance.background())
        // Both bars are graphite rails in either theme, so the status and navigation bar icons stay light.
        val flags=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(0,flags)
        findViewById<View>(R.id.top_bar).background=appearance.topBar()
        // .brand: the small gold-chip card, the name and 天津科技大学校园网 under it.
        findViewById<TextView>(R.id.brand).apply{
            val name="NetMate";val sub="天津科技大学校园网"
            text=android.text.SpannableStringBuilder("$name\n$sub").apply{
                val flags=android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                setSpan(android.text.style.RelativeSizeSpan(11.5f/18f),name.length+1,length,flags)
                setSpan(android.text.style.ForegroundColorSpan(appearance.railText2),name.length+1,length,flags)
                setSpan(android.text.style.TypefaceSpan(appearance.weight(400)),name.length+1,length,flags)
            }
            setTextColor(appearance.railText);typeface=appearance.weight(700);setLineSpacing(0f,1.05f)
            setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.brand(),null,null,null)
        }
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
    /**
     * A section (.sec): the title (13sp/600, 0.06em) over a 1.5dp ink rule, with an optional trailing view in [header];
     * rows below it are split by hairlines instead of sitting in a card.
     */
    private fun section(parent:LinearLayout,title:String?):LinearLayout{
        val box=parent.box(params=margins(bottom=24))
        if(title!=null)sectionHead(box,title)
        return box
    }
    private fun sectionHead(box:LinearLayout,title:String):LinearLayout{
        val head=box.box(false).apply{minimumHeight=dp(34);setPadding(0,0,0,dp(6));gravity=Gravity.BOTTOM;themed{background=appearance.rule()}}
        head.text(title,13f,600).apply{letterSpacing=.06f;layoutParams=LinearLayout.LayoutParams(0,-2,1f)}
        return head
    }
    /** The section header row of [box], for adding trailing views. */
    private fun header(box:LinearLayout)=box.getChildAt(0) as LinearLayout
    /** Section body copy (.sec-note): secondary text over a hairline. */
    private fun LinearLayout.sectionNote(value:String)=secondary(value,12.5f).apply{setPadding(0,dp(10),0,dp(10));themed{background=appearance.bottomLine()}}
    private fun LinearLayout.subHeader(value:String)=text(value,13f,600).apply{letterSpacing=.06f;layoutParams=margins(top=16,bottom=10)}
    private class Look(val radius:Float,val fill:Int,val stroke:Int?,val color:Int)
    /** button variants: 34dp, radius 8, field fill with a line border; primary is ink (night: gold), danger has bad text. */
    private fun look(tone:Tone)=when(tone){
        Tone.Primary,Tone.Pill->Look(8f,appearance.primary,null,appearance.onPrimary)
        Tone.Danger,Tone.Delete,Tone.OutlineDanger->Look(8f,appearance.fieldFill,appearance.line,appearance.danger)
        Tone.Muted->Look(8f,Color.TRANSPARENT,null,appearance.secondary)
        Tone.Tinted->Look(8f,appearance.fieldFill,appearance.gold,appearance.goldText)
        Tone.Plain,Tone.Outline->Look(8f,appearance.fieldFill,appearance.line,appearance.text)
        Tone.Link->Look(8f,Color.TRANSPARENT,null,appearance.goldText)
    }
    private fun paintButton(button:TextView,tone:Tone){
        val look=look(tone);button.alpha=if(button.isEnabled||tone==Tone.Muted)1f else .55f
        button.background=appearance.pressable(appearance.rounded(look.radius,look.fill,look.stroke),look.radius);button.setTextColor(look.color)
    }
    private fun LinearLayout.button(label:String,tone:Tone=Tone.Primary,params:LinearLayout.LayoutParams?=null,action:()->Unit):Button{
        val view=Button(this@MainActivity).apply{
            val large=tone in listOf(Tone.Primary,Tone.Danger)
            text=label;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(if(large)40 else 34)
            textSize=13.5f;typeface=appearance.weight(500)
            setPadding(dp(15),dp(6),dp(15),dp(6))
            themed{paintButton(this,tone)};setOnClickListener{action()}
        }
        addView(view,params ?: if(orientation==LinearLayout.HORIZONTAL)LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(8)} else margins(top=10))
        return view
    }
    private fun Button.enable(value:Boolean,tone:Tone){isEnabled=value;paintButton(this,tone)}
    private fun LinearLayout.label(value:String)=text(value,12.5f,500){appearance.secondary}.apply{layoutParams=margins(bottom=6)}
    /** entry: field fill, 1dp line border, radius 8; focus turns the border gold. contentDescription keeps it addressable. */
    private fun LinearLayout.input(label:String?,value:String="",hint:String=label.orEmpty(),password:Boolean=false,numeric:Boolean=false,description:String=label ?: hint,radius:Float=8f,params:LinearLayout.LayoutParams?=null):EditText{
        if(label!=null)this.label(label)
        val field=EditText(this@MainActivity).apply{
            setText(value);this.hint=hint;contentDescription=description;textSize=14f;isSingleLine=true;setPadding(dp(12),dp(8),dp(12),dp(8));minHeight=dp(40)
            inputType=if(password)InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else if(numeric)InputType.TYPE_CLASS_NUMBER else InputType.TYPE_CLASS_TEXT
            themed{setTextColor(appearance.text);setHintTextColor(appearance.secondary);background=appearance.input(radius)}
        }
        addView(field,params ?: margins(bottom=16));return field
    }
    /** switch: line track, ok-green when on; the thumb is white. */
    private fun Switch.tint(){themed{
        thumbTintList=ColorStateList.valueOf(Color.WHITE)
        trackTintList=ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked),intArrayOf()),intArrayOf(appearance.success,appearance.line))
    }}
    /** .set row: label 14/500, optional 12.5sp description, switch on the right, hairline below. */
    private fun LinearLayout.switchRow(label:String,description:String?,value:Boolean,last:Boolean=false,changed:(Boolean)->Unit):Switch{
        val row=box(false).apply{setPadding(0,dp(10),0,dp(10));minimumHeight=dp(52);themed{background=appearance.bottomLine()}}
        val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(16)})
        texts.text(label,14f,500);if(description!=null)texts.secondary(description,12.5f).apply{layoutParams=margins(top=2)}
        val toggle=Switch(this@MainActivity).apply{isChecked=value;contentDescription=label;tint();setOnCheckedChangeListener{_,on->changed(on)}}
        row.addView(toggle,LinearLayout.LayoutParams(-2,-2));return toggle
    }
    /** .badge: outline tag, 20dp high, radius 4, 11.5sp text-2; the campus-auth variant is gold. */
    private fun badge(parent:LinearLayout,value:String,auth:Boolean):TextView=parent.text(value,11.5f,400){if(auth)appearance.goldText else appearance.secondary}.apply{
        setPadding(dp(7),0,dp(7),0);minHeight=dp(20);gravity=Gravity.CENTER;maxLines=1;layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(6)}
        themed{background=appearance.badge(auth)}
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
            contentDescription=description;minimumHeight=dp(34);dropDownVerticalOffset=dp(6)
            adapter=object:ArrayAdapter<String>(this@MainActivity,0,options){
                override fun getView(position:Int,convertView:View?,parent:ViewGroup):View=((convertView as? TextView) ?: TextView(this@MainActivity)).apply{
                    text=getItem(position);textSize=14f;typeface=appearance.weight(500);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END
                    gravity=Gravity.CENTER_VERTICAL or Gravity.START;minHeight=dp(34);setPadding(dp(12),0,dp(34),0);setTextColor(appearance.text)
                }
                override fun getDropDownView(position:Int,convertView:View?,parent:ViewGroup):View=((convertView as? TextView) ?: TextView(this@MainActivity)).apply{
                    val chosen=position==selectedItemPosition
                    text=getItem(position);textSize=13.5f;maxLines=1;gravity=Gravity.CENTER_VERTICAL;minHeight=dp(34);setPadding(dp(10),0,dp(12),0);compoundDrawablePadding=dp(8)
                    typeface=appearance.weight(if(chosen)600 else 400);setTextColor(if(chosen)appearance.goldText else appearance.text)
                    setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("check",if(chosen)appearance.goldText else Color.TRANSPARENT,14),null,null,null)
                    background=appearance.pressable(appearance.rounded(6f,Color.TRANSPARENT),6f)
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
        homeBody=null;homeSignature="";liveMetrics=emptyList();countdown=null;scroller=null;nearbyCard=null;wifiForm=null;updateCard=null
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
    private data class Metrics(val signal:Int,val signalGrade:String,val speed:Int,val speedGrade:String)
    private fun metricFacts(network:JSONObject):Metrics{
        val signal=if(network.isNull("signal"))-1 else network.optInt("signal",-1)
        val speed=if(network.isNull("linkSpeed"))-1 else network.optInt("linkSpeed",-1)
        return Metrics(signal,when{signal>=75->"优秀";signal>=50->"良好";signal>=25->"一般";else->"较差"},
            speed,when{speed>=500->"优秀";speed>=200->"良好";speed>=100->"一般";speed>=50->"较差";else->"很差"})
    }
    /** Same text and colours the strip would be built with; the known/unknown switch rebuilds instead. */
    private fun patchMetrics(network:JSONObject){
        val (signal,signalGrade,speed,speedGrade)=metricFacts(network)
        val values=listOf((if(signal<0)"未知" else "$signal%") to signalGrade.takeIf{signal>=0},(if(speed<0)"未知" else "$speed Mbps") to speedGrade.takeIf{speed>=0})
        liveMetrics.zip(values).forEach{(views,value)->
            val (shown,graded)=views
            if(shown.text.toString()!=value.first)shown.text=value.first
            val grade=value.second
            if(graded!=null&&grade!=null&&graded.text.toString()!=grade){
                graded.text=grade
                val color=when(grade){"优秀","良好"->{->appearance.success};"一般","较差"->{->appearance.warning};else->{->appearance.danger}}
                graded.setTag(R.id.painter,null);graded.themed{setTextColor(color())}
            }
        }
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
        // Signal and link speed change on every scan; they are patched below, not rebuilt.
        val stable=JSONObject(network.toString()).apply{put("signal",!network.isNull("signal")&&network.optInt("signal",-1)>=0);put("linkSpeed",!network.isNull("linkSpeed")&&network.optInt("linkSpeed",-1)>=0)}
        val signature=listOf(branch,stable,status.optBoolean("authenticated"),status.optBoolean("internetReachable"),status.optBoolean("authenticating"),status.optBoolean("paused"),status.optBoolean("requiresAuth"),progress,rule,account?.str("username"),account?.str("serverUrl"),config.optBoolean("authPaused"),array("wifiRules"),config.optBoolean("heartbeatEnabled",true),config.optInt("heartbeatIntervalSeconds",30)).joinToString("\u0001")
        if(signature==homeSignature){patchMetrics(network);return}
        homeSignature=signature;body.removeAllViews();liveMetrics=emptyList();countdown=null;handler.removeCallbacks(tick)
        if(status.optBoolean("paused")||config.optBoolean("authPaused"))pauseBanner(body){call("login")}
        accountCard(body,branch,network,progress,rule,account)
        if(branch=="loading")return
        recoveryFailures(body,progress)
        if(branch=="offline"){
            if(config.optBoolean("heartbeatEnabled",true))section(body,"心跳检测 (已暂停)").sectionNote("当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。")
        }else{
            metrics(body,network)
            details(body,network,if(branch=="full")account else null)
        }
        wifiList(body,rule)
    }
    /** .banner: gold outline with the paused notice and the resume action, as on the Linux home and settings pages. */
    private fun pauseBanner(parent:LinearLayout,resume:()->Unit){
        val banner=parent.box(false,margins(bottom=16)).apply{setPadding(dp(14),dp(8),dp(8),dp(8));themed{background=appearance.rounded(8f,Color.TRANSPARENT,appearance.gold)}}
        banner.text("自动认证已暂停",14f,600){appearance.goldText}.apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f)}
        banner.button("恢复自动认证",Tone.Plain,LinearLayout.LayoutParams(-2,dp(34))){resume()}.apply{contentDescription="恢复自动认证";setPadding(dp(12),0,dp(12),0)}
    }
    /** "2023101234" → "2023 1012 34", printed like the number on a campus card. */
    private fun cardNumber(username:String)=username.chunked(4).joinToString(" ")
    /**
     * Copy for the home account card and the text under it (linux.rs `Face`). [tone] is the lamp colour: ok, warn, bad or
     * idle. [void] draws an empty dashed outline instead of a face (no WiFi, no rule or no account).
     */
    private class Face(var tone:String,var void:Boolean,val backs:Int,val issuer:String,var place:String,var status:String,var headline:String,var body:String,
        val meta:MutableList<Pair<String,String>>,val notes:MutableList<Pair<String,String>>)
    private fun actionParams()=LinearLayout.LayoutParams(-2,dp(34)).apply{marginEnd=dp(8)}
    /** .note: an outlined 12sp tag; gold and bad variants colour the border and the text. */
    private fun note(value:String,kind:String)=TextView(this).apply{text=value;textSize=12f;maxLines=2;setPadding(dp(8),dp(1),dp(8),dp(2));themed{setTextColor(appearance.noteColor(kind));background=appearance.note(kind)}}
    /**
     * The account card deck (linux.rs `account_card`), drawn in its 456×298 design frame and scaled to the phone width:
     * up to two cards behind the face for further linked accounts, the gold chip, the status lamp and title, the card
     * number and the meta fields. While AutoAuthStatus reports a recovery, its phase replaces the status, copy, meta and
     * actions, and the magnetic stripe shows the attempt progress. Headline, copy, notes and actions follow under the card.
     */
    private fun accountCard(body:LinearLayout,branch:String,network:JSONObject,progress:JSONObject,rule:JSONObject?,account:JSONObject?){
        val ssid=network.str("ssid").ifBlank{"未知"}
        val online=status.optBoolean("internetReachable")
        val authenticated=status.optBoolean("authenticated");val connecting=status.optBoolean("authenticating")
        val heartbeat=config.optBoolean("heartbeatEnabled",true)
        val accounts=items("accounts")
        val linked=rule?.optJSONArray("linkedAccountIds").strings().count{id->accounts.any{it.str("id")==id}}
        val count=maxOf(linked,if(account!=null)1 else 0)
        var action:((LinearLayout)->Unit)?=null
        val face=when(branch){
            "loading"->Face("idle",true,0,"TUST · 校园网认证","","正在获取网络状态","","请稍候，正在检查网络连接状态",mutableListOf(),mutableListOf())
            "offline"->Face("bad",true,0,"TUST · 校园网认证","无 WiFi","未连接 WiFi","先连上 WiFi","当前设备未连接到任何 WiFi 网络，请先连接 WiFi。",
                mutableListOf("当前 WiFi" to "无","心跳检测" to if(heartbeat)"已暂停" else "已关闭"),
                mutableListOf("连接到 WiFi 后才能使用网络认证功能" to "").apply{if(heartbeat)add("心跳检测已暂停" to "bad")})
            "unconfigured"->{
                val sameName=items("wifiRules").any{it.str("ssid")==network.str("ssid")}
                Face("idle",true,0,"TUST · 未配置",ssid,if(sameName)"请选择当前 WiFi 规则" else "该 WiFi 未配置",if(sameName)"选择 WiFi 规则" else "添加这个 WiFi",
                    if(sameName)"同名 WiFi 身份信息不足或规则不匹配，请在配置设置中选择安全类型及 BSSID 后重试。" else "当前连接的 WiFi \"$ssid\" 尚未配置，请前往\"配置设置\"添加此 WiFi 的配置。",
                    mutableListOf("当前 WiFi" to ssid,"WiFi 规则" to if(sameName)"未匹配" else "未配置"),mutableListOf("点击下方\"配置设置\"添加 WiFi 配置" to ""))
            }
            "open"->Face(if(online)"ok" else "warn",false,0,"TUST · 无需认证",ssid,"无需认证",if(online)"互联网可达" else "互联网暂不可达",
                if(online)"当前 WiFi 无需校园网认证，互联网可达。" else "当前 WiFi 无需校园网认证，互联网暂不可达。",
                mutableListOf("当前 WiFi" to ssid,"WiFi 规则" to "无需认证","互联网" to if(online)"可达" else "不可达"),
                mutableListOf("此 WiFi 已配置为「无需认证」" to "gold","如家庭 WiFi、手机热点等网络" to ""))
            "account"->{
                action={row->row.button("添加认证账号",Tone.Plain,actionParams()){page="设置";render()}.apply{contentDescription="添加认证账号"}}
                Face("idle",true,0,"TUST · 校园网认证",ssid,"未配置账户","还差一个账号","该 WiFi 需要校园网认证，但尚未关联账户。请前往\"配置设置\"添加账户并关联到此 WiFi。",
                    mutableListOf("当前 WiFi" to ssid,"WiFi 规则" to "需要认证","关联账户" to "无"),mutableListOf("点击下方\"配置设置\"添加账户并关联" to ""))
            }
            else->{
                action={row->
                    val label=if(authenticated)"注销登录" else if(connecting)"正在连接..." else "立即连接"
                    val tone=if(connecting&&!authenticated)Tone.Primary else Tone.Plain
                    row.button(label,tone,actionParams()){call(if(authenticated)"logout" else "login")}.apply{contentDescription=label;enable(!connecting||authenticated,tone)}
                }
                Face(if(authenticated&&online)"ok" else "warn",false,minOf(count-1,2).coerceAtLeast(0),"TUST · 校园网认证",ssid,
                    if(authenticated){if(online)"已认证并联网" else "已认证，互联网不可达"} else "需要认证",
                    if(authenticated){if(online)"一切正常" else "正在检查互联网"} else if(connecting)"正在认证" else "等待认证",
                    if(authenticated){if(online)"当前 WiFi 已通过认证且可访问互联网。" else "门户已确认认证成功，正在检查互联网连接。"} else "当前 WiFi 需要校园网认证，请点击下方按钮进行认证。",
                    mutableListOf("当前 WiFi" to ssid,"运营商" to ispLabel(account?.str("isp").orEmpty()),"关联账户" to "$count 个","WiFi 规则" to if(rule!=null)"需要认证" else "自动识别"),
                    mutableListOf((if(rule!=null)"此 WiFi 已配置为「需要认证」" else "根据当前网络信息识别为校园网") to "gold","如校园网 CMCC/CUCC/CTCC" to ""))
            }
        }
        // AutoAuthStatus recovery: the phase takes over the card while it runs or after it failed.
        val state=progress.str("status")
        val recovering=state in listOf("connecting","awaiting-system","authenticating","verifying","cooldown","failed","cancelled")
        val attempt=progress.optInt("attempt");val max=progress.optInt("maxAttempts")
        if(recovering){
            val failed=state in listOf("cooldown","failed","cancelled")
            val failures=progress.optJSONArray("failedList")
            val target=progress.str("ssid")
            face.void=false;face.tone=if(failed)"bad" else "warn"
            face.status=when(state){"connecting","awaiting-system"->"正在连接";"authenticating"->"正在认证";"verifying"->"正在确认联网";"cooldown"->"等待下一轮重连";"failed"->"连接失败";else->"已取消"}
            face.headline=if(failed&&failures!=null&&failures.length()>0)"所有 WiFi 连接失败" else "WiFi 自动重连"
            val reason=progress.str("reason").ifBlank{progress.str("message")}
            face.body=listOfNotNull(target.takeIf{it.isNotBlank()}?.let{"目标 WiFi：$it"},if(state=="awaiting-system")"请在系统 WiFi 中确认连接" else null,reason.takeIf{it.isNotBlank()}).joinToString("\n")
            face.meta.clear();face.notes.clear()
            val currentSsid=if(status.optBoolean("wifiConnected"))network.str("ssid") else ""
            face.meta.add("当前 WiFi" to currentSsid.ifBlank{"无"})
            if(target.isNotBlank()){face.place=target;if(target!=currentSsid)face.meta.add("目标 WiFi" to target)}
            if(max>0)face.meta.add("尝试" to "第 $attempt / $max 次")
            val home=action
            action={row->
                if(failed)row.button("立即重试",Tone.Primary,actionParams()){call("retry")}.apply{contentDescription="立即重试"}
                if(state in listOf("awaiting-system","failed","cooldown"))row.button("打开系统 WiFi",Tone.Plain,actionParams()){startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))}.apply{contentDescription="打开系统 WiFi"}
                if(!failed||state=="cooldown")row.button("停止恢复",Tone.Plain,actionParams()){call("stop_recovery")}.apply{contentDescription="停止恢复"}
                // The home action stays reachable after a failure; while connecting it would only repeat the title.
                if(failed)home?.invoke(row)
            }
        }
        val void=face.void
        fun tint(main:Boolean):()->Int={if(void){if(main)appearance.text else appearance.secondary}else{if(main)appearance.faceText else appearance.faceText2}}
        // The deck is drawn at 456dp and scaled to the phone width; small card text keeps a readable size after scaling.
        val scale=((resources.displayMetrics.widthPixels-dp(32)).toFloat()/dp(456)).coerceIn(.5f,1f)
        fun size(design:Float,least:Float)=maxOf(design,least/scale)
        val fit=FitWidth(this,dp(456),dp(298)).apply{contentDescription="网络连接状态"}
        body.addView(fit,LinearLayout.LayoutParams(-1,-2))
        val deck=FrameLayout(this);fit.addView(deck)
        val backs=if(void)0 else face.backs
        for(back in listOf(intArrayOf(2,45,11,409,257),intArrayOf(1,24,16,424,266)).drop(2-backs))
            deck.addView(View(this).apply{importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;themed{background=appearance.back(back[0],dp(15).toFloat())}},FrameLayout.LayoutParams(dp(back[3]),dp(back[4])).apply{leftMargin=dp(back[1]);topMargin=dp(back[2])})
        val card=FrameLayout(this).apply{themed{background=appearance.face(void,dp(16).toFloat())}}
        deck.addView(card,FrameLayout.LayoutParams(dp(440),dp(276)).apply{topMargin=dp(22)})
        val inner=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(22),dp(24),dp(22))}
        card.addView(inner,FrameLayout.LayoutParams(-1,-1))
        val top=inner.box(false)
        top.text(face.issuer,size(11.5f,10f),400,tint(false)).apply{letterSpacing=.12f;maxLines=1}
        top.text(face.place,size(11.5f,10f),400,tint(false)).apply{letterSpacing=.12f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;gravity=Gravity.END;layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{marginStart=dp(12)}}
        inner.addView(View(this).apply{importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;themed{background=appearance.chip(void,resources.displayMetrics.density)}},LinearLayout.LayoutParams(dp(46),dp(34)).apply{topMargin=dp(18);bottomMargin=dp(14)})
        val line=inner.box(false)
        // The 12dp lamp's 5dp ring overhangs its box, as the CSS box-shadow does.
        line.addView(View(this).apply{importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;background=appearance.lamp(face.tone)},LinearLayout.LayoutParams(dp(22),dp(22)).apply{marginStart=-dp(5);marginEnd=dp(8)})
        line.text(face.status,34f,700,tint(true)).apply{letterSpacing=.01f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE;layoutParams=LinearLayout.LayoutParams(0,-2,1f)}
        inner.addView(View(this),LinearLayout.LayoutParams(-1,0,1f))
        val dots="•••• •••• ••"
        val number=if(!void&&branch=="full"&&account!=null&&account.str("username").isNotBlank())cardNumber(account.str("username")) else dots
        inner.text(number,size(19f,15f),400){if(void)appearance.faint else appearance.faceText}.apply{typeface=Typeface.MONOSPACE;letterSpacing=.2f;maxLines=1;fontFeatureSettings="tnum";setTextIsSelectable(number!=dots)}
        if(face.meta.isNotEmpty()){
            // The current WiFi comes first and takes the room the other fields leave, ellipsized; four fields close the gap.
            val crowded=face.meta.size>3
            val meta=inner.box(false,margins(top=8)).apply{gravity=Gravity.TOP}
            face.meta.forEachIndexed{i,(key,value)->
                val flexible=i==0&&face.meta.size>1
                val cell=meta.box(params=LinearLayout.LayoutParams(if(flexible)0 else -2,-2).apply{if(flexible)weight=1f;if(i>0)marginStart=dp(if(crowded)18 else 26)})
                cell.text(key,size(11f,10f),400,tint(false)).apply{maxLines=1}
                cell.text(value,size(13f,12f),500,tint(true)).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            }
        }
        if(recovering&&attempt>0&&max>0)card.addView(View(this).apply{contentDescription="尝试进度 $attempt / $max";background=appearance.stripe(attempt.toFloat()/max,dp(16).toFloat())},FrameLayout.LayoutParams(-1,dp(6),Gravity.BOTTOM))
        // Under the card: headline, copy, outlined notes and the actions.
        val side=body.box(params=margins(top=16,bottom=24))
        if(face.headline.isNotBlank())side.text(face.headline,21f,700)
        if(face.body.isNotBlank())side.secondary(face.body,14f).apply{layoutParams=margins(top=6);setLineSpacing(dp(2).toFloat(),1f)}
        val notes=FlowRow(this,dp(6),dp(6))
        for((value,kind) in face.notes)notes.addView(note(value,kind))
        val next=if(recovering)progress.optLong("nextRetryAt") else 0L
        if(next>0){countdownAt=next;countdown=note("","").also{notes.addView(it)};tick.run()}
        if(notes.childCount>0)side.addView(notes,margins(top=12))
        val actions=scrollingRow(side,margins(top=14))
        action?.invoke(actions)
        if(actions.childCount==0)(actions.parent as View).visibility=View.GONE
    }
    /** 本轮尝试: per-network reasons from the recovery's failed list. */
    private fun recoveryFailures(body:LinearLayout,progress:JSONObject){
        val failed=progress.optJSONArray("failedList")
        if(failed==null||failed.length()==0||progress.str("status").let{it.isEmpty()||it=="idle"})return
        val box=section(body,"本轮尝试")
        for(i in 0 until failed.length()){
            val item=failed.getJSONObject(i)
            val row=box.box().apply{setPadding(0,dp(10),0,dp(10));themed{background=appearance.bottomLine()}}
            row.text(item.str("ssid"),14f,600);row.secondary(item.str("reason"),12f).apply{layoutParams=margins(top=2)}
        }
    }
    /** Metric strip: cells under a 1.5dp ink rule, split by hairlines, wrapped onto two rows on a phone. */
    private fun metrics(body:LinearLayout,network:JSONObject){
        val strip=body.box(params=margins(bottom=24)).apply{themed{background=appearance.inkTop()}}
        fun row(first:Boolean)=strip.box(false).apply{gravity=Gravity.NO_GRAVITY;isBaselineAligned=false;if(!first)themed{background=appearance.topLine()}}
        fun cell(parent:LinearLayout,label:String,weight:Float=1f):LinearLayout{
            val divided=parent.childCount>0
            val cell=parent.box(params=LinearLayout.LayoutParams(0,-1,weight)).apply{setPadding(if(divided)dp(16) else 0,dp(9),dp(8),dp(12));if(divided)themed{background=appearance.startLine()}}
            cell.secondary(label,11.5f).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END};return cell
        }
        fun gradeColor(word:String):()->Int={when(word){"优秀","良好"->appearance.success;"一般","较差"->appearance.warning;else->appearance.danger}}
        fun value(cell:LinearLayout,main:String,grade:String?,color:()->Int={appearance.text}):Pair<TextView,TextView?>{
            val line=cell.box(false,margins(top=2)).apply{gravity=Gravity.BOTTOM}
            val shown=line.text(main,18f,700,color).apply{fontFeatureSettings="tnum";maxLines=1}
            val graded=if(grade!=null)line.text(grade,11.5f,400,gradeColor(grade)).apply{maxLines=1;layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(6);bottomMargin=dp(3)}} else null
            return shown to graded
        }
        val (signal,signalGrade,speed,speedGrade)=metricFacts(network)
        val frequency=if(network.isNull("frequency"))0 else network.optInt("frequency")
        val reachable=status.optBoolean("internetReachable")
        val top=row(true)
        liveMetrics=listOf(
            value(cell(top,"信号强度"),if(signal<0)"未知" else "$signal%",if(signal<0)null else signalGrade),
            value(cell(top,"连接速度"),if(speed<0)"未知" else "$speed Mbps",if(speed<0)null else speedGrade))
        value(cell(top,"频段"),when{frequency>=5925->"6GHz";frequency>=4900->"5GHz";frequency>0->"2.4GHz";else->"未知"},null)
        val bottom=row(false)
        value(cell(bottom,"互联网"),if(reachable)"可达" else "不可达",null){if(reachable)appearance.success else appearance.danger}
        // The snapshot carries no next-heartbeat time, so this cell shows the interval and the current result only.
        if(config.optBoolean("heartbeatEnabled",true))
            value(cell(bottom,"心跳检测 · 每 ${config.optInt("heartbeatIntervalSeconds",30)} 秒",2f),if(reachable)"正常" else "异常",null){if(reachable)appearance.success else appearance.danger}
        else value(cell(bottom,"心跳检测",2f),"已关闭",null){appearance.secondary}
    }
    /** 网络详情: key/value rows split by hairlines, values right-aligned, addresses in monospace. */
    private fun details(body:LinearLayout,network:JSONObject,account:JSONObject?){
        val box=section(body,"网络详情")
        header(box).addView(ImageButton(this).apply{contentDescription="刷新 WiFi 信息";scaleType=ImageView.ScaleType.CENTER;setOnClickListener{call("snapshot"){status=it as JSONObject;updateStatus()}}
            themed{setImageDrawable(appearance.icon("refresh",appearance.secondary,16));background=appearance.pressable(appearance.rounded(8f,Color.TRANSPARENT),8f)}},LinearLayout.LayoutParams(dp(32),dp(32)))
        val frequency=if(network.isNull("frequency"))0 else network.optInt("frequency")
        val dns=network.optJSONArray("dns").strings().joinToString(", ")
        val rows=listOf("WiFi 名称" to network.str("ssid"),"IPv4 地址" to network.str("ipv4"),"IPv6 地址" to network.str("ipv6"),"网关" to network.str("gateway"),"DNS" to dns,"BSSID" to network.str("bssid"),
            "WiFi 信道" to if(frequency>0)WifiFacts.channel(frequency).takeIf{it>0}?.toString().orEmpty() else "","安全类型" to network.str("security"),
            "认证账号" to account?.str("username").orEmpty(),"服务器" to account?.str("serverUrl").orEmpty()).filter{it.second.isNotBlank()}
        val mono=setOf("IPv4 地址","IPv6 地址","网关","DNS","BSSID","WiFi 信道")
        for((label,value)in rows){
            val row=box.box(false).apply{minimumHeight=dp(42);setPadding(0,dp(8),0,dp(8));themed{background=appearance.bottomLine()}}
            row.secondary(label,14f).apply{layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(16)}}
            row.text(value,14f,500).apply{gravity=Gravity.END;layoutParams=LinearLayout.LayoutParams(0,-2,1f);setTextIsSelectable(true);fontFeatureSettings="tnum";if(label in mono){typeface=Typeface.create(Typeface.MONOSPACE,500,false);textSize=13f}}
        }
    }
    /** 切换 WiFi: configured rules by priority; the two-digit rank is gold on the current network, the action on the right. */
    private fun wifiList(body:LinearLayout,current:JSONObject?){
        val box=section(body,"切换 WiFi")
        header(box).secondary("按优先级排序",12f).apply{layoutParams=LinearLayout.LayoutParams(-2,-2)}
        val rules=items("wifiRules").sortedBy{it.optInt("priority",10)}
        if(rules.isEmpty())box.sectionNote("暂无 WiFi 配置，可在配置设置中添加")
        val connected=status.optBoolean("wifiConnected")
        for(wifi in rules){
            val id=wifi.str("id");val ssid=wifi.str("ssid");val auth=wifi.optBoolean("requiresAuth");val priority=wifi.optInt("priority",10)
            val active=connected&&current!=null&&current.str("id")==id
            val row=box.box(false).apply{setPadding(0,dp(10),0,dp(10));minimumHeight=dp(60);themed{background=appearance.bottomLine()}}
            rank(row,priority){if(active)appearance.gold else appearance.faint}
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(10)})
            texts.text(ssid,14f,600).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            texts.secondary(listOf("优先级 $priority",wifi.str("security"),wifi.str("bssid")).filter{it.isNotBlank()}.joinToString(" · "),12f).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            val tags=texts.box(false,margins(top=5))
            badge(tags,if(auth)"校园网认证" else "普通热点",auth).apply{(layoutParams as LinearLayout.LayoutParams).marginStart=0}
            if(active)row.text("当前",13f,600){appearance.success}.apply{
                gravity=Gravity.CENTER;compoundDrawablePadding=dp(4);layoutParams=LinearLayout.LayoutParams(dp(64),-2);contentDescription="当前 WiFi $ssid"
                themed{setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("check",appearance.success,14),null,null,null)}
            } else row.button("切换",Tone.Plain,LinearLayout.LayoutParams(dp(64),dp(28))){call("connect",JSONObject().put("id",id)){feedback.text="正在连接 $ssid"}}.apply{contentDescription="切换到 WiFi $ssid";minimumHeight=dp(28);setPadding(0,0,0,0)}
        }
    }
    /** Two-digit priority rank (.wifi-rank / .rule-rank): monospace 21sp/700 in a 44dp column. */
    private fun rank(row:LinearLayout,priority:Int,color:()->Int)=row.text(String.format(java.util.Locale.ROOT,"%02d",priority),21f,700,color).apply{
        typeface=Typeface.create(Typeface.MONOSPACE,700,false);fontFeatureSettings="tnum";maxLines=1;contentDescription="优先级 $priority";layoutParams=LinearLayout.LayoutParams(dp(44),-2)
    }
    // ---- 配置设置 (SettingsScreen.tsx and components/settings) ----
    /** Queues config edits and applies them to the newest revision; one save_config runs at a time. */
    private fun mutate(structural:Boolean=false,edit:(JSONObject)->Unit){pending.add(edit);if(structural)pendingRefresh=true;flush()}
    private fun flush(){
        if(saving||pending.isEmpty())return
        val next=JSONObject(config.toString());val edits=pending.toList();pending.clear()
        try{edits.forEach{it(next)}}catch(e:Exception){feedback.text=e.message;return}
        saving=true;inFlight=next
        call("save_config",next,failed={saving=false;inFlight=null;pendingRefresh=false;call("config",silent=true){config=it as JSONObject;if(page=="设置")rerender()}}){
            config=it as JSONObject;saving=false;inFlight=null;feedback.text="已保存并应用"
            if(pending.isNotEmpty())flush() else if(pendingRefresh){pendingRefresh=false;if(page=="设置")rerender()}
        }
    }
    /**
     * Leaving the screen drops replies, so a chained save cannot follow a running one. Queued
     * edits are applied to the revision the running save will produce and sent in one request.
     */
    private fun flushOnLeave(){
        if(pending.isEmpty()||!config.has("revision"))return
        val base=inFlight.takeIf{saving}
        val next=JSONObject((base ?: config).toString());val edits=pending.toList();pending.clear()
        if(runCatching{edits.forEach{it(next)}}.isFailure)return
        // The running save, if it succeeds, advances the revision by one.
        if(base!=null)next.put("revision",next.optLong("revision")+1)
        call("save_config",next,silent=true)
    }
    private fun debounce(key:String,action:()->Unit){debounces[key]?.let{handler.removeCallbacks(it)};val task=Runnable{debounces.remove(key);action()};debounces[key]=task;handler.postDelayed(task,600)}
    private fun settings(){
        val root=column()
        if(config.optBoolean("authPaused"))pauseBanner(root){call("login"){feedback.text="已恢复自动认证";config.put("authPaused",false);rerender()}}
        generalSettings(root);notificationSettings(root)
        updateCard=section(root,null);renderUpdate();call("update_state",silent=true){updateState=it as JSONObject;renderUpdate();if(updateState.str("state")=="downloading")handler.postDelayed(pollUpdate,1000)}
        permissions(root)
        nearbyCard=section(root,null);renderNearby()
        accounts(root);wifis(root)
    }
    private fun generalSettings(root:LinearLayout){
        val box=section(root,"通用设置")
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
        fun number(parent:LinearLayout,key:String,label:String,unit:String,shortUnit:String,range:IntRange,default:Int,description:String){
            val current=config.optInt(key,default)
            // .set row: label and current value on the left, a short monospace field and its unit on the right.
            val row=parent.box(false).apply{setPadding(0,dp(10),0,dp(10));minimumHeight=dp(52);themed{background=appearance.bottomLine()}}
            val header=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(12)})
            header.text(label,14f,500);val value=header.secondary("当前值: $current $unit",12.5f).apply{layoutParams=margins(top=2)}
            val field=row.input(null,current.toString(),"${range.first}-${range.last}",numeric=true,description=description,params=LinearLayout.LayoutParams(dp(84),-2)).apply{typeface=Typeface.MONOSPACE;fontFeatureSettings="tnum";gravity=Gravity.END or Gravity.CENTER_VERTICAL}
            row.text(shortUnit,13f,500){appearance.secondary}.apply{layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(8)}}
            field.doAfterTextChanged{text->val number=text?.toString()?.toIntOrNull();if(number!=null&&number in range){value.text="当前值: $number $unit";debounce(key){mutate{it.put(key,number)}}}else debounces.remove(key)?.let{handler.removeCallbacks(it)}}
        }
        number(heartbeat,"heartbeatIntervalSeconds","心跳检测间隔","秒","秒",15..300,30,"心跳间隔（秒）")
        number(heartbeat,"failureThreshold","连续失败阈值","次","次",1..10,3,"连续失败阈值")
        number(box,"wifiRetries","每个 WiFi 最多尝试次数（含首次）","次","次",1..10,3,"WiFi 重试次数")
        number(box,"wifiCooldownMinutes","冷却期时长","分钟","分",0..1440,5,"冷却期时长（分钟）")
    }
    private fun notificationSettings(root:LinearLayout){
        val box=section(root,"通知设置")
        val labels=listOf("wifiDisconnected" to "WiFi 断开","reconnectSuccess" to "自动重连成功","reconnectFailed" to "自动重连全部失败","authRecovered" to "认证恢复成功")
        val current=config.optJSONObject("notifications") ?: JSONObject()
        labels.forEachIndexed{i,(key,label)->box.switchRow(label,null,current.optBoolean(key,true),i==labels.lastIndex){on->mutate{next->next.put("notifications",JSONObject((next.optJSONObject("notifications") ?: JSONObject()).toString()).put(key,on))}}}
    }
    /** UpdateCard.tsx: current version, status message and the action for the current download state. */
    private fun renderUpdate(){
        val box=updateCard ?: return;box.removeAllViews()
        sectionHead(box,"应用更新");box.secondary("当前版本 ${BuildConfig.VERSION_NAME}",13f).apply{layoutParams=margins(top=10)}
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
        val box=section(root,"权限状态")
        list.forEachIndexed{i,(item,request)->
            val (title,description,ok)=item
            val row=box.box(false).apply{setPadding(0,dp(10),0,dp(10));themed{background=appearance.bottomLine()}}
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(12)})
            texts.text(title,14f,500);texts.secondary(description,12.5f).apply{layoutParams=margins(top=2)}
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
        sectionHead(box,"附近 WiFi")
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
            val row=box.box(false).apply{setPadding(0,dp(8),0,dp(8));themed{background=appearance.bottomLine()}}
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
        addView(picker,LinearLayout.LayoutParams(-1,dp(40)).apply{bottomMargin=dp(16)});return picker
    }
    /** AccountsCard.tsx: account rows with a mini card face (gold chip on the account in use), 使用 / 编辑 / 删除, then the add form. */
    private fun accounts(root:LinearLayout):View{
        val box=section(root,"账号管理").apply{contentDescription="账号配置"}
        header(box).secondary("按顺序依次认证",12f).apply{layoutParams=LinearLayout.LayoutParams(-2,-2)}
        val list=box.box(params=margins(bottom=8))
        val accounts=items("accounts")
        if(accounts.isEmpty())list.sectionNote("暂无账号，请添加账号以使用登录功能")
        for(account in accounts){
            val id=account.str("id");val current=config.str("currentAccountId")==id
            val row=list.box(false).apply{setPadding(0,dp(12),0,dp(12));themed{background=appearance.bottomLine()}}
            row.addView(View(this).apply{importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;themed{background=appearance.miniCard(current)}},LinearLayout.LayoutParams(dp(58),dp(38)).apply{marginEnd=dp(12)})
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(8)})
            texts.text(account.str("username"),14f,600).apply{typeface=Typeface.create(Typeface.MONOSPACE,600,false);letterSpacing=.06f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            texts.secondary(listOf(ispLabel(account.str("isp")),account.str("serverUrl")).filter{it.isNotBlank()}.joinToString(" · "),12f).apply{layoutParams=margins(top=2);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            val actions=row.box(false,LinearLayout.LayoutParams(-2,-2))
            if(current)actions.text("使用中",12.5f,600){appearance.success}.apply{contentDescription="使用账号 ${account.str("username")}";layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(4)}}
            else actions.button("使用",Tone.Plain,LinearLayout.LayoutParams(-2,dp(32))){mutate{it.put("currentAccountId",id)};config.put("currentAccountId",id);rerender()}.apply{setPadding(dp(10),0,dp(10),0);contentDescription="使用账号 ${account.str("username")}"}
            actions.button("编辑",Tone.Plain,LinearLayout.LayoutParams(-2,dp(32)).apply{marginStart=dp(6)}){accountEditor(account)}.apply{setPadding(dp(10),0,dp(10),0);contentDescription="编辑账号 ${account.str("username")}"}
            actions.button("删除",Tone.Delete,LinearLayout.LayoutParams(-2,dp(32)).apply{marginStart=dp(6)}){confirmRemoveAccount(account)}.apply{setPadding(dp(10),0,dp(10),0);contentDescription="删除账号 ${account.str("username")}"}
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
    private fun systemOnly(security:String)=WifiSecurity.systemSettingsOnly(security)
    /** WifiConfigCard.tsx: rules numbered by priority (gold rank), badge, 编辑 / 连接 / auto-connect switch / 删除, then the add form. */
    private fun wifis(root:LinearLayout):View{
        val box=section(root,"WiFi 配置")
        box.sectionNote("配置需要自动连接的 WiFi 网络。启用心跳检测后，断线时会按优先级尝试切换网络。")
        val list=box.box(params=margins(bottom=8))
        val rules=items("wifiRules").sortedBy{it.optInt("priority",10)}
        if(rules.isEmpty())list.sectionNote("暂无 WiFi 配置")
        val accounts=items("accounts")
        for(wifi in rules){
            val id=wifi.str("id");val ssid=wifi.str("ssid");val priority=wifi.optInt("priority",10);val auth=wifi.optBoolean("requiresAuth");val system=systemOnly(wifi.str("security"))
            val row=list.box(false).apply{setPadding(0,dp(11),0,dp(11));themed{background=appearance.bottomLine()}}
            rank(row,priority){appearance.gold}
            val texts=row.box(params=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(8)})
            texts.text(ssid,14f,600).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            texts.secondary(listOf("优先级 $priority",wifi.str("security")).filter{it.isNotBlank()}.joinToString(" · "),12f).apply{layoutParams=margins(top=2);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            val badges=texts.box(false,margins(top=5))
            badge(badges,if(auth)"需要认证" else "无需认证",auth).apply{(layoutParams as LinearLayout.LayoutParams).marginStart=0}
            if(system)texts.secondary("此安全类型通过系统 WiFi 设置连接，自动连接不可用",12f).apply{layoutParams=margins(top=4)}
            if(auth){
                val linked=wifi.optJSONArray("linkedAccountIds").strings().mapNotNull{lid->accounts.firstOrNull{it.str("id")==lid}}
                if(linked.isEmpty())texts.text("关联账号: 未关联 (可能已删除)",12f){appearance.danger}.apply{layoutParams=margins(top=4)}
                else texts.secondary("关联账号: ${linked.joinToString(" / "){"${it.str("username")} (${ispLabel(it.str("isp"))})"}}",12f).apply{layoutParams=margins(top=4)}
            }
            val actions=row.box(params=LinearLayout.LayoutParams(-2,-2)).apply{gravity=Gravity.CENTER_HORIZONTAL}
            val top=actions.box(false,LinearLayout.LayoutParams(-2,-2))
            top.button("编辑",Tone.Plain,LinearLayout.LayoutParams(-2,dp(32))){wifiEditor(wifi)}.apply{setPadding(dp(10),0,dp(10),0);contentDescription="编辑 WiFi $ssid"}
            top.button("连接",Tone.Plain,LinearLayout.LayoutParams(-2,dp(32)).apply{marginStart=dp(6)}){call("connect",JSONObject().put("id",id)){feedback.text="正在连接 $ssid"}}.apply{setPadding(dp(10),0,dp(10),0);contentDescription="连接 WiFi $ssid"}
            val bottom=actions.box(false,LinearLayout.LayoutParams(-2,-2).apply{topMargin=dp(4)})
            bottom.addView(Switch(this).apply{contentDescription="自动连接 $ssid";isEnabled=!system;isChecked=wifi.optBoolean("autoConnect")&&!system;tint();setOnCheckedChangeListener{_,on->mutate{next->next.put("wifiRules",JSONArray(items("wifiRules",next).map{if(it.str("id")==id)it.put("autoConnect",on) else it}))}}},LinearLayout.LayoutParams(-2,-2))
            bottom.button("删除",Tone.Delete,LinearLayout.LayoutParams(-2,dp(32)).apply{marginStart=dp(6)}){
                AlertDialog.Builder(this).setTitle("删除 WiFi").setMessage("确定删除 WiFi $ssid？").setPositiveButton("删除"){_,_->mutate(structural=true){next->next.put("wifiRules",JSONArray(items("wifiRules",next).filter{it.str("id")!=id}))}}.setNegativeButton("取消",null).show().also(::track)
            }.apply{setPadding(dp(10),0,dp(10),0);contentDescription="删除 WiFi $ssid"}
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
            parent.addView(CheckBox(this).apply{text="${account.str("username")} (${ispLabel(account.str("isp"))})";isChecked=id in linked;minHeight=dp(44);themed{setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.gold)}
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
        val clear=CheckBox(this).apply{text="清空已保存密码";themed{setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.gold)}};box.addView(clear,margins(bottom=12))
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
        val clear=CheckBox(this).apply{text="清空密码（开放网络）";themed{setTextColor(appearance.text);buttonTintList=ColorStateList.valueOf(appearance.gold)}};box.addView(clear,margins(bottom=12))
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
    /** .level-*: info and debug in text-2 (debug at weight 400), success ok, warn warn, error bad. */
    private fun levelColor(level:String)=when(level){
        "success"->appearance.success
        "warn"->appearance.warning
        "error"->appearance.danger
        "info","debug"->appearance.secondary
        else->appearance.text
    }
    /** Logs toolbar button: 34dp, field fill, 1dp line border, radius 8, 13sp; active uses the gold border and text. */
    private fun LinearLayout.logButton(label:String,active:()->Boolean={false},params:LinearLayout.LayoutParams=LinearLayout.LayoutParams(-2,dp(34)).apply{marginEnd=dp(6)},action:()->Unit):Button{
        val view=Button(this@MainActivity).apply{
            text=label;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(34);textSize=13f;setPadding(dp(12),0,dp(12),0);contentDescription=label;gravity=Gravity.CENTER
            themed{val on=active();isSelected=on;typeface=appearance.weight(if(on)600 else 500);alpha=if(isEnabled)1f else .5f
                setTextColor(if(on)appearance.goldText else appearance.text)
                background=appearance.pressable(appearance.rounded(8f,appearance.fieldFill,if(on)appearance.gold else appearance.line),8f)}
            setOnClickListener{action()}
        }
        addView(view,params);return view
    }
    /** One .seg button (log-filter): 12.5sp text-2 on transparent; the checked level is the ground colour on ink. */
    private fun LinearLayout.segment(label:String,active:()->Boolean,action:()->Unit):Button{
        val view=Button(this@MainActivity).apply{
            text=label;isAllCaps=false;stateListAnimator=null;minWidth=0;minimumWidth=0;minHeight=0;minimumHeight=dp(30);textSize=12.5f;setPadding(dp(11),0,dp(11),0);contentDescription=label;gravity=Gravity.CENTER
            themed{val on=active();isSelected=on;typeface=appearance.weight(if(on)600 else 400);setTextColor(if(on)appearance.background else appearance.secondary);background=appearance.segment(on)}
            setOnClickListener{action()}
        }
        addView(view,LinearLayout.LayoutParams(-2,dp(30)));return view
    }
    private fun scrollingRow(parent:LinearLayout,params:LinearLayout.LayoutParams):LinearLayout{
        val row=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
        parent.addView(HorizontalScrollView(this).apply{isHorizontalScrollBarEnabled=false;addView(row)},params);return row
    }
    private fun logs(){
        val root=column(false)
        val heading=root.box(false,margins(bottom=12))
        heading.secondary("连接、认证与恢复记录，保留最近 7 天",13f).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(12)}}
        heading.logButton("刷新",params=LinearLayout.LayoutParams(-2,dp(34))){cursor=null;cursors.clear();loadLogs()}.apply{contentDescription="搜索 / 刷新";compoundDrawablePadding=dp(6);themed{setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("refresh",appearance.text,16),null,null,null)}}
        // No container: tools, the level segments and the list sit on the ground, the list under an ink rule.
        val workspace=root.box(params=LinearLayout.LayoutParams(-1,0,1f).apply{bottomMargin=dp(8)})
        // Search and filter share one 34dp height and are centred vertically, as in the Linux toolbar.
        val toolbar=workspace.box(false).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(0,dp(4),0,dp(10))}
        val keyword=EditText(this).apply{
            setText(logQuery.str("keyword"));hint="搜索消息或详情";contentDescription="搜索全部保留历史";textSize=13f;isSingleLine=true;setPadding(dp(12),0,dp(12),0);imeOptions=EditorInfo.IME_ACTION_SEARCH
            compoundDrawablePadding=dp(8)
            themed{setTextColor(appearance.text);setHintTextColor(appearance.secondary);background=appearance.input();setCompoundDrawablesRelativeWithIntrinsicBounds(appearance.icon("search",appearance.secondary,16),null,null,null)}
            setOnEditorActionListener{view,_,_->logQuery.put("keyword",view.text.toString());cursor=null;cursors.clear();loadLogs();true}
        }
        toolbar.addView(keyword,LinearLayout.LayoutParams(0,dp(34),1f).apply{marginEnd=dp(8)})
        toolbar.logButton("筛选",{logQuery.str("source").isNotBlank()||logQuery.has("startTime")},LinearLayout.LayoutParams(-2,dp(34))){logFilters()}
        // .seg: the level filter as one segmented control; it scrolls sideways when the screen is narrow.
        val chips=scrollingRow(workspace,margins()).apply{themed{background=appearance.seg()}};logChips=chips
        (chips.parent as View).layoutParams=LinearLayout.LayoutParams(-2,-2)
        for((level,label)in logLevels)chips.segment(label,{logQuery.optString("level","all")==level}){logQuery.put("level",level).put("keyword",keyword.text.toString());cursor=null;cursors.clear();repaint(chips);loadLogs()}
        val statusLine=workspace.box(false).apply{setPadding(0,dp(8),0,dp(8))}
        // The count stays on one line; a narrow screen ellipsizes it instead of wrapping.
        logStatus=statusLine.text("正在读取日志…",11f){appearance.secondary}.apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);maxLines=1;isSingleLine=true;ellipsize=android.text.TextUtils.TruncateAt.END;accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
        statusLine.logButton("上一页",params=LinearLayout.LayoutParams(-2,dp(34)).apply{marginStart=dp(6)}){if(cursors.isNotEmpty()){cursor=cursors.removeAt(cursors.lastIndex);loadLogs()}}
        statusLine.logButton("下一页",params=LinearLayout.LayoutParams(-2,dp(34)).apply{marginStart=dp(6)}){nextCursor?.let{cursors.add(cursor);cursor=it;loadLogs()}}
        val frame=FrameLayout(this).apply{themed{background=appearance.inkTop()}};workspace.addView(frame,LinearLayout.LayoutParams(-1,0,1f))
        val list=RecyclerView(this).apply{layoutManager=LinearLayoutManager(this@MainActivity);setItemViewCacheSize(2)}
        logAdapter=LogAdapter();list.adapter=logAdapter;frame.addView(list,FrameLayout.LayoutParams(-1,-1))
        val empty=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(16),dp(42),dp(16),dp(42))}
        emptyLogs=empty.text("正在读取日志…",16f,500).apply{gravity=Gravity.CENTER;layoutParams=margins(bottom=12)}
        empty.secondary("连接、认证或设置变更后，记录会显示在这里").apply{gravity=Gravity.CENTER}
        frame.addView(empty,FrameLayout.LayoutParams(-1,-2))
        // Footer as on Linux: the scope and format dropdowns sit directly in the row with export and clear, all 36dp and
        // vertically centred. At the bottom of the screen the dropdown popup opens upwards.
        val panel=workspace.box(false).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(0,dp(10),0,dp(4));themed{background=appearance.topLine()}}
        exportPanel=panel
        panel.addView(Dropdown(listOf("全部保留日志","当前筛选结果"),"导出范围").apply{setSelection(if(exportFiltered)1 else 0);onItemSelectedListener=selected{exportFiltered=it==1}},LinearLayout.LayoutParams(0,dp(34),1f).apply{marginEnd=dp(6)})
        panel.addView(Dropdown(listOf("可读文本 LOG","结构化 JSON"),"格式").apply{setSelection(if(exportJson)1 else 0);onItemSelectedListener=selected{exportJson=it==1}},LinearLayout.LayoutParams(0,dp(34),1f).apply{marginEnd=dp(6)})
        panel.logButton("导出",{true}){exportLogs()}.apply{contentDescription="导出日志"}
        panel.logButton("清空",params=LinearLayout.LayoutParams(-2,dp(34))){clearLogs()}.apply{contentDescription="清空日志";themed{setTextColor(appearance.danger)}}
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
            // .log-row: mono time and source in text-2, the level word in its colour, the message below; hairline under each row.
            val row=LinearLayout(this@MainActivity).apply{orientation=LinearLayout.VERTICAL;minimumHeight=dp(64);setPadding(0,dp(8),0,dp(8));layoutParams=RecyclerView.LayoutParams(-1,-2)}
            val meta=row.box(false,margins(bottom=4))
            val time=meta.text("",12f).apply{typeface=Typeface.MONOSPACE;fontFeatureSettings="tnum";maxLines=1}
            val level=meta.text("",12f,700).apply{maxLines=1;layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(10);marginEnd=dp(10)}}
            val source=meta.text("",12f).apply{typeface=Typeface.MONOSPACE;layoutParams=LinearLayout.LayoutParams(0,-2,1f);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
            val message=row.text("",13.5f).apply{setLineSpacing(dp(3).toFloat(),1f);maxLines=3;ellipsize=android.text.TextUtils.TruncateAt.END}
            return LogHolder(row,time,level,source,message).also{holder->row.setOnClickListener{holder.entry?.let(::showDetails)}}
        }
        private fun showDetails(entry:JSONObject){
            val details=entry.toString(2)
            AlertDialog.Builder(this@MainActivity).setTitle("日志详情").setMessage(details).setPositiveButton("复制"){_,_->
                getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("NetMate 日志",details));feedback.text="已复制"
            }.setNegativeButton("关闭",null).show().also(::track)
        }
        override fun onBindViewHolder(holder:LogHolder,position:Int){
            val entry=items[position];val level=entry.optString("level");holder.entry=entry
            // The row ground depends on the theme only; a theme switch rebinds every row.
            if(holder.dark!=appearance.dark){holder.dark=appearance.dark;holder.row.background=appearance.pressable(appearance.bottomLine(),0f,appearance.alpha(appearance.text,0x14))}
            holder.time.setTextColor(appearance.secondary);holder.source.setTextColor(appearance.secondary);holder.message.setTextColor(appearance.text)
            holder.time.text=dateFormat.format(java.util.Date(entry.optLong("timestamp")))
            holder.level.text=logLevels.firstOrNull{it.first==level}?.second ?: level;holder.level.setTextColor(levelColor(level));holder.level.typeface=appearance.weight(if(level=="debug")400 else 700)
            holder.source.text=entry.str("source").ifBlank{"应用"};holder.message.text=entry.optString("message")
            holder.row.contentDescription="${holder.level.text}，${holder.source.text}，${holder.message.text}"
        }
    }
    private class LogHolder(val row:LinearLayout,val time:TextView,val level:TextView,val source:TextView,val message:TextView):RecyclerView.ViewHolder(row){
        var entry:JSONObject?=null
        /** Theme the row ground was built for; null until the first bind. */
        var dark:Boolean?=null
    }
}
