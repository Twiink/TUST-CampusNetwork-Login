/**
 * 移动端共享服务装配（自 AppContext 抽出）：
 * 存储适配器（keychain 加密）→ ConfigManager/AuthService/AccountManager/WifiManager/NetworkDetector。
 */

import {
  createConfigManager,
  createAuthService,
  createAccountManager,
  createWifiManager,
  createNetworkDetector,
  createLogger,
} from '@repo/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSecureStorage } from '../services/secureStorage';
import { createMobileWifiAdapter } from '../services/MobileWifiAdapter';

/** React Native 存储适配器（JSON 序列化 + AsyncStorage） */
export function createReactNativeStorage() {
  return {
    async get<T>(key: string): Promise<T | null> {
      const value = await AsyncStorage.getItem(key);
      if (value === null) return null;
      const parsed = JSON.parse(value);
      if (parsed === null) throw new Error('存储值无效，原数据已保留');
      return parsed;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      await AsyncStorage.removeItem(key);
    },
    async clear(): Promise<void> {
      await AsyncStorage.multiRemove(['app_config']);
    },
    async keys(): Promise<string[]> {
      const keys = await AsyncStorage.getAllKeys();
      return keys.filter(key => key === 'app_config');
    },
  };
}

export interface MobileServices {
  authService: ReturnType<typeof createAuthService>;
  configManager: ReturnType<typeof createConfigManager>;
  accountManager: ReturnType<typeof createAccountManager>;
  wifiManager: ReturnType<typeof createWifiManager>;
  networkDetector: ReturnType<typeof createNetworkDetector>;
  logger: ReturnType<typeof createLogger>;
}

export function createMobileServices(): MobileServices {
  // 存储适配器（敏感字段经 keychain 加密保护）
  const storage = createSecureStorage(createReactNativeStorage());

  const logger = createLogger(500);
  const configManager = createConfigManager(storage);
  const authService = createAuthService();
  const accountManager = createAccountManager(configManager);
  const wifiManager = createWifiManager(configManager);
  const networkDetector = createNetworkDetector(createMobileWifiAdapter());

  return {
    authService,
    configManager,
    accountManager,
    wifiManager,
    networkDetector,
    logger,
  };
}
