import { and, eq, lt, gte, count as drizzleCount, asc, desc } from 'drizzle-orm';
import { generateUUID } from '../../utils/uuid';
import { db } from './connection';
import { syncQueue } from './schema';
import type { SyncAction, SyncQueueItem } from '../../types';

type NewSyncQueueItem = typeof syncQueue.$inferInsert;

type CompactedChange = {
  action: SyncAction;
  data: unknown;
} | null;

function hasRemoteIdentity(data: unknown): boolean {
  return Boolean(
    data &&
    typeof data === 'object' &&
    'remoteId' in data &&
    typeof (data as { remoteId?: unknown }).remoteId === 'string' &&
    (data as { remoteId?: string }).remoteId,
  );
}

function compactChange(existing: CompactedChange, incoming: CompactedChange): CompactedChange {
  if (!incoming) return existing;
  if (!existing) return incoming;

  if (existing.action === 'create') {
    if (incoming.action === 'delete') {
      // Created locally and deleted before sync: server never needs to know.
      return null;
    }

    // Create followed by update/create remains one create with the freshest payload.
    return { action: 'create', data: incoming.data };
  }

  if (existing.action === 'update') {
    if (incoming.action === 'delete') {
      return { action: 'delete', data: incoming.data };
    }

    // Multiple updates collapse to the freshest update. An incoming create for an
    // already-known remote record is effectively an update; without remote id it
    // must be sent as create.
    return {
      action: incoming.action === 'create' && !hasRemoteIdentity(incoming.data) ? 'create' : 'update',
      data: incoming.data,
    };
  }

  // Existing delete.
  if (incoming.action === 'create') {
    // Undo delete before sync: remote records only need an update/no-op payload,
    // while unsynced local records still need a create.
    return {
      action: hasRemoteIdentity(incoming.data) ? 'update' : 'create',
      data: incoming.data,
    };
  }

  if (incoming.action === 'update') {
    // Deleted records should stay deleted; keep the newest delete metadata.
    return existing;
  }

  return { action: 'delete', data: incoming.data };
}

export function findById(id: string): SyncQueueItem | undefined {
  return db.select().from(syncQueue).where(eq(syncQueue.id, id)).get() as unknown as SyncQueueItem | undefined;
}

export function findAll(): SyncQueueItem[] {
  return db.select().from(syncQueue).all() as unknown as SyncQueueItem[];
}

export function findByRecord(tableName: string, recordId: string): SyncQueueItem[] {
  return db
    .select()
    .from(syncQueue)
    .where(and(eq(syncQueue.tableName, tableName), eq(syncQueue.recordId, recordId)))
    .orderBy(asc(syncQueue.createdAt))
    .all() as unknown as SyncQueueItem[];
}

function clearByRecord(tableName: string, recordId: string): void {
  db.delete(syncQueue)
    .where(and(eq(syncQueue.tableName, tableName), eq(syncQueue.recordId, recordId)))
    .run();
}

export function enqueue(tableName: string, recordId: string, action: SyncAction, data: unknown): void {
  const existingItems = findByRecord(tableName, recordId);
  const compacted = [...existingItems, { action, data }].reduce<CompactedChange>((current, item) => {
    const itemData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
    return compactChange(current, { action: item.action as SyncAction, data: itemData });
  }, null);

  clearByRecord(tableName, recordId);

  if (!compacted) return;

  db.insert(syncQueue)
    .values({
      id: generateUUID(),
      tableName,
      recordId,
      action: compacted.action,
      data: JSON.stringify(compacted.data),
      createdAt: Date.now(),
      attempts: 0,
    })
    .run();
}

export function findPending(limit = 50): SyncQueueItem[] {
  return db
    .select()
    .from(syncQueue)
    .where(lt(syncQueue.attempts, 3))
    .orderBy(asc(syncQueue.createdAt))
    .limit(limit)
    .all() as unknown as SyncQueueItem[];
}

export function markSynced(id: string): void {
  db.delete(syncQueue).where(eq(syncQueue.id, id)).run();
}

export function recordFailure(id: string, error: string): void {
  const item = db.select().from(syncQueue).where(eq(syncQueue.id, id)).get();
  if (!item) return;
  db.update(syncQueue)
    .set({ attempts: item.attempts + 1, lastError: error })
    .where(eq(syncQueue.id, id))
    .run();
}

export function pendingCount(): number {
  const [result] = db
    .select({ cnt: drizzleCount() })
    .from(syncQueue)
    .where(lt(syncQueue.attempts, 3))
    .all();
  return result?.cnt ?? 0;
}

export function failedCount(): number {
  const [result] = db
    .select({ cnt: drizzleCount() })
    .from(syncQueue)
    .where(gte(syncQueue.attempts, 3))
    .all();
  return result?.cnt ?? 0;
}

export function findFailed(limit = 5): SyncQueueItem[] {
  return db
    .select()
    .from(syncQueue)
    .where(gte(syncQueue.attempts, 3))
    .orderBy(desc(syncQueue.createdAt))
    .limit(limit)
    .all() as unknown as SyncQueueItem[];
}

export function retryFailed(): void {
  db.update(syncQueue)
    .set({ attempts: 0, lastError: null })
    .where(gte(syncQueue.attempts, 3))
    .run();
}

export function clearAll(): void {
  db.delete(syncQueue).run();
}

export function insert(entity: NewSyncQueueItem): void {
  db.insert(syncQueue).values(entity).run();
}

export function update(id: string, data: Partial<NewSyncQueueItem>): void {
  db.update(syncQueue).set(data).where(eq(syncQueue.id, id)).run();
}

function _delete(id: string): void {
  db.delete(syncQueue).where(eq(syncQueue.id, id)).run();
}
export { _delete as delete };
