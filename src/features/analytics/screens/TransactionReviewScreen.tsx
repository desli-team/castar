import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { BackButton } from '../../../shared/components/BackButton';
import { TransactionItem } from '../../../shared/components/TransactionItem';
import { colors, spacing, typography, borderRadius } from '../../../shared/constants';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import type { Transaction } from '../../../shared/types';

const duplicateKey = (transaction: Transaction) => [
  transaction.type,
  transaction.amount,
  transaction.currency,
  transaction.categoryId,
  new Date(transaction.date).toDateString(),
].join(':');

export const TransactionReviewScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const categoryIds = useMemo(() => new Set(categories.map((item) => item.id)), [categories]);

  const reviewItems = useMemo(() => {
    const seen = new Set<string>();
    return [...transactions]
      .sort((a, b) => b.date - a.date)
      .map((transaction) => {
        const key = duplicateKey(transaction);
        const duplicate = seen.has(key);
        seen.add(key);
        return {
          transaction,
          duplicate,
          needsCategory: !transaction.categoryId || !categoryIds.has(transaction.categoryId),
          unreviewed: !transaction.reviewed,
        };
      })
      .filter((item) => item.unreviewed || item.needsCategory || item.duplicate);
  }, [categoryIds, transactions]);

  const markReviewed = async (transaction: Transaction) => {
    const patch: Partial<Transaction> = { reviewed: true, updatedAt: Date.now(), syncedAt: undefined };
    const updated = { ...transaction, ...patch };
    transactionQueries.update(transaction.id, patch);
    updateTransaction(transaction.id, patch);
    await syncService.queueChange('transactions', transaction.id, 'update', updated);
  };

  const markAllReviewed = async () => {
    for (const item of reviewItems) {
      await markReviewed(item.transaction);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Transaction review</Text>
          <Text style={styles.subtitle}>Clean up uncategorized, duplicated, and unreviewed ledger entries.</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.eyebrow}>REVIEW QUEUE</Text>
        <Text style={styles.count}>{reviewItems.length}</Text>
        <Text style={styles.subtitle}>Items that may need attention before analytics can be trusted.</Text>
        {reviewItems.length > 0 ? (
          <TouchableOpacity style={styles.markAllButton} activeOpacity={0.75} onPress={markAllReviewed}>
            <Text style={styles.markAllText}>Mark all reviewed</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={reviewItems}
        keyExtractor={(item) => item.transaction.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>All clear. Your transaction ledger is reviewed.</Text>}
        renderItem={({ item }) => {
          const transaction = item.transaction;
          const category = categories.find((entry) => entry.id === transaction.categoryId);
          const flags = [
            item.unreviewed ? 'Unreviewed' : undefined,
            item.needsCategory ? 'Needs category' : undefined,
            item.duplicate ? 'Possible duplicate' : undefined,
          ].filter(Boolean).join(' · ');

          return (
            <View style={styles.reviewCard}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'TransactionDetail', params: { transactionId: transaction.id } } }))}
              >
                <TransactionItem
                  icon={category?.icon ?? '•'}
                  iconColor={category?.color ?? colors.information[500]}
                  title={transaction.description || category?.name || 'Transaction'}
                  subtitle={flags || category?.name || 'Other'}
                  amount={transaction.amount}
                  currency={transaction.currency}
                  type={transaction.type}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.reviewButton} activeOpacity={0.75} onPress={() => markReviewed(transaction)}>
                <Text style={styles.reviewButtonText}>Mark reviewed</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  summaryCard: { borderRadius: borderRadius['2xl'], backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.base, gap: spacing.sm },
  eyebrow: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1 },
  count: { ...typography.heading2, color: colors.text },
  markAllButton: { alignSelf: 'flex-start', borderRadius: borderRadius.full, backgroundColor: colors.success[700], paddingHorizontal: spacing.base, paddingVertical: spacing.sm, marginTop: spacing.sm },
  markAllText: { ...typography.bodySemiBold, color: colors.background },
  listContent: { paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textTertiary, paddingVertical: spacing.xl },
  reviewCard: { borderRadius: borderRadius.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.sm, gap: spacing.sm },
  reviewButton: { alignSelf: 'flex-end', borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reviewButtonText: { ...typography.captionSemiBold, color: colors.text },
});
