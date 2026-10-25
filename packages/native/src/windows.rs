#![cfg(target_os = "windows")]
// Windows Native WiFi 实现：WlanOpenHandle + WlanEnumInterfaces + WlanQueryInterface，
// 事件由 WlanRegisterNotification 推送，避免 netsh spawn 与 3s 轮询。
use crate::{NativeNetworkInfo, NativeWifiInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ErrorStrategy;
use napi::threadsafe_function::ThreadsafeFunction;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_FRIENDLY_NAME,
    GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH,
};
use windows::Win32::NetworkManagement::WiFi::{
    dot11_BSS_type_infrastructure, wlan_interface_state_connected,
    wlan_intf_opcode_current_connection, WlanEnumInterfaces, WlanGetNetworkBssList, WlanOpenHandle,
    WlanQueryInterface, WlanRegisterNotification, L2_NOTIFICATION_DATA,
    WLAN_NOTIFICATION_SOURCE_ALL,
};

static WATCHER: OnceLock<Watcher> = OnceLock::new();
static WATCHING: AtomicBool = AtomicBool::new(false);

struct Watcher {
    callback: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled>,
}

fn open_wlan_handle() -> Result<HANDLE> {
    let mut negotiated_version = 0u32;
    let mut handle = HANDLE::default();
    let result = unsafe { WlanOpenHandle(2, None, &mut negotiated_version, &mut handle) };
    if result != 0 {
        return Err(Error::new(Status::GenericFailure, "WlanOpenHandle failed"));
    }
    Ok(handle)
}

fn query_connection_ssid(handle: HANDLE, guid: *const u8) -> Option<String> {
    let mut data_size = 0u32;
    let mut data = std::ptr::null_mut();
    let mut opcode_type = Default::default();
    let result = unsafe {
        WlanQueryInterface(
            handle,
            guid as *const _,
            wlan_intf_opcode_current_connection,
            None,
            &mut data_size,
            &mut data,
            Some(&mut opcode_type),
        )
    };
    if result != 0 || data.is_null() {
        return None;
    }
    // WLAN_CONNECTION_ATTRIBUTES 布局： isState(4) + strProfileName[WLAN_MAX_NAME_LENGTH=256]wchar
    // + wlanAssociationAttributes + wlanSecurityAttributes
    // SSID 位于 assocAttributes dot11Ssid（4 字节长度 + 32 字节缓冲）。
    let base = data.cast::<u8>();
    unsafe {
        let assoc_offset = 4 + 256 * 2;
        let ssid_len_ptr = base.add(assoc_offset) as *const u32;
        let len = *ssid_len_ptr as usize;
        if len == 0 || len > 32 {
            windows::Win32::NetworkManagement::WiFi::WlanFreeMemory(base.cast());
            return None;
        }
        let bytes = std::slice::from_raw_parts(base.add(assoc_offset + 4), len);
        let ssid = String::from_utf8_lossy(bytes).trim().to_string();
        windows::Win32::NetworkManagement::WiFi::WlanFreeMemory(base.cast());
        Some(ssid).filter(|s| !s.is_empty())
    }
}

pub fn current_wifi() -> Option<NativeWifiInfo> {
    let handle = open_wlan_handle().ok()?;
    let mut interface_list = std::ptr::null_mut();
    let result = unsafe { WlanEnumInterfaces(handle, None, &mut interface_list) };
    if result != 0 || interface_list.is_null() {
        return None;
    }
    unsafe {
        let list = &*interface_list;
        for index in 0..list.dwNumberOfItems as usize {
            let info = &list.InterfaceInfo[index];
            if info.isState != wlan_interface_state_connected {
                continue;
            }
            let guid_ptr = &info.InterfaceGuid as *const _ as *const u8;
            let ssid = query_connection_ssid(handle, guid_ptr);
            if ssid.is_none() {
                continue;
            }

            // BSS 列表包含 RSSI/信道/频率/链路速率。
            let mut bss_list = std::ptr::null_mut();
            if WlanGetNetworkBssList(
                handle,
                &info.InterfaceGuid,
                None,
                dot11_BSS_type_infrastructure,
                false,
                None,
                &mut bss_list,
            ) == 0
                && !bss_list.is_null()
            {
                let bss = &*bss_list;
                if bss.dwNumberOfItems > 0 {
                    let entry = &bss.wlanBssEntries[0];
                    let out = NativeWifiInfo {
                        ssid,
                        bssid: Some(format!(
                            "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                            entry.dot11Bssid[0],
                            entry.dot11Bssid[1],
                            entry.dot11Bssid[2],
                            entry.dot11Bssid[3],
                            entry.dot11Bssid[4],
                            entry.dot11Bssid[5]
                        )),
                        rssi: Some(entry.lRssi),
                        link_speed: None,
                        channel: Some(((entry.ulChCenterFrequency / 1000 - 2407) / 5) as i32),
                        frequency: Some((entry.ulChCenterFrequency / 1000) as i32),
                        security: None,
                    };
                    windows::Win32::NetworkManagement::WiFi::WlanFreeMemory(interface_list.cast());
                    windows::Win32::NetworkManagement::WiFi::WlanFreeMemory(bss_list.cast());
                    return Some(out);
                }
            }
        }
        windows::Win32::NetworkManagement::WiFi::WlanFreeMemory(interface_list.cast());
    }
    None
}

pub fn network_info() -> Option<NativeNetworkInfo> {
    adapter_addresses()
        .and_then(|info| (info.ipv4.is_some() || info.ipv6.is_some()).then_some(info))
}

