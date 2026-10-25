// Linux nl80211 快照实现：常量来自内核 UAPI（ABI 稳定），避免 bindgen 依赖。
use crate::{NativeNetworkInfo, NativeWifiInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunction;
use std::sync::atomic::{AtomicBool, Ordering};

const NETLINK_GENERIC: i32 = 16;
const AF_NETLINK: i32 = 16;
const SOCK_RAW: i32 = 3;
const SOCK_CLOEXEC: i32 = 0o2000000;
const NLMSG_DONE: u16 = 3;
const NLM_F_REQUEST: u16 = 0x01;
const NLM_F_DUMP: u16 = 0x300;
const GENL_ID_CTRL: u16 = 0x10;
const CTRL_CMD_GETFAMILY: u8 = 3;
const CTRL_ATTR_FAMILY_ID: u16 = 1;
const CTRL_ATTR_FAMILY_NAME: u16 = 2;
const CTRL_ATTR_MCAST_GROUPS: u16 = 7;
const CTRL_ATTR_MCAST_GRP_NAME: u16 = 1;
const CTRL_ATTR_MCAST_GRP_ID: u16 = 2;
const NL80211_MCGRP_MLME: &str = "mlme";
const NL80211_MCGRP_SCAN: &str = "scan";

const CMD_GET_INTERFACE: u8 = 5;
const CMD_NEW_INTERFACE: u8 = 7;
const CMD_GET_STATION: u8 = 17;
const CMD_NEW_STATION: u8 = 19;
const CMD_GET_SCAN: u8 = 32;
const CMD_NEW_SCAN_RESULTS: u8 = 34;
const ATTR_IFINDEX: u16 = 3;
const ATTR_IFTYPE: u16 = 5;
const ATTR_MAC: u16 = 6;
const ATTR_STA_INFO: u16 = 21;
const ATTR_BSS: u16 = 47;
const BSS_BSSID: u16 = 1;
const BSS_FREQUENCY: u16 = 2;
const BSS_INFORMATION_ELEMENTS: u16 = 6;
const BSS_STATUS: u16 = 9;
const BSS_STATUS_ASSOCIATED: u32 = 1;
const STA_INFO_SIGNAL: u16 = 7;
const STA_INFO_TX_BITRATE: u16 = 8;
const RATE_INFO_BITRATE32: u16 = 5;
const IFTYPE_STATION: u32 = 2;

#[repr(C)]
struct SockaddrNl {
  nl_family: u16,
  nl_pad: u16,
  nl_pid: u32,
  nl_groups: u32,
}

#[repr(C, packed)]
struct NlMsgHdr {
  len: u32,
  typ: u16,
  flags: u16,
  seq: u32,
  pid: u32,
}

static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

struct Socket {
  fd: i32,
}

impl Drop for Socket {
  fn drop(&mut self) {
    unsafe { libc::close(self.fd) };
  }
}

fn open_socket() -> Result<Socket> {
  let fd = unsafe { libc::socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, NETLINK_GENERIC) };
  if fd < 0 {
    return Err(Error::new(Status::GenericFailure, "failed to create netlink socket"));
  }
  let addr = SockaddrNl { nl_family: AF_NETLINK as u16, nl_pad: 0, nl_pid: 0, nl_groups: 0 };
  let timeout = libc::timeval { tv_sec: 0, tv_usec: 100_000 };
  unsafe {
    libc::setsockopt(
      fd,
      libc::SOL_SOCKET,
      libc::SO_RCVTIMEO,
      &timeout as *const libc::timeval as *const libc::c_void,
      std::mem::size_of::<libc::timeval>() as u32,
    );
  }
  let ret = unsafe {
    libc::bind(
      fd,
      &addr as *const SockaddrNl as *const libc::sockaddr,
      std::mem::size_of::<SockaddrNl>() as u32,
    )
  };
  if ret < 0 {
    unsafe { libc::close(fd) };
    return Err(Error::new(Status::GenericFailure, "failed to bind netlink socket"));
  }
  Ok(Socket { fd })
}

fn push_attr(buf: &mut Vec<u8>, typ: u16, value: &[u8]) {
  let len = 4 + value.len();
  buf.extend_from_slice(&(len as u16).to_ne_bytes());
  buf.extend_from_slice(&typ.to_ne_bytes());
  buf.extend_from_slice(value);
  while buf.len() % 4 != 0 {
    buf.push(0);
  }
}

