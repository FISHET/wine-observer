import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { mergeWines } from '../src/consumed.ts';
import type { Entry, TastingNote } from '../src/notes.ts';
import { buildTastings, scoresTotals } from '../src/scores.ts';
import { scoresColumns } from '../src/scoresColumns.ts';
import { sortRows } from '../src/table.ts';
import type { VivinoCheckIn } from '../src/vivino.ts';

const wine = {
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
};

const note = (id: string, overrides: Partial<TastingNote> = {}): TastingNote => ({
  ...wine,
  id,
  date: '2026-10-01',
  score: { value: 93, text: '93' },
  text: 'Brambly.',
  liked: true,
  ...overrides,
});

const entry = (overrides: Partial<Entry>): Entry => ({
  ...wine,
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

const tastings = (entries: Entry[], checkIns: VivinoCheckIn[]) => buildTastings(mergeWines(entries, checkIns));

describe('buildTastings', () => {
  test('lists each tasting of a wine on its own line', () => {
    const lines = tastings(
      [
        entry({ key: 'a', note: note('1', { date: '2025-03-01', score: { value: 90, text: '90' } }) }),
        entry({ key: 'b', note: note('2', { date: '2026-10-01', score: { value: 94, text: '94' } }) }),
      ],
      [],
    );
    assert.deepEqual(
      lines.map((t) => [t.date, t.score?.value]),
      [
        ['2025-03-01', 90],
        ['2026-10-01', 94],
      ],
    );
  });

  test('skips a bottle nobody wrote up', () => {
    assert.deepEqual(tastings([entry({})], []), []);
  });

  test('keeps a note with no bottle, such as a tasting out', () => {
    const [t] = tastings([entry({ key: 'ct-note-9', bottle: null, note: note('9') })], []);
    assert.equal(t!.key, 'ct-note-9');
    assert.equal(t!.note, 'Brambly.');
    assert.equal(t!.liked, true);
  });

  test('keeps a tasting logged in both apps as two lines', () => {
    const lines = tastings([entry({ note: note('1') })], [checkIn({})]);
    assert.deepEqual(lines.map((t) => t.source), ['CellarTracker', 'Vivino']);
    assert.equal(new Set(lines.map((t) => t.wineKey)).size, 1, 'but one wine');
  });

  test("describes a Vivino tasting as CellarTracker does when the wine matches", () => {
    const [, vivino] = tastings([entry({ note: note('1') })], [checkIn({})]);
    assert.equal(vivino!.producer, 'Ridge');
    assert.equal(vivino!.grape, 'Zinfandel Blend');
    assert.equal(vivino!.stars, 4.2);
    assert.equal(vivino!.score?.value, 92);
  });

  test('includes a Vivino review without a rating, but not a bare check-in', () => {
    const lines = tastings(
      [],
      [
        checkIn({ stars: null, score: null, review: 'Jammy.' }),
        checkIn({ stars: null, score: null }),
      ],
    );
    assert.deepEqual(lines.map((t) => t.note), ['Jammy.']);
  });

  test('gives every tasting its own key', () => {
    const lines = tastings([entry({ note: note('1') })], [checkIn({}), checkIn({}), checkIn({ vintage: 2021 })]);
    assert.equal(new Set(lines.map((t) => t.key)).size, lines.length);
  });
});

describe('scoresTotals', () => {
  test('counts tastings, wines and repeats, and averages the scored ones', () => {
    const lines = tastings(
      [entry({ note: note('1', { score: { value: 90, text: '90' } }) })],
      [checkIn({ score: { value: 94, text: '94' } }), checkIn({ vintage: 2021, score: null, stars: null, review: 'Fine.' })],
    );
    assert.deepEqual(scoresTotals(lines), {
      tastings: 3,
      wines: 2,
      scored: 2,
      averageScore: 92,
      tastedMoreThanOnce: 1,
    });
  });

  test('has no average with nothing scored', () => {
    assert.equal(scoresTotals([]).averageScore, null);
  });
});

describe('scores columns', () => {
  const column = (key: string) => scoresColumns.find((c) => c.key === key)!;

  test('lead with the score, then follow the order of every wine table', () => {
    assert.deepEqual(
      scoresColumns.slice(0, 9).map((c) => c.label),
      ['Score', 'Producer', 'Wine', 'Vintage', 'Style', 'Country', 'Region', 'Appellation', 'Grape'],
    );
  });

  test('sort the highest score first, unscored last', () => {
    const lines = tastings(
      [entry({ note: note('1', { score: null }) })],
      [checkIn({ score: { value: 88, text: '88' } }), checkIn({ score: { value: 95, text: '95' } })],
    );
    assert.deepEqual(
      sortRows(lines, column('score'), 'desc').map((t) => t.score?.value ?? null),
      [95, 88, null],
    );
  });

  test("show Vivino's stars behind a converted score", () => {
    const [t] = tastings([], [checkIn({})]);
    assert.equal(column('score').render(t!), '92');
    assert.equal(column('score').title!(t!), '4.2 stars on Vivino');
  });
});
