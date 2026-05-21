# Layers Product Notes

## Scope
- Path: `/data/data/com.termux/files/home/layersv2`
- This file is the local architecture note set for the MapLibre Layers app.
- Keep this file active and current, not archival.

## Current Reset Direction
- Layers uses one main MapLibre globe runtime.
- Do not keep lab pages, deck overlays, custom globe test layers, or separate polar overlay systems in the production path.
- Preserve:
  - MapLibre as the screen renderer
  - local/shared row state for Earth styling
  - a compact top control surface for Earth/background/settings
  - explicit runtime ordering through shared row state
- Drop:
  - deck-backed Earth experiments
  - interleaved overlay experiments
  - custom full-world globe test layers
  - legacy polar overlay machinery
  - implicit ordering exceptions spread across renderer code
  - any "shared" abstraction that only looks unified in UI while staying bespoke in runtime

## Earth Baseline
- The current Earth baseline is MapLibre-native:
  - `atlas-water` background
  - low-detail local GeoJSON land fill in the initial style
  - graticules in the initial style
  - optional/deferred land outline after first render
- Prefer one Earth rendering path only.
- If MapLibre globe has a visual artifact, diagnose the active MapLibre source/layer path first before adding another renderer.

## Earth Rendering Lessons
- Interleaved deck Earth, non-interleaved deck Earth, custom full-world globe layers, and separate polar overlays were not kept as production architecture.
- Do not treat "same GL context" or a full-world custom layer as proof of exact globe alignment; test against MapLibre-native land/graticules before calling an alternate renderer viable.
- Large Earth/base geometry should be proven through the same MapLibre path the app ships, not through a lab page with different renderer semantics.
- Do not trust "supported" as equivalent to "production-safe in this exact runtime."

## Startup Performance Findings
- Recent startup "performance" changes made the app feel worse because they optimized for avoiding one early block rather than preserving the product load contract.
- Product load contract:
  - The menu must bind immediately.
  - The MapLibre globe shell must become interactive as soon as possible.
  - Core Earth visual context must appear as one coherent base: water, low-detail land, and graticules.
  - Dynamic/user datasets must not compete with core Earth startup.
- Do not defer graticules behind dynamic/Supabase layer restore. Graticules are part of Earth, not optional dynamic content.
- Do not put Earth's core visual pieces into a generic deferred queue whose ordering can be changed by unrelated background work.
- The recovery target:
  - `src/config/local-layers.js` keeps land and graticules in the initial Earth path.
  - `src/renderers/screen/maplibre/map-instance.js` should contain only the main MapLibre globe path plus ordinary dynamic layer support.
  - `src/app/bootstrap.js` should keep dynamic/Supabase restore explicitly after map startup and avoid loading hidden/heavy GeoJSON during first paint.
- Online guidance supports a different split:
  - Mapbox's GL JS performance model frames render/source/layer update time as a function of source count, layer count, and vertex count; reduce those for heavy datasets rather than reordering core base-map semantics.
  - Mapbox recommends vector tileset sources over large GeoJSON where possible because tiles load only visible features and simplify geometry.
  - Large GeoJSON sources are converted to vector tiles on the client; this means raw GeoJSON is not free just because it is loaded later.
  - For large GeoJSON, use source/layer zoom bounds, prune unused properties, reduce coordinate precision, tune buffer/tolerance, split sources, or tile server-side.
  - MapLibre custom globe layers are valid for simple WebGL content, but a single custom layer should not be treated as a production Earth renderer until alignment, clipping, ordering, and style behavior match native layers.
- Source references checked:
  - Mapbox GL JS performance model and vector tile recommendation: https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/
  - Mapbox large GeoJSON recommendations: https://docs.mapbox.com/help/ja/troubleshooting/working-with-large-geojson-data/
  - MapLibre custom globe layer API/example: https://maplibre.org/maplibre-gl-js/docs/examples/add-a-simple-custom-layer-on-a-globe/
  - MapLibre custom render method projection input: https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/CustomRenderMethodInput/

