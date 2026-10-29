// Linux nl80211 快照实现：常量来自内核 UAPI（ABI 稳定），避免 bindgen 依赖。
use crate::{NativeNetworkInfo, NativeWifiInfo};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunction;
use std::fs;
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
const BSS_CAPABILITY: u16 = 5;
const BSS_INFORMATION_ELEMENTS: u16 = 6;
const BSS_STATUS: u16 = 9;
const BSS_STATUS_ASSOCIATED: u32 = 1;
const STA_INFO_SIGNAL: u16 = 7;
const STA_INFO_TX_BITRATE: u16 = 8;
const RATE_INFO_BITRATE32: u16 = 5;
const IFTYPE_STATION: u32 = 2;

#[repr(C)]
struct IfaddrsEnvelope {
    next: *mut IfaddrsEnvelope,
    name: *const libc::c_char,
    flags: u32,
    addr: *mut libc::sockaddr,
    netmask: *mut libc::sockaddr,
    dstaddr: *mut libc::sockaddr,
    data: *mut libc::c_void,
}

#[repr(C)]
struct SockaddrIn {
    family: u16,
    port: u16,
    addr: [u8; 4],
    zero: [u8; 8],
}

#[repr(C)]
struct SockaddrIn6 {
    family: u16,
    port: u16,
    flowinfo: u32,
    addr: [u8; 16],
    scope_id: u32,
}

#[repr(C)]
struct SockaddrLl {
    family: u16,
    protocol: u16,
    ifindex: u32,
    hatype: u16,
    pkttype: u8,
    halen: u8,
    addr: [u8; 8],
}

#[repr(C)]
struct RtMsg {
    family: u8,
    dst_len: u8,
    src_len: u8,
    tos: u8,
    table: u8,
    protocol: u8,
    scope: u8,
    kind: u8,
    flags: u32,
}

const RTA_GATEWAY: u16 = 5;
const RTA_PRIORITY: u16 = 6;
const AF_INET: u16 = 2;
const AF_INET6: u16 = 10;
const AF_PACKET: u16 = 17;
const RT_NETLINK: i32 = 0;

struct IfaddrsList {
    ptr: *mut IfaddrsEnvelope,
}

impl Drop for IfaddrsList {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe { libc::freeifaddrs(self.ptr.cast()) };
        }
    }
}

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
        return Err(Error::new(
            Status::GenericFailure,
            "failed to create netlink socket",
        ));
    }
    let addr = SockaddrNl {
        nl_family: AF_NETLINK as u16,
        nl_pad: 0,
        nl_pid: 0,
        nl_groups: 0,
    };
    let timeout = libc::timeval {
        tv_sec: 0,
        tv_usec: 100_000,
    };
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
        return Err(Error::new(
            Status::GenericFailure,
            "failed to bind netlink socket",
        ));
    }
    Ok(Socket { fd })
}

fn push_attr(buf: &mut Vec<u8>, typ: u16, value: &[u8]) {
    let len = 4 + value.len();
    buf.extend_from_slice(&(len as u16).to_ne_bytes());
    buf.extend_from_slice(&typ.to_ne_bytes());
    buf.extend_from_slice(value);
    while !buf.len().is_multiple_of(4) {
        buf.push(0);
    }
}

fn build_genl(
    buf: &mut [u8],
    family: u16,
    cmd: u8,
    attrs: &[(u16, Vec<u8>)],
    dump: bool,
) -> Result<usize> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&[cmd, 1, 0, 0]);
    for (typ, value) in attrs {
        push_attr(&mut payload, *typ, value);
    }
    let total = 16 + payload.len();
    if total > buf.len() {
        return Err(Error::new(
            Status::GenericFailure,
            "netlink message too large",
        ));
    }
    let flags = if dump {
        NLM_F_REQUEST | NLM_F_DUMP
    } else {
        NLM_F_REQUEST
    };
    let hdr = NlMsgHdr {
        len: total as u32,
        typ: family,
        flags,
        seq: 1,
        pid: std::process::id(),
    };
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
            let hdr_len =
                u32::from_ne_bytes([out[off], out[off + 1], out[off + 2], out[off + 3]]) as usize;
            let typ = u16::from_ne_bytes([out[off + 4], out[off + 5]]);
            if hdr_len == 0 || off + hdr_len > out.len() {
                break;
            }
            if typ == NLMSG_DONE {
                done = true;
            }
            off += (hdr_len + 3) & !3;
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
    let hdr = NlMsgHdr {
        len: total as u32,
        typ: GENL_ID_CTRL,
        flags: NLM_F_REQUEST,
        seq: 1,
        pid: std::process::id(),
    };
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
        let msg_len =
            u32::from_ne_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]]) as usize;
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

