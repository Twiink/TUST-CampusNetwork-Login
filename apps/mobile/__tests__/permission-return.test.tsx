// Permission settings return paths using the real wrapper and controlled lifecycle events.
import { act, renderHook } from '@testing-library/react-native';
import {
  type AppStateStatus,
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { usePermissionGuide } from '../src/hooks/usePermissionGuide';

it.each([
  [true, true],
  [false, true],
  [true, false],
  [false, false],
])('settings return completes immediately (early=%s, granted=%s)', async (early, allowed) => {
  jest.useFakeTimers();
  const previousOS = Platform.OS;
  const previousVersion = Platform.Version;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });
  const listeners = new Set<(state: AppStateStatus) => void>();
  const watch = jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => {
    listeners.add(callback);
    return { remove: () => listeners.delete(callback) };
  });
  let granted = false;
  const check = jest
    .spyOn(PermissionsAndroid, 'check')
    .mockImplementation(
      async permission =>
        permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION || granted
    );
  NativeModules.PermissionModule = {
    openAppSettings: jest.fn(async () => {
      // Starting the settings Activity can deliver this before the native Promise resolves.
      if (early) listeners.forEach(listener => listener('background'));
      return true;
    }),
    isIgnoringBatteryOptimizations: jest.fn().mockResolvedValue(true),
    hasAutoStartSettings: jest.fn().mockResolvedValue(false),
  };
  const { result, unmount } = renderHook(() =>
    usePermissionGuide({
      ready: false,
      autoAuthEnabled: false,
      addLog: jest.fn(),
    })
  );
  let completed = false;
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.request('backgroundLocation').then(() => {
      completed = true;
    });
    for (let index = 0; index < 15; index++) await Promise.resolve();
  });
  expect(NativeModules.PermissionModule.openAppSettings).toHaveBeenCalledTimes(1);
  if (!early) listeners.forEach(listener => listener('background'));
  granted = allowed;
  await act(async () => {
    listeners.forEach(listener => listener('active'));
    for (let index = 0; index < 10; index++) await Promise.resolve();
  });
  expect(completed).toBe(true);
  await pending;
  unmount();
  watch.mockRestore();
  check.mockRestore();
  delete NativeModules.PermissionModule;
  Object.defineProperty(Platform, 'OS', { value: previousOS, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: previousVersion, configurable: true });
  jest.useRealTimers();
});
