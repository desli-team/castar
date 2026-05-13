import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { useDebtStore } from '../store/debtStore';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import * as debtRepaymentQueries from '../../../shared/services/database/debtRepaymentQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import type { TasksStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;
type Route = NativeStackScreenProps<TasksStackParamList, 'DebtDetail'>['route'];

export const DebtDetailScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { debtId } = route.params;
  const debts = useDebtStore(useShallow((s) => s.debts));
  const repaymentsByDebt = useDebtStore(useShallow((s) => s.repaymentsByDebt));
  const setRepayments = useDebtStore((s) => s.setRepayments);
  const updateDebt = useDebtStore((s) => s.updateDebt);
  const removeDebt = useDebtStore((s) => s.removeDebt);
  const debt = useMemo(() => debts.find((item) => item.id === debtId) ?? debtQueries.findById(debtId), [debtId, debts]);
  const repayments = repaymentsByDebt[debtId] ?? [];

  useEffect(() => {
    setRepayments(debtId, debtRepaymentQueries.findByDebt(debtId));
  }, [debtId, setRepayments]);

  if (!debt) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
        <View style={styles.header}><BackButton onPress={() => navigation.goBack()} /><Text style={styles.title}>Debt not found</Text></View>
      </View>
    );
  }

  const paid = Math.max(0, debt.principalAmount - debt.remainingAmount);
  const progress = debt.principalAmount > 0 ? Math.max(0, Math.min(1, paid / debt.principalAmount)) : 0;
  const isOwedByMe = debt.direction === 'i_owe';

  const markSettled = () => {
    if (debt.status === 'settled') return;
    Alert.alert('Mark as settled?', 'This closes the debt without creating an additional transaction. Use repayment if money moved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Settle',
        onPress: async () => {
          const patch = { remainingAmount: 0, status: 'settled' as const, settledAt: Date.now(), updatedAt: Date.now() };
          const updatedDebt = { ...debt, ...patch };
          debtQueries.update(debt.id, patch);
          updateDebt(debt.id, patch);
          await syncService.queueChange('debts', debt.id, 'update', updatedDebt);
          const auditLog = auditLogQueries.record({
            userId: debt.userId,
            entityType: 'debts',
            entityId: debt.id,
            action: 'settle',
            before: debt,
            after: updatedDebt,
            source: 'debt_detail',
          });
          await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        },
      },
    ]);
  };

  const deleteDebt = () => {
    Alert.alert('Delete debt?', 'This deletes the IOU record locally and queues deletion for sync. Existing repayment transactions stay in the ledger.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          debtQueries.delete(debt.id);
          removeDebt(debt.id);
          await syncService.queueChange('debts', debt.id, 'delete', debt);
          const auditLog = auditLogQueries.record({
            userId: debt.userId,
            entityType: 'debts',
            entityId: debt.id,
            action: 'delete',
            before: debt,
            source: 'debt_detail',
          });
          await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
          navigation.navigate('Debts');
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{isOwedByMe ? `You owe ${debt.personName}` : `${debt.personName} owes you`}</Text>
          <Text style={styles.subtitle}>Separate IOU · real ledger entries happen on repayment</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={[styles.statusBadge, debt.status === 'settled' ? styles.settledBadge : (isOwedByMe ? styles.oweBadge : styles.receiveBadge)]}>
            <Text style={styles.statusText}>{debt.status === 'settled' ? 'Settled' : isOwedByMe ? 'I owe' : 'Owes me'}</Text>
          </View>
          <Text style={styles.remainingLabel}>Remaining</Text>
          <Text style={[styles.remainingAmount, !isOwedByMe && styles.incomeAmount]}>{formatCurrency(debt.remainingAmount, debt.currency)}</Text>
          <Text style={styles.metaText}>Paid {formatCurrency(paid, debt.currency)} of {formatCurrency(debt.principalAmount, debt.currency)}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
          {debt.dueDate && <Text style={styles.metaText}>Due {new Date(debt.dueDate).toLocaleDateString()}</Text>}
          {debt.note && <Text style={styles.note}>{debt.note}</Text>}
        </View>

        <View style={styles.actions}>
          {debt.status === 'active' && <Button title="Add repayment" onPress={() => navigation.navigate('AddRepayment', { debtId: debt.id })} fullWidth />}
          <Button title="Edit" onPress={() => navigation.navigate('CreateDebt', { debtId: debt.id })} variant="secondary" fullWidth />
          {debt.status === 'active' && <Button title="Mark settled" onPress={markSettled} variant="outline" fullWidth />}
          <Button title="Delete" onPress={deleteDebt} variant="danger" fullWidth />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Repayments</Text>
          <Text style={styles.sectionCount}>{repayments.length}</Text>
        </View>
        {repayments.length === 0 ? (
          <Text style={styles.helperText}>No repayments yet.</Text>
        ) : repayments.map((repayment) => (
          <View key={repayment.id} style={styles.repaymentCard}>
            <Text style={styles.repaymentAmount}>{formatCurrency(repayment.amount, repayment.currency)}</Text>
            <Text style={styles.repaymentMeta}>{new Date(repayment.date).toLocaleDateString()}{repayment.note ? ` · ${repayment.note}` : ''}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing['4xl'], gap: spacing.md },
  heroCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.xl, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, alignSelf: 'flex-start' },
  oweBadge: { backgroundColor: colors.error[900] },
  receiveBadge: { backgroundColor: colors.success[900] },
  settledBadge: { backgroundColor: colors.white[20] },
  statusText: { ...typography.captionMedium, color: colors.text },
  remainingLabel: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.md },
  remainingAmount: { ...typography.heading2, color: colors.error[400] },
  incomeAmount: { color: colors.success[500] },
  metaText: { ...typography.body, color: colors.textSecondary },
  progressTrack: { height: 8, borderRadius: borderRadius.full, backgroundColor: colors.white[20], overflow: 'hidden', marginTop: spacing.sm },
  progressFill: { height: '100%', backgroundColor: colors.white[100], borderRadius: borderRadius.full },
  note: { ...typography.body, color: colors.text, lineHeight: 20, marginTop: spacing.sm },
  actions: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  sectionCount: { ...typography.captionMedium, color: colors.textTertiary },
  helperText: { ...typography.body, color: colors.textTertiary },
  repaymentCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.xl, padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight },
  repaymentAmount: { ...typography.bodyLargeSemiBold, color: colors.text },
  repaymentMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
});
