import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { parseVivino, starsToPoints } from '../src/vivino.ts';

// The real export's header, in its order.
const header =
  'Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,Scan date,Scan/Review Location,Your rating,Your review,Personal Note,Wine type,Drinking Window,Link to wine,Label image\n';

const csv =
  header +
  'Château Batailley,Pauillac (Grand Cru Classé),2022,Pauillac,France,Bordeaux Pauillac,4.2,,,4.1,"Needs time, imo.",,Red Wine,,https://www.vivino.com/wines/171632071,\n' +
  'Cune (CVNE),Gran Reserva,2017,Rioja,Spain,Spanish Rioja Red,4.1,2026-06-30 19:06:54,,4.2,,,Red Wine,,https://www.vivino.com/wines/1,\n' +
  'Nyetimber,Classic Cuvee Brut,,England,United Kingdom,English Sparkling,4.0,,,,,,Sparkling,,,\n' +
  'Dominus,Othello,2019,Napa Valley,United States,Napa Valley Bordeaux Blend,4.0,,,4.3,,,Red Wine,,,\n' +
  // A label scan Vivino never identified: a date and a photo, nothing else.
  ',,,,,,,2024-12-20 18:07:40,,,,,,,,https://images.vivino.com/labels/x.jpg\n';

describe('starsToPoints', () => {
  test('maps five stars onto 50-100', () => {
    assert.equal(starsToPoints(4), 90);
    assert.equal(starsToPoints(4.1), 91);
    assert.equal(starsToPoints(3), 80);
    assert.equal(starsToPoints(5), 100);
  });
});

describe('parseVivino', () => {
  const { checkIns, unidentified } = parseVivino(csv);
  const [batailley, cune, nyetimber, othello] = checkIns;

  test('skips a row that names no wine, and counts it', () => {
    assert.equal(checkIns.length, 4);
    assert.equal(unidentified, 1);
  });

  test('reads a check-in', () => {
    assert.equal(batailley!.wine, 'Château Batailley Pauillac (Grand Cru Classé)');
    assert.equal(batailley!.vintage, 2022);
    assert.equal(batailley!.style, 'Red');
    assert.equal(batailley!.region, 'Pauillac');
    assert.equal(batailley!.wineStyle, 'Bordeaux Pauillac');
    assert.equal(batailley!.review, 'Needs time, imo.');
  });

  test('converts your rating, keeping the stars', () => {
    assert.equal(batailley!.stars, 4.1);
    assert.deepEqual(batailley!.score, { value: 91, text: '91' });
  });

  test("ignores Vivino's community average", () => {
    assert.equal(nyetimber!.stars, null, 'Average rating is not your rating');
    assert.equal(nyetimber!.score, null);
  });

  test('reads the scan date where there is one', () => {
    assert.equal(cune!.date, '2026-06-30');
    assert.equal(batailley!.date, null);
  });

  test("leaves a blank vintage blank, since Vivino can't say if it's NV", () => {
    assert.equal(nyetimber!.vintage, null);
    assert.equal(nyetimber!.style, 'Sparkling');
  });

  test("uses CellarTracker's country names", () => {
    assert.equal(othello!.country, 'USA');
    assert.equal(nyetimber!.country, 'United Kingdom');
  });
});

describe('dropping wishlist entries', () => {
  // The wishlist export has the full list's columns plus a "Wishlisted date".
  const wishHeader =
    'Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,Scan date,Scan/Review Location,Your rating,Your review,Personal Note,Wine type,Wishlisted date,Drinking Window,Link to wine,Label image\n';
  const wishlist =
    wishHeader +
    'Two Hands,Holy Grail Shiraz,2019,Barossa Valley,Australia,Australian Barossa Valley Shiraz,4.4,,,,,,Red Wine,2025-11-28 18:40:54,,https://www.vivino.com/wines/166671932,\n' +
    'Château Batailley,Pauillac (Grand Cru Classé),2022,Pauillac,France,Bordeaux Pauillac,4.2,,,,,,Red Wine,2025-01-01 10:00:00,,https://www.vivino.com/wines/171632071,\n' +
    // No link: matched on winery, name and vintage instead.
    'Nyetimber,Classic Cuvee Brut,,England,United Kingdom,English Sparkling,4.0,,,,,,Sparkling,2025-02-02 10:00:00,,,\n';
  const holyGrail =
    'Two Hands,Holy Grail Shiraz,2019,Barossa Valley,Australia,Australian Barossa Valley Shiraz,4.4,,,,,,Red Wine,,https://www.vivino.com/wines/166671932,\n';

  test('drops an unrated, unreviewed row that is on the wishlist', () => {
    const result = parseVivino(csv + holyGrail, wishlist);
    assert.equal(result.wishlisted, 2, 'Holy Grail by link, Nyetimber by name');
    assert.deepEqual(
      result.checkIns.map((c) => c.producer),
      ['Château Batailley', 'Cune (CVNE)', 'Dominus'],
    );
  });

  test('keeps a wishlisted row that was rated or reviewed: that was a real tasting', () => {
    const { checkIns } = parseVivino(csv, wishlist);
    assert.ok(checkIns.some((c) => c.producer === 'Château Batailley'));
  });

  test('drops only one row per wishlist entry, so a real check-in survives', () => {
    const result = parseVivino(header + holyGrail + holyGrail, wishlist);
    assert.equal(result.wishlisted, 1);
    assert.equal(result.checkIns.length, 1);
  });

  test('keeps everything without a wishlist', () => {
    const result = parseVivino(csv + holyGrail);
    assert.equal(result.wishlisted, 0);
    assert.equal(result.checkIns.length, 5);
  });
});
