import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const i18nDir = new URL('.', import.meta.url);
const placeholderPattern = /\[[A-ZА-ЯЁІЇЄЎҚҒҲÄÖÜÇƏİŞĞ0-9_./ -]+\]/;

test('legal i18n copy does not contain release-blocking placeholders', () => {
  const files = readdirSync(i18nDir).filter((file) => file.endsWith('.json'));

  for (const file of files) {
    const content = readFileSync(new URL(file, i18nDir), 'utf8');
    assert.equal(placeholderPattern.test(content), false, `${file} contains an unreplaced legal placeholder`);
  }
});
