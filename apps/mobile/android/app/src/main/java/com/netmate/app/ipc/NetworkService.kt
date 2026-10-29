package com.netmate.app.ipc
import android.app.Service
import android.content.*
import android.os.IBinder
import android.os.RemoteCallbackList
import android.net.wifi.WifiManager
import androidx.core.content.ContextCompat
import com.netmate.app.auth.*
import com.netmate.app.logging.NetMateLogs
import com.netmate.app.update.NativeUpdater
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.*
import java.io.File

class NetworkService : Service() {
    private val worker = ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, ArrayBlockingQueue(16))
    private val scanner = ThreadPoolExecutor(1,1,15,TimeUnit.SECONDS,SynchronousQueue<Runnable>()).apply { allowCoreThreadTimeOut(true) }
    private val io = ThreadPoolExecutor(1,1,15,TimeUnit.SECONDS,ArrayBlockingQueue<Runnable>(4)).apply { allowCoreThreadTimeOut(true) }
    private val logRevision = java.util.concurrent.atomic.AtomicLong()
    private val logListener: (JSONObject) -> Unit = { logRevision.incrementAndGet(); publish() }
    private val listeners = RemoteCallbackList<IEvents>()
    private val config by lazy { Configuration(this) }
    private lateinit var updater: NativeUpdater
    private val stateListener: (JSONObject) -> Unit = { publish() }
    private val resultListener: (AutoAuthResult) -> Unit = { publish() }
    private val progressListener: (JSONObject) -> Unit = { publish() }
    override fun onCreate() { super.onCreate(); NetMateLogs.initialize(this); NetMateLogs.listeners.add(logListener); updater=NativeUpdater(this); AutoAuthEngine.statusListeners.add(stateListener); AutoAuthEngine.addListener(resultListener); ReconnectEvents.listeners.add(progressListener) }
    private fun snapshot(): JSONObject {
        val w=WifiEnvironment.snapshot(this)
        return AutoAuthEngine.snapshot(this,w).put("version",1).put("logRevision",logRevision.get()).put("progress",ReconnectEvents.latest).put("network",JSONObject().put("ssid",w.ssid).put("bssid",w.bssid).put("ipv4",w.ipv4).put("ipv6",w.ipv6).put("security",w.security).put("signal",w.signal).put("frequency",w.frequency).put("channel",WifiFacts.channel(w.frequency ?: 0)).put("linkSpeed",w.linkSpeed).put("gateway",w.gateway).put("dns",JSONArray(w.dns)))
    }
    @Synchronized private fun publish() { if(listeners.registeredCallbackCount==0)return;val value=runCatching{snapshot().toString()}.getOrNull() ?: return;val count=listeners.beginBroadcast();try{for(i in 0 until count)runCatching{listeners.getBroadcastItem(i).changed(value)}}finally{listeners.finishBroadcast()} }
    private val binder=object:INetwork.Stub(){
        override fun request(message:String,callback:IResult){
            if(message.toByteArray().size>256*1024){callback.complete(JSONObject().put("error","请求过大").toString());return}
            val request = try { JSONObject(message) } catch (_:Exception) { callback.complete(JSONObject().put("error","请求格式无效").toString()); return }
            val op=request.optString("op")
            val executor=when(op) { "scan" -> scanner; "logs","export_logs","clear_logs","update_check","update_install","update_download","update_state","update_cancel" -> io; else -> worker }
            try { executor.execute {
                val response=try { require(request.optInt("version",1)==1); JSONObject().put("result",dispatch(op,request.optJSONObject("args") ?: JSONObject())) }
                catch(e:Exception) { JSONObject().put("error",com.netmate.app.logging.LogJournal.safe(e.message ?: "操作失败，请重试")) }
                runCatching { callback.complete(response.toString()) }
            } } catch(_:RejectedExecutionException) { runCatching { callback.complete(JSONObject().put("error",if(op=="scan") "WiFi 正在扫描" else "后台繁忙，请稍后重试").toString()) } }
        }
        override fun subscribe(callback:IEvents){
            listeners.register(callback)
            // Snapshot collection involves system services. Never hold the UI's
            // Binder caller while collecting it, and let config requests run first.
            try{worker.execute{if(listeners.registeredCallbackCount>0)runCatching{callback.changed(snapshot().toString())}}}
            catch(_:RejectedExecutionException){listeners.unregister(callback)}
        }
        override fun unsubscribe(callback:IEvents){listeners.unregister(callback)}
    }
    private fun dispatch(op:String,args:JSONObject):Any=when(op){
        "snapshot"->snapshot()
        "config"->config.publicData()
        "save_config"->config.save(args)
        "login"->{config.pause(false);AutoAuthEngine.checkAsync(this,AutoAuthEngine.TRIGGER_MANUAL);true}
        "logout"->{config.pause(true);AutoAuthEngine.logoutAsync(this);true}
        "retry"->{AutoAuthEngine.retryNow(this);true}
        "stop_recovery"->{AutoAuthEngine.stopReconnect(this);true}
        "scan"->scan()
        "connect"->{
            val profile=AutoAuthStore.loadProfile(this) ?: error("请先保存配置")
            val rule=profile.wifiRules.firstOrNull{it.id==args.getString("id")} ?: error("WiFi 配置不存在")
            AutoAuthEngine.beginManualConnection(this)
            AutoAuthEngine.runConnection{try{WifiSuggestions.select(this,rule);check(WifiConnector.connect(this,rule.ssid,rule.password,rule.security,rule.bssid,ruleId=rule.id)){"系统未接受连接请求"};ReconnectEvents.publish(JSONObject().put("status","awaiting-system").put("ssid",rule.ssid).put("reason","等待系统选择目标 WiFi，请在 WiFi 设置中确认"))}catch(e:Exception){ReconnectEvents.publish(JSONObject().put("status","failed").put("reason",e.message))}finally{AutoAuthEngine.endManualConnection(this)}};true
        }
        "logs"->NetMateLogs.queryHistory(this,args)
        "clear_logs"->NetMateLogs.clear(this).also{logRevision.incrementAndGet();publish()}
        "export_logs"->{val directory=File(cacheDir,"exports");directory.mkdirs();directory.listFiles()?.forEach(File::delete);val format=args.optString("format","text");val file=File(directory,"netmate-${System.currentTimeMillis()}.${if(format=="json")"json" else "txt"}");file.bufferedWriter().use{NetMateLogs.export(this,args.optJSONObject("query") ?: JSONObject(),format,it)};JSONObject().put("path",file.absolutePath)}
        "update_check"->updater.check() ?: JSONObject().put("state","current")
        "update_download"->updater.start()
        "update_state"->updater.state()
        "update_cancel"->updater.cancel()
        "update_install"->updater.install()
        else->error("未知操作")
    }
    @Suppress("MissingPermission","DEPRECATION")private fun scan():JSONArray{
        val wifi=applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val done=CountDownLatch(1);var updated=false
        val receiver=object:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){updated=intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED,false);done.countDown()}}
        ContextCompat.registerReceiver(this,receiver,IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),ContextCompat.RECEIVER_NOT_EXPORTED)
        try{require(wifi.startScan()){"系统暂时限制扫描，请稍后重试并确认定位服务已开启"};require(done.await(15,TimeUnit.SECONDS)&&updated){"扫描超时或结果未更新"};return JSONArray().apply{wifi.scanResults.filter{it.SSID.isNotBlank()}.distinctBy{Triple(it.SSID,it.BSSID,it.capabilities)}.sortedByDescending{it.level}.take(256).forEach{put(JSONObject().put("ssid",it.SSID).put("bssid",it.BSSID).put("security",WifiSecurity.normalize(it.capabilities)).put("frequency",it.frequency).put("rssi",it.level))}}}finally{unregisterReceiver(receiver)}
    }
    override fun onBind(intent:Intent?):IBinder=binder
    override fun onDestroy(){listeners.kill();worker.shutdownNow();scanner.shutdownNow();io.shutdownNow();NetMateLogs.listeners.remove(logListener);AutoAuthEngine.statusListeners.remove(stateListener);AutoAuthEngine.removeListener(resultListener);ReconnectEvents.listeners.remove(progressListener);super.onDestroy()}
}
