export { db, initEncryptedDb } from './connection';
export { runMigrations } from './migrations';
export { seedDefaults } from './seed';

import * as categoryQueries from './categoryQueries';
import * as accountQueries from './accountQueries';
import * as transactionQueries from './transactionQueries';
import * as budgetQueries from './budgetQueries';
import * as recurringQueries from './recurringQueries';
import * as debtQueries from './debtQueries';
import * as debtRepaymentQueries from './debtRepaymentQueries';
import * as budgetAlertQueries from './budgetAlertQueries';
import * as auditLogQueries from './auditLogQueries';
import * as syncQueueQueries from './syncQueueQueries';

// Preserve old names so stores don't need changes
export const categoryRepository = categoryQueries;
export const accountRepository = accountQueries;
export const transactionRepository = transactionQueries;
export const budgetRepository = budgetQueries;
export const recurringRepository = recurringQueries;
export const debtRepository = debtQueries;
export const debtRepaymentRepository = debtRepaymentQueries;
export const budgetAlertRepository = budgetAlertQueries;
export const auditLogRepository = auditLogQueries;
export const syncQueueRepository = syncQueueQueries;

/** Initialize database: run migrations and seed defaults. */
export async function initDatabase(userId: string): Promise<void> {
  const { runMigrations: run } = require('./migrations');
  const { seedDefaults: seed } = require('./seed');
  await run();
  seed(userId);
}
