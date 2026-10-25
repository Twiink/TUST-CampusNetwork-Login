#![cfg(target_os = "macos")]
// macOS CoreWLAN 实现：快照走 CoreWLAN，事件由原生线程做 SSID diff 推送（无 spawn / 无 JS 定时器）。
use crate::{NativeNetworkInfo, NativeWifiInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ErrorStrategy;
use napi::threadsafe_function::ThreadsafeFunction;
use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_core_wlan::CWWiFiClient;
use std::collections::HashMap;
use std::fs;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::atomic::{AtomicBool, Ordering};

static WATCHING: AtomicBool = AtomicBool::new(false);

const AF_INET_MACOS: u8 = 2;
const AF_INET6_MACOS: u8 = 30;
const AF_LINK_MACOS: u8 = 18;
const RTF_UP: i32 = 0x1;
const RTF_GATEWAY: i32 = 0x2;
const RTAX_DST: i32 = 0;
const RTAX_GATEWAY: i32 = 1;
const RTA_DST: i32 = 1;
const RTA_GATEWAY: i32 = 0x2;

fn nsstring_to_string(value: *mut AnyObject) -> Option<String> {
    if value.is_null() {
        return None;
    }
    unsafe {
        let utf8: *const i8 = msg_send![value, UTF8String];
        if utf8.is_null() {
            return None;
        }
        Some(
            std::ffi::CStr::from_ptr(utf8)
                .to_string_lossy()
                .into_owned(),
        )
    }
}

pub fn current_wifi() -> Option<NativeWifiInfo> {
    unsafe {
        let client = CWWiFiClient::sharedWiFiClient();
        let interface_ref = client.interface()?;
        let interface: *mut AnyObject = std::ptr::from_ref(&*interface_ref)
            .cast::<AnyObject>()
            .cast_mut();

        let ssid_obj: *mut AnyObject = msg_send![interface, ssid];
        let ssid = nsstring_to_string(ssid_obj)?;
        if ssid.is_empty() {
            return None;
        }

        let rssi: i32 = msg_send![interface, rssiValue];
        let channel: *mut AnyObject = msg_send![interface, wlanChannel];
        let frequency: i32 = if channel.is_null() {
            0
        } else {
            msg_send![channel, channelFrequency]
        };
        let channel_number: i32 = if channel.is_null() {
            0
        } else {
            msg_send![channel, channelNumber]
        };
        let bssid_obj: *mut AnyObject = msg_send![interface, bssid];
        let security_raw: i64 = msg_send![interface, security];

        Some(NativeWifiInfo {
            ssid: Some(ssid),
            bssid: nsstring_to_string(bssid_obj),
            rssi: Some(rssi),
            link_speed: None,
            channel: if channel_number > 0 {
                Some(channel_number)
            } else {
                None
            },
            frequency: if frequency > 0 { Some(frequency) } else { None },
            security: Some(match security_raw {
                0 => "Open".into(),
                1 => "WEP".into(),
                2 => "WPA".into(),
                3 => "WPA Personal".into(),
                4 => "WPA Enterprise".into(),
                5 => "WPA2".into(),
                6 => "WPA2 Enterprise".into(),
                _ => "Unknown".into(),
            }),
        })
    }
}

pub fn network_info() -> Option<NativeNetworkInfo> {
    let (ipv4, ipv6, mac, subnet_mask) = read_interfaces();
    let gateway = read_default_gateway();
    let dns = read_dns();
    if ipv4.is_none()
        && ipv6.is_none()
        && mac.is_none()
        && gateway.is_none()
        && subnet_mask.is_none()
        && dns.is_empty()
    {
        return None;
    }
    Some(NativeNetworkInfo {
        ipv4,
        ipv6,
        mac,
        gateway,
        dns: (!dns.is_empty()).then_some(dns),
        subnet_mask,
    })
}

struct IfaddrsList {
    ptr: *mut libc::ifaddrs,
}

impl Drop for IfaddrsList {
    fn drop(&mut self) {
        unsafe { libc::freeifaddrs(self.ptr) };
    }
}

#[repr(C)]
struct SockaddrIn {
    sin_family: u8,
    sin_port: u8,
    sin_addr: [u8; 4],
}

#[repr(C)]
struct SockaddrIn6 {
    sin6_family: u8,
    sin6_port: [u8; 2],
    sin6_flowinfo: [u8; 4],
    sin6_addr: [u8; 16],
}

#[repr(C)]
struct SockaddrDl {
    sdl_family: u8,
    sdl_index: u8,
    sdl_type: u8,
    sdl_nlen: u8,
    sdl_alen: u8,
    sdl_slen: u8,
    sdl_data: [u8; 12],
}

fn read_interfaces() -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let mut ptr: *mut libc::ifaddrs = std::ptr::null_mut();
    if unsafe { libc::getifaddrs(&mut ptr) } != 0 || ptr.is_null() {
        return (None, None, None, None);
    }
    let list = IfaddrsList { ptr };

    let mut ipv4 = None;
    let mut ipv6 = None;
    let mut mac = None;
    let mut mac_by_interface: HashMap<String, String> = HashMap::new();
    let mut mask = None;
    let mut selected_name = None;
    let mut cursor = list.ptr;
    while !cursor.is_null() {
        let entry = unsafe { &*cursor };
        cursor = entry.ifa_next;
        let name = if entry.ifa_name.is_null() {
            continue;
        } else {
            unsafe { std::ffi::CStr::from_ptr(entry.ifa_name).to_string_lossy() }
        };
        if name == "lo0" || entry.ifa_addr.is_null() {
            continue;
        }

        let family = unsafe { *entry.ifa_addr }.sa_family;
        if family == AF_INET_MACOS && ipv4.is_none() {
            let addr = unsafe { &*(entry.ifa_addr.cast::<SockaddrIn>()) };
            if addr.sin_addr[0] != 127 {
                ipv4 = Some(Ipv4Addr::from(addr.sin_addr).to_string());
                selected_name = Some(name.clone());
                if !entry.ifa_netmask.is_null() {
                    let netmask = unsafe { &*(entry.ifa_netmask.cast::<SockaddrIn>()) };
                    mask = Some(Ipv4Addr::from(netmask.sin_addr).to_string());
                }
            }
        } else if family == AF_LINK_MACOS {
            let addr = unsafe { &*(entry.ifa_addr.cast::<SockaddrDl>()) };
            let offset = usize::from(addr.sdl_nlen).min(addr.sdl_data.len());
            if addr.sdl_alen >= 6 && offset + 6 <= addr.sdl_data.len() {
                let bytes = &addr.sdl_data[offset..offset + 6];
                mac_by_interface.insert(
                    name.to_string(),
                    format!(
                        "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]
                    ),
                );
            }
        } else if family == AF_INET6_MACOS && ipv6.is_none() {
            let addr = unsafe { &*(entry.ifa_addr.cast::<SockaddrIn6>()) };
            let text = Ipv6Addr::from(addr.sin6_addr).to_string();
            if !text.starts_with("fe80") && text != "::1" {
                ipv6 = Some(text);
            }
        }
    }
    // AF_LINK 条目可能先于 AF_INET 出现；按选中的 IPv4 接口名回查 MAC。
    if let Some(selected) = selected_name {
        mac = mac_by_interface.get(&*selected).cloned();
    }
    (ipv4, ipv6, mac, mask)
}

