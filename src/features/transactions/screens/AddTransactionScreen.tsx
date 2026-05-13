import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Button, Card, Input } from '../../../shared/components';
import { colors, spacing, typography, borderRadius } from '../../../shared/constants';
import type { Account, Category, Currency, HomeStackParamList, TransactionType } from '../../../shared/types';
import { useAuthStore } from '../../auth/store/authStore';
import { useProfileStore } from '../../profile/store/profileStore';
import { useCategoryStore } from '../../categories/store/categoryStore';
import { useTransactionStore } from '../store/transactionStore';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { evaluateBudgetAlerts } from '../../budget/services/budgetAlertService';
import * as accountQueries from '../../../shared/services/database/accountQueries';
import * as categoryQueries from '../../../shared/services/database/categoryQueries';
import * as transactionQueries from '../../../shared/services/database/transactionQueries';
import * as auditLogQueries from '../../../shared/services/database/auditLogQueries';
import { syncService } from '../../../shared/services/sync/syncService';
import { seedDefaults } from '../../../shared/services/database/seed';
import { parseVoiceInputs } from '../../../shared/services/voice/voiceParser';
import { appLanguageToStt, recognize, onStateChange, type VoiceServiceState } from '../../../shared/services/voice/voiceService';
import { captureSafeEvent, useSafePostHog } from '../../../shared/services/analytics/posthog';
import { resolveIntent } from '../../../shared/services/intent/intentResolver';
import {
  candidateFromIntentDraft,
  candidateFromParse as buildCandidateFromParse,
  candidateToTransaction,
  getCandidateReviewState,
  getCategoriesByType,
  getFallbackCategory as findFallbackCategory,
  manualCandidate,
  parseCandidateAmount,
  type CandidateType,
  type TransactionCandidate,
} from '../utils/transactionCandidates';

