import React, { useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AppProvider } from './src/context/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LogsScreen } from './src/screens/LogsScreen';
import { BottomTab } from './src/components/BottomTab';
import { AppBackground } from './src/components/AppBackground';

function AppContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('home');
  const { theme, themeMode } = useTheme();

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.colors.bg }]}>
      <AppBackground />
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar
          barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />
        <View style={styles.content}>
          {activeTab === 'home' && <HomeScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
          {activeTab === 'logs' && <LogsScreen />}
        </View>
        <BottomTab activeTab={activeTab} onTabChange={setActiveTab} />
      </SafeAreaView>
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default App;
