import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { format, startOfMonth, subMonths } from 'date-fns';
import Svg, { Path } from 'react-native-svg';

import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../../profile/store/profileStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import type { Currency } from '../../../shared/types';
import {
  buildLocalIncomeAnalytics,
  fetchIncomeAnalyticsFromBackend,
  loadCachedIncomeAnalytics,
  saveIncomeAnalyticsCache,
  type IncomeAnalyticsView,
} from '../../../shared/services/analytics/incomeAnalytics';

type Period = 'month' | '3m' | 'all';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'month', label: 'This month' },
  { key: '3m', label: '3 months' },
  { key: 'all', label: 'All time' },
];

const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5L9 12L15 19" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const PlusIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5V19M5 12H19" stroke={colors.background} strokeWidth={1.9} strokeLinecap="round" />
  </Svg>
);

const periodStartFor = (period: Period): number => {
  if (period === 'all') return 0;
  const now = new Date();
  if (period === '3m') return startOfMonth(subMonths(now, 2)).getTime();
  return startOfMonth(now).getTime();
};

const sourceLabel = (source: IncomeAnalyticsView['source']): string => {
  if (source === 'server') return 'Synced from backend';
  if (source === 'cache') return 'Cached backend data';
  return 'Offline local fallback';
};

export const IncomeAnalyticsScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId);
  const defaultCurrency = useProfileStore((s) => s.currency) as Currency;
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const [period, setPeriod] = useState<Period>('month');
  const [analytics, setAnalytics] = useState<IncomeAnalyticsView | null>(null);
  const [loading, setLoading] = useState(false);

  const dateFrom = useMemo(() => periodStartFor(period), [period]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const cached = await loadCachedIncomeAnalytics(userId, period, defaultCurrency);
      if (!cancelled && cached) setAnalytics(cached);

      try {
        const serverData = await fetchIncomeAnalyticsFromBackend({
          dateFrom,
          dateTo: Date.now(),
          baseCurrency: defaultCurrency,
        });
        if (cancelled) return;
        setAnalytics(serverData);
        saveIncomeAnalyticsCache(userId, period, defaultCurrency, serverData);
      } catch {
        if (cached || cancelled) return;
        const localData = await buildLocalIncomeAnalytics({
          transactions,
          categories,
          dateFrom,
          baseCurrency: defaultCurrency,
        });
        if (!cancelled) setAnalytics(localData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [categories, dateFrom, defaultCurrency, period, transactions, userId]);

  const maxTrend = Math.max(...(analytics?.monthlyTrend.map((item) => item.amount) ?? [0]), 1);

  const openAddIncome = () => {
    navigation.dispatch(CommonActions.navigate({ name: 'HomeTab', params: { screen: 'AddTransaction', params: { type: 'income' } } }));
  };

  return (
    <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.75} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Income Analytics</Text>
            <Text style={styles.subtitle}>Sources, currencies, and trend</Text>
          </View>
          <TouchableOpacity style={styles.addButton} activeOpacity={0.75} onPress={openAddIncome}>
            <PlusIcon />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.periodRow}>
            {PERIODS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.periodChip, period === item.key && styles.periodChipActive]}
                activeOpacity={0.75}
                onPress={() => setPeriod(item.key)}
              >
                <Text style={[styles.periodText, period === item.key && styles.periodTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sourceStatusRow}>
            <Text style={styles.sourceStatusText}>{analytics ? sourceLabel(analytics.source) : 'Loading analytics'}</Text>
            {loading && <ActivityIndicator color={colors.textTertiary} size="small" />}
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.cardEyebrow}>TOTAL INCOME</Text>
            <Text style={styles.heroAmount}>{formatCurrency(analytics?.totalIncome ?? 0, defaultCurrency)}</Text>
            <Text style={styles.heroCaption}>
              {analytics?.transactionCount ?? 0} income transaction{analytics?.transactionCount === 1 ? '' : 's'} · avg {formatCurrency(analytics?.averageIncome ?? 0, defaultCurrency)}
            </Text>
            <View style={styles.trendRow}>
              {(analytics?.monthlyTrend ?? []).map((item) => (
                <View key={item.label} style={styles.trendColumn}>
                  <View style={[styles.trendBar, { height: 16 + (item.amount / maxTrend) * 54 }]} />
                  <Text style={styles.trendLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardEyebrow}>INCOME SOURCES</Text>
              <Text style={styles.sectionMeta}>{analytics?.sources.length ?? 0} active</Text>
            </View>
            {!analytics || analytics.sources.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No income yet</Text>
                <Text style={styles.emptyText}>Add salary, freelance, investments, or other income to see source analytics.</Text>
              </View>
            ) : analytics.sources.map((row) => {
              const originalText = Object.entries(row.originalByCurrency)
                .map(([currency, amount]) => formatCurrency(amount, currency))
                .join(' · ');

              return (
                <View key={row.categoryId} style={styles.sourceRow}>
                  <View style={[styles.sourceIcon, { backgroundColor: row.color || colors.success[700] }]}>
                    <Text style={styles.sourceIconText}>{row.icon}</Text>
                  </View>
                  <View style={styles.sourceText}>
                    <Text style={styles.sourceTitle} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.sourceSubtitle} numberOfLines={1}>{originalText}</Text>
                    <View style={styles.sourceBarTrack}>
                      <View style={[styles.sourceBarFill, { width: `${Math.min(100, row.percentage)}%`, backgroundColor: row.color || colors.success[700] }]} />
                    </View>
                  </View>
                  <View style={styles.sourceAmountBlock}>
                    <Text style={styles.sourceAmount}>{formatCurrency(row.convertedTotal, defaultCurrency)}</Text>
                    <Text style={styles.sourcePercent}>{Math.round(row.percentage)}%</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardEyebrow}>BY CURRENCY</Text>
              <Text style={styles.sectionMeta}>{defaultCurrency} base</Text>
            </View>
            {!analytics || analytics.currencies.length === 0 ? (
              <Text style={styles.emptyText}>No currency data yet.</Text>
            ) : analytics.currencies.map((row) => (
              <View key={row.currency} style={styles.currencyRow}>
                <View>
                  <Text style={styles.currencyCode}>{row.currency}</Text>
                  <Text style={styles.currencyMeta}>{row.count} transaction{row.count === 1 ? '' : 's'}</Text>
                </View>
                <View style={styles.currencyAmounts}>
                  <Text style={styles.currencyOriginal}>{formatCurrency(row.originalTotal, row.currency)}</Text>
                  {row.currency !== defaultCurrency && (
                    <Text style={styles.currencyConverted}>≈ {formatCurrency(row.convertedTotal, defaultCurrency)}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardEyebrow}>RECENT INCOME</Text>
              <Text style={styles.sectionMeta}>{analytics?.recent.length ?? 0}</Text>
            </View>
            {(analytics?.recent ?? []).map((transaction) => (
              <View key={transaction.id} style={styles.recentRow}>
                <View style={[styles.recentIcon, { backgroundColor: transaction.color || colors.success[700] }]}>
                  <Text style={styles.sourceIconText}>{transaction.icon || '↗'}</Text>
                </View>
                <View style={styles.sourceText}>
                  <Text style={styles.sourceTitle} numberOfLines={1}>{transaction.title}</Text>
                  <Text style={styles.sourceSubtitle}>{transaction.sourceName} · {format(new Date(transaction.date), 'dd MMM yyyy')}</Text>
                </View>
                <Text style={styles.recentAmount}>+{formatCurrency(transaction.amount, transaction.currency)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.white[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 140, gap: spacing.md },
  periodRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.full, padding: spacing.xs, gap: spacing.xs },
  periodChip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  periodChipActive: { backgroundColor: colors.white[100] },
  periodText: { ...typography.captionSemiBold, color: colors.textTertiary },
  periodTextActive: { color: colors.background },
  sourceStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  sourceStatusText: { ...typography.caption, color: colors.textTertiary },
  heroCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  cardEyebrow: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1 },
  heroAmount: { ...typography.heading1, color: colors.success[700] },
  heroCaption: { ...typography.small, color: colors.textTertiary },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 92, marginTop: spacing.sm },
  trendColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  trendBar: { width: '100%', borderRadius: 99, backgroundColor: colors.success[700] },
  trendLabel: { ...typography.caption, color: colors.textTertiary },
  sectionCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionMeta: { ...typography.caption, color: colors.textTertiary },
  emptyCard: { borderRadius: borderRadius.xl, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs },
  emptyTitle: { ...typography.bodySemiBold, color: colors.text },
  emptyText: { ...typography.body, color: colors.textTertiary },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sourceIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sourceIconText: { fontSize: 20 },
  sourceText: { flex: 1, minWidth: 0, gap: 4 },
  sourceTitle: { ...typography.bodySemiBold, color: colors.text, textTransform: 'capitalize' },
  sourceSubtitle: { ...typography.caption, color: colors.textTertiary },
  sourceBarTrack: { height: 5, borderRadius: 99, backgroundColor: colors.neutral[700], overflow: 'hidden', marginTop: 3 },
  sourceBarFill: { height: '100%', borderRadius: 99 },
  sourceAmountBlock: { alignItems: 'flex-end', gap: 3, maxWidth: 120 },
  sourceAmount: { ...typography.smallSemiBold, color: colors.text, textAlign: 'right' },
  sourcePercent: { ...typography.caption, color: colors.textTertiary },
  currencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  currencyCode: { ...typography.bodySemiBold, color: colors.text },
  currencyMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  currencyAmounts: { alignItems: 'flex-end', gap: 4 },
  currencyOriginal: { ...typography.bodySemiBold, color: colors.success[700] },
  currencyConverted: { ...typography.caption, color: colors.textTertiary },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recentIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recentAmount: { ...typography.bodySemiBold, color: colors.success[700] },
});
