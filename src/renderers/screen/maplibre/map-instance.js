// MapLibre loaded from CDN - use global instead of import
// import maplibregl from "maplibre-gl";
// import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer } from "@deck.gl/layers";
import { Protocol } from "pmtiles";
import polygonClipping from "polygon-clipping";
import {
  createGeojsonVectorSourceSpec,
  installAtlasVectorTileProtocol,
  registerGeojsonVectorTileSource,
  prewarmTileSource,
} from "./vector-tiles.js";
import {
  LOCAL_LAYERS,
  localLayerSourceId,
  localLayerTileSourceId,
  localLayerFillId,
  localLayerLineId,
} from "../../../config/local-layers.js";
import {
  ROOT_PARENT_ID,
  ROOT_ROW_IDS,
} from "../../../core/layer-definitions.js";

let protocolInstalled = false;

// Track which layers have been loaded to prevent duplicate loading
const loadedLayers = new Set();
const OLYMPICS_SOURCE_ID = "atlas-olympics";
const OLYMPICS_GOLD_LAYER_ID = "atlas-olympics-gold";
const OLYMPICS_SILVER_LAYER_ID = "atlas-olympics-silver";
const OLYMPICS_BRONZE_LAYER_ID = "atlas-olympics-bronze";
const EARTH_ROW_ID = "earth";
const OLYMPICS_RUNTIME_TARGET_LAYER_IDS = {
  olympicsGold: [OLYMPICS_GOLD_LAYER_ID],
  olympicsSilver: [OLYMPICS_SILVER_LAYER_ID],
  olympicsBronze: [OLYMPICS_BRONZE_LAYER_ID],
};
const AUSTRALIA_TILE_IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const AUSTRALIA_OUTLINE_TILE_SOURCE_LAYER = "coastlines";
const AUSTRALIA_OUTLINE_SOURCE_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-outline-${tileId}`);
const AUSTRALIA_OUTLINE_TILE_SOURCE_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-outline-tiles-${tileId}`);
const AUSTRALIA_OUTLINE_LINE_LAYER_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-outline-line-${tileId}`);
const AUSTRALIA_OUTLINE_PMTILES_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `osm-outline-australia-${tileId}`);
const AUSTRALIA_FILL_SOURCE_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-fill-${tileId}`);
const AUSTRALIA_FILL_LAYER_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-fill-${tileId}`);
const AUSTRALIA_FILL_VECTOR_URLS = AUSTRALIA_TILE_IDS.map((tileId) => `/data/world-atlas/australia-land-${tileId}.geojson`);
// Standard layer IDs derived from config — see src/config/local-layers.js

const VICTORIA_TILE_IDS = ["a", "b", "c", "d"];
const VICTORIA_FILL_SOURCE_ID = "atlas-victoria-fill";
const VICTORIA_FILL_LAYER_ID = "atlas-victoria-fill";
const VICTORIA_FILL_VECTOR_URL = "/data/world-atlas/victoria-land.geojson";
const VICTORIA_OUTLINE_TILE_SOURCE_LAYER = "coastlines";
const VICTORIA_OUTLINE_PMTILES_IDS = VICTORIA_TILE_IDS.map((tileId) => `osm-outline-victoria-${tileId}`);
const VICTORIA_OUTLINE_SOURCE_IDS = VICTORIA_TILE_IDS.map((tileId) => `atlas-victoria-outline-${tileId}`);
const VICTORIA_OUTLINE_LINE_LAYER_IDS = VICTORIA_TILE_IDS.map((tileId) => `atlas-victoria-outline-line-${tileId}`);
const ROMAN_SOURCE_ID = "atlas-roman-empire";
const ROMAN_FILL_SOURCE_ID = "atlas-roman-empire-fill-source";
const ROMAN_FILL_SOURCE_LAYER = "roman-fill";
const ROMAN_FILL_LAYER_ID = "atlas-roman-empire-fill";
const ROMAN_LINE_LAYER_ID = "atlas-roman-empire-line";
const ROMAN_VECTOR_URL = "/data/empires/roman_empire_117ad_major_empires_source.geojson";
const MONGOL_SOURCE_ID = "atlas-mongol-empire";
const MONGOL_FILL_LAYER_ID = "atlas-mongol-empire-fill";
const MONGOL_LINE_LAYER_ID = "atlas-mongol-empire-line";
const MONGOL_FILL_SOURCE_ID = "atlas-mongol-empire-fill-source";
const MONGOL_FILL_SOURCE_LAYER = "mongol-fill";
const MONGOL_VECTOR_URL = "/data/empires/mongol_empire_1279_extent.medium.geojson";
const MONGOL_FILL_VECTOR_URL = "/data/empires/mongol_empire_1279_extent.medium.dissolved-fill.geojson";
const BRITISH_SOURCE_ID = "atlas-british-empire";
const BRITISH_FILL_SOURCE_ID = "atlas-british-empire-fill-source";
const BRITISH_FILL_SOURCE_LAYER = "british-fill";
const BRITISH_FILL_LAYER_ID = "atlas-british-empire-fill";
const BRITISH_LINE_LAYER_ID = "atlas-british-empire-line";
const BRITISH_VECTOR_URL = "/data/empires/british_empire_1921_extent.low.self-cutout.geojson";
const EMPIRE_FILL_LAYER_IDS = {
  roman: ROMAN_FILL_LAYER_ID,
  mongol: MONGOL_FILL_LAYER_ID,
  british: BRITISH_FILL_LAYER_ID,
};
const EMPIRE_LINE_LAYER_IDS = {
  roman: ROMAN_LINE_LAYER_ID,
  mongol: MONGOL_LINE_LAYER_ID,
  british: BRITISH_LINE_LAYER_ID,
};
const LINE_LAYER_IDS = {
  australia: AUSTRALIA_OUTLINE_LINE_LAYER_IDS[0],
  victoria: VICTORIA_OUTLINE_LINE_LAYER_IDS[0],
  ...EMPIRE_LINE_LAYER_IDS,
  ...Object.fromEntries(LOCAL_LAYERS.filter((l) => l.line).map((l) => [l.id, localLayerLineId(l.id)])),
};
const WATER_BACKGROUND_COLOR = { r: 44, g: 111, b: 146 };
const DEFAULT_LAND_FILL_COLOR = "#6EAA6E";
const SOUTH_POLAR_INTERLEAVED_LAND_FILL_COLOR = "#ff2f2f";
const DEFAULT_OCEAN_FILL_COLOR = "#2C6F92";
const DEFAULT_OUTLINE_LINE_COLOR = "#d9e4da";
const LEGACY_POLAR_OVERLAY_ENABLED = false;
const FRESH_INTERLEAVED_OVERLAY_ENABLED = true;
const FRESH_INTERLEAVED_LAYER_ID = "fresh-interleaved-polar-rotation-test";
const FRESH_INTERLEAVED_LAND_FILL_LAYER_ID = "fresh-interleaved-land-fill";
const FRESH_INTERLEAVED_LAND_LINE_LAYER_ID = "fresh-interleaved-land-line";
const FRESH_INTERLEAVED_OCEAN_LAYER_ID = "fresh-interleaved-ocean";
const FRESH_INTERLEAVED_GRATICULES_LAYER_ID = "fresh-interleaved-graticules";
const FRESH_INTERLEAVED_LAND_INITIAL_SOURCE_URL = "/data/world-atlas/ne_110m_land.geojson";
const FRESH_INTERLEAVED_LAND_HIGH_SOURCE_URL = "/data/world-atlas/countries-dissolved-land.geojson";
const FRESH_INTERLEAVED_GRATICULES_SOURCE_URL = "/data/graticules/world-graticules-10deg.geojson";
const FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE = 84;
const SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED = true;
const SOUTH_POLAR_INTERLEAVED_BEFORE_ID = localLayerFillId("land");
const SOUTH_POLAR_CAP_SOURCE_URL = "/data/world-atlas/ne_110m_land.geojson";
const GRATICULES_SOURCE_URL = "/data/graticules/world-graticules-10deg.geojson";
const SOUTH_POLAR_CAP_DECK_LATITUDE = -84;
const SOUTH_POLAR_CAP_SOURCE_DECK_LATITUDE = -83;
const SOUTH_POLAR_CAP_RING_STEP_DEGREES = 0.1;
const POLAR_CAP_VISIBLE_LATITUDE = Math.abs(SOUTH_POLAR_CAP_DECK_LATITUDE);
const POLAR_CAP_SOURCE_LATITUDE = Math.abs(SOUTH_POLAR_CAP_SOURCE_DECK_LATITUDE);
const SOUTH_POLAR_BACKGROUND_LAYER_ID = "polar-background-south-cap";
const SOUTH_POLAR_OCEAN_LAYER_ID = "polar-ocean-south-cap";
const SOUTH_POLAR_CAP_LAYER_ID = "polar-land-south-cap";
const POLAR_GRATICULES_LAYER_ID = "polar-graticules";
const SCALE_BAR_MAX_WIDTH_PX = 120;
const SCALE_BAR_HIDE_DELAY_MS = 1200;
const SCALE_BAR_SCREEN_OFFSET_X = 18;
const SCALE_BAR_SCREEN_OFFSET_Y = 28;
const COMPASS_ACTIVE_BEARING_THRESHOLD = 0.5;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;
const POLAR_RENDER_MODES = {
  NONE: "none",
  SOUTH: "south",
  NORTH: "north",
  BOTH: "both",
};

function getFirstExistingLayerId(map, candidateIds) {
  return candidateIds.find((id) => map.getLayer(id)) ?? null;
}

function getInitialGlobeZoom(container, fallbackZoom) {
  const width = container?.clientWidth ?? 0;
  const height = container?.clientHeight ?? 0;
  const minDimension = Math.min(width, height);

  if (!(minDimension > 0)) {
    return fallbackZoom;
  }

  return Math.max(0.9, Math.min(2.8, minDimension / 300));
}


function createScaleOverlay(container) {
  const overlay = document.createElement("div");
  overlay.className = "map-scale";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="map-scale-labels">
      <span class="map-scale-label map-scale-label-metric"></span>
      <span class="map-scale-label map-scale-label-imperial"></span>
    </div>
    <div class="map-scale-bar"></div>
  `;
  container.append(overlay);
  return overlay;
}

function createCompassOverlay(container) {
  const button = document.createElement("button");
  button.className = "map-compass";
  button.type = "button";
  button.setAttribute("aria-label", "Reset map to north");
  button.innerHTML = `
    <span class="map-compass-ring" aria-hidden="true">
      <span class="map-compass-arrow"></span>
    </span>
    <span class="map-compass-label" aria-hidden="true">N</span>
  `;
  container.append(button);
  return button;
}

function createPolarDebugOverlay(container) {
  const overlay = document.createElement("div");
  overlay.className = "polar-debug is-collapsed";
  overlay.innerHTML = `
    <button class="polar-debug-toggle" type="button" aria-expanded="false" aria-label="Expand polar debug">Polar</button>
    <div class="polar-debug-body"></div>
  `;
  const toggle = overlay.querySelector(".polar-debug-toggle");
  toggle?.addEventListener("click", () => {
    const collapsed = !overlay.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", collapsed ? "true" : "false");
    toggle.setAttribute("aria-label", collapsed ? "Collapse polar debug" : "Expand polar debug");
  });
  container.append(overlay);
  return overlay;
}

function createFreshInterleavedDebugOverlay(container) {
  const overlay = document.createElement("div");
  overlay.className = "polar-debug fresh-interleaved-debug";
  overlay.innerHTML = `
    <button class="polar-debug-toggle" type="button" aria-expanded="true" aria-label="Collapse fresh interleaved debug">Fresh</button>
    <div class="polar-debug-body"></div>
  `;
  const toggle = overlay.querySelector(".polar-debug-toggle");
  toggle?.addEventListener("click", () => {
    const expanded = !overlay.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.setAttribute("aria-label", expanded ? "Collapse fresh interleaved debug" : "Expand fresh interleaved debug");
  });
  container.append(overlay);
  return overlay;
}

function haversineDistanceMeters(a, b) {
  const toRadians = (value) => value * (Math.PI / 180);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.lng - a.lng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function chooseNiceDistanceMeters(maxDistanceMeters) {
  if (!(maxDistanceMeters > 0)) {
    return 0;
  }

  const exponent = 10 ** Math.floor(Math.log10(maxDistanceMeters));
  const steps = [1, 2, 5, 10];

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const candidate = steps[index] * exponent;
    if (candidate <= maxDistanceMeters) {
      return candidate;
    }
  }

  return exponent;
}

function formatMetricDistance(meters) {
  if (meters >= 1000) {
    const kilometers = meters / 1000;
    const rounded = kilometers >= 10 ? Math.round(kilometers) : Number(kilometers.toFixed(1));
    return `${rounded} km`;
  }

  return `${Math.round(meters)} m`;
}

function formatImperialDistance(meters) {
  if (meters >= METERS_PER_MILE) {
    const miles = meters / METERS_PER_MILE;
    const rounded = miles >= 10 ? Math.round(miles) : Number(miles.toFixed(1));
    return `${rounded} mi`;
  }

  const feet = meters / METERS_PER_FOOT;
  return `${Math.round(feet)} ft`;
}

function updateScaleOverlay(map, overlay) {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!(width > 0) || !(height > 0)) {
    overlay.classList.remove("is-visible");
    return;
  }

  // Sample scale at the viewport center so globe mode still has a valid
  // earth-surface segment when the globe disc no longer reaches the edges.
  const centerY = height / 2;
  const centerX = width / 2;
  const halfSampleWidth = SCALE_BAR_MAX_WIDTH_PX / 2;
  const leftPoint = {
    x: Math.max(0, centerX - halfSampleWidth),
    y: centerY,
  };
  const rightPoint = {
    x: Math.min(width, centerX + halfSampleWidth),
    y: centerY,
  };

  const leftLngLat = map.unproject([leftPoint.x, leftPoint.y]);
  const rightLngLat = map.unproject([rightPoint.x, rightPoint.y]);
  const maxDistanceMeters = haversineDistanceMeters(leftLngLat, rightLngLat);
  const niceDistanceMeters = chooseNiceDistanceMeters(maxDistanceMeters);

  if (!(maxDistanceMeters > 0) || !(niceDistanceMeters > 0)) {
    overlay.classList.remove("is-visible");
    return;
  }

  const barWidth = Math.max(0, Math.min(
    SCALE_BAR_MAX_WIDTH_PX,
    (niceDistanceMeters / maxDistanceMeters) * SCALE_BAR_MAX_WIDTH_PX,
  ));

  overlay.querySelector(".map-scale-bar")?.style.setProperty("width", `${barWidth}px`);
  const metricLabel = overlay.querySelector(".map-scale-label-metric");
  const imperialLabel = overlay.querySelector(".map-scale-label-imperial");
  if (metricLabel) {
    metricLabel.textContent = formatMetricDistance(niceDistanceMeters);
  }
  if (imperialLabel) {
    imperialLabel.textContent = formatImperialDistance(niceDistanceMeters);
  }
}

