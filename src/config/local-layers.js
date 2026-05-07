// ─────────────────────────────────────────────────────────────────────────────
// Local layer registry — the ONE place to add or configure a layer.
//
// Each entry drives both the map rendering and the layer-menu UI automatically.
//
// SOURCE KINDS:
//   "geojson"       — static GeoJSON file served from /public/data/
//                     • url          required  full-quality source
//                     • initialUrl   optional  fast low-quality first paint, swapped after load
//   "atlas-vector"  — GeoJSON served as vector tiles (good for large files / interaction)
//                     • dataUrl      required  GeoJSON file path
//                     • sourceLayer  required  name of the vector tile layer
//   "pmtiles"       — streaming PMTiles (best for very large datasets)
//                     • pmtilesId    required  filename without extension in /public/pmtiles/
//                     • sourceLayer  required  name of the vector tile layer inside the PMTiles
//
// FILL / LINE:
//   Set to null to omit. All values are optional — defaults shown below.
//   fill: { color, opacity (0–100) }
//   line: { color, opacity (0–100), weight (px), cap ("butt"|"round"|"square"), join ("miter"|"round"|"bevel") }
//
// OTHER FLAGS:
//   group         — "earth" — built-in Earth base content
//   deferred      — true = loads after browser idle (use for hidden-by-default layers)
//   defaultVisible — false = hidden in the menu on first load
//   inInitialStyle — true = baked into the MapLibre initial style (fastest possible render)
//                    Only use for the most critical visible layers. Keep the list short.
//   menuLabel     — label shown in the layer menu (defaults to label)
// ─────────────────────────────────────────────────────────────────────────────

export const LOCAL_LAYERS = [
  // ── Earth ──────────────────────────────────────────────────────────────────

  {
    id: "land",
    label: "Land",
    group: "earth",
    deferred: false,
    defaultVisible: true,
    inInitialStyle: true, // fast 110m outline → swaps to full dissolved land after load
    source: {
      kind: "geojson",
      initialUrl: "/data/world-atlas/ne_110m_land.geojson",
      url: "/data/world-atlas/countries-dissolved-land.geojson",
    },
    fill: { color: "#6EAA6E", opacity: 100 },
    line: { color: "#000000", opacity: 100, weight: 1 },
  },

  {
    id: "graticules",
    label: "Graticules",
    group: "earth",
    deferred: false,
    defaultVisible: true,
    inInitialStyle: true,
    source: {
      kind: "atlas-vector",
      dataUrl: "/data/graticules/world-graticules-10deg.geojson",
      sourceLayer: "graticules",
    },
    fill: null,
    line: { color: "#8FA9BC", opacity: 100, weight: 1 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ID helpers — consistent naming used by map-instance.js and layer-model.js
// ─────────────────────────────────────────────────────────────────────────────

export function localLayerSourceId(id) { return `atlas-${id}`; }
export function localLayerTileSourceId(id) { return `atlas-${id}-tiles`; }
export function localLayerFillId(id) { return `atlas-${id}-fill`; }
export function localLayerLineId(id) { return `atlas-${id}-line`; }
