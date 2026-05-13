import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './connection';
import { budgetAlerts } from './schema';

export type BudgetAlertLevel = 'warning' | 'critical' | 'over';

export interface BudgetAlert {
  id: string;
  userId: string;
  budgetId: string;
  level: BudgetAlertLevel;
  periodStart: number;
  spent: number;
  limitAmount: number;
  percentage: number;
  acknowledgedAt?: number;
  createdAt: number;
}

type NewBudgetAlert = typeof budgetAlerts.$inferInsert;

function generateBudgetAlertId(budgetId: string, periodStart: number, level: BudgetAlertLevel) {
  return `${budgetId}:${periodStart}:${level}`;
}

export function findByUser(userId: string, limit = 30): BudgetAlert[] {
  return db
    .select()
    .from(budgetAlerts)
    .where(eq(budgetAlerts.userId, userId))
    .orderBy(desc(budgetAlerts.createdAt))
    .limit(limit)
    .all() as unknown as BudgetAlert[];
}

export function findUnacknowledgedByUser(userId: string, limit = 30): BudgetAlert[] {
  return db
    .select()
    .from(budgetAlerts)
    .where(and(eq(budgetAlerts.userId, userId), isNull(budgetAlerts.acknowledgedAt)))
    .orderBy(desc(budgetAlerts.createdAt))
    .limit(limit)
    .all() as unknown as BudgetAlert[];
}

export function countUnacknowledged(userId: string): number {
  return findUnacknowledgedByUser(userId, 100).length;
}

export function exists(budgetId: string, periodStart: number, level: BudgetAlertLevel): boolean {
  const row = db
    .select({ id: budgetAlerts.id })
    .from(budgetAlerts)
    .where(and(eq(budgetAlerts.budgetId, budgetId), eq(budgetAlerts.periodStart, periodStart), eq(budgetAlerts.level, level)))
    .get();
  return Boolean(row);
}

export function insertIfMissing(input: Omit<NewBudgetAlert, 'id'>): BudgetAlert | undefined {
  if (exists(input.budgetId, input.periodStart, input.level)) return undefined;
  const entity: NewBudgetAlert = {
    ...input,
    id: generateBudgetAlertId(input.budgetId, input.periodStart, input.level),
  };
  db.insert(budgetAlerts).values(entity).run();
  return entity as unknown as BudgetAlert;
}

export function acknowledge(id: string): void {
  db.update(budgetAlerts).set({ acknowledgedAt: Date.now() }).where(eq(budgetAlerts.id, id)).run();
}
