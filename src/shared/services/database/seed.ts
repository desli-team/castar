import { v4 as uuid } from 'uuid';
import { eq, count } from 'drizzle-orm';
import { db } from './connection';
import { categories, accounts } from './schema';
import { defaultCategories } from '../../constants';

export function seedDefaults(userId: string): void {
  const [existing] = db
    .select({ cnt: count() })
    .from(categories)
    .where(eq(categories.userId, userId))
    .all();

  if (existing && existing.cnt > 0) return;

  const now = Date.now();

  db.transaction((tx) => {
    // Seed default categories
    tx.insert(categories)
      .values(
        defaultCategories.map((cat, i) => ({
          id: uuid(),
          userId,
          name: cat.nameKey,
          icon: cat.icon,
          color: cat.color,
          type: cat.type as 'income' | 'expense',
          isDefault: true,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .run();

    // Seed default Cash account
    tx.insert(accounts)
      .values({
        id: uuid(),
        userId,
        name: 'Cash',
        type: 'cash',
        currency: 'UZS',
        balance: 0,
        icon: '💵',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
}
