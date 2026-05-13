import { eq, and, desc } from 'drizzle-orm';
import { db } from './connection';
import { debts } from './schema';
import type { Debt, DebtStatus } from '../../types';

type NewDebt = typeof debts.$inferInsert;

export function findById(id: string): Debt | undefined {
  return db.select().from(debts).where(eq(debts.id, id)).get() as unknown as Debt | undefined;
}

export function findAll(): Debt[] {
  return db.select().from(debts).orderBy(desc(debts.updatedAt)).all() as unknown as Debt[];
}

export function findByUser(userId: string): Debt[] {
  return db
    .select()
    .from(debts)
    .where(eq(debts.userId, userId))
    .orderBy(desc(debts.updatedAt))
    .all() as unknown as Debt[];
}

export function findByStatus(userId: string, status: DebtStatus): Debt[] {
  return db
    .select()
    .from(debts)
    .where(and(eq(debts.userId, userId), eq(debts.status, status)))
    .orderBy(desc(debts.updatedAt))
    .all() as unknown as Debt[];
}

export function findActiveByUser(userId: string): Debt[] {
  return findByStatus(userId, 'active');
}

export function findSettledByUser(userId: string): Debt[] {
  return findByStatus(userId, 'settled');
}

export function insert(entity: NewDebt): void {
  db.insert(debts).values(entity).run();
}

export function update(id: string, data: Partial<NewDebt>): void {
  db.update(debts).set(data).where(eq(debts.id, id)).run();
}

export function markSettled(id: string, settledAt = Date.now()): void {
  db.update(debts)
    .set({ remainingAmount: 0, status: 'settled', settledAt, updatedAt: settledAt })
    .where(eq(debts.id, id))
    .run();
}

function _delete(id: string): void {
  db.delete(debts).where(eq(debts.id, id)).run();
}
export { _delete as delete };
