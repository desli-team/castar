import { getOtherCategory } from '../../../shared/services/categories/categoryPolicy';
import type { Account, Category, Currency, Transaction, TransactionType, VoiceParseResult } from '../../../shared/types';
import type { IntentTransactionDraft } from '../../../shared/services/intent/intentResolver';

export type CandidateSource = 'text' | 'voice' | 'manual' | 'ai';
export type CandidateType = Extract<TransactionType, 'income' | 'expense'>;

export interface TransactionCandidate {
  id: string;
  type: CandidateType;
  amount: string;
  currency: Currency;
  categoryId: string;
  description: string;
  date: number;
  source: CandidateSource;
  confidence: number;
  rawText?: string;
}

export interface CategoryResolverOptions {
  categories: Category[];
  displayCategoryName: (category?: Category) => string;
}

export type CandidateReviewStatus = 'ready' | 'review' | 'invalid';

export interface CandidateReviewState {
  status: CandidateReviewStatus;
  label: string;
  reason: string;
}

export const generateUUID = (): string => {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
    else if (i === 14) uuid += '4';
    else if (i === 19) uuid += hex[(Math.random() * 4 | 0) + 8];
    else uuid += hex[Math.random() * 16 | 0];
  }
  return uuid;
};

const normalize = (value: string): string => value.toLowerCase().trim();

export function getCategoriesByType(categories: Category[], type: CandidateType): Category[] {
  return categories.filter((category) => category.type === type);
}

export function getFallbackCategory(
  type: CandidateType,
  { categories, displayCategoryName }: CategoryResolverOptions,
): Category | undefined {
  const list = getCategoriesByType(categories, type);
  return (
    getOtherCategory(type, categories) ||
    list.find((category) => /other/i.test(displayCategoryName(category))) ||
    list[0]
  );
}

export function resolveCategory(
  type: CandidateType,
  hint: string | undefined,
  options: CategoryResolverOptions,
): Category | undefined {
  const list = getCategoriesByType(options.categories, type);
  const cleanHint = normalize(hint || '');

  if (cleanHint) {
    const direct = list.find((category) => {
      const label = normalize(options.displayCategoryName(category));
      const key = normalize(category.name.replace('categories.', '').replace(/_/g, ' '));
      return cleanHint.includes(label) || label.includes(cleanHint) || cleanHint.includes(key) || key.includes(cleanHint);
    });
    if (direct) return direct;

    const keywordMap: Record<string, string[]> = {
      food: ['food', 'coffee', 'lunch', 'dinner', 'milk', 'bread', 'chicken', 'еда', 'кофе', 'обед', 'ovqat', 'non'],
      transport: ['taxi', 'bus', 'metro', 'transport', 'такси', 'автобус', 'транспорт'],
      salary: ['salary', 'paid', 'зарплата', 'oylik', 'маош'],
      freelance: ['freelance', 'фриланс'],
    };

    for (const [key, words] of Object.entries(keywordMap)) {
      if (words.some((word) => cleanHint.includes(word))) {
        const matched = list.find((category) => normalize(category.name).includes(key));
        if (matched) return matched;
      }
    }
  }

  return getFallbackCategory(type, options);
}

export function candidateFromParse(
  result: VoiceParseResult,
  source: CandidateSource,
  defaultCurrency: Currency,
  options: CategoryResolverOptions,
): TransactionCandidate | null {
  const type: CandidateType = result.type === 'income' ? 'income' : 'expense';
  const category = resolveCategory(type, result.categoryHint || result.description, options);

  if (!category || result.amount === undefined) {
    return null;
  }

  return {
    id: generateUUID(),
    type,
    amount: String(result.amount),
    currency: (result.currency || defaultCurrency) as Currency,
    categoryId: category.id,
    description: result.description || result.categoryHint || 'Other',
    date: Date.now(),
    source,
    confidence: Math.min(result.confidence, 1),
    rawText: result.rawText,
  };
}

export function candidateFromIntentDraft(
  draft: IntentTransactionDraft,
  source: Exclude<CandidateSource, 'manual'>,
  defaultCurrency: Currency,
  options: CategoryResolverOptions,
  confidence: number,
  rawText?: string,
): TransactionCandidate | null {
  const type: CandidateType = draft.type === 'income' ? 'income' : 'expense';
  const category = draft.categoryId
    ? options.categories.find((item) => item.id === draft.categoryId)
    : resolveCategory(type, draft.categoryName || draft.description, options);

  if (!category || draft.amount === undefined) {
    return null;
  }

  return {
    id: generateUUID(),
    type,
    amount: String(draft.amount),
    currency: (draft.currency || defaultCurrency) as Currency,
    categoryId: category.id,
    description: draft.description || draft.categoryName || 'Other',
    date: draft.date || Date.now(),
    source,
    confidence: Math.min(confidence, 1),
    rawText,
  };
}

export function manualCandidate(
  type: CandidateType,
  amount: number,
  description: string,
  defaultCurrency: Currency,
  options: CategoryResolverOptions,
): TransactionCandidate | null {
  const category = getFallbackCategory(type, options);
  if (!category) return null;

  return {
    id: generateUUID(),
    type,
    amount: String(amount),
    currency: defaultCurrency,
    categoryId: category.id,
    description: description.trim() || 'Other',
    date: Date.now(),
    source: 'manual',
    confidence: 1,
  };
}

export function parseCandidateAmount(candidate: TransactionCandidate): number {
  return Number(candidate.amount.replace(',', '.'));
}

export function getCandidateReviewState(candidate: TransactionCandidate): CandidateReviewState {
  const amount = parseCandidateAmount(candidate);

  if (!amount || amount <= 0) {
    return {
      status: 'invalid',
      label: 'Fix amount',
      reason: 'Amount is required before saving.',
    };
  }

  if (!candidate.categoryId) {
    return {
      status: 'invalid',
      label: 'Pick category',
      reason: 'Category is required before saving.',
    };
  }

  if (candidate.confidence < 0.7 || candidate.description.trim().toLowerCase() === 'other') {
    return {
      status: 'review',
      label: 'Review',
      reason: 'AI confidence is low or description is generic.',
    };
  }

  return {
    status: 'ready',
    label: 'Ready',
    reason: 'Looks good to save.',
  };
}

export function candidateToTransaction(
  candidate: TransactionCandidate,
  userId: string,
  account: Account,
  now = Date.now(),
): Transaction {
  const amount = parseCandidateAmount(candidate);

  return {
    id: generateUUID(),
    userId,
    accountId: account.id,
    categoryId: candidate.categoryId,
    type: candidate.type,
    amount,
    currency: candidate.currency,
    description: candidate.description.trim() || 'Other',
    date: candidate.date,
    isRecurring: false,
    voiceInput: candidate.source === 'voice',
    createdAt: now,
    updatedAt: now,
  };
}
