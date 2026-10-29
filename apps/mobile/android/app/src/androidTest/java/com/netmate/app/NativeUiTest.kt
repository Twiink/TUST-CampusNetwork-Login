package com.netmate.app
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import androidx.test.uiautomator.UiScrollable
import androidx.test.uiautomator.UiSelector
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
@RunWith(AndroidJUnit4::class)
class NativeUiTest {
    @Test fun nativeNavigationReopensAndSettingsAreAccessible() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val device = UiDevice.getInstance(instrumentation)
        for (permission in listOf("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION", "android.permission.NEARBY_WIFI_DEVICES", "android.permission.POST_NOTIFICATIONS")) device.executeShellCommand("pm grant ${context.packageName} $permission")
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        assertNotNull(device.wait(Until.findObject(By.desc("运行状态")), 10000))
        val screenshots=java.io.File(context.getExternalFilesDir(null),"native-visual").apply{mkdirs()}
        for((theme,switch,nextSwitch)in listOf(Triple("light","切换至白天模式","切换至黑夜模式"),Triple("dark","切换至黑夜模式","切换至白天模式"))){
            device.findObject(By.desc(switch))?.click()
            assertNotNull(device.wait(Until.findObject(By.desc(nextSwitch)),5000))
            for((page,ready)in listOf("运行状态" to "网络状态","配置设置" to "账号配置","运行日志" to "筛选")){
                device.findObject(By.desc(page)).click()
                assertNotNull(device.wait(Until.findObject(By.text(ready)),5000))
                assertTrue(device.takeScreenshot(java.io.File(screenshots,"$theme-$page.png")))
            }
        }
        device.findObject(By.desc("配置设置")).click()
        assertNotNull(device.wait(Until.findObject(By.text("账号配置")),5000))
        // A theme change must keep the Activity/Binder connection and the current page.
        var activity:android.app.Activity?=null
        instrumentation.runOnMainSync{activity=ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).single()}
        assertTrue(UiScrollable(UiSelector().scrollable(true)).scrollIntoView(UiSelector().description("心跳间隔（秒）")))
        device.findObject(By.desc("心跳间隔（秒）")).text="47"
        device.findObject(By.desc("切换至白天模式")).click()
        assertNotNull(device.wait(Until.findObject(By.desc("切换至黑夜模式")),5000))
        assertEquals("47",device.findObject(By.desc("心跳间隔（秒）")).text)
        instrumentation.runOnMainSync{assertSame(activity,ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).single())}
        repeat(100){
            device.pressHome()
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            assertNotNull(device.wait(Until.findObject(By.desc("配置设置")), 10000))
            assertNotNull(device.wait(Until.findObject(By.scrollable(true)),5000))
            // A rapid Home/reopen can retain the scroll position without stopping
            // the Activity. The first configuration card can be outside the viewport.
            UiScrollable(UiSelector().scrollable(true)).scrollToBeginning(8)
            assertNotNull(device.wait(Until.findObject(By.text("账号配置")), 5000))
            assertNotNull(device.findObject(By.desc("切换至黑夜模式")))
        }
    }
}
