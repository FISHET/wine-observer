import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  buildEntries,
  daysBetween,
  fillProducers,
  matchNotes,
  notesTotals,
  parseConsumed,
  parseDate,
  parseNotes,
  parseProducers,
  sortProducerOf,
  type ConsumedBottle,
  type TastingNote,
  type WineInfo,
} from '../src/notes.ts';

const wineColumns =
  '"iWine","Vintage","Wine","SortWine","Type","Color","MasterVarietal","Country","Region","SubRegion","Appellation"';

const consumedCsv =
  `"iConsumed","Consumed","ConsumedYear","ConsumedMonth","ConsumedDay","Size","ShortType","Price","ConsumptionNote","iNote","Location",${wineColumns}\n` +
  '"1","15/11/2026","2026","11","15","750ml","Drank","32","","500","Cellar","100","2016","Château Larrivet-Haut-Brion","Larrivet-Haut-Brion, Château","Red","Red","Red Bordeaux Blend","France","Bordeaux","Graves","Pessac-Léognan"\n' +
  `"2","18/07/2026","2026","7","18","750ml","Drank","0","Jade's birthday","0","","200","1001","Chapel Down Brut","Chapel Down Brut","White - Sparkling","White","Chardonnay","England","Unknown","",""\n`;

const notesCsv =
  `"iNote","TastingDate","Rating","TastingNotes","fLikeIt",${wineColumns}\n` +
  '"500","15/11/2026","82","Thin, light red berries.","","100","2016","Château Larrivet-Haut-Brion","Larrivet-Haut-Brion, Château","Red","Red","Red Bordeaux Blend","France","Bordeaux","Graves","Pessac-Léognan"\n' +
  '"501","07/11/2026","85","A tasting, not from the cellar.","True","300","2021","Psi Ribera del Duero","Psi Ribera del Duero","Red","Red","Tempranillo","Spain","Castilla y León","Ribera del Duero",""\n' +
  '"502","19/07/2026","0","","False","200","1001","Chapel Down Brut","Chapel Down Brut","White - Sparkling","White","Chardonnay","England","Unknown","",""\n';

const wine: WineInfo = {
  wineId: '100',
  wine: 'Wine',
  sortWine: 'Wine',
  producer: '',
  sortProducer: '',
  vintage: 2020,
  isNonVintage: false,
  style: 'Red',
  colour: 'Red',
  country: 'France',
  region: null,
  subRegion: null,
  appellation: null,
  grape: null,
};

const bottle = (overrides: Partial<ConsumedBottle>): ConsumedBottle => ({
  ...wine,
  id: '1',
  size: '750ml',
  date: '2026-09-26',
  reason: 'Drank',
  occasion: null,
  location: null,
  paid: null,
  noteId: null,
  ...overrides,
});

const note = (overrides: Partial<TastingNote>): TastingNote => ({
  ...wine,
  id: 'n1',
  date: '2026-09-27',
  score: null,
  text: null,
  liked: null,
  ...overrides,
});

const matchedIds = (bottles: ConsumedBottle[], notes: TastingNote[]) => {
  const matches = matchNotes(bottles, notes);
  return bottles.map((b) => matches.get(b)?.id ?? null);
};

describe('parseDate', () => {
  test('reads CellarTracker day-first dates', () => {
    assert.equal(parseDate('15/11/2026'), '2026-11-15');
    assert.equal(parseDate('8/7/2026'), '2026-07-08');
  });

  test('accepts ISO dates', () => {
    assert.equal(parseDate('2026-11-15'), '2026-11-15');
  });

  test('rejects nonsense rather than rolling it over', () => {
    assert.equal(parseDate('31/02/2026'), null);
    assert.equal(parseDate(''), null);
    assert.equal(parseDate('soon'), null);
  });
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-09-26', '2026-09-27'), 1);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2); // across the clocks going back
  assert.equal(daysBetween('2026-09-27', '2026-09-26'), -1);
});

describe('parseConsumed', () => {
  const [larrivet, chapelDown] = parseConsumed(consumedCsv);

  test('reads a bottle', () => {
    assert.equal(larrivet!.wine, 'Château Larrivet-Haut-Brion');
    assert.equal(larrivet!.date, '2026-11-15');
    assert.equal(larrivet!.reason, 'Drank');
    assert.equal(larrivet!.paid, 32);
    assert.equal(larrivet!.noteId, '500');
    assert.equal(larrivet!.location, 'Cellar');
  });

  test('treats 0 as no note, no price, and NV as no vintage', () => {
    assert.equal(chapelDown!.noteId, null);
    assert.equal(chapelDown!.paid, null);
    assert.equal(chapelDown!.vintage, null);
    assert.equal(chapelDown!.isNonVintage, true);
    assert.equal(chapelDown!.region, null, 'Unknown is not a region');
    assert.equal(chapelDown!.occasion, "Jade's birthday");
  });
});