fn adapter_addresses() -> Option<NativeNetworkInfo> {
    let mut size = 0u32;
    let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_FRIENDLY_NAME;
    unsafe {
        GetAdaptersAddresses(2, flags, None, None, &mut size);
    }
    let mut buffer = vec![0u8; size as usize];
    let result = unsafe {
        GetAdaptersAddresses(
            2,
            flags,
            None,
            Some(buffer.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>()),
            &mut size,
        )
    };
    if result != 0 {
        return None;
    }

    let mut best_metric = u32::MAX;
    let mut selected = None;
    let mut cursor = buffer.as_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
    while !cursor.is_null() {
        let adapter = unsafe { &*cursor };
        cursor = adapter.Next;

        let mut ipv4 = None;
        let mut ipv6 = None;
        let mut subnet_mask = None;
        let mut unicast = adapter.FirstUnicastAddress;
        while !unicast.is_null() {
            let address = unsafe { &*unicast };
            unicast = address.Next;
            if let Some(text) = format_sockaddr(address.Address.lpSockaddr.cast()) {
                if text.contains(':') && ipv6.is_none() {
                    ipv6 = Some(text);
                } else if !text.contains(':') && ipv4.is_none() {
                    ipv4 = Some(text);
                    subnet_mask = Some(prefix_to_mask(address.OnLinkPrefixLength));
                }
            }
        }

        let mut dns = Vec::new();
        let mut dns_cursor = adapter.FirstDnsServerAddress;
        while !dns_cursor.is_null() {
            let server = unsafe { &*dns_cursor };
            dns_cursor = server.Next;
            if let Some(text) = format_sockaddr(server.Address.lpSockaddr.cast()) {
                if !dns.contains(&text) {
                    dns.push(text);
                }
            }
        }
        let mut gateway = None;
        let mut gateway_cursor = adapter.FirstGatewayAddress;
        while !gateway_cursor.is_null() {
            let server = unsafe { &*gateway_cursor };
            gateway_cursor = server.Next;
            if let Some(text) = format_sockaddr(server.Address.lpSockaddr.cast()) {
                if !text.contains(':') {
                    gateway = Some(text);
                    break;
                }
            }
        }

        if ipv4.is_some() && adapter.Ipv4Metric < best_metric {
            best_metric = adapter.Ipv4Metric;
            selected = Some(NativeNetworkInfo {
                ipv4,
                ipv6,
                mac: (adapter.PhysicalAddressLength >= 6).then(|| {
                    format!(
                        "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                        adapter.PhysicalAddress[0],
                        adapter.PhysicalAddress[1],
                        adapter.PhysicalAddress[2],
                        adapter.PhysicalAddress[3],
                        adapter.PhysicalAddress[4],
                        adapter.PhysicalAddress[5]
                    )
                }),
                gateway,
                dns: (!dns.is_empty()).then_some(dns),
                subnet_mask,
            });
        }
    }
    selected
}

fn format_sockaddr(
    address: *const windows::Win32::Networking::WinSock::SOCKADDR,
) -> Option<String> {
    if address.is_null() {
        return None;
    }
    unsafe {
        let family = (*address).sa_family;
        if family == windows::Win32::Networking::WinSock::AF_INET {
            let addr = &*(address.cast::<windows::Win32::Networking::WinSock::SOCKADDR_IN>());
            let bytes = addr.sin_addr.S_un.S_un_b;
            Some(format!(
                "{}.{}.{}.{}",
                bytes.s_b1, bytes.s_b2, bytes.s_b3, bytes.s_b4
            ))
        } else if family == windows::Win32::Networking::WinSock::AF_INET6 {
            let addr = &*(address.cast::<windows::Win32::Networking::WinSock::SOCKADDR_IN6>());
            let groups: Vec<String> = addr
                .sin6_addr
                .u
                .Byte
                .chunks(2)
                .map(|pair| format!("{:x}", u16::from_be_bytes([pair[0], pair[1]])))
                .collect();
            Some(groups.join(":"))
        } else {
            None
        }
    }
}

fn prefix_to_mask(prefix: u8) -> String {
    let mask = if prefix == 0 {
        0
    } else {
        u32::MAX << (32 - prefix as u32)
    };
    mask.to_be_bytes()
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(".")
}

pub fn watch_network(
    callback: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled>,
) -> Result<bool> {
    if WATCHING.swap(true, Ordering::SeqCst) {
        return Ok(true);
    }

    let handle = match open_wlan_handle() {
        Ok(handle) => handle,
        Err(err) => {
            WATCHING.store(false, Ordering::SeqCst);
            return Err(err);
        }
    };

    let watcher = WATCHER.get_or_init(|| Watcher {
        callback: callback.clone(),
    });
    let context: *const Watcher = watcher;
    let mut notification_handle = 0u32;
    let result = unsafe {
        WlanRegisterNotification(
            handle,
            WLAN_NOTIFICATION_SOURCE_ALL,
            true,
            Some(wlan_notification_callback),
            Some(context.cast()),
            None,
            Some(&mut notification_handle),
        )
    };
    if result != 0 {
        WATCHING.store(false, Ordering::SeqCst);
        return Ok(false);
    }

    // 句柄与注册需要存活到进程结束；napi 模块无卸载场景，泄漏是刻意的生命周期管理。
    let _ = (handle, notification_handle);
    Ok(true)
}

unsafe extern "system" fn wlan_notification_callback(
    _notification: *mut L2_NOTIFICATION_DATA,
    context: *mut core::ffi::c_void,
) {
    let watcher = context.cast::<Watcher>().as_ref();
    if let Some(watcher) = watcher {
        watcher.callback.call(
            Ok(()),
            napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking,
        );
    }
}
