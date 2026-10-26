import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { autoCheckForUpdate, getPlatformAsset, type ReleaseInfo } from '../src/native/AppUpdater';

const apk = (name: string) => ({
  name,
  downloadUrl: `https://example.invalid/${name}`,
  size: 1,
  contentType: 'application/vnd.android.package-archive',
});

const release: ReleaseInfo = {
  version: '9.9.9',
  tagName: 'v9.9.9',
  name: 'NetMate v9.9.9',
  body: '',
  htmlUrl: 'https://github.com/Twiink/TUST-CampusNetwork-Login/releases/tag/v9.9.9',
  publishedAt: '',
  assets: [
    apk('app-armeabi-v7a-release.apk'),
    apk('app-arm64-v8a-release.apk'),
    apk('app-universal-release.apk'),
    { ...apk('NetMate-Linux-9.9.9.deb'), contentType: 'application/octet-stream' },
  ],
};

const originalOS = Platform.OS;

describe('AppUpdater', () => {
  beforeEach(async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    await AsyncStorage.clear();
    (DeviceInfo.getVersion as jest.Mock).mockReturnValue('1.0.0');
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('按设备 ABI 优先级选择分包，匹配不到用通用包', () => {
    expect(getPlatformAsset(release, ['arm64-v8a', 'armeabi-v7a'])?.name).toBe(
      'app-arm64-v8a-release.apk'
    );
    expect(getPlatformAsset(release, ['x86_64'])?.name).toBe('app-universal-release.apk');
    expect(getPlatformAsset(release)?.name).toBe('app-universal-release.apk');
  });

  it('自动检查请求正确的仓库，12 小时内不重复请求', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.0.1',
        name: 'old',
        body: '',
        html_url: '',
        published_at: '',
        assets: [],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const now = 1_000_000_000_000;
    await expect(autoCheckForUpdate(now)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/Twiink/TUST-CampusNetwork-Login/releases/latest'
    );

    await autoCheckForUpdate(now + 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await autoCheckForUpdate(now + 12 * 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
