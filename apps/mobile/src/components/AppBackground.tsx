import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

// 性能模式：静态渐变替代 3 个无限 Reanimated 动画，消除常驻 UI 线程开销
export const THEME_PERF_MODE = true;

export const AppBackground: React.FC = () => {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const blobOpacity = isDark ? 0.25 : 0.4;
  const bgColor = theme.colors.bg;

  return (
    <View style={styles.container}>
      <Svg height={height} width={width} style={styles.absolute}>
        <Defs>
          <RadialGradient id="grad1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={theme.colors.blob1} stopOpacity={blobOpacity} />
            <Stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="grad2" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={theme.colors.blob2} stopOpacity={blobOpacity} />
            <Stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="grad3" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={theme.colors.blob3} stopOpacity={isDark ? 0.2 : 0.3} />
            <Stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={bgColor} />
      </Svg>

      <View style={[styles.blob, styles.blobTopLeft, { width: width * 0.8, height: width * 0.8 }]}>
        <Svg height="100%" width="100%" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="50" fill="url(#grad1)" />
        </Svg>
      </View>

      <View
        style={[styles.blob, styles.blobBottomRight, { width: width * 0.9, height: width * 0.9 }]}
      >
        <Svg height="100%" width="100%" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="50" fill="url(#grad2)" />
        </Svg>
      </View>

      <View
        style={[
          styles.blob,
          { top: height * 0.3, left: width * 0.2, width: width * 0.6, height: width * 0.6 },
        ]}
      >
        <Svg height="100%" width="100%" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="50" fill="url(#grad3)" />
        </Svg>
      </View>
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
  blobTopLeft: {
    top: -100,
    left: -100,
  },
  blobBottomRight: {
    bottom: -50,
    right: -50,
  },
});