describe('parseNotes', () => {
  const [first, psi, unscored] = parseNotes(notesCsv);

  test('reads a note', () => {
    assert.equal(first!.id, '500');
    assert.equal(first!.date, '2026-11-15');
    assert.deepEqual(first!.score, { value: 82, text: '82' });
    assert.equal(first!.text, 'Thin, light red berries.');
    assert.equal(first!.liked, null);
  });

  test('describes the wine, so a note can stand without a bottle', () => {
    assert.equal(psi!.wine, 'Psi Ribera del Duero');
    assert.equal(psi!.vintage, 2021);
    assert.equal(psi!.country, 'Spain');
    assert.equal(psi!.grape, 'Tempranillo');
  });

  test('treats a zero rating as unscored', () => {
    assert.equal(unscored!.score, null);
    assert.equal(unscored!.text, null);
    assert.equal(unscored!.liked, false);
  });
});

describe('matchNotes', () => {
  test("uses CellarTracker's own link first", () => {
    assert.deepEqual(matchedIds([bottle({ noteId: 'n2' })], [note({ id: 'n1' }), note({ id: 'n2' })]), ['n2']);
  });

  test('matches an unlinked note written the next morning', () => {
    assert.deepEqual(matchedIds([bottle({})], [note({ date: '2026-09-27' })]), ['n1']);
  });

  test('does not match a note for another wine, before the bottle, or long after', () => {
    const notes = [
      note({ id: 'other', wineId: '999' }),
      note({ id: 'before', date: '2026-09-25' }),
      note({ id: 'late', date: '2026-09-30' }),
    ];
    assert.deepEqual(matchedIds([bottle({})], notes), [null]);
  });

  test('prefers the nearest note, and never gives one note to two bottles', () => {
    const notes = [note({ id: 'later', date: '2026-09-28' }), note({ id: 'sooner', date: '2026-09-26' })];
    assert.deepEqual(matchedIds([bottle({ id: 'a' }), bottle({ id: 'b' })], notes), ['sooner', 'later']);
  });

  test('does not steal a note another bottle is linked to', () => {
    const bottles = [bottle({ id: 'unlinked' }), bottle({ id: 'linked', noteId: 'n1' })];
    assert.deepEqual(matchedIds(bottles, [note({ id: 'n1' })]), [null, 'n1']);
  });
});

describe('buildEntries', () => {
  const entries = buildEntries(parseConsumed(consumedCsv), parseNotes(notesCsv));
  const byKey = (key: string) => entries.find((e) => e.key === key)!;

  test('lists every note, with or without a bottle', () => {
    const noteIds = entries.flatMap((e) => (e.note ? [e.note.id] : [])).sort();
    assert.deepEqual(noteIds, ['500', '501', '502']);
  });

  test('pairs a bottle with its note in one entry', () => {
    const larrivet = byKey('ct-bottle-1');
    assert.equal(larrivet.note?.id, '500');
    assert.equal(larrivet.bottle?.reason, 'Drank');
    assert.equal(larrivet.date, '2026-11-15');
  });

  test('gives a note with no bottle its own entry, dated when it was written', () => {
    const psi = byKey('ct-note-501');
    assert.equal(psi.bottle, null);
    assert.equal(psi.wine, 'Psi Ribera del Duero');
    assert.equal(psi.date, '2026-11-07');
    assert.equal(psi.source, 'CellarTracker');
  });

  test('keeps a bottle nobody wrote up', () => {
    const bare = buildEntries([bottle({ id: '9' })], []);
    assert.equal(bare.length, 1);
    assert.equal(bare[0]!.note, null);
  });

  test('counts notes and bottles', () => {
    assert.equal(entries.length, 3, 'two bottles, one note without a bottle');
    assert.deepEqual(notesTotals(entries), {
      notes: 3,
      bottles: 2,
      notesWithoutBottle: 1,
      bottlesWithoutNote: 0,
    });
  });
});

describe('producers', () => {
  test('finds the sorting form at the start of SortWine', () => {
    assert.equal(
      sortProducerOf('Château Larrivet-Haut-Brion', 'Larrivet-Haut-Brion, Château Domaine de Larrivet-Haut-Brion'),
      'Larrivet-Haut-Brion, Château',
    );
    assert.equal(sortProducerOf('M. Chapoutier', 'Chapoutier, M. Côtes du Rhône Belleruche'), 'Chapoutier, M.');
  });

  test('keeps the producer as written when SortWine is not inverted', () => {
    assert.equal(sortProducerOf('Marks & Spencer', 'Marks & Spencer Côtes du Rhône'), 'Marks & Spencer');
    assert.equal(sortProducerOf('Ridge', 'Lytton Springs, Ridge'), 'Ridge', 'different words: not a match');
    assert.equal(sortProducerOf('', 'Anything'), '');
  });

  test('fills in a bottle missing its producer from another table', () => {
    const producers = parseProducers('iWine,Producer\n100,Château Larrivet-Haut-Brion\n');
    const [filled, unknown] = fillProducers(
      [
        bottle({ wineId: '100', sortWine: 'Larrivet-Haut-Brion, Château Domaine de Larrivet-Haut-Brion' }),
        bottle({ wineId: '999' }),
      ],
      producers,
    );
    assert.equal(filled!.producer, 'Château Larrivet-Haut-Brion');
    assert.equal(filled!.sortProducer, 'Larrivet-Haut-Brion, Château');
    assert.equal(unknown!.producer, '');
  });

  test('keeps a producer the row already had', () => {
    const [kept] = fillProducers([bottle({ producer: 'Ridge' })], new Map([['100', 'Other']]));
    assert.equal(kept!.producer, 'Ridge');
  });
});
