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
import { useRecurringStore } from '../store/recurringStore';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as recurringQueries from '../../../shared/services/database/recurringQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import type { Account, RecurringFrequency, RecurringTransaction, TasksStackParamList, TransactionType } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;
type Route = NativeStackScreenProps<TasksStackParamList, 'CreateRecurring'>['route'];

const TYPES: TransactionType[] = ['expense', 'income'];
const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

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

export const CreateRecurringScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const recurringId = route.params?.recurringId;
  const userId = useAuthStore((s) => s.userId) || '';
  const currency = useProfileStore((s) => s.currency);
  const recurrings = useRecurringStore(useShallow((s) => s.recurrings));
  const addRecurring = useRecurringStore((s) => s.addRecurring);
  const updateRecurring = useRecurringStore((s) => s.updateRecurring);
  const categories = useCategoryStore(useShallow((s) => s.categories));

  const existing = useMemo(() => recurrings.find((item) => item.id === recurringId), [recurringId, recurrings]);
  const isEdit = Boolean(existing);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState<TransactionType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(existing?.frequency ?? 'monthly');
  const [nextDate, setNextDate] = useState(existing ? toDateInput(existing.nextDate) : toDateInput(Date.now()));
  const [accountId, setAccountId] = useState(existing?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const nextAccounts = accountQueries.findByUser(userId);
    setAccounts(nextAccounts);
    if (!accountId && nextAccounts[0]) setAccountId(nextAccounts[0].id);
  }, [accountId, userId]);

  const eligibleCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );

  useEffect(() => {
    if (categoryId && eligibleCategories.some((category) => category.id === categoryId)) return;
    setCategoryId(eligibleCategories[0]?.id ?? '');
  }, [categoryId, eligibleCategories]);

  const parsedAmount = Number(amount.replace(',', '.'));
  const parsedDate = parseDateInput(nextDate);
  const amountError = amount.length > 0 && (!Number.isFinite(parsedAmount) || parsedAmount <= 0) ? 'Enter a positive amount' : undefined;
  const dateError = nextDate.length > 0 && !Number.isFinite(parsedDate) ? 'Use YYYY-MM-DD' : undefined;
  const canSave = Boolean(accountId && categoryId && Number.isFinite(parsedAmount) && parsedAmount > 0 && Number.isFinite(parsedDate));

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const now = Date.now();
    try {
      if (existing) {
        const patch: Partial<RecurringTransaction> = {
          accountId,
          categoryId,
          type,
          amount: parsedAmount,
          currency,
          description: description.trim() || undefined,
          frequency,
          nextDate: parsedDate,
          updatedAt: now,
        };
        const updatedRecurring = { ...existing, ...patch };
        recurringQueries.update(existing.id, patch);
        updateRecurring(existing.id, patch);
        await syncService.queueChange('recurrings', existing.id, 'update', updatedRecurring);
        const auditLog = auditLogQueries.record({
          userId: existing.userId,
          entityType: 'recurrings',
          entityId: existing.id,
          action: 'update',
          before: existing,
          after: updatedRecurring,
          source: 'recurring_form',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      } else {
        const recurring: RecurringTransaction = {
          id: generateUUID(),
          userId,
          accountId,
          categoryId,
          type,
          amount: parsedAmount,
          currency,
          description: description.trim() || undefined,
          frequency,
          nextDate: parsedDate,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        recurringQueries.insert(recurring);
        addRecurring(recurring);
        await syncService.queueChange('recurrings', recurring.id, 'create', recurring);
        const auditLog = auditLogQueries.record({
          userId,
          entityType: 'recurrings',
          entityId: recurring.id,
          action: 'create',
          after: recurring,
          source: 'recurring_form',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      }
      navigation.navigate('Recurrings');
    } catch (error) {
      Alert.alert('Recurring not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{isEdit ? 'Edit recurring' : 'Create recurring'}</Text>
          <Text style={styles.subtitle}>Repeat payments for subscriptions, salary, rent, and bills</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.chips}>
            {TYPES.map((item) => (
              <TouchableOpacity key={item} style={[styles.chip, type === item && styles.chipActive]} onPress={() => setType(item)} activeOpacity={0.75}>
                <Text style={[styles.chipText, type === item && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="99000" error={amountError} />
        <Input label="Description" value={description} onChangeText={setDescription} placeholder="Netflix, rent, salary" />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Frequency</Text>
          <View style={styles.chips}>
            {FREQUENCIES.map((item) => (
              <TouchableOpacity key={item} style={[styles.chip, frequency === item && styles.chipActive]} onPress={() => setFrequency(item)} activeOpacity={0.75}>
                <Text style={[styles.chipText, frequency === item && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Input label="Next date" value={nextDate} onChangeText={setNextDate} placeholder="YYYY-MM-DD" error={dateError} />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.chips}>
            {accounts.map((account) => (
              <TouchableOpacity key={account.id} style={[styles.chip, accountId === account.id && styles.chipActive]} onPress={() => setAccountId(account.id)} activeOpacity={0.75}>
                <Text style={[styles.chipText, accountId === account.id && styles.chipTextActive]}>{account.icon ? `${account.icon} ` : ''}{account.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {accounts.length === 0 && <Text style={styles.helperText}>No account found yet. Create or seed an account before adding recurring rules.</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.chips}>
            {eligibleCategories.map((category) => (
              <TouchableOpacity key={category.id} style={[styles.chip, categoryId === category.id && styles.chipActive]} onPress={() => setCategoryId(category.id)} activeOpacity={0.75}>
                <Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>{category.icon} {category.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {eligibleCategories.length === 0 && <Text style={styles.helperText}>No matching category found yet.</Text>}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={isEdit ? 'Save changes' : 'Create recurring'} onPress={handleSave} disabled={!canSave} loading={saving} fullWidth />
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
