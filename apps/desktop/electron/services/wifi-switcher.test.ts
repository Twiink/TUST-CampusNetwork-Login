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

import { connectToNetwork, scanAvailableNetworks } from './wifi-switcher';

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

  it('命令失败时返回空数组而非抛错', async () => {
    setPlatform('linux');
    mockExecError('nmcli not found');

    await expect(scanAvailableNetworks()).resolves.toEqual([]);
  });

  it('不支持的平台返回空数组', async () => {
    setPlatform('freebsd');
    await expect(scanAvailableNetworks()).resolves.toEqual([]);
  });
});

describe('connectToNetwork', () => {
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

  it('Windows: profile 检查与连接均经 execFile，SSID 含特殊字符不注入', async () => {
    setPlatform('win32');

    const malicious = 'evil" & del /f';
    execWindowsFileTextMock.mockResolvedValue(`接口名称 : WLAN\r\n配置文件 : ${malicious}`);
    await expect(connectToNetwork(malicious)).resolves.toBe(true);

    expect(execWindowsFileTextMock).toHaveBeenCalledWith(
      'netsh',
      ['wlan', 'show', 'profile', `name="${malicious}"`],
      3000
    );
    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('netsh');
    expect(args).toEqual(['wlan', 'connect', `name="${malicious}"`]);
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