fn read_default_gateway() -> Option<String> {
    let mut size = 0;
    if unsafe {
        libc::sysctl(
            [libc::CTL_NET, libc::AF_ROUTE, 0, 0, libc::NET_RT_DUMP, 0].as_mut_ptr(),
            6,
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    } != 0
        || size == 0
    {
        return None;
    }

    let mut buffer = vec![0u8; size];
    let result = unsafe {
        libc::sysctl(
            [libc::CTL_NET, libc::AF_ROUTE, 0, 0, libc::NET_RT_DUMP, 0].as_mut_ptr(),
            6,
            buffer.as_mut_ptr().cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if result != 0 {
        return None;
    }
    buffer.truncate(size);
    parse_default_gateway(&buffer)
}

fn parse_default_gateway(bytes: &[u8]) -> Option<String> {
    let mut offset = 0;
    while offset + std::mem::size_of::<libc::rt_msghdr>() <= bytes.len() {
        let header = unsafe { &*(bytes.as_ptr().add(offset) as *const libc::rt_msghdr) };
        let message_len = usize::from(header.rtm_msglen);
        if message_len < std::mem::size_of::<libc::rt_msghdr>()
            || offset + message_len > bytes.len()
        {
            break;
        }

        let flags = header.rtm_flags;
        let addrs = header.rtm_addrs;
        let body = &bytes[offset + std::mem::size_of::<libc::rt_msghdr>()..offset + message_len];
        if flags & RTF_UP != 0
            && flags & RTF_GATEWAY != 0
            && addrs & RTA_DST != 0
            && addrs & RTA_GATEWAY != 0
        {
            let mut cursor = 0;
            let mut is_default = false;
            let mut gateway: Option<String> = None;
            for index in 0..=RTAX_GATEWAY {
                if addrs & (1 << index) == 0 {
                    continue;
                }
                let family = body.get(cursor).copied().unwrap_or(0);
                let len = sockaddr_rounded_len(family);
                let sockaddr = &body.get(cursor..cursor + len)?;
                match index {
                    RTAX_DST => is_default = sockaddr_family_prefix_len(sockaddr) == Some(0),
                    RTAX_GATEWAY => gateway = sockaddr_ipv4(sockaddr),
                    _ => {}
                }
                cursor += len;
            }
            if is_default {
                return gateway;
            }
        }
        offset += message_len;
    }
    None
}

fn sockaddr_rounded_len(family: u8) -> usize {
    let base = match family {
        AF_INET_MACOS => 16,
        AF_INET6_MACOS => 28,
        AF_LINK_MACOS => 20,
        _ if family == 0 => 0,
        _ => std::mem::size_of::<libc::sockaddr>(),
    };
    base.max(4).div_ceil(4) * 4
}

fn sockaddr_family_prefix_len(sockaddr: &[u8]) -> Option<usize> {
    match *sockaddr.first()? {
        AF_INET_MACOS => sockaddr.get(4..8).map(|bytes| {
            u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]).count_ones() as usize
        }),
        AF_INET6_MACOS => sockaddr.get(8..24).map(|bytes| {
            let mut prefix = 0;
            for byte in bytes {
                prefix += byte.count_ones() as usize;
            }
            prefix
        }),
        _ => None,
    }
}

fn sockaddr_ipv4(sockaddr: &[u8]) -> Option<String> {
    if sockaddr.first()? != &AF_INET_MACOS {
        return None;
    }
    let bytes = sockaddr.get(4..8)?;
    let address = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    if address == 0 {
        return None;
    }
    Some(Ipv4Addr::from(address).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_route_message(flags: i32, addrs: i32, dst_mask: u32, gateway: [u8; 4]) -> Vec<u8> {
        let mut message = vec![0u8; std::mem::size_of::<libc::rt_msghdr>()];
        let header = message.as_mut_slice();
        header[2] = libc::RTM_VERSION as u8;
        header[3] = libc::RTM_GET as u8;
        header[8..12].copy_from_slice(&flags.to_ne_bytes());
        header[12..16].copy_from_slice(&addrs.to_ne_bytes());

        let mut dst = vec![0u8; 16];
        dst[0] = AF_INET_MACOS;
        dst[4..8].copy_from_slice(&dst_mask.to_be_bytes());
        message.extend_from_slice(&dst);

        let mut gateway_sockaddr = vec![0u8; 16];
        gateway_sockaddr[0] = AF_INET_MACOS;
        gateway_sockaddr[4..8].copy_from_slice(&gateway);
        message.extend_from_slice(&gateway_sockaddr);

        let len = message.len() as u16;
        message[0..2].copy_from_slice(&len.to_ne_bytes());
        message
    }

    #[test]
    fn parses_default_ipv4_gateway() {
        let mut bytes = make_route_message(
            RTF_UP | RTF_GATEWAY,
            RTA_DST | RTA_GATEWAY,
            0,
            [192, 168, 1, 1],
        );
        bytes.extend_from_slice(&make_route_message(
            RTF_UP | RTF_GATEWAY,
            RTA_DST | RTA_GATEWAY,
            0xffffff00,
            [10, 0, 0, 1],
        ));

        assert_eq!(
            parse_default_gateway(&bytes).as_deref(),
            Some("192.168.1.1")
        );
    }

    #[test]
    fn ignores_subnet_routes_and_non_gateway_routes() {
        let bytes = [
            make_route_message(
                RTF_UP | RTF_GATEWAY,
                RTA_DST | RTA_GATEWAY,
                0xffffff00,
                [10, 0, 0, 1],
            ),
            make_route_message(RTF_UP, RTA_DST, 0, [192, 168, 1, 1]),
        ]
        .concat();

        assert_eq!(parse_default_gateway(&bytes), None);
    }
}

fn read_dns() -> Vec<String> {
    fs::read_to_string("/etc/resolv.conf")
        .ok()
        .map(|content| {
            content
                .lines()
                .filter_map(|line| {
                    let mut parts = line.split_whitespace();
                    if parts.next() != Some("nameserver") {
                        return None;
                    }
                    parts.next().map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn watch_network(
    callback: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled>,
) -> Result<bool> {
    if WATCHING.swap(true, Ordering::SeqCst) {
        return Ok(true);
    }

    // 原生线程内做 CoreWLAN 快照 diff：无进程 spawn、无 JS 定时器/IPC，
    // 仅在 SSID 真正变化时跨一次 JS 边界。快照不可用时返回 false 交给 TS 兜底。
    std::thread::spawn(move || {
        let mut last_ssid: Option<String> = None;
        let mut initialized = false;
        loop {
            let current = current_wifi().and_then(|wifi| wifi.ssid);

            if !initialized {
                last_ssid = current;
                initialized = true;
            } else if current != last_ssid {
                last_ssid = current;
                callback.call(
                    Ok(()),
                    napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking,
                );
            }

            std::thread::sleep(std::time::Duration::from_millis(2000));
        }
    });
    WATCHING.store(true, Ordering::SeqCst);
    Ok(true)
}
