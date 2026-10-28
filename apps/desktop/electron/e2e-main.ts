import { readFileSync, writeFileSync, existsSync } from 'node:fs';
/** Dedicated E2E entry. Never imported by electron/main.ts or packaged releases. */
import { app } from 'electron';
import { createServer } from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createDefaultAppConfig, type WifiAdapter, type WifiDetails } from '@repo/shared';
import { runtimePorts } from './runtime-ports';

// Playwright's loader appends --password-store=basic; restore real isolated libsecret.
if (process.platform === 'linux') app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
const directory = process.env.NETMATE_E2E_USER_DATA_DIR;
if (!directory) throw new Error('An isolated userData directory is required');
app.setPath('userData', directory);
app.setPath('sessionData', directory);
const scenario = process.env.E2E_SCENARIO ?? 'authenticated';
const scannedSsids = ['TUST-WIFI', 'Home-WIFI', 'TUST-Backup', 'Nearby-WIFI'];
const bssidFor = (ssid: string) =>
  `00:11:22:33:44:${String(scannedSsids.indexOf(ssid) + 1).padStart(2, '0')}`;
const radio = {
  ssid:
    scenario === 'offline' || process.env.E2E_NETWORK_STATE === 'offline'
      ? null
      : scenario === 'no-auth'
        ? 'Home-WIFI'
        : 'TUST-WIFI',
  enabled: true,
  online: !['auth-required', 'unlinked', 'offline'].includes(scenario),
  failConnections: false,
  requests: [] as string[],
};
const server = createServer((request, response) => {
  const url = new URL(request.url!, 'http://localhost');
  if (url.pathname === '/generate_204') {
    response.writeHead(radio.online ? 204 : 200).end();
    return;
  }
  if (url.pathname.endsWith('/login')) {
    const username = url.searchParams.get('user_account') ?? '';
    radio.requests.push(username);
    radio.online = !username.includes('reject');
    response.end(
      `dr1005(${JSON.stringify({ status: radio.online ? 1 : 0, msg: radio.online ? '登录成功' : '账号拒绝' })})`
    );
    return;
  }
  if (url.pathname.endsWith('/logout')) {
    radio.online = false;
    response.end('jsonpReturn({"result":1,"msg":"注销成功"})');
    return;
  }
  response.writeHead(404).end();
});
const portFile = path.join(directory, 'portal-port');
const port = existsSync(portFile) ? Number(readFileSync(portFile, 'utf8')) : 0;
await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Portal did not start');
writeFileSync(portFile, String(address.port));
const portal = `http://127.0.0.1:${address.port}`;
const account = {
  id: 'a1',
  name: '测试账户',
  username: '20250001',
  password: 'e2e-pass',
  serverUrl: portal,
  isp: 'campus' as const,
};
const wifi = {
  id: 'w1',
  ssid: 'TUST-WIFI',
  password: 'wifi-pass',
  autoConnect: true,
  requiresAuth: true,
  linkedAccountIds: ['a1'],
  priority: 1,
  lastConnectedAt: null,
};
const home = {
  ...wifi,
  id: 'w2',
  ssid: 'Home-WIFI',
  requiresAuth: false,
  linkedAccountIds: [],
  priority: 10,
};
runtimePorts.seedConfig = createDefaultAppConfig({
  accounts: ['settings-empty', 'unlinked'].includes(scenario) ? [] : [account],
  currentAccountId: ['settings-empty', 'unlinked'].includes(scenario) ? null : account.id,
  wifiList: ['settings-empty', 'unconfigured'].includes(scenario)
    ? []
    : scenario === 'no-auth'
      ? [home]
      : scenario === 'multiple-wifi'
        ? [wifi, home, { ...wifi, id: 'w3', ssid: 'TUST-Backup', priority: 2 }]
        : [{ ...wifi, linkedAccountIds: scenario === 'unlinked' ? [] : ['a1'] }],
  settings: {
    ...createDefaultAppConfig().settings,
    autoLaunch: false,
    autoUpdate: false,
    autoReconnect: false,
    enableHeartbeat: true,
    startupAutoConnect: false,
  },
});
const details = (): WifiDetails | null =>
  radio.ssid
    ? {
        ssid: radio.ssid,
        bssid: bssidFor(radio.ssid),
        connected: true,
        ipv4: '10.1.2.3',
        mac: '001122334455',
        signalStrength: 80,
        linkSpeed: 866,
        frequency: 5000,
        security: 'WPA2',
        latency: {
          value: 12,
          status: 'good',
          target: '127.0.0.1',
          source: '受控网络',
          timestamp: Date.now(),
        },
      }
    : null;
runtimePorts.wifi = {
  isWifiEnabled: async () => radio.enabled,
  getCurrentWifi: async () => details(),
  getWifiDetails: async () => details(),
  getNetworkInfo: async () => ({ ipv4: radio.ssid ? '10.1.2.3' : undefined }),
  getSignalStrength: async () => 80,
  getLinkSpeed: async () => 866,
  getFrequency: async () => 5000,
  getChannel: async () => 36,
  getBSSID: async () => (radio.ssid ? bssidFor(radio.ssid) : null),
  getSecurity: async () => 'WPA2',
  connect: async (ssid) => {
    if (radio.failConnections) return false;
    radio.ssid = ssid;
    return true;
  },
  disconnect: async () => {
    radio.ssid = null;
    radio.online = false;
  },
  scan: async () => [],
} satisfies WifiAdapter;
runtimePorts.scanRaw = async () => ({
  platform: process.platform === 'win32' ? 'win32' : 'linux',
  text: scannedSsids
    .map((ssid, index) =>
      process.platform === 'win32'
        ? `SSID ${index + 1} : ${ssid}\r\n    Authentication : WPA2-Personal\r\n    BSSID 1 : ${bssidFor(ssid)}\r\n    Signal : 80%\r\n`
        : `${ssid}:80:WPA2:${bssidFor(ssid).replaceAll(':', '\\:')}`
    )
    .join('\n'),
});
runtimePorts.connect = async (ssid) => runtimePorts.wifi!.connect(ssid, '');
runtimePorts.connectivityUrls = [`${portal}/generate_204`];
runtimePorts.headlessShell = true;
let autoLaunch = false;
runtimePorts.autoLaunch = {
  isEnabled: async () => autoLaunch,
  enable: async () => {
    autoLaunch = true;
  },
  disable: async () => {
    autoLaunch = false;
  },
};
const updater = Object.assign(new EventEmitter(), {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  checkForUpdates: async () => {
    updater.emit('checking-for-update');
    updater.emit('update-not-available', { version: app.getVersion() });
  },
  downloadUpdate: async () => {
    updater.emit('download-progress', { percent: 100, bytesPerSecond: 100 });
    updater.emit('update-downloaded', { version: '2.0.0' });
  },
  quitAndInstall: () => undefined,
});
runtimePorts.updater = updater as unknown as NonNullable<typeof runtimePorts.updater>;
runtimePorts.saveLogPath = async (extension) => path.join(directory, `export.${extension}`);
runtimePorts.openPath = async () => '';
Object.assign(globalThis, { netmateHardware: radio, netmateReady: false });
runtimePorts.onReady = () => Object.assign(globalThis, { netmateReady: true });
app.on('will-quit', () => server.close());
await import('./main');