## Startup Recovery Plan
- First recovery step should be behavior restoration, not another rendering experiment.
- Restore a simple Earth-first boot order:
  - Bind menu/UI.
  - Construct MapLibre.
  - Initial style includes water background, low-detail land fill, and graticules.
  - Land outline may follow shortly, but it should not block or reorder graticules.
  - Dynamic/Supabase restore begins only after Earth base is complete.
- Keep experimental rendering paths out of the production runtime before further tuning:
  - no startup-quiet scheduler for Earth loading
  - no deck overlay startup code
  - no custom polar land
  - no temporary orange startup/debug UI
- Preferred immediate code direction:
  - Put `graticules` back into the initial Earth path, either as direct GeoJSON if the file is acceptable or as a simpler non-prewarmed layer that still attaches before dynamic layers.
  - Keep low-detail land small and packaged locally.
  - Keep high-detail land, heavy borders, empires, and persisted dynamic GeoJSON out of startup.
  - Do not auto-load hidden dynamic layers.
  - For visible persisted layers, prefer PMTiles or other tiled artifacts; skip or prompt for large raw GeoJSON.
- Longer-term direction:
  - Treat PMTiles/vector delivery as the solution for heavy datasets, not as an excuse to delay Earth basics.
  - Measure startup with explicit milestones: menu bound, MapLibre constructed, first render, Earth base complete, dynamic restore start, dynamic restore complete.

## Earth UI Direction
- Earth is a product-level base control, not just another ordinary user dataset row.
- A globe button in the top control strip is the preferred entry point for Earth controls.
- `Background`, `Earth`, and `Settings` can live beside each other as sibling top controls.
- The Earth control may open a dedicated Earth styling panel instead of appearing as a normal row in the main layer list.
- Earth can be bespoke in presentation while still reusing proven row-style UI patterns internally where they help.

## Earth UI Notes
- If Earth controls are shown as rows, `Land` should be a parent row with child rows for:
  - `Fill`
  - `Line`
- Child Earth rows, not only parent rows, should be allowed to own visibility, styling, and order state when they map to real render units.
- If Earth rows are shown in a compact stack, supporting controls such as `Add layer` should live in that same stack rhythm rather than being spaced by outer panel gaps.
- Header controls may be bespoke, but Earth layer controls should still behave like rows first.

## Earth State Direction
- Even if Earth UI is bespoke, Earth state should stay disciplined and explicit.
- Prefer simple persisted Earth targets such as:
  - `earth/ocean/fill`
  - `earth/land/fill`
  - `earth/land/line`
  - `earth/graticules/line`
- Reuse the existing style vocabulary where possible:
  - `fillColor`
  - `fillOpacity`
  - `lineColor`
  - `lineOpacity`
  - `lineWeight`
- Persist Earth styling state locally from the beginning.
- Earth persistence should be easy to read, easy to reset, and not entangled with old Earth compatibility state.

## Earth Ordering Notes
- Menu order, persisted order, and MapLibre render order should all come from the same shared Earth order state.
- The top item in the Earth menu should be the topmost rendered Earth layer. Do not invert that relationship.
- `Land` child order should map directly to `land.fill` and `land.line` render order, not through a parent-only special case.
- Persisted order restore should reorder the DOM on startup, but routine style sync should not re-append rows if order has not changed.
- Do not perform DOM row reordering during slider/color input refresh paths; that breaks focus and drag continuity for controls.

## Earth Reorder Interaction
- Earth row reordering should follow the proven main-project model:
  - drag starts after a movement threshold
  - once dragging starts, collapse the open row
  - reorder one adjacent slot at a time
  - move up when the pointer goes above the dragged row's top
  - move down when the pointer goes below the dragged row's bottom
- Avoid hover-target insertion math for Earth rows unless there is a clear demonstrated need; the adjacent-step model is easier to reason about and matched user expectations better here.
- While dragging, preview order updates should happen live as the row crosses its own top/bottom thresholds, not only on release.

