import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../constants';
import { CategoryIcon } from './CategoryIcon';
import { formatCurrency } from '../utils/formatCurrency';

interface TransactionItemProps {
  icon: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense';
  onPress?: () => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({
  icon,
  iconColor,
  title,
  subtitle,
  amount,
  currency,
  type,
  onPress,
}) => {
  const isIncome = type === 'income';
  const sign = isIncome ? '+' : '-';
  const amountColor = isIncome ? colors.success[500] : colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={styles.container}
    >
      <CategoryIcon icon={icon} color={iconColor} size="sm" />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {sign}{formatCurrency(amount, currency)}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  amount: {
    ...typography.bodyMedium,
  },
});
