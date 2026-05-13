export type UserTier = 'free' | 'premium';
export type UserRole = 'user' | 'support' | 'admin';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface UserAccess {
  tier: UserTier;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  premiumUntil: number | null;
  entitlements: {
    canCreateCustomCategories: boolean;
    canUseAnalyticsPro: boolean;
    canUseBudgetAlerts: boolean;
    canUseRecurringAutomation: boolean;
    canUseMultiDeviceSync: boolean;
    maxSyncDevices: number;
  };
}

export interface UserAccessRow {
  tier?: string | null;
  role?: string | null;
  subscription_status?: string | null;
  premium_until?: number | null;
}

export const FREE_TIER: UserTier = 'free';
export const PREMIUM_TIER: UserTier = 'premium';

const USER_ROLES = new Set(['user', 'support', 'admin']);
const SUBSCRIPTION_STATUSES = new Set(['none', 'trialing', 'active', 'past_due', 'canceled']);

export function normalizeTier(tier: string | null | undefined): UserTier {
  return tier === PREMIUM_TIER ? PREMIUM_TIER : FREE_TIER;
}

export function normalizeRole(role: string | null | undefined): UserRole {
  return USER_ROLES.has(role ?? '') ? (role as UserRole) : 'user';
}

export function normalizeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.has(status ?? '') ? (status as SubscriptionStatus) : 'none';
}

export function buildUserAccess(row?: UserAccessRow | null, now = Date.now()): UserAccess {
  const role = normalizeRole(row?.role);
  const subscriptionStatus = normalizeSubscriptionStatus(row?.subscription_status);
  const premiumUntil = typeof row?.premium_until === 'number' ? row.premium_until : null;
  const tier = normalizeTier(row?.tier);
  const premiumActive = tier === PREMIUM_TIER
    && subscriptionStatus !== 'canceled'
    && (premiumUntil === null || premiumUntil > now);
  const elevatedRole = role === 'admin' || role === 'support';
  const paid = premiumActive || elevatedRole;

  return {
    tier: paid ? PREMIUM_TIER : FREE_TIER,
    role,
    subscriptionStatus,
    premiumUntil,
    entitlements: {
      canCreateCustomCategories: paid,
      canUseAnalyticsPro: paid,
      canUseBudgetAlerts: paid,
      canUseRecurringAutomation: paid,
      canUseMultiDeviceSync: paid,
      maxSyncDevices: paid ? 5 : 1,
    },
  };
}

export async function getUserAccess(db: D1Database, userId: string): Promise<UserAccess> {
  const row = await db
    .prepare('SELECT tier, role, subscription_status, premium_until FROM users WHERE id = ?')
    .bind(userId)
    .first<UserAccessRow>();

  return buildUserAccess(row);
}
