import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { categories } from './categories';

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    remoteId: text('remote_id'),
    userId: text('user_id').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    familyGroupId: text('family_group_id'),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    amount: real('amount').notNull(),
    currency: text('currency').notNull().default('UZS'),
    amountInDefault: real('amount_in_default'),
    exchangeRate: real('exchange_rate'),
    description: text('description'),
    date: integer('date').notNull(),
    isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
    recurringId: text('recurring_id'),
    debtId: text('debt_id'),
    voiceInput: integer('voice_input', { mode: 'boolean' }).notNull().default(false),
    reviewed: integer('reviewed', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    syncedAt: integer('synced_at'),
  },
  (table) => [
    index('idx_transactions_user_date').on(table.userId, table.date),
    index('idx_transactions_category').on(table.categoryId),
  ]
);
