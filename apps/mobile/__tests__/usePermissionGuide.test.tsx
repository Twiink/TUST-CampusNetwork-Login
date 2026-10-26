import { renderHook, waitFor } from '@testing-library/react-native';
import { Alert, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePermissionGuide } from '../src/hooks/usePermissionGuide';

type AlertButton = { text?: string; onPress?: () => void; style?: string };

// jest.setup.ts 把 Alert 替换为 jest.fn()
const alertMock = Alert.alert as jest.Mock;

const permissionModule = {
  isIgnoringBatteryOptimizations: jest.fn().mockResolvedValue(true),
  requestIgnoreBatteryOptimizations: jest.fn().mockResolvedValue(true),
  hasAutoStartSettings: jest.fn().mockResolvedValue(false),
  openAutoStartSettings: jest.fn().mockResolvedValue('none'),
  openAppSettings: jest.fn().mockResolvedValue(true),
};

const originalOS = Platform.OS;
const originalVersion = Platform.Version;

function setPlatform(os: string, version: number) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

describe('usePermissionGuide', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    alertMock.mockReset();
    await AsyncStorage.clear();
    setPlatform('android', 33);
    NativeModules.PermissionModule = permissionModule;
  });

  afterEach(() => {
    delete NativeModules.PermissionModule;
    setPlatform(originalOS, originalVersion as number);
  });

  it('首次启动按顺序先说明再弹系统授权，完成后不再自动引导', async () => {
    const granted = new Set<string>();
    jest.spyOn(PermissionsAndroid, 'check').mockImplementation(async p => granted.has(p));
    const request = jest.spyOn(PermissionsAndroid, 'request').mockImplementation(async p => {
      granted.add(p);
      return PermissionsAndroid.RESULTS.GRANTED;
    });
    const titles: string[] = [];
    // 说明对话框：定位、通知同意；后台定位跳过
    alertMock.mockImplementation((title: string, _message: string, buttons?: AlertButton[]) => {
      titles.push(title);
      const list = (buttons ?? []) as AlertButton[];
      const choice =
        title === '后台位置权限'
          ? list.find(b => b.style === 'cancel')
          : list.find(b => b.style !== 'cancel');
      choice?.onPress?.();
    });
    const onLocationGranted = jest.fn();

    const { result, unmount } = renderHook(() =>
      usePermissionGuide({
        ready: true,
        autoAuthEnabled: true,
        addLog: jest.fn(),
        onLocationGranted,
      })
    );

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('netmate:permission-guide-done')).toBe('1')
    );

    // 电池优化已在白名单、无厂商自启动页：不打扰
    expect(titles).toEqual(['位置权限', '通知权限', '后台位置权限']);
    expect(request.mock.calls.map(call => call[0])).toEqual([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    ]);
    expect(onLocationGranted).toHaveBeenCalledTimes(1);
    expect(permissionModule.openAppSettings).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.items.find(item => item.key === 'location')?.state).toBe('granted')
    );
    unmount();

    // 再次启动：引导已完成，不再弹窗
    alertMock.mockClear();
    const second = renderHook(() =>
      usePermissionGuide({ ready: true, autoAuthEnabled: true, addLog: jest.fn() })
    );
    await waitFor(() => expect(second.result.current.items.length).toBe(5));
    expect(alertMock).not.toHaveBeenCalled();
    second.unmount();
  });

  it('开启自动重连时重新引导尚未授予的项', async () => {
    await AsyncStorage.setItem('netmate:permission-guide-done', '1');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    const alert = alertMock.mockImplementation(
      (_t: string, _m: string, buttons?: AlertButton[]) => {
        ((buttons ?? []) as AlertButton[]).find(b => b.style === 'cancel')?.onPress?.();
      }
    );

    const { rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePermissionGuide({ ready: true, autoAuthEnabled: enabled, addLog: jest.fn() }),
      { initialProps: { enabled: false } }
    );
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(alert).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(alert).toHaveBeenCalled());
    // 全部跳过时也不阻塞、不报错
    expect(alert.mock.calls[0][0]).toBe('位置权限');
    unmount();
  });
});
