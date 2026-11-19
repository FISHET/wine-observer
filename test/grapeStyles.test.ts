import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import { DataFileError, parseGrapeStyles } from '../src/grapeStyles.ts';

describe('parseGrapeStyles', () => {
  test('reads style to grape', () => {
    const styles = parseGrapeStyles('{ "French Champagne": "Champagne Blend" }');
    assert.equal(styles.get('French Champagne'), 'Champagne Blend');
  });

  test('explains invalid JSON, naming the file', () => {
    assert.throws(() => parseGrapeStyles('{ "French Champagne": "Champagne Blend", }'), (error) => {
      assert.ok(error instanceof DataFileError);
      assert.match(error.message, /grape-styles\.json is not valid JSON/);
      return true;
    });
  });

  test('refuses a list, or a style with no grape', () => {
    assert.throws(() => parseGrapeStyles('["French Champagne"]'), DataFileError);
    assert.throws(() => parseGrapeStyles('{ "French Champagne": "" }'), /should map to a grape name/);
    assert.throws(() => parseGrapeStyles('{ "French Champagne": 3 }'), /should map to a grape name/);
  });

  // The real table is hand-edited and committed, so a typo should fail here
  // rather than on the page.
  test('the committed table parses', () => {
    const styles = parseGrapeStyles(readFileSync(new URL('../data/grape-styles.json', import.meta.url), 'utf8'));
    assert.equal(styles.get('French Champagne'), 'Champagne Blend');
  });
});
