import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import Svg, { Path } from 'react-native-svg';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { useBudgetStore } from '../store/budgetStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useAuthStore } from '../../auth/store/authStore';
import * as budgetAlertQueries from '../../../shared/services/database/budgetAlertQueries';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { getBudgetProgress } from '../utils/budgetProgress';
import type { HomeStackParamList, Transaction } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<HomeStackParamList>;

const ChevronRightIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5L15 12L9 19" stroke={colors.textSecondary} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const BudgetsScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId);
  const budgets = useBudgetStore(useShallow((s) => s.budgets.filter((b) => b.isActive)));
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    setUnreadAlerts(budgetAlertQueries.countUnacknowledged(userId));
    setTransactions(transactionQueries.findByUser(userId, 10000));
  }, [userId]));

  const sortedBudgets = useMemo(
    () => [...budgets].sort((a, b) => b.updatedAt - a.updatedAt),
    [budgets],
  );

  const categoryName = (categoryId?: string) => {
    if (!categoryId) return 'All expenses';
    return categories.find((category) => category.id === categoryId)?.name ?? 'Category';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Budgets</Text>
          <Text style={styles.subtitle}>Track limits by period and category</Text>
        </View>
        <TouchableOpacity style={styles.alertButton} onPress={() => navigation.navigate('BudgetAlerts')} activeOpacity={0.75}>
          <Text style={styles.alertButtonText}>Alerts</Text>
          {unreadAlerts > 0 && <Text style={styles.alertBadge}>{unreadAlerts > 9 ? '9+' : unreadAlerts}</Text>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedBudgets}
        keyExtractor={(budget) => budget.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No budgets yet</Text>
            <Text style={styles.emptyText}>Create your first budget to see spend, remaining amount, and progress after every logged expense.</Text>
            <Button title="Create budget" onPress={() => navigation.navigate('CreateBudget')} fullWidth />
          </View>
        )}
        renderItem={({ item: budget }) => {
          const progress = getBudgetProgress(budget, transactions);
          const isOver = progress.health === 'over';
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BudgetDetail', { budgetId: budget.id })}
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{budget.name}</Text>
                  <Text style={styles.cardMeta}>{categoryName(budget.categoryId)} · {budget.period}</Text>
                </View>
                <ChevronRightIcon />
              </View>
              <View style={styles.progressHeader}>
                <Text style={[styles.statusPill, progress.health === 'safe' && styles.status_safe, progress.health === 'warning' && styles.status_warning, progress.health === 'critical' && styles.status_critical, progress.health === 'over' && styles.status_over]}>{progress.statusLabel}</Text>
                <Text style={styles.thresholdText}>{progress.warningThreshold}% / {progress.criticalThreshold}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress.percentage}%` }, progress.health === 'warning' && styles.progressWarning, (progress.health === 'critical' || isOver) && styles.progressOver]} />
              </View>
              <View style={styles.statsRow}>
                <View>
                  <Text style={styles.statLabel}>Spent</Text>
                  <Text style={styles.statValue}>{formatCurrency(progress.spent, budget.currency)}</Text>
                </View>
                <View style={styles.statRight}>
                  <Text style={styles.statLabel}>{isOver ? 'Over' : 'Remaining'}</Text>
                  <Text style={[styles.statValue, isOver && styles.dangerText]}>
                    {formatCurrency(Math.abs(progress.remaining), budget.currency)}
                  </Text>
                  {budget.rolloverEnabled && progress.rolloverAmount !== 0 && (
                    <Text style={styles.rolloverMeta}>Rollover {progress.rolloverAmount > 0 ? '+' : '-'}{formatCurrency(Math.abs(progress.rolloverAmount), budget.currency)}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {sortedBudgets.length > 0 && (
        <View style={styles.footer}>
          <Button title="Create budget" onPress={() => navigation.navigate('CreateBudget')} fullWidth />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  alertButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
  alertButtonText: { ...typography.captionSemiBold, color: colors.textSecondary },
  alertBadge: { ...typography.captionBold, overflow: 'hidden', minWidth: 18, height: 18, lineHeight: 18, textAlign: 'center', color: colors.background, backgroundColor: colors.error[400], borderRadius: borderRadius.full },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 120, gap: spacing.md },
  emptyCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.xl, gap: spacing.base, marginTop: spacing['4xl'] },
  emptyTitle: { ...typography.heading5, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  card: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.base },
  cardTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  cardMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  statusPill: { ...typography.captionSemiBold, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  status_safe: { color: colors.success[600], backgroundColor: colors.success[100] },
  status_warning: { color: colors.warning[700], backgroundColor: colors.warning[100] },
  status_critical: { color: colors.error[700], backgroundColor: colors.error[100] },
  status_over: { color: colors.error[700], backgroundColor: colors.error[100] },
  thresholdText: { ...typography.caption, color: colors.textTertiary },
  progressTrack: { height: 8, borderRadius: 99, backgroundColor: colors.white[20], overflow: 'hidden', marginBottom: spacing.base },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.success[600] },
  progressWarning: { backgroundColor: colors.warning[500] },
  progressOver: { backgroundColor: colors.error[500] },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statRight: { alignItems: 'flex-end' },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xs },
  statValue: { ...typography.bodySemiBold, color: colors.text },
  dangerText: { color: colors.error[400] },
  rolloverMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