## Rebuild Rules
- Build the next Earth runtime as if the old Earth runtime does not exist.
- Add only one Earth rendering path at a time.
- Do not reintroduce interleaving unless a fresh isolated proof demonstrates it working for the exact Earth geometry we need.
- Do not carry forward old Earth-specific ordering, restore, or polar exceptions unless the new build proves they are still necessary.
- Prefer a new small app shell over carefully transplanting old Earth code if transplanting would reintroduce hidden assumptions.
- Keep the rebuild notes opinionated enough that future work can say "no" to baggage quickly.

## Product Model
- Layers is an open geodata canvas, not only a layer editor.
- Datasets are public building blocks intended to be reusable by everyone.
- The main shareable artifact is usually a view:
  - a row tree
  - styling/filter/sort state
  - camera/projection state
  - potentially many datasets combined
- Most user activity should stay map-adjacent on the main home/map surface:
  - viewing
  - composing
  - styling
  - filtering
  - adding datasets
  - adding data points
- Dataset management, saved views, and contribution management can live in panels/modals or lightweight settings surfaces, but should stay connected to the main map workflow.

## Dataset Model
- Preserve raw import/provenance, but normalize imports into a canonical internal dataset model.
- Prefer an explicit three-part model:
  - `layers` are visual/style/composition parents
  - `datasets` are canonical imported data resources linked to exactly one parent layer
  - `features` belong to datasets, not layers
- One layer may link to many datasets.
- By default, all datasets linked to a layer render together as one visual layer.
- Parent layer style applies across all linked datasets by default.
- Accept many upload formats at the boundary, but prefer a small number of internal geometry families:
  - `point`
  - `line`
  - `area`
- Mixed-geometry datasets are allowed; do not assume one dataset maps to exactly one geometry family.
- PMTiles is a derived render artifact, not the canonical data model.
- Canonical feature data should remain available for:
  - filtering
  - sorting
  - field discovery
  - value discovery
  - future moderation/query workflows
  - rebuilding derived render artifacts
- Dataset field definitions and feature field values are different layers of the model:
  - dataset-level field definitions such as labels, types, required/optional status, and display order should live once on the dataset
  - per-feature field values should remain on each feature record
  - UI tables, sorting, filtering, upload cleanup, and future contribution forms should use dataset field definitions, not infer schema ad hoc from the currently loaded feature sample
- Uploaded files are provenance artifacts, not the primary runtime model.
- The canonical editable/queryable source of truth should be dataset + feature records, not the original uploaded file blob.
- Destructive dataset deletion should stay deferred until user accounts/ownership are in place; the UI can prepare the confirmation flow earlier, but actual delete should wait until ownership and permissions are explicit.

## Upload Pipeline
- Upload flow should support three distinct operations:
  - create a new top-level layer with an initial dataset
  - add a new dataset to an existing layer
  - append features to an existing dataset
- Creating a new top-level layer should:
  - create a layer
  - create a dataset linked to that layer
  - insert features linked to that dataset
- Adding a dataset to an existing layer should:
  - not create a new layer
  - create a dataset linked to the existing layer
  - insert features linked to that dataset
- Adding data to an existing dataset should:
  - not create a new layer
  - not create a new dataset
  - insert additional features linked to the existing dataset
- Import pipeline should parse uploaded files into canonical datasets and features, then derive runtime delivery artifacts from that canonical data.
- Clean/normalized feature data should be stored canonically.
- Keep the original uploaded file for provenance and reprocessing, but do not treat it as the long-term display source.
- Prefer cleaning at import time when it is semantics-preserving, such as:
  - dropping exact duplicate features
  - removing redundant properties
  - normalizing field names/types
  - reducing unnecessary coordinate precision where appropriate
- Treat destructive geometry changes such as dissolve/simplify as explicit derived-processing choices, not silent canonical mutations.

## View Model
- A view is a shareable composition over one or more layers, where each layer may itself aggregate many linked datasets.
- Dataset contribution and view sharing are different concerns:
  - users contribute datasets/data
  - users share views/compositions
