import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { AppProvider } from './src/context/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BottomTab } from './src/components/BottomTab';
import { theme } from './src/constants/theme';

function AppContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={'light-content'}
        backgroundColor={theme.colors.sidebarBg}
      />
      <View style={styles.header}>
         {/* Simple Header */}
      </View>
      <View style={styles.content}>
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>
      <BottomTab activeTab={activeTab} onTabChange={setActiveTab} />
    </SafeAreaView>
  );
}

function App(): React.JSX.Element {
  return (
    <AppProvider>
        <AppContent />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    backgroundColor: theme.colors.sidebarBg,
    height: 0, // Using SafeAreaView to handle status bar area, but keeping this if we want a title bar
  },
  content: {
    flex: 1,
  },
});

export default App;