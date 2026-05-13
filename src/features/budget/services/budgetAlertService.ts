import type { Budget, Transaction } from '../../../shared/types';
import * as budgetAlertQueries from '../../../shared/services/database/budgetAlertQueries';
import { getBudgetProgress } from '../utils/budgetProgress';

export interface BudgetAlertEvaluationResult {
  created: budgetAlertQueries.BudgetAlert[];
}

export function evaluateBudgetAlerts(
  userId: string,
  budgets: Budget[],
  transactions: Transaction[],
): BudgetAlertEvaluationResult {
  const created: budgetAlertQueries.BudgetAlert[] = [];

  for (const budget of budgets) {
    if (!budget.isActive) continue;
    const progress = getBudgetProgress(budget, transactions);
    if (progress.health === 'safe') continue;

    const alert = budgetAlertQueries.insertIfMissing({
      userId,
      budgetId: budget.id,
      level: progress.health === 'warning' ? 'warning' : progress.health === 'critical' ? 'critical' : 'over',
      periodStart: progress.periodStart,
      spent: progress.spent,
      limitAmount: progress.effectiveAmount,
      percentage: progress.percentage,
      createdAt: Date.now(),
    });

    if (alert) created.push(alert);
  }

  return { created };
}
