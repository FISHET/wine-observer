import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { parseEnv } from '../src/env.ts';

describe('parseEnv', () => {
  test('reads simple pairs', () => {
    assert.deepEqual(parseEnv('CT_USER=tom\nCT_PASSWORD=secret'), {
      CT_USER: 'tom',
      CT_PASSWORD: 'secret',
    });
  });

  test('keeps a hash inside an unquoted value', () => {
    // Node's own --env-file truncates this to "6hYFxC"
    assert.equal(parseEnv('CT_PASSWORD=6hYFxC#J4b@E3T7G').CT_PASSWORD, '6hYFxC#J4b@E3T7G');
  });

  test('strips a comment that follows whitespace', () => {
    assert.equal(parseEnv('CT_USER=tom   # the handle, not the email').CT_USER, 'tom');
  });

  test('ignores whole-line comments and blank lines', () => {
    assert.deepEqual(parseEnv('# a note\n\n  # indented\nCT_USER=tom\n'), { CT_USER: 'tom' });
  });

  test('keeps quoted values literal, including a trailing comment marker', () => {
    assert.equal(parseEnv('CT_PASSWORD="a b # c"').CT_PASSWORD, 'a b # c');
    assert.equal(parseEnv("CT_PASSWORD='a b # c'").CT_PASSWORD, 'a b # c');
  });

  test('does not leave the quotes in place', () => {
    assert.equal(parseEnv('CT_USER="tom"').CT_USER, 'tom');
  });

  test('keeps a value containing an equals sign', () => {
    assert.equal(parseEnv('CT_PASSWORD=a=b=c').CT_PASSWORD, 'a=b=c');
  });

  test('accepts an export prefix', () => {
    assert.equal(parseEnv('export CT_USER=tom').CT_USER, 'tom');
  });

  test('ignores lines with no separator', () => {
    assert.deepEqual(parseEnv('nonsense\nCT_USER=tom'), { CT_USER: 'tom' });
  });

  test('handles an escaped newline in a double-quoted value', () => {
    assert.equal(parseEnv('NOTE="one\\ntwo"').NOTE, 'one\ntwo');
  });
});