- Prefer treating share URLs and saved states as views, not ad hoc runtime snapshots.

## Working Rules
- Prefer small, self-contained changes.
- Keep behavior-preserving extraction separate from behavior-changing work.
- If a request conflicts with the current Layers architecture, call that out before coding.
- If a new repeated pitfall or architecture rule becomes clear, add it here.
- When browser caching is plausible, verify the browser is running the intended code before trusting a diagnosis.
- During diagnosis/debugging turns, do not make code changes unless the user explicitly asks to implement a fix; analysis, inspection, and explanation are not implicit permission to patch.
- Temporary on-screen debug overlays should keep a persistent minimize/restore control in the top-left corner so the overlay can be hidden without removing the instrumentation.

## Shared Row Model
- Layers layer panel behavior should come from one shared row system.
- A layer should be modeled as a shared parent row plus its child rows, not as a separate controller concept.
- Dataset linkage should not require every linked dataset to appear as a standalone visible layer row in the main tree.
- Data management can live in a dedicated data flow/panel while still resolving through the same underlying shared row/state model where needed.
- Parent rows and child rows should use the same default behavior for:
  - expand/collapse
  - visibility
  - drag/reorder
  - render-order derivation
- Every visible panel item should be a row from the same architectural system.
- No row type should require bespoke controller logic to receive core row behavior.
- Differences between rows should live in row config and target resolution, not in parallel controller paths.
- "Shared row system" means the same structural source code and the same runtime semantics.
- It is not enough for rows to look unified in definitions or UI markup if `layer` rows still have privileged controller or renderer behavior.
- If a behavior works end-to-end only for `layer` rows, the shared-row refactor is incomplete.
- Current preferred row families:
  - `data`
  - `filter`
  - `sort`
  - `point-style`
  - `line-style`
  - `fill-style`
- Do not add bespoke shell markup, bespoke chevron handling, or bespoke controller logic for a layer if it can be expressed through the shared row structure.
- Top-level categories like `Earth`, `Transport`, and `Empires` should be modeled as normal shared layer rows, not a separate weaker `group` concept.
- `Earth` and `Ocean` remain the deliberate ordering/runtime exceptions.

## Row Semantics
- Shared row behavior should include:
  - enable/disable
  - expand/collapse
  - persistence
  - ordering
  - inherited visibility
  - target resolution
- Parent disable/enable state should inherit generically through the row tree; row types should not opt into this one by one.
- A row should declare what it is and what it targets; the shared row engine should derive:
  - what state it owns
  - what state it inherits
  - what runtime target it affects
  - how it persists
- The contract for visibility/enablement must be identical across row families.
- Style rows, filter rows, sort rows, and any data-management-backed rows must participate through the same persistence, target-resolution, and runtime-application pipeline.
- Do not accept "bridge" refactors that make rows share shape while preserving special runtime behavior for `layer` rows.
- If a row kind cannot yet support the shared runtime contract, call that out explicitly instead of treating it as already unified.
- Filter rows should be generic query rows with presentation hints, not bespoke business widgets.
- Future style-row undo should be transient UI state, not persisted or shared:
  - only one undo affordance should be visible at a time
  - the undo button should attach to the last edited `point-style`, `line-style`, or `fill-style` row
  - the button should sit in the row header near existing row tools, likely left of the drag handle when present
  - undo should restore that row's values to the baseline captured before the first edit in the current edit session for that row
  - editing another style row should move the undo affordance there and clear the previous visible undo
  - removing or hiding the row should clear its transient undo state
- Filters should be able to target either:
  - dataset source
  - feature field/value conditions
- Slider rows should own a value or choice only; the target decides whether that value drives style, a data-source choice, or filter conditions.
- Choice sliders can represent dataset/source choices such as Earth land detail without an Earth-specific runtime target.
- Variable sliders should be referenced by filter conditions through `valueRef` so the same slider value can drive multiple subfilters.
- Examples:
  - Olympics `Year` is a filter row with slider UI.
  - Olympics `Gold` / `Silver` / `Bronze` are filter rows with toggle UI.
  - Numeric threshold filters such as `Height >= X` should also be filter rows, with slider UI where appropriate.

