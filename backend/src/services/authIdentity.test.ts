import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEmailUserId,
  getPhoneUserId,
  getTelegramUserId,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from './authIdentity.ts';

test('normalizes email identity exactly like backend JWT sub format', () => {
  assert.equal(normalizeEmail(' User.Name+test@Example.COM '), 'user.name+test@example.com');
  assert.equal(getEmailUserId(' User.Name+test@Example.COM '), 'email_user_name_test_example_com');
  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
});

test('normalizes phone identity exactly like backend JWT sub format', () => {
  assert.equal(normalizePhone('+998 90 123-45-67'), '+998901234567');
  assert.equal(getPhoneUserId('+998 90 123-45-67'), 'phone_998901234567');
  assert.equal(isValidPhone('+998 90 123-45-67'), true);
  assert.equal(isValidPhone('123'), false);
});

test('normalizes telegram identity exactly like backend JWT sub format', () => {
  assert.equal(getTelegramUserId('123456789'), 'tg_123456789');
  assert.equal(getTelegramUserId('tg_123456789'), 'tg_123456789');
});
