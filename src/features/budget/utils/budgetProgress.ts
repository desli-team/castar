import type { Budget, Transaction } from '../../../shared/types';

export type BudgetHealth = 'safe' | 'warning' | 'critical' | 'over';

export interface BudgetProgress {
  periodStart: number;
  periodEnd: number;
  spent: number;
  baseAmount: number;
  rolloverAmount: number;
  effectiveAmount: number;
  remaining: number;
  percentage: number;
  warningThreshold: number;
  criticalThreshold: number;
  health: BudgetHealth;
  statusLabel: string;
  helperText: string;
  relatedTransactions: Transaction[];
}

function getPeriodLength(period: Budget['period'], periodStart: number): number {
  const end = new Date(periodStart);
  if (period === 'daily') end.setDate(end.getDate() + 1);
  if (period === 'weekly') end.setDate(end.getDate() + 7);
  if (period === 'fourteen_days') end.setDate(end.getDate() + 14);
  if (period === 'monthly') end.setMonth(end.getMonth() + 1);
  if (period === 'yearly') end.setFullYear(end.getFullYear() + 1);
  return Math.max(1, end.getTime() - periodStart);
}

function countElapsedPeriods(period: Budget['period'], startDate: number, currentPeriodStart: number): number {
  if (startDate >= currentPeriodStart) return 0;
  if (period === 'monthly' || period === 'yearly') {
    let count = 0;
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() < currentPeriodStart && count < 240) {
      if (period === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setFullYear(cursor.getFullYear() + 1);
      count += 1;
    }
    return Math.max(0, count);
  }
  const length = getPeriodLength(period, currentPeriodStart);
  return Math.floor((currentPeriodStart - startDate) / length);
}

export function getPeriodWindow(period: Budget['period'], startDate: number, nowMs = Date.now()) {
  const start = new Date(nowMs);
  const end = new Date(nowMs);

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  if (period === 'weekly') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  }

  if (period === 'fourteen_days') {
    const anchor = new Date(startDate);
    anchor.setHours(0, 0, 0, 0);
    const periodLengthMs = 14 * 24 * 60 * 60 * 1000;
    const elapsed = Math.max(0, Math.floor((nowMs - anchor.getTime()) / periodLengthMs));
    start.setTime(anchor.getTime() + elapsed * periodLengthMs);
    end.setTime(start.getTime() + periodLengthMs - 1);
  }

  if (period === 'monthly') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }

  if (period === 'yearly') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }

  return {
    periodStart: Math.max(start.getTime(), startDate),
    periodEnd: end.getTime(),
  };
}

function amountInBudgetCurrency(tx: Transaction, budget: Budget): number {
  if (tx.currency === budget.currency) return tx.amount;
  return tx.amountInDefault ?? 0;
}

export function getBudgetProgress(budget: Budget, transactions: Transaction[], nowMs = Date.now()): BudgetProgress {
  const { periodStart, periodEnd } = getPeriodWindow(budget.period, budget.startDate, nowMs);
  const relatedTransactions = transactions
    .filter((tx) => tx.type === 'expense')
    .filter((tx) => tx.date >= periodStart && tx.date <= periodEnd)
    .filter((tx) => !budget.categoryId || tx.categoryId === budget.categoryId)
    .filter((tx) => tx.currency === budget.currency || tx.amountInDefault !== undefined)
    .sort((a, b) => b.date - a.date);

  const previousTransactions = transactions
    .filter((tx) => tx.type === 'expense')
    .filter((tx) => tx.date >= budget.startDate && tx.date < periodStart)
    .filter((tx) => !budget.categoryId || tx.categoryId === budget.categoryId)
    .filter((tx) => tx.currency === budget.currency || tx.amountInDefault !== undefined);
  const previousSpent = previousTransactions.reduce((sum, tx) => sum + amountInBudgetCurrency(tx, budget), 0);
  const elapsedPeriods = countElapsedPeriods(budget.period, budget.startDate, periodStart);
  const rolloverAmount = budget.rolloverEnabled ? (elapsedPeriods * budget.amount) - previousSpent : 0;
  const effectiveAmount = Math.max(0, budget.amount + rolloverAmount);
  const spent = relatedTransactions.reduce((sum, tx) => sum + amountInBudgetCurrency(tx, budget), 0);
  const remaining = effectiveAmount - spent;
  const rawPercentage = effectiveAmount > 0 ? (spent / effectiveAmount) * 100 : 0;
  const percentage = Math.min(100, Math.round(rawPercentage));
  const warningThreshold = budget.warningThreshold ?? 80;
  const criticalThreshold = budget.criticalThreshold ?? 100;

  let health: BudgetHealth = 'safe';
  if (remaining < 0) health = 'over';
  else if (rawPercentage >= criticalThreshold) health = 'critical';
  else if (rawPercentage >= warningThreshold) health = 'warning';

  const statusLabel = health === 'safe'
    ? 'Safe'
    : health === 'warning'
      ? 'Warning'
      : health === 'critical'
        ? budget.isHardLimit ? 'Limit reached' : 'Critical'
        : 'Over limit';

  const helperText = health === 'safe'
    ? `${Math.max(0, Math.round(warningThreshold - rawPercentage))}% until warning threshold`
    : health === 'warning'
      ? `Approaching ${criticalThreshold}% limit`
      : health === 'critical'
        ? budget.isHardLimit ? 'Hard limit reached for this period' : 'Very close to the limit'
        : 'Budget exceeded for this period';

  return {
    periodStart,
    periodEnd,
    spent,
    baseAmount: budget.amount,
    rolloverAmount,
    effectiveAmount,
    remaining,
    percentage,
    warningThreshold,
    criticalThreshold,
    health,
    statusLabel,
    helperText,
    relatedTransactions,
  };
}
