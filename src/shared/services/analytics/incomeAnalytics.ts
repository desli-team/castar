import * as SecureStore from 'expo-secure-store';
import { format, startOfMonth, subMonths } from 'date-fns';

import type { Category, Currency, Transaction } from '../../types';
import { apiClient } from '../api/apiClient';
import { convertCurrency } from '../currency/currencyService';

export type IncomeAnalyticsSource = 'server' | 'cache' | 'local';

export interface IncomeSourceRow {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  originalByCurrency: Record<string, number>;
  convertedTotal: number;
  count: number;
  percentage: number;
}

export interface IncomeCurrencyRow {
  currency: Currency;
  originalTotal: number;
  convertedTotal: number;
  count: number;
}

export interface IncomeTrendRow {
  label: string;
  amount: number;
}

export interface IncomeRecentRow {
  id: string;
  title: string;
  sourceName: string;
  icon: string;
  color: string;
  amount: number;
  currency: Currency;
  date: number;
}

export interface IncomeAnalyticsView {
  source: IncomeAnalyticsSource;
  baseCurrency: Currency;
  fetchedAt: number;
  totalIncome: number;
  averageIncome: number;
  transactionCount: number;
  sources: IncomeSourceRow[];
  currencies: IncomeCurrencyRow[];
  monthlyTrend: IncomeTrendRow[];
  recent: IncomeRecentRow[];
}

interface ServerIncomeSourceRow {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  currency: Currency;
  total: number;
  count: number;
}

interface ServerIncomeCurrencyRow {
  currency: Currency;
  total: number;
  count: number;
}

interface ServerIncomeTrendRow {
  month: string;
  currency: Currency;
  total: number;
  count: number;
}

interface ServerIncomeAnalyticsResponse {
  bySource: ServerIncomeSourceRow[];
  byCurrency: ServerIncomeCurrencyRow[];
  monthlyTrend: ServerIncomeTrendRow[];
  recent?: IncomeRecentRow[];
}

const CACHE_PREFIX = 'castar:income-analytics:';

function cacheKey(userId: string | null | undefined, periodKey: string, baseCurrency: Currency): string {
  return `${CACHE_PREFIX}${userId || 'anonymous'}:${periodKey}:${baseCurrency}`;
}

async function toBase(amount: number, from: Currency, to: Currency): Promise<number> {
  if (from === to) return amount;
  try {
    return await convertCurrency(amount, from, to);
  } catch {
    return 0;
  }
}

function normalizeName(name: string): string {
  return name.replace('categories.', '').replace(/_/g, ' ');
}

function makeEmptyTrend(): IncomeTrendRow[] {
  return Array.from({ length: 6 }).map((_, index) => {
    const month = startOfMonth(subMonths(new Date(), 5 - index));
    return { label: format(month, 'MMM'), amount: 0 };
  });
}

function applyPercentages(sources: IncomeSourceRow[], totalIncome: number): IncomeSourceRow[] {
  return sources
    .map((row) => ({ ...row, percentage: totalIncome > 0 ? (row.convertedTotal / totalIncome) * 100 : 0 }))
    .sort((a, b) => b.convertedTotal - a.convertedTotal);
}

export async function fetchIncomeAnalyticsFromBackend(params: {
  dateFrom: number;
  dateTo?: number;
  baseCurrency: Currency;
}): Promise<IncomeAnalyticsView> {
  const query: Record<string, string> = {
    date_from: String(params.dateFrom),
  };
  if (params.dateTo) query.date_to = String(params.dateTo);

  const response = await apiClient.get<ServerIncomeAnalyticsResponse>('/transactions/income-analytics', query);

  const sourceMap = new Map<string, IncomeSourceRow>();
  for (const row of response.bySource || []) {
    const categoryId = row.categoryId || 'income';
    const existing = sourceMap.get(categoryId) ?? {
      categoryId,
      name: normalizeName(row.categoryName || 'Income'),
      icon: row.categoryIcon || '↗',
      color: row.categoryColor || '#09AD4D',
      originalByCurrency: {},
      convertedTotal: 0,
      count: 0,
      percentage: 0,
    };
    existing.originalByCurrency[row.currency] = (existing.originalByCurrency[row.currency] ?? 0) + row.total;
    existing.convertedTotal += await toBase(row.total, row.currency, params.baseCurrency);
    existing.count += row.count;
    sourceMap.set(categoryId, existing);
  }

  const currencies: IncomeCurrencyRow[] = [];
  for (const row of response.byCurrency || []) {
    currencies.push({
      currency: row.currency,
      originalTotal: row.total,
      convertedTotal: await toBase(row.total, row.currency, params.baseCurrency),
      count: row.count,
    });
  }
  currencies.sort((a, b) => b.convertedTotal - a.convertedTotal);

  const trendMap = new Map<string, number>();
  for (const row of response.monthlyTrend || []) {
    const amount = await toBase(row.total, row.currency, params.baseCurrency);
    trendMap.set(row.month, (trendMap.get(row.month) ?? 0) + amount);
  }
  const monthlyTrend = makeEmptyTrend().map((item, index) => {
    const month = format(startOfMonth(subMonths(new Date(), 5 - index)), 'yyyy-MM');
    return { ...item, amount: trendMap.get(month) ?? 0 };
  });

  const totalIncome = currencies.reduce((sum, row) => sum + row.convertedTotal, 0);
  const transactionCount = currencies.reduce((sum, row) => sum + row.count, 0);

  return {
    source: 'server',
    baseCurrency: params.baseCurrency,
    fetchedAt: Date.now(),
    totalIncome,
    averageIncome: transactionCount > 0 ? totalIncome / transactionCount : 0,
    transactionCount,
    sources: applyPercentages([...sourceMap.values()], totalIncome),
    currencies,
    monthlyTrend,
    recent: response.recent || [],
  };
}

