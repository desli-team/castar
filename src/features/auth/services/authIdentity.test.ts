import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCanonicalAuthUserId,
  getEmailAuthUserId,
  getLegacyAuthUserIds,
  getPhoneAuthUserId,
  getTelegramAuthUserId,
  normalizeAuthPhone,
} from './authIdentity.ts';

test('matches backend user id format for telegram users', () => {
  assert.equal(getTelegramAuthUserId('123456789'), 'tg_123456789');
  assert.equal(getCanonicalAuthUserId({ id: '123456789', first_name: 'Ali' }), 'tg_123456789');
});

test('matches backend user id format for email users', () => {
  assert.equal(getEmailAuthUserId(' User.Name+test@Example.COM '), 'email_user_name_test_example_com');
  assert.equal(getCanonicalAuthUserId({ id: 'User.Name+test@Example.COM' }), 'email_user_name_test_example_com');
});

test('matches backend user id format for phone users', () => {
  assert.equal(normalizeAuthPhone('+998 90 123-45-67'), '+998901234567');
  assert.equal(getPhoneAuthUserId('+998 90 123-45-67'), 'phone_998901234567');
  assert.equal(getCanonicalAuthUserId({ id: '+998 90 123-45-67' }), 'phone_998901234567');
});

test('returns legacy ids needed for local SQLite migration', () => {
  assert.deepEqual(
    getLegacyAuthUserIds({ id: 'User.Name+test@Example.COM' }, 'email_user_name_test_example_com').sort(),
    ['user.name+test@example.com', 'User.Name+test@Example.COM'].sort(),
  );
  assert.deepEqual(
    getLegacyAuthUserIds({ id: '123456789', first_name: 'Ali' }, 'tg_123456789'),
    ['123456789'],
  );
});