fn rsn_security(body: &[u8]) -> Option<&'static str> {
    if body.get(..2)? != [1, 0] {
        return None;
    }
    // RSN: version, group cipher, pairwise count/list, AKM count/list.
    let count = u16::from_le_bytes(body.get(6..8)?.try_into().ok()?) as usize;
    let akm_offset = 8usize.checked_add(count.checked_mul(4)?)?;
    let akm_count =
        u16::from_le_bytes(body.get(akm_offset..akm_offset + 2)?.try_into().ok()?) as usize;
    let suites = body.get(akm_offset + 2..akm_offset + 2 + akm_count.checked_mul(4)?)?;
    let mut psk = false;
    let mut sae = false;
    let mut enterprise = false;
    let mut owe = false;
    for suite in suites.as_chunks::<4>().0 {
        if suite[..3] != [0, 15, 172] {
            continue;
        }
        match suite[3] {
            2 | 4 | 6 => psk = true,
            8 | 9 | 24 => sae = true,
            1 | 3 | 5 | 11 | 12 | 13 => enterprise = true,
            18 => owe = true,
            _ => {}
        }
    }
    if enterprise {
        Some("Enterprise")
    } else if sae && psk {
        Some("WPA2/WPA3")
    } else if sae {
        Some("WPA3")
    } else if psk {
        Some("WPA2")
    } else if owe {
        Some("OWE")
    } else {
        None
    }
}

fn parse_security_from_ies(ies: &[u8]) -> Option<String> {
    let mut off = 0;
    let mut legacy_wpa = false;
    while off + 2 <= ies.len() {
        let typ = ies[off];
        let len = ies[off + 1] as usize;
        let body = ies.get(off + 2..off + 2 + len)?;
        if typ == 48 {
            // Do not downgrade an unknown or truncated RSN suite to WPA2.
            return rsn_security(body).map(str::to_owned);
        } else if typ == 221 && body.starts_with(b"\x00\x50\xf2\x01\x01\x00") {
            legacy_wpa = true;
        }
        off += 2 + len;
    }
    legacy_wpa.then(|| "WPA".into())
}

pub fn current_wifi() -> Option<NativeWifiInfo> {
    wifi_snapshot().ok()
}

pub fn network_info() -> Option<NativeNetworkInfo> {
    let active_ifindex = station_ifindex();
    let (ipv4, ipv6, mac, subnet_mask) = read_interfaces(active_ifindex)?;
    let route = read_route();
    let dns = read_dns();
    if ipv4.is_none() && ipv6.is_none() && mac.is_none() && route.is_none() && dns.is_empty() {
        return None;
    }
    let gateway = route;
    Some(NativeNetworkInfo {
        ipv4,
        ipv6,
        mac,
        gateway,
        dns: (!dns.is_empty()).then_some(dns),
        subnet_mask,
    })
}

