import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
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
import { useBudgetStore } from '../store/budgetStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import * as budgetQueries from '../../../shared/services/database/budgetQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { buildBudgetAllocationSummary, monthlyEquivalent } from '../utils/budgetAllocation';
import type { Budget, BudgetPeriod, HomeStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<HomeStackParamList>;
type Route = NativeStackScreenProps<HomeStackParamList, 'CreateBudget'>['route'];

const PERIODS: BudgetPeriod[] = ['daily', 'weekly', 'fourteen_days', 'monthly', 'yearly'];

const periodLabel = (period: BudgetPeriod) => {
  if (period === 'fourteen_days') return '14 days';
  return period;
};
const WARNING_PRESETS = [50, 70, 80, 90];
const CRITICAL_PRESETS = [90, 100, 110, 120];

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

export const CreateBudgetScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const budgetId = route.params?.budgetId;
  const initialCategoryId = route.params?.categoryId;
  const userId = useAuthStore((s) => s.userId) || '';
  const currency = useProfileStore((s) => s.currency);
  const budgets = useBudgetStore(useShallow((s) => s.budgets));
  const addBudget = useBudgetStore((s) => s.addBudget);
  const updateBudget = useBudgetStore((s) => s.updateBudget);
  const categories = useCategoryStore(useShallow((s) => s.categories.filter((c) => c.type === 'expense')));

  const existing = useMemo(() => budgets.find((budget) => budget.id === budgetId), [budgetId, budgets]);
  const isEdit = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? 'Monthly budget');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [period, setPeriod] = useState<BudgetPeriod>(existing?.period ?? 'monthly');
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId ?? initialCategoryId);
  const [warningThreshold, setWarningThreshold] = useState(existing?.warningThreshold ?? 80);
  const [criticalThreshold, setCriticalThreshold] = useState(existing?.criticalThreshold ?? 100);
  const [isHardLimit, setIsHardLimit] = useState(existing?.isHardLimit ?? false);
  const [rolloverEnabled, setRolloverEnabled] = useState(existing?.rolloverEnabled ?? false);
  const [saving, setSaving] = useState(false);

  const parsedAmount = Number(amount.replace(',', '.'));
  const amountError = amount.length > 0 && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    ? 'Enter a positive amount'
    : undefined;
  const thresholdError = warningThreshold >= criticalThreshold
    ? 'Warning threshold must be below critical threshold'
    : undefined;
  const duplicateBudget = budgets.find((budget) => (
    budget.isActive
    && budget.id !== existing?.id
    && budget.period === period
    && (budget.categoryId ?? null) === (categoryId ?? null)
  ));
  const duplicateError = duplicateBudget
    ? `Active ${period} budget already exists for ${categoryId ? 'this category' : 'all expenses'}`
    : undefined;
  const canSave = name.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0 && !thresholdError && !duplicateError;
  const pendingBudget = Number.isFinite(parsedAmount) && parsedAmount > 0 ? {
    id: existing?.id ?? 'pending-budget',
    userId,
    name: name.trim() || 'Budget',
    amount: parsedAmount,
    currency,
    period,
    categoryId,
    startDate: existing?.startDate ?? Date.now(),
    warningThreshold,
    criticalThreshold,
    isHardLimit,
    rolloverEnabled,
    isActive: true,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  } satisfies Budget : undefined;
  const allocation = buildBudgetAllocationSummary(budgets, currency, pendingBudget);
  const monthlyEquivalentAmount = pendingBudget ? monthlyEquivalent(pendingBudget.amount, pendingBudget.period) : 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const now = Date.now();
    try {
      if (existing) {
        const patch: Partial<Budget> = {
          name: name.trim(),
          amount: parsedAmount,
          currency,
          period,
          categoryId,
          warningThreshold,
          criticalThreshold,
          isHardLimit,
          rolloverEnabled,
          updatedAt: now,
        };
        const updatedBudget = { ...existing, ...patch };
        budgetQueries.update(existing.id, patch);
        updateBudget(existing.id, patch);
        await syncService.queueChange('budgets', existing.id, 'update', updatedBudget);
        const auditLog = auditLogQueries.record({
          userId: existing.userId,
          entityType: 'budgets',
          entityId: existing.id,
          action: 'update',
          before: existing,
          after: updatedBudget,
          source: 'budget_form',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        navigation.navigate('BudgetDetail', { budgetId: existing.id });
      } else {
        const budget: Budget = {
          id: generateUUID(),
          userId,
          name: name.trim(),
          amount: parsedAmount,
          currency,
          period,
          categoryId,
          startDate: now,
          warningThreshold,
          criticalThreshold,
          isHardLimit,
          rolloverEnabled,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        budgetQueries.insert(budget);
        addBudget(budget);
        await syncService.queueChange('budgets', budget.id, 'create', budget);
        const auditLog = auditLogQueries.record({
          userId,
          entityType: 'budgets',
          entityId: budget.id,
          action: 'create',
          after: budget,
          source: 'budget_form',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        navigation.navigate('BudgetDetail', { budgetId: budget.id });
      }
    } catch (error) {
      Alert.alert('Budget not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View>
          <Text style={styles.title}>{isEdit ? 'Edit budget' : 'Create budget'}</Text>
          <Text style={styles.subtitle}>Set a limit for all expenses or one category</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Input label="Name" value={name} onChangeText={setName} placeholder="Monthly food budget" />
        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="500000"
          keyboardType="decimal-pad"
          error={amountError}
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Period</Text>
          <View style={styles.chips}>
            {PERIODS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, period === item && styles.chipActive]}
                onPress={() => setPeriod(item)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, period === item && styles.chipTextActive]}>{periodLabel(item)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {pendingBudget && period !== 'monthly' && (
          <View style={styles.allocationCard}>
            <Text style={styles.allocationTitle}>Monthly equivalent</Text>
            <Text style={styles.allocationText}>≈ {formatCurrency(monthlyEquivalentAmount, currency)} per month, used for budget allocation comparisons.</Text>
          </View>
        )}

        {allocation.health !== 'none' && (
          <View style={[styles.allocationCard, allocation.health === 'exceeded' && styles.allocationCardDanger, allocation.health === 'near' && styles.allocationCardWarning]}>
            <Text style={styles.allocationTitle}>Category allocation</Text>
            <Text style={styles.allocationText}>
              {formatCurrency(allocation.categoryMonthly, currency)} / {formatCurrency(allocation.totalMonthly, currency)} monthly equivalent allocated to categories ({allocation.allocatedPercent}%).
            </Text>
            {allocation.health === 'exceeded' && <Text style={styles.allocationDanger}>Category limits exceed total budget by {formatCurrency(Math.abs(allocation.remainingMonthly), currency)} monthly equivalent.</Text>}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Limits</Text>
          <Text style={styles.helperText}>Set when Castar should warn the user and when the budget becomes critical.</Text>
          <Text style={styles.fieldLabel}>Warning threshold</Text>
          <View style={styles.chips}>
            {WARNING_PRESETS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, warningThreshold === item && styles.chipActive]}
                onPress={() => setWarningThreshold(item)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, warningThreshold === item && styles.chipTextActive]}>{item}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Critical threshold</Text>
          <View style={styles.chips}>
            {CRITICAL_PRESETS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, criticalThreshold === item && styles.chipActive]}
                onPress={() => setCriticalThreshold(item)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, criticalThreshold === item && styles.chipTextActive]}>{item}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          {thresholdError && <Text style={styles.errorText}>{thresholdError}</Text>}
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Hard limit</Text>
              <Text style={styles.toggleSubtitle}>Mark this budget as a strict spending cap.</Text>
            </View>
            <Switch value={isHardLimit} onValueChange={setIsHardLimit} thumbColor={colors.white[100]} trackColor={{ false: colors.borderLight, true: colors.success[600] }} />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Rollover</Text>
              <Text style={styles.toggleSubtitle}>Track unused or overspent balance for future periods.</Text>
            </View>
            <Switch value={rolloverEnabled} onValueChange={setRolloverEnabled} thumbColor={colors.white[100]} trackColor={{ false: colors.borderLight, true: colors.information[600] }} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Category</Text>
          <Text style={styles.helperText}>Category budgets only count expenses from the selected category. “All expenses” tracks the full expense total.</Text>
          <View style={styles.chips}>
            <TouchableOpacity
              style={[styles.chip, !categoryId && styles.chipActive]}
              onPress={() => setCategoryId(undefined)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>All expenses</Text>
            </TouchableOpacity>
            {categories.map((category) => {
              const categoryBudget = budgets.find((budget) => budget.isActive && budget.categoryId === category.id && budget.period === period && budget.id !== existing?.id);
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.chip, categoryId === category.id && styles.chipActive, categoryBudget && styles.chipDisabled]}
                  onPress={() => setCategoryId(category.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>
                    {category.icon} {category.name}{categoryBudget ? ' · budget exists' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {duplicateError && <Text style={styles.errorText}>{duplicateError}</Text>}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={isEdit ? 'Save changes' : 'Create budget'} onPress={handleSave} disabled={!canSave} loading={saving} fullWidth />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 140, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionLabel: { ...typography.smallMedium, color: colors.textSecondary },
  fieldLabel: { ...typography.captionMedium, color: colors.textTertiary, marginTop: spacing.sm },
  helperText: { ...typography.small, color: colors.textTertiary, lineHeight: 18 },
  errorText: { ...typography.captionMedium, color: colors.error[400] },
  allocationCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.base, gap: spacing.xs },
  allocationCardWarning: { borderColor: colors.warning[700] },
  allocationCardDanger: { borderColor: colors.error[500] },
  allocationTitle: { ...typography.bodySemiBold, color: colors.text },
  allocationText: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  allocationDanger: { ...typography.captionSemiBold, color: colors.error[400], lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surfaceElevated },
  chipActive: { backgroundColor: colors.white[100], borderColor: colors.white[100] },
  chipDisabled: { borderColor: colors.warning[700] },
  chipText: { ...typography.smallMedium, color: colors.textSecondary },
  chipTextActive: { color: colors.background },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.base, backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight },
  toggleText: { flex: 1, gap: spacing.xs },
  toggleTitle: { ...typography.bodySemiBold, color: colors.text },
  toggleSubtitle: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
