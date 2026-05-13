import type { Category } from '../../types';

export const FREE_CUSTOM_CATEGORY_LIMIT = 0;

export function isPaidTier(tier?: string | null): boolean {
  return Boolean(tier && tier !== 'free');
}

export function customCategoryLimit(tier?: string | null): number {
  return isPaidTier(tier) ? Number.POSITIVE_INFINITY : FREE_CUSTOM_CATEGORY_LIMIT;
}

export function customCategoryCount(categories: Category[]): number {
  return categories.filter((category) => !category.isDefault).length;
}

export function canCreateCustomCategory(categories: Category[], tier?: string | null): boolean {
  return customCategoryCount(categories) < customCategoryLimit(tier);
}

export function isLockedOtherCategory(category?: Pick<Category, 'name' | 'isDefault'> | null): boolean {
  return Boolean(
    category?.isDefault &&
    (category.name === 'categories.other_expense' || category.name === 'categories.other_income')
  );
}

export function getOtherCategory(type: Category['type'], categories: Category[]): Category | undefined {
  const key = type === 'income' ? 'categories.other_income' : 'categories.other_expense';
  return categories.find((category) => category.type === type && category.name === key)
    ?? categories.find((category) => category.type === type && category.isDefault && /other/i.test(category.name))
    ?? categories.find((category) => category.type === type && /other/i.test(category.name));
}