fn station_ifindex() -> Option<u32> {
    let sock = open_socket().ok()?;
    let (_, family_raw) = ctrl_get_family(sock.fd).ok()?;
    let mut family_id = None;
    parse_attrs(family_raw.get(20..)?, &mut |typ, data| {
        if typ == CTRL_ATTR_FAMILY_ID && data.len() >= 2 {
            family_id = Some(u16::from_ne_bytes([data[0], data[1]]));
        }
    });
    let family_id = family_id?;

    let mut buf = [0u8; 512];
    let mut interfaces = Vec::with_capacity(8192);
    let len = build_genl(&mut buf, family_id, CMD_GET_INTERFACE, &[], true).ok()?;
    send_and_recv(sock.fd, &mut buf, len, &mut interfaces).ok()?;

    let mut ifindex = None;
    parse_msgs(&interfaces, family_id, |cmd, attrs| {
        if cmd != CMD_NEW_INTERFACE {
            return;
        }
        let mut idx = None;
        let mut iftype = 0u32;
        parse_attrs(attrs, &mut |typ, data| match typ {
            ATTR_IFINDEX if data.len() >= 4 => {
                idx = Some(u32::from_ne_bytes([data[0], data[1], data[2], data[3]]))
            }
            ATTR_IFTYPE if data.len() >= 4 => {
                iftype = u32::from_ne_bytes([data[0], data[1], data[2], data[3]])
            }
            _ => {}
        });
        if iftype == IFTYPE_STATION {
            ifindex = idx;
        }
    });
    ifindex
}

type InterfaceData = (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
);

fn read_interfaces(preferred_ifindex: Option<u32>) -> Option<InterfaceData> {
    let mut ptr: *mut libc::ifaddrs = std::ptr::null_mut();
    let ret = unsafe { libc::getifaddrs(&mut ptr) };
    if ret != 0 || ptr.is_null() {
        return None;
    }
    let list = IfaddrsList { ptr: ptr.cast() };

    let mut ipv4 = None;
    let mut ipv6 = None;
    let mut mac = None;
    let mut mask = None;
    let mut selected_ifindex = preferred_ifindex;
    let mut cursor = list.ptr;
    // Choose one interface before reading its IPv4/IPv6/MAC; getifaddrs order is arbitrary.
    while selected_ifindex.is_none() && !cursor.is_null() {
        let entry = unsafe { &*cursor };
        cursor = entry.next;
        if entry.addr.is_null() || entry.name.is_null() {
            continue;
        }
        if unsafe { *entry.addr }.sa_family == AF_INET {
            let addr = unsafe { &*(entry.addr.cast::<SockaddrIn>()) };
            if addr.addr[0] != 127 {
                selected_ifindex = Some(unsafe { libc::if_nametoindex(entry.name) });
            }
        }
    }
    let mut cursor = list.ptr;
    while !cursor.is_null() {
        let entry = unsafe { &*cursor };
        cursor = entry.next;
        let name = if entry.name.is_null() {
            None
        } else {
            Some(unsafe { std::ffi::CStr::from_ptr(entry.name).to_string_lossy() })
        };
        let name = name.as_deref().unwrap_or("");
        if name == "lo"
            || entry.name.is_null()
            || Some(unsafe { libc::if_nametoindex(entry.name) }) != selected_ifindex
        {
            continue;
        }
        if entry.addr.is_null() {
            continue;
        }
        let family = unsafe { *entry.addr }.sa_family;
        if family == AF_INET {
            let addr = unsafe { &*(entry.addr.cast::<SockaddrIn>()) };
            let current_ifindex = unsafe { libc::if_nametoindex(entry.name) };
            if ipv4.is_none() && addr.addr[0] != 127 {
                ipv4 = Some(format_inet(&addr.addr));
                if !entry.netmask.is_null() {
                    let netmask = unsafe { &*(entry.netmask.cast::<SockaddrIn>()) };
                    mask = Some(format_inet(&netmask.addr));
                }
                selected_ifindex = Some(current_ifindex);
            }
        } else if family == AF_PACKET {
            let addr = unsafe { &*(entry.addr.cast::<SockaddrLl>()) };
            let current_ifindex = unsafe { libc::if_nametoindex(entry.name) };
            let is_wifi = selected_ifindex == Some(current_ifindex);
            if is_wifi && addr.halen >= 6 {
                mac = Some(format!(
                    "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                    addr.addr[0],
                    addr.addr[1],
                    addr.addr[2],
                    addr.addr[3],
                    addr.addr[4],
                    addr.addr[5]
                ));
            }
        } else if family == AF_INET6 && ipv6.is_none() {
            let addr = unsafe { &*(entry.addr.cast::<SockaddrIn6>()) };
            let text = format_inet6(&addr.addr);
            if !text.starts_with("fe80") && !text.starts_with("::1") {
                ipv6 = Some(text);
            }
        }
    }
    if ipv4.is_none() && ipv6.is_none() && mac.is_none() {
        None
    } else {
        Some((ipv4, ipv6, mac, mask))
    }
}