## Default Child Rows
- New top-level layers should materialize the relevant styling rows by default based on geometry present across linked datasets.
- Preferred defaults:
  - any linked point dataset -> point-style row
  - any linked line dataset -> line-style row
  - any linked area dataset -> fill-style row + line-style row
- Mixed-geometry linked data is valid; style availability should derive from aggregate linked geometry, not from any one dataset being privileged.
- Additional filters/sorts can be predefined per layer or dataset family, but should still use the same shared row system.
- Prefer style rows as default structural children rather than user-added ad hoc rows for common geometry styling.

## Ordering
- Ordering should be definition-driven.
- Menu order, persisted order, and render order should all come from shared order state.
- Parent rows and child rows should use the same ordering semantics by default.
- MapLibre runtime row/subtree reorder should reapply the canonical full shared order, not a local-only move, so restored dynamic rows, child style rows, and backend layer order stay aligned.
- `Earth` is the deliberate exception:
  - it stays pinned first in the panel
  - it still renders as the visual base underneath the other top-level groups
- `Ocean` is pinned at the start inside `Earth`.

## Visibility Inheritance
- Parent visibility should be inherited generically by children.
- Child preferences should persist even when the parent is turned off.
- Child rows should appear greyed out when hidden by a disabled parent, not only when their own stored checkbox is off.
- Current visibility-persistence finding:
  - uploaded Supabase-backed top-level rows are persisting `visible` state in localStorage for both the local row id and the UUID-backed runtime layer state
  - the current inconsistency appears to be in restore or later runtime application, not in whether the toggle was saved at all
  - row ancestry and child runtime-target registration are part of the restore path for dynamic/Supabase-backed rows; if they are missing, child rows can look shared in the menu while ordering/visibility applies through incomplete runtime state
  - avoid assuming the persistence bug is solved until the post-boot runtime path is traced end-to-end

## Runtime Layer Model
- Shared row/menu structure and MapLibre runtime order should stay aligned.
- Avoid root-only or parent-only reorder algorithms.
- If a runtime ordering exception is required, encode it as a narrow data-driven exception inside the shared ordering system.
- Runtime rendering should resolve primarily by visual layer, not by treating each dataset as an independent top-level runtime layer.
- Runtime targets currently resolve through the MapLibre screen backend.
- Shared row targets must drive the runtime contract for:
  - style updates
  - visibility inheritance
  - ordering
  - live drag/reorder updates
- Dynamic/Supabase-backed runtime attachment must pass the model row id, parent row id, and child row definitions into the screen runtime so MapLibre can register runtime target ancestry for restored rows, filter rows, and default style children.
- Do not add a second renderer backend unless MapLibre has a demonstrated product blocker and the new backend passes the same row/state/order contract.
- Default runtime behavior for a layer with many linked datasets should be:
  - load all datasets linked to the layer
  - combine or co-resolve them under one visual layer contract
  - expose styling by geometry family at the layer level
- Preserve dataset identity in canonical/queryable data so filters can later isolate dataset-specific subsets and override parent styling.
- Current point-runtime exception: dynamic point datasets collapse `Point` fill and `Line` stroke rows into one MapLibre `circle` layer, so fill/stroke styling and per-row visibility still work, but point fill-vs-stroke z-order is not independently reorderable at runtime.
- Current runtime-debug finding:
  - for uploaded Supabase-backed rows, both point and polygon layers currently appear to go through the same startup visibility replay path
  - if one restored layer still comes back on incorrectly, the likely cause is a later runtime step overriding visibility rather than localStorage failing to save it

## MapLibre Role
- MapLibre is the screen runtime shell for Layers.
- It is a strong fit for:
  - interactive globe/screen rendering
  - tiled vector fills and lines used as runtime display layers
  - direct GeoJSON for lighter or bounded overlays
