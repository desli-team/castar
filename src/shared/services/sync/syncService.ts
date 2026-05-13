/**
 * Castar — Sync Service
 *
 * Offline-first synchronization foundation.
 *
 * Architecture:
 * 1. All write operations go to local SQLite first
 * 2. Changes are queued in sync_queue table
 * 3. When online/authenticated, queue items are pushed to the server
 * 4. Server changes are pulled and applied to local SQLite
 * 5. Successful queue items are removed; failed rows keep retry metadata
 */

import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../../features/auth/store/authStore';
import { useBudgetStore } from '../../../features/budget/store/budgetStore';
import { useCategoryStore } from '../../../features/categories/store/categoryStore';
import { useRecurringStore } from '../../../features/recurring/store/recurringStore';
import { useDebtStore } from '../../../features/debts/store/debtStore';
import { useTransactionStore } from '../../../features/transactions/store/transactionStore';
import { apiClient } from '../api/apiClient';
import type {
  ServerAccount,
  ServerBudget,
  ServerCategory,
  ServerRecurring,
  ServerDebt,
  ServerDebtRepayment,
  ServerAuditLog,
  ServerTransaction,
  SyncDeletion,
  SyncPullResult,
  SyncPushRequest,
  SyncPushResult,
} from '../api/types';
import * as accountQueries from '../database/accountQueries';
import * as budgetQueries from '../database/budgetQueries';
import * as categoryQueries from '../database/categoryQueries';
import * as recurringQueries from '../database/recurringQueries';
import * as debtQueries from '../database/debtQueries';
import * as debtRepaymentQueries from '../database/debtRepaymentQueries';
import * as auditLogQueries from '../database/auditLogQueries';
import * as syncQueueQueries from '../database/syncQueueQueries';
import * as transactionQueries from '../database/transactionQueries';
import type {
  Account,
  Budget,
  Category,
  Currency,
  Debt,
  DebtRepayment,
  AuditLog,
  RecurringTransaction,
  SyncAction,
  Transaction,
} from '../../types';

type SyncTableName = SyncPushRequest['operations'][number]['table'];

export interface SyncProcessResult {
  attempted: number;
  synced: number;
  failed: number;
  skipped: boolean;
  reason?: 'offline' | 'unauthenticated' | 'empty' | 'network_error';
}

export interface SyncPullApplyResult {
  pulled: number;
  applied: number;
  skippedLocalConflicts: number;
  skipped: boolean;
  reason?: 'offline' | 'unauthenticated' | 'network_error';
}

export interface SyncDiagnostics {
  isOnline: boolean;
  pending: number;
  failed: number;
  lastSyncAt?: number;
  lastFailedItem?: {
    tableName: string;
    recordId: string;
    action: SyncAction;
    attempts: number;
    lastError?: string;
  };
}

const SYNC_TABLES = new Set<SyncTableName>([
  'categories',
  'accounts',
  'transactions',
  'budgets',
  'recurrings',
  'debts',
  'debt_repayments',
  'audit_logs',
]);

const LAST_SYNC_KEY_PREFIX = 'castar_last_sync_at';

function lastSyncKey(userId: string) {
  return `${LAST_SYNC_KEY_PREFIX}:${userId}`;
}

function isSyncTableName(value: string): value is SyncTableName {
  return SYNC_TABLES.has(value as SyncTableName);
}