export async function buildLocalIncomeAnalytics(params: {
  transactions: Transaction[];
  categories: Category[];
  dateFrom: number;
  baseCurrency: Currency;
}): Promise<IncomeAnalyticsView> {
  const incomeCategories = params.categories.filter((category) => category.type === 'income');
  const categoryById = new Map(incomeCategories.map((category) => [category.id, category]));
  const incomeTransactions = params.transactions
    .filter((transaction) => transaction.type === 'income' && transaction.date >= params.dateFrom)
    .sort((a, b) => b.date - a.date);

  const sourceMap = new Map<string, IncomeSourceRow>();
  const currencyMap = new Map<string, IncomeCurrencyRow>();
  const trendMap = new Map<string, number>();

  for (const transaction of incomeTransactions) {
    const category = categoryById.get(transaction.categoryId);
    const convertedAmount = typeof transaction.amountInDefault === 'number' && transaction.amountInDefault > 0
      ? transaction.amountInDefault
      : await toBase(transaction.amount, transaction.currency, params.baseCurrency);

    const sourceId = category?.id || 'income';
    const source = sourceMap.get(sourceId) ?? {
      categoryId: sourceId,
      name: category ? normalizeName(category.name) : 'Income',
      icon: category?.icon || '↗',
      color: category?.color || '#09AD4D',
      originalByCurrency: {},
      convertedTotal: 0,
      count: 0,
      percentage: 0,
    };
    source.originalByCurrency[transaction.currency] = (source.originalByCurrency[transaction.currency] ?? 0) + transaction.amount;
    source.convertedTotal += convertedAmount;
    source.count += 1;
    sourceMap.set(sourceId, source);

    const currency = currencyMap.get(transaction.currency) ?? {
      currency: transaction.currency,
      originalTotal: 0,
      convertedTotal: 0,
      count: 0,
    };
    currency.originalTotal += transaction.amount;
    currency.convertedTotal += convertedAmount;
    currency.count += 1;
    currencyMap.set(transaction.currency, currency);

    const month = format(startOfMonth(new Date(transaction.date)), 'yyyy-MM');
    trendMap.set(month, (trendMap.get(month) ?? 0) + convertedAmount);
  }

  const currencies = [...currencyMap.values()].sort((a, b) => b.convertedTotal - a.convertedTotal);
  const totalIncome = currencies.reduce((sum, row) => sum + row.convertedTotal, 0);
  const transactionCount = incomeTransactions.length;
  const monthlyTrend = makeEmptyTrend().map((item, index) => {
    const month = format(startOfMonth(subMonths(new Date(), 5 - index)), 'yyyy-MM');
    return { ...item, amount: trendMap.get(month) ?? 0 };
  });

  return {
    source: 'local',
    baseCurrency: params.baseCurrency,
    fetchedAt: Date.now(),
    totalIncome,
    averageIncome: transactionCount > 0 ? totalIncome / transactionCount : 0,
    transactionCount,
    sources: applyPercentages([...sourceMap.values()], totalIncome),
    currencies,
    monthlyTrend,
    recent: incomeTransactions.slice(0, 5).map((transaction) => {
      const category = categoryById.get(transaction.categoryId);
      return {
        id: transaction.id,
        title: transaction.description || (category ? normalizeName(category.name) : 'Income'),
        sourceName: category ? normalizeName(category.name) : 'Income',
        icon: category?.icon || '↗',
        color: category?.color || '#09AD4D',
        amount: transaction.amount,
        currency: transaction.currency,
        date: transaction.date,
      };
    }),
  };
}

export async function loadCachedIncomeAnalytics(
  userId: string | null | undefined,
  periodKey: string,
  baseCurrency: Currency,
): Promise<IncomeAnalyticsView | null> {
  try {
    const value = await SecureStore.getItemAsync(cacheKey(userId, periodKey, baseCurrency));
    if (!value) return null;
    const parsed = JSON.parse(value) as IncomeAnalyticsView;
    return { ...parsed, source: 'cache' };
  } catch {
    return null;
  }
}

export async function saveIncomeAnalyticsCache(
  userId: string | null | undefined,
  periodKey: string,
  baseCurrency: Currency,
  data: IncomeAnalyticsView,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(cacheKey(userId, periodKey, baseCurrency), JSON.stringify({ ...data, source: 'cache' }));
  } catch {
    // cache failures should never block analytics UI
  }
}
