/**
 * 桌面 WiFi 适配器测试：Windows netsh / macOS networksetup 输出解析
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecException } from 'node:child_process';

const { execMock, nativeCurrentWifiMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  nativeCurrentWifiMock: vi.fn(() => null),
}));

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
  mockExecOutput('');
  resetNativeWifiModuleForTests();
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