function normalizeBearing(bearing) {
  const normalized = ((bearing % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function updateCompassOverlay(map, overlay) {
  const bearing = normalizeBearing(map.getBearing());
  const arrow = overlay.querySelector(".map-compass-arrow");
  if (arrow) {
    arrow.style.transform = `rotate(${bearing}deg)`;
  }

  overlay.classList.toggle("is-active", Math.abs(bearing) > COMPASS_ACTIVE_BEARING_THRESHOLD);
}

function getDeckLayerCount(overlay) {
  const layers = overlay?._deck?.props?.layers ?? overlay?.props?.layers;
  return Array.isArray(layers) ? layers.length : 0;
}

function getDeckLayerIds(overlay) {
  const layers = overlay?._deck?.props?.layers ?? overlay?.props?.layers;
  return Array.isArray(layers) ? layers.map((layer) => layer?.id).filter(Boolean) : [];
}

function updatePolarDebugOverlay(overlay, map, state) {
  const body = overlay?.querySelector(".polar-debug-body");
  if (!body || !map || !state) {
    return;
  }

  const deckCanvases = document.querySelectorAll(".deck-canvas").length;
  const separateDeckCanvases = [...document.querySelectorAll("canvas.deck-canvas")]
    .filter((canvas) => canvas !== map.getCanvas()).length;
  const nonInterleavedAdded = Boolean(state.deckOverlay?._map);
  const interleavedAdded = Boolean(state.interleavedDeckOverlay?._map);
  const interleavedCanvas = state.interleavedDeckOverlay?.getCanvas?.() ?? state.interleavedDeckOverlay?._deck?.canvas;
  const mapCanvas = map.getCanvas();
  const sharedCanvas = Boolean(interleavedCanvas && interleavedCanvas === mapCanvas);
  const interleavedLayerIds = getDeckLayerIds(state.interleavedDeckOverlay);
  const rows = [
    ["token", "polar-int-v2"],
    ["zoom", map.getZoom().toFixed(2)],
    ["bearing", normalizeBearing(map.getBearing()).toFixed(1)],
    ["test", SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED ? "on" : "off"],
    ["non-int added", String(nonInterleavedAdded)],
    ["int added", String(interleavedAdded)],
    ["non-int layers", String(getDeckLayerCount(state.deckOverlay))],
    ["int layers", String(getDeckLayerCount(state.interleavedDeckOverlay))],
    ["shared canvas", String(sharedCanvas)],
    ["beforeId", SOUTH_POLAR_INTERLEAVED_BEFORE_ID],
    ["ids", interleavedLayerIds.join(",") || "none"],
    ["land fill", String(state.southPolarCapData?.features?.length ?? 0)],
    ["land line", String(state.southPolarLandLineData?.features?.length ?? 0)],
    ["graticules", String(state.polarGraticulesData?.features?.length ?? 0)],
    ["deck canvases", `${deckCanvases}/${separateDeckCanvases}`],
  ];

  body.innerHTML = rows.map(([label, value]) => `
    <div class="polar-debug-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function createFreshInterleavedOverlayState(layerState, getOrderedChildRowIds = null) {
  return {
    overlay: null,
    map: null,
    beforeId: null,
    layerState,
    getOrderedChildRowIds,
    land: null,
    landLine: null,
    graticules: null,
    ocean: null,
    loadPromise: null,
    highQualityLandPromise: null,
    landQuality: "none",
    loadError: null,
    destroyed: false,
  };
}

async function loadFreshInterleavedJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load fresh interleaved source ${url}: ${response.status}`);
  }
  return response.json();
}

function isFreshDeckTargetVisible(layerState, runtimeTargetId) {
  if (getLayerStyleValue(layerState, runtimeTargetId, "visible", true) === false) {
    return false;
  }

  const rowStateKey = Object.entries(layerState ?? {}).find(([, rowState]) => (
    rowState?.runtimeTargetId === runtimeTargetId
  ))?.[0];

  return getInheritedLayoutVisibility(layerState, rowStateKey ?? runtimeTargetId) === "visible";
}

function buildFreshInterleavedLandLayers(state) {
  const layerState = state.layerState ?? {};
  const childOrder = typeof state.getOrderedChildRowIds === "function"
    ? state.getOrderedChildRowIds("land")
    : [];
  const orderedChildRows = Array.isArray(childOrder) && childOrder.length
    ? childOrder
    : ["land-fill", "land-line"];
  const fillColor = buildDeckColor(
    getLayerStyleValue(layerState, "land::fill", "fillColor", DEFAULT_LAND_FILL_COLOR),
    getLayerStyleValue(layerState, "land::fill", "fillOpacity", 100),
    { r: 110, g: 170, b: 110 },
  );
  const lineRgb = hexToRgb(
    getLayerStyleValue(layerState, "land::line", "lineColor", DEFAULT_OUTLINE_LINE_COLOR),
    { r: 217, g: 228, b: 218 },
  );
  const lineWidth = Number(getLayerStyleValue(layerState, "land::line", "lineWeight", 1));

  const layerByRowId = {
    "land-fill": new GeoJsonLayer({
      id: FRESH_INTERLEAVED_LAND_FILL_LAYER_ID,
      beforeId: state.beforeId ?? undefined,
      data: state.land ?? { type: "FeatureCollection", features: [] },
      visible: isFreshDeckTargetVisible(layerState, "land::fill"),
      filled: true,
      stroked: false,
      pickable: false,
      getFillColor: fillColor,
      parameters: {
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    }),
    "land-line": new GeoJsonLayer({
      id: FRESH_INTERLEAVED_LAND_LINE_LAYER_ID,
      beforeId: state.beforeId ?? undefined,
      data: state.landLine ?? { type: "FeatureCollection", features: [] },
      visible: isFreshDeckTargetVisible(layerState, "land::line"),
      filled: false,
      stroked: true,
      pickable: false,
      getLineColor: [
        lineRgb.r,
        lineRgb.g,
        lineRgb.b,
        Math.max(0, Math.min(255, Math.round((Number(getLayerStyleValue(layerState, "land::line", "lineOpacity", 100)) / 100) * 255))),
      ],
      getLineWidth: Number.isFinite(lineWidth) ? lineWidth : 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: Number.isFinite(lineWidth) ? lineWidth : 1,
      opacity: Number(getLayerStyleValue(layerState, "land::line", "lineOpacity", 100)) / 100,
      parameters: {
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    }),
  };

  return [...orderedChildRows].reverse()
    .map((rowId) => layerByRowId[rowId])
    .filter(Boolean);
}

function buildFreshInterleavedEarthLayers(state) {
  const layerState = state.layerState ?? {};
  const earthOrder = typeof state.getOrderedChildRowIds === "function"
    ? state.getOrderedChildRowIds("earth")
    : [];
  const orderedRows = Array.isArray(earthOrder) && earthOrder.length
    ? earthOrder
    : ["land", "graticules", "ocean"];
  const oceanColor = buildDeckColor(
    getLayerStyleValue(layerState, "ocean::fill", "fillColor", DEFAULT_OCEAN_FILL_COLOR),
    getLayerStyleValue(layerState, "ocean::fill", "fillOpacity", 100),
    WATER_BACKGROUND_COLOR,
  );
  const graticulesRgb = hexToRgb(
    getLayerStyleValue(layerState, "graticules::line", "lineColor", "#8FA9BC"),
    { r: 143, g: 169, b: 188 },
  );
  const graticulesWidth = Number(getLayerStyleValue(layerState, "graticules::line", "lineWeight", 1));

  const layerByRowId = {
    ocean: [new GeoJsonLayer({
      id: FRESH_INTERLEAVED_OCEAN_LAYER_ID,
      beforeId: state.beforeId ?? undefined,
      data: state.ocean ?? { type: "FeatureCollection", features: [] },
      visible: isFreshDeckTargetVisible(layerState, "ocean::fill"),
      filled: true,
      stroked: false,
      getFillColor: oceanColor,
      pickable: false,
      parameters: {
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    })],
    land: buildFreshInterleavedLandLayers(state),
    graticules: [new GeoJsonLayer({
      id: FRESH_INTERLEAVED_GRATICULES_LAYER_ID,
      beforeId: state.beforeId ?? undefined,
      data: state.graticules ?? { type: "FeatureCollection", features: [] },
      visible: isFreshDeckTargetVisible(layerState, "graticules::line"),
      filled: false,
      stroked: true,
      pickable: false,
      getLineColor: [
        graticulesRgb.r,
        graticulesRgb.g,
        graticulesRgb.b,
        Math.max(0, Math.min(255, Math.round((Number(getLayerStyleValue(layerState, "graticules::line", "lineOpacity", 100)) / 100) * 255))),
      ],
      getLineWidth: Number.isFinite(graticulesWidth) ? graticulesWidth : 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: Number.isFinite(graticulesWidth) ? graticulesWidth : 1,
      opacity: Number(getLayerStyleValue(layerState, "graticules::line", "lineOpacity", 100)) / 100,
      parameters: {
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    })],
  };

  return [...orderedRows].reverse()
    .flatMap((rowId) => layerByRowId[rowId] ?? [])
    .filter(Boolean);
}

function buildFreshInterleavedTestLayers(state) {
  if (!FRESH_INTERLEAVED_OVERLAY_ENABLED || !state || state.destroyed) {
    return [];
  }

  return [
    ...buildFreshInterleavedEarthLayers(state),
    new GeoJsonLayer({
      id: FRESH_INTERLEAVED_LAYER_ID,
      beforeId: state.beforeId ?? undefined,
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { kind: "north-meridian" },
            geometry: {
              type: "LineString",
              coordinates: [[0, 84], [0, 88], [0, 90]],
            },
          },
          {
            type: "Feature",
            properties: { kind: "south-meridian" },
            geometry: {
              type: "LineString",
              coordinates: [[180, -84], [180, -88], [180, -90]],
            },
          },
          {
            type: "Feature",
            properties: { kind: "north-ring" },
            geometry: {
              type: "LineString",
              coordinates: Array.from({ length: 73 }, (_, index) => [index * 5 - 180, 88]),
            },
          },
          {
            type: "Feature",
            properties: { kind: "south-ring" },
            geometry: {
              type: "LineString",
              coordinates: Array.from({ length: 73 }, (_, index) => [index * 5 - 180, -88]),
            },
          },
        ],
      },
      filled: false,
      stroked: true,
      pickable: false,
      getLineColor: (feature) => (String(feature?.properties?.kind ?? "").includes("ring")
        ? [255, 216, 77, 255]
        : [255, 48, 160, 255]),
      getLineWidth: 3,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 2,
      parameters: {
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    }),
  ];
}

function updateFreshInterleavedOverlay(state) {
  if (!FRESH_INTERLEAVED_OVERLAY_ENABLED || !state?.overlay || state.destroyed) {
    return;
  }

  state.overlay.setProps({
    layers: buildFreshInterleavedTestLayers(state),
  });
}

function applyFreshInterleavedLandData(state, land, landQuality) {
  state.land = prepareFeatureCollectionForPolarRendering(land, {
    geometryFamily: "polygon",
    mode: POLAR_RENDER_MODES.BOTH,
    sourceLatitude: FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE,
    visibleLatitude: FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE,
  });
  state.landLine = preparePolygonBoundaryFeatureCollectionForPolarRendering(land, {
    mode: POLAR_RENDER_MODES.BOTH,
    visibleLatitude: FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE,
  });
  state.landQuality = landQuality;
}

function ensureFreshInterleavedSourcesLoaded(state, onUpdate = null) {
  if (!FRESH_INTERLEAVED_OVERLAY_ENABLED || !state || state.loadPromise || state.destroyed) {
    return;
  }

  state.landQuality = "initial-loading";
  state.loadPromise = Promise.all([
    loadFreshInterleavedJson(FRESH_INTERLEAVED_LAND_INITIAL_SOURCE_URL),
    loadFreshInterleavedJson(FRESH_INTERLEAVED_GRATICULES_SOURCE_URL),
  ])
    .then(([land, graticules]) => {
      if (state.destroyed) {
        return;
      }
      state.ocean = buildPolarCapFeatureCollection(
        POLAR_RENDER_MODES.BOTH,
        FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE,
      );
      if (state.landQuality !== "high") {
        applyFreshInterleavedLandData(state, land, "initial");
      }
      state.graticules = prepareFeatureCollectionForPolarRendering(graticules, {
        geometryFamily: "line",
        mode: POLAR_RENDER_MODES.BOTH,
        visibleLatitude: FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE,
      });
      if (typeof onUpdate === "function") {
        onUpdate();
      }
    })
    .catch((error) => {
      state.loadError = error;
      console.warn("[fresh-interleaved] Failed to load Earth sources.", error);
      if (typeof onUpdate === "function") {
        onUpdate();
      }
    });
}

function upgradeFreshInterleavedLandQuality(state, map, onUpdate = null) {
  if (!FRESH_INTERLEAVED_OVERLAY_ENABLED || !state || state.destroyed || state.highQualityLandPromise) {
    return;
  }

  state.landQuality = "high-loading";
  map.getSource(localLayerSourceId("land"))?.setData(FRESH_INTERLEAVED_LAND_HIGH_SOURCE_URL);
  state.highQualityLandPromise = loadFreshInterleavedJson(FRESH_INTERLEAVED_LAND_HIGH_SOURCE_URL)
    .then((land) => {
      if (state.destroyed) {
        return;
      }
      applyFreshInterleavedLandData(state, land, "high");
      if (typeof onUpdate === "function") {
        onUpdate();
      }
    })
    .catch((error) => {
      state.loadError = error;
      state.landQuality = state.land ? "initial" : "none";
      console.warn("[fresh-interleaved] Failed to upgrade Earth land quality.", error);
      if (typeof onUpdate === "function") {
        onUpdate();
      }
    });
}

function scheduleEarthLandQualityUpgrade(state, map, onUpdate = null) {
  const runUpgrade = () => upgradeFreshInterleavedLandQuality(state, map, onUpdate);
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(runUpgrade, { timeout: 9000 });
  } else {
    window.setTimeout(runUpgrade, 4500);
  }
}

function updateFreshInterleavedDebugOverlay(overlay, map, state) {
  const body = overlay?.querySelector(".polar-debug-body");
  if (!body || !map || !state) {
    return;
  }

  const deckCanvases = document.querySelectorAll(".deck-canvas").length;
  const separateDeckCanvases = [...document.querySelectorAll("canvas.deck-canvas")]
    .filter((canvas) => canvas !== map.getCanvas()).length;
  const interleavedCanvas = state.overlay?.getCanvas?.() ?? state.overlay?._deck?.canvas;
  const sharedCanvas = Boolean(interleavedCanvas && interleavedCanvas === map.getCanvas());
  const rows = [
    ["token", "fresh-int-v1"],
    ["enabled", String(FRESH_INTERLEAVED_OVERLAY_ENABLED)],
    ["added", String(Boolean(state.overlay?._map))],
    ["shared canvas", String(sharedCanvas)],
    ["layers", getDeckLayerIds(state.overlay).join(",") || "none"],
    ["beforeId", state.beforeId ?? "top"],
    ["earth order", typeof state.getOrderedChildRowIds === "function" ? state.getOrderedChildRowIds("earth").join(",") : "default"],
    ["land order", typeof state.getOrderedChildRowIds === "function" ? state.getOrderedChildRowIds("land").join(",") : "default"],
    ["quality", state.landQuality],
    ["cutoff", String(FRESH_INTERLEAVED_POLAR_CUTOFF_LATITUDE)],
    ["ocean", String(state.ocean?.features?.length ?? 0)],
    ["land", String(state.land?.features?.length ?? 0)],
    ["land line", String(state.landLine?.features?.length ?? 0)],
    ["graticules", String(state.graticules?.features?.length ?? 0)],
    ["error", state.loadError ? "yes" : "no"],
    ["zoom", map.getZoom().toFixed(2)],
    ["bearing", normalizeBearing(map.getBearing()).toFixed(1)],
    ["deck canvases", `${deckCanvases}/${separateDeckCanvases}`],
  ];

  body.innerHTML = rows.map(([label, value]) => `
    <div class="polar-debug-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function localLayerMaplibreIds(entry) {
  return [
    ...(entry.fill ? [localLayerFillId(entry.id)] : []),
    ...(entry.line ? [localLayerLineId(entry.id)] : []),
  ];
}

function getDynamicLayerMaplibreIds(runtimeTargetId, map) {
  const sourceId = `dynamic-${runtimeTargetId}`;
  return [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-circle`]
    .filter((id) => map.getLayer(id));
}

function buildExactMatchFilterExpression(field, value) {
  const normalizedValue = value == null ? "" : String(value);
  return [
    "==",
    ["to-string", ["coalesce", ["get", field], ""]],
    normalizedValue,
  ];
}

function evaluateMaplibreExpression(expression, feature) {
  if (!Array.isArray(expression)) {
    return expression;
  }

  const [operator, ...args] = expression;
  const properties = feature?.properties ?? {};

  if (operator === "get") {
    return properties[args[0]];
  }
  if (operator === "literal") {
    return args[0];
  }
  if (operator === "to-string") {
    const value = evaluateMaplibreExpression(args[0], feature);
    return value == null ? "" : String(value);
  }
  if (operator === "coalesce") {
    for (const arg of args) {
      const value = evaluateMaplibreExpression(arg, feature);
      if (value !== null && value !== undefined) {
        return value;
      }
    }
    return null;
  }

  return expression;
}

function evaluateMaplibreFilter(filterExpression, feature) {
  if (!filterExpression) {
    return true;
  }
  if (!Array.isArray(filterExpression)) {
    return Boolean(filterExpression);
  }

  const [operator, ...args] = filterExpression;
  if (operator === "all") {
    return args.every((arg) => evaluateMaplibreFilter(arg, feature));
  }
  if (operator === "any") {
    return args.some((arg) => evaluateMaplibreFilter(arg, feature));
  }
  if (operator === "none") {
    return args.every((arg) => !evaluateMaplibreFilter(arg, feature));
  }
  if (operator === "has") {
    return feature?.properties?.[args[0]] !== undefined;
  }
  if (operator === "!has") {
    return feature?.properties?.[args[0]] === undefined;
  }

  const left = evaluateMaplibreExpression(args[0], feature);
  const right = evaluateMaplibreExpression(args[1], feature);
  if (operator === "==") {
    return left === right;
  }
  if (operator === "!=") {
    return left !== right;
  }
  if (operator === ">") {
    return left > right;
  }
  if (operator === ">=") {
    return left >= right;
  }
  if (operator === "<") {
    return left < right;
  }
  if (operator === "<=") {
    return left <= right;
  }
  if (operator === "in") {
    return args.slice(1).map((arg) => evaluateMaplibreExpression(arg, feature)).includes(left);
  }
  if (operator === "!in") {
    return !args.slice(1).map((arg) => evaluateMaplibreExpression(arg, feature)).includes(left);
  }

  return true;
}

function getRuntimeTargetIdFromState(layerState, rowId) {
  return layerState?.[rowId]?.runtimeTargetId ?? rowId;
}

function findRowStateKeyForRuntimeTarget(layerState, runtimeTargetId) {
  if (!runtimeTargetId || !layerState || typeof layerState !== "object") {
    return null;
  }

  if (layerState[runtimeTargetId]) {
    return runtimeTargetId;
  }

  for (const [rowId, rowState] of Object.entries(layerState)) {
    if (rowState?.runtimeTargetId === runtimeTargetId) {
      return rowId;
    }
  }

  return null;
}

function getDescendantRuntimeTargetIds(layerState, parentRowId) {
  if (!parentRowId || !layerState || typeof layerState !== "object") {
    return [];
  }

  const descendantIds = [];
  const queue = [parentRowId];

  while (queue.length) {
    const currentParentId = queue.shift();
    Object.entries(layerState).forEach(([rowId, rowState]) => {
      if (rowState?.parentRowId !== currentParentId) {
        return;
      }

      if (typeof rowState.runtimeTargetId === "string") {
        descendantIds.push(rowState.runtimeTargetId);
      }
      queue.push(rowId);
    });
  }

  return [...new Set(descendantIds)];
}

function getMaplibreLayerIdsForRuntimeTarget(runtimeTargetId, map) {
  if (!runtimeTargetId) {
    return [];
  }

  const dynamicTargetMatch = /^(.+)::(fill|line|point-fill|point-stroke)$/.exec(runtimeTargetId);
  if (dynamicTargetMatch) {
    const [, baseLayerId, subtarget] = dynamicTargetMatch;
    const sourceId = `dynamic-${baseLayerId}`;
    if (getDynamicLayerMaplibreIds(baseLayerId, map).length) {
      if (subtarget === "fill") {
        return map.getLayer(`${sourceId}-fill`) ? [`${sourceId}-fill`] : [];
      }
      if (subtarget === "line") {
        return map.getLayer(`${sourceId}-line`) ? [`${sourceId}-line`] : [];
      }
      if (subtarget === "point-fill") {
        return map.getLayer(`${sourceId}-circle`) ? [`${sourceId}-circle`] : [];
      }
      if (subtarget === "point-stroke") {
        return map.getLayer(`${sourceId}-circle`) ? [`${sourceId}-circle`] : [];
      }
    }

    const localEntry = LOCAL_LAYERS.find((entry) => entry.id === baseLayerId);
    if (localEntry) {
      if (subtarget === "fill" && localEntry.fill) {
        return [localLayerFillId(baseLayerId)];
      }
      if (subtarget === "line" && localEntry.line) {
        return [localLayerLineId(baseLayerId)];
      }
    }
  }

  const olympicsLayerIds = OLYMPICS_RUNTIME_TARGET_LAYER_IDS[runtimeTargetId];
  if (olympicsLayerIds) {
    return olympicsLayerIds.slice();
  }

  const localEntry = LOCAL_LAYERS.find((entry) => entry.id === runtimeTargetId);
  if (localEntry) {
    return localLayerMaplibreIds(localEntry);
  }

  const registryEntry = findRegistryEntry(runtimeTargetId);
  if (registryEntry) {
    if (registryEntry.circle?.ids?.length) {
      return registryEntry.circle.ids.slice();
    }
    return [
      ...(registryEntry.fill ? [registryEntry.fill.id] : []),
      ...(registryEntry.line ? [registryEntry.line.id] : []),
    ];
  }

  return getDynamicLayerMaplibreIds(runtimeTargetId, map);
}

function parseRuntimeTarget(runtimeTargetId) {
  const match = /^(.+)::(fill|line|point-fill|point-stroke)$/.exec(runtimeTargetId ?? "");
  if (!match) {
    return null;
  }
  return {
    baseLayerId: match[1],
    subtarget: match[2],
  };
}

function applyRuntimeTargetStyle(runtimeTargetId, key, value, map, layerState) {
  if (!runtimeTargetId) {
    return false;
  }

  if (runtimeTargetId === "ocean" || runtimeTargetId === "ocean::fill") {
    const oceanFillTargetId = "ocean::fill";
    if (!map.getLayer("atlas-water")) {
      return false;
    }
    if (key === "fillColor") {
      map.setPaintProperty("atlas-water", "background-color", buildWaterBackgroundColor(
        value,
        getLayerStyleValue(layerState, oceanFillTargetId, "fillOpacity", 100),
      ));
      return true;
    }
    if (key === "fillOpacity") {
      map.setPaintProperty("atlas-water", "background-color", buildWaterBackgroundColor(
        getLayerStyleValue(layerState, oceanFillTargetId, "fillColor", DEFAULT_OCEAN_FILL_COLOR),
        value,
      ));
      return true;
    }
    return false;
  }

  const runtimeTarget = parseRuntimeTarget(runtimeTargetId);
  if (!runtimeTarget) {
    return false;
  }

  const { baseLayerId, subtarget } = runtimeTarget;
  const targetLayerIds = getMaplibreLayerIdsForRuntimeTarget(runtimeTargetId, map);
  if (!targetLayerIds.length && !(subtarget === "point-fill" && key === "pointRadius")) {
    return false;
  }

  const applyToLayers = (layerIds, property, nextValue) => {
    let applied = false;
    layerIds.forEach((layerId) => {
      if (!map.getLayer(layerId)) {
        return;
      }
      map.setPaintProperty(layerId, property, nextValue);
      applied = true;
    });
    return applied;
  };

  if (subtarget === "fill") {
    if (key === "fillColor") {
      return applyToLayers(targetLayerIds, "fill-color", String(value));
    }
    if (key === "fillOpacity") {
      return applyToLayers(targetLayerIds, "fill-opacity", Number(value) / 100);
    }
    return false;
  }

  if (subtarget === "line") {
    if (key === "lineColor") {
      return applyToLayers(targetLayerIds, "line-color", String(value));
    }
    if (key === "lineOpacity") {
      return applyToLayers(targetLayerIds, "line-opacity", Number(value) / 100);
    }
    if (key === "lineWeight") {
      return applyToLayers(targetLayerIds, "line-width", Number(value));
    }
    return false;
  }

  if (subtarget === "point-fill") {
    if (key === "pointColor") {
      return applyToLayers(targetLayerIds, "circle-color", String(value));
    }
    if (key === "pointOpacity") {
      return applyToLayers(targetLayerIds, "circle-opacity", Number(value) / 100);
    }
    if (key === "pointRadius") {
      const strokeLayerIds = getMaplibreLayerIdsForRuntimeTarget(`${baseLayerId}::point-stroke`, map);
      const fillApplied = applyToLayers(targetLayerIds, "circle-radius", Number(value));
      const strokeApplied = applyToLayers(strokeLayerIds, "circle-radius", Number(value));
      return fillApplied || strokeApplied;
    }
    return false;
  }

  if (subtarget === "point-stroke") {
    if (key === "lineColor") {
      return applyToLayers(targetLayerIds, "circle-stroke-color", String(value));
    }
    if (key === "lineOpacity") {
      return applyToLayers(targetLayerIds, "circle-stroke-opacity", Number(value) / 100);
    }
    if (key === "lineWeight") {
      return applyToLayers(targetLayerIds, "circle-stroke-width", Number(value));
    }
    if (key === "pointRadius") {
      return applyToLayers(targetLayerIds, "circle-radius", Number(value));
    }
    return false;
  }

  return false;
}

function reapplyStoredDynamicRuntimeStyles(baseLayerId, map, layerState) {
  const stored = layerState?.[baseLayerId];
  if (!stored || typeof stored !== "object") {
    return;
  }

  if (stored.fillColor !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::fill`, "fillColor", stored.fillColor, map, layerState);
  }
  if (stored.fillOpacity !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::fill`, "fillOpacity", stored.fillOpacity, map, layerState);
  }
  if (stored.lineColor !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::line`, "lineColor", stored.lineColor, map, layerState);
    applyRuntimeTargetStyle(`${baseLayerId}::point-stroke`, "lineColor", stored.lineColor, map, layerState);
  }
  if (stored.lineOpacity !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::line`, "lineOpacity", stored.lineOpacity, map, layerState);
    applyRuntimeTargetStyle(`${baseLayerId}::point-stroke`, "lineOpacity", stored.lineOpacity, map, layerState);
  }
  if (stored.lineWeight !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::line`, "lineWeight", stored.lineWeight, map, layerState);
    applyRuntimeTargetStyle(`${baseLayerId}::point-stroke`, "lineWeight", stored.lineWeight, map, layerState);
  }
  if (stored.pointColor !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::point-fill`, "pointColor", stored.pointColor, map, layerState);
  }
  if (stored.pointOpacity !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::point-fill`, "pointOpacity", stored.pointOpacity, map, layerState);
  }
  if (stored.pointRadius !== undefined) {
    applyRuntimeTargetStyle(`${baseLayerId}::point-fill`, "pointRadius", stored.pointRadius, map, layerState);
  }
}

function applyDynamicPointLayerState(baseLayerId, map, layerState) {
  const circleLayerId = `dynamic-${baseLayerId}-circle`;
  if (!map.getLayer(circleLayerId)) {
    return false;
  }

  const baseVisible = getInheritedLayoutVisibility(layerState, baseLayerId) === "visible";
  const fillVisible = getInheritedLayoutVisibility(layerState, `${baseLayerId}::point-fill`) === "visible";
  const strokeVisible = getInheritedLayoutVisibility(layerState, `${baseLayerId}::point-stroke`) === "visible";
  const pointColor = String(getLayerStyleValue(layerState, baseLayerId, "pointColor", "#e74c3c"));
  const pointOpacity = Number(getLayerStyleValue(layerState, baseLayerId, "pointOpacity", 80)) / 100;
  const pointRadius = Number(getLayerStyleValue(layerState, baseLayerId, "pointRadius", 6));
  const lineColor = String(getLayerStyleValue(layerState, baseLayerId, "lineColor", "#ffffff"));
  const lineOpacity = Number(getLayerStyleValue(layerState, baseLayerId, "lineOpacity", 100)) / 100;
  const lineWeight = Number(getLayerStyleValue(layerState, baseLayerId, "lineWeight", 1));

  map.setLayoutProperty(circleLayerId, "visibility", baseVisible && (fillVisible || strokeVisible) ? "visible" : "none");
  map.setPaintProperty(circleLayerId, "circle-color", pointColor);
  map.setPaintProperty(circleLayerId, "circle-opacity", baseVisible && fillVisible ? pointOpacity : 0);
  map.setPaintProperty(circleLayerId, "circle-radius", pointRadius);
  map.setPaintProperty(circleLayerId, "circle-stroke-color", lineColor);
  map.setPaintProperty(circleLayerId, "circle-stroke-opacity", baseVisible && strokeVisible ? lineOpacity : 0);
  map.setPaintProperty(circleLayerId, "circle-stroke-width", baseVisible && strokeVisible ? lineWeight : 0);
  return true;
}

function getOrderedChildLayerRowIds(layerState, parentRowId, defaultOrder = [], getOrderedChildRowIds = null) {
  if (typeof getOrderedChildRowIds === "function") {
    return getOrderedChildRowIds(parentRowId);
  }

  const isRoot = parentRowId === ROOT_PARENT_ID;
  const childRowIds = Object.entries(layerState ?? {})
    .filter(([, rowState]) => {
      if (!rowState || typeof rowState !== "object" || typeof rowState.runtimeTargetId !== "string") {
        return false;
      }
      return isRoot ? rowState.parentRowId == null : rowState.parentRowId === parentRowId;
    })
    .map(([rowId]) => rowId);

  if (!childRowIds.length) {
    return [];
  }

  const persistedOrder = isRoot
    ? layerState?.[ROOT_PARENT_ID]?.rowOrder
    : layerState?.[parentRowId]?.rowOrder;
  const orderSource = Array.isArray(persistedOrder) ? persistedOrder : defaultOrder;
  const ordered = Array.isArray(orderSource)
    ? orderSource.filter((rowId) => childRowIds.includes(rowId))
    : [];

  childRowIds.forEach((rowId) => {
    if (!ordered.includes(rowId)) {
      ordered.push(rowId);
    }
  });

  return ordered;
}

function moveRowSubtree(map, layerState, rowId, moveLayer, getOrderedChildRowIds = null) {
  const movedLayerIds = new Set();
  const childOrder = getOrderedChildLayerRowIds(layerState, rowId, [], getOrderedChildRowIds);
  if (childOrder.length) {
    for (const childId of [...childOrder].reverse()) {
      const childMovedLayerIds = moveRowSubtree(map, layerState, childId, moveLayer, getOrderedChildRowIds);
      childMovedLayerIds.forEach((layerId) => movedLayerIds.add(layerId));
    }
  }

  const runtimeTargetId = getRuntimeTargetIdFromState(layerState, rowId);
  getMaplibreLayerIdsForRuntimeTarget(runtimeTargetId, map).forEach((layerId) => {
    if (!movedLayerIds.has(layerId)) {
      moveLayer(layerId);
      movedLayerIds.add(layerId);
    }
  });

  return movedLayerIds;
}

function isEarthRowOrDescendant(layerState, rowId) {
  if (rowId === EARTH_ROW_ID) {
    return true;
  }

  let currentRowId = rowId;
  const visited = new Set();
  while (currentRowId && !visited.has(currentRowId)) {
    visited.add(currentRowId);
    const parentRowId = layerState?.[currentRowId]?.parentRowId;
    if (parentRowId === EARTH_ROW_ID) {
      return true;
    }
    currentRowId = parentRowId;
  }

  return false;
}

// Ordering rule:
// - Normalized shared row order is the source of truth, including pinned rows.
// - Higher in the menu = higher in the render pile.
// - Earth is the single top-level exception: it renders as the fixed visual
//   base underneath all non-Earth content, while Earth children still use their
//   shared child order internally.
// - MapLibre moveLayer needs bottom-to-top traversal, so we iterate sibling
//   rows in reverse and recurse generically through the row tree.
function applyFullLayerOrder(map, layerState, getOrderedChildRowIds = null) {
  const moveLayer = (id) => { if (map.getLayer(id)) map.moveLayer(id, undefined); };
  const rootOrder = getOrderedChildLayerRowIds(layerState, ROOT_PARENT_ID, ROOT_ROW_IDS, getOrderedChildRowIds);
  const hasEarth = rootOrder.includes(EARTH_ROW_ID);
  const nonEarthRootOrder = rootOrder.filter((rowId) => rowId !== EARTH_ROW_ID);

  if (hasEarth) {
    moveRowSubtree(map, layerState, EARTH_ROW_ID, moveLayer, getOrderedChildRowIds);
  }

  for (const groupId of [...nonEarthRootOrder].reverse()) {
    moveRowSubtree(map, layerState, groupId, moveLayer, getOrderedChildRowIds);
  }
}

function applyRowSubtreeOrder(map, layerState, rowId, getOrderedChildRowIds = null) {
  if (isEarthRowOrDescendant(layerState, rowId)) {
    applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
    return;
  }

  const moveLayer = (id) => { if (map.getLayer(id)) map.moveLayer(id, undefined); };
  moveRowSubtree(map, layerState, rowId, moveLayer, getOrderedChildRowIds);
}

function isRealPmtilesUrl(url) {
  const normalized = String(url ?? "").trim();
  return normalized.endsWith(".pmtiles");
}

function getManifestPmtilesUrl(manifest, sourceId) {
  const entry = (manifest ?? []).find((item) => item?.id === sourceId);
  return isRealPmtilesUrl(entry?.url) ? entry.url : null;
}

function createPmtilesSourceUrl(url) {
  return `pmtiles://${String(url ?? "").trim()}`;
}

function createRuntimeVectorSourceSpec({
  manifest,
  pmtilesId,
  atlasVectorTileId,
  maxZoom,
}) {
  const pmtilesUrl = getManifestPmtilesUrl(manifest, pmtilesId);
  if (pmtilesUrl) {
    return {
      type: "vector",
      url: createPmtilesSourceUrl(pmtilesUrl),
    };
  }

  return createGeojsonVectorSourceSpec(atlasVectorTileId, maxZoom);
}

function buildInitialStyleLayerSpecs(entry, layerState) {
  const sourceId = localLayerSourceId(entry.id);
  const specs = [];
  if (entry.fill) {
    const spec = {
      id: localLayerFillId(entry.id),
      type: "fill",
      source: sourceId,
      layout: { visibility: getMaplibreLayerVisibility(layerState, `${entry.id}::fill`, entry.id) },
      paint: {
        "fill-color": getLayerStyleValue(layerState, entry.id, "fillColor", entry.fill.color),
        "fill-opacity": Number(getLayerStyleValue(layerState, entry.id, "fillOpacity", entry.fill.opacity)) / 100,
      },
    };
    if (entry.source.sourceLayer) spec["source-layer"] = entry.source.sourceLayer;
    specs.push(spec);
  }
  if (entry.line) {
    const spec = {
      id: localLayerLineId(entry.id),
      type: "line",
      source: sourceId,
      layout: { visibility: getMaplibreLayerVisibility(layerState, `${entry.id}::line`, entry.id) },
      paint: {
        "line-color": getLayerStyleValue(layerState, entry.id, "lineColor", entry.line.color),
        "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, entry.id, "lineWeight", entry.line.weight ?? 1)),
        "line-opacity": Number(getLayerStyleValue(layerState, entry.id, "lineOpacity", entry.line.opacity)) / 100,
      },
    };
    if (entry.id === "graticules") {
      spec.filter = ["!=", ["get", "polar"], true];
    }
    if (entry.source.sourceLayer) spec["source-layer"] = entry.source.sourceLayer;
    specs.push(spec);
  }
  return specs;
}

function buildStyle(layerState) {
  const initialLayers = LOCAL_LAYERS.filter((l) => l.inInitialStyle);
  return {
    version: 8,
    projection: { type: "globe" },
    transition: { duration: 0, delay: 0 },
    // Sources here load in parallel with MapLibre's own initialisation,
    // before the load event fires — so these layers render immediately.
    sources: Object.fromEntries(initialLayers.map((entry) => [
      localLayerSourceId(entry.id),
      entry.source.kind === "atlas-vector"
        ? createGeojsonVectorSourceSpec(localLayerTileSourceId(entry.id))
        : { type: "geojson", data: entry.source.initialUrl ?? entry.source.url },
    ])),
    layers: [
      {
        id: "atlas-water",
        type: "background",
        layout: { visibility: getInheritedLayoutVisibility(layerState, "ocean") },
        paint: {
          "background-color": buildWaterBackgroundColor(
            getLayerStyleValue(layerState, "ocean", "fillColor", DEFAULT_OCEAN_FILL_COLOR),
            getLayerStyleValue(layerState, "ocean", "fillOpacity", 100),
          ),
        },
      },
      ...initialLayers.flatMap((entry) => buildInitialStyleLayerSpecs(entry, layerState)),
    ],
  };
}

function getLayerStyleValue(layerState, layerId, key, fallback) {
  const nextValue = layerState?.[layerId]?.[key];
  if (nextValue !== undefined) {
    return nextValue;
  }
  const runtimeTarget = parseRuntimeTarget(layerId);
  if (runtimeTarget?.baseLayerId) {
    const inheritedValue = layerState?.[runtimeTarget.baseLayerId]?.[key];
    if (inheritedValue !== undefined) {
      return inheritedValue;
    }
  }
  return fallback;
}

function getMaplibreLayerVisibility(layerState, runtimeTargetId) {
  return getInheritedLayoutVisibility(layerState, runtimeTargetId);
}

function hexToRgb(value, fallback) {
  const normalized = String(value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }

  return fallback;
}

function buildWaterBackgroundColor(fillColor, alphaPercent) {
  const rgb = hexToRgb(fillColor, WATER_BACKGROUND_COLOR);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number(alphaPercent) / 100})`;
}

function buildDeckColor(fillColor, alphaPercent, fallback = WATER_BACKGROUND_COLOR) {
  const rgb = hexToRgb(fillColor, fallback);
  return [
    rgb.r,
    rgb.g,
    rgb.b,
    Math.max(0, Math.min(255, Math.round((Number(alphaPercent) / 100) * 255))),
  ];
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

function geometryToMultiPolygon(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return null;
}

function multiPolygonToGeometry(multiPolygon) {
  if (!Array.isArray(multiPolygon) || !multiPolygon.length) {
    return null;
  }
  if (multiPolygon.length === 1) {
    return {
      type: "Polygon",
      coordinates: multiPolygon[0],
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: multiPolygon,
  };
}

function clipFeatureCollectionToMask(featureCollection, clipMask) {
  const features = [];

  (featureCollection?.features ?? []).forEach((feature) => {
    const subject = geometryToMultiPolygon(feature?.geometry);
    if (!subject) {
      return;
    }

    let clipped = null;
    try {
      clipped = polygonClipping.intersection(subject, clipMask);
    } catch {
      clipped = null;
    }

    const geometry = multiPolygonToGeometry(clipped);
    if (!geometry) {
      return;
    }

    features.push({
      type: "Feature",
      properties: feature?.properties ?? {},
      geometry,
    });
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function getPolarBoundaryLatitudes(mode, latitude = POLAR_CAP_VISIBLE_LATITUDE) {
  const resolvedLatitude = Math.abs(Number(latitude) || POLAR_CAP_VISIBLE_LATITUDE);
  if (mode === POLAR_RENDER_MODES.SOUTH) {
    return [-resolvedLatitude];
  }
  if (mode === POLAR_RENDER_MODES.NORTH) {
    return [resolvedLatitude];
  }
  if (mode === POLAR_RENDER_MODES.BOTH) {
    return [-resolvedLatitude, resolvedLatitude];
  }
  return [];
}

function buildPolarCapMaskGeometry(mode = POLAR_RENDER_MODES.SOUTH, latitude = POLAR_CAP_VISIBLE_LATITUDE) {
  return getPolarBoundaryLatitudes(mode, latitude).map((boundaryLatitude) => {
    const ring = [];
    for (let longitude = -180; longitude <= 180; longitude += SOUTH_POLAR_CAP_RING_STEP_DEGREES) {
      ring.push([longitude, boundaryLatitude]);
    }
    if (ring[ring.length - 1]?.[0] !== 180) {
      ring.push([180, boundaryLatitude]);
    }

    if (boundaryLatitude < 0) {
      return [[
        [-180, -90],
        ...ring,
        [180, -90],
        [-180, -90],
      ]];
    }

    return [[
      [-180, 90],
      [180, 90],
      ...ring.slice().reverse(),
      [-180, 90],
    ]];
  });
}

function buildPolarCapFeatureCollection(mode = POLAR_RENDER_MODES.SOUTH, latitude = POLAR_CAP_VISIBLE_LATITUDE) {
  const geometry = multiPolygonToGeometry(buildPolarCapMaskGeometry(mode, latitude));
  return geometry
    ? {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry,
      }],
    }
    : {
      type: "FeatureCollection",
      features: [],
    };
}

function densifyRingAlongLatitude(ring, targetLatitude, stepDegrees = SOUTH_POLAR_CAP_RING_STEP_DEGREES) {
  if (!Array.isArray(ring) || ring.length < 2) {
    return ring;
  }

  const densified = [];
  const tolerance = 1e-9;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    densified.push(start);

    const startLat = start?.[1];
    const endLat = end?.[1];
    if (
      !Number.isFinite(start?.[0])
      || !Number.isFinite(end?.[0])
      || !Number.isFinite(startLat)
      || !Number.isFinite(endLat)
      || Math.abs(startLat - targetLatitude) > tolerance
      || Math.abs(endLat - targetLatitude) > tolerance
    ) {
      continue;
    }

    const lonDelta = end[0] - start[0];
    const steps = Math.ceil(Math.abs(lonDelta) / stepDegrees);
    if (steps <= 1) {
      continue;
    }

    for (let step = 1; step < steps; step += 1) {
      densified.push([
        start[0] + (lonDelta * step) / steps,
        targetLatitude,
      ]);
    }
  }

  densified.push(ring[ring.length - 1]);
  return densified;
}

function redensifyFeatureCollectionAlongLatitudes(featureCollection, targetLatitudes = []) {
  const latitudes = Array.isArray(targetLatitudes)
    ? targetLatitudes.filter((value) => Number.isFinite(value))
    : [];
  return {
    type: "FeatureCollection",
    features: (featureCollection?.features ?? []).map((feature) => {
      const geometry = feature?.geometry;
      if (!geometry || typeof geometry !== "object") {
        return feature;
      }

      if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
        return {
          ...feature,
          geometry: {
            type: "Polygon",
            coordinates: geometry.coordinates.map((ring) => (
              latitudes.reduce((nextRing, latitude) => densifyRingAlongLatitude(nextRing, latitude), ring)
            )),
          },
        };
      }

      if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
        return {
          ...feature,
          geometry: {
            type: "MultiPolygon",
            coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => (
              latitudes.reduce((nextRing, latitude) => densifyRingAlongLatitude(nextRing, latitude), ring)
            ))),
          },
        };
      }

      return feature;
    }),
  };
}

function clipLineStringToCap(coordinates, boundaryLatitude, { keepAbove = false } = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return [];
  }

  const isInside = (point) => keepAbove ? point?.[1] >= boundaryLatitude : point?.[1] <= boundaryLatitude;
  const intersectSegment = (start, end) => {
    const startLat = start?.[1];
    const endLat = end?.[1];
    const startLon = start?.[0];
    const endLon = end?.[0];
    if (
      !Number.isFinite(startLat)
      || !Number.isFinite(endLat)
      || !Number.isFinite(startLon)
      || !Number.isFinite(endLon)
      || Math.abs(endLat - startLat) < 1e-9
    ) {
      return [startLon, boundaryLatitude];
    }
    const ratio = (boundaryLatitude - startLat) / (endLat - startLat);
    return [startLon + ((endLon - startLon) * ratio), boundaryLatitude];
  };

  const segments = [];
  let current = isInside(coordinates[0]) ? [coordinates[0]] : null;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const startInside = isInside(start);
    const endInside = isInside(end);

    if (startInside && endInside) {
      if (!current) {
        current = [start];
      }
      current.push(end);
      continue;
    }

    if (startInside && !endInside) {
      if (!current) {
        current = [start];
      }
      current.push(intersectSegment(start, end));
      if (current.length > 1) {
        segments.push(current);
      }
      current = null;
      continue;
    }

    if (!startInside && endInside) {
      current = [intersectSegment(start, end), end];
      continue;
    }
  }

  if (current?.length > 1) {
    segments.push(current);
  }

  return segments;
}

function clipLineGeometryToPolarMode(geometry, mode = POLAR_RENDER_MODES.SOUTH, latitude = POLAR_CAP_VISIBLE_LATITUDE) {
  const latitudes = getPolarBoundaryLatitudes(mode, latitude);
  if (!geometry || typeof geometry !== "object" || !latitudes.length) {
    return null;
  }

  const clipCoordinates = (coordinates, boundaryLatitude) => clipLineStringToCap(coordinates, boundaryLatitude, {
    keepAbove: boundaryLatitude > 0,
  });

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const segments = latitudes.flatMap((boundaryLatitude) => clipCoordinates(geometry.coordinates, boundaryLatitude));
    if (!segments.length) {
      return null;
    }
    if (segments.length === 1) {
      return { type: "LineString", coordinates: segments[0] };
    }
    return { type: "MultiLineString", coordinates: segments };
  }

  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    const segments = geometry.coordinates.flatMap((line) => (
      latitudes.flatMap((boundaryLatitude) => clipCoordinates(line, boundaryLatitude))
    ));
    return segments.length ? { type: "MultiLineString", coordinates: segments } : null;
  }

  return null;
}

function clipPointGeometryToPolarMode(geometry, mode = POLAR_RENDER_MODES.SOUTH, latitude = POLAR_CAP_VISIBLE_LATITUDE) {
  const boundaryLatitudes = getPolarBoundaryLatitudes(mode, latitude);
  if (!geometry || typeof geometry !== "object" || !boundaryLatitudes.length) {
    return null;
  }

  const isInside = (coordinate) => boundaryLatitudes.some((boundaryLatitude) => (
    boundaryLatitude < 0 ? coordinate?.[1] <= boundaryLatitude : coordinate?.[1] >= boundaryLatitude
  ));

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    return isInside(geometry.coordinates) ? geometry : null;
  }

  if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates)) {
    const coordinates = geometry.coordinates.filter(isInside);
    return coordinates.length ? { type: "MultiPoint", coordinates } : null;
  }

  return null;
}

function polygonBoundaryFeatures(feature) {
  const geometry = feature?.geometry;
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  const properties = feature?.properties ?? {};
  const rings = [];
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    rings.push(...geometry.coordinates);
  } else if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((polygon) => {
      if (Array.isArray(polygon)) {
        rings.push(...polygon);
      }
    });
  }

  return rings
    .filter((ring) => Array.isArray(ring) && ring.length > 1)
    .map((ring) => ({
      type: "Feature",
      properties,
      geometry: {
        type: "LineString",
        coordinates: ring,
      },
    }));
}

function buildPolygonBoundaryFeatureCollection(featureCollection) {
  return {
    type: "FeatureCollection",
    features: (featureCollection?.features ?? []).flatMap(polygonBoundaryFeatures),
  };
}

function removePolarSyntheticLineSegments(geometry, mode = POLAR_RENDER_MODES.SOUTH, latitude = POLAR_CAP_VISIBLE_LATITUDE) {
  const boundaryLatitudes = getPolarBoundaryLatitudes(mode, latitude);
  if (!geometry || typeof geometry !== "object" || !boundaryLatitudes.length) {
    return geometry ?? null;
  }

  const tolerance = 1e-7;
  const isPolarBoundarySegment = (start, end) => boundaryLatitudes.some((boundaryLatitude) => (
    Math.abs((start?.[1] ?? Number.NaN) - boundaryLatitude) <= tolerance
    && Math.abs((end?.[1] ?? Number.NaN) - boundaryLatitude) <= tolerance
  ));
  const isAntimeridianSegment = (start, end) => (
    Math.abs(Math.abs(start?.[0] ?? Number.NaN) - 180) <= tolerance
    && Math.abs(Math.abs(end?.[0] ?? Number.NaN) - 180) <= tolerance
  );
  const isSyntheticSegment = (start, end) => (
    isPolarBoundarySegment(start, end)
    || isAntimeridianSegment(start, end)
  );

  const filterLine = (line) => {
    if (!Array.isArray(line) || line.length < 2) {
      return [];
    }

    const segments = [];
    let current = [];
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      if (isSyntheticSegment(start, end)) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [];
        continue;
      }
      if (!current.length) {
        current = [start];
      }
      current.push(end);
    }
    if (current.length > 1) {
      segments.push(current);
    }
    return segments;
  };

  const lines = geometry.type === "LineString"
    ? filterLine(geometry.coordinates)
    : geometry.type === "MultiLineString"
      ? geometry.coordinates.flatMap(filterLine)
      : [];

  if (!lines.length) {
    return null;
  }
  if (lines.length === 1) {
    return { type: "LineString", coordinates: lines[0] };
  }
  return { type: "MultiLineString", coordinates: lines };
}

function prepareFeatureCollectionForPolarRendering(
  featureCollection,
  {
    geometryFamily = "polygon",
    mode = POLAR_RENDER_MODES.SOUTH,
    sourceLatitude = POLAR_CAP_SOURCE_LATITUDE,
    visibleLatitude = POLAR_CAP_VISIBLE_LATITUDE,
  } = {},
) {
  if (geometryFamily === "polygon") {
    const sourceMask = buildPolarCapMaskGeometry(mode, sourceLatitude);
    const visibleMask = buildPolarCapMaskGeometry(mode, visibleLatitude);
    const sourceCap = clipFeatureCollectionToMask(featureCollection, sourceMask);
    const visibleCap = clipFeatureCollectionToMask(sourceCap, visibleMask);
    return redensifyFeatureCollectionAlongLatitudes(
      visibleCap,
      getPolarBoundaryLatitudes(mode, visibleLatitude),
    );
  }

  if (geometryFamily === "line" || geometryFamily === "point") {
    const features = (featureCollection?.features ?? []).map((feature) => {
      const geometry = geometryFamily === "line"
        ? clipLineGeometryToPolarMode(feature?.geometry, mode, visibleLatitude)
        : clipPointGeometryToPolarMode(feature?.geometry, mode, visibleLatitude);
      if (!geometry) {
        return null;
      }
      return {
        type: "Feature",
        properties: feature?.properties ?? {},
        geometry,
      };
    }).filter(Boolean);

    return {
      type: "FeatureCollection",
      features,
    };
  }

  return {
    type: "FeatureCollection",
    features: [],
  };
}

function preparePolygonBoundaryFeatureCollectionForPolarRendering(
  featureCollection,
  {
    mode = POLAR_RENDER_MODES.SOUTH,
    visibleLatitude = POLAR_CAP_VISIBLE_LATITUDE,
  } = {},
) {
  const boundaryFeatureCollection = buildPolygonBoundaryFeatureCollection(featureCollection);
  const clipped = prepareFeatureCollectionForPolarRendering(boundaryFeatureCollection, {
    geometryFamily: "line",
    mode,
    visibleLatitude,
  });

  return {
    type: "FeatureCollection",
    features: (clipped.features ?? []).map((feature) => {
      const geometry = removePolarSyntheticLineSegments(feature?.geometry, mode, visibleLatitude);
      if (!geometry) {
        return null;
      }
      return {
        type: "Feature",
        properties: feature?.properties ?? {},
        geometry,
      };
    }).filter(Boolean),
  };
}

let southPolarCapSourcePromise = null;
let southPolarCapPromise = null;
let southPolarLandLinePromise = null;
let polarGraticulesPromise = null;

function loadSouthPolarCapSource() {
  if (southPolarCapSourcePromise) {
    return southPolarCapSourcePromise;
  }

  southPolarCapSourcePromise = fetch(SOUTH_POLAR_CAP_SOURCE_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load south polar cap source: ${response.status}`);
      }
      return response.json();
    });

  return southPolarCapSourcePromise;
}

