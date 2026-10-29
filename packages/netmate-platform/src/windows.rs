#![cfg(target_os = "windows")]
// Windows Native WiFi 实现：WlanOpenHandle + WlanEnumInterfaces + WlanQueryInterface，
// 事件由 WlanRegisterNotification 推送，避免 netsh spawn 与 3s 轮询。
use crate::{Error, NativeNetworkInfo, NativeWifiInfo, NetworkCallback, Result, Status};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_FRIENDLY_NAME,
    GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH,
};
use windows::Win32::NetworkManagement::WiFi::{
    dot11_BSS_type_infrastructure, wlan_interface_state_connected,
    wlan_intf_opcode_current_connection, WlanCloseHandle, WlanEnumInterfaces, WlanFreeMemory,
    WlanGetNetworkBssList, WlanOpenHandle, WlanQueryInterface, WlanRegisterNotification,
    L2_NOTIFICATION_DATA, WLAN_BSS_ENTRY, WLAN_CONNECTION_ATTRIBUTES, WLAN_NOTIFICATION_SOURCE_ALL,
};

static WATCHER: OnceLock<Watcher> = OnceLock::new();
static WATCHING: AtomicBool = AtomicBool::new(false);

struct Watcher {
    callback: NetworkCallback,
}

struct WlanHandle(HANDLE);
impl Drop for WlanHandle {
    fn drop(&mut self) {
        unsafe {
            WlanCloseHandle(self.0, None);
        }
    }
}

fn open_wlan_handle() -> Result<WlanHandle> {
    let mut negotiated_version = 0u32;
    let mut handle = HANDLE::default();
    let result = unsafe { WlanOpenHandle(2, None, &mut negotiated_version, &mut handle) };
    if result != 0 {
        return Err(Error::new(Status::GenericFailure, "WlanOpenHandle failed"));
    }
    Ok(WlanHandle(handle))
}

fn query_connection(
    handle: HANDLE,
    guid: &windows::core::GUID,
) -> Option<WLAN_CONNECTION_ATTRIBUTES> {
    let mut data_size = 0u32;
    let mut data = std::ptr::null_mut();
    let result = unsafe {
        WlanQueryInterface(
            handle,
            guid,
            wlan_intf_opcode_current_connection,
            None,
            &mut data_size,
            &mut data,
            None,
        )
    };
    if data.is_null() {
        return None;
    }
    let attributes =
        if result == 0 && data_size as usize >= std::mem::size_of::<WLAN_CONNECTION_ATTRIBUTES>() {
            Some(unsafe { *data.cast::<WLAN_CONNECTION_ATTRIBUTES>() })
        } else {
            None
        };
    unsafe {
        WlanFreeMemory(data);
    }
    attributes
}

fn decode_connection(attributes: &WLAN_CONNECTION_ATTRIBUTES) -> Option<NativeWifiInfo> {
    if attributes.isState != wlan_interface_state_connected {
        return None;
    }
    let association = &attributes.wlanAssociationAttributes;
    let bytes = association
        .dot11Ssid
        .ucSSID
        .get(..association.dot11Ssid.uSSIDLength as usize)?;
    if bytes.is_empty() {
        return None;
    }
    let security = &attributes.wlanSecurityAttributes;
    let mode = if !security.bSecurityEnabled.as_bool() {
        "Open"
    } else if security.bOneXEnabled.as_bool() {
        "Enterprise"
    } else {
        match security.dot11AuthAlgorithm.0 {
            1 | 2 => "WEP",
            3 | 6 | 8 | 11 => "Enterprise",
            4 | 5 => "WPA",
            7 => "WPA2",
            9 => "WPA3",
            10 => "OWE",
            _ => "Unknown",
        }
    };
    let bssid = association.dot11Bssid;
    Some(NativeWifiInfo {
        ssid: Some(String::from_utf8_lossy(bytes).into_owned()),
        bssid: Some(format!(
            "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
            bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5]
        )),
        rssi: Some((association.wlanSignalQuality.min(100) / 2) as i32 - 100),
        link_speed: Some((association.ulRxRate / 1000) as i32),
        channel: None,
        frequency: None,
        security: Some(mode.into()),
    })
}

