jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');

  const createAnimatedComponent = (Component: React.ComponentType<any>) => {
    const AnimatedComponent = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(Component, { ...props, ref }, props.children)
    );
    AnimatedComponent.displayName = `MockAnimated(${Component.displayName || Component.name || 'Component'})`;
    return AnimatedComponent;
  };

  const resolveValue = (value: unknown) =>
    typeof value === 'object' && value !== null && 'value' in value
      ? (value as { value: unknown }).value
      : value;

  const interpolate = (value: number, inputRange: number[], outputRange: number[]) => {
    if (inputRange.length < 2 || outputRange.length < 2) {
      return outputRange[0] ?? value;
    }

    const [inputStart, inputEnd] = inputRange;
    const [outputStart, outputEnd] = outputRange;
    const progress = (value - inputStart) / (inputEnd - inputStart || 1);
    return outputStart + progress * (outputEnd - outputStart);
  };

  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent,
    },
    View,
    createAnimatedComponent,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (updater: () => Record<string, unknown>) => updater(),
    withTiming: (value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withSpring: (value: unknown, _config?: unknown, callback?: () => void) => {
      callback?.();
      return value;
    },
    interpolate,
    Extrapolate: {
      CLAMP: 'clamp',
    },
    Easing: {
      ease: 'ease',
      inOut: (value: unknown) => value,
      bezier: () => 'bezier',
    },
    runOnJS: (callback: (...args: unknown[]) => void) => callback,
    useDerivedValue: (updater: () => unknown) => ({ value: resolveValue(updater()) }),
    useAnimatedProps: (updater: () => Record<string, unknown>) => updater(),
  };
});

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

const reactNative = require('react-native');

reactNative.NativeModules.WifiModule = {
  getCurrentSSID: jest.fn().mockResolvedValue('TUST-WIFI'),
  getIPAddress: jest.fn().mockResolvedValue('10.0.0.2'),
  getIPv6Address: jest.fn().mockResolvedValue(null),
  getMacAddress: jest.fn().mockResolvedValue('00:11:22:33:44:55'),
  isWifiEnabled: jest.fn().mockResolvedValue(true),
  isConnected: jest.fn().mockResolvedValue(true),
  getNetworkInfo: jest.fn().mockResolvedValue({
    wifiEnabled: true,
    connected: true,
    ssid: 'TUST-WIFI',
    ipv4: '10.0.0.2',
    ipv6: null,
    mac: '00:11:22:33:44:55',
  }),
  checkLocationPermission: jest.fn().mockResolvedValue(true),
  connectToWifi: jest.fn().mockResolvedValue(true),
  disconnectWifi: jest.fn().mockResolvedValue(true),
  scanWifiNetworks: jest.fn().mockResolvedValue([]),
};

reactNative.NativeModules.BackgroundServiceModule = {
  startService: jest.fn().mockResolvedValue(true),
  stopService: jest.fn().mockResolvedValue(true),
  isRunning: jest.fn().mockResolvedValue(false),
};

reactNative.NativeModules.AutoStartModule = {
  isEnabled: jest.fn().mockResolvedValue(false),
  setEnabled: jest.fn().mockResolvedValue(true),
};

beforeEach(() => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '{"ok":true}',
    headers: {
      forEach: () => undefined,
    },
  }) as unknown as typeof fetch;
});
