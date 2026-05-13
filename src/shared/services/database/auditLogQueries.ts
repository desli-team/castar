import { desc, eq } from 'drizzle-orm';
import { db } from './connection';
import { auditLogs } from './schema/auditLogs';
import type { AuditLog, AuditLogAction } from '../../types';

export type NewAuditLog = typeof auditLogs.$inferInsert;

export interface RecordAuditLogInput {
  userId: string;
  entityType: string;
  entityId: string;
  action: AuditLogAction;
  before?: unknown;
  after?: unknown;
  source?: string;
}

function generateUUID(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
    else if (i === 14) uuid += '4';
    else if (i === 19) uuid += hex[(Math.random() * 4 | 0) + 8];
    else uuid += hex[Math.random() * 16 | 0];
  }
  return uuid;
}

function safeStringify(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export function findById(id: string): AuditLog | undefined {
  return db.select().from(auditLogs).where(eq(auditLogs.id, id)).get() as AuditLog | undefined;
}

export function findByUser(userId: string, limit = 100): AuditLog[] {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .all() as AuditLog[];
}

export function insert(entity: NewAuditLog): void {
  db.insert(auditLogs).values(entity).run();
}

export function update(id: string, data: Partial<NewAuditLog>): void {
  db.update(auditLogs).set(data).where(eq(auditLogs.id, id)).run();
}

export function record(input: RecordAuditLogInput): AuditLog {
  const now = Date.now();
  const entity: AuditLog = {
    id: generateUUID(),
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    beforeJson: safeStringify(input.before),
    afterJson: safeStringify(input.after),
    source: input.source ?? 'app',
    createdAt: now,
  };

  insert(entity);
  return entity;
}