- The canonical source model should remain lon/lat vector data even when runtime delivery is tiled.

## Runtime Data Defaults
- Prefer this default model:
  - canonical source data in dataset + feature records
  - raw uploaded file retained as provenance
  - runtime delivery chosen per layer from derived artifacts built from canonical data
  - shared layer/row schema above that delivery choice
- Direct GeoJSON, PMTiles, or other runtime delivery formats are render artifacts, not the canonical data model.
- Country polygons are not the long-term semantic source of coastline-derived land.
- Use distinct concepts where needed:
  - `Countries` for country polygons and borders
  - separate land area
  - separate land outline

## Delivery Findings
- Heavy global screen layers are often more reliable as tiled vector delivery than as raw direct GeoJSON.
- The local `atlasvt://` path is a valid transitional tiling path.
- Long-term production direction is still stable hosted tiles under our control.
- For shipped/static local layers, prefer `src/config/local-layers.js` as the registry source. Avoid adding new one-off registry blocks in `map-instance.js`; existing Olympics/Empires special cases should move toward the shared local-layer/row model when touched.

## PMTiles Findings
- Semi-transparent tiled polygon fills can show square seam artifacts aligned to the tile grid.
- This is primarily a tile-boundary / alpha-blending issue, not always a source-detail issue.
- Fully opaque tiled fills avoid most of that seam class.
- If translucency is needed for a tiled fill, prefer pre-blending against the background rather than relying on live fill alpha.
- Many smaller regional PMTiles archives are a validated strategy for high-detail regional linework.

## Regional Fill Findings
- For semi-transparent area fills, bounded direct GeoJSON can behave better on screen than PMTiles polygon fills.
- `Victoria` fill and sliced `Australia` fill validated:
  - direct GeoJSON for regional area fill
  - PMTiles or other delivery for outline/linework when useful
- If a polygon-fill GeoJSON already gives the correct land edge, the matching line can come from stroking that same polygon source instead of maintaining a second outline delivery path.

## Core Atlas Source Plan
- Build broad public atlas content as first-class shared layer rows, not as bespoke basemap toggles:
  - `Nature`
  - `People`
  - `Borders`
  - `Transport`
  - `Terrain` / `Elevation` if terrain becomes more than a background style
- These top-level rows should use the same shared parent/child row contract as uploaded layers:
  - child rows own visibility and styling
  - filters such as class, scale rank, population rank, road class, rail type, biome, and admin level should be normal filter rows
  - shipped/static datasets should still expose provenance, license, and source metadata
- Delivery defaults:
  - Natural Earth scale data can be direct GeoJSON for MVP slices, but PMTiles is still preferred for consistent runtime behavior as layers accumulate.
  - Dense global data from OSM, Overture, HydroSHEDS, population grids, contours, or admin composites must be tiled and scale-dependent.
  - Avoid loading all global feature records into Supabase `features`; shipped atlas layers should be static artifacts plus metadata unless they need editable/queryable canonical records.
  - If a dataset is enormous but stable, prefer generated PMTiles/static metadata over treating it like an uploaded user dataset.

## Nature Source Plan
- MVP sources:
  - Natural Earth 10m/50m/110m physical vectors for rivers, lakes, reefs, glaciers/ice, playas, physical labels, and elevation points.
  - RESOLVE Ecoregions 2017 for biomes/ecoregions; it has 846 terrestrial ecoregions, 14 biomes, 8 realms, biome colors, ecoregion names, and CC-BY 4.0 metadata.
  - HydroSHEDS/HydroRIVERS/HydroLAKES/HydroBASINS for serious hydrology after the Natural Earth version proves the row/style structure.
- Later sources:
  - HydroATLAS if we want river/lake/basin environmental attributes, not only geometry.
  - Allen Coral Atlas for detailed reef habitat/extent, with more processing because it is Earth Engine/raster-oriented rather than a small vector file.
  - WDPA/Protected Planet for protected areas only after license constraints are reviewed; do not assume unrestricted commercial use.
