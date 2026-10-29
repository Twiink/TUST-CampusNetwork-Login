use super::*;
use std::sync::Arc;
use windows::{
    Win32::{Foundation::HANDLE, NetworkManagement::WiFi::*},
    core::PCWSTR,
};
#[derive(Clone)]
pub struct Platform {
    connection: std::sync::Arc<tokio::sync::Mutex<()>>,
}
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            WlanCloseHandle(self.0, None);
        }
    }
}
struct ScanDone {
    done: std::sync::Mutex<Option<bool>>,
    wake: std::sync::Condvar,
}
unsafe extern "system" fn scan_done(
    data: *mut L2_NOTIFICATION_DATA,
    context: *mut std::ffi::c_void,
) {
    if data.is_null() || context.is_null() {
        return;
    }
    let data = unsafe { &*data };
    if data.NotificationCode == wlan_notification_acm_scan_complete.0 as u32
        || data.NotificationCode == wlan_notification_acm_scan_fail.0 as u32
    {
        let state = unsafe { &*context.cast::<ScanDone>() };
        *state.done.lock().unwrap() =
            Some(data.NotificationCode == wlan_notification_acm_scan_complete.0 as u32);
        state.wake.notify_one();
    }
}
fn refresh_scan(h: HANDLE, guid: &windows::core::GUID) -> Result<()> {
    let done = Box::new(ScanDone {
        done: std::sync::Mutex::new(None),
        wake: std::sync::Condvar::new(),
    });
    let context = std::ptr::from_ref(done.as_ref()).cast::<std::ffi::c_void>();
    let code = unsafe {
        WlanRegisterNotification(
            h,
            WLAN_NOTIFICATION_SOURCE_ACM,
            false,
            Some(scan_done),
            Some(context),
            None,
            None,
        )
    };
    if code != 0 {
        anyhow::bail!("无线扫描监听失败，错误 {code}")
    }
    let scan = unsafe { WlanScan(h, guid, None, None, None) };
    let result = if scan == 0 {
        let (value, _) = done
            .wake
            .wait_timeout_while(
                done.done.lock().unwrap(),
                std::time::Duration::from_secs(15),
                |value| value.is_none(),
            )
            .unwrap();
        match *value {
            Some(true) => Ok(()),
            Some(false) => Err(anyhow::anyhow!("系统无线扫描失败")),
            None => Err(anyhow::anyhow!("系统无线扫描超时")),
        }
    } else {
        Err(anyhow::anyhow!("系统未接受扫描，错误 {scan}"))
    };
    // Unregister waits for callbacks to finish before the boxed context is released.
    unsafe {
        WlanRegisterNotification(
            h,
            WLAN_NOTIFICATION_SOURCE_NONE,
            true,
            None,
            None,
            None,
            None,
        );
    }
    result
}
fn handle() -> Result<Handle> {
    let mut h = HANDLE::default();
    let mut version = 0;
    let result = unsafe { WlanOpenHandle(2, None, &mut version, &mut h) };
    if result != 0 {
        anyhow::bail!("无法访问无线服务，错误 {result}")
    }
    Ok(Handle(h))
}
fn interface(h: HANDLE) -> Result<windows::core::GUID> {
    let mut list = std::ptr::null_mut();
    let result = unsafe { WlanEnumInterfaces(h, None, &mut list) };
    if result != 0 || list.is_null() {
        anyhow::bail!("无法枚举无线网卡")
    };
    let guid = unsafe {
        if (*list).dwNumberOfItems == 0 {
            WlanFreeMemory(list.cast());
            anyhow::bail!("没有无线网卡")
        }
        let guid = (*list).InterfaceInfo[0].InterfaceGuid;
        WlanFreeMemory(list.cast());
        guid
    };
    Ok(guid)
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
impl Platform {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            connection: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        })
    }
    pub async fn watch(&self, events: tokio::sync::mpsc::Sender<()>) -> Result<()> {
        if netmate_platform::windows::watch_network(Arc::new(move || {
            let _ = events.try_send(());
        }))? {
            std::future::pending().await
        } else {
            anyhow::bail!("无线事件监听不可用")
        }
    }
    pub async fn notify(&self, title: &str, message: &str) {
        crate::win_tray::notify(title, message);
    }
    pub fn autostart(&self, enabled: bool) -> Result<()> {
        use windows::Win32::System::Registry::*;
        use windows::core::w;
        unsafe {
            let mut key = HKEY::default();
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
                Some(0),
                None,
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                None,
                &mut key,
                None,
            )
            .ok()?;
            let result = if enabled {
                let value = wide(&format!(
                    "\"{}\" --background",
                    std::env::current_exe()?.display()
                ));
                RegSetValueExW(
                    key,
                    w!("NetMateNative"),
                    Some(0),
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        value.as_ptr().cast(),
                        value.len() * 2,
                    )),
                )
                .ok()
            } else {
                let _ = RegDeleteValueW(key, w!("NetMateNative"));
                Ok(())
            };
            RegCloseKey(key).ok()?;
            result?;
        }
        Ok(())
    }
}
impl Wifi for Platform {
    async fn snapshot(&self) -> Result<Network> {
        tokio::task::spawn_blocking(|| -> Result<Network> {
            let mut network = super::native_snapshot();
            let handle = handle()?;
            let guid = interface(handle.0)?;
            let mut size = 0;
            let mut data = std::ptr::null_mut();
            let code = unsafe {
                WlanQueryInterface(
                    handle.0,
                    &guid,
                    wlan_intf_opcode_radio_state,
                    None,
                    &mut size,
                    &mut data,
                    None,
                )
            };
            if code == 0
                && !data.is_null()
                && size as usize >= std::mem::size_of::<WLAN_RADIO_STATE>()
            {
                unsafe {
                    let radio = &*data.cast::<WLAN_RADIO_STATE>();
                    network.enabled = radio.PhyRadioState
                        [..(radio.dwNumberOfPhys as usize).min(64)]
                        .iter()
                        .any(|p| {
                            p.dot11SoftwareRadioState == dot11_radio_state_on
                                && p.dot11HardwareRadioState == dot11_radio_state_on
                        });
                }
            }
            if !data.is_null() {
                unsafe {
                    WlanFreeMemory(data);
                }
            }
            Ok(network)
        })
        .await?
    }
    async fn scan(&self) -> Result<Vec<Network>> {
        tokio::task::spawn_blocking(|| -> Result<Vec<Network>> {
            let h = handle()?;
            let guid = interface(h.0)?;
            refresh_scan(h.0, &guid)?;
            let mut result = std::ptr::null_mut();
            let code = unsafe { WlanGetAvailableNetworkList(h.0, &guid, 0, None, &mut result) };
            if code != 0 || result.is_null() {
                anyhow::bail!("附近网络查询失败，错误 {code}")
            }
            let mut output = vec![];
            unsafe {
                let entries = std::slice::from_raw_parts(
                    (*result).Network.as_ptr(),
                    (*result).dwNumberOfItems.min(256) as usize,
                );
                for item in entries {
                    let bytes =
                        &item.dot11Ssid.ucSSID[..(item.dot11Ssid.uSSIDLength as usize).min(32)];
                    if bytes.is_empty() {
                        continue;
                    }
                    output.push(Network {
                        enabled: true,
                        ssid: Some(String::from_utf8_lossy(bytes).into_owned()),
                        security: Some(
                            if !item.bSecurityEnabled.as_bool() {
                                "Open"
                            } else if item.dot11DefaultAuthAlgorithm == DOT11_AUTH_ALGO_WPA3_SAE {
                                "WPA3"
                            } else if item.dot11DefaultAuthAlgorithm == DOT11_AUTH_ALGO_RSNA
                                || item.dot11DefaultAuthAlgorithm == DOT11_AUTH_ALGO_WPA
                            {
                                "Enterprise"
                            } else if item.bSecurityEnabled.as_bool() {
                                "WPA2"
                            } else {
                                "Open"
                            }
                            .into(),
                        ),
                        rssi: Some(item.wlanSignalQuality as i32 / 2 - 100),
                        ..Network::default()
                    });
                }
                WlanFreeMemory(result.cast());
            }
            Ok(output)
        })
        .await?
    }
    async fn connect(&self, rule: &WifiRule) -> Result<()> {
        let rule = rule.clone();
        // Move the guard into the OS call: aborting the waiter cannot release it early.
        let serial = self.connection.clone().lock_owned().await;
        tokio::task::spawn_blocking(move || -> Result<()> {
            let _serial = serial;
            let handle=handle()?;
            let guid=interface(handle.0)?;
            let open=netmate_core::model::security(rule.security.as_deref().unwrap_or("Open"))=="open";
            let mut profile_name=format!("NetMate-{}",rule.id);
            let mut existing=false;
            if rule.password.is_empty() && !open {
                let mut list=std::ptr::null_mut();
                let code=unsafe { WlanGetAvailableNetworkList(handle.0,&guid,0,None,&mut list) };
                if code==0 && !list.is_null() {
                    unsafe {
                        for network in std::slice::from_raw_parts((*list).Network.as_ptr(),(*list).dwNumberOfItems.min(256)as usize) {
                            let length=(network.dot11Ssid.uSSIDLength as usize).min(32);
                            if &network.dot11Ssid.ucSSID[..length]==rule.ssid.as_bytes() && network.strProfileName[0]!=0 {
                                let length=network.strProfileName.iter().position(|v|*v==0).unwrap_or(256);
                                profile_name=String::from_utf16_lossy(&network.strProfileName[..length]);existing=true;break;
                            }
                        }
                        WlanFreeMemory(list.cast());
                    }
                }
                if !existing { anyhow::bail!("此网络没有可用的系统配置，请输入密码或在系统 WiFi 设置中连接") }
            }
            if !existing {
                let auth=if open {"open"} else if rule.security.as_deref()==Some("WPA3") {"WPA3SAE"} else {"WPA2PSK"};
                let encryption=if open {"none"} else {"AES"};
                let shared=if open {String::new()} else {format!("<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey>",xml(&rule.password))};
                let document=format!(r#"<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>{}</name><SSIDConfig><SSID><name>{}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>{auth}</authentication><encryption>{encryption}</encryption><useOneX>false</useOneX></authEncryption>{shared}</security></MSM></WLANProfile>"#,xml(&profile_name),xml(&rule.ssid));
                let document=wide(&document);let mut reason=0;
                let code=unsafe {WlanSetProfile(handle.0,&guid,WLAN_PROFILE_USER,PCWSTR(document.as_ptr()),None,true,None,&mut reason)};
                if code!=0 {anyhow::bail!("保存无线配置失败，错误 {code}/{reason}")}
            }
            let profile=wide(&profile_name);
            let mut bssids=DOT11_BSSID_LIST::default();
            if let Some(bssid)=&rule.bssid {
                let bytes:Vec<u8>=bssid.split(':').map(|part|u8::from_str_radix(part,16)).collect::<std::result::Result<_,_>>()?;
                if bytes.len()!=6 {anyhow::bail!("BSSID 格式无效")}
                bssids.Header.Type=128;bssids.Header.Revision=1;bssids.Header.Size=std::mem::size_of::<DOT11_BSSID_LIST>()as u16;
                bssids.uNumOfEntries=1;bssids.uTotalNumOfEntries=1;bssids.BSSIDs.copy_from_slice(&bytes);
            }
            let parameters=WLAN_CONNECTION_PARAMETERS{wlanConnectionMode:wlan_connection_mode_profile,strProfile:PCWSTR(profile.as_ptr()),pDesiredBssidList:if rule.bssid.is_some(){&mut bssids}else{std::ptr::null_mut()},dot11BssType:dot11_BSS_type_infrastructure,..Default::default()};
            let code=unsafe{WlanConnect(handle.0,&guid,&parameters,None)};
            if code!=0 {anyhow::bail!("无线连接请求失败，错误 {code}")}
            Ok(())
        }).await?
    }
}
