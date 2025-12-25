import React, { useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Platform
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BottomTab } from './src/components/BottomTab';
import { theme } from './src/constants/theme';

function AppContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={'dark-content'}
        backgroundColor="transparent"
        translucent
      />
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
    <SafeAreaProvider style={{ backgroundColor: theme.colors.bg }}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    flex: 1,
    // paddingBottom handled in screens' contentContainerStyle
  },
});

export default App;