import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { useDebtStore } from '../store/debtStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import * as debtRepaymentQueries from '../../../shared/services/database/debtRepaymentQueries';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import type { Account, DebtRepayment, TasksStackParamList, Transaction } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;
type Route = NativeStackScreenProps<TasksStackParamList, 'AddRepayment'>['route'];

const generateUUID = (): string => {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
    else if (i === 14) uuid += '4';
    else if (i === 19) uuid += hex[(Math.random() * 4 | 0) + 8];
    else uuid += hex[Math.random() * 16 | 0];
  }
  return uuid;
};

function toDateInput(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

export const AddRepaymentScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { debtId } = route.params;
  const debts = useDebtStore(useShallow((s) => s.debts));
  const updateDebt = useDebtStore((s) => s.updateDebt);
  const addRepayment = useDebtStore((s) => s.addRepayment);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const debt = useMemo(() => debts.find((item) => item.id === debtId) ?? debtQueries.findById(debtId), [debtId, debts]);
  const [amount, setAmount] = useState(debt ? String(debt.remainingAmount) : '');
  const [date, setDate] = useState(toDateInput(Date.now()));
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(debt?.accountId ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!debt) return;
    const nextAccounts = accountQueries.findByUser(debt.userId);
    setAccounts(nextAccounts);
    if (!accountId && (debt.accountId || nextAccounts[0]?.id)) setAccountId(debt.accountId ?? nextAccounts[0].id);
  }, [accountId, debt]);

  if (!debt) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
        <View style={styles.header}><BackButton onPress={() => navigation.goBack()} /><Text style={styles.title}>Debt not found</Text></View>
      </View>
    );
  }

  const parsedAmount = Number(amount.replace(',', '.'));
  const parsedDate = parseDateInput(date);
  const amountError = amount.length > 0 && (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > debt.remainingAmount) ? `Enter 0–${formatCurrency(debt.remainingAmount, debt.currency)}` : undefined;
  const dateError = date.length > 0 && !Number.isFinite(parsedDate) ? 'Use YYYY-MM-DD' : undefined;
  const canSave = Boolean(accountId && debt.categoryId && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= debt.remainingAmount && Number.isFinite(parsedDate));

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const now = Date.now();
    const nextRemaining = Math.max(0, debt.remainingAmount - parsedAmount);
    const nextStatus = nextRemaining <= 0 ? 'settled' as const : 'active' as const;
    const txType = debt.direction === 'i_owe' ? 'expense' as const : 'income' as const;
    try {
      const transaction: Transaction = {
        id: generateUUID(),
        userId: debt.userId,
        accountId,
        categoryId: debt.categoryId || '',
        type: txType,
        amount: parsedAmount,
        currency: debt.currency,
        description: `Debt repayment: ${debt.personName}`,
        date: parsedDate,
        isRecurring: false,
        debtId: debt.id,
        voiceInput: false,
        createdAt: now,
        updatedAt: now,
      };
      const repayment: DebtRepayment = {
        id: generateUUID(),
        userId: debt.userId,
        debtId: debt.id,
        transactionId: transaction.id,
        accountId,
        amount: parsedAmount,
        currency: debt.currency,
        note: note.trim() || undefined,
        date: parsedDate,
        createdAt: now,
        updatedAt: now,
      };
      const debtPatch = {
        remainingAmount: nextRemaining,
        status: nextStatus,
        settledAt: nextStatus === 'settled' ? now : undefined,
        updatedAt: now,
      };

      transactionQueries.insert(transaction);
      accountQueries.adjustBalance(accountId, txType === 'income' ? parsedAmount : -parsedAmount);
      debtRepaymentQueries.insert(repayment);
      debtQueries.update(debt.id, debtPatch);
      addTransaction(transaction);
      addRepayment(repayment);
      updateDebt(debt.id, debtPatch);

      const updatedDebt = { ...debt, ...debtPatch };
      await syncService.queueChange('transactions', transaction.id, 'create', transaction);
      await syncService.queueChange('debt_repayments', repayment.id, 'create', repayment);
      await syncService.queueChange('debts', debt.id, 'update', updatedDebt);
      const repaymentAudit = auditLogQueries.record({
        userId: debt.userId,
        entityType: 'debt_repayments',
        entityId: repayment.id,
        action: 'create',
        after: repayment,
        source: 'repayment_form',
      });
      const transactionAudit = auditLogQueries.record({
        userId: debt.userId,
        entityType: 'transactions',
        entityId: transaction.id,
        action: 'create',
        after: transaction,
        source: 'repayment_form',
      });
      const debtAudit = auditLogQueries.record({
        userId: debt.userId,
        entityType: 'debts',
        entityId: debt.id,
        action: nextStatus === 'settled' ? 'settle' : 'update',
        before: debt,
        after: updatedDebt,
        source: 'repayment_form',
      });
      await syncService.queueChange('audit_logs', repaymentAudit.id, 'create', repaymentAudit);
      await syncService.queueChange('audit_logs', transactionAudit.id, 'create', transactionAudit);
      await syncService.queueChange('audit_logs', debtAudit.id, 'create', debtAudit);

      navigation.navigate('DebtDetail', { debtId: debt.id });
    } catch (error) {
      Alert.alert('Repayment not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Add repayment</Text>
          <Text style={styles.subtitle}>{debt.personName} · {formatCurrency(debt.remainingAmount, debt.currency)} remaining</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="50000" error={amountError} />
        <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={dateError} />
        <Input label="Note" value={note} onChangeText={setNote} placeholder="Optional" />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.chips}>
            {accounts.map((account) => (
              <TouchableOpacity key={account.id} style={[styles.chip, accountId === account.id && styles.chipActive]} onPress={() => setAccountId(account.id)} activeOpacity={0.75}>
                <Text style={[styles.chipText, accountId === account.id && styles.chipTextActive]}>{account.icon ? `${account.icon} ` : ''}{account.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!debt.categoryId && <Text style={styles.errorText}>Choose a repayment category on the debt before saving repayment.</Text>}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Save repayment" onPress={handleSave} disabled={!canSave} loading={saving} fullWidth />
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
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 130, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionLabel: { ...typography.smallMedium, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surfaceElevated },
  chipActive: { backgroundColor: colors.white[100], borderColor: colors.white[100] },
  chipText: { ...typography.smallMedium, color: colors.textSecondary },
  chipTextActive: { color: colors.background },
  errorText: { ...typography.caption, color: colors.error[400], lineHeight: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
