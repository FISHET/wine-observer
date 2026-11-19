import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { columns } from '../src/columns.ts';
import { buildConsumed, consumedTotals, sourceLabel, unmappedRegions, unmappedStyles } from '../src/consumed.ts';
import { asDate, consumedColumns } from '../src/consumedColumns.ts';
import type { Entry } from '../src/notes.ts';
import { sortRows } from '../src/table.ts';
import type { VivinoCheckIn } from '../src/vivino.ts';

const entry = (overrides: Partial<Entry>): Entry => ({
  wineId: '100',
  wine: 'Ridge Lytton Springs',
  sortWine: 'Ridge Lytton Springs',
  producer: 'Ridge',
  sortProducer: 'Ridge',
  vintage: 2023,
  isNonVintage: false,
  style: 'Red',
  colour: 'Red',
  country: 'USA',
  region: 'California',
  subRegion: null,
  appellation: null,
  grape: 'Zinfandel Blend',
  key: 'ct-bottle-1',
  source: 'CellarTracker',
  date: '2026-10-01',
  bottle: { id: '1', size: '750ml', reason: 'Drank', occasion: null, location: null, paid: null },
  note: null,
  ...overrides,
});

const checkIn = (overrides: Partial<VivinoCheckIn>): VivinoCheckIn => ({
  producer: 'Ridge Vineyards',
  name: 'Lytton Springs',
  wine: 'Ridge Vineyards Lytton Springs',
  vintage: 2023,
  style: 'Red',
  country: 'USA',
  region: 'Dry Creek Valley',
  wineStyle: 'Californian Zinfandel',
  date: null,
  stars: 4.2,
  score: { value: 92, text: '92' },
  review: null,
  link: null,
  ...overrides,
});

describe('buildConsumed', () => {
  test('groups repeat check-ins of a wine into one line', () => {
    const lines = buildConsumed(
      [entry({ key: 'a', date: '2026-01-05' }), entry({ key: 'b', date: '2026-10-01' })],
      [checkIn({}), checkIn({}), checkIn({}), checkIn({ vintage: 2021 })],
    );
    const ridge2023 = lines.find((l) => l.vintage === 2023)!;

    assert.equal(lines.length, 2, '2023 merged across apps; 2021 on its own');
    assert.deepEqual(ridge2023.counts, { CellarTracker: 2, Vivino: 3 });
    assert.equal(ridge2023.bottles, 3, 'the larger count, not the sum');
    assert.equal(ridge2023.firstDate, '2026-01-05');
    assert.equal(ridge2023.lastDate, '2026-10-01');
  });

  test("keeps CellarTracker's description of a merged wine", () => {
    const [line] = buildConsumed([entry({})], [checkIn({})]);
    assert.equal(line!.wine, 'Ridge Lytton Springs');
    assert.equal(line!.producer, 'Ridge');
    assert.equal(line!.name, 'Lytton Springs', 'the producer has its own column');
    assert.equal(line!.grape, 'Zinfandel Blend', "CellarTracker's grape wins");
    assert.equal(line!.vivinoStyle, null);
    assert.equal(sourceLabel(line!), 'Both');
  });

  test("falls back to Vivino's style when CellarTracker has no grape", () => {
    const [line] = buildConsumed([entry({ grape: null })], [checkIn({})]);
    assert.equal(line!.grape, 'Californian Zinfandel');
    assert.equal(line!.vivinoStyle, 'Californian Zinfandel');
  });

  test('maps a Vivino style to a grape through the table', () => {
    const styles = new Map([['Californian Zinfandel', 'Zinfandel']]);
    const [line] = buildConsumed([], [checkIn({})], styles);
    assert.equal(line!.grape, 'Zinfandel');
    assert.equal(line!.vivinoStyle, 'Californian Zinfandel', 'the original is kept');
  });

  test('groups regions through the table, from both apps', () => {
    const regions = new Map([['Southern Rhône', 'Southern Rhône'], ['Gigondas', 'Southern Rhône']]);
    const lines = buildConsumed(
      [entry({ region: 'Rhône', subRegion: 'Southern Rhône', appellation: 'Vacqueyras' })],
      [checkIn({ producer: 'Saint Cosme', name: 'Gigondas', wine: 'Saint Cosme Gigondas', region: 'Gigondas', country: 'France' })],
      new Map(),
      regions,
    );
    assert.deepEqual(lines.map((l) => [l.regionGroup, l.regionMapped]), [
      ['Southern Rhône', true],
      ['Southern Rhône', true],
    ]);
  });

  test('lists the regions still to group, most bottles first', () => {
    const lines = buildConsumed(
      [],
      [
        checkIn({ region: 'Paso Robles' }),
        checkIn({ vintage: 2021, region: 'Lodi' }),
        checkIn({ vintage: 2020, region: 'Lodi' }),
        checkIn({ vintage: 2019, region: 'Napa Valley' }),
      ],
      new Map(),
      new Map([['Napa Valley', 'Napa Valley']]),
    );
    assert.deepEqual(unmappedRegions(lines), ['Lodi (USA)', 'Paso Robles (USA)']);
  });

  test('lists the styles still to map, once each', () => {
    const lines = buildConsumed(
      [],
      [
        checkIn({}),
        checkIn({ vintage: 2021 }),
        checkIn({ producer: 'Bollinger', name: 'Rosé', wine: 'Bollinger Rosé', wineStyle: 'French Champagne' }),
      ],
      new Map([['French Champagne', 'Champagne Blend']]),
    );
    assert.deepEqual(unmappedStyles(lines), ['Californian Zinfandel']);
  });

  test('never merges across vintages', () => {
    const lines = buildConsumed([entry({ vintage: 2022 })], [checkIn({ vintage: 2023 })]);
    assert.equal(lines.length, 2);
  });

  test('matches a blank Vivino vintage only to a non-vintage wine', () => {
    const nv = entry({ wineId: 'nv', wine: 'Nyetimber Classic Cuvée', vintage: null, isNonVintage: true });
    const nyetimber = checkIn({ producer: 'Nyetimber', name: 'Classic Cuvee Brut', wine: 'Nyetimber Classic Cuvee Brut', vintage: null });

    assert.equal(buildConsumed([nv], [nyetimber]).length, 1);
    assert.equal(
      buildConsumed([entry({ wine: 'Nyetimber Classic Cuvée', vintage: 2015 })], [nyetimber]).length,
      2,
      'a blank vintage is not 2015',
    );
  });

  test('merges each wine at most once', () => {
    const lines = buildConsumed(
      [entry({})],
      [checkIn({}), checkIn({ producer: 'Ridge', name: 'Lytton Springs', wine: 'Ridge Lytton Springs' })],
    );
    assert.equal(lines.filter((l) => sourceLabel(l) === 'Both').length, 1);
    assert.equal(lines.length, 2);
  });

  test('lists a wine only in Vivino on its own', () => {
    const [line] = buildConsumed([], [checkIn({ date: '2025-02-01' })]);
    assert.equal(line!.wine, 'Ridge Vineyards Lytton Springs');
    assert.equal(line!.producer, 'Ridge Vineyards', "Vivino's winery");
    assert.equal(line!.name, 'Lytton Springs', "Vivino's wine name");
    assert.equal(line!.grape, 'Californian Zinfandel', "Vivino's regional style stands in");
    assert.equal(line!.vivinoStyle, 'Californian Zinfandel');
    assert.equal(line!.isNonVintage, false);
    assert.equal(line!.lastDate, '2025-02-01');
    assert.equal(sourceLabel(line!), 'Vivino');
  });

  test('totals', () => {
    const lines = buildConsumed(
      [entry({}), entry({ wineId: '200', wine: 'Penfolds Grange', vintage: 2018 })],
      [checkIn({}), checkIn({ producer: 'Dominus', name: 'Othello', wine: 'Dominus Othello', vintage: 2019 })],
    );
    assert.deepEqual(consumedTotals(lines), {
      wines: 3,
      bottles: 3,
      inBoth: 1,
      cellarTrackerOnly: 1,
      vivinoOnly: 1,
    });
  });
});

