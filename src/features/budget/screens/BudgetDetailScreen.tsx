import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { useBudgetStore } from '../store/budgetStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import * as budgetQueries from '../../../shared/services/database/budgetQueries';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { getBudgetProgress } from '../utils/budgetProgress';
import type { HomeStackParamList, Transaction } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<HomeStackParamList>;
type Route = NativeStackScreenProps<HomeStackParamList, 'BudgetDetail'>['route'];

export const BudgetDetailScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const budget = useBudgetStore(useShallow((s) => s.budgets.find((b) => b.id === route.params.budgetId)));
  const removeBudget = useBudgetStore((s) => s.removeBudget);
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!budget) return;
    setTransactions(transactionQueries.findByUser(budget.userId, 10000));
  }, [budget]));

  const progress = useMemo(() => {
    if (!budget) return undefined;
    return getBudgetProgress(budget, transactions);
  }, [budget, transactions]);

  if (!budget || !progress) {
    return (
      <View style={styles.container}>
        <View style={styles.missingCard}>
          <Text style={styles.title}>Budget not found</Text>
          <Button title="Back to budgets" onPress={() => navigation.navigate('Budgets')} fullWidth />
        </View>
      </View>
    );
  }

  const category = budget.categoryId ? categories.find((item) => item.id === budget.categoryId) : undefined;
  const isOver = progress.health === 'over';

  const handleDelete = () => {
    Alert.alert('Delete budget?', 'This will deactivate the local budget and queue deletion for sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const deletedAt = Date.now();
            budgetQueries.deactivate(budget.id);
            removeBudget(budget.id);
            const deletedBudget = { ...budget, isActive: false, updatedAt: deletedAt };
            await syncService.queueChange('budgets', budget.id, 'delete', deletedBudget);
            const auditLog = auditLogQueries.record({
              userId: budget.userId,
              entityType: 'budgets',
              entityId: budget.id,
              action: 'delete',
              before: budget,
              after: deletedBudget,
              source: 'budget_detail',
            });
            await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
            navigation.navigate('Budgets');
          } catch (error) {
            Alert.alert('Budget not deleted', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{budget.name}</Text>
          <Text style={styles.subtitle}>{category ? `${category.icon} ${category.name}` : 'All expenses'} · {budget.period}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>Budget limit</Text>
            <Text style={[styles.statusPill, progress.health === 'safe' && styles.status_safe, progress.health === 'warning' && styles.status_warning, progress.health === 'critical' && styles.status_critical, progress.health === 'over' && styles.status_over]}>{progress.statusLabel}</Text>
          </View>
          <Text style={styles.heroAmount}>{formatCurrency(progress.effectiveAmount, budget.currency)}</Text>
          {budget.rolloverEnabled && (
            <Text style={[styles.limitMeta, styles.rolloverText]}>
              Base {formatCurrency(progress.baseAmount, budget.currency)} · rollover {progress.rolloverAmount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(progress.rolloverAmount), budget.currency)}
            </Text>
          )}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress.percentage}%` }, progress.health === 'warning' && styles.progressWarning, (progress.health === 'critical' || isOver) && styles.progressOver]} />
          </View>
          <View style={styles.limitMetaRow}>
            <Text style={styles.limitMeta}>Warning at {progress.warningThreshold}%</Text>
            <Text style={styles.limitMeta}>{budget.isHardLimit ? 'Hard limit' : 'Soft limit'}{budget.rolloverEnabled ? ' · rollover on' : ''}</Text>
          </View>
          <Text style={styles.helperText}>{progress.helperText}</Text>
          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statLabel}>Spent</Text>
              <Text style={styles.statValue}>{formatCurrency(progress.spent, budget.currency)}</Text>
            </View>
            <View style={styles.statRight}>
              <Text style={styles.statLabel}>{isOver ? 'Over budget' : 'Remaining'}</Text>
              <Text style={[styles.statValue, isOver && styles.dangerText]}>{formatCurrency(Math.abs(progress.remaining), budget.currency)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transactions in this period</Text>
          <Text style={styles.sectionMeta}>{progress.relatedTransactions.length}</Text>
        </View>
        {progress.relatedTransactions.slice(0, 8).map((tx) => (
          <TouchableOpacity
            key={tx.id}
            style={styles.transactionRow}
            onPress={() => navigation.navigate('TransactionDetail', { transactionId: tx.id })}
            activeOpacity={0.75}
          >
            <View>
              <Text style={styles.transactionTitle}>{tx.description || 'Expense'}</Text>
              <Text style={styles.transactionDate}>{new Date(tx.date).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.transactionAmount}>-{formatCurrency(tx.amount, tx.currency)}</Text>
          </TouchableOpacity>
        ))}
        {progress.relatedTransactions.length === 0 && (
          <Text style={styles.emptyText}>No matching expenses yet. New expenses will update this progress automatically.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Edit" onPress={() => navigation.navigate('CreateBudget', { budgetId: budget.id })} fullWidth />
        <Button title="Delete" onPress={handleDelete} variant="danger" loading={deleting} fullWidth />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 180, gap: spacing.md },
  missingCard: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  heroCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.xl, borderWidth: 1, borderColor: colors.borderLight },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  heroLabel: { ...typography.caption, color: colors.textTertiary },
  statusPill: { ...typography.captionSemiBold, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  status_safe: { color: colors.success[600], backgroundColor: colors.success[100] },
  status_warning: { color: colors.warning[700], backgroundColor: colors.warning[100] },
  status_critical: { color: colors.error[700], backgroundColor: colors.error[100] },
  status_over: { color: colors.error[700], backgroundColor: colors.error[100] },
  heroAmount: { ...typography.heading2, color: colors.text, marginBottom: spacing.lg },
  progressTrack: { height: 10, borderRadius: 99, backgroundColor: colors.white[20], overflow: 'hidden', marginBottom: spacing.sm },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.success[600] },
  progressWarning: { backgroundColor: colors.warning[500] },
  progressOver: { backgroundColor: colors.error[500] },
  limitMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  limitMeta: { ...typography.caption, color: colors.textTertiary },
  rolloverText: { marginTop: -spacing.md, marginBottom: spacing.md },
  helperText: { ...typography.smallMedium, color: colors.textSecondary, marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statRight: { alignItems: 'flex-end' },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xs },
  statValue: { ...typography.bodyLargeSemiBold, color: colors.text },
  dangerText: { color: colors.error[400] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  sectionTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  sectionMeta: { ...typography.captionMedium, color: colors.textTertiary },
  transactionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.lg, padding: spacing.base },
  transactionTitle: { ...typography.bodySemiBold, color: colors.text },
  transactionDate: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  transactionAmount: { ...typography.bodySemiBold, color: colors.error[400] },
  emptyText: { ...typography.body, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xl, lineHeight: 20 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], gap: spacing.sm, backgroundColor: 'rgba(16,16,16,0.92)' },
});