fn build_genl(buf: &mut [u8], family: u16, cmd: u8, attrs: &[(u16, Vec<u8>)], dump: bool) -> Result<usize> {
  let mut payload = Vec::new();
  payload.extend_from_slice(&[cmd, 1, 0, 0]);
  for (typ, value) in attrs {
    push_attr(&mut payload, *typ, value);
  }
  let total = 16 + payload.len();
  if total > buf.len() {
    return Err(Error::new(Status::GenericFailure, "netlink message too large"));
  }
  let flags = if dump { NLM_F_REQUEST | NLM_F_DUMP } else { NLM_F_REQUEST };
  let hdr = NlMsgHdr { len: total as u32, typ: family, flags, seq: 1, pid: std::process::id() };
  unsafe {
    std::ptr::copy_nonoverlapping(
      &hdr as *const NlMsgHdr as *const u8,
      buf.as_mut_ptr(),
      std::mem::size_of::<NlMsgHdr>(),
    );
  }
  buf[16..total].copy_from_slice(&payload);
  Ok(total)
}

fn recv_until_done(fd: i32, out: &mut Vec<u8>) -> Result<()> {
  let mut chunk = [0u8; 16384];
  loop {
    let n = unsafe { libc::recv(fd, chunk.as_mut_ptr() as *mut libc::c_void, chunk.len(), 0) };
    if n < 0 {
      let errno = unsafe { *libc::__errno_location() };
      if errno == libc::EAGAIN || errno == libc::EWOULDBLOCK {
        break;
      }
      return Err(Error::new(Status::GenericFailure, "netlink recv failed"));
    }
    if n == 0 {
      break;
    }
    let n = n as usize;
    let start = out.len();
    out.extend_from_slice(&chunk[..n]);

    let mut off = 0;
    let mut done = false;
    while off + 16 <= out.len() {
      let hdr_len = u32::from_ne_bytes([out[off], out[off + 1], out[off + 2], out[off + 3]]) as usize;
      let typ = u16::from_ne_bytes([out[off + 4], out[off + 5]]);
      if hdr_len == 0 || off + hdr_len > out.len() {
        break;
      }
      if typ == NLMSG_DONE {
        done = true;
      }
      off += hdr_len;
    }
    let _ = start;
    if done || out.len() >= 1024 * 1024 {
      break;
    }
  }
  Ok(())
}

fn send_and_recv(fd: i32, buf: &mut [u8], len: usize, out: &mut Vec<u8>) -> Result<()> {
  let ret = unsafe { libc::send(fd, buf.as_ptr() as *const libc::c_void, len, 0) };
  if ret < 0 {
    return Err(Error::new(Status::GenericFailure, "netlink send failed"));
  }
  recv_until_done(fd, out)
}

fn ctrl_get_family(fd: i32) -> Result<(u16, Vec<u8>)> {
  let mut payload = vec![CTRL_CMD_GETFAMILY, 1, 0, 0];
  push_attr(&mut payload, CTRL_ATTR_FAMILY_NAME, b"nl80211\0");

  let mut buf = [0u8; 1024];
  let total = 16 + payload.len();
  if total > buf.len() {
    return Err(Error::new(Status::GenericFailure, "ctrl message too large"));
  }
  let hdr = NlMsgHdr { len: total as u32, typ: GENL_ID_CTRL, flags: NLM_F_REQUEST, seq: 1, pid: std::process::id() };
  unsafe {
    std::ptr::copy_nonoverlapping(
      &hdr as *const NlMsgHdr as *const u8,
      buf.as_mut_ptr(),
      std::mem::size_of::<NlMsgHdr>(),
    );
  }
  buf[16..total].copy_from_slice(&payload);

  let mut out = Vec::with_capacity(4096);
  send_and_recv(fd, &mut buf, total, &mut out)?;
  Ok((0, out))
}

fn parse_attrs(data: &[u8], f: &mut dyn FnMut(u16, &[u8])) {
  let mut off = 0;
  while off + 4 <= data.len() {
    let len = u16::from_ne_bytes([data[off], data[off + 1]]) as usize;
    let typ = u16::from_ne_bytes([data[off + 2], data[off + 3]]);
    if len < 4 || off + len > data.len() {
      break;
    }
    f(typ, &data[off + 4..off + len]);
    off += (len + 3) & !3;
  }
}

