import { NativeModules, Platform } from 'react-native';

type AutoStartModule = typeof import('../src/native/AutoStart');
type BackgroundServiceModule = typeof import('../src/native/BackgroundService');

const originalOS = Platform.OS;

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function loadAutoStart(): AutoStartModule {
  let loaded!: AutoStartModule;
  jest.isolateModules(() => {
    loaded = require('../src/native/AutoStart') as AutoStartModule;
  });
  return loaded;
}

function loadBackgroundService(): BackgroundServiceModule {
  let loaded!: BackgroundServiceModule;
  jest.isolateModules(() => {
    loaded = require('../src/native/BackgroundService') as BackgroundServiceModule;
  });
  return loaded;
}

describe('AutoStart native bridge', () => {
  const original = NativeModules.AutoStartModule;

  afterEach(() => {
    NativeModules.AutoStartModule = original;
    setPlatform(originalOS);
  });

  it('Android 模块可用时读写开机自启状态', async () => {
    const nativeModule = {
      isEnabled: jest.fn().mockResolvedValue(true),
      setEnabled: jest.fn().mockResolvedValue(true),
    };
    NativeModules.AutoStartModule = nativeModule;
    setPlatform('android');
    const autoStart = loadAutoStart();

    expect(autoStart.isAutoStartAvailable()).toBe(true);
    await expect(autoStart.isAutoStartEnabled()).resolves.toBe(true);
    await expect(autoStart.setAutoStartEnabled(false)).resolves.toBe(true);
    expect(nativeModule.setEnabled).toHaveBeenCalledWith(false);
  });

  it('非 Android 或原生调用失败时安全降级', async () => {
    NativeModules.AutoStartModule = {
      isEnabled: jest.fn().mockRejectedValue(new Error('io')),
      setEnabled: jest.fn().mockRejectedValue(new Error('io')),
    };
    setPlatform('android');
    const autoStart = loadAutoStart();

    await expect(autoStart.isAutoStartEnabled()).resolves.toBe(false);
    await expect(autoStart.setAutoStartEnabled(true)).resolves.toBe(false);

    setPlatform('ios');
    const iosModule = loadAutoStart();
    expect(iosModule.isAutoStartAvailable()).toBe(false);
    await expect(iosModule.isAutoStartEnabled()).resolves.toBe(false);
    await expect(iosModule.setAutoStartEnabled(true)).resolves.toBe(false);
  });
});

describe('BackgroundService native bridge', () => {
  const original = NativeModules.BackgroundServiceModule;

  afterEach(() => {
    NativeModules.BackgroundServiceModule = original;
    setPlatform(originalOS);
  });

  it('Android 模块可用时转发启动、停止和运行状态', async () => {
    const nativeModule = {
      startService: jest.fn().mockResolvedValue(true),
      stopService: jest.fn().mockResolvedValue(true),
      isRunning: jest.fn().mockResolvedValue(true),
    };
    NativeModules.BackgroundServiceModule = nativeModule;
    setPlatform('android');
    const background = loadBackgroundService();

    await expect(background.startBackgroundService()).resolves.toBe(true);
    expect(nativeModule.startService).toHaveBeenCalledWith(30000);
    await expect(background.stopBackgroundService()).resolves.toBe(true);
    await expect(background.isBackgroundServiceRunning()).resolves.toBe(true);
  });

  it('非 Android 或原生异常时返回 false', async () => {
    setPlatform('ios');
    const iosModule = loadBackgroundService();
    await expect(iosModule.startBackgroundService(1000)).resolves.toBe(false);
    await expect(iosModule.stopBackgroundService()).resolves.toBe(false);
    await expect(iosModule.isBackgroundServiceRunning()).resolves.toBe(false);

    NativeModules.BackgroundServiceModule = {
      startService: jest.fn().mockRejectedValue(new Error('start')),
      stopService: jest.fn().mockRejectedValue(new Error('stop')),
      isRunning: jest.fn().mockRejectedValue(new Error('status')),
    };
    setPlatform('android');
    const androidModule = loadBackgroundService();
    await expect(androidModule.startBackgroundService(5000)).resolves.toBe(false);
    await expect(androidModule.stopBackgroundService()).resolves.toBe(false);
    await expect(androidModule.isBackgroundServiceRunning()).resolves.toBe(false);
  });
});
