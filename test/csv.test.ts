import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { countRecords } from '../src/csv.ts';

describe('countRecords', () => {
  test('ignores the header row', () => {
    assert.equal(countRecords('iWine,Wine\n1,A\n2,B\n'), 2);
  });

  test('copes with a missing trailing newline', () => {
    assert.equal(countRecords('iWine,Wine\n1,A'), 1);
  });

  test('ignores blank lines', () => {
    assert.equal(countRecords('iWine,Wine\n\n1,A\n\n'), 1);
  });

  test('treats a newline inside a quoted field as part of the record', () => {
    const csv = 'iWine,Note\n1,"Smoky.\nNeeds time."\n2,"Plain"\n';
    assert.equal(countRecords(csv), 2);
  });

  test('handles escaped quotes', () => {
    const csv = 'iWine,Note\n1,"He said ""lovely"", then left"\n';
    assert.equal(countRecords(csv), 1);
  });

  test('returns zero for a header only', () => {
    assert.equal(countRecords('iWine,Wine\n'), 0);
  });
});