fn associated_bss<'a>(
    entries: &'a [WLAN_BSS_ENTRY],
    bssid: &[u8; 6],
) -> Option<&'a WLAN_BSS_ENTRY> {
    entries.iter().find(|entry| entry.dot11Bssid == *bssid)
}

fn channel_from_frequency(frequency: u32) -> Option<i32> {
    match frequency {
        2484 => Some(14),
        2412..=2472 => Some(((frequency - 2407) / 5) as i32),
        5160..=5885 => Some(((frequency - 5000) / 5) as i32),
        5955..=7115 => Some(((frequency - 5950) / 5) as i32),
        _ => None,
    }
}

pub fn current_wifi() -> Option<NativeWifiInfo> {
    let handle = open_wlan_handle().ok()?;
    let mut interface_list = std::ptr::null_mut();
    let result = unsafe { WlanEnumInterfaces(handle.0, None, &mut interface_list) };
    if interface_list.is_null() {
        return None;
    }
    let mut snapshot = None;
    if result == 0 {
        unsafe {
            let list = &*interface_list;
            // Windows returns a variable-length array; indexing its [T; 1] binding
            // would panic on the second wireless adapter.
            let interfaces = std::slice::from_raw_parts(
                list.InterfaceInfo.as_ptr(),
                list.dwNumberOfItems as usize,
            );
            for info in interfaces {
                if info.isState != wlan_interface_state_connected {
                    continue;
                }
                let Some(attributes) = query_connection(handle.0, &info.InterfaceGuid) else {
                    continue;
                };
                let Some(mut wifi) = decode_connection(&attributes) else {
                    continue;
                };
                let association = &attributes.wlanAssociationAttributes;
                let mut bss_list = std::ptr::null_mut();
                let result = WlanGetNetworkBssList(
                    handle.0,
                    &info.InterfaceGuid,
                    Some(&association.dot11Ssid),
                    dot11_BSS_type_infrastructure,
                    attributes.wlanSecurityAttributes.bSecurityEnabled.as_bool(),
                    None,
                    &mut bss_list,
                );
                if !bss_list.is_null() {
                    if result == 0 {
                        let list = &*bss_list;
                        let entries = std::slice::from_raw_parts(
                            list.wlanBssEntries.as_ptr(),
                            list.dwNumberOfItems as usize,
                        );
                        if let Some(entry) = associated_bss(entries, &association.dot11Bssid) {
                            let frequency = entry.ulChCenterFrequency / 1000;
                            wifi.rssi = Some(entry.lRssi);
                            wifi.frequency = Some(frequency as i32);
                            wifi.channel = channel_from_frequency(frequency);
                        }
                    }
                    WlanFreeMemory(bss_list.cast());
                }
                snapshot = Some(wifi);
                break;
            }
        }
    }
    unsafe {
        WlanFreeMemory(interface_list.cast());
    }
    snapshot
}

fn connected_wifi_guid() -> Option<windows::core::GUID> {
    let handle = open_wlan_handle().ok()?;
    let mut list = std::ptr::null_mut();
    let result = unsafe { WlanEnumInterfaces(handle.0, None, &mut list) };
    if list.is_null() {
        return None;
    }
    let guid = if result == 0 {
        let entries = unsafe {
            std::slice::from_raw_parts(
                (*list).InterfaceInfo.as_ptr(),
                (*list).dwNumberOfItems as usize,
            )
        };
        entries
            .iter()
            .find(|info| {
                info.isState == wlan_interface_state_connected
                    && query_connection(handle.0, &info.InterfaceGuid)
                        .and_then(|connection| decode_connection(&connection))
                        .is_some()
            })
            .map(|info| info.InterfaceGuid)
    } else {
        None
    };
    unsafe {
        WlanFreeMemory(list.cast());
    }
    guid
}

