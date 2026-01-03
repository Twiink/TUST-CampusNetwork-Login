import React from 'react';
import { ViewStyle, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { GlassView } from './GlassView';
import { useTheme } from '../context/ThemeContext';

interface GlassCardProps {
  style?: ViewStyle;
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  borderRadius?: number;
  intensity?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const GlassCard: React.FC<GlassCardProps> = ({
  style,
  children,
  onPress,
  disabled = false,
  borderRadius = 24,
  intensity = 15,
}) => {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  // Animation values
  const pressed = useSharedValue(0);
  const scale = useSharedValue(1);
  const elevation = useSharedValue(8);

  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: 150 });
    scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
    elevation.value = withTiming(4, { duration: 150 });
  };

  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: 200 });
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    elevation.value = withSpring(8, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(pressed.value, [0, 1], [0.15, 0.08]);

    return {
      transform: [{ scale: scale.value }],
      shadowOpacity,
      elevation: elevation.value,
    };
  });

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const borderOpacity = interpolate(pressed.value, [0, 1], isDark ? [0.3, 0.6] : [0.6, 0.9]);

    return {
      borderColor: isDark
        ? `rgba(56, 189, 248, ${borderOpacity})`
        : `rgba(14, 165, 233, ${borderOpacity})`,
    };
  });

  if (!onPress || disabled) {
    // Non-interactive card
    return (
      <GlassView style={style} borderRadius={borderRadius} intensity={intensity}>
        {children}
      </GlassView>
    );
  }

  // Interactive card with press animations
  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[
        styles.pressable,
        animatedStyle,
        {
          shadowColor: theme.colors.shadowColor,
        },
      ]}
    >
      <GlassView
        style={StyleSheet.flatten([glowAnimatedStyle, style])}
        borderRadius={borderRadius}
        intensity={intensity}
      >
        {children}
      </GlassView>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  pressable: {
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
  },
  card: {
    // Card styles will be inherited from GlassView
  },
});
