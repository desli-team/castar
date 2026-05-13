import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { debts } from './debts';
import { transactions } from './transactions';

export const debtRepayments = sqliteTable(
  'debt_repayments',
  {
    id: text('id').primaryKey(),
    remoteId: text('remote_id'),
    userId: text('user_id').notNull(),
    debtId: text('debt_id').notNull().references(() => debts.id),
    transactionId: text('transaction_id').references(() => transactions.id),
    accountId: text('account_id').references(() => accounts.id),
    amount: real('amount').notNull(),
    currency: text('currency').notNull().default('UZS'),
    note: text('note'),
    date: integer('date').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    syncedAt: integer('synced_at'),
  },
  (table) => [
    index('idx_debt_repayments_user').on(table.userId, table.createdAt),
    index('idx_debt_repayments_debt').on(table.debtId, table.date),
  ],
);
