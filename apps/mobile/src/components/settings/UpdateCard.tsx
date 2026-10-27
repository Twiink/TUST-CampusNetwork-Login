import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, Pressable, StyleSheet } from 'react-native';
import { GlassView } from '../GlassView';
import { useTheme } from '../../context/ThemeContext';
import {
  checkForUpdate,
  getCurrentVersion,
  getDownloadStatus,
  startUpdateDownload,
  cancelUpdateDownload,
  installDownloadedUpdate,
  type ReleaseInfo,
  type DownloadStatus,
} from '../../native/AppUpdater';

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 16 },
  button: { paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '600' },
});
export function UpdateCard() {
  const { theme } = useTheme();
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(() => {
    getDownloadStatus()
      .then(setStatus)
      .catch(() => setMessage('读取下载状态失败，请重试'));
  }, []);
  useEffect(() => {
    refresh();
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, 1500);
    return () => {
      app.remove();
      clearInterval(timer);
    };
  }, [refresh]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    const latest = await checkForUpdate(true);
    setRelease(latest);
    setMessage(latest ? `新版本 ${latest.version} 可用` : '当前已是最新版本');
  };
  const download = async () => {
    const latest = release ?? (await checkForUpdate(true));
    if (!latest) {
      setMessage('当前已是最新版本');
      return;
    }
    setRelease(latest);
    setStatus(await startUpdateDownload(latest));
  };
  const button = (label: string, action: () => Promise<void>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={() => {
        run(action);
      }}
    >
      <Text style={[styles.button, { color: theme.colors.primary }]}>{label}</Text>
    </Pressable>
  );
  return (
    <GlassView style={styles.card}>
      <Text style={[styles.title, { color: theme.colors.text }]}>应用更新</Text>
      <Text style={{ color: theme.colors.textSecondary }}>当前版本 {getCurrentVersion()}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>
        {busy ? '正在处理…' : message || status?.error || status?.message || ''}
      </Text>
      {status?.state === 'downloading' ? (
        <>
          <Text accessibilityLabel="下载进度" style={{ color: theme.colors.text }}>
            下载进度 {status.progress}%
          </Text>
          {button('取消下载', async () => {
            setStatus(await cancelUpdateDownload());
          })}
        </>
      ) : status?.state === 'downloaded' ? (
        <>
          <Text style={{ color: theme.colors.text }}>版本 {status.version} 已下载并通过校验</Text>
          {!status.installAllowed && (
            <Text style={{ color: theme.colors.textSecondary }}>
              安装需要允许此应用安装更新。授权后返回此页继续安装。
            </Text>
          )}
          {button(status.installAllowed ? '安装更新' : '授权安装更新', async () => {
            const result = await installDownloadedUpdate();
            setMessage(
              result === 'permission-required'
                ? '授权后请返回并点击安装更新'
                : '请在系统安装器中确认更新'
            );
            refresh();
          })}
          {button('删除下载', async () => {
            setStatus(await cancelUpdateDownload());
          })}
        </>
      ) : (
        <>
          {button('检查更新', check)}
          {(release || status?.state === 'failed') &&
            button(status?.state === 'failed' ? '重试下载' : '下载更新', download)}
        </>
      )}
    </GlassView>
  );
}
