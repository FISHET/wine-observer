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
| `npm run sync -- --force` | Sync even if the file is under an hour old |
| `npm run dev` | Vite dev server at http://localhost:5173 |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests |
| `npm run typecheck` | `tsc --noEmit` |

Tables available: `List`, `Inventory`, `Notes`, `Purchase`, `Pending`, `Consumed`.

## The app

`npm run dev` serves a sortable table of the cellar. Click any column heading to
sort; click again to reverse it. Blanks always sort last, and NV wines sort apart
from vintages rather than as the year 1001.

The page imports `data/cellar.csv` directly, so **run `npm run sync` first** or the
dev server and the build will both fail on the missing file.
