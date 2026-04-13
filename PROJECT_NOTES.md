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
- Accept many upload formats at the boundary, but prefer a small number of internal geometry families:
  - `point`
  - `line`
  - `area`
- PMTiles is a derived render artifact, not the canonical data model.
- Canonical feature data should remain available for:
  - filtering
  - sorting
  - field discovery
  - value discovery
  - future moderation/query workflows
- Dataset field definitions and feature field values are different layers of the model:
  - dataset-level field definitions such as labels, types, required/optional status, and display order should live once on the dataset
  - per-feature field values should remain on each feature record
  - UI tables, sorting, filtering, upload cleanup, and future contribution forms should use dataset field definitions, not infer schema ad hoc from the currently loaded feature sample
- Destructive dataset deletion should stay deferred until user accounts/ownership are in place; the UI can prepare the confirmation flow earlier, but actual delete should wait until ownership and permissions are explicit.

## View Model
- A view is a shareable composition over one or more datasets.
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

## Shared Row Model
- Atlas layer panel behavior should come from one shared row system.
- A layer should be modeled as a data row plus its child rows, not as a separate controller concept.
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
- Style rows, filter rows, sort rows, and data rows must all participate through the same persistence, target-resolution, and runtime-application pipeline.
- Do not accept "bridge" refactors that make rows share shape while preserving special runtime behavior for `layer` rows.
- If a row kind cannot yet support the shared runtime contract, call that out explicitly instead of treating it as already unified.
- Filter rows should be generic query rows with presentation hints, not bespoke business widgets.
- Examples:
  - Olympics `Year` is a filter row with slider UI.
  - Olympics `Gold` / `Silver` / `Bronze` are filter rows with toggle UI.
  - Numeric threshold filters such as `Height >= X` should also be filter rows, with slider UI where appropriate.

## Default Child Rows
- New data rows should materialize the relevant styling rows by default.
- Preferred defaults:
  - point dataset -> point-style row
  - line dataset -> line-style row
  - area dataset -> fill-style row + line-style row
- Additional filters/sorts can be predefined per dataset, but should still use the same shared row system.

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

## Runtime Layer Model
- Shared row/menu structure and MapLibre runtime order should stay aligned.
- Avoid root-only or parent-only reorder algorithms.
- If a runtime ordering exception is required, encode it as a narrow data-driven exception inside the shared ordering system.
- Current point-runtime exception: dynamic point datasets collapse `Point` fill and `Line` stroke rows into one MapLibre `circle` layer, so fill/stroke styling and per-row visibility still work, but point fill-vs-stroke z-order is not independently reorderable at runtime.

## MapLibre Role
- MapLibre is the screen runtime shell for Atlas.
- It is a strong fit for:
  - interactive globe/screen rendering
  - tiled vector fills and lines used as runtime display layers
  - direct GeoJSON for lighter or bounded overlays
- The canonical source model should remain lon/lat vector data even when runtime delivery is tiled.

## Runtime Data Defaults
- Prefer this default model:
  - canonical source asset in lon/lat GeoJSON
  - runtime delivery chosen per layer
  - shared layer/row schema above that delivery choice
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