- Suggested child rows:
  - `Biomes`
  - `Ecoregions`
  - `Rivers`
  - `Lakes`
  - `Wetlands / Mangroves`
  - `Reefs`
  - `Glaciers / Ice`
  - `Peaks`
  - `Volcanoes`
  - `Protected Areas` only when licensing is clear
- Styling notes:
  - Biomes should probably be dissolved or filtered by `BIOME_NAME` at low zoom, with ecoregion detail available at higher zoom/click.
  - Use RESOLVE/WWF biome categories for the actual data; Mapscaping's biome page is useful UX/color inspiration but is not a clear primary data source.
  - Hydrology line width should derive from scale rank/order/discharge where available.
- Source references checked:
  - Natural Earth 10m physical vectors: https://www.naturalearthdata.com/downloads/10m-physical-vectors/
  - RESOLVE Ecoregions 2017: https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017
  - HydroSHEDS products: https://www.hydrosheds.org/products
  - HydroATLAS: https://www.hydrosheds.org/hydroatlas
  - Allen Coral Atlas in Earth Engine: https://developers.google.com/earth-engine/datasets/catalog/ACA_reef_habitat_v2_0
  - WDPA license notes: https://www.unep-wcmc.org/en/wdpa-data-license

## People Source Plan
- MVP sources:
  - Natural Earth cultural vectors for populated places and urban areas.
  - Overture Maps `places`, `buildings`, and `addresses` for richer current human geography when we are ready for GeoParquet/DuckDB processing.
  - GHSL or WorldPop for population density / settlement surfaces; these are raster/grid products and should not be forced through normal vector feature rows.
- Suggested child rows:
  - `Cities`
  - `Towns / Settlements`
  - `Urban Areas`
  - `Population Density`
  - `Buildings` only as regional/high-zoom tiles, not global direct GeoJSON
  - `Places / POIs` only with aggressive filtering/search; global POI rendering can get noisy and heavy quickly
- Delivery notes:
  - Cities/populated places can start with Natural Earth points and scale ranks.
  - Population density belongs in raster or tiled grid delivery.
  - Overture is promising for standardized people/place data, but it has no single planet file; use bbox/cloud-native processing and generate our own PMTiles.
- Source references checked:
  - Natural Earth 10m cultural vectors: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
  - Overture quickstart: https://docs.overturemaps.org/getting-data/
  - Overture AWS registry/license notes: https://registry.opendata.aws/overture/
  - Overture Explorer/PMTiles note: https://docs.overturemaps.org/getting-data/explore/
  - GHSL overview: https://human-settlement.emergency.copernicus.eu/
  - WorldPop: https://www.worldpop.org/

## Borders Source Plan
- MVP sources:
  - Natural Earth cultural vectors for country polygons, boundary lines, admin-1 states/provinces, disputed areas, and map-friendly POV variants.
  - geoBoundaries for open-license administrative boundaries when we need more current/global ADM0/ADM1/ADM2 composites.
- Use GADM only with license caution; it is useful and detailed, but not the preferred default for open shipped Layers content.
- Suggested child rows:
  - `Countries`
  - `Country Borders`
  - `States / Provinces`
  - `Admin Districts`
  - `Disputed Areas`
  - `Maritime / EEZ` later, after source/license selection
- Delivery notes:
  - Natural Earth is the cartographic default for global visual borders.
  - geoBoundaries is better for explicit administrative datasets and downloadable/open-license composites.
  - Political boundary worldview/POV must be explicit; do not silently mix de facto, de jure, disputed, and local POV boundaries.
- Source references checked:
  - Natural Earth 10m cultural vectors: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
  - geoBoundaries: https://www.geoboundaries.org/
  - GADM world download: https://gadm.org/download_world.html

