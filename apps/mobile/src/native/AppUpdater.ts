/**
 * 应用内更新 TypeScript 模块
 *
 * 通过 GitHub Releases API 检查和下载更新
 */

import { Platform, Linking, Alert } from 'react-native';

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

// GitHub 仓库信息
const GITHUB_OWNER = 'your-username'; // 需要替换为实际的用户名
const GITHUB_REPO = 'TUST-CampusNetwork-Login';

/**
 * 获取当前应用版本
 */
export function getCurrentVersion(): string {
  // 从 package.json 或原生模块获取版本
  return '0.0.1'; // 临时值，实际应从原生模块获取
}

/**
 * 比较版本号
 *
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

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
export async function checkForUpdate(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(
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
  } catch (error) {
    console.warn('Failed to check for update:', error);
    return null;
  }
}

/**
 * 获取适合当前平台的下载资源
 */
export function getPlatformAsset(release: ReleaseInfo): ReleaseAsset | null {
  if (Platform.OS === 'android') {
    // 查找 APK 文件
    return (
      release.assets.find(
        asset =>
          asset.name.endsWith('.apk') ||
          asset.contentType === 'application/vnd.android.package-archive'
      ) || null
    );
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
  const asset = getPlatformAsset(release);

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
      onPress: () => openDownloadPage(release),
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

export default {
  getCurrentVersion,
  compareVersions,
  checkForUpdate,
  getPlatformAsset,
  openDownloadPage,
  showUpdateDialog,
  checkAndPromptUpdate,
};
