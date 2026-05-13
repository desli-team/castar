import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { useProfileStore } from '../../profile/store/profileStore';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { useRecurringStore } from '../../recurring/store/recurringStore';
import * as debtQueries from '../../../shared/services/database/debtQueries';
import { buildInboxItems, summarizeInbox, type InboxItem, type InboxSection } from '../utils/inboxEngine';
import type { Debt, TasksStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;

const ChevronRightIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5L15 12L9 19" stroke={colors.textSecondary} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const InboxIcon = ({ color = colors.text }: { color?: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M4 7.5C4 5.57 5.57 4 7.5 4H16.5C18.43 4 20 5.57 20 7.5V16.5C20 18.43 18.43 20 16.5 20H7.5C5.57 20 4 18.43 4 16.5V7.5Z" stroke={color} strokeWidth={1.7} />
    <Path d="M4.5 13H8.3C8.8 13 9.26 13.28 9.5 13.72L10.05 14.78C10.29 15.22 10.75 15.5 11.25 15.5H12.75C13.25 15.5 13.71 15.22 13.95 14.78L14.5 13.72C14.74 13.28 15.2 13 15.7 13H19.5" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

const AutomationIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8} stroke={colors.text} strokeWidth={1.7} />
    <Path d="M12 7V12L15.5 14" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const severityColor = (severity: InboxItem['severity']) => {
  if (severity === 'critical') return colors.error[400];
  if (severity === 'warning') return colors.warning[500];
  return colors.success[500];
};

export const TasksScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const currency = useProfileStore((s) => s.currency);
  const transactions = useTransactionStore(useShallow((s) => s.transactions));
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const budgets = useBudgetStore(useShallow((s) => s.budgets));
  const recurrings = useRecurringStore(useShallow((s) => s.recurrings));
  const [debts, setDebts] = useState<Debt[]>([]);

  useFocusEffect(useCallback(() => {
    try {
      setDebts(debtQueries.findAll());
    } catch {
      setDebts([]);
    }
  }, []));

  const items = useMemo(() => buildInboxItems({
    transactions,
    categories,
    budgets,
    recurrings,
    debts,
    currency,
  }), [budgets, categories, currency, debts, recurrings, transactions]);

  const summary = useMemo(() => summarizeInbox(items), [items]);
  const sections = useMemo(() => {
    const names: InboxSection[] = ['Needs review', 'Budget', 'Automation'];
    return names
      .map((title) => ({ title, data: items.filter((item) => item.section === title) }))
      .filter((section) => section.data.length > 0);
  }, [items]);

  const openItem = (item: InboxItem) => {
    if (item.entityType === 'transaction' && item.entityId) {
      navigation.dispatch(CommonActions.navigate({
        name: 'HomeTab',
        params: { screen: 'TransactionDetail', params: { transactionId: item.entityId } },
      }));
      return;
    }
    if (item.entityType === 'budget' && item.entityId) {
      navigation.dispatch(CommonActions.navigate({
        name: 'HomeTab',
        params: { screen: 'BudgetDetail', params: { budgetId: item.entityId } },
      }));
      return;
    }
    if (item.entityType === 'recurring') {
      navigation.navigate('Recurrings');
      return;
    }
    if (item.entityType === 'debt' && item.entityId) {
      navigation.navigate('DebtDetail', { debtId: item.entityId });
    }
  };

  const renderItem = ({ item }: { item: InboxItem }) => (
    <TouchableOpacity style={styles.inboxCard} activeOpacity={0.76} onPress={() => openItem(item)}>
      <View style={[styles.severityRail, { backgroundColor: severityColor(item.severity) }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.severityPill, { color: severityColor(item.severity), borderColor: severityColor(item.severity) }]}>{item.severity}</Text>
        </View>
        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
        <Text style={styles.actionText}>{item.actionLabel}</Text>
      </View>
      <ChevronRightIcon />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}><InboxIcon /></View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>Review only unresolved finance decisions</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>OPEN ITEMS</Text>
            <Text style={styles.summaryValue}>{summary.total}</Text>
          </View>
          <View style={styles.summaryStats}>
            <View style={styles.statPill}><Text style={styles.statNumber}>{summary.critical}</Text><Text style={styles.statLabel}>critical</Text></View>
            <View style={styles.statPill}><Text style={styles.statNumber}>{summary.warning}</Text><Text style={styles.statLabel}>warning</Text></View>
          </View>
        </View>

        {sections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Inbox is clean</Text>
            <Text style={styles.emptyText}>Confirmed transactions stay out of Inbox. New items appear only when Castar detects something unresolved.</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
          />
        )}

        <View style={styles.automationPanel}>
          <Text style={styles.sectionTitle}>AUTOMATION</Text>
          <TouchableOpacity style={styles.automationRow} activeOpacity={0.76} onPress={() => navigation.navigate('Recurrings')}>
            <AutomationIcon />
            <View style={styles.automationTexts}>
              <Text style={styles.automationTitle}>Recurring transactions</Text>
              <Text style={styles.automationDescription}>Subscriptions, rent, salary, bills and repeat payments.</Text>
            </View>
            <ChevronRightIcon />
          </TouchableOpacity>
          <TouchableOpacity style={styles.automationRow} activeOpacity={0.76} onPress={() => navigation.navigate('Debts')}>
            <InboxIcon color={colors.text} />
            <View style={styles.automationTexts}>
              <Text style={styles.automationTitle}>Debts & lending</Text>
              <Text style={styles.automationDescription}>IOUs, partial repayments, settlements and linked transactions.</Text>
            </View>
            <ChevronRightIcon />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, paddingHorizontal: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, marginBottom: spacing.xl },
  headerIcon: { width: 48, height: 48, borderRadius: borderRadius.xl, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { ...typography.heading3, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  summaryCard: { borderRadius: borderRadius['3xl'], backgroundColor: 'rgba(255,255,255,0.075)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  summaryLabel: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1 },
  summaryValue: { ...typography.heading1, color: colors.text, marginTop: spacing.xs },
  summaryStats: { flexDirection: 'row', gap: spacing.sm },
  statPill: { minWidth: 74, borderRadius: borderRadius.xl, backgroundColor: 'rgba(0,0,0,0.22)', padding: spacing.sm, alignItems: 'center' },
  statNumber: { ...typography.bodyLargeSemiBold, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  listContent: { paddingBottom: spacing.xl, gap: spacing.md },
  sectionTitle: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1, marginBottom: spacing.sm },
  inboxCard: { flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius['2xl'], backgroundColor: 'rgba(255,255,255,0.075)', borderWidth: 1, borderColor: colors.borderLight, padding: spacing.base, gap: spacing.base, overflow: 'hidden' },
  severityRail: { width: 4, alignSelf: 'stretch', borderRadius: borderRadius.full },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.bodyLargeSemiBold, color: colors.text, flex: 1 },
  severityPill: { ...typography.captionSemiBold, textTransform: 'uppercase', borderWidth: 1, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, overflow: 'hidden' },
  cardDescription: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  actionText: { ...typography.captionSemiBold, color: colors.text, marginTop: spacing.xs },
  emptyCard: { borderRadius: borderRadius['3xl'], backgroundColor: 'rgba(255,255,255,0.075)', borderWidth: 1, borderColor: colors.borderLight, padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.heading5, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  automationPanel: { gap: spacing.md, paddingBottom: spacing['5xl'] },
  automationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight },
  automationTexts: { flex: 1, gap: spacing.xs },
  automationTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  automationDescription: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
});
