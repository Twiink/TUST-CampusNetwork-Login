package com.netmate.app.auth

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * 解析认证用的本机 IPv4/IPv6（对齐参考实现 tust-portal-cli 的 LocalAddresses）。
 * 优先取 WiFi 网络 LinkProperties 上的地址，避免拿到移动数据(rmnet)/VPN(tun) 网卡的 IP；
 * 取不到时回退到接口枚举。IPv4 优先 10.x（认证服务器位于 10.x 内网），
 * IPv6 优先全局单播地址，排除回环、链路本地与站点本地地址。
 */
object LocalAddresses {

    fun resolve(connectivityManager: ConnectivityManager, network: Network? = null): Pair<String?, String?> {
        val wifiAddresses = wifiLinkAddresses(connectivityManager, network)
        val fallbackAddresses by lazy { if (network != null) emptyList() else interfaceAddresses() }

        val ipv4 = selectIPv4(wifiAddresses) ?: selectIPv4(fallbackAddresses)
        val ipv6 = selectIPv6(wifiAddresses) ?: selectIPv6(fallbackAddresses)
        return Pair(ipv4, ipv6)
    }

    /** 当前所有 WiFi 网络（通常只有一个） */
    fun wifiNetworks(connectivityManager: ConnectivityManager): List<Network> {
        return try {
            // allNetworks 在 API 31 标记弃用但仍可用；minSdk 24 下无等价替代
            @Suppress("DEPRECATION")
            connectivityManager.allNetworks.filter { network ->
                connectivityManager.getNetworkCapabilities(network)
                    ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun wifiLinkAddresses(connectivityManager: ConnectivityManager, network: Network?): List<InetAddress> {
        val networks = if (network != null) listOf(network) else wifiNetworks(connectivityManager)
        return try {
            networks.flatMap { candidate ->
                connectivityManager.getLinkProperties(candidate)?.linkAddresses
                    ?.map { it.address }
                    ?: emptyList()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun interfaceAddresses(): List<InetAddress> {
        val result = mutableListOf<InetAddress>()
        val interfaces = NetworkInterface.getNetworkInterfaces() ?: return result
        while (interfaces.hasMoreElements()) {
            val networkInterface = interfaces.nextElement()
            if (!networkInterface.isUp || networkInterface.isLoopback) continue
            result.addAll(networkInterface.inetAddresses.toList())
        }
        return result
    }

    fun selectIPv4(addresses: List<InetAddress>): String? {
        val candidates = addresses.filterIsInstance<Inet4Address>().filter {
            !it.isLoopbackAddress && !it.isAnyLocalAddress && !it.isLinkLocalAddress
        }
        val preferred = candidates.firstOrNull { (it.address[0].toInt() and 0xff) == 10 }
        return (preferred ?: candidates.firstOrNull())?.hostAddress
    }

    fun selectIPv6(addresses: List<InetAddress>): String? {
        val candidates = addresses.filterIsInstance<Inet6Address>().filter {
            !it.isLoopbackAddress && !it.isAnyLocalAddress &&
                !it.isLinkLocalAddress && !it.isSiteLocalAddress
        }
        // 2000::/3 为全局单播；ULA(fc00::/7) 仅作兜底
        val preferred = candidates.firstOrNull { (it.address[0].toInt() and 0xe0) == 0x20 }
        return (preferred ?: candidates.firstOrNull())?.hostAddress?.substringBefore('%')
    }
}