fn parse_msgs(buf: &[u8], family: u16, mut handler: impl FnMut(u8, &[u8])) {
  let mut off = 0;
  while off + 20 <= buf.len() {
    let msg_len = u32::from_ne_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]]) as usize;
    let typ = u16::from_ne_bytes([buf[off + 4], buf[off + 5]]);
    if msg_len == 0 || off + msg_len > buf.len() {
      break;
    }
    if typ == family && msg_len >= 20 {
      let cmd = buf[off + 16];
      handler(cmd, &buf[off + 20..off + msg_len]);
    }
    off += msg_len;
  }
}

fn format_mac(data: &[u8]) -> Option<String> {
  if data.len() < 6 {
    return None;
  }
  Some(format!(
    "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
    data[0], data[1], data[2], data[3], data[4], data[5]
  ))
}

fn channel_from_freq(freq: u32) -> i32 {
  match freq {
    2484 => 14,
    2412..=2472 => ((freq - 2412) / 5 + 1) as i32,
    5160..=5885 => ((freq - 5000) / 5) as i32,
    5955..=7115 => ((freq - 5950) / 5) as i32,
    _ => 0,
  }
}

fn parse_security_from_ies(ies: &[u8]) -> Option<String> {
  // 遍历 beacon IE：类型 48=RSN，221=vendor（微软 WPA）
  let mut off = 0;
  let mut parts: Vec<&str> = Vec::new();
  while off + 2 <= ies.len() {
    let typ = ies[off];
    let len = ies[off + 1] as usize;
    if off + 2 + len > ies.len() {
      break;
    }
    let body = &ies[off + 2..off + 2 + len];
    if typ == 48 {
      parts.push("WPA2");
    } else if typ == 221 && body.len() >= 6 && &body[..6] == b"\x00\x50\xf2\x01\x01\x00" {
      parts.push("WPA");
    }
    off += 2 + len;
  }
  if parts.is_empty() {
    None
  } else {
    Some(parts.join("/"))
  }
}

pub fn current_wifi() -> Option<NativeWifiInfo> {
  wifi_snapshot().ok()
}

pub fn network_info() -> Option<NativeNetworkInfo> {
  // 网关/DNS 属于 NetworkManager/route 语义，nmcli fallback 已能提供更完整结果。
  None
}

pub fn watch_network(
  callback: ThreadsafeFunction<(), napi::threadsafe_function::ErrorStrategy::CalleeHandled>,
) -> Result<bool> {
  if WATCHER_STARTED.swap(true, Ordering::SeqCst) {
    return Ok(true);
  }

  let groups = match resolve_mcast_groups() {
    Some(groups) => groups,
    None => {
      WATCHER_STARTED.store(false, Ordering::SeqCst);
      return Ok(false);
    }
  };

  std::thread::spawn(move || {
    if let Err(_err) = watch_mlme_events(&groups, &callback) {
      WATCHER_STARTED.store(false, Ordering::SeqCst);
    }
  });
  Ok(true)
}

fn watch_mlme_events(
  groups: &[u32],
  callback: &ThreadsafeFunction<(), napi::threadsafe_function::ErrorStrategy::CalleeHandled>,
) -> Result<()> {
  let fd = unsafe { libc::socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, NETLINK_GENERIC) };
  if fd < 0 {
    return Err(Error::new(Status::GenericFailure, "failed to create watcher socket"));
  }
  // 与 iw 一致：先 bind 单播地址，再通过 NETLINK_ADD_MEMBERSHIP 加入组播组。
  let addr = SockaddrNl { nl_family: AF_NETLINK as u16, nl_pad: 0, nl_pid: 0, nl_groups: 0 };
  let ret = unsafe {
    libc::bind(
      fd,
      &addr as *const SockaddrNl as *const libc::sockaddr,
      std::mem::size_of::<SockaddrNl>() as u32,
    )
  };
  if ret < 0 {
    unsafe { libc::close(fd) };
    return Err(Error::new(Status::GenericFailure, "failed to bind watcher socket"));
  }
  for group in groups {
    let membership: u32 = *group;
    let ret = unsafe {
      libc::setsockopt(
        fd,
        libc::SOL_NETLINK,
        libc::NETLINK_ADD_MEMBERSHIP,
        &membership as *const u32 as *const libc::c_void,
        std::mem::size_of::<u32>() as u32,
      )
    };
    if ret < 0 {
      unsafe { libc::close(fd) };
      return Err(Error::new(Status::GenericFailure, "failed to subscribe nl80211 group"));
    }
  }

  let callback = callback.clone();
  let mut buf = [0u8; 16384];
  loop {
    let n = unsafe { libc::recv(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len(), 0) };
    if n <= 0 {
      if n < 0 {
        let errno = unsafe { *libc::__errno_location() };
        if errno == libc::EINTR {
          continue;
        }
        if errno == libc::EAGAIN || errno == libc::EWOULDBLOCK {
          continue;
        }
      }
      break;
    }

    // 组播没有 NLMSG_DONE；任何 nl80211 mlme 通知都触发一次去抖回调。
    callback.call(Ok(()), napi::threadsafe_function::ThreadsafeFunctionCallMode::Blocking);
  }

  unsafe { libc::close(fd) };
  Ok(())
}

