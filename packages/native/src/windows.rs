#![cfg(target_os = "windows")]
// Windows Native WiFi 实现：WlanOpenHandle + WlanEnumInterfaces + WlanQueryInterface，
// 事件由 WlanRegisterNotification 推送，避免 netsh spawn 与 3s 轮询。
use crate::{NativeNetworkInfo, NativeWifiInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ErrorStrategy;
use napi::threadsafe_function::ThreadsafeFunction;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use windows::core::PSTR;
use windows::Win32::Foundation::{HANDLE, WIN32_ERROR};
use windows::Win32::NetworkManagement::WiFi::{
  WlanEnumInterfaces, WlanGetNetworkBssList, WlanOpenHandle, WlanQueryInterface,
  WlanRegisterNotification, WLAN_INTERFACE_STATE_CONNECTED, WLAN_INTF_OPCODE_CURRENT_CONNECTION,
  L2_NOTIFICATION_DATA, WLAN_NOTIFICATION_SOURCE_ALL,
};

static WATCHER: OnceLock<Watcher> = OnceLock::new();
static WATCHING: AtomicBool = AtomicBool::new(false);

struct Watcher {
  callback: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled>,
}

fn open_wlan_handle() -> Result<HANDLE> {
  let mut negotiated_version = 0u32;
  let mut handle = HANDLE::default();
  let result = unsafe {
    WlanOpenHandle(
      2,
      std::ptr::null(),
      &mut negotiated_version,
      &mut handle,
    )
  };
  if result.is_err() {
    return Err(Error::new(Status::GenericFailure, "WlanOpenHandle failed"));
  }
  Ok(handle)
}

fn query_connection_ssid(handle: HANDLE, guid: *const u8) -> Option<String> {
  let mut data_size = 0u32;
  let mut data = PSTR::null();
  let mut opcode_type = Default::default();
  let result = unsafe {
    WlanQueryInterface(
      handle,
      guid as *const _,
      WLAN_INTF_OPCODE_CURRENT_CONNECTION,
      std::ptr::null(),
      &mut data_size,
      &mut data,
      &mut opcode_type,
    )
  };
  if result.is_err() || data.is_null() {
    return None;
  }
  // WLAN_CONNECTION_ATTRIBUTES 布局： isState(4) + strProfileName[WLAN_MAX_NAME_LENGTH=256]wchar
  // + wlanAssociationAttributes + wlanSecurityAttributes
  // SSID 位于 assocAttributes dot11Ssid（4 字节长度 + 32 字节缓冲）。
  let base = data.as_ptr() as *const u8;
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
  let result =
    unsafe { WlanEnumInterfaces(handle, std::ptr::null(), &mut interface_list) };
  if result.is_err() || interface_list.is_null() {
    return None;
  }
  unsafe {
    let list = &*interface_list;
    for index in 0..list.dwNumberOfItems as usize {
      let info = &list.InterfaceInfo[index];
      if info.isState != WLAN_INTERFACE_STATE_CONNECTED {
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
        std::ptr::null(),
        windows::Win32::NetworkManagement::WiFi::DOT11_BSS_TYPE_INFRASTRUCTURE,
        false,
        std::ptr::null(),
        &mut bss_list,
      )
      .is_ok()
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
            link_speed: Some((entry.ulLinkSpeed / 1000) as i32),
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
  // ipconfig fallback 已稳定覆盖中文/英文系统；原生层不重复解析路由/DNS。
  None
}

pub fn watch_network(callback: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled>) -> Result<bool> {
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

  let watcher = WATCHER.get_or_init(|| Watcher { callback: callback.clone() });
  let context: *const Watcher = watcher;
  let mut notification_handle = HANDLE::default();
  let result = unsafe {
    WlanRegisterNotification(
      handle,
      L2_NOTIFICATION_SOURCE_ALL,
      true,
      Some(wlan_notification_callback),
      Some(context.cast()),
      None,
      &mut notification_handle,
    )
  };
  if result != WIN32_ERROR(0) {
    WATCHING.store(false, Ordering::SeqCst);
    return Ok(false);
  }

  // 句柄与注册需要存活到进程结束；napi 模块无卸载场景，泄漏是刻意的生命周期管理。
  std::mem::forget(handle);
  std::mem::forget(notification_handle);
  Ok(true)
}

unsafe extern "system" fn wlan_notification_callback(
  _notification: *mut L2_NOTIFICATION_DATA,
  context: *mut core::ffi::c_void,
) {
  let watcher = context.cast::<Watcher>().as_ref();
  if let Some(watcher) = watcher {
    watcher.callback.call(Ok(()), napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking);
  }
}

