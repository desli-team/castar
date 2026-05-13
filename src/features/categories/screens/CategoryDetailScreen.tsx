import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { format } from 'date-fns';
import { useShallow } from 'zustand/react/shallow';

import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { getBudgetProgress } from '../../budget/utils/budgetProgress';
import { useCategoryStore } from '../store/categoryStore';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import type { ProfileStackParamList, Transaction } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'CategoryDetail'>;
type ScreenRoute = RouteProp<ProfileStackParamList, 'CategoryDetail'>;
type EntryTab = 'all' | 'repetitive';

const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5L9 12L15 19" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const GearIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={3.2} stroke={colors.text} strokeWidth={1.7} />
    <Path d="M12 3.8V6M12 18V20.2M5.7 5.7L7.25 7.25M16.75 16.75L18.3 18.3M3.8 12H6M18 12H20.2M5.7 18.3L7.25 16.75M16.75 7.25L18.3 5.7" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

const ChevronIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5L15 12L9 19" stroke={colors.white[40]} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CategoryDetailScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<ScreenRoute>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<EntryTab>('all');

  const category = useCategoryStore(useShallow((s) => s.categories.find((item) => item.id === route.params.categoryId)));
  const budgets = useBudgetStore(useShallow((s) => s.budgets.filter((budget) => budget.isActive)));
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useFocusEffect(useCallback(() => {
    if (!category) return;
    setTransactions(transactionQueries.findByUser(category.userId, 10000));
  }, [category]));

  const categoryTransactions = useMemo(() => transactions
    .filter((transaction) => transaction.categoryId === route.params.categoryId)
    .filter((transaction) => tab === 'all' || transaction.isRecurring)
    .sort((a, b) => b.date - a.date), [route.params.categoryId, tab, transactions]);

  const primaryBudget = category ? budgets.find((budget) => budget.categoryId === category.id) : undefined;
  const progress = primaryBudget ? getBudgetProgress(primaryBudget, transactions) : undefined;
  const spent = progress?.spent ?? categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const percentage = progress ? Math.round(progress.percentage) : 0;
  const currency = primaryBudget?.currency ?? categoryTransactions[0]?.currency ?? 'UZS';

  const openCategoryTransactions = () => {
    navigation.dispatch(CommonActions.navigate({
      name: 'HomeTab',
      params: { screen: 'Transactions', params: { categoryId: route.params.categoryId, type: category?.type } },
    }));
  };

  const openLimit = () => {
    if (primaryBudget) {
      navigation.dispatch(CommonActions.navigate({
        name: 'HomeTab',
        params: { screen: 'BudgetDetail', params: { budgetId: primaryBudget.id } },
      }));
      return;
    }
    if (category) navigation.navigate('CreateCategory', { categoryId: category.id });
  };

  const openTransaction = (transactionId: string) => {
    navigation.dispatch(CommonActions.navigate({
      name: 'HomeTab',
      params: { screen: 'TransactionDetail', params: { transactionId } },
    }));
  };

  if (!category) {
    return (
      <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
        <View style={[styles.missingContainer, { paddingTop: insets.top + spacing.lg }]}> 
          <TouchableOpacity style={styles.navButton} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
          <Text style={styles.missingTitle}>Category not found</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['5xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.75} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{category.name}</Text>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.75} onPress={() => navigation.navigate('CreateCategory', { categoryId: category.id })}>
            <GearIcon />
          </TouchableOpacity>
        </View>

        <View style={styles.heroBlock}>
          <View style={[styles.heroIcon, { backgroundColor: category.color || colors.surfaceElevated }]}>
            <Text style={styles.heroEmoji}>{category.icon}</Text>
          </View>
          <Text style={styles.heroTitle}>{category.name}</Text>
          <Text style={styles.heroSubtitle}>{primaryBudget ? `${percentage}% of the limit was spent` : 'No limit set'}</Text>
        </View>

        <View style={styles.summaryRow}>
          <TouchableOpacity activeOpacity={0.78} style={styles.summaryCard} onPress={openLimit}>
            <View>
              <Text style={styles.summaryLabel}>Limit</Text>
              <Text style={styles.summaryValue}>{primaryBudget ? formatCurrency(progress?.effectiveAmount ?? primaryBudget.amount, primaryBudget.currency) : 'Not set'}</Text>
            </View>
            <ChevronIcon />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.78} style={styles.summaryCard} onPress={openCategoryTransactions}>
            <View>
              <Text style={styles.summaryLabel}>Spent</Text>
              <Text style={styles.summaryValue}>{formatCurrency(spent, currency)}</Text>
            </View>
            <ChevronIcon />
          </TouchableOpacity>
        </View>

        <View style={styles.historyPanel}>
          <Text style={styles.sectionTitle}>HISTORY OF ENTRIES</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity onPress={() => setTab('all')} style={[styles.tabChip, tab === 'all' && styles.tabChipActive]}>
              <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>All entries</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('repetitive')} style={[styles.tabChip, tab === 'repetitive' && styles.tabChipActive]}>
              <Text style={[styles.tabText, tab === 'repetitive' && styles.tabTextActive]}>Repetitive</Text>
            </TouchableOpacity>
          </View>

          {categoryTransactions.length === 0 ? (
            <Text style={styles.emptyText}>No entries in this category yet.</Text>
          ) : categoryTransactions.slice(0, 12).map((transaction) => (
            <TouchableOpacity key={transaction.id} style={styles.entryRow} activeOpacity={0.75} onPress={() => openTransaction(transaction.id)}>
              <View style={[styles.entryIcon, { backgroundColor: category.color || colors.neutral[700] }]}>
                <Text style={styles.entryEmoji}>{category.icon}</Text>
              </View>
              <View style={styles.entryText}>
                <View style={styles.entryNameRow}>
                  <Text style={styles.entryTitle} numberOfLines={1}>{transaction.description || category.name}</Text>
                  {transaction.isRecurring && <Text style={styles.newPill}>NEW</Text>}
                </View>
                <Text style={styles.entrySubtitle} numberOfLines={1}>{transaction.isRecurring ? 'Subscription' : category.name}</Text>
              </View>
              <View style={styles.entryAmountBlock}>
                <Text style={[styles.entryAmount, transaction.type === 'income' && styles.entryIncome]}>
                  {transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount, transaction.currency)}
                </Text>
                <Text style={styles.entryTime}>{format(new Date(transaction.date), 'HH:mm')}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  headerTitle: { ...typography.heading4, color: colors.text, maxWidth: 210 },
  heroBlock: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  heroIcon: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 48 },
  heroTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.sm },
  heroSubtitle: { ...typography.body, color: colors.textTertiary },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: borderRadius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  summaryValue: { ...typography.bodyLargeSemiBold, color: colors.text },
  historyPanel: {
    borderRadius: borderRadius['3xl'],
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.base,
    gap: spacing.md,
  },
  sectionTitle: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1 },
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tabChip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: 'rgba(255,255,255,0.07)' },
  tabChipActive: { backgroundColor: colors.white[100] },
  tabText: { ...typography.smallSemiBold, color: colors.textTertiary },
  tabTextActive: { color: colors.background },
  emptyText: { ...typography.body, color: colors.textTertiary, paddingVertical: spacing.lg },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  entryIcon: { width: 44, height: 44, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  entryEmoji: { fontSize: 20 },
  entryText: { flex: 1, minWidth: 0 },
  entryNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entryTitle: { ...typography.bodySemiBold, color: colors.text, flexShrink: 1 },
  newPill: { ...typography.captionSemiBold, color: colors.success[700] },
  entrySubtitle: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  entryAmountBlock: { alignItems: 'flex-end' },
  entryAmount: { ...typography.bodySemiBold, color: colors.error[400] },
  entryIncome: { color: colors.success[700] },
  entryTime: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  missingContainer: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  missingTitle: { ...typography.heading4, color: colors.text },
});