export const AddTransactionScreen = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<HomeStackParamList, 'AddTransaction'>>();
  const posthog = useSafePostHog();
  const userId = useAuthStore((s) => s.userId);
  const appCurrency = useProfileStore((s) => s.currency) as Currency;
  const language = useProfileStore((s) => s.language);
  const categories = useCategoryStore((s) => s.categories);
  const setCategories = useCategoryStore((s) => s.setCategories);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const budgets = useBudgetStore((s) => s.budgets);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [inputText, setInputText] = useState('');
  const [manualType, setManualType] = useState<Extract<TransactionType, 'income' | 'expense'>>(route.params?.type ?? 'expense');
  const [manualCurrency, setManualCurrency] = useState<Currency>((appCurrency || 'UZS') as Currency);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [candidates, setCandidates] = useState<TransactionCandidate[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceServiceState>({
    isRecording: false,
    isProcessing: false,
    mode: null,
    error: null,
  });
  const [isSaving, setIsSaving] = useState(false);

  const defaultCurrency = (appCurrency || 'UZS') as Currency;
  const defaultAccount = accounts[0];
  const currencyOptions = useMemo(() => Array.from(new Set([defaultCurrency, 'UZS', 'USD', 'EUR', 'RUB'])) as Currency[], [defaultCurrency]);

  useEffect(() => {
    if (route.params?.type) setManualType(route.params.type);
  }, [route.params?.type]);

  const expenseCategories = useMemo(
    () => getCategoriesByType(categories, 'expense'),
    [categories]
  );
  const incomeCategories = useMemo(
    () => getCategoriesByType(categories, 'income'),
    [categories]
  );

  const displayCategoryName = useCallback((category?: Category): string => {
    if (!category) return 'Other';
    return category.name.startsWith('categories.') ? t(category.name) : category.name;
  }, [t]);

  const categoryResolverOptions = useMemo(() => ({
    categories,
    displayCategoryName,
  }), [categories, displayCategoryName]);

  const getFallbackCategory = useCallback((type: CandidateType): Category | undefined => (
    findFallbackCategory(type, categoryResolverOptions)
  ), [categoryResolverOptions]);

  const loadLocalData = useCallback(() => {
    if (!userId) return;

    try {
      let nextCategories = categoryQueries.findByUser(userId);
      let nextAccounts = accountQueries.findByUser(userId);

      if (nextCategories.length === 0 || nextAccounts.length === 0) {
        seedDefaults(userId);
        nextCategories = categoryQueries.findByUser(userId);
        nextAccounts = accountQueries.findByUser(userId);
      }

      setCategories(nextCategories);
      setAccounts(nextAccounts);
    } catch (error) {
      console.warn('Failed to load transaction dependencies', error);
    }
  }, [setCategories, userId]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  useEffect(() => onStateChange(setVoiceState), []);

  const candidateFromParse = useCallback((
    result: Parameters<typeof buildCandidateFromParse>[0],
    source: TransactionCandidate['source'],
  ): TransactionCandidate | null => (
    buildCandidateFromParse(result, source, defaultCurrency, categoryResolverOptions)
  ), [categoryResolverOptions, defaultCurrency]);

  const buildCandidatesFromIntent = useCallback(async (
    text: string,
    source: Extract<TransactionCandidate['source'], 'text' | 'voice'>,
  ): Promise<TransactionCandidate[]> => {
    try {
      const resolution = await resolveIntent({
        text,
        source,
        uiLanguage: language,
        defaultCurrency,
        categories,
        accounts,
        displayCategoryName,
      });

      captureSafeEvent(posthog, 'ai_intent_resolved', {
        source,
        intent: resolution.intent,
        provider: resolution.provider,
        confidence_bucket: Math.round(resolution.confidence * 10) * 10,
        draft_count: resolution.drafts.length,
      });

      const transactionDrafts = resolution.drafts.filter((draft) => draft.kind === 'transaction' && draft.transaction);
      const resolvedCandidates = transactionDrafts
        .map((draft) => candidateFromIntentDraft(
          draft.transaction!,
          'ai',
          defaultCurrency,
          categoryResolverOptions,
          draft.confidence,
          text,
        ))
        .filter((candidate): candidate is TransactionCandidate => candidate !== null);

      if (resolvedCandidates.length > 0) return resolvedCandidates;

      const actionable = resolution.drafts.find((draft) => draft.kind !== 'unknown');
      if (actionable?.kind === 'debt_create' || actionable?.kind === 'debt_repayment') {
        Alert.alert('Debt detected', resolution.nextQuestion || 'I understood this as a debt/lending action. Please use Debts & lending to review and save it safely.');
        return [];
      }
      if (actionable?.kind === 'budget_create' || actionable?.kind === 'recurring_create') {
        Alert.alert('Automation detected', resolution.nextQuestion || 'I understood this as a budget or recurring action. Please review it from Tasks.');
        return [];
      }
    } catch (error) {
      captureSafeEvent(posthog, 'ai_intent_failed', { source, error_kind: error instanceof Error ? 'service_error' : 'unknown' });
    }

    return parseVoiceInputs(text)
      .map((result) => candidateFromParse(result, source))
      .filter((candidate): candidate is TransactionCandidate => candidate !== null);
  }, [accounts, candidateFromParse, categories, categoryResolverOptions, defaultCurrency, displayCategoryName, language, posthog]);

  const handleParseText = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const parsed = await buildCandidatesFromIntent(trimmed, 'text');

    if (parsed.length === 0) {
      captureSafeEvent(posthog, 'parse_low_confidence', { source: 'text', language });
      Alert.alert('Needs more detail', 'Please include at least an amount, for example: “taxi 25000”.');
      return;
    }

    captureSafeEvent(posthog, 'parse_completed', {
      source: 'text',
      language,
      candidate_count: parsed.length,
      has_multi_transaction: parsed.length > 1,
    });
    setCandidates(parsed);
    Haptics.selectionAsync().catch(() => {});
  }, [buildCandidatesFromIntent, inputText, language, posthog]);

  const handleManualCandidate = useCallback(() => {
    const amount = Number(manualAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than 0.');
      return;
    }

    const candidate = manualCandidate(
      manualType,
      amount,
      manualDescription,
      manualCurrency,
      categoryResolverOptions,
    );

    if (!candidate) {
      Alert.alert('No category', 'Create or reload categories first.');
      return;
    }

    captureSafeEvent(posthog, 'parse_completed', {
      source: 'manual',
      language,
      candidate_count: 1,
      has_multi_transaction: false,
    });
    setCandidates([candidate]);
    Haptics.selectionAsync().catch(() => {});
  }, [categoryResolverOptions, language, manualAmount, manualCurrency, manualDescription, manualType, posthog]);

  const handleVoiceCapture = useCallback(async () => {
    const preferredSttLanguage = appLanguageToStt(language);
    captureSafeEvent(posthog, 'voice_record_started', { ui_language: language, preferred_stt_language: preferredSttLanguage });
    const result = await recognize({
      language: preferredSttLanguage,
      mode: 'auto',
      maxDurationMs: 7000,
    });

    if (!result?.text) {
      captureSafeEvent(posthog, 'stt_failed', { ui_language: language, preferred_stt_language: preferredSttLanguage, error_kind: voiceState.error ? 'service_error' : 'empty_result' });
      Alert.alert('Voice not recognized', voiceState.error || 'Please try again or type the expense.');
      return;
    }

    captureSafeEvent(posthog, 'stt_completed', {
      ui_language: language,
      preferred_stt_language: preferredSttLanguage,
      detected_stt_language: result.detectedLanguage ?? result.language,
      mode: result.mode,
      confidence_bucket: Math.round(result.confidence * 10) * 10,
    });
    setInputText(result.text);
    const parsed = await buildCandidatesFromIntent(result.text, 'voice');

    if (parsed.length === 0) {
      captureSafeEvent(posthog, 'parse_low_confidence', { source: 'voice', ui_language: language, detected_stt_language: result.detectedLanguage ?? result.language, mode: result.mode });
      Alert.alert('Needs review', `I heard: “${result.text}”, but could not find an amount.`);
      return;
    }

    captureSafeEvent(posthog, 'parse_completed', {
      source: 'voice',
      language,
      mode: result.mode,
      candidate_count: parsed.length,
      has_multi_transaction: parsed.length > 1,
    });
    setCandidates(parsed);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [buildCandidatesFromIntent, language, posthog, voiceState.error]);

  const updateCandidate = useCallback((id: string, data: Partial<TransactionCandidate>) => {
    captureSafeEvent(posthog, 'transaction_candidate_edited', {
      changed_amount: data.amount !== undefined,
      changed_currency: data.currency !== undefined,
      changed_description: data.description !== undefined,
      changed_type: data.type !== undefined,
      changed_category: data.categoryId !== undefined,
    });
    setCandidates((items) => items.map((item) => (item.id === id ? { ...item, ...data } : item)));
  }, [posthog]);

  const removeCandidate = useCallback((id: string) => {
    setCandidates((items) => items.filter((item) => item.id !== id));
  }, []);

  const cycleCandidateCategory = useCallback((candidate: TransactionCandidate) => {
    const list = candidate.type === 'income' ? incomeCategories : expenseCategories;
    if (list.length === 0) return;
    const currentIndex = list.findIndex((category) => category.id === candidate.categoryId);
    const next = list[(currentIndex + 1) % list.length];
    updateCandidate(candidate.id, { categoryId: next.id });
  }, [expenseCategories, incomeCategories, updateCandidate]);

  const hasInvalidCandidates = useMemo(
    () => candidates.some((candidate) => getCandidateReviewState(candidate).status === 'invalid'),
    [candidates]
  );

  const reviewCandidateCount = useMemo(
    () => candidates.filter((candidate) => getCandidateReviewState(candidate).status === 'review').length,
    [candidates]
  );

  const saveCandidates = useCallback(() => {
    if (!userId || !defaultAccount || candidates.length === 0 || hasInvalidCandidates) return;

    setIsSaving(true);
    const now = Date.now();

    try {
      for (const candidate of candidates) {
        const amount = parseCandidateAmount(candidate);
        if (!amount || amount <= 0) {
          throw new Error('Invalid draft transaction amount');
        }

        const transaction = candidateToTransaction(candidate, userId, defaultAccount, now);

        transactionQueries.insert(transaction);
        syncService.queueChange('transactions', transaction.id, 'create', transaction).catch(() => {});
        const auditLog = auditLogQueries.record({
          userId,
          entityType: 'transactions',
          entityId: transaction.id,
          action: 'create',
          after: transaction,
          source: `add_${candidate.source}`,
        });
        syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog).catch(() => {});
        accountQueries.adjustBalance(defaultAccount.id, candidate.type === 'expense' ? -amount : amount);
        addTransaction(transaction);
      }

      const budgetAlerts = evaluateBudgetAlerts(userId, budgets, transactionQueries.findByUser(userId, 1000));
      if (budgetAlerts.created.length > 0) {
        captureSafeEvent(posthog, 'budget_alert_created', {
          alert_count: budgetAlerts.created.length,
          highest_level: budgetAlerts.created.some((alert) => alert.level === 'over') ? 'over' : budgetAlerts.created.some((alert) => alert.level === 'critical') ? 'critical' : 'warning',
        });
      }

      captureSafeEvent(posthog, candidates.length > 1 ? 'multi_transaction_saved' : 'transaction_saved', {
        candidate_count: candidates.length,
        source: candidates.length === 1 ? candidates[0]?.source : 'mixed',
        has_voice: candidates.some((candidate) => candidate.source === 'voice'),
        has_manual: candidates.some((candidate) => candidate.source === 'manual'),
        has_text: candidates.some((candidate) => candidate.source === 'text'),
      });
      setCandidates([]);
      setInputText('');
      setManualAmount('');
      setManualDescription('');
      loadLocalData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Saved', candidates.length === 1 ? 'Transaction saved.' : `${candidates.length} transactions saved.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save transaction.';
      Alert.alert('Save failed', message);
    } finally {
      setIsSaving(false);
    }
  }, [addTransaction, budgets, candidates, defaultAccount, hasInvalidCandidates, loadLocalData, posthog, userId]);

  const renderTypeToggle = (value: Extract<TransactionType, 'income' | 'expense'>, onChange: (type: Extract<TransactionType, 'income' | 'expense'>) => void) => (
    <View style={styles.toggleRow}>
      {(['expense', 'income'] as const).map((type) => (
        <Pressable
          key={type}
          onPress={() => onChange(type)}
          style={[styles.toggleButton, value === type && styles.toggleButtonActive]}
        >
          <Text style={[styles.toggleText, value === type && styles.toggleTextActive]}>
            {type === 'expense' ? 'Expense' : 'Income'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{t('home.addTransaction')}</Text>
          <Text style={styles.subtitle}>Record spending by voice, text, or manual entry.</Text>
        </View>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Fast capture</Text>
          <Input
            label="Text input"
            value={inputText}
            onChangeText={setInputText}
            placeholder="milk 20000, bread 8000, taxi 25000"
            multiline
            containerStyle={styles.inputContainer}
          />
          <View style={styles.actionRow}>
            <Button title="Parse text" onPress={handleParseText} variant="secondary" style={styles.actionButton} />
            <Button
              title={voiceState.isRecording ? 'Listening…' : voiceState.isProcessing ? 'Processing…' : 'Voice'}
              onPress={handleVoiceCapture}
              loading={voiceState.isRecording || voiceState.isProcessing}
              variant="primary"
              style={styles.actionButton}
            />
          </View>
          {voiceState.error && <Text style={styles.warningText}>{voiceState.error}</Text>}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Manual fallback</Text>
          {renderTypeToggle(manualType, setManualType)}
          <Input
            label="Amount"
            value={manualAmount}
            onChangeText={setManualAmount}
            placeholder="25000"
            keyboardType="decimal-pad"
            containerStyle={styles.inputContainer}
          />
          <View style={styles.currencyRow}>
            {currencyOptions.map((code) => (
              <Pressable
                key={code}
                onPress={() => setManualCurrency(code)}
                style={[styles.currencyChip, manualCurrency === code && styles.currencyChipActive]}
              >
                <Text style={[styles.currencyChipText, manualCurrency === code && styles.currencyChipTextActive]}>{code}</Text>
              </Pressable>
            ))}
          </View>
          <Input
            label="Description"
            value={manualDescription}
            onChangeText={setManualDescription}
            placeholder="Taxi, coffee, salary…"
            containerStyle={styles.inputContainer}
          />
          <Button title="Create preview" onPress={handleManualCandidate} variant="outline" />
        </Card>

        {candidates.length > 0 && (
          <View style={styles.candidatesBlock}>
            <View style={styles.candidatesHeader}>
              <View style={styles.candidatesHeaderText}>
                <Text style={styles.sectionTitle}>Review before saving</Text>
                <Text style={styles.reviewSummary}>
                  {reviewCandidateCount > 0
                    ? `${reviewCandidateCount} item${reviewCandidateCount > 1 ? 's' : ''} need review`
                    : 'All items look ready'}
                </Text>
              </View>
              <Text style={styles.counter}>{candidates.length} item{candidates.length > 1 ? 's' : ''}</Text>
            </View>

            {candidates.map((candidate, index) => {
              const category = categories.find((item) => item.id === candidate.categoryId);
              const reviewState = getCandidateReviewState(candidate);

              return (
                <Card key={candidate.id} style={[
                  styles.candidateCard,
                  reviewState.status === 'ready' && styles.candidateCardReady,
                  reviewState.status === 'review' && styles.candidateCardReview,
                  reviewState.status === 'invalid' && styles.candidateCardInvalid,
                ]}>
                  <View style={styles.candidateTopRow}>
                    <View style={styles.candidateTitleGroup}>
                      <Text style={styles.candidateNumber}>#{index + 1}</Text>
                      <View style={[
                        styles.statusPill,
                        reviewState.status === 'ready' && styles.statusPillReady,
                        reviewState.status === 'review' && styles.statusPillReview,
                        reviewState.status === 'invalid' && styles.statusPillInvalid,
                      ]}>
                        <Text style={styles.statusPillText}>{reviewState.label}</Text>
                      </View>
                    </View>
                    <Pressable onPress={() => removeCandidate(candidate.id)} hitSlop={8}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.reviewReason}>{reviewState.reason}</Text>

                  {renderTypeToggle(candidate.type, (type) => {
                    const fallback = getFallbackCategory(type);
                    updateCandidate(candidate.id, {
                      type,
                      categoryId: fallback?.id || candidate.categoryId,
                    });
                  })}

                  <View style={styles.inlineFields}>
                    <TextInput
                      value={candidate.amount}
                      onChangeText={(amount) => updateCandidate(candidate.id, { amount })}
                      keyboardType="decimal-pad"
                      placeholder="Amount"
                      placeholderTextColor={colors.white[40]}
                      style={[styles.inlineInput, styles.amountInput]}
                    />
                    <TextInput
                      value={candidate.currency}
                      onChangeText={(currency) => updateCandidate(candidate.id, { currency: currency.toUpperCase() as Currency })}
                      placeholder="UZS"
                      placeholderTextColor={colors.white[40]}
                      autoCapitalize="characters"
                      style={[styles.inlineInput, styles.currencyInput]}
                    />
                  </View>

                  <TextInput
                    value={candidate.description}
                    onChangeText={(description) => updateCandidate(candidate.id, { description })}
                    placeholder="Description"
                    placeholderTextColor={colors.white[40]}
                    style={styles.fullInput}
                  />

                  <Pressable style={styles.categoryPill} onPress={() => cycleCandidateCategory(candidate)}>
                    <Text style={styles.categoryText}>{displayCategoryName(category)}</Text>
                    <Text style={styles.categoryHint}>tap to change</Text>
                  </Pressable>

                  <View style={styles.metaRow}>
                    <Text style={styles.confidenceText}>Source: {candidate.source}</Text>
                    <Text style={styles.confidenceText}>Confidence: {Math.round(candidate.confidence * 100)}%</Text>
                  </View>
                </Card>
              );
            })}

            <View style={styles.saveRow}>
              <Button title="Discard" onPress={() => setCandidates([])} variant="ghost" style={styles.saveButton} />
              <Button
                title="Save all"
                onPress={saveCandidates}
                loading={isSaving}
                disabled={!defaultAccount || candidates.length === 0 || hasInvalidCandidates}
                style={styles.saveButton}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 60,
    paddingBottom: 140,
    gap: spacing.base,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    ...typography.heading3,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyLargeMedium,
    color: colors.text,
  },
  inputContainer: {
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  warningText: {
    ...typography.caption,
    color: colors.warning[400],
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[900],
    borderRadius: borderRadius.lg,
    padding: 4,
    gap: 4,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  toggleButtonActive: {
    backgroundColor: colors.white[100],
  },
  toggleText: {
    ...typography.smallMedium,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.background,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  currencyChip: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral[900],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyChipActive: {
    backgroundColor: colors.success[700],
  },
  currencyChipText: {
    ...typography.captionMedium,
    color: colors.textTertiary,
  },
  currencyChipTextActive: {
    color: colors.white[100],
  },
  candidatesBlock: {
    gap: spacing.md,
  },
  candidatesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  candidatesHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  reviewSummary: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  counter: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  candidateCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  candidateCardReady: {
    borderColor: colors.success[900],
  },
  candidateCardReview: {
    borderColor: colors.warning[700],
  },
  candidateCardInvalid: {
    borderColor: colors.error[600],
  },
  candidateTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  candidateTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  candidateNumber: {
    ...typography.smallMedium,
    color: colors.textSecondary,
  },
  statusPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillReady: {
    backgroundColor: colors.success[900],
  },
  statusPillReview: {
    backgroundColor: colors.warning[900],
  },
  statusPillInvalid: {
    backgroundColor: colors.error[900],
  },
  statusPillText: {
    ...typography.captionMedium,
    color: colors.white[100],
  },
  reviewReason: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  removeText: {
    ...typography.smallMedium,
    color: colors.error[400],
  },
  inlineFields: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.neutral[900],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  amountInput: {
    flex: 1,
  },
  currencyInput: {
    width: 84,
    textAlign: 'center',
  },
  fullInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.neutral[900],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  categoryPill: {
    borderWidth: 1,
    borderColor: colors.white[20],
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryText: {
    ...typography.smallMedium,
    color: colors.text,
  },
  categoryHint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  confidenceText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  saveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveButton: {
    flex: 1,
  },
});
