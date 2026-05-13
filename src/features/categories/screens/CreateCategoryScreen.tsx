import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { colors, typography, spacing, borderRadius } from '../../../shared/constants';
import { Button } from '../../../shared/components/Button';
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../../profile/store/profileStore';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { useCategoryStore } from '../store/categoryStore';
import * as categoryQueries from '../../../shared/services/database/categoryQueries';
import * as budgetQueries from '../../../shared/services/database/budgetQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { buildBudgetAllocationSummary, monthlyEquivalent } from '../../budget/utils/budgetAllocation';
import { canCreateCustomCategory, isLockedOtherCategory } from '../../../shared/services/categories/categoryPolicy';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import type { Budget, BudgetPeriod, Category, ProfileStackParamList, TransactionType } from '../../../shared/types';

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'CreateCategory'>;
type ScreenRoute = RouteProp<ProfileStackParamList, 'CreateCategory'>;
type EditableType = Extract<TransactionType, 'expense' | 'income'>;
type LimitPeriod = '1D' | '7D' | '14D' | '30D';
type Picker = 'icon' | 'color' | null;

const ICONS = [
  { value: '🎧', label: 'Airbuds', group: 'All' },
  { value: '🥨', label: 'Betle', group: 'Food' },
  { value: '☕️', label: 'Cup', group: 'Food' },
  { value: '🍵', label: 'Cup hot', group: 'Food' },
  { value: '🍷', label: 'Wineglass', group: 'Food' },
  { value: '🍾', label: 'Corkscrew', group: 'Food' },
  { value: '🍩', label: 'Donut', group: 'Food' },
  { value: '🥄', label: 'Ladle', group: 'Food' },
  { value: '💸', label: 'Cash', group: 'Finance' },
  { value: '💳', label: 'Card', group: 'Finance' },
  { value: '👕', label: 'Shirt', group: 'Clothing' },
  { value: '👟', label: 'Shoes', group: 'Clothing' },
];
const ICON_GROUPS = ['All', 'Food', 'Finance', 'Clothing'];
const PALETTE = ['#FFFFFF', '#C7C7C7', '#17E56C', '#9EEA43', '#FAAD14', '#F55858', '#FF4EB8', '#B35CFF', '#4B8DF5', '#39D7FF', '#14B8A6', '#F97316'];
const LIMIT_PERIODS: LimitPeriod[] = ['1D', '7D', '14D', '30D'];

const generateUUID = (): string => {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
    else if (i === 14) uuid += '4';
    else if (i === 19) uuid += hex[(Math.random() * 4 | 0) + 8];
    else uuid += hex[Math.random() * 16 | 0];
  }
  return uuid;
};

const periodToBudgetPeriod = (period: LimitPeriod): BudgetPeriod => {
  if (period === '1D') return 'daily';
  if (period === '14D') return 'fourteen_days';
  if (period === '30D') return 'monthly';
  return 'weekly';
};

const budgetPeriodToLimitPeriod = (period?: BudgetPeriod): LimitPeriod => {
  if (period === 'daily') return '1D';
  if (period === 'fourteen_days') return '14D';
  if (period === 'monthly') return '30D';
  return '7D';
};

