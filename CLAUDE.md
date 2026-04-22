# Atlas Product — Agent Notes

## Stack

- **Frontend**: Vite + vanilla JS (ES modules), MapLibre GL JS loaded from CDN (`window.maplibregl`)
- **Hosting**: Cloudflare Pages
- **Planned backend**: Supabase (metadata + auth + RLS) + Cloudflare R2 (geometry files)
- **Map data**: PMTiles (vector tiles), GeoJSON, atlas vector tile protocol (custom)

## Key files

- `src/renderers/screen/maplibre/map-instance.js` — all MapLibre layer attachment, style updates, STANDARD_LAYER_REGISTRY
- `src/core/layer-model.js` — source of truth for layer UI definitions and default state
- `src/styles.css` — all styles
- `public/data/` — static GeoJSON served from Cloudflare Pages
- `public/pmtiles/` — PMTiles files (gitignored — serve locally for dev, upload to R2 for prod)
- `scripts/` — build scripts for generating data files (Node.js ESM)

## Layer system

Layers are defined in two places that must stay in sync:
1. `STANDARD_LAYER_REGISTRY` in `map-instance.js` — source/fill/line specs, deferred flag
2. `buildDefaultLayerState()` in `layer-model.js` — UI rows, labels, initial style values

Adding a new standard layer = one entry in each. The registry handles attach/style generically.

**Deferred layers** (`deferred: true`) load after `requestIdleCallback` — don't add large PMTiles layers as non-deferred.

**Critical path layers** (`deferred: false` AND in `buildStyle()`) load in parallel with MapLibre init. Only countriesLand and graticules are here. Keep this list small.

## Performance rules

- Layers in `buildStyle()` start fetching before the `load` event — only put the smallest/most important ones here
- `<link rel="preload">` in `index.html` for files that are in the initial style
- PMTiles load lazily via the PMTiles protocol — don't preload them
- `applyLogicalLayerOrder(map, groupId, ...)` — always pass `map` as first arg or layer ordering breaks silently

## Data files

Large files are gitignored — see `.gitignore`. Never commit:
- `public/pmtiles/*.pmtiles`
- `public/data/world-atlas/australia-land-*.geojson`
- `public/data/world-atlas/victoria-land*.geojson`
- `public/data/external-countries.geojson`

Generated files in `public/data/world-atlas/countries-dissolved-land.geojson` ARE committed (small enough, needed for initial render).

Build scripts in `scripts/` regenerate data files from source. Most require GDAL (`ogr2ogr`) or `world-atlas` (devDep).

## Planned: upload pipeline

Goal is a self-service system — the owner can upload data from anywhere without code changes.

1. **Supabase schema** — `layers` table with id, name, file_url, file_type, view_access, submit_access, default_style (JSONB)
2. **Cloudflare Worker** — authenticated upload endpoint → R2 + Supabase insert
3. **Dynamic registry** — replace hardcoded `STANDARD_LAYER_REGISTRY` with Supabase fetch on map init
4. **Admin UI** — in-app panel (auth-gated) for upload, preview, metadata editing

Do NOT write upload scripts or data manipulation scripts — the goal is tooling that lets the owner do this themselves.

## Planned: URL-scoped state

`atlas.layerState.v1.<context>` in localStorage — delta only (changed keys), per URL context. Canonical state lives in the URL; localStorage is the user's personal override. See memory notes for full design.

## Communication

- If the user's message ends with a question mark, answer the question first. Do not jump into making changes or proposing solutions.

## Conventions

- No TypeScript — vanilla JS only
- No framework — no React, Vue, etc.
- ES modules throughout (`type: "module"` in package.json)
- Build scripts use Node.js ESM — use `fileURLToPath(import.meta.url)` for `__dirname` equivalent (Windows-safe)
- Prefer editing existing files over creating new ones
- Don't add comments unless logic is non-obvious
