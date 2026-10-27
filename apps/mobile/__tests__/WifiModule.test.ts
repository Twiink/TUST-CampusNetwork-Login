import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as WifiModule from '../src/native/WifiModule';

const nativeWifi = NativeModules.WifiModule as Record<string, jest.Mock>;
const originalOS = Platform.OS;

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

describe('WifiModule bridge', () => {
  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  it('组合 WiFi 状态并透传原生读取结果', async () => {
    nativeWifi.isConnected.mockResolvedValueOnce(true);
    nativeWifi.getCurrentSSID.mockResolvedValueOnce('TUST-5G');

    await expect(WifiModule.getWifiStatus()).resolves.toEqual({
      connected: true,
      ssid: 'TUST-5G',
    });

    nativeWifi.isConnected.mockResolvedValueOnce(false);
    nativeWifi.getCurrentSSID.mockClear();
    await expect(WifiModule.getWifiStatus()).resolves.toEqual({
      connected: false,
      ssid: null,
    });
    expect(nativeWifi.getCurrentSSID).not.toHaveBeenCalled();
  });

  it('原生读取失败时返回保守默认值', async () => {
    nativeWifi.getNetworkInfo.mockRejectedValueOnce(new Error('native'));
    nativeWifi.scanWifiNetworks.mockRejectedValueOnce(new Error('native'));
    nativeWifi.connectToWifi.mockRejectedValueOnce(new Error('native'));
    nativeWifi.disconnectWifi.mockRejectedValueOnce(new Error('native'));

    await expect(WifiModule.getNetworkInfo()).resolves.toEqual({
      wifiEnabled: false,
      connected: false,
      ssid: null,
      ipv4: null,
      ipv6: null,
      mac: null,
    });
    await expect(WifiModule.scanWifiNetworks()).resolves.toEqual([]);
    await expect(WifiModule.connectToWifi('TUST', 'pass')).resolves.toBe(false);
    await expect(WifiModule.disconnectWifi()).resolves.toBe(false);
  });

  it('权限申请和状态读取在 Android 上走原生桥接', async () => {
    setPlatform('android');
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    nativeWifi.checkLocationPermission.mockResolvedValueOnce(true);

    await expect(WifiModule.requestLocationPermission()).resolves.toBe(true);
    expect(request).toHaveBeenCalled();
    await expect(WifiModule.hasLocationPermission()).resolves.toBe(true);
  });

  it('权限桥接异常时不会把失败当成已授权', async () => {
    setPlatform('android');
    jest.spyOn(PermissionsAndroid, 'request').mockRejectedValueOnce(new Error('permission'));
    nativeWifi.checkLocationPermission.mockRejectedValueOnce(new Error('permission'));

    await expect(WifiModule.requestLocationPermission()).resolves.toBe(false);
    await expect(WifiModule.hasLocationPermission()).resolves.toBe(false);
  });

  it('监听启停失败时返回 false 并清理订阅', async () => {
    nativeWifi.startWatching = jest.fn().mockRejectedValueOnce(new Error('start'));
    nativeWifi.stopWatching = jest.fn().mockRejectedValueOnce(new Error('stop'));

    await expect(WifiModule.startWatching()).resolves.toBe(false);
    await expect(WifiModule.stopWatching()).resolves.toBe(false);
  });
});
