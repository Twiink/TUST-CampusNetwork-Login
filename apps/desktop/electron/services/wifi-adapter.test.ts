/**
 * 桌面 WiFi 适配器测试：Windows netsh / macOS networksetup 输出解析
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecException } from 'node:child_process';

const { execMock, nativeCurrentWifiMock, nativeNetworkInfoMock, networkInterfacesMock } =
  vi.hoisted(() => ({
    execMock: vi.fn(),
    nativeCurrentWifiMock: vi.fn(() => null),
    nativeNetworkInfoMock: vi.fn((): Record<string, unknown> | null => null),
    networkInterfacesMock: vi.fn(),
  }));

vi.mock('node:os', () => ({ networkInterfaces: networkInterfacesMock }));

vi.mock('node:child_process', () => ({
  default: { exec: execMock, execFile: execMock },
  exec: execMock,
  execFile: execMock,
}));

vi.mock('../utils/win-exec', () => ({
  execWindowsText: vi.fn(),
  decodeWindowsText: (buf: Buffer) => buf.toString('utf8'),
}));

vi.mock('../utils/dev-log', () => ({
  devLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@repo/native', () => ({
  currentWifi: nativeCurrentWifiMock,
  networkInfo: nativeNetworkInfoMock,
}));

import { DesktopWifiAdapter, resetNativeWifiModuleForTests } from './wifi-adapter';

type ExecCallback = (
  error: ExecException | null,
  result: { stdout: string | Buffer; stderr: string }
) => void;

/** 提取回调（promisify 调用可能是 (command, options, cb) 或 (command, cb)） */
const extractCallback = (args: unknown[]): ExecCallback => args[args.length - 1] as ExecCallback;

const mockExecOutput = (stdout: string | Buffer) => {
  execMock.mockImplementation((...args: unknown[]) => {
    extractCallback(args)(null, { stdout, stderr: '' });
  });
};

const mockExecError = (message: string) => {
  execMock.mockImplementation((...args: unknown[]) => {
    const error = new Error(message) as ExecException;
    error.code = 1;
    extractCallback(args)(error, { stdout: '', stderr: message });
  });
};

const NETSH_INTERFACES = [
  '系统上有 1 个接口',
  '',
  '    名称                   : WLAN',
  '    描述                   : Intel Wi-Fi 6',
  '    SSID                   : TUST-WIFI',
  '    BSSID                  : 00:11:22:33:44:55',
  '    身份验证               : WPA2-个人',
  '    信号                   : 86%',
  '    接收速率 (Mbps)        : 866.7',
  '    传输速率 (Mbps)        : 866.7',
  '    信道                   : 36',
].join('\r\n');

const makeAdapter = (platform: NodeJS.Platform): DesktopWifiAdapter => {
  const adapter = new DesktopWifiAdapter();
  // 构造函数读取真实 process.platform，测试中直接覆写内部平台标记
  Object.defineProperty(adapter, 'platform', { value: platform });
  return adapter;
};

beforeEach(() => {
  vi.clearAllMocks();
  nativeCurrentWifiMock.mockReturnValue(null);
  nativeNetworkInfoMock.mockReturnValue(null);
  networkInterfacesMock.mockReturnValue({});
  mockExecOutput('');
  resetNativeWifiModuleForTests();
});

