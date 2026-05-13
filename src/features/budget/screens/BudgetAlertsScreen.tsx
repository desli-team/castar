import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { useAuthStore } from '../../auth/store/authStore';
import { useBudgetStore } from '../store/budgetStore';
import * as budgetAlertQueries from '../../../shared/services/database/budgetAlertQueries';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import type { HomeStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<HomeStackParamList>;

type AlertItem = budgetAlertQueries.BudgetAlert;

function levelLabel(level: AlertItem['level']) {
  if (level === 'warning') return 'Warning';
  if (level === 'critical') return 'Critical';
  return 'Over limit';
}

function levelDescription(level: AlertItem['level']) {
  if (level === 'warning') return 'Spending is approaching the warning threshold.';
  if (level === 'critical') return 'Spending reached the critical threshold.';
  return 'Spending exceeded the budget limit.';
}

export const BudgetAlertsScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId);
  const budgets = useBudgetStore((s) => s.budgets);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const reload = useCallback(() => {
    if (!userId) return;
    setAlerts(budgetAlertQueries.findByUser(userId, 50));
  }, [userId]);

  useFocusEffect(reload);

  const acknowledge = (id: string) => {
    budgetAlertQueries.acknowledge(id);
    reload();
  };

  const acknowledgeAll = () => {
    alerts.filter((alert) => !alert.acknowledgedAt).forEach((alert) => budgetAlertQueries.acknowledge(alert.id));
    reload();
  };

  const unreadCount = alerts.filter((alert) => !alert.acknowledgedAt).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}> 
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Budget alerts</Text>
          <Text style={styles.subtitle}>{unreadCount > 0 ? `${unreadCount} needs review` : 'No new budget issues'}</Text>
        </View>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(alert) => alert.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptyText}>Castar will record budget warnings, critical limits, and over-limit events here after expenses are saved.</Text>
          </View>
        )}
        renderItem={({ item: alert }) => {
          const budget = budgets.find((item) => item.id === alert.budgetId);
          const isRead = Boolean(alert.acknowledgedAt);
          return (
            <TouchableOpacity
              style={[styles.card, isRead && styles.cardRead]}
              activeOpacity={0.75}
              onPress={() => budget ? navigation.navigate('BudgetDetail', { budgetId: budget.id }) : undefined}
            >
              <View style={styles.cardTopRow}>
                <Text style={[styles.levelPill, alert.level === 'warning' && styles.warning, alert.level === 'critical' && styles.critical, alert.level === 'over' && styles.over]}>{levelLabel(alert.level)}</Text>
                <Text style={styles.dateText}>{new Date(alert.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.cardTitle}>{budget?.name ?? 'Budget'}</Text>
              <Text style={styles.cardText}>{levelDescription(alert.level)}</Text>
              <View style={styles.metricsRow}>
                <View>
                  <Text style={styles.metricLabel}>Spent</Text>
                  <Text style={styles.metricValue}>{formatCurrency(alert.spent, budget?.currency ?? 'UZS')}</Text>
                </View>
                <View style={styles.metricRight}>
                  <Text style={styles.metricLabel}>Limit</Text>
                  <Text style={styles.metricValue}>{formatCurrency(alert.limitAmount, budget?.currency ?? 'UZS')}</Text>
                </View>
              </View>
              <Text style={styles.percentageText}>{Math.round(alert.percentage)}% used in this period</Text>
              {!isRead && (
                <Button title="Mark reviewed" onPress={() => acknowledge(alert.id)} variant="secondary" fullWidth />
              )}
            </TouchableOpacity>
          );
        }}
      />

      {unreadCount > 0 && (
        <View style={styles.footer}>
          <Button title="Mark all reviewed" onPress={acknowledgeAll} fullWidth />
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
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 140, gap: spacing.md },
  emptyCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.xl, gap: spacing.base, marginTop: spacing['4xl'] },
  emptyTitle: { ...typography.heading5, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  card: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.md },
  cardRead: { opacity: 0.68 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  levelPill: { ...typography.captionSemiBold, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  warning: { color: colors.warning[700], backgroundColor: colors.warning[100] },
  critical: { color: colors.error[700], backgroundColor: colors.error[100] },
  over: { color: colors.error[700], backgroundColor: colors.error[100] },
  dateText: { ...typography.caption, color: colors.textTertiary },
  cardTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  cardText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricRight: { alignItems: 'flex-end' },
  metricLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.xs },
  metricValue: { ...typography.bodySemiBold, color: colors.text },
  percentageText: { ...typography.captionMedium, color: colors.textTertiary },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