## Transport Source Plan
- MVP sources:
  - Natural Earth cultural vectors for global roads, railroads, airports, ports, and populated-place-adjacent transport at small scale.
  - OpenStreetMap via Geofabrik extracts for serious roads, paths, tracks, rail, trams, subway/light rail, ferry routes, stations, and transport infrastructure.
  - Overture Maps `transportation` as a standardized alternative/augmentation to raw OSM when we are ready for cloud-native processing.
- Rail detail:
  - OpenRailwayMap is useful as a schema/style reference for rail/tram/subway/electrification/gauge/speed concepts, but the underlying current railway data is OSM.
  - OpenHistoricalMap may be needed for demolished/abandoned historical rail where OSM intentionally avoids non-existent features.
- Suggested child rows:
  - `Roads`
  - `Tracks / Paths`
  - `Rail`
  - `Trams / Light Rail`
  - `Subway / Metro`
  - `Stations`
  - `Ferries`
  - `Airports`
  - `Ports`
- Delivery notes:
  - Transport must be PMTiles/vector-tile-first at any serious scale.
  - Use zoom-dependent filters and style classes; do not render every road/path/track at global zoom.
  - Raw Geofabrik shapefiles may omit some OSM tags; for richer tagging, process `.osm.pbf` directly.
- Source references checked:
  - Geofabrik OSM downloads/extracts: https://www.geofabrik.de/geofabrik/openstreetmap.html
  - Geofabrik data/shapefile notes: https://www.geofabrik.de/en/data/index.html
  - OSM download approaches: https://wiki.openstreetmap.org/wiki/Download
  - OpenRailwayMap overview: https://wiki.openstreetmap.org/wiki/OpenRailwayMap
  - OSM railway tagging: https://wiki.openstreetmap.org/wiki/Railways
  - Overture data: https://docs.overturemaps.org/getting-data/

## Elevation / Terrain Source Plan
- Treat elevation as two different products:
  - visual terrain background: shaded relief, hillshade, DEM terrain, hypsometric tint
  - queryable/vector layers: contours, elevation points, peaks, mountain ranges
- MVP sources:
  - Natural Earth raster relief/hypsometric products for immediate cartographic background if local raster delivery is acceptable.
  - Natural Earth elevation points for lightweight named/major elevation points.
  - Copernicus DEM GLO-30/GLO-90 for high-quality global DEM processing when we generate our own terrain tiles/contours.
- Runtime notes:
  - MapLibre supports `raster-dem` sources for Mapbox Terrain-RGB and Mapzen Terrarium encodings.
  - Terrain background should live close to Earth/base rendering, while contours/peaks can be normal shared rows.
  - Global contours generated from DEMs will be large and must be tiled.
- Source references checked:
  - MapLibre raster-dem source spec: https://maplibre.org/maplibre-style-spec/sources/
  - Copernicus DEM: https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
  - Natural Earth raster downloads: https://www.naturalearthdata.com/downloads/

## Temporal Layers
- Time should be a property of layer data, not a custom frontend system.
- Any layer can be static or temporal depending on available time states.
- The renderer should stay dumb:
  - resolve the active geometry/features for the selected time
  - render them like any other layer
- Prefer one logical runtime artifact per layer, even if preprocessing uses many files.

## Olympics
- First generic temporal-layer proof is Olympic medals by athlete birthplace.
- Source family:
  - `data/sources/olympicsgonuts/1996+`
- Available years:
  - `1996` through `2024`
- Runtime Layers pattern:
  - one parent `Olympics` layer
  - shared child rows for `Year`, `Radius`, and medal filters
  - one source with filtered child layers
- Symbol sizes like Olympics point radius are screen-pixel values and should stay visually fixed in web mode.

## Transport
- Transport should use the same shared parent/child row model as every other Layers layer.
- First shipped transport slice is `Rail (SA)`:
  - direct GeoJSON
  - fat line styling
  - honest regional scope
- Prefer public downloadable datasets over authenticated service endpoints for shipped Layers layers.

## Git Notes
- Primary branch: `master`
- HTTPS push is working.
- If `git push` appears to say `Everything up-to-date` unexpectedly, verify branch state and retry before assuming the push actually happened.
