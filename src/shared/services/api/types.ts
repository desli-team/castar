/**
 * Castar — API Types
 *
 * Server-side types (camelCase, after conversion from snake_case).
 * These match the D1 schema but with camelCase keys.
 */

// ── Server entities (returned by GET endpoints, already camelCase after apiClient conversion) ──

export interface ServerTransaction {
  id: string;
  userId: string;
  accountId: string | null;
  categoryId: string | null;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string | null;
  date: number;
  isRecurring: number;          // D1 returns 0/1 for booleans
  recurringId: string | null;
  debtId: string | null;
  voiceInput: number;           // 0/1
  reviewed: number;             // D1 returns 0/1 for booleans
  createdAt: number;
  updatedAt: number;
}

export interface ServerCategory {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
  isDefault: number;            // 0/1
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServerAccount {
  id: string;
  userId: string;
  name: string;
  type: 'cash' | 'card' | 'bank' | 'savings';
  currency: string;
  balance: number;
  icon: string | null;
  color: string | null;
  isArchived: number;           // 0/1
  createdAt: number;
  updatedAt: number;
}

export interface ServerBudget {
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  amount: number;
  currency: string;
  period: 'daily' | 'weekly' | 'fourteen_days' | 'monthly' | 'yearly';
  startDate: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  isHardLimit?: number;         // 0/1
  rolloverEnabled?: number;     // 0/1
  isActive: number;             // 0/1
  createdAt: number;
  updatedAt: number;
  // Enriched fields from GET /budgets
  spent?: number;
  remaining?: number;
  percentage?: number;
  health?: 'safe' | 'warning' | 'critical' | 'over';
}

export interface ServerDebt {
  id: string;
  userId: string;
  personName: string;
  direction: 'i_owe' | 'owes_me';
  principalAmount: number;
  remainingAmount: number;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  dueDate: number | null;
  note: string | null;
  status: 'active' | 'settled';
  createdAt: number;
  updatedAt: number;
  settledAt: number | null;
}

export interface ServerDebtRepayment {
  id: string;
  userId: string;
  debtId: string;
  transactionId: string | null;
  accountId: string | null;
  amount: number;
  currency: string;
  note: string | null;
  date: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServerAuditLog {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'settle';
  beforeJson: string | null;
  afterJson: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerRecurring {
  id: string;
  userId: string;
  accountId: string | null;
  categoryId: string | null;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextDate: number;
  isActive: number;             // 0/1
  createdAt: number;
  updatedAt: number;
}

export interface UserEntitlements {
  canCreateCustomCategories: boolean;
  canUseAnalyticsPro: boolean;
  canUseBudgetAlerts: boolean;
  canUseRecurringAutomation: boolean;
  canUseMultiDeviceSync: boolean;
  maxSyncDevices: number;
}

export interface ServerSettings {
  id?: string;
  userId: string;
  displayName: string | null;
  language: string;
  primaryCurrency: string;
  tier: 'free' | 'premium' | string;
  role: 'user' | 'support' | 'admin' | string;
  premiumUntil: number | null;
  subscriptionStatus: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | string;
  entitlements: UserEntitlements;
  createdAt?: number;
  updatedAt?: number;
}

// ── Request DTOs (camelCase, will be converted to snake_case by apiClient) ──

export interface CreateTransactionRequest {
  id: string;
  accountId?: string | null;
  categoryId?: string | null;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description?: string | null;
  date: number;
  isRecurring?: boolean;
  recurringId?: string | null;
  debtId?: string | null;
  voiceInput?: boolean;
  reviewed?: boolean;
}

export interface UpdateTransactionRequest {
  accountId?: string | null;
  categoryId?: string | null;
  type?: 'income' | 'expense';
  amount?: number;
  currency?: string;
  description?: string | null;
  date?: number;
  debtId?: string | null;
  reviewed?: boolean;
}

export interface CreateCategoryRequest {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  type: 'income' | 'expense';
  isDefault?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryRequest {
  name?: string;
  icon?: string;
  color?: string;
  type?: 'income' | 'expense';
  sortOrder?: number;
}

export interface CreateAccountRequest {
  id: string;
  name: string;
  type?: 'cash' | 'card' | 'bank' | 'savings';
  currency?: string;
  balance?: number;
  icon?: string | null;
  color?: string | null;
}

export interface UpdateAccountRequest {
  name?: string;
  type?: 'cash' | 'card' | 'bank' | 'savings';
  currency?: string;
  icon?: string | null;
  color?: string | null;
}

export interface CreateBudgetRequest {
  id: string;
  categoryId?: string | null;
  name: string;
  amount: number;
  currency?: string;
  period: 'daily' | 'weekly' | 'fourteen_days' | 'monthly' | 'yearly';
  startDate: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  isHardLimit?: boolean;
  rolloverEnabled?: boolean;
}

export interface UpdateBudgetRequest {
  categoryId?: string | null;
  name?: string;
  amount?: number;
  currency?: string;
  period?: 'daily' | 'weekly' | 'fourteen_days' | 'monthly' | 'yearly';
  startDate?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  isHardLimit?: boolean;
  rolloverEnabled?: boolean;
}

export interface CreateRecurringRequest {
  id: string;
  accountId?: string | null;
  categoryId?: string | null;
  type: 'income' | 'expense';
  amount: number;
  currency?: string;
  description?: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextDate: number;
}

export interface UpdateRecurringRequest {
  accountId?: string | null;
  categoryId?: string | null;
  type?: 'income' | 'expense';
  amount?: number;
  currency?: string;
  description?: string | null;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextDate?: number;
}

export interface UpdateSettingsRequest {
  displayName?: string | null;
  language?: string;
  primaryCurrency?: string;
}

// ── Summary / Sync types ──

export interface TransactionSummary {
  income: number;
  expense: number;
  net: number;
}

export type SyncTableName = 'categories' | 'accounts' | 'transactions' | 'budgets' | 'recurrings' | 'debts' | 'debt_repayments' | 'audit_logs';

export interface SyncPushRequest {
  operations: Array<{
    table: SyncTableName;
    recordId: string;
    action: 'create' | 'update' | 'delete';
    data?: Record<string, unknown>;
  }>;
}

export interface SyncPullRequest {
  lastSyncedAt: number;
  tables?: SyncTableName[];
  cursors?: Record<string, number | string>;
  limit?: number;
}

export interface SyncFullRequest {
  operations?: SyncPushRequest['operations'];
  lastSyncedAt?: number;
  tables?: SyncPullRequest['tables'];
  cursors?: Record<string, number | string>;
  limit?: number;
}

export interface SyncPushResult {
  processed: number;
  failed: number;
  results: Array<{
    recordId: string;
    table: string;
    action: string;
    ok: boolean;
    error?: string;
  }>;
}

export interface SyncDeletion {
  tableName: SyncTableName;
  recordId: string;
  deletedAt: number;
}

export interface SyncPullResult {
  changes: Record<string, unknown[]>;
  deletions?: SyncDeletion[];
  nextCursors?: Record<string, number | string>;
  hasMore?: boolean;
  totalChanges: number;
  serverTime: number;
}

export interface SyncDevice {
  id: string;
  name: string | null;
  platform: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  isActive: number;
}

export interface SyncDevicesResult {
  devices: SyncDevice[];
  entitlements: {
    canUseMultiDeviceSync: boolean;
    maxSyncDevices: number;
  };
}

export interface RegisterSyncDeviceRequest {
  id: string;
  name?: string;
  platform?: string;
}

export interface SyncFullResult {
  push: SyncPushResult;
  pull: SyncPullResult;
  serverTime: number;
}
