import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { MATCH_THRESHOLD, nameMatch, words } from '../src/match.ts';

const matches = (producer: string, wine: string, full: string, region?: string) =>
  nameMatch({ producer, wine, region }, full) >= MATCH_THRESHOLD;

describe('words', () => {
  test('ignores accents, case, punctuation and filler', () => {
    assert.deepEqual(words('Domaine du Vieux Télégraphe Châteauneuf-du-Pape'), [
      'vieux',
      'telegraphe',
      'chateauneuf',
      'pape',
    ]);
  });
});

// Pairs taken from the real exports.
describe('nameMatch', () => {
  test('matches the same wine named differently', () => {
    assert.ok(matches('Ridge Vineyards', 'Lytton Springs', 'Ridge Lytton Springs'));
    assert.ok(matches('The Ned', 'Pinot Noir', 'The Ned Pinot Noir'));
    assert.ok(matches('Nyetimber', 'Classic Cuvee Brut', 'Nyetimber Classic Cuvée'));
    assert.ok(
      matches(
        'Château de la Font du Loup',
        'Le Puy Rolland Châteauneuf-du-Pape',
        'Château de la Font du Loup Châteauneuf-du-Pape Le Puy Rolland',
      ),
    );
  });

  test('uses the region to fill in an appellation left out of the name', () => {
    assert.ok(matches('Château de Beaucastel', '', 'Château de Beaucastel Châteauneuf-du-Pape', 'Châteauneuf-du-Pape'));
  });

  test("won't let a generic name claim a specific cuvée", () => {
    assert.ok(
      !matches(
        'Château de la Font du Loup',
        'Chateauneuf-du-Pape Rouge',
        'Château de la Font du Loup Châteauneuf-du-Pape Le Puy Rolland',
      ),
    );
    assert.ok(
      !matches(
        'Château de la Gardine',
        'Châteauneuf-Du-Pape Cuvée Des Générations',
        'Château de la Gardine Châteauneuf-du-Pape Château St-Roche',
      ),
    );
  });

  test('never matches across producers', () => {
    assert.equal(nameMatch({ producer: 'Cune (CVNE)', wine: 'Gran Reserva' }, 'La Rioja Alta Gran Reserva 904'), 0);
  });
});
