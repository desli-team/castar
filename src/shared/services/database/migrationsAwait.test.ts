import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('startup awaits Expo SQLite migrations before reading tables', () => {
  const providerSource = readFileSync(new URL('../../../core/providers/AppProviders.tsx', import.meta.url), 'utf8');
  const migrationSource = readFileSync(new URL('./migrations.ts', import.meta.url), 'utf8');

  assert.match(
    migrationSource,
    /export\s+async\s+function\s+runMigrations\s*\([^)]*\)\s*:\s*Promise<void>/,
    'runMigrations must stay async because the Expo migrator reads migration files asynchronously'
  );
  assert.match(
    migrationSource,
    /await\s+migrate\s*\(/,
    'runMigrations must await Drizzle migrate() before applying schema patches'
  );
  assert.match(
    providerSource,
    /await\s+runMigrations\s*\(\s*\)/,
    'AppProviders must await migrations before loading Zustand stores from SQLite'
  );
});
