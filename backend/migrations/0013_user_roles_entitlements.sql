-- Formalize Castar user roles, premium lifecycle, and sync-device entitlement tracking.
-- Safe additive migration for existing D1 databases.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN premium_until INTEGER;
ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'premium',
  status TEXT NOT NULL DEFAULT 'none',
  current_period_end INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_id ON subscriptions(provider, provider_subscription_id);

CREATE TABLE IF NOT EXISTS sync_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  platform TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_user_active ON sync_devices(user_id, is_active, last_seen_at);
