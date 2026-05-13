import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../../profile/store/profileStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import { useDebtStore } from '../store/debtStore';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import * as debtRepaymentQueries from '../../../shared/services/database/debtRepaymentQueries';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { resolveIntent } from '../../../shared/services/intent/intentResolver';
import { generateUUID } from '../../transactions/utils/transactionCandidates';
import { parseDebtIntent, type ParsedDebtIntent } from '../utils/debtIntents';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import type { Category, Currency, Debt, DebtDirection, DebtRepayment, TasksStackParamList, Transaction } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;

function directionLabel(debt: Debt) {
  return debt.direction === 'i_owe' ? `You owe ${debt.personName}` : `${debt.personName} owes you`;
}

function normalizePerson(value: string) {
  return value.trim().toLowerCase();
}

function repaymentType(direction: DebtDirection): Transaction['type'] {
  return direction === 'i_owe' ? 'expense' : 'income';
}

function fallbackCategory(categories: Category[], direction: DebtDirection): Category | undefined {
  const type = repaymentType(direction);
  const list = categories.filter((category) => category.type === type);
  return list.find((category) => /other/i.test(category.name)) ?? list[0];
}

export const DebtsScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId) || '';
  const currency = useProfileStore((s) => s.currency);
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const debts = useDebtStore(useShallow((s) => s.debts));
  const setDebts = useDebtStore((s) => s.setDebts);
  const addDebt = useDebtStore((s) => s.addDebt);
  const updateDebt = useDebtStore((s) => s.updateDebt);
  const addRepayment = useDebtStore((s) => s.addRepayment);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const [quickText, setQuickText] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setDebts(debtQueries.findByUser(userId));
  }, [setDebts, userId]);

  const active = useMemo(() => debts.filter((debt) => debt.status === 'active'), [debts]);
  const settled = useMemo(() => debts.filter((debt) => debt.status === 'settled'), [debts]);
  const totalOwed = active.filter((debt) => debt.direction === 'i_owe').reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const totalReceivable = active.filter((debt) => debt.direction === 'owes_me').reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const displayCurrency = active[0]?.currency ?? debts[0]?.currency ?? currency ?? 'UZS';

  const createRepayment = async (debt: Debt, amount: number, note: string) => {
    const account = debt.accountId ? accountQueries.findById(debt.accountId) : accountQueries.findByUser(debt.userId)[0];
    const category = debt.categoryId ? categories.find((item) => item.id === debt.categoryId) : fallbackCategory(categories, debt.direction);
    if (!account || !category) {
      Alert.alert('Needs setup', 'This debt needs an account and repayment category before saving a parsed repayment.');
      return;
    }

    const now = Date.now();
    const nextAmount = Math.min(amount, debt.remainingAmount);
    const nextRemaining = Math.max(0, debt.remainingAmount - nextAmount);
    const nextStatus = nextRemaining <= 0 ? 'settled' as const : 'active' as const;
    const txType = repaymentType(debt.direction);
    const transaction: Transaction = {
      id: generateUUID(),
      userId: debt.userId,
      accountId: account.id,
      categoryId: category.id,
      type: txType,
      amount: nextAmount,
      currency: debt.currency,
      description: `Debt repayment: ${debt.personName}`,
      date: now,
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
      accountId: account.id,
      amount: nextAmount,
      currency: debt.currency,
      note,
      date: now,
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
    accountQueries.adjustBalance(account.id, txType === 'income' ? nextAmount : -nextAmount);
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
      source: 'debt_quick_parser',
    });
    const transactionAudit = auditLogQueries.record({
      userId: debt.userId,
      entityType: 'transactions',
      entityId: transaction.id,
      action: 'create',
      after: transaction,
      source: 'debt_quick_parser',
    });
    const debtAudit = auditLogQueries.record({
      userId: debt.userId,
      entityType: 'debts',
      entityId: debt.id,
      action: nextStatus === 'settled' ? 'settle' : 'update',
      before: debt,
      after: updatedDebt,
      source: 'debt_quick_parser',
    });
    await syncService.queueChange('audit_logs', repaymentAudit.id, 'create', repaymentAudit);
    await syncService.queueChange('audit_logs', transactionAudit.id, 'create', transactionAudit);
    await syncService.queueChange('audit_logs', debtAudit.id, 'create', debtAudit);
  };

  const resolveQuickDebtIntent = async (): Promise<ParsedDebtIntent | null> => {
    try {
      const accounts = userId ? accountQueries.findByUser(userId) : [];
      const resolution = await resolveIntent({
        text: quickText,
        source: 'text',
        uiLanguage: useProfileStore.getState().language,
        defaultCurrency: (currency ?? 'UZS') as Currency,
        categories,
        accounts,
        activeDebts: active,
      });

      const draft = resolution.drafts.find((item) => item.kind === 'debt_create' || item.kind === 'debt_repayment');
      if (draft?.kind === 'debt_create' && draft.debt?.amount && draft.debt.personName) {
        return {
          kind: 'create_debt',
          direction: draft.debt.direction,
          personName: draft.debt.personName,
          amount: draft.debt.amount,
          currency: draft.debt.currency,
          note: draft.debt.note ?? quickText,
          confidence: draft.confidence,
          rawText: quickText,
        };
      }
      if (draft?.kind === 'debt_repayment' && draft.repayment?.amount && draft.repayment.personName) {
        return {
          kind: 'repayment',
          direction: draft.repayment.direction,
          personName: draft.repayment.personName,
          amount: draft.repayment.amount,
          currency: draft.repayment.currency,
          note: draft.repayment.note ?? quickText,
          confidence: draft.confidence,
          rawText: quickText,
        };
      }
    } catch {
      // Network/model unavailable: keep local conservative parser as fallback.
    }

    return parseDebtIntent(quickText);
  };

  const handleQuickParse = async () => {
    if (!userId) return;

    setQuickSaving(true);
    try {
      const intent = await resolveQuickDebtIntent();
      if (!intent) {
        Alert.alert('Could not understand IOU', 'Try: “I owe John 100”, “Sarah owes me 50”, “paid John 30”, or “Sarah paid me 20”.');
        return;
      }

      const now = Date.now();
      if (intent.kind === 'create_debt') {
        const account = accountQueries.findByUser(userId)[0];
        const category = fallbackCategory(categories, intent.direction);
        const debt: Debt = {
          id: generateUUID(),
          userId,
          personName: intent.personName,
          direction: intent.direction,
          principalAmount: intent.amount,
          remainingAmount: intent.amount,
          currency: intent.currency ?? currency ?? 'UZS',
          accountId: account?.id,
          categoryId: category?.id,
          note: intent.note,
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
          source: 'debt_quick_parser',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        setQuickText('');
        navigation.navigate('DebtDetail', { debtId: debt.id });
        return;
      }

      const matchedDebt = active.find((debt) => (
        debt.direction === intent.direction && normalizePerson(debt.personName) === normalizePerson(intent.personName)
      )) ?? active.find((debt) => (
        debt.direction === intent.direction && normalizePerson(debt.personName).includes(normalizePerson(intent.personName))
      ));

      if (!matchedDebt) {
        Alert.alert('Debt not found', `I understood a repayment from ${intent.personName}, but no active matching debt exists yet.`);
        return;
      }

      await createRepayment(matchedDebt, intent.amount, intent.note);
      setQuickText('');
      navigation.navigate('DebtDetail', { debtId: matchedDebt.id });
    } catch (error) {
      Alert.alert('IOU not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setQuickSaving(false);
    }
  };

  const renderDebt = (debt: Debt) => {
    const progress = Math.max(0, Math.min(1, 1 - debt.remainingAmount / debt.principalAmount));
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={() => navigation.navigate('DebtDetail', { debtId: debt.id })}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>{directionLabel(debt)}</Text>
            <Text style={styles.cardMeta}>{debt.status === 'settled' ? 'Settled' : `${Math.round(progress * 100)}% repaid`}</Text>
          </View>
          <View style={[styles.badge, debt.direction === 'i_owe' ? styles.oweBadge : styles.receiveBadge]}>
            <Text style={styles.badgeText}>{debt.direction === 'i_owe' ? 'I owe' : 'Owes me'}</Text>
          </View>
        </View>
        <Text style={[styles.amount, debt.direction === 'owes_me' && styles.incomeAmount]}>{formatCurrency(debt.remainingAmount, debt.currency)} remaining</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
        {debt.dueDate && <Text style={styles.dueText}>Due {new Date(debt.dueDate).toLocaleDateString()}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Debts & lending</Text>
          <Text style={styles.subtitle}>Track IOUs separately from normal spending</Text>
        </View>
      </View>

      <SectionList
        sections={[
          { title: 'Active', count: active.length, data: active },
          ...(settled.length > 0 ? [{ title: 'Settled history', count: settled.length, data: settled }] : []),
        ]}
        keyExtractor={(debt) => debt.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <>
            <View style={styles.quickCard}>
              <Text style={styles.quickTitle}>Quick IOU parser</Text>
              <Text style={styles.quickText}>Try “I owe John 100”, “Sarah owes me 50”, “paid John 30”, or “Sarah paid me 20”.</Text>
              <Input label="Debt text" value={quickText} onChangeText={setQuickText} placeholder="I owe John 100" />
              <Button title="Parse and save" onPress={handleQuickParse} disabled={!quickText.trim()} loading={quickSaving} fullWidth />
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>You owe</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(totalOwed, displayCurrency)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Owed to you</Text>
                <Text style={[styles.summaryAmount, styles.incomeAmount]}>{formatCurrency(totalReceivable, displayCurrency)}</Text>
              </View>
            </View>

            {active.length === 0 && settled.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No debts yet</Text>
                <Text style={styles.emptyText}>Create an IOU without mixing it into expenses or income. Real transactions are created only when repayment happens.</Text>
                <Button title="Create debt" onPress={() => navigation.navigate('CreateDebt')} fullWidth />
              </View>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          active.length === 0 && settled.length === 0 ? null : (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.count}</Text>
            </View>
          )
        )}
        renderSectionFooter={({ section }) => (
          section.title === 'Active' && section.data.length === 0 && settled.length > 0
            ? <Text style={styles.helperText}>No active debts.</Text>
            : null
        )}
        renderItem={({ item }) => renderDebt(item)}
      />

      {(active.length > 0 || settled.length > 0) && (
        <View style={styles.footer}>
          <Button title="Create debt" onPress={() => navigation.navigate('CreateDebt')} fullWidth />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 130, gap: spacing.md },
  quickCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  quickTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  quickText: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryCard: { flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight },
  summaryLabel: { ...typography.caption, color: colors.textTertiary },
  summaryAmount: { ...typography.bodyLargeSemiBold, color: colors.error[400], marginTop: spacing.xs },
  emptyCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.xl, gap: spacing.base, marginTop: spacing['4xl'] },
  emptyTitle: { ...typography.heading5, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  sectionCount: { ...typography.captionMedium, color: colors.textTertiary },
  helperText: { ...typography.body, color: colors.textTertiary },
  card: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  cardTitleBlock: { flex: 1 },
  cardTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  cardMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, alignSelf: 'flex-start' },
  oweBadge: { backgroundColor: colors.error[900] },
  receiveBadge: { backgroundColor: colors.success[900] },
  badgeText: { ...typography.captionMedium, color: colors.text },
  amount: { ...typography.heading5, color: colors.error[400] },
  incomeAmount: { color: colors.success[500] },
  progressTrack: { height: 6, borderRadius: borderRadius.full, backgroundColor: colors.white[20], overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.white[100], borderRadius: borderRadius.full },
  dueText: { ...typography.caption, color: colors.textTertiary },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
