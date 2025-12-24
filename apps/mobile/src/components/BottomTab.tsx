import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { theme } from '../constants/theme';

interface BottomTabProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const BottomTab: React.FC<BottomTabProps> = ({ activeTab, onTabChange }) => {
  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => onTabChange('home')}
        >
          <View style={[styles.iconPlaceholder, activeTab === 'home' && styles.activeIcon]} />
          <Text style={[styles.tabText, activeTab === 'home' && styles.activeText]}>运行状态</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => onTabChange('settings')}
        >
          <View style={[styles.iconPlaceholder, activeTab === 'settings' && styles.activeIcon]} />
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeText]}>配置设置</Text>
        </TouchableOpacity>
      </View>
      <SafeAreaView style={{ backgroundColor: theme.colors.sidebarBg }} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: theme.colors.sidebarBg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
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
  iconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#cbd5e1',
    marginBottom: 6,
  },
  activeIcon: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  activeText: {
    color: theme.colors.primary,
    fontWeight: '800',
  }
});