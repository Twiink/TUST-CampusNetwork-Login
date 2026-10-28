/**
 * 网络工具测试：接口枚举、IPv4/IPv6/MAC 解析、认证字段补齐
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { osMock, dgramMock } = vi.hoisted(() => ({
  osMock: {
    networkInterfaces: vi.fn(),
  },
  dgramMock: {
    createSocket: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  default: osMock,
  networkInterfaces: osMock.networkInterfaces,
}));

vi.mock('node:dgram', () => ({
  default: dgramMock,
  createSocket: dgramMock.createSocket,
}));

vi.mock('dgram', () => ({
  default: dgramMock,
  createSocket: dgramMock.createSocket,
}));

vi.mock('./wifi-detector', () => ({
  getCurrentWifiSSID: vi.fn().mockResolvedValue(null),
  execWindowsText: vi.fn(),
}));

import {
  enrichStatusAuthFields,
  getIPv6ForIPv4,
  getLocalIPv4,
  getLocalIPv6,
  getLocalMAC,
  getNetworkInterfaces,
  resolveLocalIPv4,
} from './network';
import type { NetworkStatus, WifiManager } from '@repo/shared';

const makeOsInterfaces = () => ({
  lo0: [
    {
      name: 'lo0',
      address: '127.0.0.1',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: true,
      scopeid: 0,
      cidr: '127.0.0.1/8',
      netmask: '255.0.0.0',
    },
  ],
  en0: [
    {
      name: 'en0',
      address: '192.168.1.23',
      family: 'IPv4',
      mac: 'a4:83:e7:aa:bb:cc',
      internal: false,
      cidr: '192.168.1.23/24',
      netmask: '255.255.255.0',
    },
    {
      name: 'en0',
      address: '2001:db8::1234:5678',
      family: 'IPv6',
      mac: 'a4:83:e7:aa:bb:cc',
      internal: false,
      scopeid: 4,
      cidr: '2001:db8::1234:5678/64',
      netmask: 'ffff:ffff:ffff:ffff::',
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  osMock.networkInterfaces.mockImplementation(makeOsInterfaces as never);
});

describe('getNetworkInterfaces', () => {
  it('过滤回环接口并聚合 IPv4/IPv6/MAC', () => {
    const interfaces = getNetworkInterfaces();

    expect(interfaces).toHaveLength(1);
    expect(interfaces[0]).toMatchObject({
      name: 'en0',
      ipv4: '192.168.1.23',
      ipv6: '2001:db8::1234:5678',
      mac: 'a4:83:e7:aa:bb:cc',
    });
  });

  it('空接口返回空数组', () => {
    osMock.networkInterfaces.mockReturnValue({});
    expect(getNetworkInterfaces()).toEqual([]);
  });
});

describe('getLocalIPv4', () => {
  it('优先返回偏好命名的接口（en0/eth0/wlan0）', () => {
    osMock.networkInterfaces.mockReturnValue({
      usb0: [
        {
          name: 'usb0',
          address: '172.20.10.2',
          family: 'IPv4',
          mac: '02:00:00:00:00:00',
          internal: false,
          netmask: '255.255.255.240',
          cidr: '172.20.10.2/28',
        },
      ],
      eth0: [
        {
          name: 'eth0',
          address: '10.12.34.56',
          family: 'IPv4',
          mac: '02:11:22:33:44:55',
          internal: false,
          netmask: '255.255.0.0',
          cidr: '10.12.34.56/16',
        },
      ],
    } as never);

    expect(getLocalIPv4()).toBe('10.12.34.56');
  });

  it('无偏好接口时回退到第一个有 IPv4 的接口', () => {
    expect(getLocalIPv4()).toBe('192.168.1.23');
  });

  it('没有可用 IPv4 时返回 null', () => {
    osMock.networkInterfaces.mockReturnValue({
      lo0: makeOsInterfaces().lo0,
    } as never);
    expect(getLocalIPv4()).toBeNull();
  });
});

describe('getLocalIPv6 / getLocalMAC', () => {
  it('返回非内部接口的 IPv6 与 MAC', () => {
    expect(getLocalIPv6()).toBe('2001:db8::1234:5678');
    expect(getLocalMAC()).toBe('a483e7aabbcc');
  });
});

describe('IPv6 选取', () => {
  const v6 = (name: string, address: string, internal = false) => ({
    name,
    address,
    family: 'IPv6',
    mac: '02:00:00:00:00:01',
    internal,
    scopeid: 0,
    cidr: `${address}/64`,
    netmask: 'ffff:ffff:ffff:ffff::',
  });
  const v4 = (name: string, address: string) => ({
    name,
    address,
    family: 'IPv4',
    mac: '02:00:00:00:00:01',
    internal: false,
    cidr: `${address}/16`,
    netmask: '255.255.0.0',
  });

  it('同一网卡多个 IPv6 时保留全局单播地址，排除链路本地与站点本地', () => {
    osMock.networkInterfaces.mockReturnValue({
      wlan0: [
        v4('wlan0', '10.59.16.97'),
        v6('wlan0', 'fe80::1'),
        v6('wlan0', 'fec0::2'),
        v6('wlan0', 'fd00::3'),
        v6('wlan0', '2001:da8:a005:31a::4:3b82'),
        v6('wlan0', '2001:da8:a005:31a::5:1'),
      ],
    });
    expect(getLocalIPv6()).toBe('2001:da8:a005:31a::4:3b82');
  });

  it('只有 ULA 时作为兜底', () => {
    osMock.networkInterfaces.mockReturnValue({ wlan0: [v6('wlan0', 'fd00::3')] });
    expect(getLocalIPv6()).toBe('fd00::3');
  });

  it('getIPv6ForIPv4 返回与认证 IPv4 同网卡的 IPv6，而非其他网卡', () => {
    osMock.networkInterfaces.mockReturnValue({
      en0: [v4('en0', '192.168.1.2'), v6('en0', '2409:8a00::1')],
      wlan1: [v4('wlan1', '10.59.16.97'), v6('wlan1', 'fe80::9'), v6('wlan1', '2001:da8::7')],
    });
    expect(getIPv6ForIPv4('10.59.16.97')).toBe('2001:da8::7');
    // 未匹配 IPv4 时返回 null，由调用方回退
    expect(getIPv6ForIPv4('10.0.0.1')).toBeNull();
  });

  it('同网卡没有可用 IPv6 时返回 null', () => {
    osMock.networkInterfaces.mockReturnValue({
      wlan1: [v4('wlan1', '10.59.16.97'), v6('wlan1', 'fe80::9')],
    });
    expect(getIPv6ForIPv4('10.59.16.97')).toBeNull();
  });
});

describe('resolveLocalIPv4', () => {
  const stubUdpProbe = (ip: string | null, failConnect = false) => {
    const handlers: Record<string, () => void> = {};
    const socket = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      close: vi.fn(),
      connect: vi.fn((_port: number, _host: string, cb: () => void) => {
        if (failConnect) {
          handlers['error']?.();
          return;
        }
        cb();
      }),
      address: vi.fn(() => ({ address: ip })),
    };
    dgramMock.createSocket.mockReturnValue(socket);
    return { socket, handlers };
  };

  it('路由探测到 10.x 出口时直接采用', async () => {
    stubUdpProbe('10.10.5.24');
    await expect(resolveLocalIPv4()).resolves.toBe('10.10.5.24');
  });

  it('探测到非 10.x 私网且存在 10.x 接口时优先 10.x', async () => {
    stubUdpProbe('192.168.1.23');
    osMock.networkInterfaces.mockReturnValue({
      ...makeOsInterfaces(),
      wlan0: [
        {
          name: 'wlan0',
          address: '10.3.2.1',
          family: 'IPv4',
          mac: '02:aa:bb:cc:dd:ee',
          internal: false,
          netmask: '255.0.0.0',
          cidr: '10.3.2.1/8',
        },
      ],
    } as never);

    await expect(resolveLocalIPv4()).resolves.toBe('10.3.2.1');
  });

  it('探测失败时回退到 10.x 接口枚举', async () => {
    stubUdpProbe('10.9.9.9', true);
    osMock.networkInterfaces.mockReturnValue({
      eth0: [
        {
          name: 'eth0',
          address: '10.20.30.40',
          family: 'IPv4',
          mac: '02:11:22:33:44:55',
          internal: false,
          netmask: '255.0.0.0',
          cidr: '10.20.30.40/8',
        },
      ],
    } as never);

    await expect(resolveLocalIPv4()).resolves.toBe('10.20.30.40');
  });

  it('无 10.x 接口时探测值兜底返回（即使非私网）', async () => {
    stubUdpProbe('198.18.0.5');
    await expect(resolveLocalIPv4()).resolves.toBe('198.18.0.5');
  });
});

describe('resolveLocalIPv4 悲观路径', () => {
  const stubFailedProbe = () => {
    const handlers: Record<string, () => void> = {};
    const socket = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      close: vi.fn(),
      connect: vi.fn((_port: number, _host: string, _cb: () => void) => {
        handlers['error']?.();
      }),
      address: vi.fn(() => ({ address: '0.0.0.0' })),
    };
    dgramMock.createSocket.mockReturnValue(socket);
  };

  it('探测失败且无任何 IPv4 接口时返回 null', async () => {
    stubFailedProbe();
    osMock.networkInterfaces.mockReturnValue({
      en0: [
        {
          name: 'en0',
          address: '2001:db8::1',
          family: 'IPv6',
          mac: 'a4:83:e7:aa:bb:cc',
          internal: false,
          scopeid: 4,
          cidr: '2001:db8::1/64',
          netmask: 'ffff:ffff:ffff:ffff::',
        },
      ],
    } as never);

    await expect(resolveLocalIPv4()).resolves.toBeNull();
  });

  it('探测结果为 172.15.x（私网边界外）时不走私网优先逻辑', async () => {
    const handlers: Record<string, () => void> = {};
    const socket = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      close: vi.fn(),
      connect: vi.fn((_p: number, _h: string, cb: () => void) => cb()),
      address: vi.fn(() => ({ address: '172.15.0.1' })),
    };
    dgramMock.createSocket.mockReturnValue(socket);

    // 172.15 不属于 172.16/12 私网段，无 10.x 接口时仍作为探测值兜底返回
    await expect(resolveLocalIPv4()).resolves.toBe('172.15.0.1');
  });
});

describe('getNetworkInterfaces 边界', () => {
  it('internal 接口即使有公网 IP 也不进入结果', () => {
    osMock.networkInterfaces.mockReturnValue({
      tun0: [
        {
          name: 'tun0',
          address: '8.8.8.8',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: true,
          netmask: '255.255.255.255',
          cidr: '8.8.8.8/32',
        },
      ],
    } as never);

    expect(getNetworkInterfaces()).toEqual([]);
  });

  it('接口无任何地址时不进入结果', () => {
    osMock.networkInterfaces.mockReturnValue({
      bridge0: [] as never[],
    } as never);

    expect(getNetworkInterfaces()).toEqual([]);
  });
});

describe('enrichStatusAuthFields', () => {
  const wifiManager = {
    resolveAuthRequirement: vi.fn(),
  } as unknown as WifiManager;

  it('无 SSID 时直接返回不改动', () => {
    const status: NetworkStatus = {
      connected: false,
      authenticated: false,
      wifiConnected: false,
      ssid: undefined,
    };
    enrichStatusAuthFields(status, wifiManager);
    expect(wifiManager.resolveAuthRequirement).not.toHaveBeenCalled();
    expect(status.requiresAuth).toBeUndefined();
  });

  it('按三级判定补齐认证字段', () => {
    vi.mocked(wifiManager.resolveAuthRequirement).mockReturnValue({
      isConfigured: true,
      requiresAuth: true,
      hasLinkedAccount: true,
    });

    const status: NetworkStatus = {
      connected: true,
      authenticated: false,
      wifiConnected: true,
      ssid: 'TUST-Dorm',
    };
    enrichStatusAuthFields(status, wifiManager);

    expect(wifiManager.resolveAuthRequirement).toHaveBeenCalledWith('TUST-Dorm', undefined, status);
    expect(status).toMatchObject({
      isConfigured: true,
      requiresAuth: true,
      hasLinkedAccount: true,
    });
  });
});