function parseQueueData(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function toBoolean(value: boolean | number | null | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return fallback;
}

function upsert<T extends { id: string }>(
  id: string,
  exists: (id: string) => T | undefined,
  insert: (entity: T) => void,
  update: (id: string, entity: Partial<T>) => void,
  entity: T,
) {
  if (exists(id)) update(id, entity);
  else insert(entity);
}

const DELETED_ACCOUNT_ID_PREFIX = '__castar_deleted_account__';
const DELETED_CATEGORY_ID_PREFIX = '__castar_deleted_category__';

function ensureDeletedAccount(userId: string, syncTime: number): string {
  const id = `${DELETED_ACCOUNT_ID_PREFIX}${userId}`;
  if (!accountQueries.findById(id)) {
    accountQueries.insert({
      id,
      userId,
      name: 'Deleted account',
      type: 'cash',
      currency: 'UZS',
      balance: 0,
      icon: '∅',
      color: '#8A8A8E',
      isArchived: true,
      createdAt: syncTime,
      updatedAt: syncTime,
      syncedAt: syncTime,
    });
  }
  return id;
}

function ensureDeletedCategory(userId: string, type: Category['type'], syncTime: number): string {
  const id = `${DELETED_CATEGORY_ID_PREFIX}${type}__${userId}`;
  if (!categoryQueries.findById(id)) {
    categoryQueries.insert({
      id,
      userId,
      name: 'Deleted category',
      icon: '∅',
      color: '#8A8A8E',
      type,
      isDefault: false,
      sortOrder: 9999,
      createdAt: syncTime,
      updatedAt: syncTime,
      syncedAt: syncTime,
    });
  }
  return id;
}

function enqueueDependencyIfNeeded(tableName: 'accounts' | 'categories', recordId: unknown): void {
  if (typeof recordId !== 'string' || !recordId) return;
  if (recordId.startsWith('__castar_')) return;
  if (syncQueueQueries.findByRecord(tableName, recordId).some((item) => item.action === 'create')) return;

  const entity = tableName === 'accounts' ? accountQueries.findById(recordId) : categoryQueries.findById(recordId);
  if (entity) syncQueueQueries.enqueue(tableName, recordId, 'create', entity);
}

function enqueueDependencies(tableName: string, data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const payload = data as { accountId?: unknown; categoryId?: unknown };

  if (['transactions', 'recurrings', 'debts', 'debt_repayments'].includes(tableName)) {
    enqueueDependencyIfNeeded('accounts', payload.accountId);
  }
  if (['transactions', 'recurrings', 'debts'].includes(tableName)) {
    enqueueDependencyIfNeeded('categories', payload.categoryId);
  }
}

const PUSH_TABLE_PRIORITY: Record<SyncTableName, number> = {
  categories: 0,
  accounts: 0,
  budgets: 1,
  recurrings: 1,
  debts: 1,
  transactions: 2,
  debt_repayments: 3,
  audit_logs: 4,
};

function mapCategory(row: ServerCategory, syncTime: number): Category {
  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    name: row.name,
    icon: row.icon,
    color: row.color,
    type: row.type,
    isDefault: toBoolean(row.isDefault),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: syncTime,
  };
}

function mapAccount(row: ServerAccount, syncTime: number): Account {
  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    currency: row.currency as Currency,
    balance: row.balance,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    isArchived: toBoolean(row.isArchived),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: syncTime,
  };
}

function mapTransaction(row: ServerTransaction, syncTime: number): Transaction {
  const type = row.type;

  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    accountId: row.accountId ?? ensureDeletedAccount(row.userId, syncTime),
    categoryId: row.categoryId ?? ensureDeletedCategory(row.userId, type, syncTime),
    type,
    amount: row.amount,
    currency: row.currency as Currency,
    description: row.description ?? undefined,
    date: row.date,
    isRecurring: toBoolean(row.isRecurring),
    recurringId: row.recurringId ?? undefined,
    debtId: (row as ServerTransaction & { debtId?: string | null }).debtId ?? undefined,
    voiceInput: toBoolean(row.voiceInput),
    reviewed: toBoolean(row.reviewed),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: syncTime,
  };
}

function mapBudget(row: ServerBudget, syncTime: number): Budget {
  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    categoryId: row.categoryId ?? undefined,
    name: row.name,
    amount: row.amount,
    currency: row.currency as Currency,
    period: row.period,
    startDate: row.startDate,
    warningThreshold: row.warningThreshold ?? 80,
    criticalThreshold: row.criticalThreshold ?? 100,
    isHardLimit: toBoolean(row.isHardLimit, false),
    rolloverEnabled: toBoolean(row.rolloverEnabled, false),
    isActive: toBoolean(row.isActive, true),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: syncTime,
  };
}

