import React, { useMemo } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { getBudgetProgress } from '../../budget/utils/budgetProgress';
import { useTransactionStore } from '../../transactions/store/transactionStore';
import { useCategoryStore } from '../store/categoryStore';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { canCreateCustomCategory, customCategoryLimit } from '../../../shared/services/categories/categoryPolicy';
import { useProfileStore } from '../../profile/store/profileStore';
import type { Category, ProfileStackParamList } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'Categories'>;

const AddIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5V19M5 12H19" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5L9 12L15 19" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ChevronIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5L15 12L9 19" stroke={colors.white[50]} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CategoriesScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const tier = useProfileStore((s) => s.user?.tier ?? 'free');
  const categories = useCategoryStore(useShallow((s) => s.categories));
  const budgets = useBudgetStore(useShallow((s) => s.budgets.filter((budget) => budget.isActive)));
  const transactions = useTransactionStore(useShallow((s) => s.transactions));

  const rows = useMemo(() => categories.map((category) => {
    const primaryBudget = budgets.find((budget) => budget.categoryId === category.id);
    const progress = primaryBudget ? getBudgetProgress(primaryBudget, transactions) : undefined;
    const total = transactions
      .filter((tx) => tx.categoryId === category.id)
      .reduce((sum, tx) => sum + tx.amount, 0);

    return { category, primaryBudget, progress, total };
  }), [budgets, categories, transactions]);

  const createCategory = () => {
    if (!canCreateCustomCategory(categories, tier)) {
      const limit = customCategoryLimit(tier);
      Alert.alert(
        'Category limit reached',
        Number.isFinite(limit)
          ? 'Free plan includes 5 editable starter categories plus locked Other. Upgrade to create unlimited custom categories.'
          : 'Category limit reached for this plan.',
      );
      return;
    }
    navigation.navigate('CreateCategory');
  };
  const openCategory = (category: Category) => navigation.navigate('CategoryDetail', { categoryId: category.id });

  return (
    <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.75} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('profile.categories')}</Text>
            <Text style={styles.subtitle}>{rows.length} Categor{rows.length === 1 ? 'y' : 'ies'}</Text>
          </View>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.75} onPress={createCategory}>
            <AddIcon />
          </TouchableOpacity>
        </View>

        <FlatList
          data={rows}
          keyExtractor={({ category }) => category.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={(
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No categories yet</Text>
              <Text style={styles.emptyText}>Create expense categories to monitor limits and spending history.</Text>
            </View>
          )}
          renderItem={({ item: { category, primaryBudget, progress, total } }) => {
            const percentage = progress ? Math.round(progress.percentage) : 0;
            const limitText = primaryBudget ? formatCurrency(progress?.effectiveAmount ?? primaryBudget.amount, primaryBudget.currency) : undefined;
            const amountText = formatCurrency(progress?.spent ?? total, primaryBudget?.currency ?? 'UZS');

            return (
              <TouchableOpacity activeOpacity={0.78} onPress={() => openCategory(category)} style={styles.categoryCard}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.categoryIconWrap, { backgroundColor: category.color || colors.surfaceElevated }]}>
                    <Text style={styles.categoryIcon}>{category.icon}</Text>
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{category.name}</Text>
                    <Text style={styles.cardSubtitle}>{primaryBudget ? `${percentage}% of the limit was spent` : category.type === 'income' ? 'Income category' : 'No limit set'}</Text>
                  </View>
                  <ChevronIcon />
                </View>

                <View style={styles.statRow}>
                  {primaryBudget && (
                    <View style={styles.statPill}>
                      <Text style={styles.statLabel}>Limit</Text>
                      <Text style={styles.statValue}>{limitText}</Text>
                    </View>
                  )}
                  <View style={styles.statPill}>
                    <Text style={styles.statLabel}>{category.type === 'income' ? 'Income' : 'Spent'}</Text>
                    <Text style={styles.statValue}>{amountText}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
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
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
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
  headerText: { flex: 1, marginLeft: spacing.base },
  title: { ...typography.heading4, color: colors.text },
  subtitle: { ...typography.body, color: colors.textTertiary, marginTop: spacing.xs },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.md },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: borderRadius['3xl'],
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyTitle: { ...typography.heading5, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  categoryCard: {
    borderRadius: borderRadius['3xl'],
    padding: spacing.base,
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: spacing.base,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: { fontSize: 27 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { ...typography.bodyLargeSemiBold, color: colors.text },
  cardSubtitle: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.md, marginLeft: 70 },
  statPill: {
    flex: 1,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  statValue: { ...typography.bodySemiBold, color: colors.text },
});