describe('DesktopWifiAdapter.getNetworkInfo', () => {
  it.each([true, false])(
    'Linux fallback keeps WiFi addresses separate from VPN (IPv4 ready=%s)',
    async (ready) => {
      mockExecOutput(
        [
          'GENERAL.TYPE:tun\nIP4.ADDRESS[1]:10.88.0.2/24\nIP6.ADDRESS[1]:2001\\:db8\\:\\:99/64',
          `GENERAL.TYPE:wifi\n${ready ? 'IP4.ADDRESS[1]:192.168.5.10/24\n' : ''}IP6.ADDRESS[1]:2001\\:db8\\:\\:10/64\nGENERAL.HWADDR:AA\\:BB\\:CC\\:DD\\:EE\\:FF`,
        ].join('\n\n')
      );
      const info = await makeAdapter('linux').getNetworkInfo();
      expect(info.ipv4).toBe(ready ? '192.168.5.10' : undefined);
      expect(info.ipv6).toBe('2001:db8::10');
      expect(info.mac).toBe('AA:BB:CC:DD:EE:FF');
    }
  );

  it.each([true, false])(
    'macOS fallback uses actual en1 WiFi interface (IPv4 ready=%s)',
    async (ready) => {
      const ipv4 = (address: string) => ({
        family: 'IPv4',
        address,
        internal: false,
        netmask: '255.255.255.0',
        mac: 'aa:bb:cc:dd:ee:ff',
      });
      networkInterfacesMock.mockReturnValue({
        en0: [ipv4('10.1.1.2')],
        utun0: [ipv4('10.88.0.2')],
        en1: [
          ...(ready ? [ipv4('192.168.5.10')] : []),
          { family: 'IPv6', address: '2001:db8::10', internal: false },
        ],
      });
      execMock.mockImplementation((...args: unknown[]) => {
        const command = args[0] as string;
        const stdout = command.includes('-listallhardwareports')
          ? 'Hardware Port: Ethernet\nDevice: en0\n\nHardware Port: Wi-Fi\nDevice: en1\n'
          : command.includes('netstat')
            ? 'default 192.168.5.1 UGSc en1'
            : '';
        extractCallback(args)(null, { stdout, stderr: '' });
      });
      const info = await makeAdapter('darwin').getNetworkInfo();
      expect(info.ipv4).toBe(ready ? '192.168.5.10' : undefined);
      expect(info.ipv6).toBe('2001:db8::10');
      expect(execMock.mock.calls.some((call) => String(call[0]).includes('grep en1'))).toBe(true);
    }
  );

  it.each([true, false])(
    'Windows fallback does not borrow adjacent VPN adapter (IPv4 ready=%s)',
    async (ready) => {
      mockExecOutput(
        Buffer.from(
          [
            'Windows IP Configuration',
            '\nWireless LAN adapter Wi-Fi:\n\n',
            ready ? '   IPv4 Address . . . : 192.168.5.10\n' : '',
            '   IPv6 Address . . . : 2001:db8::10\n',
            '\nEthernet adapter VPN:\n\n   IPv4 Address . . . : 10.88.0.2\n   IPv6 Address . . . : 2001:db8::99\n',
          ].join('')
        )
      );
      const info = await makeAdapter('win32').getNetworkInfo();
      expect(info.ipv4).toBe(ready ? '192.168.5.10' : undefined);
      expect(info.ipv6).toBe('2001:db8::10');
    }
  );

  it('原生 networkInfo 优先且 15s 内复用缓存，不触发 spawn', async () => {
    const adapter = makeAdapter('linux');
    nativeNetworkInfoMock.mockReturnValue({
      ipv4: '10.48.27.111',
      ipv6: '2001:da8::17ce',
      mac: 'AA:BB:CC:DD:EE:FF',
      gateway: '10.48.16.1',
      dns: ['202.113.96.10', ''],
      subnetMask: '255.255.240.0',
    });

    const first = await adapter.getNetworkInfo();
    const second = await adapter.getNetworkInfo();

    expect(first).toEqual({
      ipv4: '10.48.27.111',
      ipv6: '2001:da8::17ce',
      mac: 'aabbccddeeff',
      gateway: '10.48.16.1',
      dns: ['202.113.96.10'],
      subnetMask: '255.255.240.0',
    });
    expect(second).toBe(first);
    expect(nativeNetworkInfoMock).toHaveBeenCalledTimes(1);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('原生返回空对象时回退 TS spawn 路径', async () => {
    const adapter = makeAdapter('win32');
    nativeNetworkInfoMock.mockReturnValue({});
    mockExecOutput(
      Buffer.from('无线局域网适配器 WLAN:\r\n IPv4 地址 . . . : 10.1.2.3\r\n', 'utf8')
    );

    const info = await adapter.getNetworkInfo();

    expect(info.ipv4).toBe('10.1.2.3');
    expect(execMock).toHaveBeenCalled();
  });
});

describe('DesktopWifiAdapter.getCurrentWifi', () => {
  it('Windows: 解析 netsh wlan show interfaces（中文字段）', async () => {
    const adapter = makeAdapter('win32');
    mockExecOutput(Buffer.from(NETSH_INTERFACES, 'utf8'));

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).not.toBeNull();
    expect(wifi).toMatchObject({
      ssid: 'TUST-WIFI',
      signalStrength: 86,
      linkSpeed: 866.7,
      frequency: 5000, // 信道 36 > 14 判定 5GHz
      connected: true,
    });
  });

  it('Windows: 未连接（无 SSID）时返回 null', async () => {
    const adapter = makeAdapter('win32');
    mockExecOutput(
      Buffer.from(
        ['系统上有 1 个接口', '    名称 : WLAN', '    状态 : 已断开连接'].join('\r\n'),
        'utf8'
      )
    );

    expect(await adapter.getCurrentWifi()).toBeNull();
  });

  it('Windows: SSID 乱码时走 GBK 重试路径恢复 SSID', async () => {
    const adapter = makeAdapter('win32');
    const garbled = Buffer.from(
      ['    SSID                   : TUST��WIFI', '    信号                   : 50%'].join('\r\n'),
      'utf8'
    );
    const retry = Buffer.from('    SSID                   : 校园网WiFi\r\n', 'utf8');
    let call = 0;
    execMock.mockImplementation((...args: unknown[]) => {
      call += 1;
      const callback = extractCallback(args);
      // 第一次 chcp 输出乱码，第二次原始 netsh 输出被 GBK 解码恢复
      callback(null, { stdout: call === 1 ? garbled : retry, stderr: '' });
    });

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).not.toBeNull();
    expect(wifi?.ssid).toBe('校园网WiFi');
    expect(execMock).toHaveBeenCalledTimes(2);
  });

  it('Windows: 传输速率高于接收速率时取较大值，2.4G 信道判定 2400MHz', async () => {
    const adapter = makeAdapter('win32');
    mockExecOutput(
      Buffer.from(
        [
          '    SSID                   : Dorm-2G',
          '    信号                   : 40%',
          '    接收速率 (Mbps)        : 72.2',
          '    传输速率 (Mbps)        : 144.4',
          '    信道                   : 6',
          '    身份验证               : WPA2-个人',
        ].join('\r\n'),
        'utf8'
      )
    );

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).toMatchObject({
      ssid: 'Dorm-2G',
      linkSpeed: 144.4,
      frequency: 2400,
      security: 'WPA2-个人',
    });
  });

  it('Windows: 信号与速率字段全缺时回退为 0', async () => {
    const adapter = makeAdapter('win32');
    mockExecOutput(Buffer.from('    SSID                   : Bare\r\n', 'utf8'));

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).toMatchObject({ ssid: 'Bare', signalStrength: 0, linkSpeed: 0, frequency: 0 });
  });

  it('Windows: GBK 重试也失败时返回 null', async () => {
    const adapter = makeAdapter('win32');
    const garbled = Buffer.from('    SSID                   : ��\r\n', 'utf8');
    execMock.mockImplementation((...args: unknown[]) => {
      extractCallback(args)(null, { stdout: Buffer.from('错误的输出'), stderr: '' });
    });
    void garbled;

    const wifi = await adapter.getCurrentWifi();
    expect(wifi).toBeNull();
  });

  it('Windows: 命令失败时返回 null 而非抛错', async () => {
    const adapter = makeAdapter('win32');
    mockExecError('netsh failed');

    expect(await adapter.getCurrentWifi()).toBeNull();
  });

  it('macOS: airport 失败后回退 networksetup 解析 SSID', async () => {
    const adapter = makeAdapter('darwin');
    execMock.mockImplementation((...args: unknown[]) => {
      const command = typeof args[0] === 'string' ? args[0] : (args[0] as string[]).join(' ');
      void command;
      const callback = extractCallback(args);
      if (command.includes('-listallhardwareports')) {
        callback(null, { stdout: 'Hardware Port: Wi-Fi\nDevice: en0\n', stderr: '' });
        return;
      }
      if (command.startsWith('/System/Library')) {
        const error = new Error('timeout') as ExecException;
        callback(error, { stdout: '', stderr: 'timeout' });
        return;
      }
      callback(null, { stdout: 'Current Wi-Fi Network: Home-Network\n', stderr: '' });
    });

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).not.toBeNull();
    expect(wifi).toMatchObject({
      ssid: 'Home-Network',
      connected: true,
      signalStrength: 0,
    });
  });

  it('macOS: airport 主路径解析 SSID/信号/速率/信道', async () => {
    const adapter = makeAdapter('darwin');
    mockExecOutput(
      [
        '     agrCtlRSSI: -45',
        '     lastTxRate: 1200',
        '          channel: 36,80',
        '            security: WPA3',
        '                SSID: TUST-Mac',
      ].join('\n')
    );

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).toMatchObject({
      ssid: 'TUST-Mac',
      connected: true,
    });
    expect(wifi?.signalStrength).toBe(55);
    expect(wifi?.linkSpeed).toBe(1200);
    expect(wifi?.frequency).toBe(5000);
  });

  it('macOS: airport 成功但未连接时回退 networksetup，且其也失败则返回 null', async () => {
    const adapter = makeAdapter('darwin');
    execMock.mockImplementation((...args: unknown[]) => {
      const command = typeof args[0] === 'string' ? args[0] : (args[0] as string[]).join(' ');
      void command;
      const callback = extractCallback(args);
      if (command.includes('airport')) {
        callback(null, { stdout: '     agrCtlRSSI: 0\n', stderr: '' });
        return;
      }
      callback(null, { stdout: 'Current Wi-Fi Network: （未连接）', stderr: '' });
    });

    expect(await adapter.getCurrentWifi()).toBeNull();
  });

  it('Linux: 解析 nmcli active 行并返回 WiFi 详情', async () => {
    const adapter = makeAdapter('linux');
    execMock.mockImplementation((...args: unknown[]) => {
      const argv = Array.isArray(args[0]) ? args[0] : (args[1] as string[] | undefined);
      const callback = extractCallback(args);
      if (argv?.join(' ').includes('wifi')) {
        callback(null, {
          stdout:
            'yes:TUST-5G:86:866:36:5180:WPA2:00\\:11\\:22\\:33\\:44\\:55\nno:Other:40:100:6:2437:WPA1:00\\:11\\:22\\:33\\:44\\:66\n',
          stderr: '',
        });
        return;
      }
      callback(null, { stdout: '', stderr: '' });
    });

    const wifi = await adapter.getCurrentWifi();

    expect(wifi).toMatchObject({
      ssid: 'TUST-5G',
      signalStrength: 86,
      linkSpeed: 866,
      frequency: 5180,
      channel: 36,
      security: 'WPA2',
      connected: true,
    });
  });

  it('不支持的平台返回 null', async () => {
    const adapter = makeAdapter('freebsd');
    expect(await adapter.getCurrentWifi()).toBeNull();
  });
});

