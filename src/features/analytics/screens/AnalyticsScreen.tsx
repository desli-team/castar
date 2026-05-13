import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { useShallow } from 'zustand/react/shallow';

import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { useAuthStore } from '../../auth/store/authStore';
import { getBudgetProgress } from '../../budget/utils/budgetProgress';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import { useRecurringStore } from '../../recurring/store/recurringStore';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import { buildAnalyticsProReport } from '../../../shared/services/analytics/analyticsPro';
import type { Account, Debt } from '../../../shared/types';

type Period = '1D' | '7D' | '14D' | '30D';

type ShortcutKey = 'statistics' | 'income' | 'debts' | 'budget' | 'categories';

const PERIODS: Period[] = ['1D', '7D', '14D', '30D'];

const CalendarIcon = ({ color = colors.white[100] }: { color?: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4.5} width={18} height={16} rx={4} fill={color} opacity={0.95} />
    <Path d="M7 3V7M17 3V7M6 10H18" stroke={colors.background} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const DebtIcon = ({ color = colors.white[100] }: { color?: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M5 7.5C5 5.6 6.6 4 8.5 4H15.5C17.4 4 19 5.6 19 7.5V16.5C19 18.4 17.4 20 15.5 20H8.5C6.6 20 5 18.4 5 16.5V7.5Z" fill={color} />
    <Path d="M8.5 9H15.5M8.5 12H13.5M8.5 15H11.5" stroke={colors.background} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

const BudgetIcon = ({ color = colors.white[100] }: { color?: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} fill={color} />
    <Path d="M12 7V12L16 15" stroke={colors.background} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CategoryIcon = ({ color = colors.white[100] }: { color?: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Rect x={4} y={4} width={7} height={7} rx={2.5} fill={color} />
    <Rect x={13} y={4} width={7} height={7} rx={2.5} fill={color} opacity={0.55} />
    <Rect x={4} y={13} width={7} height={7} rx={2.5} fill={color} opacity={0.55} />
    <Rect x={13} y={13} width={7} height={7} rx={2.5} fill={color} />
  </Svg>
);

const ChevronIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5L15 12L9 19" stroke={colors.white[40]} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const TinyChart = ({ percentage }: { percentage: number }) => {
  const filled = Math.round((Math.min(100, Math.max(0, percentage)) / 100) * 20);
  return (
    <View style={styles.tinyChartRow}>
      {Array.from({ length: 20 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.tinyBar,
            index < filled && styles.tinyBarActive,
            { height: 10 + ((index % 5) * 3) },
          ]}
        />
      ))}
    </View>
  );
};

const ShortcutIcon = ({ type }: { type: ShortcutKey }) => {
  if (type === 'income') return <BudgetIcon color={colors.success[700]} />;
  if (type === 'debts') return <DebtIcon />;
  if (type === 'budget') return <BudgetIcon />;
  if (type === 'categories') return <CategoryIcon />;
  return <CalendarIcon />;
};

export const AnalyticsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('7D');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);

  const userId = useAuthStore((s) => s.userId);
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const budgets = useBudgetStore(useShallow((s) => s.budgets.filter((budget) => budget.isActive)));
  const recurrings = useRecurringStore(useShallow((s) => s.recurrings));

  useEffect(() => {
    if (!userId) return;
    setAccounts(accountQueries.findByUser(userId));
    setDebts(debtQueries.findByUser(userId));
  }, [userId]);

  const now = Date.now();
  const today = startOfDay(new Date(now));
  const calendarDays = useMemo(() => Array.from({ length: 7 }).map((_, index) => addDays(today, index - 3)), [today]);

  const analyticsReport = useMemo(() => buildAnalyticsProReport({
    period,
    transactions,
    categories,
    budgets,
    accounts,
    debts,
    recurrings,
    nowMs: now,
  }), [accounts, budgets, categories, debts, now, period, recurrings, transactions]);

  const primaryBudget = budgets[0];
  const budgetProgress = primaryBudget ? getBudgetProgress(primaryBudget, transactions) : undefined;
  const budgetAmount = budgetProgress?.effectiveAmount ?? 0;
  const budgetRemaining = budgetProgress ? Math.max(0, budgetProgress.effectiveAmount - budgetProgress.spent) : 0;
  const budgetPercentage = budgetProgress?.percentage ?? 0;

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.date - a.date).slice(0, 3),
    [transactions],
  );

  const streak = calendarDays.map((day) => transactions.some((transaction) => isSameDay(new Date(transaction.date), day)));
  const completedTaskCount = transactions.length + budgets.length;

  const openShortcut = (key: ShortcutKey) => {
    if (key === 'income') {
      navigation.dispatch(CommonActions.navigate({ name: 'MonitoringTab', params: { screen: 'IncomeAnalytics' } }));
      return;
    }
    if (key === 'debts') {
      navigation.dispatch(CommonActions.navigate({ name: 'TasksTab', params: { screen: 'Debts' } }));
      return;
    }
    if (key === 'budget') {
      navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'Budgets' } }));
      return;
    }
    if (key === 'categories') {
      navigation.dispatch(CommonActions.navigate({ name: 'ProfileTab', params: { screen: 'Categories' } }));
    }
  };

  const openTransactions = () => {
    navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'Transactions' } }));
  };

  return (
    <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 112 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.dateTitle}>{format(today, 'd MMMM')}</Text>

        <View style={styles.calendarRow}>
          {calendarDays.map((day) => {
            const active = isSameDay(day, today);
            return (
              <View key={day.toISOString()} style={[styles.dayCard, active && styles.dayCardActive]}>
                <Text style={[styles.dayNumber, active && styles.dayNumberActive]}>{format(day, 'd')}</Text>
                <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>{format(day, 'EEE')}</Text>
                {active && <View style={styles.activeDot} />}
              </View>
            );
          })}
        </View>

        <View style={styles.shortcutRow}>
          {([
            ['statistics', 'Statistics'],
            ['income', 'Income'],
            ['debts', 'Debts'],
            ['budget', 'Budget'],
            ['categories', 'Categories'],
          ] as Array<[ShortcutKey, string]>).map(([key, label]) => (
            <TouchableOpacity key={key} style={styles.shortcut} activeOpacity={0.75} onPress={() => openShortcut(key)}>
              <View style={styles.shortcutCircle}>
                <ShortcutIcon type={key} />
              </View>
              <Text style={styles.shortcutLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => primaryBudget && navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'BudgetDetail', params: { budgetId: primaryBudget.id } } }))} style={styles.reminderCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>REMINDER</Text>
            <ChevronIcon />
          </View>
          <Text style={styles.budgetTotal}>{primaryBudget ? formatCurrency(budgetAmount, primaryBudget.currency) : 'No budget'}</Text>
          <Text style={styles.budgetRemaining}>{primaryBudget ? formatCurrency(budgetRemaining, primaryBudget.currency) : 'Create a budget'}</Text>
          <TinyChart percentage={budgetPercentage} />
          <Text style={styles.reminderCaption}>{primaryBudget ? `${Math.round(budgetPercentage)}% of the budget was spent` : 'Set a monthly limit to track your progress'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'MonitoringTab', params: { screen: 'IncomeAnalytics' } }))}
          style={styles.incomeCard}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>INCOME ANALYTICS</Text>
            <ChevronIcon />
          </View>
          <Text style={styles.incomeCardValue}>{formatCurrency(analyticsReport.cashflow.income, primaryBudget?.currency ?? 'UZS')}</Text>
          <Text style={styles.incomeCardCaption}>View sources, currencies, and monthly income trend</Text>
        </TouchableOpacity>

        <View style={styles.dataCard}>
          <Text style={styles.cardEyebrow}>DATA FOR THE PERIOD</Text>
          <View style={styles.periodRow}>
            {PERIODS.map((item) => (
              <TouchableOpacity key={item} onPress={() => setPeriod(item)} style={[styles.periodChip, period === item && styles.periodChipActive]}>
                <Text style={[styles.periodText, period === item && styles.periodTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Spent</Text>
              <Text style={styles.spentValue}>{formatCurrency(analyticsReport.cashflow.expense, primaryBudget?.currency ?? 'UZS')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={styles.incomeValue}>{formatCurrency(analyticsReport.cashflow.income, primaryBudget?.currency ?? 'UZS')}</Text>
            </View>
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Net cashflow</Text>
              <Text style={[styles.incomeValue, analyticsReport.cashflow.net < 0 && styles.spentValue]}>{formatCurrency(analyticsReport.cashflow.net, primaryBudget?.currency ?? 'UZS')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Savings rate</Text>
              <Text style={styles.statValue}>{analyticsReport.cashflow.savingsRatePercent === null ? '—' : `${analyticsReport.cashflow.savingsRatePercent}%`}</Text>
            </View>
          </View>
          <View style={styles.cashflowTrendRow}>
            {analyticsReport.cashflow.monthlyBuckets.map((bucket) => {
              const maxAbs = Math.max(...analyticsReport.cashflow.monthlyBuckets.map((item) => Math.abs(item.net)), 1);
              const height = 12 + (Math.abs(bucket.net) / maxAbs) * 44;
              return (
                <View key={bucket.month} style={styles.cashflowBarBlock}>
                  <View style={[styles.cashflowBar, { height, backgroundColor: bucket.net >= 0 ? colors.success[700] : colors.error[500] }]} />
                  <Text style={styles.cashflowMonth}>{bucket.month.slice(5)}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.comparisonCaption}>Expense delta {analyticsReport.cashflow.expenseDeltaPercent === null ? 'new spend' : `${analyticsReport.cashflow.expenseDeltaPercent >= 0 ? '+' : ''}${analyticsReport.cashflow.expenseDeltaPercent}%`} · net delta {analyticsReport.cashflow.netDeltaPercent === null ? 'new flow' : `${analyticsReport.cashflow.netDeltaPercent >= 0 ? '+' : ''}${analyticsReport.cashflow.netDeltaPercent}%`}</Text>
        </View>

        <View style={styles.listCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>SMART INSIGHTS</Text>
            <ChevronIcon />
          </View>
          {analyticsReport.insights.map((insight) => (
            <TouchableOpacity key={insight.id} style={styles.insightRow} activeOpacity={0.75} onPress={() => {
              if (insight.target === 'transactions') openTransactions();
              if (insight.target === 'review') navigation.dispatch(CommonActions.navigate({ name: 'TransactionReview' }));
              if (insight.target === 'budgets') navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'Budgets' } }));
              if (insight.target === 'recurrings') navigation.dispatch(CommonActions.navigate({ name: 'TasksTab', params: { screen: 'Recurrings' } }));
              if (insight.target === 'debts') navigation.dispatch(CommonActions.navigate({ name: 'TasksTab', params: { screen: 'Debts' } }));
              if (insight.target === 'categories') navigation.dispatch(CommonActions.navigate({ name: 'ProfileTab', params: { screen: 'Categories' } }));
            }}>
              <View style={[styles.insightDot, insight.severity === 'critical' && styles.insightCritical, insight.severity === 'warning' && styles.insightWarning, insight.severity === 'success' && styles.insightSuccess]} />
              <View style={styles.insightTextBlock}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.twoColumnRow}>
          <View style={[styles.miniCard, styles.streakCard]}>
            <Text style={styles.cardEyebrow}>STREAK</Text>
            <View style={styles.streakGrid}>
              {Array.from({ length: 28 }).map((_, index) => (
                <View
                  key={index}
                  style={[styles.streakCell, (index < 21 ? streak[index % streak.length] : index % 6 === 0) && styles.streakCellActive]}
                />
              ))}
            </View>
          </View>

          <View style={styles.miniCard}>
            <Text style={styles.cardEyebrow}>TASKS</Text>
            <Text style={styles.tasksNumber}>{completedTaskCount}</Text>
            <Text style={styles.tasksDone}>Done</Text>
            <View style={styles.taskMetricRow}>
              <View style={[styles.taskMetricDot, { backgroundColor: colors.warning[500] }]} />
              <Text style={styles.taskMetricText}>Archive {transactions.length}</Text>
            </View>
            <View style={styles.taskMetricRow}>
              <View style={[styles.taskMetricDot, { backgroundColor: colors.textTertiary }]} />
              <Text style={styles.taskMetricText}>In progress {budgets.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.listCard}>
          <TouchableOpacity activeOpacity={0.8} onPress={openTransactions} style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>LATEST TRANSACTIONS</Text>
            <ChevronIcon />
          </TouchableOpacity>
          {recentTransactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          ) : recentTransactions.map((transaction) => {
            const category = categories.find((item) => item.id === transaction.categoryId);
            const amountText = `${transaction.type === 'expense' ? '-' : '+'}${formatCurrency(transaction.amount, transaction.currency)}`;
            return (
              <TouchableOpacity
                key={transaction.id}
                style={styles.transactionRow}
                activeOpacity={0.75}
                onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'TransactionDetail', params: { transactionId: transaction.id } } }))}
              >
                <View style={[styles.transactionIcon, { backgroundColor: category?.color || colors.neutral[700] }]}>
                  <Text style={styles.transactionEmoji}>{category?.icon ?? '•'}</Text>
                </View>
                <View style={styles.transactionText}>
                  <Text style={styles.transactionName} numberOfLines={1}>{transaction.description || category?.name || 'Transaction'}</Text>
                  <Text style={styles.transactionMeta} numberOfLines={1}>{category?.name || 'Other'}</Text>
                </View>
                <View style={styles.transactionAmountBlock}>
                  <Text style={[styles.transactionAmount, transaction.type === 'income' && styles.transactionAmountIncome]}>{amountText}</Text>
                  <Text style={styles.transactionTime}>{format(new Date(transaction.date), 'HH:mm')}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.listCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardEyebrow}>SPENDING BREAKDOWN</Text>
            <ChevronIcon />
          </View>
          {analyticsReport.categoryBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No spending categories yet.</Text>
          ) : analyticsReport.categoryBreakdown.slice(0, 5).map((item) => (
            <TouchableOpacity key={item.categoryId} style={styles.breakdownRow} activeOpacity={0.75} onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'SpendingCategoryDetail', params: { categoryId: item.categoryId, period } }))}>
              <View style={[styles.topCategoryIcon, { backgroundColor: item.color || colors.neutral[700] }]}>
                <Text style={styles.transactionEmoji}>{item.icon ?? '•'}</Text>
              </View>
              <View style={styles.breakdownTextBlock}>
                <Text style={styles.topCategoryName}>{item.categoryName}</Text>
                <Text style={styles.topCategoryAmount}>{item.sharePercent}% of spend · {item.transactionCount} transaction{item.transactionCount === 1 ? '' : 's'}{item.deltaPercent !== null ? ` · ${item.deltaPercent >= 0 ? '+' : ''}${item.deltaPercent}% vs prev` : ' · new vs prev'}</Text>
              </View>
              <Text style={styles.breakdownAmount}>{formatCurrency(item.amount, primaryBudget?.currency ?? 'UZS')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.listCard}>
          <Text style={styles.cardEyebrow}>BUDGET FORECAST</Text>
          {analyticsReport.budgetForecasts.length === 0 ? (
            <Text style={styles.emptyText}>No active budgets yet.</Text>
          ) : analyticsReport.budgetForecasts.slice(0, 3).map((item) => (
            <TouchableOpacity key={item.budgetId} style={styles.forecastRow} activeOpacity={0.75} onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'BudgetDetail', params: { budgetId: item.budgetId } } }))}>
              <View style={styles.breakdownTextBlock}>
                <Text style={styles.insightTitle}>{item.name}</Text>
                <Text style={styles.insightBody}>Safe/day {formatCurrency(item.dailySafeToSpend, item.currency)} · projected {formatCurrency(item.projectedSpend, item.currency)} · burn {item.burnRatePercent}%</Text>
              </View>
              <Text style={[styles.statusPill, item.risk === 'over' && styles.statusOver, item.risk === 'watch' && styles.statusWatch]}>{item.risk}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.listCard}>
          <Text style={styles.cardEyebrow}>RECURRING INTELLIGENCE</Text>
          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Upcoming</Text>
              <Text style={styles.statValue}>{analyticsReport.recurring.upcoming.length}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Likely recurring</Text>
              <Text style={styles.statValue}>{analyticsReport.recurring.likely.length}</Text>
            </View>
          </View>
          {analyticsReport.recurring.likely.slice(0, 3).map((item) => (
            <TouchableOpacity key={item.key} style={styles.netRow} activeOpacity={0.75} onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'TasksTab', params: { screen: 'Recurrings' } }))}>
              <View style={styles.breakdownTextBlock}>
                <Text style={styles.insightBody} numberOfLines={1}>{item.title}{item.amountChanged ? ` · ${item.amountChangePercent > 0 ? '+' : ''}${item.amountChangePercent}%` : ''}</Text>
                <Text style={styles.topCategoryAmount}>confidence {Math.round(item.confidence * 100)}% · consistency {Math.round(item.cadenceConsistency * 100)}% · volatility {item.amountVolatilityPercent}%</Text>
              </View>
              <Text style={styles.insightTitle}>{Math.round(item.cadenceDays)}d</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.listCard}>
          <Text style={styles.cardEyebrow}>NET WORTH SNAPSHOT</Text>
          {analyticsReport.netWorth.byCurrency.length === 0 ? (
            <Text style={styles.emptyText}>No account balances yet.</Text>
          ) : analyticsReport.netWorth.byCurrency.slice(0, 3).map((item) => (
            <View key={item.currency} style={styles.netSnapshotRow}>
              <View style={styles.breakdownTextBlock}>
                <Text style={styles.insightTitle}>{item.currency} net</Text>
                <Text style={styles.insightBody}>Assets {formatCurrency(item.assets, item.currency)} · debts {formatCurrency(item.iOwe, item.currency)} · receivable {formatCurrency(item.owedToMe, item.currency)}</Text>
              </View>
              <Text style={[styles.breakdownAmount, item.net < 0 && styles.spentValue]}>{formatCurrency(item.net, item.currency)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.md },
  dateTitle: {
    ...typography.heading4,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  calendarRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  dayCard: {
    flex: 1,
    minHeight: 62,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayCardActive: { backgroundColor: colors.white[100], borderColor: colors.white[100] },
  dayNumber: { ...typography.bodySemiBold, color: colors.text },
  dayNumberActive: { color: colors.background },
  dayLabel: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  dayLabelActive: { color: colors.neutral[700] },
  activeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.error[500], marginTop: spacing.xs },
  shortcutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  shortcut: { flex: 1, alignItems: 'center', gap: spacing.sm },
  shortcutCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  shortcutLabel: { ...typography.captionMedium, color: colors.textSecondary },
  reminderCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardEyebrow: {
    ...typography.captionSemiBold,
    color: colors.textTertiary,
    letterSpacing: 1.1,
  },
  budgetTotal: { ...typography.bodyMedium, color: colors.textTertiary, marginTop: spacing.xs },
  budgetRemaining: { ...typography.heading2, color: colors.text, marginTop: -spacing.xs },
  tinyChartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28, marginTop: spacing.sm },
  tinyBar: { flex: 1, borderRadius: 99, backgroundColor: colors.neutral[700] },
  tinyBarActive: { backgroundColor: colors.success[700] },
  reminderCaption: { ...typography.small, color: colors.textTertiary },
  incomeCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  incomeCardValue: { ...typography.heading3, color: colors.success[700] },
  incomeCardCaption: { ...typography.small, color: colors.textTertiary },
  dataCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  periodChip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  periodChipActive: { backgroundColor: colors.neutral[700] },
  periodText: { ...typography.captionSemiBold, color: colors.textTertiary },
  periodTextActive: { color: colors.text },
  statGrid: { flexDirection: 'row', gap: spacing.md },
  statBox: { flex: 1, borderRadius: borderRadius.xl, backgroundColor: colors.surface, padding: spacing.md },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  spentValue: { ...typography.heading5, color: colors.error[500] },
  incomeValue: { ...typography.heading5, color: colors.success[700] },
  statValue: { ...typography.heading5, color: colors.text },
  cashflowTrendRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 76, gap: spacing.sm },
  cashflowBarBlock: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  cashflowBar: { width: '70%', borderRadius: borderRadius.full },
  cashflowMonth: { ...typography.caption, color: colors.textTertiary },
  comparisonCaption: { ...typography.caption, color: colors.textTertiary },
  twoColumnRow: { flexDirection: 'row', gap: spacing.md },
  miniCard: {
    flex: 1,
    minHeight: 154,
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  streakCard: { gap: spacing.md },
  streakGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  streakCell: { width: 12, height: 12, borderRadius: 4, backgroundColor: colors.neutral[700] },
  streakCellActive: { backgroundColor: colors.success[700] },
  tasksNumber: { ...typography.heading2, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  tasksDone: { ...typography.small, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.md },
  taskMetricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  taskMetricDot: { width: 6, height: 14, borderRadius: 99 },
  taskMetricText: { ...typography.caption, color: colors.textSecondary },
  listCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  emptyText: { ...typography.body, color: colors.textTertiary, paddingVertical: spacing.md },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  transactionIcon: { width: 42, height: 42, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  transactionEmoji: { fontSize: 20 },
  transactionText: { flex: 1, minWidth: 0 },
  transactionName: { ...typography.bodySemiBold, color: colors.text },
  transactionMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  transactionAmountBlock: { alignItems: 'flex-end' },
  transactionAmount: { ...typography.bodySemiBold, color: colors.error[400] },
  transactionAmountIncome: { color: colors.success[700] },
  transactionTime: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  topCategoryRow: { flexDirection: 'row', gap: spacing.md },
  insightRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.sm },
  insightDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: colors.information[500] },
  insightCritical: { backgroundColor: colors.error[500] },
  insightWarning: { backgroundColor: colors.warning[500] },
  insightSuccess: { backgroundColor: colors.success[700] },
  insightTextBlock: { flex: 1, gap: spacing.xs },
  insightTitle: { ...typography.bodySemiBold, color: colors.text },
  insightBody: { ...typography.caption, color: colors.textTertiary },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  breakdownTextBlock: { flex: 1, minWidth: 0 },
  breakdownAmount: { ...typography.bodySemiBold, color: colors.text },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  statusPill: { ...typography.captionSemiBold, color: colors.success[700], backgroundColor: colors.success[100], overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  statusOver: { color: colors.error[700], backgroundColor: colors.error[100] },
  statusWatch: { color: colors.warning[700], backgroundColor: colors.warning[100] },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  netSnapshotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  topCategoryTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  topCategoryIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  topCategoryName: { ...typography.smallSemiBold, color: colors.text },
  topCategoryAmount: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  otherLabel: { ...typography.caption, color: colors.textTertiary },
  multiBar: { flexDirection: 'row', height: 8, borderRadius: 99, overflow: 'hidden', backgroundColor: colors.neutral[700] },
  multiBarSegment: { height: '100%' },
});
