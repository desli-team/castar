import { apiClient } from '../api/apiClient';
import type { Account, Category, Currency, Debt, TransactionType } from '../../types';

export type IntentSource = 'text' | 'voice' | 'manual';
export type ResolvedIntentKind =
  | 'transaction'
  | 'debt_create'
  | 'debt_repayment'
  | 'budget_create'
  | 'recurring_create'
  | 'dashboard_query'
  | 'unknown';

export interface IntentCategoryContext {
  id: string;
  name: string;
  type: TransactionType;
  icon?: string;
  color?: string;
}

export interface IntentAccountContext {
  id: string;
  name: string;
  type?: string;
  currency?: string;
}

export interface IntentDebtContext {
  id: string;
  personName: string;
  direction: 'i_owe' | 'owes_me';
  remainingAmount?: number;
  currency?: Currency;
  status?: string;
}

export interface IntentTransactionDraft {
  type: Extract<TransactionType, 'income' | 'expense'>;
  amount?: number;
  currency?: Currency;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  date?: number;
}

export interface IntentDebtDraft {
  direction: 'i_owe' | 'owes_me';
  personName?: string;
  amount?: number;
  currency?: Currency;
  note?: string;
}

export interface IntentRepaymentDraft extends IntentDebtDraft {
  debtId?: string;
}

export interface IntentDraft {
  kind: ResolvedIntentKind;
  confidence: number;
  missingFields: string[];
  nextQuestion?: string | null;
  transaction?: IntentTransactionDraft;
  debt?: IntentDebtDraft;
  repayment?: IntentRepaymentDraft;
}

export interface IntentResolution {
  intent: ResolvedIntentKind;
  confidence: number;
  drafts: IntentDraft[];
  missingFields: string[];
  nextQuestion?: string | null;
  provider: string;
  model?: string | null;
}

export interface ResolveIntentParams {
  text: string;
  source: IntentSource;
  uiLanguage: string;
  defaultCurrency: Currency;
  categories: Category[];
  accounts?: Account[];
  activeDebts?: Debt[];
  displayCategoryName?: (category: Category) => string;
}

function toCategoryContext(category: Category, displayCategoryName?: (category: Category) => string): IntentCategoryContext {
  return {
    id: category.id,
    name: displayCategoryName?.(category) ?? category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
  };
}

function toAccountContext(account: Account): IntentAccountContext {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
  };
}

function toDebtContext(debt: Debt): IntentDebtContext {
  return {
    id: debt.id,
    personName: debt.personName,
    direction: debt.direction,
    remainingAmount: debt.remainingAmount,
    currency: debt.currency,
    status: debt.status,
  };
}

export async function resolveIntent(params: ResolveIntentParams): Promise<IntentResolution> {
  return apiClient.post<IntentResolution>('/intent/resolve', {
    text: params.text,
    source: params.source,
    uiLanguage: params.uiLanguage,
    defaultCurrency: params.defaultCurrency,
    categories: params.categories.map((category) => toCategoryContext(category, params.displayCategoryName)),
    accounts: (params.accounts ?? []).map(toAccountContext),
    activeDebts: (params.activeDebts ?? []).filter((debt) => debt.status === 'active').map(toDebtContext),
    currentDate: new Date().toISOString(),
  });
}
