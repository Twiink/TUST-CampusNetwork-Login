package com.netmate.app.ipc
import android.content.*
import android.os.IBinder
import android.os.Process
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
@RunWith(AndroidJUnit4::class)
class NetworkServiceIntegrationTest {
    @Test fun binderSnapshotAndConfigurationNeverExposePasswords() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val connected = CountDownLatch(1); var service: INetwork? = null
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) { service = INetwork.Stub.asInterface(binder); connected.countDown() }
            override fun onServiceDisconnected(name: ComponentName) { service = null }
        }
        assertTrue(context.bindService(Intent(context, NetworkService::class.java), connection, Context.BIND_AUTO_CREATE))
        try {
            assertTrue(connected.await(10, TimeUnit.SECONDS))
            for (op in listOf("config", "snapshot")) {
                val done = CountDownLatch(1); var response = ""
                service!!.request(JSONObject().put("version", 1).put("op", op).toString(), object : IResult.Stub() { override fun complete(value: String) { response = value; done.countDown() } })
                assertTrue(done.await(10, TimeUnit.SECONDS)); val result = JSONObject(response)
                assertFalse(result.has("error")); assertFalse(response.contains("\"password\":"))
            }
        } finally { context.unbindService(connection) }
    }
}
