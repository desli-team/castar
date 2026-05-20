import assert from 'node:assert/strict';
import test from 'node:test';
import { generateOtpCode } from './otp.ts';

test('generates four digit otp codes using the production helper', () => {
  for (let i = 0; i < 100; i += 1) {
    const code = generateOtpCode();
    assert.match(code, /^[1-9]\d{3}$/);
    assert.ok(Number(code) >= 1000);
    assert.ok(Number(code) <= 9999);
  }
});
