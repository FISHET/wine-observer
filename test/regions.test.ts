import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { describe } from 'node:test';

import { DataFileError } from '../src/dataFile.ts';
import { groupRegion, parseRegions } from '../src/regions.ts';

const regions = new Map([
  ['Châteauneuf-du-Pape', 'Southern Rhône'],
  ['Southern Rhône', 'Southern Rhône'],
  ['Napa Valley', 'Napa Valley'],
]);

describe('groupRegion', () => {
  test("maps Vivino's one name, usually the appellation", () => {
    assert.deepEqual(
      groupRegion({ region: 'Châteauneuf-du-Pape', subRegion: null, appellation: null }, regions),
      { regionGroup: 'Southern Rhône', regionMapped: true },
    );
  });

  test('tries the appellation, then the sub-region, then the region', () => {
    // CellarTracker: Rhône > Southern Rhône > Gigondas. Gigondas isn't
    // listed, so the sub-region decides.
    assert.equal(
      groupRegion({ region: 'Rhône', subRegion: 'Southern Rhône', appellation: 'Gigondas' }, regions).regionGroup,
      'Southern Rhône',
    );
    // California > Napa Valley > Rutherford: the sub-region again.
    assert.equal(
      groupRegion({ region: 'California', subRegion: 'Napa Valley', appellation: 'Rutherford' }, regions).regionGroup,
      'Napa Valley',
    );
  });

  test('keeps the region as recorded when nothing is listed', () => {
    assert.deepEqual(groupRegion({ region: 'Tuscany', subRegion: null, appellation: 'Toscana IGT' }, regions), {
      regionGroup: 'Tuscany',
      regionMapped: false,
    });
    assert.deepEqual(groupRegion({ region: null, subRegion: null, appellation: null }, regions), {
      regionGroup: null,
      regionMapped: false,
    });
  });
});

describe('parseRegions', () => {
  test('explains a broken file, naming it', () => {
    assert.throws(() => parseRegions('{ "Gigondas": }'), (error) => {
      assert.ok(error instanceof DataFileError);
      assert.match(error.message, /regions\.json is not valid JSON/);
      return true;
    });
    assert.throws(() => parseRegions('{ "Gigondas": "" }'), /should map to a region name/);
  });

  // Hand-edited and committed, so a typo should fail here rather than on the page.
  test('the committed table parses, and splits the Rhône', () => {
    const table = parseRegions(readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
    assert.equal(table.get('Châteauneuf-du-Pape'), 'Southern Rhône');
    assert.equal(table.get('Côte-Rôtie'), 'Northern Rhône');
  });
});
