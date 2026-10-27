import * as WifiModule from '../src/native/WifiModule';
import { MobileWifiAdapter } from '../src/services/MobileWifiAdapter';

jest.mock('../src/native/WifiModule', () => ({
  getNetworkInfo: jest.fn(),
  connectToWifi: jest.fn(),
  disconnectWifi: jest.fn(),
  scanWifiNetworks: jest.fn(),
}));

const networkInfo: WifiModule.NetworkInfo = {
  wifiEnabled: true,
  connected: true,
  ssid: 'TUST-WIFI',
  signalStrength: 82,
  linkSpeed: 433,
  bssid: 'aa:bb:cc:dd:ee:ff',
  frequency: 5180,
  channel: 36,
  security: 'WPA2',
  ipv4: '10.1.2.3',
  ipv6: '2001:db8::1',
  mac: '00:11:22:33:44:55',
  gateway: '10.1.0.1',
  dns: ['10.1.0.2'],
  subnetMask: '255.255.240.0',
};

describe('MobileWifiAdapter', () => {
  const getNetworkInfo = WifiModule.getNetworkInfo as jest.Mock;
  const scanWifiNetworks = WifiModule.scanWifiNetworks as jest.Mock;
  const connectToWifi = WifiModule.connectToWifi as jest.Mock;
  const disconnectWifi = WifiModule.disconnectWifi as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getNetworkInfo.mockResolvedValue(networkInfo);
    scanWifiNetworks.mockResolvedValue([]);
    connectToWifi.mockResolvedValue(true);
    disconnectWifi.mockResolvedValue(true);
  });

  it('读取当前 WiFi 并合并详细网络字段', async () => {
    const adapter = new MobileWifiAdapter();

    await expect(adapter.getCurrentWifi()).resolves.toEqual({
      ssid: 'TUST-WIFI',
      bssid: 'aa:bb:cc:dd:ee:ff',
      signalStrength: 82,
      linkSpeed: 433,
      frequency: 5180,
      channel: 36,
      security: 'WPA2',
      connected: true,
    });
    await expect(adapter.getWifiDetails()).resolves.toEqual(
      expect.objectContaining({
        ssid: 'TUST-WIFI',
        ipv4: '10.1.2.3',
        ipv6: '2001:db8::1',
        mac: '00:11:22:33:44:55',
        gateway: '10.1.0.1',
        dns: ['10.1.0.2'],
        subnetMask: '255.255.240.0',
      })
    );
  });

  it('未连接或没有 SSID 时返回空状态', async () => {
    getNetworkInfo.mockResolvedValue({
      ...networkInfo,
      connected: false,
      ssid: null,
    });
    const adapter = new MobileWifiAdapter();

    await expect(adapter.getCurrentWifi()).resolves.toBeNull();
    await expect(adapter.getWifiDetails()).resolves.toBeNull();
    await expect(adapter.getSignalStrength()).resolves.toBe(0);
    await expect(adapter.getChannel()).resolves.toBeNull();
  });

  it('并发读取共享缓存，避免重复访问原生模块', async () => {
    const adapter = new MobileWifiAdapter();

    await Promise.all([adapter.getCurrentWifi(), adapter.getCurrentWifi()]);
    await adapter.getCurrentWifi();

    expect(getNetworkInfo).toHaveBeenCalledTimes(1);
  });

  it('原生读取失败时降级为无 WiFi 信息', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    getNetworkInfo
      .mockRejectedValueOnce(new Error('native unavailable'))
      .mockRejectedValueOnce(new Error('native unavailable'));
    const adapter = new MobileWifiAdapter();

    await expect(adapter.getCurrentWifi()).resolves.toBeNull();
    await expect(adapter.getNetworkInfo()).resolves.toEqual({});
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('扫描结果过滤空 SSID 并去除首尾空白', async () => {
    scanWifiNetworks.mockResolvedValue([
      { ssid: '  TUST-5G  ', signalStrength: 70 },
      { ssid: '' },
      { ssid: '   ' },
      { ssid: null },
      { ssid: 'TUST-2.4G', signalStrength: 0 },
    ]);
    const adapter = new MobileWifiAdapter();

    await expect(adapter.scan()).resolves.toEqual([
      expect.objectContaining({ ssid: 'TUST-5G', connected: false }),
      expect.objectContaining({ ssid: 'TUST-2.4G', connected: false }),
    ]);
  });

  it('连接与断开操作会透传原生结果', async () => {
    const adapter = new MobileWifiAdapter();

    await expect(adapter.connect('TUST-5G', 'password')).resolves.toBe(true);
    expect(connectToWifi).toHaveBeenCalledWith('TUST-5G', 'password');

    await adapter.disconnect();
    expect(disconnectWifi).toHaveBeenCalledTimes(1);
  });
});
