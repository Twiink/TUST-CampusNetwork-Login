import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const ThemeToggle: React.FC = () => {
  const { themeMode, toggleTheme, theme } = useTheme();
  const isDark = themeMode === 'dark';

  // Animation values
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(isDark ? 30 : 0);

  const handleToggle = () => {
    // Rotate animation
    rotation.value = withSequence(
      withTiming(rotation.value + 180, {
        duration: 500,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      })
    );

    // Scale animation (bounce)
    scale.value = withSequence(
      withTiming(1.1, { duration: 150 }),
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 150 })
    );

    // Slide animation
    translateX.value = withTiming(isDark ? 0 : 30, {
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });

    toggleTheme();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.9)',
  }));

  return (
    <AnimatedTouchable
      style={[styles.container, containerAnimatedStyle]}
      onPress={handleToggle}
      activeOpacity={0.8}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.iconContainer, animatedStyle]}>
          {isDark ? <MoonIcon /> : <SunIcon />}
        </Animated.View>
      </View>
    </AnimatedTouchable>
  );
};

const SunIcon: React.FC = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="5" fill="#f59e0b" />
    <G stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
      <Path d="M12 1v3" />
      <Path d="M12 20v3" />
      <Path d="M4.22 4.22l2.12 2.12" />
      <Path d="M17.66 17.66l2.12 2.12" />
      <Path d="M1 12h3" />
      <Path d="M20 12h3" />
      <Path d="M4.22 19.78l2.12-2.12" />
      <Path d="M17.66 6.34l2.12-2.12" />
    </G>
  </Svg>
);

const MoonIcon: React.FC = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      fill="#38bdf8"
      stroke="#38bdf8"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const styles = StyleSheet.create({
  container: {
    width: 70,
    height: 40,
    borderRadius: 20,
    padding: 3,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  track: {
    flex: 1,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
