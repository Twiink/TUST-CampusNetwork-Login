package com.netmate.app.auth

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkAddress
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.*
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

/** Exercise the production snapshot and HTTP transport with only Android hardware mocked. */
class NetworkRoutingTest {
    private val context = mock(Context::class.java)
    private val manager = mock(ConnectivityManager::class.java)
    private val wifiManager = mock(WifiManager::class.java)
    private val cellular = mock(Network::class.java)
    private val wifi = mock(Network::class.java)
    private var oldSnapshot = WifiEnvironment.snapshotPort

    @Before fun prepare() {
        oldSnapshot = WifiEnvironment.snapshotPort
        WifiEnvironment.snapshotPort = null
        `when`(context.applicationContext).thenReturn(context)
        `when`(context.getSystemService(Context.CONNECTIVITY_SERVICE)).thenReturn(manager)
        `when`(context.getSystemService(Context.WIFI_SERVICE)).thenReturn(wifiManager)
        `when`(wifiManager.isWifiEnabled).thenReturn(true)
        `when`(manager.activeNetwork).thenReturn(cellular)
        val cellularCapabilities = mock(NetworkCapabilities::class.java)
        `when`(cellularCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)).thenReturn(true)
        `when`(cellularCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)).thenReturn(true)
        `when`(manager.getNetworkCapabilities(cellular)).thenReturn(cellularCapabilities)
    }

    @After fun restore() { WifiEnvironment.snapshotPort = oldSnapshot }

    @Suppress("DEPRECATION")
    @Test fun defaultCellularDoesNotHideUnvalidatedWifiOrReplaceItsAddresses() {
        `when`(manager.allNetworks).thenReturn(arrayOf(cellular, wifi))
        val wifiCapabilities = mock(NetworkCapabilities::class.java)
        `when`(wifiCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)).thenReturn(true)
        `when`(wifiCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL)).thenReturn(true)
        `when`(manager.getNetworkCapabilities(wifi)).thenReturn(wifiCapabilities)
        val info = mock(WifiInfo::class.java)
        `when`(info.ssid).thenReturn("\"Campus-portal\"")
        `when`(wifiManager.connectionInfo).thenReturn(info)
        val wifiProperties = mock(LinkProperties::class.java)
        val address = mock(LinkAddress::class.java)
        `when`(address.address).thenReturn(InetAddress.getByName("10.1.2.3"))
        `when`(wifiProperties.linkAddresses).thenReturn(listOf(address))
        `when`(wifiProperties.routes).thenReturn(emptyList())
        `when`(wifiProperties.dnsServers).thenReturn(listOf(InetAddress.getByName("10.1.2.1")))
        `when`(manager.getLinkProperties(wifi)).thenReturn(wifiProperties)

        val snapshot = WifiEnvironment.snapshot(context)
        assertTrue(snapshot.connected)
        assertEquals("Campus-portal", snapshot.ssid)
        assertEquals("10.1.2.3", snapshot.ipv4)
        assertEquals(listOf("10.1.2.1"), snapshot.dns)
        assertSame(wifi, snapshot.network)
        assertFalse(snapshot.validated)
        assertTrue(snapshot.captive)
        assertEquals("10.1.2.3" to null, LocalAddresses.resolve(manager, wifi))
        verify(manager, never()).activeNetwork
        verify(manager, never()).getLinkProperties(cellular)
    }

    @Suppress("DEPRECATION")
    @Test fun validatedCellularAloneDoesNotBecomeAnAssociatedWifi() {
        `when`(manager.allNetworks).thenReturn(arrayOf(cellular))
        val snapshot = WifiEnvironment.snapshot(context)
        assertTrue(snapshot.enabled)
        assertFalse(snapshot.connected)
        assertNull(snapshot.network)
        assertNull(snapshot.ssid)
        assertNull(snapshot.ipv4)
        verify(manager, never()).activeNetwork
        verify(manager, never()).getLinkProperties(cellular)
    }

    @Test fun portalLogoutAndInternetProbeOpenConnectionsOnTheSelectedWifi() {
        val transport = UrlConnectionTransport()
        for (path in listOf("eportal/portal/login", "eportal/portal/logout", "generate_204")) {
            val target = URL("http://127.0.0.1:9/$path")
            val connection = mock(HttpURLConnection::class.java)
            val probe = path == "generate_204"
            `when`(wifi.openConnection(target)).thenReturn(connection)
            `when`(connection.responseCode).thenReturn(if (probe) 204 else 200)
            `when`(connection.inputStream).thenReturn(ByteArrayInputStream("{\"status\":1}".toByteArray()))
            assertEquals(
                (if (probe) 204 else 200) to (if (probe) "" else "{\"status\":1}"),
                transport.get(target.toString(), wifi, 1000, !probe),
            )
            verify(wifi).openConnection(target)
            verify(connection).disconnect()
        }
        verifyNoInteractions(cellular)
    }
}
