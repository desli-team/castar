import { useRecurringStore } from '../../../features/recurring/store/recurringStore';
import { useTransactionStore } from '../../../features/transactions/store/transactionStore';
import * as accountQueries from '../database/accountQueries';
import * as recurringQueries from '../database/recurringQueries';
import * as transactionQueries from '../database/transactionQueries';
import * as auditLogQueries from '../database/auditLogQueries';
import { syncService } from '../sync/syncService';
import type { RecurringTransaction, Transaction } from '../../types';

const MAX_GENERATIONS_PER_RUN = 24;

export interface RecurringCatchUpResult {
  checked: number;
  generated: number;
  advanced: number;
  skippedDuplicates: number;
}

const generateUUID = (): string => {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
    else if (i === 14) uuid += '4';
    else if (i === 19) uuid += hex[(Math.random() * 4 | 0) + 8];
    else uuid += hex[Math.random() * 16 | 0];
  }
  return uuid;
};

function nextOccurrence(from: number, frequency: RecurringTransaction['frequency']) {
  const date = new Date(from);
  if (frequency === 'daily') date.setDate(date.getDate() + 1);
  if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
  if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1);
  return date.getTime();
}

function transactionExistsFor(recurringId: string, date: number) {
  return transactionQueries
    .findAll()
    .some((transaction) => transaction.recurringId === recurringId && transaction.date === date);
}

function transactionFromRecurring(rule: RecurringTransaction, date: number, now: number): Transaction {
  return {
    id: generateUUID(),
    userId: rule.userId,
    accountId: rule.accountId,
    categoryId: rule.categoryId,
    type: rule.type,
    amount: rule.amount,
    currency: rule.currency,
    description: rule.description,
    date,
    isRecurring: true,
    recurringId: rule.id,
    voiceInput: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runRecurringCatchUp(userId: string, now = Date.now()): Promise<RecurringCatchUpResult> {
  const dueRules = recurringQueries
    .findDue(now)
    .filter((rule) => rule.userId === userId);

  const result: RecurringCatchUpResult = {
    checked: dueRules.length,
    generated: 0,
    advanced: 0,
    skippedDuplicates: 0,
  };

  for (const rule of dueRules) {
    let nextDate = rule.nextDate;
    let generatedForRule = 0;

    while (nextDate <= now && generatedForRule < MAX_GENERATIONS_PER_RUN) {
      if (transactionExistsFor(rule.id, nextDate)) {
        result.skippedDuplicates += 1;
      } else {
        const transaction = transactionFromRecurring(rule, nextDate, now);
        transactionQueries.insert(transaction);
        accountQueries.adjustBalance(rule.accountId, rule.type === 'expense' ? -rule.amount : rule.amount);
        useTransactionStore.getState().addTransaction(transaction);
        await syncService.queueChange('transactions', transaction.id, 'create', transaction);
        const auditLog = auditLogQueries.record({
          userId: rule.userId,
          entityType: 'transactions',
          entityId: transaction.id,
          action: 'create',
          after: transaction,
          source: 'recurring_catch_up',
        });
        await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
        result.generated += 1;
      }

      nextDate = nextOccurrence(nextDate, rule.frequency);
      generatedForRule += 1;
    }

    if (nextDate !== rule.nextDate) {
      const patch = { nextDate, updatedAt: Date.now() };
      const updatedRule = { ...rule, ...patch };
      recurringQueries.update(rule.id, patch);
      useRecurringStore.getState().updateRecurring(rule.id, patch);
      await syncService.queueChange('recurrings', rule.id, 'update', updatedRule);
      const auditLog = auditLogQueries.record({
        userId: rule.userId,
        entityType: 'recurrings',
        entityId: rule.id,
        action: 'update',
        before: rule,
        after: updatedRule,
        source: 'recurring_catch_up',
      });
      await syncService.queueChange('audit_logs', auditLog.id, 'create', auditLog);
      result.advanced += 1;
    }
  }

  return result;
}
