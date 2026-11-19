# wine-observer

A visualiser for wine exploration.

See [CLAUDE.md](CLAUDE.md) for the cellar context: storage layout, rules, tiers and plan targets.

## Syncing from CellarTracker

1. `npm install`
2. `cp .env.local.example .env.local` and fill it in.
3. `npm run sync`

This writes `data/cellar.csv` (git-ignored). The response is decoded from latin-1
so accents survive, and the password is never logged.

### Credentials

`CT_USER` is your CellarTracker **username, not your email address** — the handle
in your profile URL, `cellartracker.com/list.asp?Table=List&User=<this bit>`.

Special characters in the password need no quoting or escaping.

The export endpoint is unhelpful when authentication fails: it answers
`200 OK` with the plain-text body `You are currently not logged into CellarTracker.`
for a wrong username, a wrong password *and* no credentials at all. There is no
way to tell those apart from the response, so check the pair by signing in at
cellartracker.com in a private window before debugging anything else.

`.env.local` is read by `src/env.ts` rather than Node's `--env-file`, which
truncates a value at the first `#` even with no whitespace before it. A password
of `abc#def` silently became `abc`, which then looks exactly like a wrong
password. Don't swap the loader back without reading that file.

| Command | What it does |
|---|---|
| `npm run sync` | The `List` table → `data/cellar.csv` |
| `npm run sync -- --table Notes` | Tasting notes → `data/notes.csv` |
| `npm run sync -- --table Consumed` | Bottles consumed → `data/consumed.csv` |
| `npm run sync -- --force` | Sync even if the file is under an hour old |
| `npm run dev` | Vite dev server at http://localhost:5173 |
| `npm run build` | Production build into `dist/` |
| `npm start` | The standalone server: built app, API and nightly sync, on port 8080 |
| `npm test` | Unit tests |
| `npm run typecheck` | `tsc --noEmit` |

Tables available: `List`, `Inventory`, `Notes`, `Purchase`, `Pending`, `Consumed`.

## The app

| Page | What it shows |
|---|---|
| `/` | Links to the other pages |
| `/cellar` | A sortable table of every wine in stock (the `List` table) |
| `/consumed` | Every wine drunk or tasted, one line per wine and vintage, from CellarTracker and Vivino |
| `/scores` | Every tasting, one line each, with its score and note, from CellarTracker and Vivino |

Click any column heading to sort; click again to reverse it. Blanks always sort
last, and NV wines sort apart from vintages rather than as the year 1001.

Each page loads from a small API (`src/api.ts`) rather than bundling the CSV,
so it builds without one. Before the first sync it says so; hit **Sync** in the
header. **Sync** on `/consumed` or `/scores` pulls `Consumed`, `Notes` and `Purchase` (only for
producers: `Consumed` has no Producer column). A table
synced within the last hour is skipped unless you choose **Sync anyway**,
because CellarTracker ask that the export isn't hammered.

### What counts as consumed

Every CellarTracker check-in: each bottle in `Consumed`, and each tasting note
with no bottle behind it (a tasting, a bottle out). A note is paired with its
bottle by CellarTracker's own link (`iNote`), or failing that, a bottle of the
same wine (`iWine`) drunk on the day or up to three days before the note, so a
note written up the next morning doesn't count as a second bottle.

Check-ins are then grouped into one line per wine and vintage, with a
**Bottles** count.

### What counts as a tasting

`/scores` doesn't group by wine, because a wine tasted several times as it
matures gets a different note and score each time. A tasting is a CellarTracker
note, or a Vivino check-in with a rating or a review. A bare Vivino check-in
only says the wine was drunk, so it counts on `/consumed` but isn't listed here.

A tasting logged in both apps shows as two lines, one per app. Vivino rarely
dates a check-in, so there's no safe way to tell which CellarTracker note it
pairs with. Both lines share the wine's description, though: a Vivino tasting
of a wine CellarTracker knows is described as CellarTracker describes it.

### Vivino

