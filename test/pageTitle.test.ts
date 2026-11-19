import assert from 'node:assert/strict';
import test from 'node:test';

import { pageTitle } from '../src/pageTitle.ts';

test('names each tab after its page and the site', () => {
  assert.equal(pageTitle(null), 'Wine Observer', 'the home page');
  assert.equal(pageTitle('Cellar'), 'Cellar - Wine Observer');
  assert.equal(pageTitle('Consumed'), 'Consumed - Wine Observer');
});
