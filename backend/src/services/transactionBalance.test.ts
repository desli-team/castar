import assert from 'node:assert/strict';
import test from 'node:test';
import { getTransactionBalanceAdjustments } from './transactionBalance.ts';

test('new transaction applies balance once', () => {
  assert.deepEqual(
    getTransactionBalanceAdjustments(null, { accountId: 'account-1', type: 'expense', amount: 120 }),
    [{ accountId: 'account-1', type: 'expense', amount: 120 }],
  );
});

test('duplicate transaction create does not apply balance again', () => {
  assert.deepEqual(
    getTransactionBalanceAdjustments(
      { accountId: 'account-1', type: 'expense', amount: 120 },
      { accountId: 'account-1', type: 'expense', amount: 120 },
    ),
    [],
  );
});

test('changed account reverts old account and applies new account', () => {
  assert.deepEqual(
    getTransactionBalanceAdjustments(
      { accountId: 'account-1', type: 'expense', amount: 120 },
      { accountId: 'account-2', type: 'expense', amount: 120 },
    ),
    [
      { accountId: 'account-1', type: 'expense', amount: 120, revert: true },
      { accountId: 'account-2', type: 'expense', amount: 120 },
    ],
  );
});

test('changed amount reverts old amount and applies new amount', () => {
  assert.deepEqual(
    getTransactionBalanceAdjustments(
      { accountId: 'account-1', type: 'income', amount: 120 },
      { accountId: 'account-1', type: 'income', amount: 200 },
    ),
    [
      { accountId: 'account-1', type: 'income', amount: 120, revert: true },
      { accountId: 'account-1', type: 'income', amount: 200 },
    ],
  );
});
