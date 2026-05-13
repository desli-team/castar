import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    remoteId: text('remote_id'),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('📁'),
    color: text('color').notNull().default('#808080'),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    syncedAt: integer('synced_at'),
  },
  (table) => [index('idx_categories_user').on(table.userId)]
);
