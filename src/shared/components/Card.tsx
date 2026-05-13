import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, borderRadius } from '../constants';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, elevated = true }) => (
  <View style={[styles.card, elevated && styles.elevated, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  elevated: {
    backgroundColor: colors.surfaceElevated,
  },
});
