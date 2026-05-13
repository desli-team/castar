/**
 * Castar — Core TypeScript types
 */

// === Enums as union types ===

export type TransactionType = 'income' | 'expense';
export type BudgetPeriod = 'daily' | 'weekly' | 'fourteen_days' | 'monthly' | 'yearly';
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type AccountType = 'cash' | 'card' | 'bank' | 'savings';
export type FamilyRole = 'owner' | 'admin' | 'member';
export type Currency = 'UZS' | 'USD' | 'EUR' | 'RUB' | (string & {});
export type SubscriptionTier = 'free' | 'premium' | (string & {});
export type UserRole = 'user' | 'support' | 'admin' | (string & {});
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | (string & {});
export type SyncAction = 'create' | 'update' | 'delete';
export type AuditLogAction = 'create' | 'update' | 'delete' | 'restore' | 'settle';
export type DebtDirection = 'i_owe' | 'owes_me';
export type DebtStatus = 'active' | 'settled';

// === Entities ===

export interface User {
  id: string;
  remoteId?: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  defaultCurrency: Currency;
  language: 'uz' | 'ru' | 'en';
  isPublic: boolean;
  tier?: SubscriptionTier;
  role?: UserRole;
  premiumUntil?: number | null;
  subscriptionStatus?: SubscriptionStatus;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface FamilyGroup {
  id: string;
  remoteId?: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface FamilyMember {
  id: string;
  groupId: string;
  userId: string;
  role: FamilyRole;
  joinedAt: number;
}

export interface Category {
  id: string;
  remoteId?: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  isDefault: boolean;
  parentId?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface Account {
  id: string;
  remoteId?: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  icon?: string;
  color?: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface Transaction {
  id: string;
  remoteId?: string;
  userId: string;
  accountId: string;
  categoryId: string;
  familyGroupId?: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  amountInDefault?: number;
  exchangeRate?: number;
  description?: string;
  date: number;
  isRecurring: boolean;
  recurringId?: string;
  debtId?: string;
  voiceInput: boolean;
  reviewed?: boolean;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface Budget {
  id: string;
  remoteId?: string;
  userId: string;
  familyGroupId?: string;
  categoryId?: string;
  name: string;
  amount: number;
  currency: Currency;
  period: BudgetPeriod;
  startDate: number;
  endDate?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  isHardLimit?: boolean;
  rolloverEnabled?: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  // Computed (not stored in DB)
  spent?: number;
  remaining?: number;
  percentage?: number;
}

export interface RecurringTransaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description?: string;
  frequency: RecurringFrequency;
  nextDate: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Debt {
  id: string;
  remoteId?: string;
  userId: string;
  personName: string;
  direction: DebtDirection;
  principalAmount: number;
  remainingAmount: number;
  currency: Currency;
  categoryId?: string;
  accountId?: string;
  dueDate?: number;
  note?: string;
  status: DebtStatus;
  createdAt: number;
  updatedAt: number;
  settledAt?: number;
  syncedAt?: number;
}

export interface DebtRepayment {
  id: string;
  remoteId?: string;
  userId: string;
  debtId: string;
  transactionId?: string;
  accountId?: string;
  amount: number;
  currency: Currency;
  note?: string;
  date: number;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface ExchangeRate {
  id: string;
  baseCurrency: Currency;
  targetCurrency: Currency;
  rate: number;
  fetchedAt: number;
}

export interface AuditLog {
  id: string;
  remoteId?: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: AuditLogAction;
  beforeJson?: string;
  afterJson?: string;
  source: string;
  createdAt: number;
  syncedAt?: number;
}

export interface SyncQueueItem {
  id: string;
  tableName: string;
  recordId: string;
  action: SyncAction;
  data: string; // JSON
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// === Voice Input ===

export interface VoiceParseResult {
  amount?: number;
  currency?: Currency;
  categoryHint?: string;
  type?: TransactionType;
  description?: string;
  confidence: number;
  rawText: string;
}

// === Analytics ===

export interface AnalyticsSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  currency: Currency;
  byCategory: CategorySummary[];
  trend: TrendData[];
}

export interface CategorySummary {
  category: Category;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface TrendData {
  date: number;
  income: number;
  expense: number;
}

// === DTOs ===

export interface CreateTransactionDTO {
  accountId: string;
  categoryId: string;
  familyGroupId?: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description?: string;
  date: number;
  debtId?: string;
  voiceInput?: boolean;
  reviewed?: boolean;
}

export interface UpdateTransactionDTO extends Partial<CreateTransactionDTO> {}

export interface CreateBudgetDTO {
  familyGroupId?: string;
  categoryId?: string;
  name: string;
  amount: number;
  currency: Currency;
  period: BudgetPeriod;
  startDate: number;
  endDate?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  isHardLimit?: boolean;
  rolloverEnabled?: boolean;
}

export interface UpdateBudgetDTO extends Partial<CreateBudgetDTO> {}

export interface CreateCategoryDTO {
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  parentId?: string;
}

export interface UpdateCategoryDTO extends Partial<CreateCategoryDTO> {}

// === Filters ===

export interface TransactionFilters {
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  familyGroupId?: string;
  dateFrom?: number;
  dateTo?: number;
  amountMin?: number;
  amountMax?: number;
  search?: string;
}

export type AnalyticsPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom';

// === App Settings ===

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  notifications: boolean;
  biometricLock: boolean;
  defaultAccountId?: string;
}
