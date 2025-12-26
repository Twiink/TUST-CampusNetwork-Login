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
  intensity = 15,
  borderRadius = 24
}) => {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  return (
    <View style={[
      styles.container,
      {
        borderRadius,
        borderColor: theme.colors.cardBorder,
        shadowColor: theme.colors.shadowColor,
      },
      style
    ]}>
      {/* Blur layer */}
      <BlurView
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        blurType={isDark ? 'dark' : 'light'}
        blurAmount={intensity}
        reducedTransparencyFallbackColor={
          isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)'
        }
      />

      {/* Glass overlay - semi-transparent tint */}
      <View
        style={[
          styles.overlay,
          {
            borderRadius,
            backgroundColor: theme.colors.glassOverlay,
          }
        ]}
      />

      {/* Subtle gradient border effect (inner glow) */}
      <View
        style={[
          styles.innerBorder,
          {
            borderRadius,
            borderColor: isDark
              ? 'rgba(56, 189, 248, 0.2)'
              : 'rgba(255, 255, 255, 0.6)',
          }
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
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