fn read_route() -> Option<String> {
    let fd = unsafe { libc::socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, RT_NETLINK) };
    if fd < 0 {
        return None;
    }
    let socket = Socket { fd };
    let addr = SockaddrNl {
        nl_family: AF_NETLINK as u16,
        nl_pad: 0,
        nl_pid: 0,
        nl_groups: 0,
    };
    if unsafe {
        libc::bind(
            socket.fd,
            &addr as *const SockaddrNl as *const libc::sockaddr,
            std::mem::size_of::<SockaddrNl>() as u32,
        )
    } < 0
    {
        return None;
    }

    let mut buf = route_request();
    let mut out = Vec::with_capacity(16 * 1024);
    let send_len = buf.len();
    if send_and_recv(socket.fd, &mut buf, send_len, &mut out).is_err() {
        return None;
    }
    // Netlink 分片读取在末条截断时可能少于 4 字节；丢弃不完整尾包，避免解析越界。
    out.truncate(out.len() - out.len() % 4);
    if out.len() > 1024 * 1024 {
        return None;
    }

    parse_routes(&out)
}

fn route_request() -> Vec<u8> {
    let header_size = std::mem::size_of::<NlMsgHdr>();
    let mut buf = vec![0u8; header_size + std::mem::size_of::<RtMsg>()];
    let hdr = NlMsgHdr {
        len: buf.len() as u32,
        typ: 26, // RTM_GETROUTE
        flags: NLM_F_REQUEST | NLM_F_DUMP,
        seq: 2,
        pid: std::process::id(),
    };
    let payload = RtMsg {
        family: AF_INET as u8,
        dst_len: 0,
        src_len: 0,
        tos: 0,
        table: 0,
        protocol: 0,
        scope: 0,
        kind: 0,
        flags: 0,
    };
    unsafe {
        std::ptr::copy_nonoverlapping(
            &hdr as *const NlMsgHdr as *const u8,
            buf.as_mut_ptr(),
            header_size,
        );
        std::ptr::copy_nonoverlapping(
            &payload as *const RtMsg as *const u8,
            buf.as_mut_ptr().add(header_size),
            std::mem::size_of::<RtMsg>(),
        );
    }
    buf
}

