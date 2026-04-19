# Atlas Product Notes

## Scope
- Path: `/data/data/com.termux/files/home/layers/atlas-product`
- This file is the local architecture note set for the MapLibre Atlas app.
- Keep this file active and current, not archival.

## Product Model
- Atlas/Layers is an open geodata canvas, not only a layer editor.
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
- If a request conflicts with the current Atlas architecture, call that out before coding.
- If a new repeated pitfall or architecture rule becomes clear, add it here.
- When browser caching is plausible, verify the browser is running the intended code before trusting a diagnosis.
- During diagnosis/debugging turns, do not make code changes unless the user explicitly asks to implement a fix; analysis, inspection, and explanation are not implicit permission to patch.
- Temporary on-screen debug overlays should keep a persistent minimize/restore control in the top-left corner so the overlay can be hidden without removing the instrumentation.

## Shared Row Model
- Atlas layer panel behavior should come from one shared row system.
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
- Filters should be able to target either:
  - dataset source
  - feature field/value conditions
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
  - this is not yet fully explained; avoid assuming the persistence bug is solved until the post-boot runtime path is traced end-to-end

## Runtime Layer Model
- Shared row/menu structure and MapLibre runtime order should stay aligned.
- Avoid root-only or parent-only reorder algorithms.
- If a runtime ordering exception is required, encode it as a narrow data-driven exception inside the shared ordering system.
- Runtime rendering should resolve primarily by visual layer, not by treating each dataset as an independent top-level runtime layer.
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
- MapLibre is the screen runtime shell for Atlas.
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
- Runtime Atlas pattern:
  - one parent `Olympics` layer
  - shared child rows for `Year`, `Radius`, and medal filters
  - one source with filtered child layers
- Symbol sizes like Olympics point radius are screen-pixel values and should stay visually fixed in web mode.

## Transport
- Transport should use the same shared parent/child row model as every other Atlas layer.
- First shipped transport slice is `Rail (SA)`:
  - direct GeoJSON
  - fat line styling
  - honest regional scope
- Prefer public downloadable datasets over authenticated service endpoints for shipped Atlas layers.

## Git Notes
- Primary branch: `master`
- HTTPS push is working.
- If `git push` appears to say `Everything up-to-date` unexpectedly, verify branch state and retry before assuming the push actually happened.