describe('consumed columns', () => {
  const column = (key: string) => consumedColumns.find((c) => c.key === key)!;

  test('show the wine without its producer', () => {
    const [batailley] = buildConsumed(
      [entry({ wine: 'Château Batailley', producer: 'Château Batailley', appellation: 'Pauillac' })],
      [],
    );
    assert.equal(column('wine').render(batailley!), 'Pauillac');
    assert.equal(column('wine').title!(batailley!), 'Château Batailley');
  });

  test('start in the same order as the cellar table', () => {
    const shared = ['Producer', 'Wine', 'Vintage', 'Style', 'Country', 'Region', 'Grape'];
    assert.deepEqual(consumedColumns.slice(0, 7).map((c) => c.label), shared);
    assert.deepEqual(columns.slice(0, 7).map((c) => c.label), shared);
  });

  test('show dates the British way', () => {
    assert.equal(asDate('2026-11-15'), '15 Nov 2026');
    assert.equal(asDate(null), '–');
  });

  test('sort the latest first, undated last', () => {
    const lines = buildConsumed(
      [entry({ wineId: 'old', date: '2025-01-02' }), entry({ wineId: 'new', date: '2026-11-15' })],
      [checkIn({ producer: 'Dominus', name: 'Othello', wine: 'Dominus Othello', vintage: 2019 })],
    );
    assert.deepEqual(
      sortRows(lines, column('lastDate'), 'desc').map((l) => l.key),
      ['ct-new', 'ct-old', 'vivino-dominus|othello|2019'],
    );
  });

  test('explain a merged count', () => {
    const [line] = buildConsumed([entry({})], [checkIn({}), checkIn({})]);
    assert.equal(column('bottles').render(line!), '2');
    assert.equal(column('bottles').title!(line!), 'CellarTracker 1 · Vivino 2');
  });
});
