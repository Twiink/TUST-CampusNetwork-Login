/**
 * 应用内更新 TypeScript 模块
 *
 * 通过 GitHub Releases API 检查和下载更新
 */

import { NativeModules, Platform, Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
  contentType: string;
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  progress: number;
  version: string | null;
  error: string | null;
}

// GitHub 仓库信息（与 git remote origin 一致）
const GITHUB_OWNER = 'Twiink';
const GITHUB_REPO = 'TUST-CampusNetwork-Login';
/** 自动检查的最短间隔，避免每次冷启动都请求 GitHub API（未认证限额 60 次/小时） */
const AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const LAST_CHECK_KEY = 'netmate:update-last-check';

/**
 * 获取当前应用版本
 */
export function getCurrentVersion(): string {
  return DeviceInfo.getVersion();
}

/**
 * 比较版本号
 *
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split(/[+-]/)[0].split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split(/[+-]/)[0].split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * 检查更新
 */
export async function checkForUpdate(throwOnError = false): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(
      NativeModules.NetMateUpdater?.updateFeedUrl ??
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const currentVersion = getCurrentVersion();
    const latestVersion = data.tag_name.replace(/^v/, '');

    // 检查是否有新版本
    if (compareVersions(latestVersion, currentVersion) > 0) {
      return {
        version: latestVersion,
        tagName: data.tag_name,
        name: data.name,
        body: data.body,
        htmlUrl: data.html_url,
        publishedAt: data.published_at,
        assets: data.assets.map((asset: any) => ({
          name: asset.name,
          downloadUrl: asset.browser_download_url,
          size: asset.size,
          contentType: asset.content_type,
        })),
      };
    }

    return null;
  } catch {
    if (throwOnError) throw new Error('检查更新失败，请检查网络后重试');
    return null;
  }
}

/**
 * 获取适合当前平台的下载资源
 * Android 发布 ABI 分包（app-<abi>-release.apk）与通用包（app-universal-release.apk），
 * 优先选择与设备首选 ABI 匹配的分包，体积更小；匹配不到时用通用包。
 */
export function getPlatformAsset(
  release: ReleaseInfo,
  supportedAbis: string[] = []
): ReleaseAsset | null {
  if (Platform.OS === 'android') {
    const apks = release.assets.filter(
      asset =>
        asset.name.endsWith('.apk') ||
        asset.contentType === 'application/vnd.android.package-archive'
    );
    for (const abi of supportedAbis) {
      const match = apks.find(asset => asset.name.includes(`-${abi}-`));
      if (match) return match;
    }
    return apks.find(asset => asset.name.includes('universal')) || apks[0] || null;
  }

  if (Platform.OS === 'ios') {
    // iOS 通常使用 App Store 或 TestFlight
    return null;
  }

  return null;
}

/**
 * 打开下载页面
 */
export async function openDownloadPage(release: ReleaseInfo): Promise<void> {
  const abis = Platform.OS === 'android' ? await DeviceInfo.supportedAbis().catch(() => []) : [];
  const asset = getPlatformAsset(release, abis);

  if (asset) {
    await Linking.openURL(asset.downloadUrl);
  } else {
    // 打开 GitHub Releases 页面
    await Linking.openURL(release.htmlUrl);
  }
}

/**
 * 显示更新对话框
 */
export function showUpdateDialog(release: ReleaseInfo): void {
  Alert.alert(`发现新版本 ${release.version}`, release.body || '有新版本可用，是否现在更新？', [
    {
      text: '稍后',
      style: 'cancel',
    },
    {
      text: '更新',
      onPress: () => {
        startUpdateDownload(release).catch(() => Alert.alert('下载失败', '请在配置设置中重试更新'));
      },
    },
  ]);
}

/**
 * 检查并提示更新
 */
export async function checkAndPromptUpdate(): Promise<boolean> {
  const release = await checkForUpdate();

  if (release) {
    showUpdateDialog(release);
    return true;
  }

  return false;
}

/**
 * 启动时自动检查更新（settings.autoUpdate 开启时调用）。
 * 距上次检查不足 12 小时则跳过；发现新版本时弹出更新对话框。
 */
export async function autoCheckForUpdate(now: number = Date.now()): Promise<ReleaseInfo | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const last = Number(await AsyncStorage.getItem(LAST_CHECK_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < AUTO_CHECK_INTERVAL_MS) {
      return null;
    }
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(now));
  } catch {
    // 存储不可用时照常检查
  }
  const release = await checkForUpdate();
  if (release) {
    showUpdateDialog(release);
  }
  return release;
}

export default {
  autoCheckForUpdate,
  getCurrentVersion,
  compareVersions,
  checkForUpdate,
  getPlatformAsset,
  openDownloadPage,
  showUpdateDialog,
  checkAndPromptUpdate,
};

export interface DownloadStatus {
  state: 'idle' | 'downloading' | 'downloaded' | 'failed';
  progress: number;
  version: string | null;
  error?: string;
  message?: string;
  installAllowed: boolean;
}
const updater = NativeModules.NetMateUpdater as
  | {
      start(url: string, version: string): Promise<DownloadStatus>;
      getStatus(): Promise<DownloadStatus>;
      cancel(): Promise<DownloadStatus>;
      install(): Promise<'permission-required' | 'installer-opened'>;
    }
  | undefined;
export async function getDownloadStatus(): Promise<DownloadStatus> {
  return updater
    ? updater.getStatus()
    : { state: 'idle', progress: 0, version: null, installAllowed: false };
}
export async function startUpdateDownload(release: ReleaseInfo): Promise<DownloadStatus> {
  const asset = getPlatformAsset(release, await DeviceInfo.supportedAbis().catch(() => []));
  if (!updater || !asset) throw new Error('当前平台没有可用的安装包');
  return updater.start(asset.downloadUrl, release.version);
}
export async function cancelUpdateDownload(): Promise<DownloadStatus> {
  if (!updater) throw new Error('更新模块不可用');
  return updater.cancel();
}
export async function installDownloadedUpdate(): Promise<
  'permission-required' | 'installer-opened'
> {
  if (!updater) throw new Error('更新模块不可用');
  return updater.install();
}
