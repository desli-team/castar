import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { categories } from './categories';

export const recurrings = sqliteTable('recurrings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('UZS'),
  description: text('description'),
  frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
  nextDate: integer('next_date').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
