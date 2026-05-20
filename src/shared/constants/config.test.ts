import test from 'node:test';
import assert from 'node:assert/strict';
import { TELEGRAM_CONFIG } from './config.ts';

test('backend API points to the configured Castar API host without trailing slash', () => {
  assert.equal(TELEGRAM_CONFIG.workerUrl, 'https://apicastar.desli.uz');
});