fn parse_routes(out: &[u8]) -> Option<String> {
    let attrs_offset = std::mem::size_of::<NlMsgHdr>() + std::mem::size_of::<RtMsg>();
    let mut best_metric = u32::MAX;
    let mut gateway = None;
    let mut off = 0;
    while off + 16 <= out.len() {
        let msg_len =
            u32::from_ne_bytes([out[off], out[off + 1], out[off + 2], out[off + 3]]) as usize;
        if msg_len < std::mem::size_of::<NlMsgHdr>() || off + msg_len > out.len() {
            break;
        }
        let typ = u16::from_ne_bytes([out[off + 4], out[off + 5]]);
        if typ == 24 && msg_len >= attrs_offset {
            // RTM_NEWROUTE
            let attrs = &out[off + attrs_offset..off + msg_len];
            let mut gw = None;
            let mut metric = 0;
            parse_attrs(attrs, &mut |typ, data| {
                if typ == RTA_GATEWAY && data.len() >= 4 {
                    gw = Some([data[0], data[1], data[2], data[3]]);
                } else if typ == RTA_PRIORITY && data.len() >= 4 {
                    metric = u32::from_ne_bytes([data[0], data[1], data[2], data[3]]);
                }
            });
            if gw.is_some() && metric < best_metric {
                best_metric = metric;
                gateway = gw.map(|addr| format_inet(&addr));
            }
        }
        off += (msg_len + 3) & !3;
    }
    gateway
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

fn format_inet6(bytes: &[u8; 16]) -> String {
    let mut groups = [0u16; 8];
    for (index, pair) in bytes.chunks(2).enumerate() {
        groups[index] = u16::from_be_bytes([pair[0], pair[1]]);
    }
    let mut best_start = None;
    let mut best_len = 0;
    let mut index = 0;
    while index < groups.len() {
        if groups[index] != 0 {
            index += 1;
            continue;
        }
        let start = index;
        while index < groups.len() && groups[index] == 0 {
            index += 1;
        }
        let len = index - start;
        if len > best_len {
            best_start = Some(start);
            best_len = len;
        }
    }

    let mut output = String::new();
    let mut index = 0;
    while index < groups.len() {
        if best_start == Some(index) && best_len >= 2 {
            output.push_str("::");
            index += best_len;
            if index < groups.len() {
                output.push_str(&format!("{:x}", groups[index]));
                index += 1;
            }
        } else {
            output.push_str(&format!("{:x}", groups[index]));
            index += 1;
        }
        if index < groups.len() && !(best_len >= 2 && best_start == Some(index)) {
            output.push(':');
        }
    }
    output
}

fn format_inet(bytes: &[u8; 4]) -> String {
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
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
        return Err(Error::new(
            Status::GenericFailure,
            "failed to create watcher socket",
        ));
    }
    // 与 iw 一致：先 bind 单播地址，再通过 NETLINK_ADD_MEMBERSHIP 加入组播组。
    let addr = SockaddrNl {
        nl_family: AF_NETLINK as u16,
        nl_pad: 0,
        nl_pid: 0,
        nl_groups: 0,
    };
    let ret = unsafe {
        libc::bind(
            fd,
            &addr as *const SockaddrNl as *const libc::sockaddr,
            std::mem::size_of::<SockaddrNl>() as u32,
        )
    };
    if ret < 0 {
        unsafe { libc::close(fd) };
        return Err(Error::new(
            Status::GenericFailure,
            "failed to bind watcher socket",
        ));
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
            return Err(Error::new(
                Status::GenericFailure,
                "failed to subscribe nl80211 group",
            ));
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
        callback.call(
            Ok(()),
            napi::threadsafe_function::ThreadsafeFunctionCallMode::Blocking,
        );
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
                        name = std::str::from_utf8(d)
                            .ok()
                            .map(|s| s.trim_matches('\0').to_string());
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
    if groups.is_empty() {
        None
    } else {
        Some(groups)
    }
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
    let family_id =
        family_id.ok_or_else(|| Error::new(Status::GenericFailure, "nl80211 family not found"))?;

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

    let ifindex =
        ifindex.ok_or_else(|| Error::new(Status::GenericFailure, "no station interface"))?;
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
            let mut capability = None;
            let mut has_security_ie = false;
            parse_attrs(data, &mut |btyp, bdata| match btyp {
                BSS_STATUS if bdata.len() >= 4 => {
                    status = u32::from_ne_bytes([bdata[0], bdata[1], bdata[2], bdata[3]])
                }
                BSS_BSSID => cur_bssid = format_mac(bdata),
                BSS_FREQUENCY if bdata.len() >= 4 => {
                    let f = u32::from_ne_bytes([bdata[0], bdata[1], bdata[2], bdata[3]]);
                    cur_freq = Some(f);
                }
                BSS_CAPABILITY if bdata.len() >= 2 => {
                    capability = Some(u16::from_ne_bytes([bdata[0], bdata[1]]));
                }
                BSS_INFORMATION_ELEMENTS => {
                    cur_security = parse_security_from_ies(bdata);
                    let mut cursor = 0;
                    while cursor + 2 <= bdata.len() {
                        let size = bdata[cursor + 1] as usize;
                        if cursor + 2 + size > bdata.len() {
                            has_security_ie = true;
                            break;
                        }
                        if bdata[cursor] == 48
                            || (bdata[cursor] == 221
                                && bdata[cursor + 2..cursor + 2 + size]
                                    .starts_with(b"\x00\x50\xf2\x01"))
                        {
                            has_security_ie = true;
                        }
                        cursor += 2 + size;
                    }
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
                security = cur_security.or_else(|| {
                    if has_security_ie {
                        None
                    } else {
                        capability
                            .map(|flags| if flags & 0x10 == 0 { "Open" } else { "WEP" }.into())
                    }
                });
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
                                STA_INFO_SIGNAL if !sdata.is_empty() => {
                                    rssi = Some((sdata[0] as i8) as i32)
                                }
                                STA_INFO_TX_BITRATE => parse_attrs(sdata, &mut |rtyp, rdata| {
                                    if rtyp == RATE_INFO_BITRATE32 && rdata.len() >= 4 {
                                        link_speed = Some(
                                            u32::from_ne_bytes([
                                                rdata[0], rdata[1], rdata[2], rdata[3],
                                            ]) as i32
                                                / 10,
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

#[cfg(test)]
mod security_tests {
    use super::*;
    fn rsn(suites: &[u8]) -> Vec<u8> {
        let mut body = vec![
            1,
            0,
            0,
            15,
            172,
            4,
            1,
            0,
            0,
            15,
            172,
            4,
            suites.len() as u8,
            0,
        ];
        for suite in suites {
            body.extend_from_slice(&[0, 15, 172, *suite]);
        }
        let mut ie = vec![48, body.len() as u8];
        ie.extend(body);
        ie
    }
    #[test]
    fn rsn_suites_distinguish_wpa2_wpa3_transition_and_enterprise() {
        for (suites, expected) in [
            (vec![2], "WPA2"),
            (vec![8], "WPA3"),
            (vec![2, 8], "WPA2/WPA3"),
            (vec![1], "Enterprise"),
            (vec![12], "Enterprise"),
            (vec![18], "OWE"),
        ] {
            assert_eq!(
                parse_security_from_ies(&rsn(&suites)).as_deref(),
                Some(expected)
            );
        }
    }
    #[test]
    fn truncated_or_unknown_rsn_never_becomes_wpa2() {
        let ie = rsn(&[8]);
        for size in 0..ie.len() {
            assert_eq!(parse_security_from_ies(&ie[..size]), None);
        }
        assert_eq!(parse_security_from_ies(&rsn(&[255])), None);
        let mut invalid = ie.clone();
        invalid[8] = 255;
        assert_eq!(parse_security_from_ies(&invalid), None);
    }
}

#[cfg(test)]
mod route_tests {
    use super::*;
    #[test]
    fn request_contains_complete_header_and_route_message() {
        let request = route_request();
        assert_eq!(request.len(), 28);
        assert_eq!(
            u32::from_ne_bytes(request[..4].try_into().unwrap()) as usize,
            request.len()
        );
        assert_eq!(request[16], AF_INET as u8);
    }
    #[test]
    fn route_attributes_start_after_the_complete_payload() {
        let mut reply = route_request();
        reply[4..6].copy_from_slice(&24u16.to_ne_bytes());
        reply.extend_from_slice(&8u16.to_ne_bytes());
        reply.extend_from_slice(&RTA_GATEWAY.to_ne_bytes());
        reply.extend_from_slice(&[10, 0, 0, 1]);
        let len = reply.len() as u32;
        reply[..4].copy_from_slice(&len.to_ne_bytes());
        assert_eq!(parse_routes(&reply).as_deref(), Some("10.0.0.1"));
        assert_eq!(parse_routes(&reply[..27]), None);
        let mut padded_message = vec![0u8; 20];
        padded_message[..4].copy_from_slice(&17u32.to_ne_bytes());
        padded_message.extend_from_slice(&reply);
        assert_eq!(parse_routes(&padded_message).as_deref(), Some("10.0.0.1"));
    }
    #[test]
    fn production_route_query_completes() {
        let _ = read_route();
    }
}
