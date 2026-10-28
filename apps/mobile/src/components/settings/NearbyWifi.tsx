import React, { useState } from 'react';
import { Text, View, Pressable, StyleSheet } from 'react-native';
import { matchWifiRule, type AppConfig } from '@repo/shared';
import { scanWifiNetworks, type ScannedWifiNetwork } from '../../native/WifiModule';
import { GlassView } from '../GlassView';
import { useTheme } from '../../context/ThemeContext';
export function NearbyWifi({
  config,
  onSelect,
  onEdit,
}: {
  config: AppConfig;
  onSelect: (network: ScannedWifiNetwork) => void;
  onEdit: (id: string) => void;
}) {
  const { theme } = useTheme();
  const [networks, setNetworks] = useState<ScannedWifiNetwork[] | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const styles = StyleSheet.create({
    card: { padding: 20, marginBottom: 20 },
    text: { color: theme.colors.text },
    title: { color: theme.colors.text, fontWeight: '700', fontSize: 18, marginBottom: 12 },
    button: { paddingVertical: 14 },
    row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    error: { color: theme.colors.danger },
  });
  const scan = async () => {
    setLoading(true);
    setError('');
    try {
      setNetworks(await scanWifiNetworks());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '扫描失败，请检查定位与附近设备权限');
    } finally {
      setLoading(false);
    }
  };
  return (
    <GlassView style={styles.card}>
      <Text style={styles.title}>附近 WiFi</Text>
      <Pressable
        testID="scan-wifi"
        accessibilityRole="button"
        disabled={loading}
        style={styles.button}
        onPress={() => scan()}
      >
        <Text style={styles.text}>{loading ? '扫描中…' : '扫描附近 WiFi'}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {networks?.length === 0 ? (
        <Text style={styles.text}>未发现网络，请开启 WiFi 和定位服务，或手动添加。</Text>
      ) : null}
      {networks?.map((network, index) => {
        const saved = matchWifiRule(config.wifiList, { ...network, ssid: network.ssid ?? '' });
        return (
          <View style={styles.row} key={`${network.ssid}-${index}`}>
            <Text style={styles.text}>
              {network.ssid} · {network.signalStrength}% · {network.security}
              {network.bssid ? ` · ${network.bssid}` : ''}
              {saved ? ' · 已保存' : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${saved ? '编辑' : '选择'}网络 ${network.ssid}`}
              style={styles.button}
              onPress={() => (saved ? onEdit(saved.id) : onSelect(network))}
            >
              <Text style={styles.text}>{saved ? '编辑' : '选择'}</Text>
            </Pressable>
          </View>
        );
      })}
    </GlassView>
  );
}
