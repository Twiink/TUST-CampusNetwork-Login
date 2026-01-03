import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

/* eslint-disable react-native/no-inline-styles */
// Inline styles necessary for dynamic star sizing

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Scale factor to convert em to px (1em = 3px in original, but we'll use 1.5px for mobile)
const EM = 1.5;

export const EnhancedThemeToggle: React.FC = () => {
  const { themeMode, toggleTheme } = useTheme();
  const isDark = themeMode === 'dark';

  // Animation values
  const progress = useSharedValue(isDark ? 1 : 0);
  const buttonTranslateX = useSharedValue(isDark ? 110 * EM : 0);
  const bg1TranslateX = useSharedValue(isDark ? 110 * EM : 0);
  const bg2TranslateX = useSharedValue(isDark ? 80 * EM : 0);
  const bg3TranslateX = useSharedValue(isDark ? 50 * EM : 0);
  const cloudsTranslateY = useSharedValue(isDark ? 80 * EM : 10 * EM);
  const starsTranslateY = useSharedValue(isDark ? -62.5 * EM : -125 * EM);
  const starsOpacity = useSharedValue(isDark ? 1 : 0);
  const moonsOpacity = useSharedValue(isDark ? 1 : 0);

  // Cloud floating animation
  const cloud1Translate = useSharedValue(0);
  const cloud2Translate = useSharedValue(0);

  useEffect(() => {
    const duration = 700;
    const easing = Easing.bezier(0.56, 1.35, 0.52, 1);

    progress.value = withTiming(isDark ? 1 : 0, { duration });
    buttonTranslateX.value = withTiming(isDark ? 110 * EM : 0, { duration, easing });
    bg1TranslateX.value = withTiming(isDark ? 110 * EM : 0, { duration, easing });
    bg2TranslateX.value = withTiming(isDark ? 80 * EM : 0, { duration, easing });
    bg3TranslateX.value = withTiming(isDark ? 50 * EM : 0, { duration, easing });
    cloudsTranslateY.value = withTiming(isDark ? 80 * EM : 10 * EM, { duration, easing });
    starsTranslateY.value = withTiming(isDark ? -62.5 * EM : -125 * EM, { duration, easing });
    starsOpacity.value = withTiming(isDark ? 1 : 0, { duration: 500 });
    moonsOpacity.value = withTiming(isDark ? 1 : 0, { duration: 500 });

    // Cloud floating animation
    cloud1Translate.value = withRepeat(
      withSequence(withTiming(2 * EM, { duration: 1000 }), withTiming(-2 * EM, { duration: 1000 })),
      -1,
      true
    );
    cloud2Translate.value = withRepeat(
      withSequence(withTiming(-2 * EM, { duration: 1200 }), withTiming(2 * EM, { duration: 1200 })),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: isDark ? 'rgba(25, 30, 50, 1)' : 'rgba(70, 133, 192, 1)',
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: buttonTranslateX.value }],
    backgroundColor: isDark ? 'rgba(195, 200, 210, 1)' : 'rgba(255, 195, 35, 1)',
  }));

  const bg1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bg1TranslateX.value }],
  }));

  const bg2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bg2TranslateX.value }],
  }));

  const bg3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bg3TranslateX.value }],
  }));

  const cloudsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cloudsTranslateY.value }],
  }));

  const cloud1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud1Translate.value }, { translateY: cloud1Translate.value }],
  }));

  const cloud2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: cloud2Translate.value }, { translateY: -cloud2Translate.value }],
  }));

  const starsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: starsTranslateY.value }],
    opacity: starsOpacity.value,
  }));

  const moonsStyle = useAnimatedStyle(() => ({
    opacity: moonsOpacity.value,
  }));

  return (
    <AnimatedTouchable
      style={[styles.container, containerStyle]}
      onPress={toggleTheme}
      activeOpacity={0.9}
    >
      {/* Sun/Moon Button */}
      <Animated.View style={[styles.mainButton, buttonStyle]}>
        {/* Moon craters */}
        <Animated.View style={[styles.moon1, moonsStyle]} />
        <Animated.View style={[styles.moon2, moonsStyle]} />
        <Animated.View style={[styles.moon3, moonsStyle]} />
      </Animated.View>

      {/* Daytime Background Circles */}
      <Animated.View style={[styles.daytimeBg1, bg1Style]} />
      <Animated.View style={[styles.daytimeBg2, bg2Style]} />
      <Animated.View style={[styles.daytimeBg3, bg3Style]} />

      {/* Clouds */}
      <Animated.View style={[styles.cloudsContainer, cloudsStyle]}>
        {/* Cloud 1 */}
        <Animated.View style={[styles.cloud, cloud1Style]}>
          <View
            style={[
              styles.cloudCircle,
              { right: -20 * EM, bottom: 10 * EM, width: 50 * EM, height: 50 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: -10 * EM, bottom: -25 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 20 * EM, bottom: -40 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 50 * EM, bottom: -35 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 75 * EM, bottom: -60 * EM, width: 75 * EM, height: 75 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 110 * EM, bottom: -50 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
        </Animated.View>

        {/* Cloud Light */}
        <Animated.View style={[styles.cloudLight, cloud2Style]}>
          <View
            style={[
              styles.cloudCircle,
              { right: -20 * EM, bottom: 10 * EM, width: 50 * EM, height: 50 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: -10 * EM, bottom: -25 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 20 * EM, bottom: -40 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 50 * EM, bottom: -35 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 75 * EM, bottom: -60 * EM, width: 75 * EM, height: 75 * EM },
            ]}
          />
          <View
            style={[
              styles.cloudCircle,
              { right: 110 * EM, bottom: -50 * EM, width: 60 * EM, height: 60 * EM },
            ]}
          />
        </Animated.View>
      </Animated.View>

      {/* Stars */}
      <Animated.View style={[styles.starsContainer, starsStyle]}>
        {[
          { top: 11 * EM, left: 39 * EM, size: 7.5 * EM },
          { top: 39 * EM, left: 91 * EM, size: 7.5 * EM },
          { top: 26 * EM, left: 19 * EM, size: 5 * EM },
          { top: 37 * EM, left: 66 * EM, size: 5 * EM },
          { top: 21 * EM, left: 75 * EM, size: 3 * EM },
          { top: 51 * EM, left: 38 * EM, size: 3 * EM },
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
            <View
              style={[
                styles.starPart,
                {
                  width: star.size,
                  height: star.size,
                  backgroundColor: 'transparent',
                  borderTopLeftRadius: star.size,
                },
              ]}
            />
            <View
              style={[
                styles.starPart,
                {
                  width: star.size,
                  height: star.size,
                  backgroundColor: 'transparent',
                  borderTopRightRadius: star.size,
                },
              ]}
            />
            <View
              style={[
                styles.starPart,
                {
                  width: star.size,
                  height: star.size,
                  backgroundColor: 'transparent',
                  borderBottomLeftRadius: star.size,
                },
              ]}
            />
            <View
              style={[
                styles.starPart,
                {
                  width: star.size,
                  height: star.size,
                  backgroundColor: '#fff',
                  borderBottomRightRadius: star.size,
                },
              ]}
            />
          </View>
        ))}
      </Animated.View>
    </AnimatedTouchable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 180 * EM,
    height: 70 * EM,
    borderRadius: 100 * EM,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5 * EM,
    elevation: 8,
  },
  mainButton: {
    position: 'absolute',
    top: 7.5 * EM,
    left: 7.5 * EM,
    width: 55 * EM,
    height: 55 * EM,
    borderRadius: 27.5 * EM,
    shadowColor: '#000',
    shadowOffset: { width: 3 * EM, height: 3 * EM },
    shadowOpacity: 0.5,
    shadowRadius: 5 * EM,
    elevation: 5,
  },
  moon1: {
    position: 'absolute',
    top: 7.5 * EM,
    left: 25 * EM,
    width: 12.5 * EM,
    height: 12.5 * EM,
    borderRadius: 6.25 * EM,
    backgroundColor: 'rgba(150, 160, 180, 1)',
  },
  moon2: {
    position: 'absolute',
    top: 20 * EM,
    left: 7.5 * EM,
    width: 20 * EM,
    height: 20 * EM,
    borderRadius: 10 * EM,
    backgroundColor: 'rgba(150, 160, 180, 1)',
  },
  moon3: {
    position: 'absolute',
    top: 32.5 * EM,
    left: 32.5 * EM,
    width: 12.5 * EM,
    height: 12.5 * EM,
    borderRadius: 6.25 * EM,
    backgroundColor: 'rgba(150, 160, 180, 1)',
  },
  daytimeBg1: {
    position: 'absolute',
    top: -20 * EM,
    left: -20 * EM,
    width: 110 * EM,
    height: 110 * EM,
    borderRadius: 55 * EM,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: -2,
  },
  daytimeBg2: {
    position: 'absolute',
    top: -32.5 * EM,
    left: -17.5 * EM,
    width: 135 * EM,
    height: 135 * EM,
    borderRadius: 67.5 * EM,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: -3,
  },
  daytimeBg3: {
    position: 'absolute',
    top: -45 * EM,
    left: -15 * EM,
    width: 160 * EM,
    height: 160 * EM,
    borderRadius: 80 * EM,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    zIndex: -4,
  },
  cloudsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cloud: {
    position: 'absolute',
    zIndex: -2,
  },
  cloudLight: {
    position: 'absolute',
    right: 0,
    bottom: 25 * EM,
    opacity: 0.5,
    zIndex: -3,
  },
  cloudCircle: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 1000,
  },
  starsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -2,
  },
  star: {
    position: 'absolute',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  starPart: {
    backgroundColor: '#fff',
  },
});
