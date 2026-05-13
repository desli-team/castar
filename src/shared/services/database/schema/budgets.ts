import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { categories } from './categories';

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    remoteId: text('remote_id'),
    userId: text('user_id').notNull(),
    familyGroupId: text('family_group_id'),
    categoryId: text('category_id').references(() => categories.id),
    name: text('name').notNull(),
    amount: real('amount').notNull(),
    currency: text('currency').notNull().default('UZS'),
    period: text('period', { enum: ['daily', 'weekly', 'fourteen_days', 'monthly', 'yearly'] }).notNull(),
    startDate: integer('start_date').notNull(),
    endDate: integer('end_date'),
    warningThreshold: real('warning_threshold').notNull().default(80),
    criticalThreshold: real('critical_threshold').notNull().default(100),
    isHardLimit: integer('is_hard_limit', { mode: 'boolean' }).notNull().default(false),
    rolloverEnabled: integer('rollover_enabled', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    syncedAt: integer('synced_at'),
  },
  (table) => [index('idx_budgets_user').on(table.userId, table.isActive)]
);
