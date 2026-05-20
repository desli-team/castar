import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVoiceRecognitionHeaders } from './voiceAuthHeaders.ts';

test('voice recognition sends jwt without overriding multipart boundary', () => {
  assert.deepEqual(buildVoiceRecognitionHeaders('token-123'), { Authorization: 'Bearer token-123' });
  assert.equal(buildVoiceRecognitionHeaders(null), undefined);
});
