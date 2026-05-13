import { eq, sql } from 'drizzle-orm';
import { db } from './connection';
import { debtRepayments } from './schema';
import type { DebtRepayment } from '../../types';

type NewDebtRepayment = typeof debtRepayments.$inferInsert;

export function findById(id: string): DebtRepayment | undefined {
  return db.select().from(debtRepayments).where(eq(debtRepayments.id, id)).get() as unknown as DebtRepayment | undefined;
}

export function findAll(): DebtRepayment[] {
  return db.select().from(debtRepayments).all() as unknown as DebtRepayment[];
}

export function findByDebt(debtId: string): DebtRepayment[] {
  return db
    .select()
    .from(debtRepayments)
    .where(eq(debtRepayments.debtId, debtId))
    .orderBy(debtRepayments.date)
    .all() as unknown as DebtRepayment[];
}

export function sumByDebt(debtId: string): number {
  const [result] = db
    .select({ total: sql<number>`COALESCE(SUM(${debtRepayments.amount}), 0)` })
    .from(debtRepayments)
    .where(eq(debtRepayments.debtId, debtId))
    .all();
  return result?.total ?? 0;
}

export function insert(entity: NewDebtRepayment): void {
  db.insert(debtRepayments).values(entity).run();
}

export function update(id: string, data: Partial<NewDebtRepayment>): void {
  db.update(debtRepayments).set(data).where(eq(debtRepayments.id, id)).run();
}

function _delete(id: string): void {
  db.delete(debtRepayments).where(eq(debtRepayments.id, id)).run();
}
export { _delete as delete };