function mapDebt(row: ServerDebt, syncTime: number): Debt {
  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    personName: row.personName,
    direction: row.direction,
    principalAmount: row.principalAmount,
    remainingAmount: row.remainingAmount,
    currency: row.currency as Currency,
    categoryId: row.categoryId ?? undefined,
    accountId: row.accountId ?? undefined,
    dueDate: row.dueDate ?? undefined,
    note: row.note ?? undefined,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    settledAt: row.settledAt ?? undefined,
    syncedAt: syncTime,
  };
}

function mapDebtRepayment(row: ServerDebtRepayment, syncTime: number): DebtRepayment {
  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    debtId: row.debtId,
    transactionId: row.transactionId ?? undefined,
    accountId: row.accountId ?? undefined,
    amount: row.amount,
    currency: row.currency as Currency,
    note: row.note ?? undefined,
    date: row.date,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: syncTime,
  };
}

function mapRecurring(row: ServerRecurring, syncTime: number): RecurringTransaction {
  const type = row.type;

  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId ?? ensureDeletedAccount(row.userId, syncTime),
    categoryId: row.categoryId ?? ensureDeletedCategory(row.userId, type, syncTime),
    type,
    amount: row.amount,
    currency: row.currency as Currency,
    description: row.description ?? undefined,
    frequency: row.frequency,
    nextDate: row.nextDate,
    isActive: toBoolean(row.isActive, true),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAuditLog(row: ServerAuditLog, syncTime: number): AuditLog {
  return {
    id: row.id,
    remoteId: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    beforeJson: row.beforeJson ?? undefined,
    afterJson: row.afterJson ?? undefined,
    source: row.source,
    createdAt: row.createdAt,
    syncedAt: syncTime,
  };
}

function refreshStores(userId: string) {
  useCategoryStore.getState().setCategories(categoryQueries.findByUser(userId));
  useBudgetStore.getState().setBudgets(budgetQueries.findByUser(userId));
  useTransactionStore.getState().setTransactions(transactionQueries.findByUser(userId));
  useRecurringStore.getState().setRecurrings(recurringQueries.findAll().filter((item) => item.userId === userId));
  useDebtStore.getState().setDebts(debtQueries.findByUser(userId));
}

function hasPendingLocalChange(tableName: SyncTableName, recordId: string): boolean {
  return syncQueueQueries.findByRecord(tableName, recordId).length > 0;
}

function applyPulledDeletion(deletion: SyncDeletion): boolean {
  if (hasPendingLocalChange(deletion.tableName, deletion.recordId)) return false;

  switch (deletion.tableName) {
    case 'categories':
      categoryQueries.delete(deletion.recordId);
      return true;
    case 'accounts':
      if (accountQueries.findById(deletion.recordId)) {
        accountQueries.update(deletion.recordId, { isArchived: true, updatedAt: Date.now() });
      }
      return true;
    case 'transactions':
      transactionQueries.delete(deletion.recordId);
      return true;
    case 'budgets':
      if (budgetQueries.findById(deletion.recordId)) {
        budgetQueries.update(deletion.recordId, { isActive: false, updatedAt: Date.now() });
      }
      return true;
    case 'recurrings':
      recurringQueries.delete(deletion.recordId);
      return true;
    case 'debts':
      debtQueries.delete(deletion.recordId);
      return true;
    case 'debt_repayments':
      debtRepaymentQueries.delete(deletion.recordId);
      return true;
    case 'audit_logs':
      // Audit logs are append-only. Ignore remote tombstones if any are ever emitted.
      return false;
  }
}

export class SyncService {
  private isOnline = true;
  private isProcessing = false;
  private isPulling = false;

  setOnlineStatus(online: boolean) {
    this.isOnline = online;
    if (online) {
      this.syncNow().catch((error) => {
        console.warn('[Sync] Sync failed', error);
      });
    }
  }

  async queueChange(tableName: string, recordId: string, action: SyncAction, data: unknown) {
    if (action !== 'delete') enqueueDependencies(tableName, data);
    syncQueueQueries.enqueue(tableName, recordId, action, data);
  }

  async syncNow(): Promise<{ push: SyncProcessResult; pull: SyncPullApplyResult }> {
    const push = await this.processQueue();
    const pull = await this.pullAndApply();
    return { push, pull };
  }

  async processQueue(limit = 50): Promise<SyncProcessResult> {
    if (!this.isOnline) {
      return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: 'offline' };
    }

    if (this.isProcessing) {
      return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: 'empty' };
    }

    const token = useAuthStore.getState().token;
    if (!token) {
      return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: 'unauthenticated' };
    }

    const pending = syncQueueQueries.findPending(limit);
    if (pending.length === 0) {
      return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: 'empty' };
    }

    this.isProcessing = true;

    try {
      const queueByRecord = new Map<string, string>();
      const operations: SyncPushRequest['operations'] = [];

      for (const item of pending) {
        if (!isSyncTableName(item.tableName)) {
          syncQueueQueries.recordFailure(item.id, `Unsupported sync table: ${item.tableName}`);
          continue;
        }

        const data = item.action === 'delete' ? undefined : parseQueueData(item.data);
        if (item.action !== 'delete' && !data) {
          syncQueueQueries.recordFailure(item.id, 'Invalid queue JSON payload');
          continue;
        }

        queueByRecord.set(`${item.tableName}:${item.recordId}:${item.action}`, item.id);
        operations.push({
          table: item.tableName,
          recordId: item.recordId,
          action: item.action,
          data,
        });
      }

      operations.sort((a, b) => PUSH_TABLE_PRIORITY[a.table] - PUSH_TABLE_PRIORITY[b.table]);

      if (operations.length === 0) {
        return { attempted: pending.length, synced: 0, failed: pending.length, skipped: false };
      }

      const result = await apiClient.post<SyncPushResult>('/sync/push', { operations });
      let synced = 0;
      let failed = 0;

      for (const itemResult of result.results) {
        const queueId = queueByRecord.get(`${itemResult.table}:${itemResult.recordId}:${itemResult.action}`);
        if (!queueId) continue;

        if (itemResult.ok) {
          syncQueueQueries.markSynced(queueId);
          synced += 1;
        } else {
          syncQueueQueries.recordFailure(queueId, itemResult.error ?? 'Server sync failed');
          failed += 1;
        }
      }

      return {
        attempted: operations.length,
        synced,
        failed: failed + result.failed,
        skipped: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network sync failed';
      for (const item of pending) {
        syncQueueQueries.recordFailure(item.id, message);
      }
      return {
        attempted: pending.length,
        synced: 0,
        failed: pending.length,
        skipped: true,
        reason: 'network_error',
      };
    } finally {
      this.isProcessing = false;
    }
  }

  async pullAndApply(): Promise<SyncPullApplyResult> {
    if (!this.isOnline) {
      return { pulled: 0, applied: 0, skippedLocalConflicts: 0, skipped: true, reason: 'offline' };
    }

    if (this.isPulling) {
      return { pulled: 0, applied: 0, skippedLocalConflicts: 0, skipped: true };
    }

    const { token, userId } = useAuthStore.getState();
    if (!token || !userId) {
      return { pulled: 0, applied: 0, skippedLocalConflicts: 0, skipped: true, reason: 'unauthenticated' };
    }

    this.isPulling = true;

    try {
      const rawLastSync = await SecureStore.getItemAsync(lastSyncKey(userId));
      const lastSyncedAt = rawLastSync ? Number(rawLastSync) : 0;
      const safeLastSyncedAt = Number.isFinite(lastSyncedAt) ? lastSyncedAt : 0;
      const tables: SyncTableName[] = ['categories', 'accounts', 'transactions', 'budgets', 'recurrings', 'debts', 'debt_repayments', 'audit_logs'];
      let cursors: Record<string, number | string> | undefined;
      let syncTime = Date.now();
      let pulled = 0;
      let applied = 0;
      let skippedLocalConflicts = 0;
      let pageCount = 0;
      let hasMore = false;

      do {
        const result = await apiClient.post<SyncPullResult>('/sync/pull', {
          lastSyncedAt: safeLastSyncedAt,
          tables,
          cursors,
          limit: 500,
        });

        syncTime = result.serverTime;
        pulled += result.totalChanges;
        pageCount += 1;

        for (const row of (result.changes.categories ?? []) as ServerCategory[]) {
          if (hasPendingLocalChange('categories', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapCategory(row, syncTime);
          upsert(entity.id, categoryQueries.findById, categoryQueries.insert, categoryQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.accounts ?? []) as ServerAccount[]) {
          if (hasPendingLocalChange('accounts', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapAccount(row, syncTime);
          upsert(entity.id, accountQueries.findById, accountQueries.insert, accountQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.transactions ?? []) as ServerTransaction[]) {
          if (hasPendingLocalChange('transactions', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapTransaction(row, syncTime);
          upsert(entity.id, transactionQueries.findById, transactionQueries.insert, transactionQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.budgets ?? []) as ServerBudget[]) {
          if (hasPendingLocalChange('budgets', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapBudget(row, syncTime);
          upsert(entity.id, budgetQueries.findById, budgetQueries.insert, budgetQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.recurrings ?? []) as ServerRecurring[]) {
          if (hasPendingLocalChange('recurrings', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapRecurring(row, syncTime);
          upsert(entity.id, recurringQueries.findById, recurringQueries.insert, recurringQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.debts ?? []) as ServerDebt[]) {
          if (hasPendingLocalChange('debts', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapDebt(row, syncTime);
          upsert(entity.id, debtQueries.findById, debtQueries.insert, debtQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.debt_repayments ?? []) as ServerDebtRepayment[]) {
          if (hasPendingLocalChange('debt_repayments', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapDebtRepayment(row, syncTime);
          upsert(entity.id, debtRepaymentQueries.findById, debtRepaymentQueries.insert, debtRepaymentQueries.update, entity);
          applied += 1;
        }

        for (const row of (result.changes.audit_logs ?? []) as ServerAuditLog[]) {
          if (hasPendingLocalChange('audit_logs', row.id)) {
            skippedLocalConflicts += 1;
            continue;
          }
          const entity = mapAuditLog(row, syncTime);
          upsert(entity.id, auditLogQueries.findById, auditLogQueries.insert, auditLogQueries.update, entity);
          applied += 1;
        }

        for (const deletion of result.deletions ?? []) {
          if (applyPulledDeletion(deletion)) {
            applied += 1;
          } else {
            skippedLocalConflicts += 1;
          }
        }

        cursors = result.nextCursors;
        if (result.hasMore && pageCount >= 50) {
          throw new Error('Sync pull page limit reached before all changes were applied');
        }
        hasMore = Boolean(result.hasMore && cursors);
      } while (hasMore);

      await SecureStore.setItemAsync(lastSyncKey(userId), String(syncTime));
      refreshStores(userId);

      return {
        pulled,
        applied,
        skippedLocalConflicts,
        skipped: false,
      };
    } catch {
      return { pulled: 0, applied: 0, skippedLocalConflicts: 0, skipped: true, reason: 'network_error' };
    } finally {
      this.isPulling = false;
    }
  }

  pendingCount(): number {
    return syncQueueQueries.pendingCount();
  }

  async getDiagnostics(): Promise<SyncDiagnostics> {
    const userId = useAuthStore.getState().userId;
    const rawLastSync = userId ? await SecureStore.getItemAsync(lastSyncKey(userId)) : null;
    const lastFailedItem = syncQueueQueries.findFailed(1)[0];

    return {
      isOnline: this.isOnline,
      pending: syncQueueQueries.pendingCount(),
      failed: syncQueueQueries.failedCount(),
      lastSyncAt: rawLastSync ? Number(rawLastSync) : undefined,
      lastFailedItem: lastFailedItem ? {
        tableName: lastFailedItem.tableName,
        recordId: lastFailedItem.recordId,
        action: lastFailedItem.action,
        attempts: lastFailedItem.attempts,
        lastError: lastFailedItem.lastError,
      } : undefined,
    };
  }

  retryFailed(): void {
    syncQueueQueries.retryFailed();
  }
}

export const syncService = new SyncService();
