import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { budgets } from './budgets';

export const budgetAlerts = sqliteTable(
  'budget_alerts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    budgetId: text('budget_id').notNull().references(() => budgets.id),
    level: text('level', { enum: ['warning', 'critical', 'over'] }).notNull(),
    periodStart: integer('period_start').notNull(),
    spent: real('spent').notNull(),
    limitAmount: real('limit_amount').notNull(),
    percentage: real('percentage').notNull(),
    acknowledgedAt: integer('acknowledged_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_budget_alerts_user').on(table.userId, table.createdAt),
    index('idx_budget_alerts_budget_period').on(table.budgetId, table.periodStart),
  ]
);