fn resolve_mcast_groups() -> Option<Vec<u32>> {
  let sock = open_socket().ok()?;
  let (_, out) = ctrl_get_family(sock.fd).ok()?;
  let mut groups = Vec::new();
  // CTRL 响应一条 netlink 消息：先跳过 nlmsghdr(16)+genlmsghdr(4) 再遍历属性。
  let mut off = 20;
  while off + 4 <= out.len() {
    let len = u16::from_ne_bytes([out[off], out[off + 1]]) as usize;
    let typ = u16::from_ne_bytes([out[off + 2], out[off + 3]]);
    if len < 4 || off + len > out.len() {
      break;
    }
    if typ == CTRL_ATTR_MCAST_GROUPS {
      parse_attrs(&out[off + 4..off + len], &mut |_grp_typ, grp| {
        let mut name = None;
        let mut id = None;
        parse_attrs(grp, &mut |t, d| {
          if t == CTRL_ATTR_MCAST_GRP_NAME {
            name = std::str::from_utf8(d).ok().map(|s| s.trim_matches('\0').to_string());
          } else if t == CTRL_ATTR_MCAST_GRP_ID && d.len() >= 4 {
            id = Some(u32::from_ne_bytes([d[0], d[1], d[2], d[3]]));
          }
        });
        match name.as_deref() {
          Some(NL80211_MCGRP_MLME) | Some(NL80211_MCGRP_SCAN) => {
            if let Some(id) = id {
              groups.push(id);
            }
          }
          _ => {}
        }
      });
    }
    off += (len + 3) & !3;
  }
  if groups.is_empty() { None } else { Some(groups) }
}

