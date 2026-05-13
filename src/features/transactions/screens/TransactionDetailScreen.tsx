import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { usePostHog } from 'posthog-react-native';

import { Button } from '../../../shared/components';
import { BackButton } from '../../../shared/components/BackButton';
import { colors, spacing, typography, borderRadius } from '../../../shared/constants';
import type { HomeStackParamList, Transaction, TransactionType } from '../../../shared/types';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../store/transactionStore';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { captureSafeEvent } from '../../../shared/services/analytics/posthog';

type RouteProps = NativeStackScreenProps<HomeStackParamList, 'TransactionDetail'>['route'];
type EditableType = Extract<TransactionType, 'income' | 'expense'>;

const parseEditableAmount = (value: string): number => {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const signedAmount = (type: TransactionType, amount: number): number => (
  type === 'income' ? amount : -amount
);

export const TransactionDetailScreen = () => {
  const { t } = useTranslation();
  const posthog = usePostHog();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const transaction = useTransactionStore((s) => s.transactions.find((item) => item.id === route.params.transactionId));
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);
  const removeTransaction = useTransactionStore((s) => s.removeTransaction);
  const categories = useCategoryStore((s) => s.categories);
  const category = transaction ? categories.find((item) => item.id === transaction.categoryId) : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [typeInput, setTypeInput] = useState<EditableType>('expense');
  const [categoryIdInput, setCategoryIdInput] = useState('');
  const [deletedTransaction, setDeletedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!transaction || isEditing) return;
    setAmountInput(String(transaction.amount));
    setDescriptionInput(transaction.description ?? '');
    setTypeInput(transaction.type === 'income' ? 'income' : 'expense');
    setCategoryIdInput(transaction.categoryId);
  }, [isEditing, transaction]);

  const editableCategories = useMemo(
    () => categories.filter((item) => item.type === typeInput),
    [categories, typeInput],
  );

  const categoryName = useMemo(() => {
    if (!category) return 'Other';
    return category.name.startsWith('categories.') ? t(category.name) : category.name;
  }, [category, t]);

  const handleTypeChange = (nextType: EditableType) => {
    setTypeInput(nextType);
    const firstMatchingCategory = categories.find((item) => item.type === nextType);
    if (firstMatchingCategory) setCategoryIdInput(firstMatchingCategory.id);
  };

  const handleSave = async () => {
    if (!transaction) return;
    const amount = parseEditableAmount(amountInput);
    if (amount <= 0) {
      Alert.alert('Fix amount', 'Amount must be greater than 0.');
      return;
    }

    const now = Date.now();
    const patch: Partial<Transaction> = {
      amount,
      description: descriptionInput.trim() || undefined,
      type: typeInput,
      categoryId: categoryIdInput || transaction.categoryId,
      updatedAt: now,
      syncedAt: undefined,
    };

    const updatedTransaction = { ...transaction, ...patch };
    const balanceDelta = signedAmount(updatedTransaction.type, updatedTransaction.amount) - signedAmount(transaction.type, transaction.amount);
    transactionQueries.update(transaction.id, patch);
    if (balanceDelta !== 0) accountQueries.adjustBalance(transaction.accountId, balanceDelta);
    updateTransaction(transaction.id, patch);
    await syncService.queueChange('transactions', transaction.id, 'update', updatedTransaction);
    const auditLog = auditLogQueries.record({
      userId: transaction.userId,
      entityType: 'transactions',
      entityId: transaction.id,
      action: 'update',
      before: transaction,
      after: updatedTransaction,
      source: 'transaction_detail',
    });
    await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
    captureSafeEvent(posthog, 'transaction_updated', {
      source: 'detail',
      type: typeInput,
      currency: transaction.currency,
      voiceInput: transaction.voiceInput,
    });
    setIsEditing(false);
  };

  const handleToggleReviewed = async () => {
    if (!transaction) return;
    const patch: Partial<Transaction> = {
      reviewed: !transaction.reviewed,
      updatedAt: Date.now(),
      syncedAt: undefined,
    };
    const updatedTransaction = { ...transaction, ...patch };
    transactionQueries.update(transaction.id, patch);
    updateTransaction(transaction.id, patch);
    await syncService.queueChange('transactions', transaction.id, 'update', updatedTransaction);
    captureSafeEvent(posthog, 'transaction_review_toggled', {
      source: 'detail',
      reviewed: patch.reviewed,
      type: transaction.type,
      currency: transaction.currency,
    });
  };

  const handleDelete = () => {
    if (!transaction) return;

    Alert.alert(
      'Delete transaction?',
      'This removes it locally and queues the delete for sync. You can undo immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            transactionQueries.delete(transaction.id);
            accountQueries.adjustBalance(transaction.accountId, -signedAmount(transaction.type, transaction.amount));
            removeTransaction(transaction.id);
            setDeletedTransaction(transaction);
            await syncService.queueChange('transactions', transaction.id, 'delete', {
              id: transaction.id,
              remoteId: transaction.remoteId,
              updatedAt: Date.now(),
            });
            const auditLog = auditLogQueries.record({
              userId: transaction.userId,
              entityType: 'transactions',
              entityId: transaction.id,
              action: 'delete',
              before: transaction,
              source: 'transaction_detail',
            });
            await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
            captureSafeEvent(posthog, 'transaction_deleted', {
              source: 'detail',
              type: transaction.type,
              currency: transaction.currency,
              voiceInput: transaction.voiceInput,
            });
          },
        },
      ],
    );
  };

  const handleUndoDelete = async () => {
    if (!deletedTransaction) return;
    const restored = { ...deletedTransaction, updatedAt: Date.now(), syncedAt: undefined };
    transactionQueries.insert(restored);
    accountQueries.adjustBalance(restored.accountId, signedAmount(restored.type, restored.amount));
    addTransaction(restored);
    await syncService.queueChange('transactions', restored.id, 'create', restored);
    const auditLog = auditLogQueries.record({
      userId: restored.userId,
      entityType: 'transactions',
      entityId: restored.id,
      action: 'restore',
      before: deletedTransaction,
      after: restored,
      source: 'transaction_detail',
    });
    await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
    captureSafeEvent(posthog, 'transaction_delete_undone', {
      source: 'detail',
      type: restored.type,
      currency: restored.currency,
      voiceInput: restored.voiceInput,
    });
    setDeletedTransaction(null);
  };

  if (!transaction && deletedTransaction) {
    return (
      <View style={[styles.containerPadded, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.deletedCard}>
          <Text style={styles.title}>Transaction deleted</Text>
          <Text style={styles.mutedNoPadding}>You can restore it before leaving this screen.</Text>
          <Button title="Undo delete" onPress={handleUndoDelete} fullWidth />
          <Button title="Done" onPress={() => navigation.goBack()} variant="ghost" fullWidth />
        </View>
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={[styles.containerPadded, { paddingTop: insets.top + spacing.xl }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Transaction not found</Text>
        <Text style={styles.mutedNoPadding}>It may have been deleted or not loaded yet.</Text>
      </View>
    );
  }

  const isIncome = transaction.type === 'income';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>Transaction</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.typeLabel}>{transaction.type}</Text>
          <Text style={[styles.amount, isIncome ? styles.income : styles.expense]}>
            {isIncome ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency)}
          </Text>
          <Text style={styles.description}>{transaction.description || categoryName}</Text>
        </View>

        {isEditing ? (
          <View style={styles.editCard}>
            <Text style={styles.sectionTitle}>Edit transaction</Text>

            <View style={styles.segmentRow}>
              {(['expense', 'income'] as EditableType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.segment, typeInput === type && styles.segmentActive]}
                  onPress={() => handleTypeChange(type)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, typeInput === type && styles.segmentTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={styles.input}
              value={descriptionInput}
              onChangeText={setDescriptionInput}
              placeholder="Description"
              placeholderTextColor={colors.textTertiary}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChips}>
              {editableCategories.map((item) => {
                const selected = categoryIdInput === item.id;
                const label = item.name.startsWith('categories.') ? t(item.name) : item.name;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.categoryChip, selected && styles.categoryChipActive]}
                    onPress={() => setCategoryIdInput(item.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.actionRow}>
              <Button title="Cancel" onPress={() => setIsEditing(false)} variant="secondary" fullWidth style={styles.actionButton} />
              <Button title="Save" onPress={handleSave} fullWidth style={styles.actionButton} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.detailsCard}>
              <DetailRow label="Category" value={categoryName} />
              <DetailRow label="Date" value={format(transaction.date, 'dd MMM yyyy, HH:mm')} />
              <DetailRow label="Currency" value={transaction.currency} />
              <DetailRow label="Input" value={transaction.voiceInput ? 'Voice' : 'Manual/Text'} />
              <DetailRow label="Recurring" value={transaction.isRecurring ? 'Yes' : 'No'} />
              <DetailRow label="Review" value={transaction.reviewed ? 'Reviewed' : 'Needs review'} />
            </View>

            <Button title={transaction.reviewed ? 'Mark as needs review' : 'Mark reviewed'} onPress={handleToggleReviewed} variant="secondary" fullWidth style={styles.editButton} />
            <Button title="Edit transaction" onPress={() => setIsEditing(true)} fullWidth style={styles.editButton} />
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.75}>
              <Text style={styles.deleteButtonText}>Delete transaction</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  containerPadded: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.heading3,
    color: colors.text,
  },
  mutedNoPadding: {
    ...typography.bodyLarge,
    color: colors.textTertiary,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  typeLabel: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  amount: {
    ...typography.heading2,
  },
  income: {
    color: colors.success[500],
  },
  expense: {
    color: colors.text,
  },
  description: {
    ...typography.bodyLarge,
    color: colors.text,
  },
  detailsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  detailLabel: {
    ...typography.body,
    color: colors.textTertiary,
  },
  detailValue: {
    ...typography.bodyMedium,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  editButton: {
    marginBottom: spacing.md,
  },
  deleteButton: {
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,81,81,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,81,81,0.35)',
  },
  deleteButtonText: {
    ...typography.bodyLargeMedium,
    color: '#FF5151',
  },
  editCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyLargeMedium,
    color: colors.text,
  },
  input: {
    ...typography.bodyLarge,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  segmentActive: {
    backgroundColor: colors.white[100],
  },
  segmentText: {
    ...typography.bodyMedium,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  segmentTextActive: {
    color: colors.background,
  },
  categoryChips: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  categoryChip: {
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: colors.white[100],
  },
  categoryChipText: {
    ...typography.captionMedium,
    color: colors.textTertiary,
  },
  categoryChipTextActive: {
    color: colors.background,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  deletedCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
});
