import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

interface BottomTabProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const HomeIcon = ({ active, color, activeColor }: { active: boolean; color: string; activeColor: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? activeColor : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <Path d="M9 22V12h6v10" />
  </Svg>
);

const SettingsIcon = ({ active, color, activeColor }: { active: boolean; color: string; activeColor: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? activeColor : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

const LogsIcon = ({ active, color, activeColor }: { active: boolean; color: string; activeColor: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? activeColor : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Path d="M14 2v6h6" />
    <Path d="M16 13H8" />
    <Path d="M16 17H8" />
    <Path d="M10 9H8" />
  </Svg>
);

export const BottomTab: React.FC<BottomTabProps> = ({ activeTab, onTabChange }) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.colors.sidebarBg, borderTopColor: theme.colors.border + '20' }]}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('home')}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <HomeIcon active={activeTab === 'home'} color={theme.colors.textSecondary} activeColor={theme.colors.primary} />
          </View>
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === 'home' && { color: theme.colors.primary, fontWeight: '800' }]}>
            运行状态
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('settings')}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <SettingsIcon active={activeTab === 'settings'} color={theme.colors.textSecondary} activeColor={theme.colors.primary} />
          </View>
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === 'settings' && { color: theme.colors.primary, fontWeight: '800' }]}>
            配置设置
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => onTabChange('logs')}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <LogsIcon active={activeTab === 'logs'} color={theme.colors.textSecondary} activeColor={theme.colors.primary} />
          </View>
          <Text style={[styles.tabText, { color: theme.colors.textSecondary }, activeTab === 'logs' && { color: theme.colors.primary, fontWeight: '800' }]}>
            运行日志
          </Text>
        </TouchableOpacity>
      </View>
      <SafeAreaView style={{ backgroundColor: theme.colors.sidebarBg }} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  container: {
    flexDirection: 'row',
    height: 70,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 5,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconContainer: {
    width: 24,
    height: 24,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
