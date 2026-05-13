import type { Account, Budget, Category, Debt, RecurringTransaction, Transaction } from '../../types';

export type AnalyticsPeriod = '1D' | '7D' | '14D' | '30D' | 'MTD';
export type InsightSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  icon?: string;
  color?: string;
  amount: number;
  previousAmount: number;
  absoluteDelta: number;
  deltaPercent: number | null;
  sharePercent: number;
  previousSharePercent: number;
  shareDeltaPercent: number;
  transactionCount: number;
  transactions: Transaction[];
}

export interface CashflowBucket {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface CashflowReport {
  income: number;
  expense: number;
  net: number;
  previousIncome: number;
  previousExpense: number;
  previousNet: number;
  incomeDeltaPercent: number | null;
  expenseDeltaPercent: number | null;
  netDeltaPercent: number | null;
  savingsRatePercent: number | null;
  averageDailyExpense: number;
  projectedPeriodExpense: number;
  monthlyBuckets: CashflowBucket[];
}

export interface BudgetForecastItem {
  budgetId: string;
  name: string;
  currency: string;
  amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  dailySafeToSpend: number;
  projectedSpend: number;
  projectedOverBy: number;
  projectedOverOn?: number;
  burnRatePercent: number;
  risk: 'safe' | 'watch' | 'over';
}

export interface RecurringCandidate {
  key: string;
  title: string;
  amount: number;
  baselineAmount: number;
  amountChangePercent: number;
  amountVolatilityPercent: number;
  currency: string;
  categoryId?: string;
  lastDate: number;
  cadenceDays: number;
  cadenceConsistency: number;
  expectedNextDate: number;
  confidence: number;
  amountChanged: boolean;
}

export interface RecurringSummary {
  upcoming: RecurringTransaction[];
  likely: RecurringCandidate[];
}

export interface NetWorthSnapshot {
  byCurrency: Array<{ currency: string; assets: number; iOwe: number; owedToMe: number; net: number }>;
}

export interface ReviewSummary {
  unreviewedCount: number;
  needsCategoryCount: number;
  possibleDuplicateCount: number;
}

export interface InsightCard {
  id: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  target?: 'transactions' | 'review' | 'budgets' | 'recurrings' | 'debts' | 'categories';
}

export interface AnalyticsProReport {
  period: AnalyticsPeriod;
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
  cashflow: CashflowReport;
  categoryBreakdown: CategoryBreakdownItem[];
  budgetForecasts: BudgetForecastItem[];
  recurring: RecurringSummary;
  netWorth: NetWorthSnapshot;
  review: ReviewSummary;
  insights: InsightCard[];
}

interface BuildAnalyticsProParams {
  period: AnalyticsPeriod;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  accounts: Account[];
  debts: Debt[];
  recurrings: RecurringTransaction[];
  nowMs?: number;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDayMs(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfMonthMs(value: number): number {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function periodWindow(period: AnalyticsPeriod, nowMs: number) {
  const end = nowMs;
  const today = startOfDayMs(nowMs);
  const start = period === 'MTD'
    ? startOfMonthMs(nowMs)
    : today - (Number(period.replace('D', '')) - 1) * DAY;
  const length = Math.max(DAY, end - start + 1);
  return {
    currentStart: start,
    currentEnd: end,
    previousStart: start - length,
    previousEnd: start - 1,
    periodLengthDays: Math.max(1, Math.ceil(length / DAY)),
  };
}

function inRange(transaction: Transaction, from: number, to: number): boolean {
  return transaction.date >= from && transaction.date <= to;
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function roundPercent(value: number): number {
  return Math.round(value * 1000) / 10;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((sum, item) => sum + item, 0) / values.length;
  const variance = values.reduce((sum, item) => sum + ((item - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sumByType(transactions: Transaction[], type: Transaction['type']): number {
  return transactions.filter((item) => item.type === type).reduce((sum, item) => sum + item.amount, 0);
}

function displayCategoryName(category: Category | undefined): string {
  if (!category) return 'Other';
  return category.name.startsWith('categories.') ? category.name.replace('categories.', '') : category.name;
}

function monthKey(value: number): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthlyBuckets(transactions: Transaction[], nowMs: number): CashflowBucket[] {
  const start = startOfMonthMs(nowMs) - 5 * 31 * DAY;
  const buckets = new Map<string, CashflowBucket>();

  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(nowMs);
    date.setMonth(date.getMonth() - index, 1);
    const key = monthKey(date.getTime());
    buckets.set(key, { month: key, income: 0, expense: 0, net: 0 });
  }

  transactions.filter((item) => item.date >= start && item.date <= nowMs).forEach((transaction) => {
    const key = monthKey(transaction.date);
    const bucket = buckets.get(key);
    if (!bucket) return;
    if (transaction.type === 'income') bucket.income += transaction.amount;
    if (transaction.type === 'expense') bucket.expense += transaction.amount;
    bucket.net = bucket.income - bucket.expense;
  });

  return [...buckets.values()];
}

function buildCashflow(current: Transaction[], previous: Transaction[], allTransactions: Transaction[], periodLengthDays: number, nowMs: number): CashflowReport {
  const income = sumByType(current, 'income');
  const expense = sumByType(current, 'expense');
  const previousIncome = sumByType(previous, 'income');
  const previousExpense = sumByType(previous, 'expense');
  const net = income - expense;
  const previousNet = previousIncome - previousExpense;
  const averageDailyExpense = expense / periodLengthDays;

  return {
    income,
    expense,
    net,
    previousIncome,
    previousExpense,
    previousNet,
    incomeDeltaPercent: percentDelta(income, previousIncome),
    expenseDeltaPercent: percentDelta(expense, previousExpense),
    netDeltaPercent: percentDelta(net, previousNet),
    savingsRatePercent: income > 0 ? roundPercent(net / income) : null,
    averageDailyExpense,
    projectedPeriodExpense: averageDailyExpense * periodLengthDays,
    monthlyBuckets: buildMonthlyBuckets(allTransactions, nowMs),
  };
}

function buildCategoryBreakdown(
  current: Transaction[],
  previous: Transaction[],
  categories: Category[],
): CategoryBreakdownItem[] {
  const currentExpenseTotal = sumByType(current, 'expense');
  const previousExpenseTotal = sumByType(previous, 'expense');
  const byCategory = new Map<string, Transaction[]>();
  current.filter((item) => item.type === 'expense').forEach((transaction) => {
    const key = transaction.categoryId || 'uncategorized';
    byCategory.set(key, [...(byCategory.get(key) ?? []), transaction]);
  });

  return [...byCategory.entries()]
    .map(([categoryId, transactions]) => {
      const previousAmount = previous
        .filter((item) => item.type === 'expense' && (item.categoryId || 'uncategorized') === categoryId)
        .reduce((sum, item) => sum + item.amount, 0);
      const category = categories.find((item) => item.id === categoryId);
      const amount = transactions.reduce((sum, item) => sum + item.amount, 0);
      return {
        categoryId,
        categoryName: displayCategoryName(category),
        icon: category?.icon,
        color: category?.color,
        amount,
        previousAmount,
        absoluteDelta: amount - previousAmount,
        deltaPercent: percentDelta(amount, previousAmount),
        sharePercent: percentOf(amount, currentExpenseTotal),
        previousSharePercent: percentOf(previousAmount, previousExpenseTotal),
        shareDeltaPercent: percentOf(amount, currentExpenseTotal) - percentOf(previousAmount, previousExpenseTotal),
        transactionCount: transactions.length,
        transactions: [...transactions].sort((a, b) => b.date - a.date),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function buildBudgetForecasts(budgets: Budget[], transactions: Transaction[], nowMs: number): BudgetForecastItem[] {
  return budgets.filter((budget) => budget.isActive).map((budget) => {
    const start = budget.startDate;
    const elapsedDays = Math.max(1, Math.ceil((nowMs - start + 1) / DAY));
    const periodDays = budget.period === 'daily' ? 1
      : budget.period === 'weekly' ? 7
        : budget.period === 'fourteen_days' ? 14
          : budget.period === 'yearly' ? 365
            : 30;
    const periodEnd = start + periodDays * DAY;
    const remainingDays = Math.max(1, Math.ceil((periodEnd - nowMs) / DAY));
    const spent = transactions
      .filter((item) => item.type === 'expense')
      .filter((item) => item.date >= start && item.date <= nowMs)
      .filter((item) => !budget.categoryId || item.categoryId === budget.categoryId)
      .filter((item) => item.currency === budget.currency)
      .reduce((sum, item) => sum + item.amount, 0);
    const remaining = budget.amount - spent;
    const pace = spent / elapsedDays;
    const projectedSpend = pace * periodDays;
    const projectedOverBy = Math.max(0, projectedSpend - budget.amount);
    const projectedOverOn = pace > 0 && projectedOverBy > 0 ? start + Math.ceil(budget.amount / pace) * DAY : undefined;
    const allowedDailySpend = budget.amount / periodDays;
    const burnRatePercent = allowedDailySpend > 0 ? Math.round((pace / allowedDailySpend) * 100) : 0;
    const percentage = budget.amount > 0 ? Math.min(999, (spent / budget.amount) * 100) : 0;
    const risk: BudgetForecastItem['risk'] = spent > budget.amount || projectedOverBy > 0
      ? 'over'
      : percentage >= (budget.warningThreshold ?? 80)
        ? 'watch'
        : 'safe';

    return {
      budgetId: budget.id,
      name: budget.name,
      currency: budget.currency,
      amount: budget.amount,
      spent,
      remaining,
      percentage,
      dailySafeToSpend: Math.max(0, remaining / remainingDays),
      projectedSpend,
      projectedOverBy,
      projectedOverOn,
      burnRatePercent,
      risk,
    };
  }).sort((a, b) => {
    const rank = { over: 0, watch: 1, safe: 2 };
    return rank[a.risk] - rank[b.risk];
  });
}

function normalizedTitle(transaction: Transaction): string {
  return (transaction.description || transaction.categoryId || 'transaction')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-zа-яё0-9]+/giu, ' ')
    .trim();
}

function buildRecurringSummary(transactions: Transaction[], recurrings: RecurringTransaction[], nowMs: number): RecurringSummary {
  const upcoming = recurrings
    .filter((item) => item.isActive)
    .filter((item) => item.nextDate >= nowMs && item.nextDate <= nowMs + 30 * DAY)
    .sort((a, b) => a.nextDate - b.nextDate)
    .slice(0, 5);

  const groups = new Map<string, Transaction[]>();
  transactions
    .filter((item) => item.type === 'expense')
    .forEach((transaction) => {
      const key = `${normalizedTitle(transaction)}:${transaction.categoryId}:${transaction.currency}`;
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    });

  const likely = [...groups.entries()].flatMap(([key, group]) => {
    const sorted = [...group].sort((a, b) => a.date - b.date);
    if (sorted.length < 3) return [];

    const gaps = sorted.slice(1).map((item, index) => Math.round((item.date - sorted[index].date) / DAY));
    const medianGap = median(gaps);
    const gapStdDev = standardDeviation(gaps);
    const cadenceConsistency = clamp01(1 - (gapStdDev / Math.max(medianGap, 1)));
    const recurringCadence = (medianGap >= 6 && medianGap <= 8)
      || (medianGap >= 12 && medianGap <= 16)
      || (medianGap >= 25 && medianGap <= 35);
    if (!recurringCadence || cadenceConsistency < 0.55) return [];

    const amounts = sorted.map((item) => item.amount);
    const baselineAmount = median(amounts.slice(0, -1));
    const amountVolatilityPercent = median(amounts.map((amount) => Math.abs(amount - median(amounts)) / Math.max(median(amounts), 1))) * 100;
    const stableAmounts = amountVolatilityPercent <= 25;
    if (!stableAmounts) return [];

    const last = sorted[sorted.length - 1];
    const amountChangePercent = baselineAmount > 0 ? ((last.amount - baselineAmount) / baselineAmount) * 100 : 0;
    const amountStabilityScore = clamp01(1 - (amountVolatilityPercent / 25));
    const countScore = clamp01(sorted.length / 5);
    const daysSinceLast = (nowMs - last.date) / DAY;
    const recencyScore = clamp01(1 - (daysSinceLast / Math.max(medianGap * 2, 1)));
    const confidence = Math.round((
      cadenceConsistency * 0.4
      + amountStabilityScore * 0.3
      + countScore * 0.15
      + recencyScore * 0.15
    ) * 100) / 100;

    if (confidence < 0.62) return [];

    return [{
      key,
      title: last.description || 'Likely recurring payment',
      amount: median(amounts),
      baselineAmount,
      amountChangePercent: Math.round(amountChangePercent * 10) / 10,
      amountVolatilityPercent: Math.round(amountVolatilityPercent * 10) / 10,
      currency: last.currency,
      categoryId: last.categoryId,
      lastDate: last.date,
      cadenceDays: Math.round(medianGap),
      cadenceConsistency: Math.round(cadenceConsistency * 100) / 100,
      expectedNextDate: last.date + Math.round(medianGap) * DAY,
      confidence,
      amountChanged: Math.abs(amountChangePercent) >= 10,
    }];
  }).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

  return { upcoming, likely };
}

function buildNetWorth(accounts: Account[], debts: Debt[]): NetWorthSnapshot {
  const currencies = new Set<string>([
    ...accounts.map((item) => item.currency),
    ...debts.map((item) => item.currency),
  ]);

  return {
    byCurrency: [...currencies].map((currency) => {
      const assets = accounts.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.balance, 0);
      const iOwe = debts.filter((item) => item.currency === currency && item.status === 'active' && item.direction === 'i_owe').reduce((sum, item) => sum + item.remainingAmount, 0);
      const owedToMe = debts.filter((item) => item.currency === currency && item.status === 'active' && item.direction === 'owes_me').reduce((sum, item) => sum + item.remainingAmount, 0);
      return { currency, assets, iOwe, owedToMe, net: assets + owedToMe - iOwe };
    }).sort((a, b) => b.net - a.net),
  };
}

function buildReviewSummary(transactions: Transaction[], categories: Category[]): ReviewSummary {
  const categoryIds = new Set(categories.map((item) => item.id));
  const unreviewedCount = transactions.filter((item) => !(item as Transaction & { reviewed?: boolean }).reviewed).length;
  const needsCategoryCount = transactions.filter((item) => !item.categoryId || !categoryIds.has(item.categoryId)).length;
  const seen = new Set<string>();
  let possibleDuplicateCount = 0;
  transactions.forEach((item) => {
    const key = `${item.type}:${item.amount}:${item.currency}:${item.categoryId}:${startOfDayMs(item.date)}`;
    if (seen.has(key)) possibleDuplicateCount += 1;
    seen.add(key);
  });
  return { unreviewedCount, needsCategoryCount, possibleDuplicateCount };
}

function buildInsights(report: Omit<AnalyticsProReport, 'insights'>): InsightCard[] {
  const insights: InsightCard[] = [];
  const topCategory = report.categoryBreakdown[0];
  if (topCategory?.deltaPercent !== null && topCategory?.deltaPercent !== undefined && topCategory.deltaPercent > 20) {
    insights.push({
      id: 'category-up',
      title: `${topCategory.categoryName} is up ${topCategory.deltaPercent}%`,
      body: 'This category grew versus the previous comparable period.',
      severity: 'warning',
      target: 'transactions',
    });
  }

  const riskyBudget = report.budgetForecasts.find((item) => item.risk === 'over');
  if (riskyBudget) {
    insights.push({
      id: 'budget-risk',
      title: `${riskyBudget.name} may go over budget`,
      body: `At current pace, projected spend is ${Math.round(riskyBudget.projectedSpend).toLocaleString()} ${riskyBudget.currency}.`,
      severity: 'critical',
      target: 'budgets',
    });
  }

  if (report.cashflow.net < 0) {
    insights.push({
      id: 'negative-cashflow',
      title: 'Cashflow is negative',
      body: 'Expenses are higher than income in the selected period.',
      severity: 'warning',
      target: 'transactions',
    });
  }

  const changedRecurring = report.recurring.likely.find((item) => item.amountChanged);
  if (changedRecurring) {
    insights.push({
      id: 'recurring-amount-change',
      title: `${changedRecurring.title} changed ${changedRecurring.amountChangePercent > 0 ? '+' : ''}${changedRecurring.amountChangePercent}%`,
      body: 'Likely subscription amount changed versus its historical baseline.',
      severity: 'warning',
      target: 'recurrings',
    });
  }

  if (report.recurring.upcoming.length > 0) {
    insights.push({
      id: 'upcoming-recurring',
      title: `${report.recurring.upcoming.length} recurring payment${report.recurring.upcoming.length > 1 ? 's' : ''} upcoming`,
      body: 'Review upcoming recurring transactions before they hit your budget.',
      severity: 'info',
      target: 'recurrings',
    });
  }

  if (report.review.needsCategoryCount > 0 || report.review.possibleDuplicateCount > 0) {
    insights.push({
      id: 'review-needed',
      title: 'Ledger needs review',
      body: `${report.review.needsCategoryCount} need category, ${report.review.possibleDuplicateCount} look duplicated.`,
      severity: 'info',
      target: 'review',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'all-clear',
      title: 'Money picture looks stable',
      body: 'No urgent budget, cashflow, or review issues in this period.',
      severity: 'success',
    });
  }

  return insights.slice(0, 5);
}

export function buildAnalyticsProReport(params: BuildAnalyticsProParams): AnalyticsProReport {
  const nowMs = params.nowMs ?? Date.now();
  const window = periodWindow(params.period, nowMs);
  const current = params.transactions.filter((item) => inRange(item, window.currentStart, window.currentEnd));
  const previous = params.transactions.filter((item) => inRange(item, window.previousStart, window.previousEnd));

  const reportWithoutInsights: Omit<AnalyticsProReport, 'insights'> = {
    period: params.period,
    currentStart: window.currentStart,
    currentEnd: window.currentEnd,
    previousStart: window.previousStart,
    previousEnd: window.previousEnd,
    cashflow: buildCashflow(current, previous, params.transactions, window.periodLengthDays, nowMs),
    categoryBreakdown: buildCategoryBreakdown(current, previous, params.categories),
    budgetForecasts: buildBudgetForecasts(params.budgets, params.transactions, nowMs),
    recurring: buildRecurringSummary(params.transactions, params.recurrings, nowMs),
    netWorth: buildNetWorth(params.accounts, params.debts),
    review: buildReviewSummary(params.transactions, params.categories),
  };

  return {
    ...reportWithoutInsights,
    insights: buildInsights(reportWithoutInsights),
  };
}
