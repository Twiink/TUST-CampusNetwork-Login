import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withSequence,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

// Create Animated components
const AnimatedView = Animated.createAnimatedComponent(View);

export const AppBackground: React.FC = () => {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  const blob1TranslateX = useSharedValue(0);
  const blob1TranslateY = useSharedValue(0);
  const blob2TranslateX = useSharedValue(0);
  const blob2TranslateY = useSharedValue(0);
  const blob3Scale = useSharedValue(1);

  useEffect(() => {
    // Blob 1: Random subtle movement
    blob1TranslateX.value = withRepeat(
      withSequence(
        withTiming(50, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-50, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 5000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    blob1TranslateY.value = withRepeat(
      withSequence(
        withTiming(-30, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(30, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 6000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Blob 2: Opposite movement
    blob2TranslateX.value = withRepeat(
      withSequence(
        withTiming(-40, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(40, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 6000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    blob2TranslateY.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-40, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Blob 3: Breathing
    blob3Scale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({
    transform: [{ translateX: blob1TranslateX.value }, { translateY: blob1TranslateY.value }],
  }));

  const animatedStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateX: blob2TranslateX.value }, { translateY: blob2TranslateY.value }],
  }));

  const animatedStyle3 = useAnimatedStyle(() => ({
    transform: [{ scale: blob3Scale.value }],
  }));

  // Gradient opacity adjusted for dark mode
  const blobOpacity = isDark ? 0.25 : 0.4;
  const bgColor = theme.colors.bg;
  const blob1Color = theme.colors.blob1;
  const blob2Color = theme.colors.blob2;
  const blob3Color = theme.colors.blob3;

  return (
    <View style={styles.container}>
      <Svg height={height} width={width} style={styles.absolute}>
        <Defs>
          <RadialGradient id="grad1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={blob1Color} stopOpacity={blobOpacity} />
            <Stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="grad2" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={blob2Color} stopOpacity={blobOpacity} />
            <Stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="grad3" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={blob3Color} stopOpacity={isDark ? 0.2 : 0.3} />
            <Stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={bgColor} />
      </Svg>

      {/* Animated Blobs */}
      <AnimatedView
        style={[
          styles.blob,
          // eslint-disable-next-line react-native/no-inline-styles
          { top: -100, left: -100, width: width * 0.8, height: width * 0.8 },
          animatedStyle1,
        ]}
      >
        <Svg height="100%" width="100%" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="50" fill="url(#grad1)" />
        </Svg>
      </AnimatedView>

      <AnimatedView
        style={[
          styles.blob,
          // eslint-disable-next-line react-native/no-inline-styles
          { bottom: -50, right: -50, width: width * 0.9, height: width * 0.9 },
          animatedStyle2,
        ]}
      >
        <Svg height="100%" width="100%" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="50" fill="url(#grad2)" />
        </Svg>
      </AnimatedView>

      <AnimatedView
        style={[
          styles.blob,
          { top: height * 0.3, left: width * 0.2, width: width * 0.6, height: width * 0.6 },
          animatedStyle3,
        ]}
      >
        <Svg height="100%" width="100%" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="50" fill="url(#grad3)" />
        </Svg>
      </AnimatedView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
    overflow: 'hidden',
  },
  absolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blob: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
