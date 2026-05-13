import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShallow } from 'zustand/react/shallow';
import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { BackButton } from '../../../shared/components/BackButton';
import { Button } from '../../../shared/components/Button';
import { useAuthStore } from '../../auth/store/authStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useRecurringStore } from '../store/recurringStore';
import * as recurringQueries from '../../../shared/services/database/recurringQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import type { TasksStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<TasksStackParamList>;

export const RecurringsScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId) || '';
  const recurrings = useRecurringStore(useShallow((s) => s.recurrings));
  const setRecurrings = useRecurringStore((s) => s.setRecurrings);
  const updateRecurring = useRecurringStore((s) => s.updateRecurring);
  const removeRecurring = useRecurringStore((s) => s.removeRecurring);
  const categories = useCategoryStore(useShallow((s) => s.categories));

  useEffect(() => {
    if (!userId) return;
    setRecurrings(recurringQueries.findAll().filter((item) => item.userId === userId));
  }, [setRecurrings, userId]);

  const sorted = useMemo(
    () => [...recurrings].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.nextDate - b.nextDate),
    [recurrings],
  );

  const categoryName = (categoryId: string) => categories.find((category) => category.id === categoryId)?.name ?? 'Category';

  const toggleActive = async (id: string) => {
    const item = recurrings.find((recurring) => recurring.id === id);
    if (!item) return;
    const patch = { isActive: !item.isActive, updatedAt: Date.now() };
    const updatedRecurring = { ...item, ...patch };
    if (patch.isActive) recurringQueries.resume(id);
    else recurringQueries.pause(id);
    updateRecurring(id, patch);
    await syncService.queueChange('recurrings', id, 'update', updatedRecurring);
    const auditLog = auditLogQueries.record({
      userId: item.userId,
      entityType: 'recurrings',
      entityId: id,
      action: 'update',
      before: item,
      after: updatedRecurring,
      source: patch.isActive ? 'recurring_resume' : 'recurring_pause',
    });
    await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
  };

  const deleteRecurring = (id: string) => {
    const item = recurrings.find((recurring) => recurring.id === id);
    if (!item) return;
    Alert.alert('Delete recurring?', 'This removes the local rule and queues deletion for sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          recurringQueries.delete(id);
          removeRecurring(id);
          await syncService.queueChange('recurrings', id, 'delete', item);
          const auditLog = auditLogQueries.record({
            userId: item.userId,
            entityType: 'recurrings',
            entityId: id,
            action: 'delete',
            before: item,
            source: 'recurring_list',
          });
          await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Recurring</Text>
          <Text style={styles.subtitle}>Rent, subscriptions, salary, and repeat payments</Text>
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No recurring rules yet</Text>
            <Text style={styles.emptyText}>Create a repeat transaction once, then use it as the automation base for future generated transactions.</Text>
            <Button title="Create recurring" onPress={() => navigation.navigate('CreateRecurring')} fullWidth />
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.isActive && styles.cardPaused]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardTitle}>{item.description || categoryName(item.categoryId)}</Text>
                <Text style={styles.cardMeta}>{categoryName(item.categoryId)} · {item.frequency} · next {new Date(item.nextDate).toLocaleDateString()}</Text>
              </View>
              <View style={[styles.statusBadge, item.isActive ? styles.activeBadge : styles.pausedBadge]}>
                <Text style={styles.statusText}>{item.isActive ? 'Active' : 'Paused'}</Text>
              </View>
            </View>
            <Text style={[styles.amount, item.type === 'income' && styles.incomeAmount]}>
              {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount, item.currency)}
            </Text>
            <View style={styles.actions}>
              <Button title="Edit" onPress={() => navigation.navigate('CreateRecurring', { recurringId: item.id })} variant="secondary" size="sm" />
              <Button title={item.isActive ? 'Pause' : 'Resume'} onPress={() => toggleActive(item.id)} variant="outline" size="sm" />
              <Button title="Delete" onPress={() => deleteRecurring(item.id)} variant="danger" size="sm" />
            </View>
          </View>
        )}
      />

      {sorted.length > 0 && (
        <View style={styles.footer}>
          <Button title="Create recurring" onPress={() => navigation.navigate('CreateRecurring')} fullWidth />
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
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: 120, gap: spacing.md },
  emptyCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.xl, gap: spacing.base, marginTop: spacing['4xl'] },
  emptyTitle: { ...typography.heading5, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  card: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius['2xl'], padding: spacing.base, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.md },
  cardPaused: { opacity: 0.62 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  cardTitleBlock: { flex: 1 },
  cardTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  cardMeta: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, alignSelf: 'flex-start' },
  activeBadge: { backgroundColor: colors.success[900] },
  pausedBadge: { backgroundColor: colors.white[20] },
  statusText: { ...typography.captionMedium, color: colors.text },
  amount: { ...typography.heading4, color: colors.error[400] },
  incomeAmount: { color: colors.success[500] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: spacing['2xl'], backgroundColor: 'rgba(16,16,16,0.92)' },
});
