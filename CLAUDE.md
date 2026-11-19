# Cellar app – project context

A personal web app for Tom and his wife to visualise their wine cellar: what they hold, where each bottle lives, what to drink next, and progress against their cellar plan. It's for drinking, not investment.

## Source of truth

- **Cellar Plan doc** (Claude Doc): https://claude.ai/artifact/Ev3yybYkmafFTK1ENpfXBz
  This holds the storage layout, the rules, the preferences, the targets and the watch list. If the doc and this file disagree, the doc wins: ask Tom before changing either.
  - **Mirror:** `docs/Cellar Plan 2026–2028.md`, last saved **17 Nov 2026**. The artifact needs a login, so the mirror is the copy to read. Treat it as read-only: Tom edits the Claude doc and re-exports over the top, so the diff shows what changed between plan revisions. Never edit the mirror to record a decision — raise it with Tom. Check the saved date before trusting it against a fresher CellarTracker sync.
- **CellarTracker** is the stock list. Export URL format:
  `https://www.cellartracker.com/xlquery.asp?User=<user>&Password=<password>&Format=csv&Table=List`
  (`Table=Notes` gives tasting notes.)
  - **Credentials** go in `.env.local` (git-ignored) as `CT_USER` and `CT_PASSWORD`. Never put them in code, commits or logs.
  - **Encoding:** the CSV is **latin-1**, not UTF-8. Decode it explicitly, or accents break (Château, Télégraphe).
  - **CORS:** CellarTracker won't allow requests from the browser. Fetch from Node instead, either in a small script (`npm run sync`) that saves `data/cellar.csv` or in Vite dev-server middleware.

## Stack

- TypeScript, Vite. Keep dependencies light; Tom knows Vite well.
- Suggested: React, Papaparse for the CSV, and a small charting library such as Recharts.
- Local JSON files in `data/` for anything CellarTracker doesn't know (locations, rules, targets). No backend needed at first.

## Key CSV columns

`iWine` (stable wine id), `Vintage` (`1001` = NV), `Wine`, `Producer`, `Type`, `Color`, `Category`, `Size`, `Quantity`, `Pending`, `Price`, `Value`, `Country`, `Region`, `SubRegion`, `Appellation`, `Varietal`, `MasterVarietal`, `BeginConsume`, `EndConsume`, plus critic score columns (`WA`, `JS`, …) and `PScore`/`CScore`.

- `Quantity` = bottles in stock. This includes bottles held in bond.
- `Pending` = ordered but not yet arrived (mostly en primeur).

## Storage (as at 17 Nov 2026)

CellarTracker doesn't hold locations, so keep them in `data/locations.json`, keyed by `iWine`, with a count per location.

| Location | Capacity | Notes |
|---|---|---|
| Left fridge | Rated 42; **about 29 as packed** | 4 shelves. Top 2 are red, bottom 2 are fizz. |
| Right fridge | Rated 42; **about 29 as packed** | All red. The top shelf holds up to 8 showpieces and is lockable. |
| Rack | 10 stacks × 15 = 150 | Stacks: Australia, France 1, France 2, France 3, Italy, Other, Spain 1, Spain 2, UK, USA |
| Off rack | — | Silverhand case, Chapel Down magnum, Christmas pile, pét-nat in the upstairs fridge |
| L&W bond (Coterie Vaults) | — | Calling wine out resumes about mid-November |
| BBR bond | — | Vieux Télégraphe 2010 × 6 |
| Wine Society Members' Reserves | — | Saint Cosme Gigondas 2024 × 6 |

Fridge capacity depends on bottle shape. Rhône, Burgundy-shaped and fizz bottles pack worse than Bordeaux bottles, so model real capacity, not the rating.

## Counting conventions

- **Total in stock** = sum of `Quantity`, which includes bond. Pending is shown separately.
- **Party fizz** (11 bottles of Crémant and Prosecco for guests) is excluded from the tier and plan counts. Flag these bottles somehow.
- **Tiers:**
  - **Ready now:** in its drinking window, under £90.
  - **Mid-term:** not yet in its window.
  - **Long-term and showpieces:** value £90 or more.
  - **Fizz:** its own row.
- **NV rule:** a non-vintage bottle has no meaningful drinking window. Never flag NV as "past window".

## Rules to encode

- **Rack placement:** every bottle goes in its own country's stack. Other holds only de-prioritised countries (New Zealand, Argentina, Thailand, Denmark), or a country's overflow when its stack is full.
- **Summer storage:** from May to September the rack holds only bottles to drink within months. Anything ageing or precious goes in a fridge or bond. A "move before May" warning view would be useful.
- **Buying rule:** every purchase must be either drunk soon or held in bond. Duty-paid wine can't go into bond later.
- **Fridge priority:** bottles that are waiting on the rack for a fridge slot are marked; they get freed fridge space first.
- **Exploration:** about 1 bottle in 10 is an exploration bottle (a new region, producer or style, or one that challenges a preference).

## Plan targets (Year 1, autumn 2026 to autumn 2027)

About 187 bottles for about £7,400.

| Category | Target | Bought |
|---|---|---|
| Weekday Rhône | 72 | 28 |
| Mid-term Châteauneuf | 12 | 15 |
| Mature Vieux Télégraphe | 6 | 6 |
| Côte-Rôtie | 8 | 2 |
| Mature Bordeaux | 18 | 7 |
| Rioja and Ribera | 18 | 11 |
| Othello | 3 | 0 |
| Turley | 12 | 3 |
| Ridge | 6 | 0 |
| US showpieces | 3 | 0 |
| Australian Cabernet | 6 | 4 |
| Grower Champagne | 12 | 1 |
| English fizz | 6 | 4 |
| Tavel | 3 | 0 |
| Fortified | 2 | 0 |

The overall goal is about 300 bottles by autumn 2028. Category mapping will need a hand-maintained `data/categories.json`.

## Ideas for views (agree priorities with Tom)

1. Where everything is: fridge shelves and rack stacks as visual grids. Showing free slots matters.
2. Drink next: bottles in their window, those past their window, those earmarked for an occasion, and the fridge-priority bottles.
3. Drinking-window timeline across the whole cellar.
4. Plan progress against targets, and progress towards 300.
5. What's in bond and where, with the call-out plan.
6. Tasting notes and scores by category, feeding the "Developing preferences" section.

## Working style

- Tom is a staff-level quality engineer who knows TypeScript and Playwright. He'll want sensible tests: unit tests for parsing and rules, and possibly Playwright for the views.
- Ask before big structural choices. Keep the app personal and simple.