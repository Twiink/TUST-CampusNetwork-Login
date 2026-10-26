import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GlassView } from '../GlassView';
import { useTheme } from '../../context/ThemeContext';
import type { PermissionItem, PermissionState } from '../../native/Permissions';
import { styles } from './settingsStyles';

/* eslint-disable react-native/no-inline-styles */
// Inline styles are necessary for dynamic theming based on theme context

const STATE_LABELS: Record<PermissionState, string> = {
  granted: '已开启',
  denied: '未开启',
  blocked: '已拒绝',
  unsupported: '无需设置',
  unknown: '请手动确认',
};

function actionLabel(item: PermissionItem): string | null {
  if (item.state === 'granted' || item.state === 'unsupported') return null;
  if (item.state === 'blocked' || item.key === 'autoStart' || item.key === 'backgroundLocation') {
    return '去设置';
  }
  return '开启';
}

/**
 * 权限状态卡片：展示自动认证依赖的各项权限，未开启的可点击重新申请。
 * 「无需设置」的项（当前系统版本不需要、设备没有对应厂商页面）不展示，避免干扰。
 */
export const PermissionsCard: React.FC<{
  items: PermissionItem[];
  onRequest: (item: PermissionItem) => void;
  onRunGuide: () => void;
}> = ({ items, onRequest, onRunGuide }) => {
  const { theme } = useTheme();
  const visible = items.filter(item => item.state !== 'unsupported');
  if (visible.length === 0) return null;

  const stateColor = (state: PermissionState) => {
    switch (state) {
      case 'granted':
        return theme.colors.success;
      case 'blocked':
        return theme.colors.danger;
      case 'unknown':
        return theme.colors.textSecondary;
      default:
        return theme.colors.warning;
    }
  };

  return (
    <GlassView style={styles.card}>
      <Text style={[styles.cardHeader, { color: theme.colors.text }]}>权限状态</Text>

      {visible.map((item, index) => {
        const label = actionLabel(item);
        return (
          <View
            key={item.key}
            style={[styles.settingRow, index === visible.length - 1 && { borderBottomWidth: 0 }]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                {item.title}
                {item.required ? '' : '（可选）'}
              </Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                {item.description}
              </Text>
              <Text
                style={[styles.settingDesc, { color: stateColor(item.state), fontWeight: '600' }]}
              >
                {STATE_LABELS[item.state]}
              </Text>
            </View>
            {label && (
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: theme.colors.primary + '20' }]}
                onPress={() => onRequest(item)}
                accessibilityRole="button"
                accessibilityLabel={`${label}${item.title}`}
              >
                <Text style={[styles.smallBtnText, { color: theme.colors.primary }]}>{label}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[
          styles.btnPrimary,
          { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary },
        ]}
        onPress={onRunGuide}
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>重新运行权限引导</Text>
      </TouchableOpacity>
    </GlassView>
  );
};
