import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, borderRadius } from '../constants';

interface BackButtonProps {
  onPress: () => void;
}

export const BackButton: React.FC<BackButtonProps> = ({ onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.button} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L9 12L15 19" stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
    marginRight: spacing.md,
  },
});
