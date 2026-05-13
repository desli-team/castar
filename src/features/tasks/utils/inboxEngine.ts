import { buildBudgetAllocationSummary } from '../../budget/utils/budgetAllocation';
import { getBudgetProgress } from '../../budget/utils/budgetProgress';
import { getOtherCategory } from '../../../shared/services/categories/categoryPolicy';
import type { Budget, Category, Currency, Debt, RecurringTransaction, Transaction } from '../../../shared/types';

export type InboxItemType =
  | 'transaction_review'
  | 'category_suggestion'
  | 'duplicate_transaction'
  | 'unusual_spend'
  | 'budget_alert'
  | 'allocation_warning'
  | 'recurring_review'
  | 'debt_review';

export type InboxSeverity = 'info' | 'warning' | 'critical';
export type InboxSection = 'Needs review' | 'Budget' | 'Automation';

export interface InboxItem {
  id: string;
  type: InboxItemType;
  section: InboxSection;
  severity: InboxSeverity;
  title: string;
  description: string;
  actionLabel: string;
  entityType?: 'transaction' | 'budget' | 'recurring' | 'debt';
  entityId?: string;
  score: number;
  createdAt: number;
}

interface BuildInboxParams {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  recurrings: RecurringTransaction[];
  debts: Debt[];
  currency: Currency;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function categoryName(categoryId: string | undefined, categories: Category[]): string {
  return categories.find((category) => category.id === categoryId)?.name ?? 'category';
}

function pushUnique(items: InboxItem[], item: InboxItem) {
  if (!items.some((existing) => existing.id === item.id)) items.push(item);
}

function transactionReviewItems(transactions: Transaction[], categories: Category[], now: number): InboxItem[] {
  const items: InboxItem[] = [];
  const otherExpense = getOtherCategory('expense', categories);
  const otherIncome = getOtherCategory('income', categories);

  for (const tx of transactions.slice(0, 500)) {
    if (tx.reviewed === false) {
      pushUnique(items, {
        id: `tx-review:${tx.id}`,
        type: 'transaction_review',
        section: 'Needs review',
        severity: 'warning',
        title: 'Transaction needs review',
        description: tx.description ? `${tx.description} is saved but not confirmed yet.` : 'A saved transaction is not confirmed yet.',
        actionLabel: 'Review transaction',
        entityType: 'transaction',
        entityId: tx.id,
        score: 95,
        createdAt: tx.updatedAt ?? now,
      });
      continue;
    }

    const isOther = tx.categoryId === otherExpense?.id || tx.categoryId === otherIncome?.id;
    if (isOther && tx.reviewed !== true) {
      pushUnique(items, {
        id: `category-suggestion:${tx.id}`,
        type: 'category_suggestion',
        section: 'Needs review',
        severity: 'info',
        title: 'Check category suggestion',
        description: tx.description ? `${tx.description} was placed in Other. Confirm it or choose a better category.` : 'A transaction was placed in Other.',
        actionLabel: 'Open transaction',
        entityType: 'transaction',
        entityId: tx.id,
        score: 72,
        createdAt: tx.updatedAt ?? now,
      });
    }
  }

  return items;
}

function duplicateItems(transactions: Transaction[], now: number): InboxItem[] {
  const buckets = new Map<string, Transaction[]>();
  for (const tx of transactions.slice(0, 1000)) {
    const key = `${dayKey(tx.date)}:${tx.accountId}:${tx.categoryId}:${tx.type}:${tx.currency}:${Math.round(tx.amount)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), tx]);
  }

  return [...buckets.values()]
    .filter((group) => group.length > 1)
    .slice(0, 5)
    .map((group) => {
      const newest = [...group].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return {
        id: `duplicate:${newest.id}`,
        type: 'duplicate_transaction' as const,
        section: 'Needs review' as const,
        severity: 'warning' as const,
        title: 'Possible duplicate transaction',
        description: `${group.length} transactions have the same amount, category, account, and day.`,
        actionLabel: 'Compare items',
        entityType: 'transaction' as const,
        entityId: newest.id,
        score: 88,
        createdAt: newest.updatedAt ?? now,
      };
    });
}

function unusualSpendItems(transactions: Transaction[], categories: Category[], now: number): InboxItem[] {
  const byCategory = new Map<string, Transaction[]>();
  const recentCutoff = now - 14 * DAY_MS;
  for (const tx of transactions.filter((item) => item.type === 'expense' && item.amount > 0)) {
    byCategory.set(tx.categoryId, [...(byCategory.get(tx.categoryId) ?? []), tx]);
  }

  const items: InboxItem[] = [];
  for (const [categoryId, list] of byCategory) {
    if (list.length < 5) continue;
    const baseline = median(list.map((tx) => tx.amount));
    if (baseline <= 0) continue;
    const candidate = list
      .filter((tx) => tx.date >= recentCutoff)
      .sort((a, b) => b.amount - a.amount)[0];
    if (!candidate || candidate.amount < baseline * 2.5) continue;

    items.push({
      id: `unusual:${candidate.id}`,
      type: 'unusual_spend',
      section: 'Needs review',
      severity: 'info',
      title: 'Unusual spending pattern',
      description: `${categoryName(categoryId, categories)} is much higher than its usual transaction amount.`,
      actionLabel: 'Check transaction',
      entityType: 'transaction',
      entityId: candidate.id,
      score: 66,
      createdAt: candidate.updatedAt ?? now,
    });
  }
  return items.slice(0, 4);
}

function budgetItems(budgets: Budget[], transactions: Transaction[], currency: Currency, now: number): InboxItem[] {
  const items: InboxItem[] = [];
  const activeBudgets = budgets.filter((budget) => budget.isActive);

  for (const budget of activeBudgets) {
    const progress = getBudgetProgress(budget, transactions, now);
    if (progress.health === 'safe') continue;
    items.push({
      id: `budget:${budget.id}:${progress.health}`,
      type: 'budget_alert',
      section: 'Budget',
      severity: progress.health === 'over' || progress.health === 'critical' ? 'critical' : 'warning',
      title: progress.health === 'over' ? 'Budget exceeded' : 'Budget needs attention',
      description: `${budget.name} is at ${Math.round(progress.percentage)}% for this period.`,
      actionLabel: 'Open budget',
      entityType: 'budget',
      entityId: budget.id,
      score: progress.health === 'over' ? 96 : progress.health === 'critical' ? 90 : 76,
      createdAt: budget.updatedAt ?? now,
    });
  }

  const allocation = buildBudgetAllocationSummary(activeBudgets, currency);
  if (allocation.health === 'exceeded' && allocation.totalBudget) {
    items.push({
      id: `allocation:${allocation.totalBudget.id}`,
      type: 'allocation_warning',
      section: 'Budget',
      severity: 'warning',
      title: 'Category limits exceed total budget',
      description: `Category allocations are ${allocation.allocatedPercent}% of the total budget.`,
      actionLabel: 'Review budget',
      entityType: 'budget',
      entityId: allocation.totalBudget.id,
      score: 82,
      createdAt: allocation.totalBudget.updatedAt ?? now,
    });
  }

  return items;
}

function automationItems(recurrings: RecurringTransaction[], debts: Debt[], now: number): InboxItem[] {
  const items: InboxItem[] = [];
  for (const recurring of recurrings.filter((item) => item.isActive)) {
    const daysUntil = Math.ceil((recurring.nextDate - now) / DAY_MS);
    if (daysUntil > 3) continue;
    items.push({
      id: `recurring:${recurring.id}`,
      type: 'recurring_review',
      section: 'Automation',
      severity: daysUntil < 0 ? 'warning' : 'info',
      title: daysUntil < 0 ? 'Recurring item is overdue' : 'Recurring item is coming up',
      description: `${recurring.description || 'Recurring transaction'} ${daysUntil < 0 ? 'was expected' : 'is expected'} ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ${daysUntil < 0 ? 'ago' : 'from now'}.`,
      actionLabel: 'Open recurring',
      entityType: 'recurring',
      entityId: recurring.id,
      score: daysUntil < 0 ? 74 : 48,
      createdAt: recurring.updatedAt ?? now,
    });
  }

  for (const debt of debts.filter((item) => item.status === 'active' && item.dueDate)) {
    const daysUntil = Math.ceil(((debt.dueDate ?? now) - now) / DAY_MS);
    if (daysUntil > 7) continue;
    items.push({
      id: `debt:${debt.id}`,
      type: 'debt_review',
      section: 'Automation',
      severity: daysUntil < 0 ? 'critical' : 'warning',
      title: daysUntil < 0 ? 'Debt repayment is overdue' : 'Debt repayment is due soon',
      description: `${debt.personName} · ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ${daysUntil < 0 ? 'overdue' : 'left'}.`,
      actionLabel: 'Open debt',
      entityType: 'debt',
      entityId: debt.id,
      score: daysUntil < 0 ? 92 : 70,
      createdAt: debt.updatedAt ?? now,
    });
  }

  return items;
}

export function buildInboxItems(params: BuildInboxParams): InboxItem[] {
  const now = params.now ?? Date.now();
  return [
    ...transactionReviewItems(params.transactions, params.categories, now),
    ...duplicateItems(params.transactions, now),
    ...unusualSpendItems(params.transactions, params.categories, now),
    ...budgetItems(params.budgets, params.transactions, params.currency, now),
    ...automationItems(params.recurrings, params.debts, now),
  ]
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, 30);
}

export function summarizeInbox(items: InboxItem[]) {
  const critical = items.filter((item) => item.severity === 'critical').length;
  const warning = items.filter((item) => item.severity === 'warning').length;
  return {
    total: items.length,
    critical,
    warning,
    topItem: items[0],
  };
}
