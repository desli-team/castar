import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import test from 'node:test';

const migrationsDir = new URL('../../migrations/', import.meta.url);

function readMigration(fileName: string): string {
  return readFileSync(new URL(fileName, migrationsDir), 'utf8');
}

function hasSqlStatement(sql: string): boolean {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').trim())
    .join('\n')
    .trim()
    .length > 0;
}

test('all migration files contain executable SQL', () => {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  assert.ok(files.length >= 13);
  for (const file of files) {
    assert.equal(hasSqlStatement(readMigration(file)), true, `${file} must contain executable SQL`);
  }
});

test('fresh local migration scripts apply every migration file in order', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };

  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const script = packageJson.scripts['db:migrate:local:fresh'];

  for (const file of migrationFiles) {
    assert.ok(script.includes(`migrations/${file}`), `${basename(file)} missing from db:migrate:local:fresh`);
  }
});

test('baseline migration does not duplicate additive latest migrations', () => {
  const baseline = readMigration('0001_initial.sql');
  const additiveColumns = ['reviewed INTEGER', 'role TEXT', 'premium_until INTEGER', 'subscription_status TEXT'];

  for (const column of additiveColumns) {
    assert.equal(baseline.includes(column), false, `0001_initial.sql must not include ${column}`);
  }

  assert.equal(baseline.includes('CREATE TABLE IF NOT EXISTS subscriptions'), false);
  assert.equal(baseline.includes('CREATE TABLE IF NOT EXISTS sync_devices'), false);
});
