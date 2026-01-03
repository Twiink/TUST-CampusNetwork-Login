import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useTheme } from '../context/ThemeContext';

interface GlassViewProps {
  style?: ViewStyle;
  children?: React.ReactNode;
  intensity?: number;
  borderRadius?: number;
}

export const GlassView: React.FC<GlassViewProps> = ({
  style,
  children,
  intensity = 25,
  borderRadius = 24,
}) => {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : theme.colors.cardBorder,
          shadowColor: isDark ? '#000' : theme.colors.shadowColor,
        },
        style,
      ]}
    >
      {/* Blur layer */}
      <BlurView
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        blurType={isDark ? 'dark' : 'light'}
        blurAmount={intensity}
        reducedTransparencyFallbackColor={
          isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.9)'
        }
      />

      {/* Glass overlay - semi-transparent tint */}
      <View
        style={[
          styles.overlay,
          {
            borderRadius,
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : theme.colors.glassOverlay,
          },
        ]}
      />

      {/* Subtle gradient border effect (inner glow) */}
      <View
        style={[
          styles.innerBorder,
          {
            borderRadius,
            borderColor: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(255, 255, 255, 0.6)',
          },
        ]}
      />

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    zIndex: -1,
    pointerEvents: 'none',
  },
});
