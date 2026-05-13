import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { categories } from './categories';

export const debts = sqliteTable(
  'debts',
  {
    id: text('id').primaryKey(),
    remoteId: text('remote_id'),
    userId: text('user_id').notNull(),
    personName: text('person_name').notNull(),
    direction: text('direction', { enum: ['i_owe', 'owes_me'] }).notNull(),
    principalAmount: real('principal_amount').notNull(),
    remainingAmount: real('remaining_amount').notNull(),
    currency: text('currency').notNull().default('UZS'),
    categoryId: text('category_id').references(() => categories.id),
    accountId: text('account_id').references(() => accounts.id),
    dueDate: integer('due_date'),
    note: text('note'),
    status: text('status', { enum: ['active', 'settled'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    settledAt: integer('settled_at'),
    syncedAt: integer('synced_at'),
  },
  (table) => [
    index('idx_debts_user_status').on(table.userId, table.status),
    index('idx_debts_person').on(table.userId, table.personName),
  ],
);
