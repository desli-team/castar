import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
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
import { useShallow } from 'zustand/react/shallow';

import { BackButton } from '../../../shared/components/BackButton';
import { TransactionItem } from '../../../shared/components/TransactionItem';
import { colors, spacing, typography, borderRadius } from '../../../shared/constants';
import type { HomeStackParamList, Transaction, TransactionType } from '../../../shared/types';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../store/transactionStore';

type TransactionFilterType = 'all' | Extract<TransactionType, 'income' | 'expense'>;
type PeriodFilter = 'all' | 'month' | 'week';
type Route = NativeStackScreenProps<HomeStackParamList, 'Transactions'>['route'];

const FILTERS: TransactionFilterType[] = ['all', 'expense', 'income'];
const PERIODS: PeriodFilter[] = ['all', 'month', 'week'];

function getPeriodCutoff(period: PeriodFilter): number | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'month') {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

export const TransactionsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const categories = useCategoryStore(useShallow((s) => s.categories));

  const [typeFilter, setTypeFilter] = useState<TransactionFilterType>(route.params?.type ?? 'all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(route.params?.period ?? 'all');
  const [categoryFilter, setCategoryFilter] = useState(route.params?.categoryId ?? 'all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setTypeFilter(route.params?.type ?? 'all');
    setPeriodFilter(route.params?.period ?? 'all');
    setCategoryFilter(route.params?.categoryId ?? 'all');
  }, [route.params?.categoryId, route.params?.period, route.params?.type]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const categoryFilters = useMemo(() => {
    const usedCategoryIds = new Set(transactions.map((transaction) => transaction.categoryId));
    return categories
      .filter((category) => usedCategoryIds.has(category.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, transactions]);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const cutoff = getPeriodCutoff(periodFilter);

    return [...transactions]
      .filter((transaction) => {
        if (typeFilter !== 'all' && transaction.type !== typeFilter) return false;
        if (categoryFilter !== 'all' && transaction.categoryId !== categoryFilter) return false;
        if (cutoff && transaction.date < cutoff) return false;
        if (!normalizedSearch) return true;

        const category = categoryById.get(transaction.categoryId);
        const categoryName = category?.name.startsWith('categories.') ? t(category.name) : category?.name;
        const haystack = `${transaction.description ?? ''} ${categoryName ?? ''}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => b.date - a.date);
  }, [categoryById, categoryFilter, periodFilter, search, t, transactions, typeFilter]);

  const totals = useMemo(() => filteredTransactions.reduce(
    (acc, transaction) => {
      if (transaction.type === 'income') acc.income += transaction.amount;
      if (transaction.type === 'expense') acc.expense += transaction.amount;
      return acc;
    },
    { income: 0, expense: 0 },
  ), [filteredTransactions]);

  const renderChip = <T extends string>(
    value: T,
    active: boolean,
    onPress: (value: T) => void,
    label = value,
  ) => (
    <TouchableOpacity
      key={value}
      style={[styles.chip, active && styles.chipActive]}
      onPress={() => onPress(value)}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const getCategory = (transaction: Transaction) => categoryById.get(transaction.categoryId);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View>
          <Text style={styles.title}>{t('transactions.title')}</Text>
          <Text style={styles.subtitle}>{filteredTransactions.length} transactions</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Income</Text>
          <Text style={styles.incomeText}>+{Math.round(totals.income).toLocaleString()}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Spent</Text>
          <Text style={styles.expenseText}>-{Math.round(totals.expense).toLocaleString()}</Text>
        </View>
      </View>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search description or category"
        placeholderTextColor={colors.textTertiary}
      />

      <View style={styles.chipRow}>
        {FILTERS.map((filter) => renderChip(filter, typeFilter === filter, setTypeFilter))}
      </View>
      <View style={styles.chipRow}>
        {PERIODS.map((period) => renderChip(period, periodFilter === period, setPeriodFilter))}
      </View>

      {categoryFilters.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilterRow}>
          {renderChip('all', categoryFilter === 'all', setCategoryFilter)}
          {categoryFilters.map((category) => {
            const label = category.name.startsWith('categories.') ? t(category.name) : category.name;
            return renderChip(category.id, categoryFilter === category.id, setCategoryFilter, label);
          })}
        </ScrollView>
      )}

      <FlatList
        data={filteredTransactions}
        keyExtractor={(transaction) => transaction.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>{t('transactions.noTransactions')}</Text>}
        renderItem={({ item: transaction }) => {
          const category = getCategory(transaction);
          const categoryName = category
            ? (category.name.startsWith('categories.') ? t(category.name) : category.name)
            : 'Other';

          return (
            <TransactionItem
              icon={category?.icon ?? 'shopping'}
              iconColor={category?.color ?? colors.information[500]}
              title={transaction.description || categoryName}
              subtitle={`${categoryName} · ${format(transaction.date, 'dd MMM yyyy')}`}
              amount={transaction.amount}
              currency={transaction.currency}
              type={transaction.type}
              onPress={() => navigation.navigate('TransactionDetail', { transactionId: transaction.id })}
            />
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
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
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryItem: {
    flex: 1,
    gap: spacing.sm,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: spacing.md,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  incomeText: {
    ...typography.bodyLargeMedium,
    color: colors.success[500],
  },
  expenseText: {
    ...typography.bodyLargeMedium,
    color: colors.text,
  },
  searchInput: {
    ...typography.bodyLarge,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 52,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryFilterRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.white[100],
  },
  chipText: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: colors.background,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  empty: {
    ...typography.bodyLarge,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 80,
  },
});
