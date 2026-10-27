import type { AppConfig, WifiAdapter } from '@repo/shared';
import type { autoUpdater } from 'electron-updater';
import type { scanAvailableNetworks, connectToNetwork } from './services/wifi-switcher';

/** OS / external-service boundaries. The release entry never installs test ports. */
export const runtimePorts: {
  wifi?: WifiAdapter;
  scan?: typeof scanAvailableNetworks;
  connect?: typeof connectToNetwork;
  connectivityUrls?: string[];
  seedConfig?: AppConfig;
  updater?: typeof autoUpdater;
  autoLaunch?: { isEnabled(): Promise<boolean>; enable(): Promise<void>; disable(): Promise<void> };
  saveLogPath?: (extension: string) => Promise<string>;
  openPath?: (path: string) => Promise<string>;
  headlessShell?: boolean;
} = {};
