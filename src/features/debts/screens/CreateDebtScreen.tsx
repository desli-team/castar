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
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../../profile/store/profileStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useDebtStore } from '../store/debtStore';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import type { Account, Debt, DebtDirection, TasksStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;
type Route = NativeStackScreenProps<TasksStackParamList, 'CreateDebt'>['route'];

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

function toDateInput(timestamp?: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  if (!value.trim()) return undefined;
  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

export const CreateDebtScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const debtId = route.params?.debtId;
  const userId = useAuthStore((s) => s.userId) || '';
  const currency = useProfileStore((s) => s.currency);
  const debts = useDebtStore(useShallow((s) => s.debts));
  const addDebt = useDebtStore((s) => s.addDebt);
  const updateDebt = useDebtStore((s) => s.updateDebt);
  const categories = useCategoryStore(useShallow((s) => s.categories));

  const existing = useMemo(() => debts.find((debt) => debt.id === debtId), [debtId, debts]);
  const isEdit = Boolean(existing);

  const [direction, setDirection] = useState<DebtDirection>(existing?.direction ?? 'i_owe');
  const [personName, setPersonName] = useState(existing?.personName ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.principalAmount) : '');
  const [dueDate, setDueDate] = useState(toDateInput(existing?.dueDate));
  const [note, setNote] = useState(existing?.note ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const nextAccounts = accountQueries.findByUser(userId);
    setAccounts(nextAccounts);
    if (!accountId && nextAccounts[0]) setAccountId(nextAccounts[0].id);
  }, [accountId, userId]);

  const parsedAmount = Number(amount.replace(',', '.'));
  const parsedDueDate = parseDateInput(dueDate);
  const amountError = amount.length > 0 && (!Number.isFinite(parsedAmount) || parsedAmount <= 0) ? 'Enter a positive amount' : undefined;
  const dateError = dueDate.length > 0 && !Number.isFinite(parsedDueDate) ? 'Use YYYY-MM-DD' : undefined;
  const repaymentType = direction === 'i_owe' ? 'expense' : 'income';
  const repaymentCategories = useMemo(() => categories.filter((category) => category.type === repaymentType), [categories, repaymentType]);

  useEffect(() => {
    if (!categoryId || repaymentCategories.some((category) => category.id === categoryId)) return;
    setCategoryId(repaymentCategories[0]?.id ?? '');
  }, [categoryId, repaymentCategories]);

  const canSave = Boolean(personName.trim() && Number.isFinite(parsedAmount) && parsedAmount > 0 && (parsedDueDate === undefined || Number.isFinite(parsedDueDate)));

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const now = Date.now();
    try {
      if (existing) {
        const paidAmount = Math.max(0, existing.principalAmount - existing.remainingAmount);
        const remainingAmount = Math.max(0, parsedAmount - paidAmount);
        const patch: Partial<Debt> = {
          direction,
          personName: personName.trim(),
          principalAmount: parsedAmount,
          remainingAmount,
          currency,
          accountId: accountId || undefined,
          categoryId: categoryId || undefined,
          dueDate: typeof parsedDueDate === 'number' ? parsedDueDate : undefined,
          note: note.trim() || undefined,
          status: remainingAmount <= 0 ? 'settled' : 'active',
          settledAt: remainingAmount <= 0 ? now : undefined,
          updatedAt: now,
        };
        const updatedDebt = { ...existing, ...patch };
        debtQueries.update(existing.id, patch);
        updateDebt(existing.id, patch);
        await syncService.queueChange('debts', existing.id, 'update', updatedDebt);
        const auditLog = auditLogQueries.record({
          userId: existing.userId,
          entityType: 'debts',
          entityId: existing.id,
          action: 'update',
          before: existing,
          after: updatedDebt,
          source: 'debt_form',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        navigation.navigate('DebtDetail', { debtId: existing.id });
      } else {
        const debt: Debt = {
          id: generateUUID(),
          userId,
          direction,
          personName: personName.trim(),
          principalAmount: parsedAmount,
          remainingAmount: parsedAmount,
          currency,
          accountId: accountId || undefined,
          categoryId: categoryId || undefined,
          dueDate: typeof parsedDueDate === 'number' ? parsedDueDate : undefined,
          note: note.trim() || undefined,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        debtQueries.insert(debt);
        addDebt(debt);
        await syncService.queueChange('debts', debt.id, 'create', debt);
        const auditLog = auditLogQueries.record({
          userId,
          entityType: 'debts',
          entityId: debt.id,
          action: 'create',
          after: debt,
          source: 'debt_form',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        navigation.navigate('DebtDetail', { debtId: debt.id });
      }
    } catch (error) {
      Alert.alert('Debt not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{isEdit ? 'Edit debt' : 'Create debt'}</Text>
          <Text style={styles.subtitle}>IOUs stay separate until repayment creates a real transaction</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Direction</Text>
          <View style={styles.chips}>
            <TouchableOpacity style={[styles.chip, direction === 'i_owe' && styles.chipActive]} onPress={() => setDirection('i_owe')} activeOpacity={0.75}>
              <Text style={[styles.chipText, direction === 'i_owe' && styles.chipTextActive]}>I owe</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, direction === 'owes_me' && styles.chipActive]} onPress={() => setDirection('owes_me')} activeOpacity={0.75}>
              <Text style={[styles.chipText, direction === 'owes_me' && styles.chipTextActive]}>Owes me</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Input label="Person" value={personName} onChangeText={setPersonName} placeholder="John, Sarah" />
        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="100000" error={amountError} />
        <Input label="Due date" value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD optional" error={dateError} />
        <Input label="Note" value={note} onChangeText={setNote} placeholder="Optional context" multiline />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Repayment account</Text>
          <View style={styles.chips}>
            {accounts.map((account) => (
              <TouchableOpacity key={account.id} style={[styles.chip, accountId === account.id && styles.chipActive]} onPress={() => setAccountId(account.id)} activeOpacity={0.75}>
                <Text style={[styles.chipText, accountId === account.id && styles.chipTextActive]}>{account.icon ? `${account.icon} ` : ''}{account.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helperText}>Used later when repayment creates an income/expense transaction.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{direction === 'i_owe' ? 'Repayment expense category' : 'Repayment income category'}</Text>
          <View style={styles.chips}>
            <TouchableOpacity style={[styles.chip, !categoryId && styles.chipActive]} onPress={() => setCategoryId('')} activeOpacity={0.75}>
              <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>No category yet</Text>
            </TouchableOpacity>
            {repaymentCategories.map((category) => (
              <TouchableOpacity key={category.id} style={[styles.chip, categoryId === category.id && styles.chipActive]} onPress={() => setCategoryId(category.id)} activeOpacity={0.75}>
                <Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>{category.icon} {category.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={isEdit ? 'Save changes' : 'Create debt'} onPress={handleSave} disabled={!canSave} loading={saving} fullWidth />
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
  helperText: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
