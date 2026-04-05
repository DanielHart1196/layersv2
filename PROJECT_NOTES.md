# Atlas Product Notes

## Scope
- Path: `/data/data/com.termux/files/home/layers/atlas-product`
- This file is the local architecture note set for the MapLibre Atlas app.
- Keep this file active and current, not archival.

## Working Rules
- Prefer small, self-contained changes.
- Keep behavior-preserving extraction separate from behavior-changing work.
- If a request conflicts with the current Atlas architecture, call that out before coding.
- If a new repeated pitfall or architecture rule becomes clear, add it here.
- When browser caching is plausible, verify the browser is running the intended code before trusting a diagnosis.

## Shared Row Model
- Atlas layer panel behavior should come from one shared row system.
- Parent rows and child rows should use the same default behavior for:
  - expand/collapse
  - visibility
  - drag/reorder
  - render-order derivation
- Child rows should be regular shared rows:
  - `layer`
  - `fill`
  - `line`
  - `slider`
  - future `filter` rows should follow the same model
- Do not add bespoke shell markup, bespoke chevron handling, or bespoke controller logic for a layer if it can be expressed through the shared row structure.
- Top-level categories like `Earth`, `Transport`, and `Empires` should be modeled as normal shared layer rows, not a separate weaker `group` concept.

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
- Primary branch: `main`
- HTTPS push is working.
- If `git push` appears to say `Everything up-to-date` unexpectedly, verify branch state and retry before assuming the push actually happened.
