import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';

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
  borderRadius = 20 
}) => {
  return (
    <View style={[styles.container, { borderRadius }, style]}>
      <BlurView
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        blurType="light"
        blurAmount={intensity}
        reducedTransparencyFallbackColor="rgba(255, 255, 255, 0.9)"
      />
      <View style={[styles.overlay, { borderRadius }]} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // Slightly white tint to simulate glass surface
    zIndex: -1,
  }
});