const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5L9 12L15 19" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CloseIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M6 6L18 18M18 6L6 18" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const ChevronIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5L15 12L9 19" stroke={colors.white[40]} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CheckIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12.5L9.5 17L19 7" stroke={colors.background} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CreateCategoryScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<ScreenRoute>();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.userId);
  const currency = useProfileStore((s) => s.currency);
  const tier = useProfileStore((s) => s.user?.tier ?? 'free');
  const categories = useCategoryStore((s) => s.categories);
  const addCategory = useCategoryStore((s) => s.addCategory);
  const updateCategory = useCategoryStore((s) => s.updateCategory);
  const budgets = useBudgetStore((s) => s.budgets);
  const addBudget = useBudgetStore((s) => s.addBudget);
  const updateBudget = useBudgetStore((s) => s.updateBudget);
  const removeBudget = useBudgetStore((s) => s.removeBudget);

  const existing = useMemo(
    () => categories.find((category) => category.id === route.params?.categoryId),
    [categories, route.params?.categoryId],
  );
  const existingBudget = useMemo(
    () => existing ? budgets.find((budget) => budget.categoryId === existing.id && budget.isActive) : undefined,
    [budgets, existing],
  );

  const lockedOther = isLockedOtherCategory(existing);

  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? ICONS[0].value);
  const [color, setColor] = useState(existing?.color ?? '#FF4EB8');
  const [type, setType] = useState<EditableType>(existing?.type === 'income' ? 'income' : 'expense');
  const [limitEnabled, setLimitEnabled] = useState(Boolean(existingBudget));
  const [limitPeriod, setLimitPeriod] = useState<LimitPeriod>(budgetPeriodToLimitPeriod(existingBudget?.period));
  const [limitAmount, setLimitAmount] = useState(existingBudget ? String(existingBudget.amount) : '');
  const [picker, setPicker] = useState<Picker>(null);
  const [iconGroup, setIconGroup] = useState('All');
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const parsedLimit = Number(limitAmount.replace(',', '.').replace(/\s/g, ''));
  const isLimitValid = !limitEnabled || (Number.isFinite(parsedLimit) && parsedLimit > 0);
  const isValid = trimmedName.length >= 2 && isLimitValid;
  const title = existing ? 'Edit category' : 'Create a category';
  const filteredIcons = iconGroup === 'All' ? ICONS : ICONS.filter((item) => item.group === iconGroup);
  const pendingBudget = limitEnabled && type === 'expense' && Number.isFinite(parsedLimit) && parsedLimit > 0 ? {
    id: existingBudget?.id ?? 'pending-category-budget',
    userId: existing?.userId ?? userId ?? '',
    categoryId: existing?.id ?? 'pending-category',
    name: `${trimmedName || 'Category'} limit`,
    amount: parsedLimit,
    currency,
    period: periodToBudgetPeriod(limitPeriod),
    startDate: existingBudget?.startDate ?? Date.now(),
    warningThreshold: existingBudget?.warningThreshold ?? 80,
    criticalThreshold: existingBudget?.criticalThreshold ?? 100,
    isHardLimit: existingBudget?.isHardLimit ?? false,
    rolloverEnabled: existingBudget?.rolloverEnabled ?? false,
    isActive: true,
    createdAt: existingBudget?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  } satisfies Budget : undefined;
  const allocation = buildBudgetAllocationSummary(budgets, currency, pendingBudget);
  const monthlyLimit = pendingBudget ? monthlyEquivalent(pendingBudget.amount, pendingBudget.period) : 0;

  const saveBudgetIfNeeded = async (category: Category) => {
    const now = Date.now();
    if (!limitEnabled || category.type !== 'expense') {
      if (existingBudget) {
        budgetQueries.deactivate(existingBudget.id);
        removeBudget(existingBudget.id);
        const deletedBudget = { ...existingBudget, isActive: false, updatedAt: now };
        await syncService.queueChange('budgets', existingBudget.id, 'delete', deletedBudget);
        const auditLog = auditLogQueries.record({
          userId: category.userId,
          entityType: 'budgets',
          entityId: existingBudget.id,
          action: 'delete',
          before: existingBudget,
          after: deletedBudget,
          source: 'category_form_limit_disabled',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      }
      return;
    }
    const budgetPeriod = periodToBudgetPeriod(limitPeriod);

    if (existingBudget) {
      const patch: Partial<Budget> = {
        name: `${category.name} limit`,
        amount: parsedLimit,
        currency,
        period: budgetPeriod,
        categoryId: category.id,
        updatedAt: now,
      };
      const updatedBudget = { ...existingBudget, ...patch };
      budgetQueries.update(existingBudget.id, patch);
      updateBudget(existingBudget.id, patch);
      await syncService.queueChange('budgets', existingBudget.id, 'update', updatedBudget);
      const auditLog = auditLogQueries.record({
        userId: category.userId,
        entityType: 'budgets',
        entityId: existingBudget.id,
        action: 'update',
        before: existingBudget,
        after: updatedBudget,
        source: 'category_form_limit',
      });
      await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      return;
    }

    const budget: Budget = {
      id: generateUUID(),
      userId: category.userId,
      categoryId: category.id,
      name: `${category.name} limit`,
      amount: parsedLimit,
      currency,
      period: budgetPeriod,
      startDate: now,
      warningThreshold: 80,
      criticalThreshold: 100,
      isHardLimit: false,
      rolloverEnabled: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    budgetQueries.insert(budget);
    addBudget(budget);
    await syncService.queueChange('budgets', budget.id, 'create', budget);
    const auditLog = auditLogQueries.record({
      userId: category.userId,
      entityType: 'budgets',
      entityId: budget.id,
      action: 'create',
      after: budget,
      source: 'category_form_limit',
    });
    await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
  };

  const save = async () => {
    if (!isValid) {
      Alert.alert('Check category', limitEnabled ? 'Enter a name and positive limit amount.' : 'Use at least 2 characters for the category name.');
      return;
    }
    if (!userId && !existing?.userId) {
      Alert.alert('Not ready', 'User session is required to save categories.');
      return;
    }

    if (!existing && !canCreateCustomCategory(categories, tier)) {
      Alert.alert('Category limit reached', 'Free plan includes 5 editable starter categories plus locked Other. Upgrade to create unlimited custom categories.');
      return;
    }

    const now = Date.now();
    setSaving(true);
    try {
      if (existing) {
        const patch: Partial<Category> = { name: lockedOther ? existing.name : trimmedName, icon, color, type: lockedOther ? existing.type : type, updatedAt: now };
        const updatedCategory = { ...existing, ...patch };
        categoryQueries.update(existing.id, patch);
        updateCategory(existing.id, patch);
        await syncService.queueChange('categories', existing.id, 'update', updatedCategory);
        await saveBudgetIfNeeded(updatedCategory);
      } else {
        const maxSortOrder = categories.reduce((max, category) => Math.max(max, category.sortOrder ?? 0), 0);
        const category: Category = {
          id: generateUUID(),
          userId: userId!,
          name: trimmedName,
          icon,
          color,
          type,
          isDefault: false,
          sortOrder: maxSortOrder + 1,
          createdAt: now,
          updatedAt: now,
        };
        categoryQueries.insert(category);
        addCategory(category);
        await syncService.queueChange('categories', category.id, 'create', category);
        await saveBudgetIfNeeded(category);
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[colors.neutral[800], colors.background]} style={styles.gradient}>
      <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top + spacing.lg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.75} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            <Text style={styles.cardLabel}>PARAMETERS</Text>
            <TextInput
              value={name}
              onChangeText={lockedOther ? undefined : setName}
              placeholder="Category's name"
              placeholderTextColor={colors.textDisabled}
              style={[styles.nameInput, lockedOther && styles.nameInputLocked]}
              autoCapitalize="words"
              returnKeyType="done"
              editable={!lockedOther}
            />
            {lockedOther && <Text style={styles.lockedHelper}>Other is the protected fallback category. You can change icon/color, but not its name.</Text>}
            <View style={styles.paramRow}>
              <TouchableOpacity style={styles.paramTile} activeOpacity={0.75} onPress={() => setPicker('icon')}>
                <Text style={styles.paramLabel}>Icon</Text>
                <Text style={styles.paramIcon}>{icon}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paramTile} activeOpacity={0.75} onPress={() => setPicker('color')}>
                <Text style={styles.paramLabel}>Color</Text>
                <View style={[styles.colorPreview, { backgroundColor: color }]} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.limitWrap}>
            <View style={styles.limitTag}><Text style={styles.limitTagText}>LIMIT</Text></View>
            <View style={styles.limitCard}>
              <View style={styles.limitToggleRow}>
                <Text style={styles.limitTitle}>Set limit</Text>
                <Switch
                  value={limitEnabled}
                  onValueChange={setLimitEnabled}
                  trackColor={{ false: colors.neutral[700], true: colors.success[700] }}
                  thumbColor={colors.white[100]}
                  ios_backgroundColor={colors.neutral[700]}
                />
              </View>

              {limitEnabled && (
                <View style={styles.limitParams}>
                  <Text style={styles.cardLabel}>PARAMETERS</Text>
                  <View style={styles.segmentRow}>
                    {LIMIT_PERIODS.map((item) => (
                      <TouchableOpacity key={item} onPress={() => setLimitPeriod(item)} style={[styles.segment, limitPeriod === item && styles.segmentActive]}>
                        <Text style={[styles.segmentText, limitPeriod === item && styles.segmentTextActive]}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.limitInputRow}>
                    <Text style={styles.limitInputLabel}>Limit</Text>
                    <TextInput
                      value={limitAmount}
                      onChangeText={setLimitAmount}
                      placeholder="10 000"
                      placeholderTextColor={colors.textDisabled}
                      keyboardType="decimal-pad"
                      style={styles.limitInput}
                    />
                    <Text style={styles.currencyText}>{currency}</Text>
                    <ChevronIcon />
                  </View>
                  {pendingBudget && limitPeriod !== '30D' && (
                    <Text style={styles.limitHelper}>≈ {formatCurrency(monthlyLimit, currency)} per month for allocation comparison.</Text>
                  )}
                  {allocation.health !== 'none' && (
                    <View style={[styles.allocationCard, allocation.health === 'exceeded' && styles.allocationCardDanger, allocation.health === 'near' && styles.allocationCardWarning]}>
                      <Text style={styles.allocationTitle}>Category allocation</Text>
                      <Text style={styles.allocationText}>
                        {formatCurrency(allocation.categoryMonthly, currency)} / {formatCurrency(allocation.totalMonthly, currency)} monthly equivalent allocated ({allocation.allocatedPercent}%).
                      </Text>
                      {allocation.health === 'exceeded' && <Text style={styles.allocationDanger}>Category limits exceed total budget by {formatCurrency(Math.abs(allocation.remainingMonthly), currency)}.</Text>}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.base }]}>
          <Button
            title={existing ? 'Save changes' : 'Create a category'}
            onPress={save}
            loading={saving}
            disabled={!isValid}
            fullWidth
            size="lg"
            style={styles.cta}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={picker === 'color'} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select color</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setPicker(null)}><CloseIcon /></TouchableOpacity>
            </View>
            <View style={styles.paletteGrid}>
              {PALETTE.map((item) => (
                <TouchableOpacity key={item} onPress={() => setColor(item)} style={[styles.paletteCell, { backgroundColor: item }]}>
                  {color === item && <View style={styles.paletteSelected}><CheckIcon /></View>}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.opacityLabel}>OPACITY</Text>
            <View style={styles.opacityRow}>
              <View style={[styles.opacityTrack, { backgroundColor: color }]} />
              <Text style={styles.opacityValue}>100%</Text>
            </View>
            <Button title="Save" onPress={() => setPicker(null)} fullWidth size="lg" />
          </View>
        </View>
      </Modal>

      <Modal visible={picker === 'icon'} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select icon</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setPicker(null)}><CloseIcon /></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
              {ICON_GROUPS.map((group) => (
                <TouchableOpacity key={group} onPress={() => setIconGroup(group)} style={[styles.groupChip, iconGroup === group && styles.groupChipActive]}>
                  <Text style={[styles.groupText, iconGroup === group && styles.groupTextActive]}>{group}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.iconGrid}>
              {filteredIcons.map((item) => (
                <TouchableOpacity key={`${item.group}-${item.label}`} onPress={() => setIcon(item.value)} style={styles.iconItem}>
                  <View style={[styles.iconCircle, icon === item.value && styles.iconCircleActive]}>
                    <Text style={styles.iconEmoji}>{item.value}</Text>
                    {icon === item.value && <View style={styles.iconCheck}><CheckIcon /></View>}
                  </View>
                  <Text style={styles.iconLabel} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Save" onPress={() => setPicker(null)} fullWidth size="lg" />
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginRight: spacing.base,
  },
  headerTitle: { ...typography.heading5, color: colors.text },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.xl },
  formCard: {
    borderRadius: borderRadius['2xl'],
    padding: spacing.base,
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: spacing.md,
  },
  cardLabel: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1 },
  nameInput: {
    minHeight: 58,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: spacing.base,
    color: colors.text,
    ...typography.bodyLargeMedium,
  },
  nameInputLocked: { color: colors.textTertiary },
  lockedHelper: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  paramRow: { flexDirection: 'row', gap: spacing.md },
  paramTile: {
    flex: 1,
    minHeight: 96,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(0,0,0,0.22)',
    padding: spacing.base,
    justifyContent: 'space-between',
  },
  paramLabel: { ...typography.bodyMedium, color: colors.textTertiary },
  paramIcon: { fontSize: 34, alignSelf: 'flex-end' },
  colorPreview: { width: 36, height: 36, borderRadius: 18, alignSelf: 'flex-end' },
  limitWrap: { paddingTop: spacing.sm },
  limitTag: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    marginLeft: spacing.base,
    marginBottom: -spacing.sm,
    zIndex: 2,
  },
  limitTagText: { ...typography.captionSemiBold, color: colors.text, letterSpacing: 1.1 },
  limitCard: {
    borderRadius: borderRadius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  limitToggleRow: { minHeight: 62, paddingHorizontal: spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  limitTitle: { ...typography.bodyLargeMedium, color: colors.text },
  limitParams: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.base, gap: spacing.md },
  segmentRow: { flexDirection: 'row', gap: spacing.sm, borderRadius: borderRadius.full, backgroundColor: 'rgba(0,0,0,0.22)', padding: spacing.xs },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  segmentActive: { backgroundColor: colors.neutral[700] },
  segmentText: { ...typography.smallSemiBold, color: colors.textTertiary },
  segmentTextActive: { color: colors.text },
  limitInputRow: {
    minHeight: 58,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  limitInputLabel: { ...typography.bodyMedium, color: colors.textTertiary, flex: 1 },
  limitInput: { minWidth: 84, textAlign: 'right', color: colors.text, ...typography.bodyLargeSemiBold },
  currencyText: { ...typography.smallSemiBold, color: colors.textTertiary },
  limitHelper: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  allocationCard: { backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.base, gap: spacing.xs },
  allocationCardWarning: { borderColor: colors.warning[700] },
  allocationCardDanger: { borderColor: colors.error[500] },
  allocationTitle: { ...typography.bodySemiBold, color: colors.text },
  allocationText: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  allocationDanger: { ...typography.captionSemiBold, color: colors.error[400], lineHeight: 16 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, backgroundColor: colors.background },
  cta: { borderRadius: borderRadius.full },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { backgroundColor: '#080808', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, gap: spacing.lg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...typography.heading4, color: colors.text },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  paletteCell: { width: '22.8%', aspectRatio: 1.35, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  paletteSelected: { width: 30, height: 30, borderRadius: borderRadius.sm, borderWidth: 2, borderColor: colors.white[100], alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
  opacityLabel: { ...typography.captionSemiBold, color: colors.textTertiary, letterSpacing: 1.1 },
  opacityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  opacityTrack: { flex: 1, height: 18, borderRadius: 99 },
  opacityValue: { ...typography.bodyMedium, color: colors.text },
  groupRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  groupChip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceElevated },
  groupChipActive: { backgroundColor: colors.white[100] },
  groupText: { ...typography.smallSemiBold, color: colors.text },
  groupTextActive: { color: colors.background },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  iconItem: { width: '21.5%', alignItems: 'center', gap: spacing.sm },
  iconCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconCircleActive: { backgroundColor: colors.white[100] },
  iconEmoji: { fontSize: 26 },
  iconCheck: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success[700], alignItems: 'center', justifyContent: 'center' },
  iconLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
