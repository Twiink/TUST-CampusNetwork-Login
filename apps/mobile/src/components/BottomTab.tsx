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
          <Text style={[styles.tabText, activeTab === 'home' && styles.activeText]}>Dashboard</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => onTabChange('settings')}
        >
          <View style={[styles.iconPlaceholder, activeTab === 'settings' && styles.activeIcon]} />
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeText]}>Settings</Text>
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
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 8,
  },
  container: {
    flexDirection: 'row',
    height: 60,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#cbd5e1',
    marginBottom: 4,
  },
  activeIcon: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  activeText: {
    color: theme.colors.primary,
    fontWeight: '700',
  }
});