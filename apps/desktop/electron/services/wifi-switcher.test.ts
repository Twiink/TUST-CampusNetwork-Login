/**
 * WiFi 切换服务测试：netsh/nmcli/airport 扫描解析与连接命令
 *
 * exec mock 按 node 回调契约实现（promisify(exec) 会自动包装为 Promise），
 * 因此无需 mock node:util。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecException } from 'node:child_process';

const { execMock, execFileMock, execWindowsTextMock, execWindowsFileTextMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  execFileMock: vi.fn(),
  execWindowsTextMock: vi.fn(),
  execWindowsFileTextMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  default: { exec: execMock, execFile: execFileMock },
  exec: execMock,
  execFile: execFileMock,
}));

vi.mock('../utils/win-exec', () => ({
  execWindowsText: execWindowsTextMock,
  execWindowsFileText: execWindowsFileTextMock,
  decodeWindowsText: (buf: Buffer) => buf.toString('utf8'),
}));

vi.mock('../utils/dev-log', () => ({
  devLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  connectToNetwork,
  scanAvailableNetworks,
  buildWindowsWifiProfile,
  waitForTargetNetwork,
  WifiSwitcherService,
} from './wifi-switcher';
import { existsSync, readFileSync } from 'node:fs';

type ExecCallback = (
  error: ExecException | null,
  result: { stdout: string; stderr: string }
) => void;

const lastArgAsCallback = (args: unknown[]): ExecCallback => args[args.length - 1] as ExecCallback;

const mockExecOutput = (stdout: string) => {
  execMock.mockImplementation((...args: unknown[]) => {
    lastArgAsCallback(args)(null, { stdout, stderr: '' });
  });
  execFileMock.mockImplementation((...args: unknown[]) => {
    lastArgAsCallback(args)(null, { stdout, stderr: '' });
  });
};

const mockExecError = (message: string) => {
  execMock.mockImplementation((...args: unknown[]) => {
    const error = new Error(message) as ExecException;
    error.code = 1;
    lastArgAsCallback(args)(error, { stdout: '', stderr: message });
  });
  execFileMock.mockImplementation((...args: unknown[]) => {
    const error = new Error(message) as ExecException;
    error.code = 1;
    lastArgAsCallback(args)(error, { stdout: '', stderr: message });
  });
};

const setPlatform = (platform: NodeJS.Platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mockExecOutput('');
});

describe('scanAvailableNetworks', () => {
  it('Linux: 解析 nmcli -t 输出', async () => {
    setPlatform('linux');
    mockExecOutput('TUST-WIFI:80:WPA2\nDorm-5G:45:WPA1\n:90:--\n');

    const networks = await scanAvailableNetworks();

    expect(networks).toEqual([
      { ssid: 'TUST-WIFI', signal: 80, security: 'WPA2' },
      { ssid: 'Dorm-5G', signal: 45, security: 'WPA1' },
    ]);
  });

  it('Windows: 解析 netsh networks（含中文「信号/身份验证」字段）', async () => {
    setPlatform('win32');
    execWindowsTextMock.mockResolvedValue(
      [
        '接口名称 : WLAN',
        '',
        'SSID 1 : TUST-WIFI',
        '    身份验证 : WPA2-个人',
        '    信号 : 86%',
        '',
        'SSID 2 : Dorm-5G',
        '    身份验证 : 开放',
        '    信号 : 40%',
      ].join('\r\n')
    );

    const networks = await scanAvailableNetworks();

    expect(networks).toEqual([
      { ssid: 'TUST-WIFI', signal: 86, security: 'WPA2-个人' },
      { ssid: 'Dorm-5G', signal: 40, security: '开放' },
    ]);
  });

  it('nmcli 输出为空或只有空行时返回空数组', async () => {
    setPlatform('linux');
    mockExecOutput('\n  \n');

    await expect(scanAvailableNetworks()).resolves.toEqual([]);
  });

  it('netsh 输出无任何 SSID 块时返回空数组', async () => {
    setPlatform('win32');
    execWindowsTextMock.mockResolvedValue('接口名称 : WLAN\r\n当前没有可见的网络。\r\n');

    await expect(scanAvailableNetworks()).resolves.toEqual([]);
  });

  it('netsh 块缺少信号百分比时 signal 为 0', async () => {
    setPlatform('win32');
    execWindowsTextMock.mockResolvedValue('SSID 1 : NoSignal\r\n    身份验证 : 开放\r\n');

    const networks = await scanAvailableNetworks();
    expect(networks).toEqual([{ ssid: 'NoSignal', signal: 0, security: '开放' }]);
  });

  it('扫描失败时提供可重试的错误', async () => {
    setPlatform('linux');
    mockExecError('nmcli not found');

    await expect(scanAvailableNetworks()).rejects.toThrow('WiFi 扫描失败');
  });

  it('不支持的平台返回空数组', async () => {
    setPlatform('freebsd');
    await expect(scanAvailableNetworks()).resolves.toEqual([]);
  });
});

describe('connectToNetwork', () => {
  it('Linux: 精确 BSSID 作为独立参数传给正式连接命令', async () => {
    setPlatform('linux');
    await connectToNetwork('Campus', 'pw', 'WPA2', undefined, 'AA-BB-CC-DD-EE-01');
    expect(execFileMock.mock.calls[0][1]).toEqual([
      'dev',
      'wifi',
      'connect',
      'Campus',
      'password',
      'pw',
      'bssid',
      'aa:bb:cc:dd:ee:01',
    ]);
  });

  it('macOS: 系统连接到同名的其他接入点时明确失败', async () => {
    setPlatform('darwin');
    vi.useFakeTimers();
    const read = async () => ({
      connected: true,
      ssid: 'Campus',
      bssid: 'aa:bb:cc:dd:ee:02',
      ip: '192.0.2.10',
    });
    try {
      const result = expect(
        connectToNetwork('Campus', 'pw', 'WPA2', read, 'aa:bb:cc:dd:ee:01')
      ).rejects.toThrow('系统未连接到指定 BSSID');
      await vi.runAllTimersAsync();
      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it('macOS: 同 SSID 的切换等待目标 BSSID 和有效地址后再成功', async () => {
    setPlatform('darwin');
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        connected: true,
        ssid: 'Campus',
        bssid: 'aa:bb:cc:dd:ee:02',
        ip: '192.0.2.10',
      })
      .mockResolvedValue({
        connected: true,
        ssid: 'Campus',
        bssid: 'aa:bb:cc:dd:ee:01',
        ip: '192.0.2.11',
      });
    try {
      const result = connectToNetwork('Campus', 'pw', 'WPA2', read, 'aa:bb:cc:dd:ee:01');
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe(true);
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('Linux: 带密码连接经 execFile 参数数组调用 nmcli', async () => {
    setPlatform('linux');
    mockExecOutput('');

    await expect(connectToNetwork('TUST-WIFI', 'secret')).resolves.toBe(true);

    const [file, args, options] = execFileMock.mock.calls[0];
    expect(file).toBe('nmcli');
    expect(args).toEqual(['dev', 'wifi', 'connect', 'TUST-WIFI', 'password', 'secret']);
    expect(options).toMatchObject({ timeout: 30000 });
    // 连接命令不经 shell
    expect(execMock).not.toHaveBeenCalled();
  });

  it('Linux: 不带密码时连接已保存网络（参数不含 password 段）', async () => {
    setPlatform('linux');
    mockExecOutput('');

    await expect(connectToNetwork('TUST-WIFI')).resolves.toBe(true);
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual(['dev', 'wifi', 'connect', 'TUST-WIFI']);
    expect(args).not.toContain('password');
  });

  it('SSID 含引号/命令替换符时作为单一参数传递，不产生注入', async () => {
    setPlatform('linux');
    mockExecOutput('');

    const malicious = 'evil" && rm -rf / $(reboot) `id`';
    await connectToNetwork(malicious);

    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('nmcli');
    // 恶意 SSID 是一个完整参数，不会被 shell 解释
    expect(args).toContain(malicious);
    expect(args).toEqual(['dev', 'wifi', 'connect', malicious]);
  });

  it('密码含引号/分号时同样作为单一参数传递', async () => {
    setPlatform('linux');
    mockExecOutput('');

    await connectToNetwork('TUST-WIFI', 'p"; reboot #');
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual(['dev', 'wifi', 'connect', 'TUST-WIFI', 'password', 'p"; reboot #']);
  });

  it('macOS: 连接经 execFile 参数数组，interface 探测命令无用户输入', async () => {
    setPlatform('darwin');
    mockExecOutput('en0\n');

    await expect(connectToNetwork('Home', 'pw')).resolves.toBe(true);

    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('networksetup');
    expect(args).toEqual(['-setairportnetwork', 'en0', 'Home', 'pw']);
  });

  it('Windows: 按参数传递特殊字符 SSID，并等待目标网络地址就绪', async () => {
    setPlatform('win32');
    const malicious = 'evil" & del /f';
    execFileMock.mockImplementation(
      (
        _file: unknown,
        _args: unknown,
        _options: unknown,
        callback: (error: null, output: string, stderr: string) => void
      ) => callback(null, '', '')
    );
    await expect(
      connectToNetwork(malicious, '', 'Open', async () => ({
        ssid: malicious,
        connected: true,
        ip: '10.1.2.3',
      }))
    ).resolves.toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      'netsh',
      expect.arrayContaining(['wlan', 'add', 'profile', 'user=current']),
      expect.anything(),
      expect.any(Function)
    );
    expect(execFileMock).toHaveBeenCalledWith(
      'netsh',
      expect.arrayContaining(['wlan', 'connect']),
      expect.anything(),
      expect.any(Function)
    );
  });

  it('空 SSID 仍会发起连接（由上层守卫负责拦截）', async () => {
    setPlatform('linux');
    mockExecOutput('');

    await connectToNetwork('');
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toContain('');
  });

  it('Linux: 连接失败抛出带原因的错误', async () => {
    setPlatform('linux');
    mockExecError('NetworkManager timeout');

    await expect(connectToNetwork('TUST-WIFI')).rejects.toThrow('连接失败');
  });
});

describe('同名 WiFi 切换', () => {
  const rules = [
    { id: 'campus-open', ssid: 'Campus', password: '', security: 'open', priority: 1 },
    {
      id: 'campus-private',
      ssid: 'Campus',
      password: 'private-password',
      security: 'WPA2',
      bssid: 'aa:bb:cc:dd:ee:01',
      priority: 2,
    },
  ];
  it('按配置 ID 保留对应的密码、安全类型和 BSSID，旧 SSID 歧义调用被拒绝', async () => {
    const connect = vi.fn(async () => true);
    const service = new WifiSwitcherService({ connect });
    service.setConfiguredNetworks(rules);
    await expect(service.connectToConfiguredNetwork('Campus')).rejects.toThrow('存在同名 WiFi');
    expect(connect).not.toHaveBeenCalled();
    await expect(service.connectToConfiguredNetwork('campus-private')).resolves.toBe(true);
    expect(connect).toHaveBeenCalledWith(
      'Campus',
      'private-password',
      'WPA2',
      undefined,
      'aa:bb:cc:dd:ee:01'
    );
    service.setConfiguredNetworks([rules[0]]);
    await expect(service.connectToConfiguredNetwork('Campus')).resolves.toBe(true);
  });
  it('扫描身份选择精确规则，信息不足时停止自动切换', async () => {
    const scan = vi.fn(async () => [
      { ssid: 'Campus', signal: 90, security: 'WPA2', bssid: 'aa:bb:cc:dd:ee:01' },
    ]);
    const connect = vi.fn(async () => true);
    const service = new WifiSwitcherService({ scan, connect });
    service.setConfiguredNetworks(rules);
    await expect(service.switchToNextNetwork(null)).resolves.toEqual({
      success: true,
      ssid: 'Campus',
    });
    expect(connect).toHaveBeenCalledWith(
      'Campus',
      'private-password',
      'WPA2',
      undefined,
      'aa:bb:cc:dd:ee:01'
    );
    scan.mockResolvedValue([{ ssid: 'Campus', signal: 90, security: '', bssid: '' }]);
    connect.mockClear();
    await expect(service.switchToNextNetwork(null)).resolves.toEqual({
      success: false,
      ssid: null,
    });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('Windows profile and connection regressions', () => {
  it('纯 WPA3 使用 SAE，过渡网络使用兼容的 WPA2 连接方式', () => {
    expect(buildWindowsWifiProfile('Campus', 'password', 'WPA3').xml).toContain(
      '<authentication>WPA3SAE</authentication>'
    );
    expect(buildWindowsWifiProfile('Campus', 'password', 'WPA2-WPA3').xml).toContain(
      '<authentication>WPA2PSK</authentication>'
    );
  });
  it('encodes special SSID bytes and XML password characters', () => {
    const profile = buildWindowsWifiProfile('校园 & <wifi>', 'a<&"\'b', 'WPA2');
    expect(profile.xml).toContain(Buffer.from('校园 & <wifi>').toString('hex'));
    expect(profile.xml).toContain('校园 &amp; &lt;wifi&gt;');
    expect(profile.xml).toContain('a&lt;&amp;&quot;&apos;b');
    expect(buildWindowsWifiProfile('Open', '', '开放').xml).toContain(
      '<authentication>open</authentication>'
    );
    expect(() => buildWindowsWifiProfile('Enterprise', 'secret', 'WPA2-企业')).toThrow('系统');
    expect(() => buildWindowsWifiProfile('Personal', '', 'WPA2')).toThrow('密码');
  });
  it('reuses a managed system profile when the app password is cleared', async () => {
    setPlatform('win32');
    const name = buildWindowsWifiProfile('Saved', 'fake-password', 'WPA2').name;
    execWindowsFileTextMock.mockImplementation(async (_file, args) =>
      args.includes(`name=${name}`) ? `Profile: ${name}` : ''
    );
    await expect(
      connectToNetwork('Saved', '', 'WPA2', async () => ({
        connected: true,
        ssid: 'Saved',
        ip: '10.0.0.2',
      }))
    ).resolves.toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      'netsh',
      ['wlan', 'connect', `name=${name}`, 'ssid=Saved'],
      expect.anything(),
      expect.any(Function)
    );
    expect(execFileMock.mock.calls.some(([, args]) => args.includes('add'))).toBe(false);
  });
  it.each([false, true])(
    'cleans the credential file after completion or command error (failure=%s)',
    async (fail) => {
      setPlatform('win32');
      execWindowsFileTextMock.mockResolvedValue('');
      let credentialFile = '';
      execFileMock.mockImplementation((_file, args, _options, callback) => {
        if (args.includes('add')) {
          credentialFile = args.find((arg: string) => arg.startsWith('filename=')).slice(9);
          expect(readFileSync(credentialFile, 'utf8')).toContain('wifi-secret');
        }
        if (fail)
          callback(Object.assign(new Error('password=wifi-secret'), { code: 5 }), {
            stdout: '',
            stderr: 'password=wifi-secret',
          });
        else callback(null, { stdout: '', stderr: '' });
      });
      const promise = connectToNetwork('New', 'wifi-secret', 'WPA2', async () => ({
        ssid: 'New',
        connected: true,
        ip: '10.0.0.2',
      }));
      if (fail) await expect(promise).rejects.toThrow('系统错误 5');
      else await expect(promise).resolves.toBe(true);
      expect(credentialFile).not.toBe('');
      expect(existsSync(credentialFile)).toBe(false);
    }
  );
  it('waits through wrong SSID, disconnected and DHCP states before accepting target', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ connected: true, ssid: 'Other', ip: '10.0.0.2' })
      .mockResolvedValueOnce({ connected: false, ssid: 'Target', ip: '10.0.0.2' })
      .mockResolvedValueOnce({ connected: true, ssid: 'Target', ip: '169.254.1.2' })
      .mockResolvedValueOnce({ connected: true, ssid: 'Target', ip: '0.0.0.0' })
      .mockResolvedValue({ connected: true, ssid: 'Target', ip: '10.0.0.3' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(waitForTargetNetwork('Target', read, 3000, sleep)).resolves.toBe(true);
    expect(read).toHaveBeenCalledTimes(5);
    await expect(waitForTargetNetwork('Absent', read, 1000, sleep)).resolves.toBe(false);
  });
});
