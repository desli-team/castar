import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    remoteId: text('remote_id'),
    userId: text('user_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action', { enum: ['create', 'update', 'delete', 'restore', 'settle'] }).notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    source: text('source').notNull().default('app'),
    createdAt: integer('created_at').notNull(),
    syncedAt: integer('synced_at'),
  },
  (table) => [
    index('idx_audit_logs_user_created').on(table.userId, table.createdAt),
    index('idx_audit_logs_entity').on(table.entityType, table.entityId),
  ],
);
