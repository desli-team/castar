import { z } from 'zod';

export const createTransactionSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  categoryId: z.string().min(1, 'Category is required'),
  familyGroupId: z.string().optional(),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive('Amount must be greater than 0'),
  currency: z.string().min(1),
  description: z.string().max(500).optional(),
  date: z.number().positive(),
  voiceInput: z.boolean().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const createBudgetSchema = z.object({
  familyGroupId: z.string().optional(),
  categoryId: z.string().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  amount: z.number().positive('Amount must be greater than 0'),
  currency: z.string().min(1),
  period: z.enum(['daily', 'weekly', 'fourteen_days', 'monthly', 'yearly']),
  startDate: z.number().positive(),
  endDate: z.number().optional(),
});

export const updateBudgetSchema = createBudgetSchema.partial();

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color'),
  type: z.enum(['income', 'expense']),
  parentId: z.string().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  type: z.enum(['cash', 'card', 'bank', 'savings']),
  currency: z.string().min(1),
  balance: z.number().default(0),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const createRecurringSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  currency: z.string().min(1),
  description: z.string().max(500).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  nextDate: z.number().positive(),
});
