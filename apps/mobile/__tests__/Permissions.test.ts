import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { checkPermission, getPermissionItems, requestPermission } from '../src/native/Permissions';

const permissionModule = {
  isIgnoringBatteryOptimizations: jest.fn(),
  requestIgnoreBatteryOptimizations: jest.fn().mockResolvedValue(true),
  hasAutoStartSettings: jest.fn(),
  openAutoStartSettings: jest.fn().mockResolvedValue('vendor'),
  openAppSettings: jest.fn().mockResolvedValue(true),
};

const originalOS = Platform.OS;
const originalVersion = Platform.Version;
type PermissionGrants = Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;

function setPlatform(os: string, version: number) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

describe('Permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('android', 34);
    NativeModules.PermissionModule = permissionModule;
    permissionModule.isIgnoringBatteryOptimizations.mockResolvedValue(false);
    permissionModule.hasAutoStartSettings.mockResolvedValue(true);
  });

  afterEach(() => {
    delete NativeModules.PermissionModule;
    setPlatform(originalOS, originalVersion as number);
  });

  it('定位权限走系统弹窗，永久拒绝后改为跳转设置页', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const request = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    } as PermissionGrants);

    await expect(requestPermission('location')).resolves.toBe('blocked');
    expect(request).toHaveBeenCalledWith([
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    await expect(checkPermission('location')).resolves.toBe('blocked');

    // 再次申请不再弹窗，直接打开应用设置页
    request.mockClear();
    await expect(requestPermission('location')).resolves.toBe('unknown');
    expect(request).not.toHaveBeenCalled();
    expect(permissionModule.openAppSettings).toHaveBeenCalled();
  });

  it('Android 11+ 后台定位跳转设置页，且要求先授予前台定位', async () => {
    const check = jest.spyOn(PermissionsAndroid, 'check');
    const request = jest.spyOn(PermissionsAndroid, 'request');

    // 前台定位未授予：不申请后台定位
    check.mockResolvedValue(false);
    await expect(requestPermission('backgroundLocation')).resolves.toBe('denied');
    expect(permissionModule.openAppSettings).not.toHaveBeenCalled();

    // 前台已授予、后台未授予
    check.mockImplementation(
      async permission => permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    await expect(requestPermission('backgroundLocation')).resolves.toBe('unknown');
    expect(permissionModule.openAppSettings).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('Android 10 后台定位可以直接弹窗', async () => {
    setPlatform('android', 29);
    jest
      .spyOn(PermissionsAndroid, 'check')
      .mockImplementation(
        async permission => permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    await expect(requestPermission('backgroundLocation')).resolves.toBe('granted');
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
  });

  it('Android 12 仅授予粗略定位时不会报告 WiFi 定位已授权', async () => {
    setPlatform('android', 31);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: PermissionsAndroid.RESULTS.DENIED,
    } as PermissionGrants);
    await expect(requestPermission('location')).resolves.toBe('denied');
  });

  it('通知权限仅 Android 13+ 需要', async () => {
    setPlatform('android', 31);
    await expect(checkPermission('notification')).resolves.toBe('unsupported');
    setPlatform('android', 33);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    await expect(checkPermission('notification')).resolves.toBe('granted');
  });

  it('附近 WiFi 权限在 Android 13+ 申请，旧版本不申请', async () => {
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    setPlatform('android', 28);
    await expect(requestPermission('nearbyWifi')).resolves.toBe('unsupported');
    expect(request).not.toHaveBeenCalled();
    setPlatform('android', 33);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    await expect(requestPermission('nearbyWifi')).resolves.toBe('granted');
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
  });

  it('电池优化走系统对话框，自启动跳厂商页面', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

    await expect(requestPermission('battery')).resolves.toBe('unknown');
    expect(permissionModule.requestIgnoreBatteryOptimizations).toHaveBeenCalled();

    await expect(requestPermission('autoStart')).resolves.toBe('unknown');
    expect(permissionModule.openAutoStartSettings).toHaveBeenCalled();

    permissionModule.isIgnoringBatteryOptimizations.mockResolvedValue(true);
    await expect(requestPermission('battery')).resolves.toBe('granted');
  });

  it('没有厂商自启动页面的设备不展示该项', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    permissionModule.hasAutoStartSettings.mockResolvedValue(false);
    permissionModule.isIgnoringBatteryOptimizations.mockResolvedValue(true);

    const items = await getPermissionItems();
    expect(items.map(item => [item.key, item.state])).toEqual([
      ['location', 'granted'],
      ['nearbyWifi', 'granted'],
      ['notification', 'granted'],
      ['battery', 'granted'],
      ['backgroundLocation', 'granted'],
      ['autoStart', 'unsupported'],
    ]);
  });

  it('非 Android 平台全部视为无需设置', async () => {
    setPlatform('ios', 17);
    await expect(checkPermission('location')).resolves.toBe('unsupported');
    await expect(requestPermission('battery')).resolves.toBe('unsupported');
  });
});
