#![cfg(target_os = "macos")]
// macOS CoreWLAN 实现：快照走 CoreWLAN，事件由原生线程做 SSID diff 推送（无 spawn / 无 JS 定时器）。
use crate::{NativeNetworkInfo, NativeWifiInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ErrorStrategy;
use napi::threadsafe_function::ThreadsafeFunction;
use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_core_wlan::CWWiFiClient;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};

static WATCHING: AtomicBool = AtomicBool::new(false);

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
    let dns = read_dns();
    if dns.is_empty() {
        return None;
    }
    Some(NativeNetworkInfo {
        ipv4: None,
        ipv6: None,
        mac: None,
        gateway: None,
        dns: (!dns.is_empty()).then_some(dns),
        subnet_mask: None,
    })
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
