import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import type { ConsumedWine } from '../src/consumed.ts';
import { countryCode } from '../src/countries.ts';
import { broadStyle, favourites } from '../src/favourites.ts';

const line = (overrides: Partial<ConsumedWine>): ConsumedWine => ({
  key: 'x',
  name: 'Lytton Springs',
  wine: 'Ridge Lytton Springs',
  sortWine: 'Ridge Lytton Springs',
  producer: 'Ridge',
  sortProducer: 'Ridge',
  vintage: 2023,
  isNonVintage: false,
  style: 'Red',
  country: 'USA',
  region: 'California',
  subRegion: null,
  appellation: null,
  grape: 'Zinfandel',
  vivinoStyle: null,
  regionGroup: 'California',
  regionMapped: false,
  counts: { CellarTracker: 1, Vivino: 0 },
  bottles: 1,
  firstDate: null,
  lastDate: null,
  ...overrides,
});

describe('broadStyle', () => {
  test("folds both apps' sparkling styles into one", () => {
    assert.equal(broadStyle('White - Sparkling'), 'Sparkling');
    assert.equal(broadStyle('Rosé - Sparkling'), 'Sparkling');
    assert.equal(broadStyle('Sparkling'), 'Sparkling');
    assert.equal(broadStyle('Red'), 'Red');
    assert.equal(broadStyle(''), null);
  });
});

describe('favourites', () => {
  test('ranks by bottles drunk, not by wines', () => {
    const fav = favourites([
      line({ style: 'White', bottles: 1 }),
      line({ style: 'White', bottles: 1 }),
      line({ style: 'Red', bottles: 3 }),
    ]);
    assert.deepEqual(fav.styles, [
      { name: 'Red', bottles: 3 },
      { name: 'White', bottles: 2 },
    ]);
    assert.equal(fav.bottles, 5);
  });

  test('adds the sparkling wines up across both apps', () => {
    const fav = favourites([
      line({ style: 'Sparkling', bottles: 2 }),
      line({ style: 'White - Sparkling', bottles: 1 }),
      line({ style: 'Red', bottles: 2 }),
    ]);
    assert.deepEqual(fav.styles[0], { name: 'Sparkling', bottles: 3 });
  });

  test('keeps the top three, ties in name order', () => {
    const fav = favourites(['Syrah', 'Merlot', 'Gamay', 'Zinfandel'].map((grape) => line({ grape })));
    assert.deepEqual(fav.grapes.map((g) => g.name), ['Gamay', 'Merlot', 'Syrah']);
  });

  test('carries the country with a region, and keeps same-named regions apart', () => {
    const fav = favourites([
      line({ regionGroup: 'Georgia', country: 'USA' }),
      line({ regionGroup: 'Georgia', country: 'Georgia', bottles: 2 }),
    ]);
    assert.deepEqual(fav.regions, [
      { name: 'Georgia', country: 'Georgia', bottles: 2 },
      { name: 'Georgia', country: 'USA', bottles: 1 },
    ]);
  });

  test('skips wines with no region or grape', () => {
    const fav = favourites([line({ region: null, regionGroup: null, grape: null })]);
    assert.deepEqual(fav.regions, []);
    assert.deepEqual(fav.grapes, []);
  });
});

describe('countryCode', () => {
  test("knows both apps' names for a country", () => {
    assert.equal(countryCode('USA'), 'us');
    assert.equal(countryCode('United States'), 'us');
    assert.equal(countryCode('United Kingdom'), 'gb');
    assert.equal(countryCode('England'), 'gb-eng');
    assert.equal(countryCode(' new zealand '), 'nz');
  });

  test('has no flag for a country it does not know', () => {
    assert.equal(countryCode('Atlantis'), null);
    assert.equal(countryCode(undefined), null);
  });
});
