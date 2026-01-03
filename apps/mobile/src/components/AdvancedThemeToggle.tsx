import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedG = Animated.createAnimatedComponent(G);

export const AdvancedThemeToggle: React.FC = () => {
  const { themeMode, toggleTheme } = useTheme();
  const isDark = themeMode === 'dark';

  // Animation values
  const progress = useSharedValue(isDark ? 1 : 0);
  const scale = useSharedValue(1);
  const starsOpacity = useSharedValue(isDark ? 1 : 0);
  const starsTranslateY = useSharedValue(isDark ? 0 : -20);
  const cloudsOpacity = useSharedValue(isDark ? 0 : 1);
  const cloudsTranslateY = useSharedValue(isDark ? 20 : 0);

  useEffect(() => {
    progress.value = withTiming(isDark ? 1 : 0, {
      duration: 700,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    starsOpacity.value = withTiming(isDark ? 1 : 0, { duration: 500 });
    starsTranslateY.value = withSpring(isDark ? 0 : -20, { damping: 15 });
    cloudsOpacity.value = withTiming(isDark ? 0 : 1, { duration: 500 });
    cloudsTranslateY.value = withSpring(isDark ? 20 : 0, { damping: 15 });
  }, [isDark]);

  const handleToggle = () => {
    // Scale animation (bounce)
    scale.value = withSpring(1.15, { damping: 8 }, () => {
      scale.value = withSpring(1, { damping: 10 });
    });
    toggleTheme();
  };

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolate(progress.value, [0, 1], [0x4685c0, 0x1a1e32]);
    const r = Math.floor((backgroundColor >> 16) & 255);
    const g = Math.floor((backgroundColor >> 8) & 255);
    const b = Math.floor(backgroundColor & 255);
    return {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      transform: [{ scale: scale.value }],
    };
  });

  const sunMoonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [0, 55], Extrapolate.CLAMP),
      },
    ],
  }));

  const starsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: starsOpacity.value,
    transform: [{ translateY: starsTranslateY.value }],
  }));

  const cloudsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cloudsOpacity.value,
    transform: [{ translateY: cloudsTranslateY.value }],
  }));

  return (
    <AnimatedTouchable
      style={[styles.container, containerAnimatedStyle]}
      onPress={handleToggle}
      activeOpacity={0.9}
    >
      {/* Stars (visible in dark mode) */}
      <Animated.View style={[styles.starsContainer, starsAnimatedStyle]} pointerEvents="none">
        {[
          { top: 8, left: 15, size: 2 },
          { top: 20, left: 35, size: 1.5 },
          { top: 12, left: 50, size: 2.5 },
          { top: 25, left: 70, size: 1.5 },
          { top: 8, left: 90, size: 2 },
          { top: 22, left: 110, size: 1.5 },
          { top: 15, left: 130, size: 2 },
        ].map((star, i) => (
          <View
            key={i}
            style={[
              styles.star,
              {
                top: star.top,
                left: star.left,
                width: star.size * 2,
                height: star.size * 2,
              },
            ]}
          >
            <Svg width={star.size * 2} height={star.size * 2} viewBox="0 0 10 10">
              <Path d="M5,0 L5.5,4.5 L10,5 L5.5,5.5 L5,10 L4.5,5.5 L0,5 L4.5,4.5 Z" fill="#fff" />
            </Svg>
          </View>
        ))}
      </Animated.View>

      {/* Clouds (visible in light mode) */}
      <Animated.View style={[styles.cloudsContainer, cloudsAnimatedStyle]} pointerEvents="none">
        {[
          { left: 10, top: 8, scale: 0.8 },
          { left: 60, top: 15, scale: 1 },
          { left: 110, top: 10, scale: 0.7 },
        ].map((cloud, i) => (
          <View
            key={i}
            style={[
              styles.cloud,
              {
                left: cloud.left,
                top: cloud.top,
                transform: [{ scale: cloud.scale }],
              },
            ]}
          >
            <Svg width="40" height="20" viewBox="0 0 40 20">
              <Ellipse cx="10" cy="12" rx="8" ry="8" fill="#fff" opacity="0.8" />
              <Ellipse cx="18" cy="10" rx="10" ry="10" fill="#fff" opacity="0.8" />
              <Ellipse cx="28" cy="12" rx="8" ry="8" fill="#fff" opacity="0.8" />
            </Svg>
          </View>
        ))}
      </Animated.View>

      {/* Track */}
      <View style={styles.track}>
        <Animated.View style={[styles.iconContainer, sunMoonAnimatedStyle]}>
          {isDark ? <MoonIcon /> : <SunIcon />}
        </Animated.View>
      </View>
    </AnimatedTouchable>
  );
};

const SunIcon: React.FC = () => (
  <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <Defs>
      <RadialGradient id="sunGradient" cx="50%" cy="50%">
        <Stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
        <Stop offset="100%" stopColor="#f59e0b" stopOpacity="1" />
      </RadialGradient>
    </Defs>
    <Circle cx="12" cy="12" r="5" fill="url(#sunGradient)" />
    <G stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
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
  <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <Defs>
      <RadialGradient id="moonGradient" cx="30%" cy="30%">
        <Stop offset="0%" stopColor="#dbeafe" stopOpacity="1" />
        <Stop offset="100%" stopColor="#93c5fd" stopOpacity="1" />
      </RadialGradient>
    </Defs>
    <Path
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      fill="url(#moonGradient)"
      stroke="#60a5fa"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Moon craters */}
    <Circle cx="14" cy="9" r="1.5" fill="#93c5fd" opacity="0.4" />
    <Circle cx="17" cy="13" r="1" fill="#93c5fd" opacity="0.3" />
    <Circle cx="15" cy="16" r="1.2" fill="#93c5fd" opacity="0.35" />
  </Svg>
);

const styles = StyleSheet.create({
  container: {
    width: 150,
    height: 40,
    borderRadius: 25,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  track: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
    zIndex: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  starsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  star: {
    position: 'absolute',
  },
  cloudsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  cloud: {
    position: 'absolute',
  },
});