describe('派生指标', () => {
  it('getSignalStrength / getLinkSpeed 复用 getCurrentWifi 结果', async () => {
    const adapter = makeAdapter('win32');
    mockExecOutput(Buffer.from(NETSH_INTERFACES, 'utf8'));

    await expect(adapter.getSignalStrength()).resolves.toBe(86);
    // SSID 正常解析时走 chcp 单次探测，不触发 GBK 重试
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('WiFi 未连接时指标为 0', async () => {
    const adapter = makeAdapter('win32');
    mockExecOutput(Buffer.from('    名称 : WLAN\r\n    状态 : 已断开连接', 'utf8'));

    await expect(adapter.getSignalStrength()).resolves.toBe(0);
    await expect(adapter.getLinkSpeed()).resolves.toBe(0);
  });
});

it('invalidated in-flight network queries cannot refill the new cache', async () => {
  const adapter = makeAdapter('linux');
  let finish!: (value: { ipv4: string }) => void;
  const fallback = vi
    .spyOn(
      adapter as unknown as { resolveFallbackNetworkInfo: () => Promise<{ ipv4: string }> },
      'resolveFallbackNetworkInfo'
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue({ ipv4: '192.168.2.2' });
  const stale = adapter.getNetworkInfo();
  adapter.invalidateCache();
  expect(await adapter.getNetworkInfo()).toMatchObject({ ipv4: '192.168.2.2' });
  finish({ ipv4: '10.1.1.2' });
  expect(await stale).toMatchObject({ ipv4: '192.168.2.2' });
  expect(await adapter.getNetworkInfo()).toMatchObject({ ipv4: '192.168.2.2' });
  expect(fallback).toHaveBeenCalledTimes(2);
});
