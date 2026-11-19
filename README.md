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

Click any column heading to sort; click again to reverse it. Blanks always sort
last, and NV wines sort apart from vintages rather than as the year 1001.

Each page loads from a small API (`src/api.ts`) rather than bundling the CSV,
so it builds without one. Before the first sync it says so; hit **Sync** in the
header. **Sync** on `/consumed` pulls `Consumed`, `Notes` and `Purchase` (only for
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

### Vivino

Vivino has no API, so its history is a one-off load. In Vivino, export your
data and save the full wine list as **`data/vivino.csv`**. It's git-ignored,
it's mounted into the container, and it's re-read on each page load, so a newer
export just replaces it. Every row is a check-in, rated or not.

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
  low. Scores aren't shown yet; they're for the scores view.

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