function loadSouthPolarCap() {
  if (southPolarCapPromise) {
    return southPolarCapPromise;
  }

  southPolarCapPromise = loadSouthPolarCapSource()
    .then((featureCollection) => prepareFeatureCollectionForPolarRendering(featureCollection, {
      geometryFamily: "polygon",
      mode: POLAR_RENDER_MODES.SOUTH,
      sourceLatitude: POLAR_CAP_SOURCE_LATITUDE,
      visibleLatitude: POLAR_CAP_VISIBLE_LATITUDE,
    }));

  return southPolarCapPromise;
}

function loadSouthPolarLandLines() {
  if (southPolarLandLinePromise) {
    return southPolarLandLinePromise;
  }

  southPolarLandLinePromise = loadSouthPolarCapSource()
    .then((featureCollection) => preparePolygonBoundaryFeatureCollectionForPolarRendering(featureCollection, {
      mode: POLAR_RENDER_MODES.SOUTH,
      visibleLatitude: POLAR_CAP_VISIBLE_LATITUDE,
    }));

  return southPolarLandLinePromise;
}

function loadPolarGraticules() {
  if (polarGraticulesPromise) {
    return polarGraticulesPromise;
  }

  polarGraticulesPromise = fetch(GRATICULES_SOURCE_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load graticules source: ${response.status}`);
      }
      return response.json();
    })
    .then((featureCollection) => prepareFeatureCollectionForPolarRendering(featureCollection, {
      geometryFamily: "line",
      mode: POLAR_RENDER_MODES.BOTH,
      sourceLatitude: POLAR_CAP_SOURCE_LATITUDE,
      visibleLatitude: POLAR_CAP_VISIBLE_LATITUDE,
    }));

  return polarGraticulesPromise;
}

function buildOpaqueBlendedFillColor({
  fillColor,
  fillOpacityPercent,
  backgroundColor,
  backgroundOpacityPercent,
}) {
  const fillAlpha = Math.max(0, Math.min(1, Number(fillOpacityPercent) / 100));
  const backgroundAlpha = Math.max(0, Math.min(1, Number(backgroundOpacityPercent) / 100));
  const fillRgb = hexToRgb(fillColor, { r: 110, g: 170, b: 110 });
  const backgroundRgb = hexToRgb(backgroundColor, WATER_BACKGROUND_COLOR);
  const effectiveBackground = {
    r: backgroundRgb.r * backgroundAlpha,
    g: backgroundRgb.g * backgroundAlpha,
    b: backgroundRgb.b * backgroundAlpha,
  };

  return rgbToHex({
    r: fillRgb.r * fillAlpha + effectiveBackground.r * (1 - fillAlpha),
    g: fillRgb.g * fillAlpha + effectiveBackground.g * (1 - fillAlpha),
    b: fillRgb.b * fillAlpha + effectiveBackground.b * (1 - fillAlpha),
  });
}

function getLayoutVisibility(layerState, layerId) {
  return getLayerStyleValue(layerState, layerId, "visible", true) ? "visible" : "none";
}

function isRowEnabled(layerState, rowId) {
  if (typeof layerState?.[rowId]?.rowVisible === "boolean") {
    return layerState[rowId].rowVisible;
  }
  return getLayerStyleValue(layerState, rowId, "visible", true);
}

function getInheritedLayoutVisibility(layerState, layerId) {
  let currentRowId = findRowStateKeyForRuntimeTarget(layerState, layerId) ?? layerId;

  while (currentRowId) {
    if (!isRowEnabled(layerState, currentRowId)) {
      return "none";
    }
    currentRowId = layerState?.[currentRowId]?.parentRowId ?? null;
  }

  return "visible";
}

function applyRuntimeTargetVisibility(runtimeTargetId, map, layerState) {
  if (!runtimeTargetId) {
    return;
  }

  if (runtimeTargetId === "ocean" || runtimeTargetId === "ocean::fill") {
    if (map.getLayer("atlas-water")) {
      map.setLayoutProperty("atlas-water", "visibility", getInheritedLayoutVisibility(layerState, "ocean::fill"));
    }
    return;
  }

  const pointRuntimeTarget = parseRuntimeTarget(runtimeTargetId);
  if (pointRuntimeTarget?.subtarget === "point-fill" || pointRuntimeTarget?.subtarget === "point-stroke") {
    if (applyDynamicPointLayerState(pointRuntimeTarget.baseLayerId, map, layerState)) {
      return;
    }
  }

  getMaplibreLayerIdsForRuntimeTarget(runtimeTargetId, map).forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, runtimeTargetId));
    }
  });
}

function getOlympicsYear(layerState) {
  const selectedYear = Number(getLayerStyleValue(layerState, "olympics", "selectedYear", 2024));
  return Number.isFinite(selectedYear) ? selectedYear : 2024;
}

function getOlympicsVectorUrl(layerState) {
  return `/data/temporal/olympic-medals-birthplace.${getOlympicsYear(layerState)}.geojson`;
}

function getOlympicsPointRadius(layerState) {
  return Math.max(0, Number(getLayerStyleValue(layerState, "olympics", "pointRadius", 3.5)) || 0);
}

function geometryToMultiPolygonCoordinates(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return [];
}

function buildEmpireOutlineFeatureCollection(featureCollection) {
  // Extract all polygon rings as LineStrings directly — no polygon union needed,
  // which avoids blocking the main thread with a heavy polygonClipping.union() call.
  const lineFeatures = [];
  for (const feature of featureCollection?.features ?? []) {
    for (const polygon of geometryToMultiPolygonCoordinates(feature.geometry)) {
      for (const ring of polygon) {
        lineFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: ring },
        });
      }
    }
  }
  return { type: "FeatureCollection", features: lineFeatures };
}

function ensureProtocol(manifest = []) {
  if (protocolInstalled) {
    return;
  }

  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  installAtlasVectorTileProtocol(maplibregl);
  LOCAL_LAYERS.filter((l) => l.source.kind === "atlas-vector").forEach((l) => {
    registerGeojsonVectorTileSource({
      id: localLayerTileSourceId(l.id),
      dataUrl: l.source.dataUrl,
      sourceLayer: l.source.sourceLayer,
    });
  });
  registerGeojsonVectorTileSource({
    id: ROMAN_FILL_SOURCE_ID,
    dataUrl: ROMAN_VECTOR_URL,
    sourceLayer: ROMAN_FILL_SOURCE_LAYER,
  });
  registerGeojsonVectorTileSource({
    id: MONGOL_FILL_SOURCE_ID,
    dataUrl: MONGOL_FILL_VECTOR_URL,
    sourceLayer: MONGOL_FILL_SOURCE_LAYER,
  });
  registerGeojsonVectorTileSource({
    id: BRITISH_FILL_SOURCE_ID,
    dataUrl: BRITISH_VECTOR_URL,
    sourceLayer: BRITISH_FILL_SOURCE_LAYER,
  });
  protocolInstalled = true;
}

async function loadRomanEmpireVector() {
  const response = await fetch(ROMAN_VECTOR_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Roman empire vector: ${response.status}`);
  }

  return response.json();
}