fn matches_wifi_adapter(name: &str, guid: &windows::core::GUID) -> bool {
    name.trim_matches(&['{', '}'][..])
        .eq_ignore_ascii_case(&format!("{guid:?}"))
}

pub fn network_info() -> Option<NativeNetworkInfo> {
    adapter_addresses(&connected_wifi_guid()?)
}

fn adapter_addresses(wifi_guid: &windows::core::GUID) -> Option<NativeNetworkInfo> {
    let mut size = 0u32;
    let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_FRIENDLY_NAME;
    unsafe {
        GetAdaptersAddresses(0, flags, None, None, &mut size);
    }
    let mut buffer = vec![0u8; size as usize];
    let result = unsafe {
        GetAdaptersAddresses(
            0,
            flags,
            None,
            Some(buffer.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>()),
            &mut size,
        )
    };
    if result != 0 {
        return None;
    }

    adapter_info(buffer.as_ptr().cast(), wifi_guid)
}

fn adapter_info(
    mut cursor: *const IP_ADAPTER_ADDRESSES_LH,
    wifi_guid: &windows::core::GUID,
) -> Option<NativeNetworkInfo> {
    while !cursor.is_null() {
        let adapter = unsafe { &*cursor };
        cursor = adapter.Next;
        if adapter.AdapterName.0.is_null() {
            continue;
        }
        let name =
            unsafe { std::ffi::CStr::from_ptr(adapter.AdapterName.0.cast()) }.to_string_lossy();
        if !matches_wifi_adapter(&name, wifi_guid) {
            continue;
        }

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

        return Some(NativeNetworkInfo {
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
    None
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

pub fn watch_network(callback: NetworkCallback) -> Result<bool> {
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
            handle.0,
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
    std::mem::forget(handle);
    Ok(true)
}

unsafe extern "system" fn wlan_notification_callback(
    _notification: *mut L2_NOTIFICATION_DATA,
    context: *mut core::ffi::c_void,
) {
    let watcher = context.cast::<Watcher>().as_ref();
    if let Some(watcher) = watcher {
        (watcher.callback)();
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    use windows::Win32::NetworkManagement::WiFi::{DOT11_AUTH_ALGORITHM, WLAN_SECURITY_ATTRIBUTES};

    #[test]
    fn wifi_adapter_uses_wlan_guid_and_does_not_borrow_vpn_addresses() {
        use windows::core::{GUID, PSTR};
        use windows::Win32::NetworkManagement::IpHelper::IP_ADAPTER_UNICAST_ADDRESS_LH;
        use windows::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};
        let guid = GUID::from_u128(0x00112233_4455_6677_8899_aabbccddeeff);
        let mut wifi_name = b"{00112233-4455-6677-8899-aabbccddeeff}\0".to_vec();
        let mut vpn_name = b"{11112233-4455-6677-8899-aabbccddeeff}\0".to_vec();
        let mut wifi_ip = SOCKADDR_IN {
            sin_family: AF_INET,
            ..Default::default()
        };
        wifi_ip.sin_addr.S_un.S_addr = u32::from_ne_bytes([192, 168, 5, 10]);
        let mut vpn_ip = SOCKADDR_IN {
            sin_family: AF_INET,
            ..Default::default()
        };
        vpn_ip.sin_addr.S_un.S_addr = u32::from_ne_bytes([10, 88, 0, 2]);
        let mut wifi_address = IP_ADAPTER_UNICAST_ADDRESS_LH::default();
        wifi_address.Address.lpSockaddr = (&mut wifi_ip as *mut SOCKADDR_IN).cast();
        let mut vpn_address = IP_ADAPTER_UNICAST_ADDRESS_LH::default();
        vpn_address.Address.lpSockaddr = (&mut vpn_ip as *mut SOCKADDR_IN).cast();
        let mut wifi = IP_ADAPTER_ADDRESSES_LH {
            AdapterName: PSTR(wifi_name.as_mut_ptr()),
            FirstUnicastAddress: &mut wifi_address,
            ..Default::default()
        };
        let mut vpn = IP_ADAPTER_ADDRESSES_LH {
            AdapterName: PSTR(vpn_name.as_mut_ptr()),
            FirstUnicastAddress: &mut vpn_address,
            Next: &mut wifi,
            ..Default::default()
        };
        assert_eq!(
            adapter_info(&vpn, &guid).unwrap().ipv4.as_deref(),
            Some("192.168.5.10")
        );
        wifi.FirstUnicastAddress = std::ptr::null_mut();
        vpn.Next = &mut wifi;
        assert!(adapter_info(&vpn, &guid).unwrap().ipv4.is_none());
    }

    #[test]
    fn connection_identity_uses_sdk_layout_and_preserves_ssid() {
        assert_eq!(
            std::mem::offset_of!(WLAN_CONNECTION_ATTRIBUTES, wlanAssociationAttributes),
            520
        );
        let mut attributes = WLAN_CONNECTION_ATTRIBUTES {
            isState: wlan_interface_state_connected,
            ..Default::default()
        };
        attributes.wlanAssociationAttributes.dot11Ssid.uSSIDLength = 8;
        attributes.wlanAssociationAttributes.dot11Ssid.ucSSID[..8].copy_from_slice(b" Campus ");
        attributes.wlanAssociationAttributes.dot11Bssid = [1, 2, 3, 4, 5, 6];
        attributes.wlanSecurityAttributes = WLAN_SECURITY_ATTRIBUTES {
            bSecurityEnabled: true.into(),
            dot11AuthAlgorithm: DOT11_AUTH_ALGORITHM(9),
            ..Default::default()
        };
        let snapshot = decode_connection(&attributes).unwrap();
        assert_eq!(snapshot.ssid.as_deref(), Some(" Campus "));
        assert_eq!(snapshot.bssid.as_deref(), Some("01:02:03:04:05:06"));
        assert_eq!(snapshot.security.as_deref(), Some("WPA3"));
        attributes.wlanAssociationAttributes.dot11Ssid.uSSIDLength = 33;
        assert!(decode_connection(&attributes).is_none());
    }

    #[test]
    fn authentication_modes_distinguish_personal_enterprise_and_open() {
        let mut attributes = WLAN_CONNECTION_ATTRIBUTES {
            isState: wlan_interface_state_connected,
            ..Default::default()
        };
        attributes.wlanAssociationAttributes.dot11Ssid.uSSIDLength = 1;
        attributes.wlanAssociationAttributes.dot11Ssid.ucSSID[0] = b'x';
        for (algorithm, expected) in [
            (1, "WEP"),
            (7, "WPA2"),
            (9, "WPA3"),
            (6, "Enterprise"),
            (8, "Enterprise"),
            (10, "OWE"),
        ] {
            attributes.wlanSecurityAttributes.bSecurityEnabled = true.into();
            attributes.wlanSecurityAttributes.dot11AuthAlgorithm = DOT11_AUTH_ALGORITHM(algorithm);
            assert_eq!(
                decode_connection(&attributes).unwrap().security.as_deref(),
                Some(expected)
            );
        }
        attributes.wlanSecurityAttributes.bSecurityEnabled = false.into();
        assert_eq!(
            decode_connection(&attributes).unwrap().security.as_deref(),
            Some("Open")
        );
    }

    #[test]
    fn bss_details_follow_associated_bssid_instead_of_first_scan_entry() {
        let other = WLAN_BSS_ENTRY {
            dot11Bssid: [9; 6],
            ulChCenterFrequency: 2412000,
            ..Default::default()
        };
        let actual = WLAN_BSS_ENTRY {
            dot11Bssid: [1; 6],
            ulChCenterFrequency: 5180000,
            ..Default::default()
        };
        let entries = [other, actual];
        assert_eq!(
            associated_bss(&entries, &[1; 6])
                .unwrap()
                .ulChCenterFrequency,
            5180000
        );
        assert!(associated_bss(&entries, &[2; 6]).is_none());
        assert_eq!(channel_from_frequency(5180), Some(36));
        assert_eq!(channel_from_frequency(5955), Some(1));
    }
}