Vivino has no API, so its history is a one-off load. In Vivino, export your
data and save the full wine list as **`data/vivino.csv`**. It's git-ignored,
it's mounted into the container, and it's re-read on each page load, so a newer
export just replaces it. Every row is a check-in, rated or not.

- **Wishlist.** Vivino's full wine list also includes wishlisted wines, and
  there's no export of just the wines drunk. Save the wishlist export as
  **`data/wishlisted.csv`** too. A row that's on the wishlist and has no rating
  and no review is dropped. A rated or reviewed row is kept, because that was a
  real tasting. Each wishlist entry drops at most one row. Rows are matched by
  Vivino's wine link, or by winery, name and vintage when the link is missing.
  Without the file nothing is dropped, and `/consumed` says so.

- **Matching.** Vivino has no CellarTracker id, so a Vivino wine joins a
  CellarTracker line only when the vintages agree and the names match both ways
  round (`src/match.ts`). A generic "Châteauneuf-du-Pape Rouge" won't claim a
  specific cuvée. A blank Vivino vintage only matches an NV wine, because Vivino
  leaves the vintage blank both for NV and for "not recorded". Doubtful pairs are
  left as two lines rather than risk hiding a wine.
- **Counting.** Where both apps have a wine, **Bottles** is the larger of the two
  counts, not the sum, on the basis that a bottle was usually logged in both.
  Hover the count to see each app's figure.
- **Scores.** Vivino rates out of 5. Ratings are converted to the 100-point scale
  as **50 + 10 × stars** (4.0 → 90, 3.5 → 85), which matched the CellarTracker
  scores closely on wines rated in both. Doubling (× 20) read about six points
  low. Hover a Vivino score on `/scores` to see the stars.
- **Grapes.** Vivino has no grape field, only a "Regional wine style" such as
  "French Champagne". **`data/grape-styles.json`** maps each style to the grape
  CellarTracker would use (`"French Champagne": "Champagne Blend"`). It's
  hand-maintained and committed, and it's re-read on each page load. A style that
  isn't in it is shown as it is, and the consumed page lists the ones still to
  map. Hover a grape to see the style it came from. The mapping works by style,
  not by wine, so a Blanc de Blancs Champagne still shows as Champagne Blend. Where
  CellarTracker also has the wine, its own grape wins.

## Running on the home server

`compose.yaml` runs the standalone server (`src/server.ts`), which serves the
built app and the API and runs the nightly sync, all in one Node process.

```sh
cp .env.local.example .env.local   # and fill it in, before the first `up`
docker compose up -d --build
docker compose logs -f cellar
```

Then open `http://<server>:8080` from the LAN. There is no login, so don't
expose the port beyond the LAN.

- **`.env.local` must exist before the first `up`.** It's bind-mounted read-only,
  and if it's missing Docker creates an empty *directory* in its place.
- **`data/` is bind-mounted** so the synced CSVs and the hand-maintained JSON sit
  together in the checkout. The container runs as uid 1000, which needs write
  access to it.

### The nightly sync

At `NIGHTLY_SYNC_AT` (default `03:00`, local time per `TZ`) the server syncs the
`List`, `Notes`, `Consumed` and `Purchase` tables:

- A table already **synced since midnight** is skipped, so a manual sync that
  evening counts for the night. The hourly limit still applies too.
- If a table fails, the whole run is **retried once an hour later**, and the page
  shows a warning until the next good run or a manual sync.
- If the server starts after the run time (a reboot, say), it **catches up
  straight away**. Tables synced that day are skipped, so restarts cost nothing.
- The button and the nightly job share one lock per table, so they never fetch
  the same table twice at once.
- `NIGHTLY_SYNC_AT=off` turns it off. Under `npm run dev` there is no nightly
  sync at all.

Without `TZ`, the container would run on UTC and 03:00 would mean 04:00 BST.
The image sets `TZ=Europe/London`.

## Credits

- The close icon on notices (`src/ui/assets/cancel.svg`) is from [SVG Repo](https://www.svgrepo.com/), under CC0, so no attribution is required.
