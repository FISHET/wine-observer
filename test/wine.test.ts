import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { columns, sortWines, EMPTY } from '../src/columns.ts';
import { parseCellar, parseScore, totals, type Wine, wineName } from '../src/wine.ts';

const FIELDS = [
  'iWine', 'Quantity', 'Pending', 'Size', 'Price', 'Valuation', 'Vintage', 'Wine',
  'Country', 'Region', 'SubRegion', 'Producer', 'SortProducer', 'Type', 'Color',
  'Category', 'Varietal', 'MasterVarietal', 'Appellation', 'MY', 'CT', 'DR',
  'BeginConsume', 'EndConsume',
];

type Fields = Partial<Record<string, string>>;

/** Quotes a field the way CellarTracker does, when it needs it. */
function escape(value: string): string {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

/** Builds a CellarTracker-shaped CSV from only the fields a test cares about. */
function csvOf(...rows: Fields[]): string {
  const body = rows.map((row) => FIELDS.map((name) => escape(row[name] ?? '')).join(','));
  return [FIELDS.join(','), ...body].join('\n') + '\n';
}

const one = (fields: Fields): Wine => parseCellar(csvOf(fields))[0]!;
const column = (key: string) => columns.find((c) => c.key === key)!;

describe('parseCellar', () => {
  test('reads a row into the domain shape', () => {
    const wine = one({
      iWine: '123', Quantity: '6', Vintage: '2010', Wine: 'Vieux Télégraphe La Crau',
      Producer: 'Château Batailley', SortProducer: 'Batailley, Château',
      Country: 'France', Region: 'Rhône', Price: '52', Valuation: '83.5',
      BeginConsume: '2018', EndConsume: '2035', Size: '750ml', Type: 'Red',
    });

    assert.equal(wine.id, '123');
    assert.equal(wine.inStock, 6);
    assert.equal(wine.vintage, 2010);
    assert.equal(wine.isNonVintage, false);
    assert.equal(wine.paid, 52);
    assert.equal(wine.value, 83.5);
    assert.equal(wine.drinkFrom, 2018);
    assert.equal(wine.drinkTo, 2035);
    assert.equal(wine.sortProducer, 'Batailley, Château');
  });

  test('keeps accented names intact', () => {
    assert.equal(one({ Wine: 'Château Batailley' }).wine, 'Château Batailley');
  });

  test('treats CellarTracker’s "Unknown" as missing', () => {
    const wine = one({ SubRegion: 'Unknown', MasterVarietal: 'Unknown', Varietal: 'Unknown' });
    assert.equal(wine.subRegion, null);
    assert.equal(wine.grape, null);
  });

  test('falls back to Varietal when MasterVarietal is missing', () => {
    assert.equal(one({ Varietal: 'Zinfandel' }).grape, 'Zinfandel');
  });

  test('treats a zero price as not recorded, not as free', () => {
    const wine = one({ Price: '0', Valuation: '0' });
    assert.equal(wine.paid, null);
    assert.equal(wine.value, null);
  });

  test('counts a missing quantity as zero', () => {
    assert.equal(one({}).inStock, 0);
  });

  test('handles a quoted wine name containing a comma', () => {
    const csv = 'iWine,Wine,Vintage\n1,"Gevrey-Chambertin, Clos Tamisot",2017\n';
    assert.equal(parseCellar(csv)[0]!.wine, 'Gevrey-Chambertin, Clos Tamisot');
  });
});

describe('the NV rule', () => {
  test('vintage 1001 becomes NV with no vintage', () => {
    const wine = one({ Vintage: '1001' });
    assert.equal(wine.isNonVintage, true);
    assert.equal(wine.vintage, null);
  });

  test('an NV wine never carries a drinking window', () => {
    // CellarTracker fills these in regardless, but it cannot know when an NV
    // bottle was made or disgorged, so the window means nothing.
    const wine = one({ Vintage: '1001', BeginConsume: '2020', EndConsume: '2024' });
    assert.equal(wine.drinkFrom, null);
    assert.equal(wine.drinkTo, null);
  });

  test('a real vintage keeps its window', () => {
    const wine = one({ Vintage: '2016', BeginConsume: '2020', EndConsume: '2024' });
    assert.equal(wine.drinkFrom, 2020);
    assert.equal(wine.drinkTo, 2024);
  });
});

describe('parseScore', () => {
  test('reads a plain score', () => {
    assert.deepEqual(parseScore('93'), { value: 93, text: '93' });
  });

  test('keeps a trailing plus in the text but sorts on the number', () => {
    assert.deepEqual(parseScore('94+'), { value: 94, text: '94+' });
  });

  test('scores a barrel-sample range at its midpoint', () => {
    assert.deepEqual(parseScore('85-87'), { value: 86, text: '85-87' });
  });

  test('keeps the community average precise for sorting', () => {
    assert.equal(parseScore('91.8429752066116')?.value, 91.8429752066116);
  });

  test('is null for blank or non-numeric', () => {
    assert.equal(parseScore(''), null);
    assert.equal(parseScore(undefined), null);
    assert.equal(parseScore('n/a'), null);
  });
});

describe('totals', () => {
  test('sums bottles and pending separately', () => {
    const csv = csvOf(
      { iWine: '1', Quantity: '6' },
      { iWine: '2', Quantity: '1' },
      { iWine: '3', Pending: '6' },
    );
    const { wines, bottles, pending } = totals(parseCellar(csv));
    assert.deepEqual({ wines, bottles, pending }, { wines: 3, bottles: 7, pending: 6 });
  });

  test('values the bottles in stock, and counts those with no valuation', () => {
    const csv = csvOf(
      { iWine: '1', Quantity: '6', Valuation: '45' },
      { iWine: '2', Quantity: '2', Valuation: '' },
      // Ordered, not yet held: not part of the cellar's value.
      { iWine: '3', Pending: '6', Valuation: '30' },
    );
    const { value, unvaluedBottles } = totals(parseCellar(csv));
    assert.equal(value, 270);
    assert.equal(unvaluedBottles, 2);
  });
});

describe('sorting', () => {
  const wines = parseCellar(
    csvOf(
      { iWine: '1', Wine: 'Batailley', Vintage: '2022', Valuation: '45', CT: '93' },
      { iWine: '2', Wine: 'Chapel Down', Vintage: '1001' },
      { iWine: '3', Wine: 'Vieux Télégraphe', Vintage: '2010', Valuation: '83', CT: '90' },
    ),
  );

  test('sorts text with accents in the expected place', () => {
    const names = sortWines(wines, column('wine'), 'asc').map((w) => w.wine);
    assert.deepEqual(names, ['Batailley', 'Chapel Down', 'Vieux Télégraphe']);
  });

  test('sorts numbers numerically, not as text', () => {
    const values = sortWines(wines, column('value'), 'desc').map((w) => w.value);
    assert.deepEqual(values, [83, 45, null]);
  });

  test('keeps blanks last when ascending', () => {
    const values = sortWines(wines, column('value'), 'asc').map((w) => w.value);
    assert.deepEqual(values, [45, 83, null]);
  });

  test('keeps blanks last when descending too', () => {
    const values = sortWines(wines, column('value'), 'desc').map((w) => w.value);
    assert.equal(values.at(-1), null);
  });

  test('NV sorts with the blanks rather than as the year 1001', () => {
    const vintages = sortWines(wines, column('vintage'), 'asc').map((w) => w.vintage);
    assert.deepEqual(vintages, [2010, 2022, null]);
  });

  test('does not mutate the array it is given', () => {
    const before = wines.map((w) => w.id);
    sortWines(wines, column('value'), 'desc');
    assert.deepEqual(wines.map((w) => w.id), before);
  });
});

describe('rendering', () => {
  test('shows money in pounds with no pennies', () => {
    assert.equal(column('paid').render(one({ Price: '52.5' })), '£53');
  });

  test('rounds the community average to one place', () => {
    assert.equal(column('communityScore').render(one({ CT: '91.8429752066116' })), '91.8');
  });

  test('shows the Decanter score exactly as published', () => {
    assert.equal(column('decanterScore').render(one({ DR: '97' })), '97');
  });

  test('shows NV rather than a year', () => {
    assert.equal(column('vintage').render(one({ Vintage: '1001' })), 'NV');
  });

  test('shows a dash for anything missing', () => {
    const wine = one({});
    assert.equal(column('paid').render(wine), EMPTY);
    assert.equal(column('drinkFrom').render(wine), EMPTY);
    assert.equal(column('myScore').render(wine), EMPTY);
  });
});

describe('wineName', () => {
  test('drops the producer CellarTracker puts in front', () => {
    assert.equal(
      wineName('Château Larrivet-Haut-Brion Domaine de Larrivet-Haut-Brion', 'Château Larrivet-Haut-Brion'),
      'Domaine de Larrivet-Haut-Brion',
    );
    assert.equal(wineName('Ridge Lytton Springs', 'ridge'), 'Lytton Springs', 'ignoring case');
  });

  test('falls back to the appellation for a wine named after its producer', () => {
    assert.equal(wineName('Château Batailley', 'Château Batailley', 'Pauillac'), 'Pauillac');
    assert.equal(wineName('Château Batailley', 'Château Batailley'), 'Château Batailley', 'with no fallback');
  });

  test('leaves a name that does not start with the producer alone', () => {
    assert.equal(wineName('Lytton Springs', 'Ridge'), 'Lytton Springs');
    assert.equal(wineName('Lytton Springs', ''), 'Lytton Springs');
  });
});