async function loadMongolEmpireVector() {
  const response = await fetch(MONGOL_VECTOR_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Mongol empire vector: ${response.status}`);
  }

  return response.json();
}

async function loadBritishEmpireVector() {
  const response = await fetch(BRITISH_VECTOR_URL);
  if (!response.ok) {
    throw new Error(`Failed to load British empire vector: ${response.status}`);
  }

  return response.json();
}

// ─── Standard layer registry ─────────────────────────────────────────────────
// Derived from src/config/local-layers.js — do not edit here.

function toRegistryEntry(entry) {
  const { id, deferred, source, fill, line, circle } = entry;
  const sourceLayer = source.sourceLayer ?? null;
  const registrySource = source.kind === "pmtiles"
    ? { kind: "runtime-vector", id: localLayerSourceId(id), pmtilesId: source.pmtilesId, atlasVectorTileId: localLayerTileSourceId(id) }
    : source.kind === "atlas-vector"
      ? { kind: "atlas-vector", id: localLayerSourceId(id), atlasVectorTileId: localLayerTileSourceId(id) }
      : { kind: "geojson", id: localLayerSourceId(id), url: source.url };
  return {
    layerId: id,
    deferred: deferred ?? false,
    source: registrySource,
    fill: fill ? {
      id: localLayerFillId(id),
      runtimeTargetId: `${id}::fill`,
      sourceLayer,
      defaultColor: fill.color,
      defaultOpacity: fill.opacity,
    } : null,
    line: line ? {
      id: localLayerLineId(id),
      runtimeTargetId: `${id}::line`,
      sourceLayer,
      defaultColor: line.color,
      defaultOpacity: line.opacity,
      defaultWeight: line.weight ?? 1,
      ...(line.cap || line.join ? { extraLayout: {
        ...(line.cap ? { "line-cap": line.cap } : {}),
        ...(line.join ? { "line-join": line.join } : {}),
      } } : {}),
    } : null,
    circle: circle ? {
      ids: circle.ids,
      defaultColor: circle.color,
      defaultOpacity: circle.opacity,
      defaultRadius: circle.radius ?? 3.5,
    } : null,
  };
}

const STANDARD_LAYER_REGISTRY = LOCAL_LAYERS.map(toRegistryEntry);

// Special registry entries for Olympics and Empires
const OLYMPICS_REGISTRY_ENTRY = {
  layerId: "olympics",
  deferred: false,
  source: { kind: "geojson", id: OLYMPICS_SOURCE_ID, url: getOlympicsVectorUrl },
  circle: {
    ids: [OLYMPICS_GOLD_LAYER_ID, OLYMPICS_SILVER_LAYER_ID, OLYMPICS_BRONZE_LAYER_ID],
    defaultColor: "#D4AF37",
    defaultOpacity: 100,
    defaultRadius: 3.5,
  },
};

const EMPIRE_REGISTRY_ENTRIES = [
  {
    layerId: "roman",
    deferred: false,
    source: { kind: "geojson", id: ROMAN_SOURCE_ID, url: ROMAN_VECTOR_URL },
    fill: {
      id: ROMAN_FILL_LAYER_ID,
      sourceLayer: ROMAN_FILL_SOURCE_LAYER,
      defaultColor: "#b85c38",
      defaultOpacity: 100,
    },
    line: {
      id: ROMAN_LINE_LAYER_ID,
      sourceLayer: ROMAN_FILL_SOURCE_LAYER,
      defaultColor: "#d96f44",
      defaultOpacity: 100,
      defaultWeight: 1,
    },
  },
  {
    layerId: "mongol",
    deferred: false,
    source: { kind: "geojson", id: MONGOL_SOURCE_ID, url: MONGOL_VECTOR_URL },
    fill: {
      id: MONGOL_FILL_LAYER_ID,
      sourceLayer: MONGOL_FILL_SOURCE_LAYER,
      defaultColor: "#b85c38",
      defaultOpacity: 100,
    },
    line: {
      id: MONGOL_LINE_LAYER_ID,
      sourceLayer: MONGOL_FILL_SOURCE_LAYER,
      defaultColor: "#d96f44",
      defaultOpacity: 100,
      defaultWeight: 1,
    },
  },
  {
    layerId: "british",
    deferred: false,
    source: { kind: "geojson", id: BRITISH_SOURCE_ID, url: BRITISH_VECTOR_URL },
    fill: {
      id: BRITISH_FILL_LAYER_ID,
      sourceLayer: BRITISH_FILL_SOURCE_LAYER,
      defaultColor: "#c84b31",
      defaultOpacity: 100,
    },
    line: {
      id: BRITISH_LINE_LAYER_ID,
      sourceLayer: BRITISH_FILL_SOURCE_LAYER,
      defaultColor: "#f07a58",
      defaultOpacity: 100,
      defaultWeight: 1,
    },
  },
];

// Combined registry
const FULL_REGISTRY = [
  ...STANDARD_LAYER_REGISTRY,
  OLYMPICS_REGISTRY_ENTRY,
  ...EMPIRE_REGISTRY_ENTRIES,
];

// Helper function to find registry entry by layer ID
function findRegistryEntry(layerId) {
  return FULL_REGISTRY.find(entry => entry.layerId === layerId);
}

function attachStandardLayer(map, layerState, manifest, entry) {
  const { source, fill, line, layerId } = entry;

  if (map.getSource(source.id)) {
    return;
  }

  let sourceSpec;
  if (source.kind === "runtime-vector") {
    sourceSpec = createRuntimeVectorSourceSpec({
      manifest,
      pmtilesId: source.pmtilesId,
      atlasVectorTileId: source.atlasVectorTileId,
      maxZoom: source.maxZoom,
    });
  } else if (source.kind === "atlas-vector") {
    sourceSpec = createGeojsonVectorSourceSpec(source.atlasVectorTileId, source.maxZoom);
  } else {
    sourceSpec = { type: "geojson", data: source.url };
  }

  map.addSource(source.id, sourceSpec);

  if (fill) {
    const fillSpec = {
      id: fill.id,
      type: "fill",
      source: source.id,
      layout: { visibility: getMaplibreLayerVisibility(layerState, fill.runtimeTargetId ?? layerId, layerId) },
      paint: {
        "fill-color": getLayerStyleValue(layerState, layerId, "fillColor", fill.defaultColor),
        "fill-opacity": Number(getLayerStyleValue(layerState, layerId, "fillOpacity", fill.defaultOpacity ?? 100)) / 100,
      },
    };
    if (fill.sourceLayer) {
      fillSpec["source-layer"] = fill.sourceLayer;
    }
    map.addLayer(fillSpec);
  }

  if (line) {
    const lineSpec = {
      id: line.id,
      type: "line",
      source: source.id,
      layout: {
        ...line.extraLayout,
        visibility: getMaplibreLayerVisibility(layerState, line.runtimeTargetId ?? layerId, layerId),
      },
      paint: {
        "line-color": getLayerStyleValue(layerState, layerId, "lineColor", line.defaultColor),
        "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, layerId, "lineWeight", line.defaultWeight ?? 1)),
        "line-opacity": Number(getLayerStyleValue(layerState, layerId, "lineOpacity", line.defaultOpacity ?? 100)) / 100,
      },
    };
    if (layerId === "graticules") {
      lineSpec.filter = ["!=", ["get", "polar"], true];
    }
    if (line.sourceLayer) {
      lineSpec["source-layer"] = line.sourceLayer;
    }
    map.addLayer(lineSpec);
  }
}

// Applies a style key/value to a registry entry's MapLibre layers.
// Returns true if the update was handled (so callers can return early).
function applyRegistryStyleValue(entry, map, layerState, key, value) {
  const { fill, line, circle, layerId } = entry;

  if (key === "fillColor" && fill && map.getLayer(fill.id)) {
    map.setPaintProperty(fill.id, "fill-color", String(value));
    return true;
  }
  if (key === "fillOpacity" && fill && map.getLayer(fill.id)) {
    map.setPaintProperty(fill.id, "fill-opacity", Number(value) / 100);
    return true;
  }
  if (key === "lineColor" && line && map.getLayer(line.id)) {
    map.setPaintProperty(line.id, "line-color", String(value));
    return true;
  }
  if (key === "lineOpacity" && line && map.getLayer(line.id)) {
    map.setPaintProperty(line.id, "line-opacity", Number(value) / 100);
    return true;
  }
  if (key === "lineWeight" && line && map.getLayer(line.id)) {
    map.setPaintProperty(line.id, "line-width", buildLineWidthExpression(Number(value)));
    return true;
  }
  
  // Circle layer handling (for Olympics)
  if (circle) {
    if (key === "pointColor") {
      circle.ids.forEach(id => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "circle-color", String(value));
        }
      });
      return true;
    }
    if (key === "pointOpacity") {
      circle.ids.forEach(id => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "circle-opacity", Number(value) / 100);
        }
      });
      return true;
    }
    if (key === "pointRadius") {
      circle.ids.forEach(id => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "circle-radius", Number(value));
        }
      });
      return true;
    }
  }
  
  if (key === "visible") {
    if (fill && map.getLayer(fill.id)) {
      map.setLayoutProperty(fill.id, "visibility", getMaplibreLayerVisibility(layerState, fill.runtimeTargetId ?? layerId, layerId));
    }
    if (line && map.getLayer(line.id)) {
      map.setLayoutProperty(line.id, "visibility", getMaplibreLayerVisibility(layerState, line.runtimeTargetId ?? layerId, layerId));
    }
    if (circle) {
      circle.ids.forEach(id => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, layerId));
        }
      });
    }
    return true;
  }
  return false;
}

function createSouthPolarCapOverlayState(layerState) {
  return {
    southPolarCapData: null,
    southPolarLandLineData: null,
    polarGraticulesData: null,
    deckOverlay: null,
    interleavedDeckOverlay: null,
    loadError: null,
    loadPromise: null,
    landLineLoadError: null,
    landLineLoadPromise: null,
    graticulesLoadError: null,
    graticulesLoadPromise: null,
    map: null,
    destroyed: false,
    initialized: false,
    getOrderedChildRowIds: null,
    layerState,
    backendEntries: [],
  };
}

function supportsPolarMode(mode) {
  return mode === POLAR_RENDER_MODES.SOUTH
    || mode === POLAR_RENDER_MODES.NORTH
    || mode === POLAR_RENDER_MODES.BOTH;
}

function createBuiltInPolarBackendEntries() {
  if (SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED) {
    return [];
  }

  const entries = [
    {
      id: "polar-background",
      orderKey: null,
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.BOTH,
      runtimeTargetIds: ["land::fill", "graticules::line", "ocean", "ocean::fill"],
      buildLayer: (state) => buildSouthPolarBackgroundDeckLayer(state.layerState, POLAR_RENDER_MODES.BOTH),
    },
    {
      id: "ocean::fill",
      orderKey: "ocean",
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.BOTH,
      runtimeTargetIds: ["ocean", "ocean::fill"],
      kind: "fill",
      visibilityTargetId: "ocean::fill",
      styleTargetId: "ocean::fill",
      defaultColor: DEFAULT_OCEAN_FILL_COLOR,
      defaultOpacity: 100,
      getData: () => buildPolarCapFeatureCollection(POLAR_RENDER_MODES.BOTH),
    },
    {
      id: "land::fill",
      orderKey: "land",
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.SOUTH,
      runtimeTargetIds: ["land", "land::fill"],
      kind: "fill",
      visibilityTargetId: "land::fill",
      styleTargetId: "land::fill",
      defaultColor: DEFAULT_LAND_FILL_COLOR,
      defaultOpacity: 100,
      getData: (state) => state.southPolarCapData,
    },
    {
      id: "land::line",
      orderKey: "land",
      stackOrder: 1,
      mode: POLAR_RENDER_MODES.SOUTH,
      runtimeTargetIds: ["land", "land::line"],
      kind: "line",
      visibilityTargetId: "land::line",
      styleTargetId: "land::line",
      defaultColor: DEFAULT_OUTLINE_LINE_COLOR,
      defaultOpacity: 100,
      defaultWeight: 1,
      getData: (state) => state.southPolarLandLineData,
    },
    {
      id: "graticules::line",
      orderKey: "graticules",
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.BOTH,
      runtimeTargetIds: ["graticules", "graticules::line"],
      kind: "line",
      visibilityTargetId: "graticules::line",
      styleTargetId: "graticules::line",
      defaultColor: "#8FA9BC",
      defaultOpacity: 100,
      defaultWeight: 1,
      getData: (state) => state.polarGraticulesData,
    },
  ];

  return entries;
}

function getSouthPolarBackendEntries(state) {
  const backends = Array.isArray(state?.backendEntries) ? state.backendEntries : [];
  return backends.filter((entry) => supportsPolarMode(entry?.mode));
}

function shouldRefreshSouthPolarOverlay(state, runtimeTargetId) {
  if (!runtimeTargetId) {
    return false;
  }

  return getSouthPolarBackendEntries(state).some((entry) => (
    Array.isArray(entry?.runtimeTargetIds) && entry.runtimeTargetIds.includes(runtimeTargetId)
  ));
}

function buildPolarFillDeckLayer({
  deckLayerId,
  visibilityTargetId,
  styleTargetId,
  defaultColor,
  defaultOpacity = 100,
  layerState,
  data,
  beforeId = null,
}) {
  if (!data?.features?.length) {
    return null;
  }

  const visible = getInheritedLayoutVisibility(layerState, visibilityTargetId) === "visible";
  if (!visible) {
    return null;
  }

  const fillOpacity = Number(getLayerStyleValue(layerState, styleTargetId, "fillOpacity", defaultOpacity)) / 100;
  const rgb = hexToRgb(
    getLayerStyleValue(layerState, styleTargetId, "fillColor", defaultColor),
    hexToRgb(defaultColor, { r: 110, g: 170, b: 110 }),
  );

  return new GeoJsonLayer({
    id: deckLayerId,
    beforeId,
    data,
    filled: true,
    stroked: false,
    pickable: false,
    opacity: fillOpacity,
    getFillColor: [rgb.r, rgb.g, rgb.b, 255],
    parameters: {
      depthWriteEnabled: false,
      depthCompare: "always",
    },
  });
}

function buildPolarLineDeckLayer({
  deckLayerId,
  visibilityTargetId,
  styleTargetId,
  colorStyleKey = "lineColor",
  opacityStyleKey = "lineOpacity",
  weightStyleKey = "lineWeight",
  defaultColor,
  defaultOpacity = 100,
  defaultWeight = 1,
  layerState,
  data,
  beforeId = null,
}) {
  if (!data?.features?.length) {
    return null;
  }

  const visible = getInheritedLayoutVisibility(layerState, visibilityTargetId) === "visible";
  if (!visible) {
    return null;
  }

  const rgb = hexToRgb(
    getLayerStyleValue(layerState, styleTargetId, colorStyleKey, defaultColor),
    hexToRgb(defaultColor, { r: 143, g: 169, b: 188 }),
  );
  const lineWidth = Number(getLayerStyleValue(layerState, styleTargetId, weightStyleKey, defaultWeight));

  return new GeoJsonLayer({
    id: deckLayerId,
    beforeId,
    data,
    filled: false,
    stroked: true,
    pickable: false,
    getLineColor: [rgb.r, rgb.g, rgb.b, 255],
    getLineWidth: lineWidth,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: lineWidth,
    opacity: Number(getLayerStyleValue(layerState, styleTargetId, opacityStyleKey, defaultOpacity)) / 100,
    parameters: {
      depthWriteEnabled: false,
      depthCompare: "always",
    },
  });
}

function buildPolarPointDeckLayer({
  deckLayerId,
  visibilityTargetId,
  fillStyleTargetId,
  strokeStyleTargetId,
  defaultColor = "#e74c3c",
  defaultOpacity = 80,
  defaultRadius = 6,
  defaultStrokeColor = "#ffffff",
  defaultStrokeOpacity = 100,
  defaultStrokeWeight = 1,
  layerState,
  data,
  beforeId = null,
}) {
  if (!data?.features?.length) {
    return null;
  }

  const visible = getInheritedLayoutVisibility(layerState, visibilityTargetId) === "visible";
  if (!visible) {
    return null;
  }

  const fillRgb = hexToRgb(
    getLayerStyleValue(layerState, fillStyleTargetId, "pointColor", defaultColor),
    hexToRgb(defaultColor, { r: 231, g: 76, b: 60 }),
  );
  const strokeRgb = hexToRgb(
    getLayerStyleValue(layerState, strokeStyleTargetId, "lineColor", defaultStrokeColor),
    hexToRgb(defaultStrokeColor, { r: 255, g: 255, b: 255 }),
  );
  const radius = Number(getLayerStyleValue(layerState, fillStyleTargetId, "pointRadius", defaultRadius));
  const strokeWidth = Number(getLayerStyleValue(layerState, strokeStyleTargetId, "lineWeight", defaultStrokeWeight));

  return new GeoJsonLayer({
    id: deckLayerId,
    beforeId,
    data,
    filled: true,
    stroked: true,
    pointType: "circle",
    pickable: false,
    getPointRadius: radius,
    pointRadiusUnits: "pixels",
    pointRadiusMinPixels: radius,
    getFillColor: [fillRgb.r, fillRgb.g, fillRgb.b, 255],
    getLineColor: [strokeRgb.r, strokeRgb.g, strokeRgb.b, 255],
    getLineWidth: strokeWidth,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: strokeWidth,
    opacity: Number(getLayerStyleValue(layerState, fillStyleTargetId, "pointOpacity", defaultOpacity)) / 100,
    parameters: {
      depthWriteEnabled: false,
      depthCompare: "always",
    },
  });
}

function buildSouthPolarBackgroundDeckLayer(layerState, mode = POLAR_RENDER_MODES.SOUTH, beforeId = null) {
  const shouldShowBackground = [
    getInheritedLayoutVisibility(layerState, "land::fill"),
    getInheritedLayoutVisibility(layerState, "graticules::line"),
    getInheritedLayoutVisibility(layerState, "ocean::fill"),
  ].includes("visible");

  if (!shouldShowBackground) {
    return null;
  }

  return new GeoJsonLayer({
    id: SOUTH_POLAR_BACKGROUND_LAYER_ID,
    beforeId,
    data: buildPolarCapFeatureCollection(mode),
    filled: true,
    stroked: false,
    pickable: false,
    opacity: 1,
    getFillColor: [0, 0, 0, 255],
    parameters: {
      depthWriteEnabled: false,
      depthCompare: "always",
    },
  });
}

function buildPolarBackendLayer(entry, state) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  if (typeof entry.buildLayer === "function") {
    return entry.buildLayer(state);
  }

  const data = entry.getData?.(state) ?? null;
  if (entry.kind === "fill") {
    return buildPolarFillDeckLayer({
      deckLayerId: entry.id === "ocean::fill" ? SOUTH_POLAR_OCEAN_LAYER_ID : SOUTH_POLAR_CAP_LAYER_ID,
      visibilityTargetId: entry.visibilityTargetId ?? entry.id,
      styleTargetId: entry.styleTargetId ?? entry.id,
      defaultColor: entry.defaultColor ?? DEFAULT_LAND_FILL_COLOR,
      defaultOpacity: entry.defaultOpacity ?? 100,
      layerState: state.layerState,
      data,
      beforeId: entry.beforeId ?? null,
    });
  }

  if (entry.kind === "line") {
    const deckLayerId = entry.id === "graticules::line"
      ? POLAR_GRATICULES_LAYER_ID
      : `${entry.id}-polar`;
    return buildPolarLineDeckLayer({
      deckLayerId,
      visibilityTargetId: entry.visibilityTargetId ?? entry.id,
      styleTargetId: entry.styleTargetId ?? entry.id,
      colorStyleKey: entry.colorStyleKey ?? "lineColor",
      opacityStyleKey: entry.opacityStyleKey ?? "lineOpacity",
      weightStyleKey: entry.weightStyleKey ?? "lineWeight",
      defaultColor: entry.defaultColor ?? DEFAULT_OUTLINE_LINE_COLOR,
      defaultOpacity: entry.defaultOpacity ?? 100,
      defaultWeight: entry.defaultWeight ?? 1,
      layerState: state.layerState,
      data,
      beforeId: entry.beforeId ?? null,
    });
  }

  if (entry.kind === "point") {
    return buildPolarPointDeckLayer({
      deckLayerId: `${entry.id}-polar`,
      visibilityTargetId: entry.visibilityTargetId ?? entry.id,
      fillStyleTargetId: entry.fillStyleTargetId ?? entry.styleTargetId ?? entry.id,
      strokeStyleTargetId: entry.strokeStyleTargetId ?? entry.id,
      defaultColor: entry.defaultColor ?? "#e74c3c",
      defaultOpacity: entry.defaultOpacity ?? 80,
      defaultRadius: entry.defaultRadius ?? 6,
      defaultStrokeColor: entry.defaultStrokeColor ?? "#ffffff",
      defaultStrokeOpacity: entry.defaultStrokeOpacity ?? 100,
      defaultStrokeWeight: entry.defaultStrokeWeight ?? 1,
      layerState: state.layerState,
      data,
      beforeId: entry.beforeId ?? null,
    });
  }

  return null;
}

function buildPolarDeckLayers(state) {
  if (!state) {
    return [];
  }

  const orderedEarthRowIds = typeof state.getOrderedChildRowIds === "function"
    ? state.getOrderedChildRowIds("earth")
    : [];
  const orderedBackendKeys = Array.isArray(orderedEarthRowIds) && orderedEarthRowIds.length
    ? orderedEarthRowIds
    : ["land", "graticules", "ocean"];
  const orderedBackendKeySet = new Set(orderedBackendKeys);
  const orderedContentLayers = [...orderedBackendKeys]
    .reverse()
    .flatMap((rowId) => (
      getSouthPolarBackendEntries(state)
        .filter((entry) => entry?.orderKey === rowId)
        .sort((a, b) => (Number(a?.stackOrder) || 0) - (Number(b?.stackOrder) || 0))
    ))
    .map((entry) => buildPolarBackendLayer(entry, state))
    .filter(Boolean);
  const unorderedContentLayers = getSouthPolarBackendEntries(state)
    .filter((entry) => entry?.orderKey != null && !orderedBackendKeySet.has(entry.orderKey))
    .map((entry) => buildPolarBackendLayer(entry, state))
    .filter(Boolean);
  const overlayLayers = getSouthPolarBackendEntries(state)
    .filter((entry) => entry?.orderKey == null)
    .map((entry) => buildPolarBackendLayer(entry, state))
    .filter(Boolean);

  return [
    ...overlayLayers,
    ...orderedContentLayers,
    ...unorderedContentLayers,
  ].filter(Boolean);
}

function updateSouthPolarCapOverlay(state) {
  if (!state?.deckOverlay || state.destroyed) {
    return;
  }

  if (SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED) {
    state.deckOverlay.setProps({ layers: [] });
    return;
  }

  state.deckOverlay.setProps({
    layers: buildPolarDeckLayers(state),
  });
}

function buildSouthPolarInterleavedGeojsonLayers(state) {
  if (!SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED || !state) {
    return [];
  }

  const entries = [
    {
      id: "polar-background",
      beforeId: SOUTH_POLAR_INTERLEAVED_BEFORE_ID,
      orderKey: null,
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.BOTH,
      runtimeTargetIds: ["land::fill", "graticules::line", "ocean", "ocean::fill"],
      buildLayer: (overlayState) => buildSouthPolarBackgroundDeckLayer(
        overlayState.layerState,
        POLAR_RENDER_MODES.BOTH,
        SOUTH_POLAR_INTERLEAVED_BEFORE_ID,
      ),
    },
    {
      id: "ocean::fill",
      beforeId: SOUTH_POLAR_INTERLEAVED_BEFORE_ID,
      orderKey: "ocean",
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.BOTH,
      runtimeTargetIds: ["ocean", "ocean::fill"],
      kind: "fill",
      visibilityTargetId: "ocean::fill",
      styleTargetId: "ocean::fill",
      defaultColor: DEFAULT_OCEAN_FILL_COLOR,
      defaultOpacity: 100,
      getData: () => buildPolarCapFeatureCollection(POLAR_RENDER_MODES.BOTH),
    },
    {
      id: "land::fill",
      beforeId: SOUTH_POLAR_INTERLEAVED_BEFORE_ID,
      orderKey: "land",
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.SOUTH,
      runtimeTargetIds: ["land", "land::fill"],
      kind: "fill",
      visibilityTargetId: "land::fill",
      styleTargetId: "south-polar-interleaved-land::fill",
      defaultColor: SOUTH_POLAR_INTERLEAVED_LAND_FILL_COLOR,
      defaultOpacity: 100,
      getData: () => state.southPolarCapData,
    },
    {
      id: "land::line",
      beforeId: SOUTH_POLAR_INTERLEAVED_BEFORE_ID,
      orderKey: "land",
      stackOrder: 1,
      mode: POLAR_RENDER_MODES.SOUTH,
      runtimeTargetIds: ["land", "land::line"],
      kind: "line",
      visibilityTargetId: "land::line",
      styleTargetId: "land::line",
      defaultColor: DEFAULT_OUTLINE_LINE_COLOR,
      defaultOpacity: 100,
      defaultWeight: 1,
      getData: () => state.southPolarLandLineData,
    },
    {
      id: "graticules::line",
      beforeId: SOUTH_POLAR_INTERLEAVED_BEFORE_ID,
      orderKey: "graticules",
      stackOrder: 0,
      mode: POLAR_RENDER_MODES.BOTH,
      runtimeTargetIds: ["graticules", "graticules::line"],
      kind: "line",
      visibilityTargetId: "graticules::line",
      styleTargetId: "graticules::line",
      defaultColor: "#8FA9BC",
      defaultOpacity: 100,
      defaultWeight: 1,
      getData: () => state.polarGraticulesData,
    },
  ];

  const orderedEarthRowIds = typeof state.getOrderedChildRowIds === "function"
    ? state.getOrderedChildRowIds("earth")
    : [];
  const orderedBackendKeys = Array.isArray(orderedEarthRowIds) && orderedEarthRowIds.length
    ? orderedEarthRowIds
    : ["land", "graticules", "ocean"];
  const orderedBackendKeySet = new Set(orderedBackendKeys);
  const overlayEntries = entries.filter((entry) => entry?.orderKey == null);
  const orderedEntries = [...orderedBackendKeys]
    .reverse()
    .flatMap((rowId) => (
      entries
        .filter((entry) => entry?.orderKey === rowId)
        .sort((a, b) => (Number(a?.stackOrder) || 0) - (Number(b?.stackOrder) || 0))
    ));
  const unorderedEntries = entries.filter((entry) => entry?.orderKey != null && !orderedBackendKeySet.has(entry.orderKey));

  return [
    ...overlayEntries,
    ...orderedEntries,
    ...unorderedEntries,
  ]
    .map((entry) => buildPolarBackendLayer(entry, state))
    .filter(Boolean);
}

function updateSouthPolarInterleavedGeojsonOverlay(state) {
  if (!SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED || !state?.interleavedDeckOverlay || state.destroyed) {
    return;
  }

  state.interleavedDeckOverlay.setProps({
    layers: buildSouthPolarInterleavedGeojsonLayers(state),
  });
}

function ensureSouthPolarCapOverlayLoaded(state) {
  if (!state || state.loadPromise) {
    return;
  }

  state.loadPromise = loadSouthPolarCap()
    .then((southCap) => {
      if (state.destroyed) {
        return;
      }
      state.southPolarCapData = southCap;
      updateSouthPolarInterleavedGeojsonOverlay(state);
      updateSouthPolarCapOverlay(state);
      updatePolarDebugOverlay(document.querySelector(".polar-debug"), state.map, state);
    })
    .catch((error) => {
      state.loadError = error;
      console.warn("[polar-cap] Failed to build south polar cap overlay.", error);
    });
}

function ensureSouthPolarLandLinesLoaded(state) {
  if (!state || state.landLineLoadPromise) {
    return;
  }

  state.landLineLoadPromise = loadSouthPolarLandLines()
    .then((landLineData) => {
      if (state.destroyed) {
        return;
      }
      state.southPolarLandLineData = landLineData;
      updateSouthPolarInterleavedGeojsonOverlay(state);
      updateSouthPolarCapOverlay(state);
      updatePolarDebugOverlay(document.querySelector(".polar-debug"), state.map, state);
    })
    .catch((error) => {
      state.landLineLoadError = error;
      console.warn("[polar-land-lines] Failed to build polar land lines.", error);
    });
}

function ensurePolarGraticulesLoaded(state) {
  if (!state || state.graticulesLoadPromise) {
    return;
  }

  state.graticulesLoadPromise = loadPolarGraticules()
    .then((polarGraticulesData) => {
      if (state.destroyed) {
        return;
      }
      state.polarGraticulesData = polarGraticulesData;
      updateSouthPolarInterleavedGeojsonOverlay(state);
      updateSouthPolarCapOverlay(state);
      updatePolarDebugOverlay(document.querySelector(".polar-debug"), state.map, state);
    })
    .catch((error) => {
      state.graticulesLoadError = error;
      console.warn("[polar-graticules] Failed to build polar graticules overlay.", error);
    });
}

async function attachAustraliaOutlineLayer(map, layerState, manifest) {
  for (let index = 0; index < AUSTRALIA_TILE_IDS.length; index += 1) {
    const lineLayerId = AUSTRALIA_OUTLINE_LINE_LAYER_IDS[index];
    const sourceId = AUSTRALIA_FILL_SOURCE_IDS[index];

    if (map.getLayer(lineLayerId)) {
      map.removeLayer(lineLayerId);
    }

    if (!map.getSource(sourceId)) {
      continue;
    }

    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      layout: {
        visibility: getInheritedLayoutVisibility(layerState, "australia"),
      },
      paint: {
        "line-color": getLayerStyleValue(layerState, "australia", "lineColor", DEFAULT_OUTLINE_LINE_COLOR),
        "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "australia", "lineWeight", 1)),
        "line-opacity": Number(getLayerStyleValue(layerState, "australia", "lineOpacity", 100)) / 100,
      },
    });
  }
}

async function attachAustraliaFillLayer(map, layerState, manifest) {
  for (let index = 0; index < AUSTRALIA_TILE_IDS.length; index += 1) {
    const sourceId = AUSTRALIA_FILL_SOURCE_IDS[index];
    const fillLayerId = AUSTRALIA_FILL_LAYER_IDS[index];

    if (map.getSource(sourceId)) {
      if (map.getLayer(fillLayerId)) {
        map.removeLayer(fillLayerId);
      }
      map.removeSource(sourceId);
    }

    map.addSource(sourceId, {
      type: "geojson",
      data: AUSTRALIA_FILL_VECTOR_URLS[index],
    });

    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      layout: {
        visibility: getInheritedLayoutVisibility(layerState, "australia"),
      },
      paint: {
        "fill-color": getLayerStyleValue(layerState, "australia", "fillColor", DEFAULT_LAND_FILL_COLOR),
        "fill-opacity": Number(getLayerStyleValue(layerState, "australia", "fillOpacity", 100)) / 100,
      },
    });
  }
}


async function attachVictoriaOutlineLayers(map, layerState, manifest) {
  for (let index = 0; index < VICTORIA_TILE_IDS.length; index += 1) {
    const sourceId = VICTORIA_OUTLINE_SOURCE_IDS[index];
    const lineLayerId = VICTORIA_OUTLINE_LINE_LAYER_IDS[index];

    if (map.getSource(sourceId)) {
      if (map.getLayer(lineLayerId)) {
        map.removeLayer(lineLayerId);
      }
      map.removeSource(sourceId);
    }

    map.addSource(sourceId, createRuntimeVectorSourceSpec({
      manifest,
      pmtilesId: VICTORIA_OUTLINE_PMTILES_IDS[index],
      atlasVectorTileId: `atlas-victoria-outline-tiles-${VICTORIA_TILE_IDS[index]}`,
    }));

    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      "source-layer": VICTORIA_OUTLINE_TILE_SOURCE_LAYER,
      layout: {
        visibility: getLayoutVisibility(layerState, "victoria"),
      },
      paint: {
        "line-color": getLayerStyleValue(layerState, "victoria", "lineColor", DEFAULT_OUTLINE_LINE_COLOR),
        "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "victoria", "lineWeight", 1)),
        "line-opacity": Number(getLayerStyleValue(layerState, "victoria", "lineOpacity", 100)) / 100,
      },
    });
  }
}

async function attachVictoriaFillLayers(map, layerState, manifest) {
  if (map.getSource(VICTORIA_FILL_SOURCE_ID)) {
    if (map.getLayer(VICTORIA_FILL_LAYER_ID)) {
      map.removeLayer(VICTORIA_FILL_LAYER_ID);
    }
    map.removeSource(VICTORIA_FILL_SOURCE_ID);
  }

  map.addSource(VICTORIA_FILL_SOURCE_ID, {
    type: "geojson",
    data: VICTORIA_FILL_VECTOR_URL,
  });

  map.addLayer({
    id: VICTORIA_FILL_LAYER_ID,
    type: "fill",
    source: VICTORIA_FILL_SOURCE_ID,
    layout: {
      visibility: getLayoutVisibility(layerState, "victoria"),
    },
    paint: {
      "fill-color": getLayerStyleValue(layerState, "victoria", "fillColor", DEFAULT_LAND_FILL_COLOR),
      "fill-opacity": Number(getLayerStyleValue(layerState, "victoria", "fillOpacity", 100)) / 100,
    },
  });
}


async function attachOlympicsLayers(map, layerState) {
  if (map.getSource(OLYMPICS_SOURCE_ID)) {
    [OLYMPICS_GOLD_LAYER_ID, OLYMPICS_SILVER_LAYER_ID, OLYMPICS_BRONZE_LAYER_ID].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
    map.removeSource(OLYMPICS_SOURCE_ID);
  }

  map.addSource(OLYMPICS_SOURCE_ID, {
    type: "geojson",
    data: getOlympicsVectorUrl(layerState),
  });

  [
    ["olympicsGold", OLYMPICS_GOLD_LAYER_ID, "gold", "#D4AF37", "#FFF6D5"],
    ["olympicsSilver", OLYMPICS_SILVER_LAYER_ID, "silver", "#B8C2CC", "#F8FBFF"],
    ["olympicsBronze", OLYMPICS_BRONZE_LAYER_ID, "bronze", "#B87333", "#F6DFC7"],
  ].forEach(([filterLayerId, layerId, medal, color, stroke]) => {
    map.addLayer({
      id: layerId,
      type: "circle",
      source: OLYMPICS_SOURCE_ID,
      filter: ["==", ["get", "medal"], medal],
      layout: {
        visibility: getInheritedLayoutVisibility(layerState, filterLayerId),
      },
      paint: {
        "circle-radius": getOlympicsPointRadius(layerState),
        "circle-color": color,
        "circle-opacity": 0.92,
        "circle-stroke-color": stroke,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.95,
      },
    });
  });
}

function buildLineWidthExpression(weightPx) {
  return Math.max(0, Number(weightPx) || 0);
}


async function attachRomanEmpireLayer(map, layerState) {
  const romanFeatureCollection = await loadRomanEmpireVector();
  attachEmpireLayer(map, {
    layerState,
    layerId: "roman",
    sourceId: ROMAN_SOURCE_ID,
    fillSourceId: ROMAN_FILL_SOURCE_ID,
    fillSourceLayer: ROMAN_FILL_SOURCE_LAYER,
    fillLayerId: ROMAN_FILL_LAYER_ID,
    lineLayerId: ROMAN_LINE_LAYER_ID,
    featureCollection: romanFeatureCollection,
    fallbackColor: "#8c6a2a",
    lineColor: "#c89a42",
  });
}

function attachEmpireLayer(map, {
  layerState,
  layerId,
  sourceId,
  fillSourceId = sourceId,
  fillSourceLayer = null,
  fillLayerId,
  lineLayerId,
  featureCollection,
  fallbackColor,
  lineColor,
}) {
  const outlineSourceId = `${sourceId}-outline`;
  const outlineSourceLayer = `${layerId}-outline`;

  if (map.getSource(sourceId)) {
    if (map.getLayer(lineLayerId)) {
      map.removeLayer(lineLayerId);
    }
    if (map.getLayer(fillLayerId)) {
      map.removeLayer(fillLayerId);
    }
    if (map.getSource(outlineSourceId)) {
      map.removeSource(outlineSourceId);
    }
    if (fillSourceId !== sourceId && map.getSource(fillSourceId)) {
      map.removeSource(fillSourceId);
    }
    map.removeSource(sourceId);
  }

  map.addSource(sourceId, {
    type: "geojson",
    data: featureCollection,
  });

  if (fillSourceId !== sourceId) {
    map.addSource(fillSourceId, createGeojsonVectorSourceSpec(fillSourceId));
  }

  map.addLayer({
    id: fillLayerId,
    type: "fill",
    source: fillSourceId,
    ...(fillSourceLayer ? { "source-layer": fillSourceLayer } : {}),
    layout: {
      visibility: getInheritedLayoutVisibility(layerState, layerId),
    },
    paint: {
      "fill-color": getLayerStyleValue(layerState, layerId, "fillColor", fallbackColor),
      "fill-opacity": Number(getLayerStyleValue(layerState, layerId, "fillOpacity", 100)) / 100,
    },
  });

  registerGeojsonVectorTileSource({
    id: outlineSourceId,
    data: buildEmpireOutlineFeatureCollection(featureCollection),
    sourceLayer: outlineSourceLayer,
  });
  map.addSource(outlineSourceId, createGeojsonVectorSourceSpec(outlineSourceId));

  map.addLayer({
    id: lineLayerId,
    type: "line",
    source: outlineSourceId,
    "source-layer": outlineSourceLayer,
    layout: {
      visibility: getInheritedLayoutVisibility(layerState, layerId),
    },
    paint: {
      "line-color": getLayerStyleValue(layerState, layerId, "lineColor", lineColor),
      "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, layerId, "lineWeight", 1)),
      "line-opacity": Number(getLayerStyleValue(layerState, layerId, "lineOpacity", 100)) / 100,
    },
  });
}

async function attachMongolEmpireLayer(map, layerState) {
  const mongolFeatureCollection = await loadMongolEmpireVector();
  attachEmpireLayer(map, {
    layerState,
    layerId: "mongol",
    sourceId: MONGOL_SOURCE_ID,
    fillSourceId: MONGOL_FILL_SOURCE_ID,
    fillSourceLayer: MONGOL_FILL_SOURCE_LAYER,
    fillLayerId: MONGOL_FILL_LAYER_ID,
    lineLayerId: MONGOL_LINE_LAYER_ID,
    featureCollection: mongolFeatureCollection,
    fallbackColor: "#b85c38",
    lineColor: "#d96f44",
  });
}

async function attachBritishEmpireLayer(map, layerState) {
  const britishFeatureCollection = await loadBritishEmpireVector();
  attachEmpireLayer(map, {
    layerState,
    layerId: "british",
    sourceId: BRITISH_SOURCE_ID,
    fillSourceId: BRITISH_FILL_SOURCE_ID,
    fillSourceLayer: BRITISH_FILL_SOURCE_LAYER,
    fillLayerId: BRITISH_FILL_LAYER_ID,
    lineLayerId: BRITISH_LINE_LAYER_ID,
    featureCollection: britishFeatureCollection,
    fallbackColor: "#c84b31",
    lineColor: "#f07a58",
  });
}

function createMapInstance({ container, manifest = [], viewState, initialLayerState = {}, getOrderedChildRowIds = null }) {
  if (!container) {
    return null;
  }

  // Use MapLibre from CDN
  const maplibregl = window.maplibregl;

  ensureProtocol(manifest);
  const layerState = structuredClone(initialLayerState);
  const scaleOverlay = createScaleOverlay(container);
  const compassOverlay = createCompassOverlay(container);
  const polarDebugOverlay = LEGACY_POLAR_OVERLAY_ENABLED ? createPolarDebugOverlay(container) : null;
  const freshInterleavedDebugOverlay = FRESH_INTERLEAVED_OVERLAY_ENABLED ? createFreshInterleavedDebugOverlay(container) : null;
  const southPolarCapOverlay = createSouthPolarCapOverlayState(layerState);
  const freshInterleavedOverlay = createFreshInterleavedOverlayState(layerState, getOrderedChildRowIds);
  southPolarCapOverlay.backendEntries = createBuiltInPolarBackendEntries();
  let scaleHideTimeout = null;

  const updatePolarDebug = () => {
    updatePolarDebugOverlay(polarDebugOverlay, map, southPolarCapOverlay);
  };
  const updateFreshInterleavedDebug = () => {
    updateFreshInterleavedDebugOverlay(freshInterleavedDebugOverlay, map, freshInterleavedOverlay);
  };
  const refreshFreshInterleavedOverlay = () => {
    updateFreshInterleavedOverlay(freshInterleavedOverlay);
    updateFreshInterleavedDebug();
  };

  function clearScaleHideTimeout() {
    if (scaleHideTimeout) {
      window.clearTimeout(scaleHideTimeout);
      scaleHideTimeout = null;
    }
  }

  function showScaleOverlay() {
    clearScaleHideTimeout();
    updateScaleOverlay(map, scaleOverlay);
    scaleOverlay.classList.add("is-visible");
  }

  function hideScaleOverlaySoon() {
    clearScaleHideTimeout();
    scaleHideTimeout = window.setTimeout(() => {
      scaleOverlay.classList.remove("is-visible");
      scaleHideTimeout = null;
    }, SCALE_BAR_HIDE_DELAY_MS);
  }

  const initialZoom = viewState?.projectionId === "globe"
    ? getInitialGlobeZoom(container, viewState.zoom)
    : viewState.zoom;

  const map = new maplibregl.Map({
    container,
    style: buildStyle(layerState),
    center: [viewState.center.longitude, viewState.center.latitude],
    zoom: initialZoom,
    minZoom: 0.7,
    bearing: viewState.bearing,
    pitch: viewState.pitch,
    attributionControl: false,
  });
  southPolarCapOverlay.map = map;
  southPolarCapOverlay.getOrderedChildRowIds = getOrderedChildRowIds;
  freshInterleavedOverlay.map = map;
  if (LEGACY_POLAR_OVERLAY_ENABLED) {
    southPolarCapOverlay.deckOverlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    southPolarCapOverlay.interleavedDeckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });
    if (!SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED) {
      map.addControl(southPolarCapOverlay.deckOverlay);
    }
    if (SOUTH_POLAR_INTERLEAVED_GEOJSON_TEST_ENABLED) {
      map.addControl(southPolarCapOverlay.interleavedDeckOverlay);
    }
    ensureSouthPolarCapOverlayLoaded(southPolarCapOverlay);
    ensureSouthPolarLandLinesLoaded(southPolarCapOverlay);
    ensurePolarGraticulesLoaded(southPolarCapOverlay);
  }
  if (FRESH_INTERLEAVED_OVERLAY_ENABLED) {
    freshInterleavedOverlay.overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });
    map.addControl(freshInterleavedOverlay.overlay);
    updateFreshInterleavedOverlay(freshInterleavedOverlay);
    ensureFreshInterleavedSourcesLoaded(freshInterleavedOverlay, () => {
      updateFreshInterleavedOverlay(freshInterleavedOverlay);
      updateFreshInterleavedDebug();
    });
  }
  updatePolarDebug();
  updateFreshInterleavedDebug();
  map.on("error", (event) => {
    const message = event?.error?.message ?? event?.error?.toString?.() ?? "unknown";
    const url = String(
      event?.tile?.url ?? event?.source?.url ?? event?.source?.data ?? ""
    );
    const combined = message + " " + url;

    // Suppress known-harmless errors:
    if (
      // Local dev PMTiles files that aren't present
      combined.includes("australia-land-") ||
      combined.includes("victoria-land") ||
      // Any PMTiles fetch/parse failure (wrong magic = file not ready yet)
      combined.includes("Wrong magic number for PMTiles") ||
      combined.includes(".pmtiles") ||
      combined.includes("/pmtiles/") ||
      // Tile fetch failures (network, 404s on local dev)
      combined.includes("Failed to fetch") ||
      message.includes("404") ||
      // Source-layer not found in a vector tile (harmless if tiles are still uploading)
      message.includes("does not exist in the map's style") ||
      message.includes("source-layer")
    ) {
      return;
    }

    console.error("[MapLibre]", message, event?.error);
  });
  map.on("movestart", () => {
    showScaleOverlay();
    updateCompassOverlay(map, compassOverlay);
    updatePolarDebug();
    updateFreshInterleavedDebug();
  });
  map.on("move", () => {
    showScaleOverlay();
    updateCompassOverlay(map, compassOverlay);
    updatePolarDebug();
    updateFreshInterleavedDebug();
  });
  map.on("moveend", () => {
    showScaleOverlay();
    updateCompassOverlay(map, compassOverlay);
    updatePolarDebug();
    updateFreshInterleavedDebug();
    hideScaleOverlaySoon();
  });
  map.on("resize", () => {
    if (scaleOverlay.classList.contains("is-visible")) {
      updateScaleOverlay(map, scaleOverlay);
    }
    updateCompassOverlay(map, compassOverlay);
    updatePolarDebug();
    updateFreshInterleavedDebug();
  });
  compassOverlay.addEventListener("click", () => {
    map.easeTo({ bearing: 0 });
  });
  map.on("load", () => {
    updateCompassOverlay(map, compassOverlay);
    updateSouthPolarInterleavedGeojsonOverlay(southPolarCapOverlay);
    updateSouthPolarCapOverlay(southPolarCapOverlay);
    updateFreshInterleavedOverlay(freshInterleavedOverlay);
    updatePolarDebug();
    updateFreshInterleavedDebug();
    // Phase 1: All visible-by-default layers — load immediately in parallel
    // Note: water, land, and graticules are already in the initial style
    // and start loading before this event fires. attachStandardLayer's source
    // guard skips them here automatically.
    void (async () => {
      try {
        await Promise.all(
          STANDARD_LAYER_REGISTRY
            .filter((entry) => !entry.deferred)
            .map((entry) => attachStandardLayer(map, layerState, manifest, entry))
        );

        // Upgrade any layers that loaded with a fast initialUrl only after the
        // primary visible layers have attached, so the detailed land swap does
        // not compete with first-pass visible layer loading.
        LOCAL_LAYERS.filter((l) => l.source.initialUrl).forEach((l) => {
          if (l.id === "land") {
            return;
          }
          map.getSource(localLayerSourceId(l.id))?.setData(l.source.url);
        });

        applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
        updateFreshInterleavedOverlay(freshInterleavedOverlay);
        updateFreshInterleavedDebug();
      } catch (error) {
        console.error("Failed to attach primary layers.", error);
      }
    })();

    // Phase 2: Deferred + empire layers — run at idle time so Phase 1 stays
    // interactive. Also prewarms atlas-vector tile indices so GeoJSONVT
    // construction doesn't block the main thread on first tile request.
    const loadDeferredLayers = async () => {
      try {
        // Prewarm all registered atlas-vector sources before tiles are needed
        LOCAL_LAYERS
          .filter((l) => l.source.kind === "atlas-vector")
          .forEach((l) => prewarmTileSource(localLayerTileSourceId(l.id)));
        // Deferred standard Earth layers first.
        await Promise.all(
          STANDARD_LAYER_REGISTRY
            .filter((entry) => entry.deferred)
            .map((entry) => attachStandardLayer(map, layerState, manifest, entry))
        );

        applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
        updateFreshInterleavedOverlay(freshInterleavedOverlay);
        updateFreshInterleavedDebug();
      } catch (error) {
        console.error("Failed to attach deferred layers.", error);
      }
    };

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => void loadDeferredLayers(), { timeout: 5000 });
    } else {
      window.setTimeout(() => void loadDeferredLayers(), 2000);
    }
    scheduleEarthLandQualityUpgrade(freshInterleavedOverlay, map, refreshFreshInterleavedOverlay);
  });

  function getDynamicSourceLayerProp(layerId) {
    const sourceId = `dynamic-${layerId}`;
    const candidates = [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-circle`];
    const parentLayer = candidates
      .map((candidateId) => map.getLayer(candidateId))
      .find(Boolean);
    const sourceLayer = parentLayer?.["source-layer"] ?? parentLayer?.sourceLayer ?? null;
    return sourceLayer ? { "source-layer": sourceLayer } : {};
  }

  function normalizeDynamicGeometryTypes(geometryTypes = [], geometryType = null, style = null) {
    const source = Array.isArray(geometryTypes) && geometryTypes.length
      ? geometryTypes
      : [geometryType ?? style?.renderType ?? null];
    const normalized = source.map((value) => {
      if (value === "point") return "point";
      if (value === "line") return "line";
      if (value === "polygon" || value === "area") return "polygon";
      return null;
    }).filter(Boolean);
    return ["point", "line", "polygon"].filter((family) => normalized.includes(family));
  }

  function upsertDynamicPolarLineBackend({
    layerId,
    geojson,
    geometryTypes,
    featureFilter = null,
    defaultColor = "#3498db",
    defaultOpacity = 90,
    defaultWeight = 2,
  }) {
    const canRenderLinework = geometryTypes.includes("line") || geometryTypes.includes("polygon");
    if (!layerId || !canRenderLinework || !geojson) {
      return;
    }

    const lineData = geometryTypes.includes("line")
      ? prepareFeatureCollectionForPolarRendering(geojson, {
        geometryFamily: "line",
        mode: POLAR_RENDER_MODES.SOUTH,
        visibleLatitude: POLAR_CAP_VISIBLE_LATITUDE,
      })
      : preparePolygonBoundaryFeatureCollectionForPolarRendering(geojson, {
        mode: POLAR_RENDER_MODES.SOUTH,
        visibleLatitude: POLAR_CAP_VISIBLE_LATITUDE,
      });
    if (featureFilter) {
      lineData.features = lineData.features.filter((feature) => evaluateMaplibreFilter(featureFilter, feature));
    }

    const entryId = `${layerId}::line`;
    southPolarCapOverlay.backendEntries = southPolarCapOverlay.backendEntries
      .filter((entry) => entry?.id !== entryId);
    if (lineData.features.length) {
      southPolarCapOverlay.backendEntries.push({
        id: entryId,
        orderKey: layerId,
        stackOrder: 0,
        mode: POLAR_RENDER_MODES.SOUTH,
        runtimeTargetIds: [layerId, entryId],
        kind: "line",
        visibilityTargetId: entryId,
        styleTargetId: layerId,
        colorStyleKey: "lineColor",
        opacityStyleKey: "lineOpacity",
        weightStyleKey: "lineWeight",
        defaultColor,
        defaultOpacity,
        defaultWeight,
        getData: () => lineData,
      });
    }
    updateSouthPolarCapOverlay(southPolarCapOverlay);
  }

  function setDynamicLayerFeatureFilter(layerId, featureFilter) {
    if (!layerId) {
      return;
    }

    const sourceId = `dynamic-${layerId}`;
    const layerIds = [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-circle`];
    let applied = false;

    layerIds.forEach((mapLayerId) => {
      if (!map.getLayer(mapLayerId)) {
        return;
      }
      map.setFilter(mapLayerId, featureFilter ?? null);
      applied = true;
    });

    return applied;
  }

  function attachDynamicLayer(layerId, geojson, tilesUrl, style, { sourceLayerId = null, featureFilter = null, geometryTypes = [], geometryType = null, visible = true, parentRowId = null } = {}) {
    if (!layerId) {
      return;
    }

    const resolvedGeometryTypes = normalizeDynamicGeometryTypes(geometryTypes, geometryType, style);

    if (!sourceLayerId || !featureFilter) {
      const sourceId = `dynamic-${layerId}`;
      if (map.getSource(sourceId)) return;

      const color = style?.color ?? "#e74c3c";
      const opacity = (style?.opacity ?? 80) / 100;
      if (tilesUrl) {
        map.addSource(sourceId, { type: "vector", url: `pmtiles://${tilesUrl}` });
      } else {
        map.addSource(sourceId, { type: "geojson", data: geojson });
      }

      const sourceLayer = tilesUrl ? (sourceLayerId || "layer") : undefined;
      const sourceLayerProp = tilesUrl ? { "source-layer": sourceLayer } : {};

      if (resolvedGeometryTypes.includes("polygon")) {
        map.addLayer({ id: `${sourceId}-fill`, type: "fill", source: sourceId, ...sourceLayerProp,
          paint: { "fill-color": color, "fill-opacity": opacity } });
      }
      if (resolvedGeometryTypes.includes("line") || resolvedGeometryTypes.includes("polygon")) {
        map.addLayer({ id: `${sourceId}-line`, type: "line", source: sourceId, ...sourceLayerProp,
          paint: { "line-color": color, "line-opacity": opacity, "line-width": style?.weight ?? 2 } });
      }
      if (resolvedGeometryTypes.includes("point")) {
        map.addLayer({ id: `${sourceId}-circle`, type: "circle", source: sourceId, ...sourceLayerProp,
          paint: {
            "circle-color": color,
            "circle-opacity": opacity,
            "circle-radius": style?.radius ?? 6,
            "circle-stroke-color": style?.lineColor ?? "#ffffff",
            "circle-stroke-opacity": (style?.lineOpacity ?? 100) / 100,
            "circle-stroke-width": style?.lineWeight ?? 1,
          } });
      }
      if (LEGACY_POLAR_OVERLAY_ENABLED && !tilesUrl) {
        upsertDynamicPolarLineBackend({
          layerId,
          geojson,
          geometryTypes: resolvedGeometryTypes,
          defaultColor: style?.lineColor ?? style?.color ?? "#3498db",
          defaultOpacity: style?.lineOpacity ?? style?.opacity ?? 80,
          defaultWeight: style?.lineWeight ?? style?.weight ?? 2,
        });
      }

      const stored = layerState[layerId];
      if (stored) {
        reapplyStoredDynamicRuntimeStyles(layerId, map, layerState);
        applyRuntimeTargetVisibility(layerId, map, layerState);
        ["fill", "line", "point-fill", "point-stroke"].forEach((subtarget) => {
          applyRuntimeTargetVisibility(`${layerId}::${subtarget}`, map, layerState);
        });
      } else if (resolvedGeometryTypes.includes("point")) {
        applyDynamicPointLayerState(layerId, map, layerState);
      }
      updateFreshInterleavedOverlay(freshInterleavedOverlay);
      updateFreshInterleavedDebug();
      return;
    }

    const derivedSourceId = `dynamic-${sourceLayerId}`;
    if (!map.getSource(derivedSourceId)) {
      console.warn(`[filter] Cannot attach derived layer "${layerId}" — parent source "${derivedSourceId}" not found on map`);
      return;
    }
    const fill = `dynamic-${layerId}-fill`;
    const line = `dynamic-${layerId}-line`;
    const circle = `dynamic-${layerId}-circle`;
    [fill, line, circle].forEach((derivedLayerId) => {
      if (map.getLayer(derivedLayerId)) {
        map.removeLayer(derivedLayerId);
      }
    });

    if (!layerState[layerId] || typeof layerState[layerId] !== "object") {
      layerState[layerId] = {};
    }
    if (typeof layerState[layerId].visible !== "boolean") {
      layerState[layerId].visible = visible;
    }
    if (layerState[layerId].parentRowId === undefined && parentRowId !== null) {
      layerState[layerId].parentRowId = parentRowId;
    }

    const sourceLayerProp = getDynamicSourceLayerProp(sourceLayerId);
    const filterExpression = featureFilter;

    if (resolvedGeometryTypes.includes("polygon")) {
      map.addLayer({
        id: fill,
        type: "fill",
        source: derivedSourceId,
        ...sourceLayerProp,
        ...(filterExpression ? { filter: filterExpression } : {}),
        layout: { visibility: getInheritedLayoutVisibility(layerState, `${layerId}::fill`) },
        paint: {
          "fill-color": getLayerStyleValue(layerState, layerId, "fillColor", "#2ecc71"),
          "fill-opacity": Number(getLayerStyleValue(layerState, layerId, "fillOpacity", 60)) / 100,
        },
      });
    }
    if (resolvedGeometryTypes.includes("line") || resolvedGeometryTypes.includes("polygon")) {
      map.addLayer({
        id: line,
        type: "line",
        source: derivedSourceId,
        ...sourceLayerProp,
        ...(filterExpression ? { filter: filterExpression } : {}),
        layout: { visibility: getInheritedLayoutVisibility(layerState, `${layerId}::line`) },
        paint: {
          "line-color": getLayerStyleValue(layerState, layerId, "lineColor", resolvedGeometryTypes.includes("line") ? "#3498db" : "#1f7a45"),
          "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, layerId, "lineWeight", 2)),
          "line-opacity": Number(getLayerStyleValue(layerState, layerId, "lineOpacity", 90)) / 100,
        },
      });
    }
    if (resolvedGeometryTypes.includes("point")) {
      map.addLayer({
        id: circle,
        type: "circle",
        source: derivedSourceId,
        ...sourceLayerProp,
        ...(filterExpression ? { filter: filterExpression } : {}),
        layout: { visibility: getInheritedLayoutVisibility(layerState, `${layerId}::point-fill`) },
        paint: {
          "circle-color": getLayerStyleValue(layerState, layerId, "pointColor", "#e74c3c"),
          "circle-opacity": Number(getLayerStyleValue(layerState, layerId, "pointOpacity", 80)) / 100,
          "circle-radius": Number(getLayerStyleValue(layerState, layerId, "pointRadius", 6)),
          "circle-stroke-color": getLayerStyleValue(layerState, layerId, "lineColor", "#ffffff"),
          "circle-stroke-opacity": Number(getLayerStyleValue(layerState, layerId, "lineOpacity", 100)) / 100,
          "circle-stroke-width": Number(getLayerStyleValue(layerState, layerId, "lineWeight", 1)),
        },
      });
    }
    const parentSourceData = map.getSource(derivedSourceId)?._data;
    if (LEGACY_POLAR_OVERLAY_ENABLED && parentSourceData) {
      upsertDynamicPolarLineBackend({
        layerId,
        geojson: parentSourceData,
        geometryTypes: resolvedGeometryTypes,
        featureFilter,
        defaultColor: getLayerStyleValue(layerState, layerId, "lineColor", resolvedGeometryTypes.includes("line") ? "#3498db" : "#1f7a45"),
        defaultOpacity: Number(getLayerStyleValue(layerState, layerId, "lineOpacity", 90)),
        defaultWeight: Number(getLayerStyleValue(layerState, layerId, "lineWeight", 2)),
      });
    }

    applyRuntimeTargetVisibility(layerId, map, layerState);
    ["fill", "line", "point-fill", "point-stroke"].forEach((subtarget) => {
      applyRuntimeTargetVisibility(`${layerId}::${subtarget}`, map, layerState);
    });
    updateFreshInterleavedOverlay(freshInterleavedOverlay);
    updateFreshInterleavedDebug();
  }

  return {
    destroy() {
      southPolarCapOverlay.destroyed = true;
      freshInterleavedOverlay.destroyed = true;
      if (southPolarCapOverlay.deckOverlay?._map) {
        map.removeControl(southPolarCapOverlay.deckOverlay);
      }
      if (southPolarCapOverlay.interleavedDeckOverlay?._map) {
        map.removeControl(southPolarCapOverlay.interleavedDeckOverlay);
      }
      if (freshInterleavedOverlay.overlay?._map) {
        map.removeControl(freshInterleavedOverlay.overlay);
      }
      clearScaleHideTimeout();
      scaleOverlay.remove();
      compassOverlay.remove();
      polarDebugOverlay?.remove();
      freshInterleavedDebugOverlay?.remove();
      map.remove();
    },
    whenStyleReady(callback) {
      if (typeof callback !== "function") {
        return;
      }
      if (map.isStyleLoaded()) {
        callback();
        return;
      }
      map.once("style.load", callback);
    },
    getMap() {
      return map;
    },
    reorderLayerGroup(parentId, orderedLayerIds) {
      if (layerState[parentId]) {
        layerState[parentId].rowOrder = orderedLayerIds;
      }
      applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
      if (parentId === "earth") {
        updateSouthPolarCapOverlay(southPolarCapOverlay);
        updateSouthPolarInterleavedGeojsonOverlay(southPolarCapOverlay);
      }
      updateFreshInterleavedOverlay(freshInterleavedOverlay);
      updateFreshInterleavedDebug();
    },
    reapplyFullOrder() {
      applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
      updateSouthPolarCapOverlay(southPolarCapOverlay);
      updateSouthPolarInterleavedGeojsonOverlay(southPolarCapOverlay);
      updateFreshInterleavedOverlay(freshInterleavedOverlay);
      updateFreshInterleavedDebug();
    },
    reapplyRowSubtreeOrder(rowId) {
      applyRowSubtreeOrder(map, layerState, rowId, getOrderedChildRowIds);
      updateSouthPolarCapOverlay(southPolarCapOverlay);
      updateSouthPolarInterleavedGeojsonOverlay(southPolarCapOverlay);
      updateFreshInterleavedOverlay(freshInterleavedOverlay);
      updateFreshInterleavedDebug();
    },
    setLayerStyleValue(layerId, key, value) {
      if (!layerState[layerId] || typeof layerState[layerId] !== "object") {
        layerState[layerId] = {};
      }

      layerState[layerId][key] = value;

      // For runtimeTarget subtargets (e.g. "uid::fill"), also mirror the value into
      // the base layer state so that re-attach within the same session reads it correctly.
      if (key !== "visible") {
        const subtargetMatch = /^(.+)::(fill|line|point-fill|point-stroke)$/.exec(layerId);
        if (subtargetMatch) {
          const baseId = subtargetMatch[1];
          if (!layerState[baseId]) layerState[baseId] = {};
          layerState[baseId][key] = value;
        }
      }

      // ── Registry-driven layers (everything except ocean) ─────────────────────
      const registryEntry = findRegistryEntry(layerId);
      if (registryEntry && applyRegistryStyleValue(registryEntry, map, layerState, key, value) && key !== "visible") {
        if (shouldRefreshSouthPolarOverlay(southPolarCapOverlay, layerId)) {
          updateSouthPolarCapOverlay(southPolarCapOverlay);
        }
        refreshFreshInterleavedOverlay();
        return;
      }

      // ── Runtime-target-driven styles and special background targets ────────
      const runtimeStyleApplied = applyRuntimeTargetStyle(layerId, key, value, map, layerState);
      if (runtimeStyleApplied) {
        if (shouldRefreshSouthPolarOverlay(southPolarCapOverlay, layerId)) {
          updateSouthPolarCapOverlay(southPolarCapOverlay);
        }
        refreshFreshInterleavedOverlay();
        return;
      }

      // ── Group parent visibility cascades ─────────────────────────────────
      if (key === "visible") {
        applyRuntimeTargetVisibility(layerId, map, layerState);
        const rowStateKey = findRowStateKeyForRuntimeTarget(layerState, layerId);
        getDescendantRuntimeTargetIds(layerState, rowStateKey).forEach((runtimeTargetId) => {
          applyRuntimeTargetVisibility(runtimeTargetId, map, layerState);
        });
        if (shouldRefreshSouthPolarOverlay(southPolarCapOverlay, layerId)) {
          updateSouthPolarCapOverlay(southPolarCapOverlay);
        }
        refreshFreshInterleavedOverlay();
        return;
      }

      // ── Dynamic layers (Supabase-uploaded: polygon, line, or point) ─────────
      {
        const dynSource = `dynamic-${layerId}`;
        if (map.getSource(dynSource)) {
          const dynFill   = `${dynSource}-fill`;
          const dynLine   = `${dynSource}-line`;
          const dynCircle = `${dynSource}-circle`;
          if (key === "visible") {
            const vis = value ? "visible" : "none";
            [dynFill, dynLine, dynCircle].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis); });
          }
          refreshFreshInterleavedOverlay();
          return;
        }
      }

      // ── Olympics special handling for data refresh ─────────────────────────
      if (layerId === "olympics" && key === "selectedYear") {
        const olympicsSource = map.getSource(OLYMPICS_SOURCE_ID);
        if (olympicsSource && "setData" in olympicsSource) {
          olympicsSource.setData(getOlympicsVectorUrl(layerState));
        }
      }
      refreshFreshInterleavedOverlay();
    },
    attachDynamicLayer(layerId, geojson, tilesUrl, style, options) {
      attachDynamicLayer(layerId, geojson, tilesUrl, style, options);
    },
    setDynamicLayerFeatureFilter(layerId, featureFilter) {
      return setDynamicLayerFeatureFilter(layerId, featureFilter);
    },
    detachDynamicLayer(layerId) {
      const sourceId = `dynamic-${layerId}`;
      [`${sourceId}-circle`, `${sourceId}-fill`, `${sourceId}-line`].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      southPolarCapOverlay.backendEntries = southPolarCapOverlay.backendEntries
        .filter((entry) => entry?.id !== `${layerId}::line`);
      updateSouthPolarCapOverlay(southPolarCapOverlay);
      updateFreshInterleavedOverlay(freshInterleavedOverlay);
      updateFreshInterleavedDebug();
    },
  };
}

export { createMapInstance, isRealPmtilesUrl };
