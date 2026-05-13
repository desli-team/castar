import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserAccess } from './entitlements.ts';

test('free user gets starter entitlements only', () => {
  const access = buildUserAccess({ tier: 'free', role: 'user', subscription_status: 'none', premium_until: null }, 1000);
  assert.equal(access.tier, 'free');
  assert.equal(access.role, 'user');
  assert.equal(access.entitlements.canCreateCustomCategories, false);
  assert.equal(access.entitlements.canUseMultiDeviceSync, false);
  assert.equal(access.entitlements.maxSyncDevices, 1);
});

test('active premium user gets paid entitlements without voice limit changes', () => {
  const access = buildUserAccess({ tier: 'premium', role: 'user', subscription_status: 'active', premium_until: 2000 }, 1000);
  assert.equal(access.tier, 'premium');
  assert.equal(access.entitlements.canCreateCustomCategories, true);
  assert.equal(access.entitlements.canUseAnalyticsPro, true);
  assert.equal(access.entitlements.canUseBudgetAlerts, true);
  assert.equal(access.entitlements.canUseRecurringAutomation, true);
  assert.equal(access.entitlements.canUseMultiDeviceSync, true);
  assert.equal(access.entitlements.maxSyncDevices, 5);
  assert.equal('canUseVoiceAi' in access.entitlements, false);
});

test('expired premium falls back to free entitlements', () => {
  const access = buildUserAccess({ tier: 'premium', role: 'user', subscription_status: 'active', premium_until: 500 }, 1000);
  assert.equal(access.tier, 'free');
  assert.equal(access.entitlements.maxSyncDevices, 1);
});

test('support/admin roles get operational paid access', () => {
  const access = buildUserAccess({ tier: 'free', role: 'support', subscription_status: 'none', premium_until: null }, 1000);
  assert.equal(access.tier, 'premium');
  assert.equal(access.role, 'support');
  assert.equal(access.entitlements.canUseMultiDeviceSync, true);
});
