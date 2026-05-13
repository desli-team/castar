import type { Budget, BudgetPeriod, Currency } from '../../../shared/types';

const PERIOD_DAYS: Record<BudgetPeriod, number> = {
  daily: 1,
  weekly: 7,
  fourteen_days: 14,
  monthly: 30,
  yearly: 365,
};

export type BudgetAllocationHealth = 'safe' | 'near' | 'exceeded' | 'none';

export interface BudgetAllocationSummary {
  totalBudget?: Budget;
  totalMonthly: number;
  categoryMonthly: number;
  remainingMonthly: number;
  allocatedPercent: number;
  health: BudgetAllocationHealth;
}

export function monthlyEquivalent(amount: number, period: BudgetPeriod): number {
  return amount * (30 / PERIOD_DAYS[period]);
}

export function buildBudgetAllocationSummary(
  budgets: Budget[],
  currency: Currency,
  pendingBudget?: Budget,
): BudgetAllocationSummary {
  const activeBudgets = budgets
    .filter((budget) => budget.isActive && budget.currency === currency)
    .filter((budget) => budget.id !== pendingBudget?.id);

  if (pendingBudget?.isActive && pendingBudget.currency === currency) {
    activeBudgets.push(pendingBudget);
  }

  const totalBudget = activeBudgets
    .filter((budget) => !budget.categoryId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const totalMonthly = totalBudget ? monthlyEquivalent(totalBudget.amount, totalBudget.period) : 0;
  const categoryMonthly = activeBudgets
    .filter((budget) => budget.categoryId)
    .reduce((sum, budget) => sum + monthlyEquivalent(budget.amount, budget.period), 0);
  const allocatedPercent = totalMonthly > 0 ? Math.round((categoryMonthly / totalMonthly) * 100) : 0;
  const remainingMonthly = totalMonthly - categoryMonthly;

  const health: BudgetAllocationHealth = totalMonthly <= 0
    ? 'none'
    : allocatedPercent > 100
      ? 'exceeded'
      : allocatedPercent >= 90
        ? 'near'
        : 'safe';

  return {
    totalBudget,
    totalMonthly,
    categoryMonthly,
    remainingMonthly,
    allocatedPercent,
    health,
  };
}
