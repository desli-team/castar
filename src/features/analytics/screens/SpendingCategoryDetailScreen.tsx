import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { useShallow } from 'zustand/react/shallow';

import { BackButton } from '../../../shared/components/BackButton';
import { TransactionItem } from '../../../shared/components/TransactionItem';
import { colors, spacing, typography, borderRadius } from '../../../shared/constants';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { buildAnalyticsProReport, type AnalyticsPeriod } from '../../../shared/services/analytics/analyticsPro';
import type { MonitoringStackParamList } from '../../../shared/types';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useRecurringStore } from '../../recurring/store/recurringStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';

type ScreenRoute = RouteProp<MonitoringStackParamList, 'SpendingCategoryDetail'>;

export const SpendingCategoryDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<ScreenRoute>();
  const insets = useSafeAreaInsets();
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const budgets = useBudgetStore(useShallow((s) => s.budgets.filter((budget) => budget.isActive)));
  const recurrings = useRecurringStore(useShallow((s) => s.recurrings));

  const report = useMemo(() => buildAnalyticsProReport({
    period: route.params.period as AnalyticsPeriod,
    transactions,
    categories,
    budgets,
    accounts: [],
    debts: [],
    recurrings,
  }), [budgets, categories, recurrings, route.params.period, transactions]);

  const item = report.categoryBreakdown.find((entry) => entry.categoryId === route.params.categoryId);
  const currency = item?.transactions[0]?.currency ?? 'UZS';

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{item?.categoryName ?? 'Category'}</Text>
          <Text style={styles.subtitle}>{route.params.period} spending drill-down</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.eyebrow}>TOTAL SPENT</Text>
        <Text style={styles.amount}>{formatCurrency(item?.amount ?? 0, currency)}</Text>
        <Text style={styles.meta}>
          {item?.transactionCount ?? 0} transaction{item?.transactionCount === 1 ? '' : 's'}
          {item?.deltaPercent !== null && item?.deltaPercent !== undefined ? ` · ${item.deltaPercent >= 0 ? '+' : ''}${item.deltaPercent}% vs previous period` : ''}
        </Text>
      </View>

      <FlatList
        data={item?.transactions ?? []}
        keyExtractor={(transaction) => transaction.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No transactions in this category for the selected period.</Text>}
        renderItem={({ item: transaction }) => {
          const category = categories.find((entry) => entry.id === transaction.categoryId);
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'TransactionDetail', params: { transactionId: transaction.id } } }))}
            >
              <TransactionItem
                icon={category?.icon ?? '•'}
                iconColor={category?.color ?? colors.information[500]}
                title={transaction.description || category?.name || 'Transaction'}
                subtitle={`${format(transaction.date, 'dd MMM yyyy')} · ${category?.name ?? 'Other'}`}
                amount={transaction.amount}
                currency={transaction.currency}
                type={transaction.type}
              />
            </TouchableOpacity>
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
  amount: { ...typography.heading2, color: colors.text },
  meta: { ...typography.caption, color: colors.textTertiary },
  listContent: { paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textTertiary, paddingVertical: spacing.xl },
});