fn wifi_snapshot() -> Result<NativeWifiInfo> {
  let sock = open_socket()?;
  let (_, family_raw) = ctrl_get_family(sock.fd)?;
  let mut family_id = None;
  parse_attrs(&family_raw[20..], &mut |typ, data| {
    if typ == CTRL_ATTR_FAMILY_ID && data.len() >= 2 {
      family_id = Some(u16::from_ne_bytes([data[0], data[1]]));
    }
  });
  let family_id = family_id
    .ok_or_else(|| Error::new(Status::GenericFailure, "nl80211 family not found"))?;

  // 1) 找 station 接口
  let mut buf = [0u8; 512];
  let mut interfaces = Vec::with_capacity(8192);
  let len = build_genl(&mut buf, family_id, CMD_GET_INTERFACE, &[], true)?;
  send_and_recv(sock.fd, &mut buf, len, &mut interfaces)?;

  let mut ifindex = None;
  let mut if_mac = None;
  parse_msgs(&interfaces, family_id, |cmd, attrs| {
    if cmd != CMD_NEW_INTERFACE {
      return;
    }
    let mut idx = None;
    let mut iftype = 0u32;
    let mut mac = None;
    parse_attrs(attrs, &mut |typ, data| match typ {
      ATTR_IFINDEX if data.len() >= 4 => {
        idx = Some(u32::from_ne_bytes([data[0], data[1], data[2], data[3]]))
      }
      ATTR_IFTYPE if data.len() >= 4 => {
        iftype = u32::from_ne_bytes([data[0], data[1], data[2], data[3]])
      }
      ATTR_MAC => mac = format_mac(data),
      _ => {}
    });
    if iftype == IFTYPE_STATION {
      ifindex = idx;
      if_mac = mac;
    }
  });

  let ifindex = ifindex.ok_or_else(|| Error::new(Status::GenericFailure, "no station interface"))?;
  let _ = if_mac;

  // 2) GET_SCAN：找 associated BSS
  let mut scan_buf = [0u8; 512];
  let mut scan_out = Vec::with_capacity(65536);
  let len = build_genl(
    &mut scan_buf,
    family_id,
    CMD_GET_SCAN,
    &[(ATTR_IFINDEX, ifindex.to_ne_bytes().to_vec())],
    true,
  )?;
  send_and_recv(sock.fd, &mut scan_buf, len, &mut scan_out)?;

  let mut ssid = None;
  let mut bssid = None;
  let mut frequency = None;
  let mut channel = None;
  let mut security = None;
  let mut bss_found = false;
  parse_msgs(&scan_out, family_id, |cmd, attrs| {
    if cmd != CMD_GET_SCAN && cmd != CMD_NEW_SCAN_RESULTS {
      return;
    }
    parse_attrs(attrs, &mut |typ, data| {
      if typ != ATTR_BSS {
        return;
      }
      let mut status = 0u32;
      let mut cur_bssid = None;
      let mut cur_ssid = None;
      let mut cur_freq = None;
      let mut cur_security = None;
      parse_attrs(data, &mut |btyp, bdata| match btyp {
        BSS_STATUS if bdata.len() >= 4 => {
          status = u32::from_ne_bytes([bdata[0], bdata[1], bdata[2], bdata[3]])
        }
        BSS_BSSID => cur_bssid = format_mac(bdata),
        BSS_FREQUENCY if bdata.len() >= 4 => {
          let f = u32::from_ne_bytes([bdata[0], bdata[1], bdata[2], bdata[3]]);
          cur_freq = Some(f);
        }
        BSS_INFORMATION_ELEMENTS => {
          cur_security = parse_security_from_ies(bdata);
          let mut off = 0;
          while off + 2 <= bdata.len() {
            let ie = bdata[off];
            let ie_len = bdata[off + 1] as usize;
            if off + 2 + ie_len > bdata.len() {
              break;
            }
            if ie == 0 {
              let text = String::from_utf8_lossy(&bdata[off + 2..off + 2 + ie_len])
                .trim()
                .to_string();
              cur_ssid = if text.is_empty() { None } else { Some(text) };
            }
            off += 2 + ie_len;
          }
        }
        _ => {}
      });
      if status == BSS_STATUS_ASSOCIATED {
        bss_found = true;
        bssid = cur_bssid;
        ssid = cur_ssid;
        if let Some(f) = cur_freq {
          frequency = Some(f as i32);
          channel = Some(channel_from_freq(f));
        }
        security = cur_security;
      }
    });
  });

  // 3) GET_STATION：RSSI 与速率。AP MAC 从 scan 结果来。
  let mut rssi = None;
  let mut link_speed = None;
  if let Some(ap_mac) = bssid.as_ref().map(|s| {
    s.split(':')
      .filter_map(|b| u8::from_str_radix(b, 16).ok())
      .collect::<Vec<u8>>()
  }) {
    if ap_mac.len() == 6 {
      let mut sta_buf = [0u8; 256];
      let mut sta_out = Vec::with_capacity(4096);
      let attrs = vec![
        (ATTR_IFINDEX, ifindex.to_ne_bytes().to_vec()),
        (ATTR_MAC, ap_mac),
      ];
      if let Ok(len) = build_genl(&mut sta_buf, family_id, CMD_GET_STATION, &attrs, false) {
        let _ = send_and_recv(sock.fd, &mut sta_buf, len, &mut sta_out);
        parse_msgs(&sta_out, family_id, |cmd, attrs| {
          if cmd != CMD_NEW_STATION {
            return;
          }
          parse_attrs(attrs, &mut |typ, data| {
            if typ == ATTR_STA_INFO {
              parse_attrs(data, &mut |styp, sdata| match styp {
                STA_INFO_SIGNAL if !sdata.is_empty() => rssi = Some((sdata[0] as i8) as i32),
                STA_INFO_TX_BITRATE => parse_attrs(sdata, &mut |rtyp, rdata| {
                  if rtyp == RATE_INFO_BITRATE32 && rdata.len() >= 4 {
                    link_speed = Some(
                      u32::from_ne_bytes([rdata[0], rdata[1], rdata[2], rdata[3]]) as i32 / 10,
                    );
                  }
                }),
                _ => {}
              });
            }
          });
        });
      }
    }
  }

  if !bss_found && ssid.is_none() {
    return Err(Error::new(Status::GenericFailure, "no associated BSS"));
  }

  Some(NativeWifiInfo {
    ssid,
    bssid,
    rssi,
    link_speed,
    channel,
    frequency,
    security,
  })
  .ok_or_else(|| Error::new(Status::GenericFailure, "no wifi"))
}
