# Atlasify — Passport Power Index

Passport-power, visa-free-travel, and dual-citizenship reference data for ~199
countries, stored as versioned JSON with a monthly AI-assisted research
workflow that proposes updates as pull requests.

## Structure

```
data/schema.json          JSON Schema (draft 2020-12) every country record must satisfy
data/manifest.json         list of ISO3 codes, generated — the frontend fetches this first
data/countries/<ISO3>.json one record per country
js/main.js                  frontend: fetches manifest + all country files, renders the site
index.html
scripts/build-manifest.mjs  regenerates data/manifest.json from data/countries/
scripts/validate-data.mjs   validates every country file against the schema + manifest sync
scripts/ai-update/          the monthly research script (see below)
```

## Data schema

Each `data/countries/<ISO3>.json` file:

```json
{
  "iso2": "NL", "iso3": "NLD",
  "name": { "en": "Netherlands", "nl": "Nederland" },
  "region": "Europa",
  "passportIndex": { "score": 185, "maxDestinations": 227, "note": "..." | null },
  "flags": { "euMember": true, "schengenMember": true, "usVisaWaiver": true, "citizenshipByInvestment": false },
  "dualNationality": { "status": "allowed" | "restricted" | "not_allowed", "note": "..." | null },
  "sources": [ { "label": "...", "url": "...", "accessedDate": "YYYY-MM-DD", "fields": ["passportIndex.score"] } ],
  "lastUpdated": "YYYY-MM-DD"
}
```

Rank and mobility tier are **not** stored — they're computed in `js/main.js`
from `score`, so a single score edit never requires touching any other file.

The initial 199 records were migrated from a static Henley Passport
Index–derived dataset; the `sources` entries on that first commit reference
Henley generically rather than a per-field citation. The monthly workflow's
job is to progressively verify and re-cite each field against a real,
current source.

## Local development

The frontend uses `fetch()` to load `data/manifest.json` and every country
file, so it must be served over HTTP — opening `index.html` directly
(`file://`) will fail with a CORS error. Serve it with any static server, e.g.:

```sh
npx serve .
# or: npx http-server .
```

```sh
npm install
npm run validate         # schema-check all 199 country files
npm run build:manifest   # regenerate data/manifest.json after adding/removing a country file
```

## CI

`.github/workflows/validate.yml` runs on every push and PR: it regenerates
`data/manifest.json` and fails if that produces a diff (stale manifest), then
validates every country file against `data/schema.json`.

## Monthly AI-assisted update workflow

`.github/workflows/monthly-update.yml` runs on the 1st of every month (and
can be triggered manually from the Actions tab). It runs
`scripts/ai-update/update-data.mjs`, which asks Claude — with the `web_search`
tool enabled — to verify each country's data against real, current sources,
then opens a **pull request** via `peter-evans/create-pull-request` with a
table of every proposed change and its source.

**This workflow never publishes changes automatically.** It has
`contents: write` + `pull-requests: write` only — enough to open a PR, not to
merge one or push to a protected branch — and no merge step is configured
anywhere in this repo. Auto-merge is not enabled on the repository, and
nothing here calls `peter-evans/enable-pull-request-automerge` or the GitHub
auto-merge API. Every monthly PR requires a human to review the cited
sources and merge it manually.

The script also hard-rejects (in code, not just via prompting) any proposed
change whose source URL is missing or malformed — a citation is mandatory.

### Required setup (one-time, manual)

Add your Anthropic API key as a repo secret — this is **not** done by any
automation in this repo:

```sh
gh secret set ANTHROPIC_API_KEY
```

### Configuration

| Env var    | Default          | Purpose                                                                 |
| ---------- | ---------------- | ------------------------------------------------------------------------ |
| `MODEL`    | `claude-opus-4-8` | Set to e.g. `claude-sonnet-5` to reduce cost across the ~199 monthly calls with web search. |
| `LIMIT`    | unset (all 199)  | Cap the number of countries checked per run, for cost control or testing. |
| `DRY_RUN`  | unset            | Set to `1` to skip the Anthropic API entirely and exercise the write/validate/PR-body plumbing with no network call. |

Run it locally with:

```sh
ANTHROPIC_API_KEY=sk-... npm run ai-update
# or, with no API key / network:
DRY_RUN=1 LIMIT=5 npm run ai-update
```
