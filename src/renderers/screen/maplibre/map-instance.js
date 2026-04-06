// MapLibre loaded from CDN - use global instead of import
// import maplibregl from "maplibre-gl";
// import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import polygonClipping from "polygon-clipping";
import {
  createGeojsonVectorSourceSpec,
  installAtlasVectorTileProtocol,
  registerGeojsonVectorTileSource,
} from "./vector-tiles.js";

let protocolInstalled = false;

// Track which layers have been loaded to prevent duplicate loading
const loadedLayers = new Set();
const OLYMPICS_SOURCE_ID = "atlas-olympics";
const OLYMPICS_GOLD_LAYER_ID = "atlas-olympics-gold";
const OLYMPICS_SILVER_LAYER_ID = "atlas-olympics-silver";
const OLYMPICS_BRONZE_LAYER_ID = "atlas-olympics-bronze";
const TRANSPORT_RAIL_SOURCE_ID = "atlas-transport-rail";
const TRANSPORT_RAIL_LINE_LAYER_ID = "atlas-transport-rail-line";
const TRANSPORT_RAIL_VECTOR_URL = "/data/transport/rail-sa.geojson";
const OSM_LAND_SOURCE_ID = "atlas-osm-land";
const OSM_LAND_TILE_SOURCE_ID = "atlas-osm-land-tiles";
const OSM_LAND_TILE_SOURCE_LAYER = "land-fill";
const OSM_LAND_FILL_LAYER_ID = "atlas-osm-land-fill";
const OSM_LAND_VECTOR_URL = "/data/world-atlas/land-50m.geojson";
const OSM_LAND_PMTILES_ID = "osm-land";
const OSM_OUTLINE_SOURCE_ID = "atlas-osm-outline";
const OSM_OUTLINE_TILE_SOURCE_ID = "atlas-osm-outline-tiles";
const OSM_OUTLINE_TILE_SOURCE_LAYER = "coastlines";
const OSM_OUTLINE_LINE_LAYER_ID = "atlas-osm-outline-line";
const OSM_OUTLINE_VECTOR_URL = "/data/world-atlas/osm-coastlines.smooth.geojson";
const OSM_OUTLINE_PMTILES_ID = "osm-outline";
const JAPAN_OUTLINE_SOURCE_ID = "atlas-japan-outline";
const JAPAN_OUTLINE_TILE_SOURCE_ID = "atlas-japan-outline-tiles";
const JAPAN_OUTLINE_TILE_SOURCE_LAYER = "coastlines";
const JAPAN_OUTLINE_LINE_LAYER_ID = "atlas-japan-outline-line";
const JAPAN_OUTLINE_PMTILES_ID = "osm-outline-japan";
const AUSTRALIA_TILE_IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const AUSTRALIA_OUTLINE_TILE_SOURCE_LAYER = "coastlines";
const AUSTRALIA_OUTLINE_SOURCE_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-outline-${tileId}`);
const AUSTRALIA_OUTLINE_TILE_SOURCE_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-outline-tiles-${tileId}`);
const AUSTRALIA_OUTLINE_LINE_LAYER_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-outline-line-${tileId}`);
const AUSTRALIA_OUTLINE_PMTILES_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `osm-outline-australia-${tileId}`);
const AUSTRALIA_FILL_SOURCE_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-fill-${tileId}`);
const AUSTRALIA_FILL_LAYER_IDS = AUSTRALIA_TILE_IDS.map((tileId) => `atlas-australia-fill-${tileId}`);
const AUSTRALIA_FILL_VECTOR_URLS = AUSTRALIA_TILE_IDS.map((tileId) => `/data/world-atlas/australia-land-${tileId}.geojson`);
const AFRICA_FILL_SOURCE_ID = "atlas-africa-fill";
const AFRICA_FILL_TILE_SOURCE_ID = "atlas-africa-fill-tiles";
const AFRICA_FILL_TILE_SOURCE_LAYER = "land-fill";
const AFRICA_FILL_LAYER_ID = "atlas-africa-fill";
const AFRICA_FILL_PMTILES_ID = "africa-fill";
const COUNTRIES_LAND_SOURCE_ID = "atlas-countries-land";
const COUNTRIES_LAND_FILL_LAYER_ID = "atlas-countries-land-fill";
const COUNTRIES_LAND_LINE_LAYER_ID = "atlas-countries-land-line";
const COUNTRIES_LAND_INITIAL_URL = "/data/world-atlas/land-110m.geojson";
const COUNTRIES_LAND_VECTOR_URL = "/data/world-atlas/countries-dissolved-land.geojson";
const VICTORIA_TILE_IDS = ["a", "b", "c", "d"];
const VICTORIA_FILL_SOURCE_ID = "atlas-victoria-fill";
const VICTORIA_FILL_LAYER_ID = "atlas-victoria-fill";
const VICTORIA_FILL_VECTOR_URL = "/data/world-atlas/victoria-land.geojson";
const VICTORIA_OUTLINE_TILE_SOURCE_LAYER = "coastlines";
const VICTORIA_OUTLINE_PMTILES_IDS = VICTORIA_TILE_IDS.map((tileId) => `osm-outline-victoria-${tileId}`);
const VICTORIA_OUTLINE_SOURCE_IDS = VICTORIA_TILE_IDS.map((tileId) => `atlas-victoria-outline-${tileId}`);
const VICTORIA_OUTLINE_LINE_LAYER_IDS = VICTORIA_TILE_IDS.map((tileId) => `atlas-victoria-outline-line-${tileId}`);
const GRATICULES_SOURCE_ID = "atlas-graticules";
const GRATICULES_TILE_SOURCE_ID = "atlas-graticules-tiles";
const GRATICULES_TILE_SOURCE_LAYER = "graticules";
const GRATICULES_LINE_LAYER_ID = "atlas-graticules-line";
const GRATICULES_VECTOR_URL = "/data/graticules/world-graticules-10deg.geojson";
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
const PARENT_LAYER_IDS = {
  ocean: "earth",
  australia: "earth",
  countriesLand: "earth",
  graticules: "earth",
  transportRail: "transport",
  olympicsGold: "olympics",
  olympicsSilver: "olympics",
  olympicsBronze: "olympics",
  roman: "empires",
  mongol: "empires",
  british: "empires",
};
const LINE_LAYER_IDS = {
  transportRail: TRANSPORT_RAIL_LINE_LAYER_ID,
  outline: OSM_OUTLINE_LINE_LAYER_ID,
  japan: JAPAN_OUTLINE_LINE_LAYER_ID,
  australia: AUSTRALIA_OUTLINE_LINE_LAYER_IDS[0],
  countriesLand: COUNTRIES_LAND_LINE_LAYER_ID,
  victoria: VICTORIA_OUTLINE_LINE_LAYER_IDS[0],
  ...EMPIRE_LINE_LAYER_IDS,
  graticules: GRATICULES_LINE_LAYER_ID,
};
const WATER_BACKGROUND_COLOR = { r: 44, g: 111, b: 146 };
const DEFAULT_LAND_FILL_COLOR = "#6EAA6E";
const DEFAULT_OCEAN_FILL_COLOR = "#2C6F92";
const DEFAULT_OUTLINE_LINE_COLOR = "#d9e4da";
const DEFAULT_GRATICULE_LINE_COLOR = "#8FA9BC";
const SCALE_BAR_MAX_WIDTH_PX = 120;
const SCALE_BAR_HIDE_DELAY_MS = 1200;
const SCALE_BAR_SCREEN_OFFSET_X = 18;
const SCALE_BAR_SCREEN_OFFSET_Y = 28;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;

function getFirstExistingLayerId(map, candidateIds) {
  return candidateIds.find((id) => map.getLayer(id)) ?? null;
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

  const leftPoint = {
    x: SCALE_BAR_SCREEN_OFFSET_X,
    y: Math.max(0, height - SCALE_BAR_SCREEN_OFFSET_Y),
  };
  const rightPoint = {
    x: Math.min(width, SCALE_BAR_SCREEN_OFFSET_X + SCALE_BAR_MAX_WIDTH_PX),
    y: leftPoint.y,
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

function getLogicalLayerBundles() {
  return {
    __root__: {
      transport: [TRANSPORT_RAIL_LINE_LAYER_ID],
      olympics: [OLYMPICS_GOLD_LAYER_ID, OLYMPICS_SILVER_LAYER_ID, OLYMPICS_BRONZE_LAYER_ID],
      empires: [
        ROMAN_FILL_LAYER_ID,
        ROMAN_LINE_LAYER_ID,
        MONGOL_FILL_LAYER_ID,
        MONGOL_LINE_LAYER_ID,
        BRITISH_FILL_LAYER_ID,
        BRITISH_LINE_LAYER_ID,
      ],
    },
    earth: {
      land: [OSM_LAND_FILL_LAYER_ID],
      outline: [OSM_OUTLINE_LINE_LAYER_ID],
      japan: [JAPAN_OUTLINE_LINE_LAYER_ID],
      australia: [...AUSTRALIA_FILL_LAYER_IDS, ...AUSTRALIA_OUTLINE_LINE_LAYER_IDS],
      africa: [AFRICA_FILL_LAYER_ID],
      "countries-land": [COUNTRIES_LAND_FILL_LAYER_ID, COUNTRIES_LAND_LINE_LAYER_ID],
      victoria: [VICTORIA_FILL_LAYER_ID, ...VICTORIA_OUTLINE_LINE_LAYER_IDS],
      graticules: [GRATICULES_LINE_LAYER_ID],
    },
    transport: {
      "transport-rail": [TRANSPORT_RAIL_LINE_LAYER_ID],
    },
    olympics: {
      "olympics-gold": [OLYMPICS_GOLD_LAYER_ID],
      "olympics-silver": [OLYMPICS_SILVER_LAYER_ID],
      "olympics-bronze": [OLYMPICS_BRONZE_LAYER_ID],
    },
    empires: {
      roman: [ROMAN_FILL_LAYER_ID, ROMAN_LINE_LAYER_ID],
      mongol: [MONGOL_FILL_LAYER_ID, MONGOL_LINE_LAYER_ID],
      british: [BRITISH_FILL_LAYER_ID, BRITISH_LINE_LAYER_ID],
    },
  };
}

function applyLogicalLayerOrder(map, parentId, orderedLayerIds) {
  const bundles = getLogicalLayerBundles()[parentId];
  if (!bundles) {
    return;
  }

  const flattened = orderedLayerIds
    .flatMap((layerId) => bundles[layerId] ?? [])
    .filter((layerId) => map.getLayer(layerId));

  const anchorBeforeId = (parentId === "earth" || parentId === "transport")
    ? getFirstExistingLayerId(map, [
      ROMAN_FILL_LAYER_ID,
      ROMAN_LINE_LAYER_ID,
      MONGOL_FILL_LAYER_ID,
      MONGOL_LINE_LAYER_ID,
      BRITISH_FILL_LAYER_ID,
      BRITISH_LINE_LAYER_ID,
    ])
    : null;

  for (let index = flattened.length - 1; index >= 0; index -= 1) {
    map.moveLayer(flattened[index], anchorBeforeId ?? undefined);
  }
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

function buildStyle(manifest, layerState) {
  return {
    version: 8,
    projection: {
      type: "globe",
    },
    // Sources here load in parallel with MapLibre's own initialisation,
    // before the load event fires — so these layers render immediately.
    sources: {
      [COUNTRIES_LAND_SOURCE_ID]: {
        type: "geojson",
        data: COUNTRIES_LAND_INITIAL_URL,
      },
      [GRATICULES_SOURCE_ID]: createGeojsonVectorSourceSpec(GRATICULES_TILE_SOURCE_ID),
    },
    layers: [
      {
        id: "atlas-water",
        type: "background",
        layout: {
          visibility: getInheritedLayoutVisibility(layerState, "ocean"),
        },
        paint: {
          "background-color": buildWaterBackgroundColor(
            getLayerStyleValue(layerState, "ocean", "fillColor", DEFAULT_OCEAN_FILL_COLOR),
            getLayerStyleValue(layerState, "ocean", "fillOpacity", 100),
          ),
        },
      },
      {
        id: COUNTRIES_LAND_FILL_LAYER_ID,
        type: "fill",
        source: COUNTRIES_LAND_SOURCE_ID,
        layout: {
          visibility: getInheritedLayoutVisibility(layerState, "countriesLand"),
        },
        paint: {
          "fill-color": getLayerStyleValue(layerState, "countriesLand", "fillColor", DEFAULT_LAND_FILL_COLOR),
          "fill-opacity": Number(getLayerStyleValue(layerState, "countriesLand", "fillOpacity", 100)) / 100,
        },
      },
      {
        id: COUNTRIES_LAND_LINE_LAYER_ID,
        type: "line",
        source: COUNTRIES_LAND_SOURCE_ID,
        layout: {
          visibility: getInheritedLayoutVisibility(layerState, "countriesLand"),
        },
        paint: {
          "line-color": getLayerStyleValue(layerState, "countriesLand", "lineColor", DEFAULT_OUTLINE_LINE_COLOR),
          "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "countriesLand", "lineWeight", 1)),
          "line-opacity": Number(getLayerStyleValue(layerState, "countriesLand", "lineOpacity", 100)) / 100,
        },
      },
      {
        id: GRATICULES_LINE_LAYER_ID,
        type: "line",
        source: GRATICULES_SOURCE_ID,
        "source-layer": GRATICULES_TILE_SOURCE_LAYER,
        layout: {
          visibility: getInheritedLayoutVisibility(layerState, "graticules"),
        },
        paint: {
          "line-color": getLayerStyleValue(layerState, "graticules", "lineColor", DEFAULT_GRATICULE_LINE_COLOR),
          "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "graticules", "lineWeight", 1)),
          "line-opacity": Number(getLayerStyleValue(layerState, "graticules", "lineOpacity", 100)) / 100,
        },
      },
    ],
  };
}

function getLayerStyleValue(layerState, layerId, key, fallback) {
  const nextValue = layerState?.[layerId]?.[key];
  return nextValue === undefined ? fallback : nextValue;
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

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("")}`;
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

function getInheritedLayoutVisibility(layerState, layerId) {
  let currentLayerId = layerId;

  while (currentLayerId) {
    if (!getLayerStyleValue(layerState, currentLayerId, "visible", true)) {
      return "none";
    }
    currentLayerId = PARENT_LAYER_IDS[currentLayerId] ?? null;
  }

  return "visible";
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
  const polygonSets = [];

  for (const feature of featureCollection?.features ?? []) {
    const polygons = geometryToMultiPolygonCoordinates(feature.geometry);
    if (polygons.length > 0) {
      polygonSets.push(polygons);
    }
  }

  if (polygonSets.length === 0) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  const dissolved = polygonClipping.union(...polygonSets);
  const lineFeatures = [];

  for (const polygon of dissolved ?? []) {
    for (const ring of polygon ?? []) {
      lineFeatures.push({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: ring,
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features: lineFeatures,
  };
}

function ensureProtocol(manifest = []) {
  if (protocolInstalled) {
    return;
  }

  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  installAtlasVectorTileProtocol(maplibregl);
  registerGeojsonVectorTileSource({
    id: GRATICULES_TILE_SOURCE_ID,
    dataUrl: GRATICULES_VECTOR_URL,
    sourceLayer: GRATICULES_TILE_SOURCE_LAYER,
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
//
// Each entry fully describes a "standard" layer: one GeoJSON/vector source with
// an optional fill layer and/or line layer. Adding a new standard layer only
// requires adding an entry here — attach, style updates, and visibility
// are all handled generically.
//
// source.kind:
//   "geojson"        — static GeoJSON URL, no tiles
//   "atlas-vector"   — atlas vector-tile protocol (createGeojsonVectorSourceSpec)
//   "runtime-vector" — atlas vector tiles OR pmtiles when available (createRuntimeVectorSourceSpec)
//
// deferred: true  → Phase 2 (idle/hidden-by-default)
// deferred: false → Phase 1 (loaded immediately on map load)

const STANDARD_LAYER_REGISTRY = [
  // Phase 1 — visible-by-default
  {
    layerId: "countriesLand",
    deferred: false,
    source: { kind: "geojson", id: COUNTRIES_LAND_SOURCE_ID, url: COUNTRIES_LAND_VECTOR_URL },
    fill: { id: COUNTRIES_LAND_FILL_LAYER_ID, defaultColor: DEFAULT_LAND_FILL_COLOR },
    line: { id: COUNTRIES_LAND_LINE_LAYER_ID, defaultColor: DEFAULT_OUTLINE_LINE_COLOR, defaultWeight: 1 },
  },
  {
    layerId: "graticules",
    deferred: false,
    source: { kind: "atlas-vector", id: GRATICULES_SOURCE_ID, atlasVectorTileId: GRATICULES_TILE_SOURCE_ID },
    fill: null,
    line: { id: GRATICULES_LINE_LAYER_ID, sourceLayer: GRATICULES_TILE_SOURCE_LAYER, defaultColor: DEFAULT_GRATICULE_LINE_COLOR, defaultWeight: 1 },
  },
  {
    layerId: "transportRail",
    deferred: false,
    source: { kind: "geojson", id: TRANSPORT_RAIL_SOURCE_ID, url: TRANSPORT_RAIL_VECTOR_URL },
    fill: null,
    line: {
      id: TRANSPORT_RAIL_LINE_LAYER_ID,
      defaultColor: "#f07a58",
      defaultWeight: 3.5,
      defaultOpacity: 92,
      extraLayout: { "line-cap": "round", "line-join": "round" },
    },
  },
  // Phase 2 — hidden-by-default (loaded on idle)
  {
    layerId: "land",
    deferred: true,
    source: { kind: "runtime-vector", id: OSM_LAND_SOURCE_ID, pmtilesId: OSM_LAND_PMTILES_ID, atlasVectorTileId: OSM_LAND_TILE_SOURCE_ID },
    fill: { id: OSM_LAND_FILL_LAYER_ID, sourceLayer: OSM_LAND_TILE_SOURCE_LAYER, defaultColor: DEFAULT_LAND_FILL_COLOR },
    line: null,
  },
  {
    layerId: "outline",
    deferred: true,
    source: { kind: "atlas-vector", id: OSM_OUTLINE_SOURCE_ID, atlasVectorTileId: OSM_OUTLINE_TILE_SOURCE_ID },
    fill: null,
    line: { id: OSM_OUTLINE_LINE_LAYER_ID, sourceLayer: OSM_OUTLINE_TILE_SOURCE_LAYER, defaultColor: DEFAULT_OUTLINE_LINE_COLOR, defaultWeight: 1 },
  },
  {
    layerId: "japan",
    deferred: true,
    source: { kind: "runtime-vector", id: JAPAN_OUTLINE_SOURCE_ID, pmtilesId: JAPAN_OUTLINE_PMTILES_ID, atlasVectorTileId: JAPAN_OUTLINE_TILE_SOURCE_ID },
    fill: null,
    line: { id: JAPAN_OUTLINE_LINE_LAYER_ID, sourceLayer: JAPAN_OUTLINE_TILE_SOURCE_LAYER, defaultColor: DEFAULT_OUTLINE_LINE_COLOR, defaultWeight: 1 },
  },
  {
    layerId: "africa",
    deferred: true,
    source: { kind: "runtime-vector", id: AFRICA_FILL_SOURCE_ID, pmtilesId: AFRICA_FILL_PMTILES_ID, atlasVectorTileId: AFRICA_FILL_TILE_SOURCE_ID },
    fill: { id: AFRICA_FILL_LAYER_ID, sourceLayer: AFRICA_FILL_TILE_SOURCE_LAYER, defaultColor: DEFAULT_LAND_FILL_COLOR },
    line: null,
  },
];

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
      layout: { visibility: getInheritedLayoutVisibility(layerState, layerId) },
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
        visibility: getInheritedLayoutVisibility(layerState, layerId),
      },
      paint: {
        "line-color": getLayerStyleValue(layerState, layerId, "lineColor", line.defaultColor),
        "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, layerId, "lineWeight", line.defaultWeight ?? 1)),
        "line-opacity": Number(getLayerStyleValue(layerState, layerId, "lineOpacity", line.defaultOpacity ?? 100)) / 100,
      },
    };
    if (line.sourceLayer) {
      lineSpec["source-layer"] = line.sourceLayer;
    }
    map.addLayer(lineSpec);
  }
}

// Applies a style key/value to a registry entry's MapLibre layers.
// Returns true if the update was handled (so callers can return early).
function applyRegistryStyleValue(entry, map, layerState, key, value) {
  const { fill, line, layerId } = entry;

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
  if (key === "visible") {
    if (fill && map.getLayer(fill.id)) {
      map.setLayoutProperty(fill.id, "visibility", getInheritedLayoutVisibility(layerState, layerId));
    }
    if (line && map.getLayer(line.id)) {
      map.setLayoutProperty(line.id, "visibility", getInheritedLayoutVisibility(layerState, layerId));
    }
    return true;
  }
  return false;
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

function createMapInstance({ container, manifest = [], viewState, initialLayerState = {} }) {
  if (!container) {
    return null;
  }

  // Use MapLibre from CDN
  const maplibregl = window.maplibregl;

  ensureProtocol(manifest);
  const layerState = structuredClone(initialLayerState);
  const scaleOverlay = createScaleOverlay(container);
  let scaleHideTimeout = null;

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

  const map = new maplibregl.Map({
    container,
    style: buildStyle(manifest, layerState),
    center: [viewState.center.longitude, viewState.center.latitude],
    zoom: viewState.zoom,
    minZoom: 0.7,
    bearing: viewState.bearing,
    pitch: viewState.pitch,
    attributionControl: false,
  });
  map.on("error", (event) => {
    const message = event?.error?.message ?? event?.error?.toString?.() ?? "unknown";
    console.error("MapLibre map error.", message, event?.error);
  });
  map.on("movestart", () => {
    showScaleOverlay();
  });
  map.on("move", () => {
    showScaleOverlay();
  });
  map.on("moveend", () => {
    showScaleOverlay();
    hideScaleOverlaySoon();
  });
  map.on("resize", () => {
    if (scaleOverlay.classList.contains("is-visible")) {
      updateScaleOverlay(map, scaleOverlay);
    }
  });
  map.on("load", () => {
    // Upgrade land immediately — swap from the tiny 110m initial file to the
    // full 50m dissolved land in the background. Non-blocking: map stays
    // interactive while the higher-res data loads.
    map.getSource(COUNTRIES_LAND_SOURCE_ID)?.setData(COUNTRIES_LAND_VECTOR_URL);

    // Phase 1: All visible-by-default layers — load immediately in parallel
    // Note: water, countriesLand, and graticules are already in the initial style
    // and start loading before this event fires. attachStandardLayer's source
    // guard skips them here automatically.
    void (async () => {
      try {
        await Promise.all([
          ...STANDARD_LAYER_REGISTRY
            .filter((entry) => !entry.deferred)
            .map((entry) => attachStandardLayer(map, layerState, manifest, entry)),
          attachAustraliaFillLayer(map, layerState, manifest),
          attachAustraliaOutlineLayer(map, layerState, manifest),
          attachRomanEmpireLayer(map, layerState),
          attachMongolEmpireLayer(map, layerState),
          attachBritishEmpireLayer(map, layerState),
          attachOlympicsLayers(map, layerState),
        ]);

        applyLogicalLayerOrder(map, "__root__", getLayerStyleValue(layerState, "__root__", "rowOrder", ["earth", "transport", "olympics", "empires"]));
        applyLogicalLayerOrder(map, "earth", getLayerStyleValue(layerState, "earth", "rowOrder", ["ocean", "australia", "countries-land", "graticules"]));
        applyLogicalLayerOrder(map, "transport", getLayerStyleValue(layerState, "transport", "rowOrder", ["transport-rail"]));
        applyLogicalLayerOrder(map, "olympics", getLayerStyleValue(layerState, "olympics", "rowOrder", ["olympics-gold", "olympics-silver", "olympics-bronze"]));
        applyLogicalLayerOrder(map, "empires", getLayerStyleValue(layerState, "empires", "rowOrder", ["roman", "mongol", "british"]));
      } catch (error) {
        console.error("Failed to attach primary layers.", error);
      }
    })();

    // Phase 2: Hidden-by-default layers — defer until browser is idle
    const loadDeferredLayers = async () => {
      try {
        await Promise.all([
          ...STANDARD_LAYER_REGISTRY
            .filter((entry) => entry.deferred)
            .map((entry) => attachStandardLayer(map, layerState, manifest, entry)),
          attachVictoriaFillLayers(map, layerState, manifest),
          attachVictoriaOutlineLayers(map, layerState, manifest),
        ]);

        // Re-apply earth ordering now that all layers exist
        applyLogicalLayerOrder(map, "earth", getLayerStyleValue(layerState, "earth", "rowOrder", ["ocean", "australia", "countries-land", "graticules"]));
      } catch (error) {
        console.error("Failed to attach deferred layers.", error);
      }
    };

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => void loadDeferredLayers(), { timeout: 5000 });
    } else {
      window.setTimeout(() => void loadDeferredLayers(), 2000);
    }
  });
  return {
    destroy() {
      clearScaleHideTimeout();
      scaleOverlay.remove();
      map.remove();
    },
    getMap() {
      return map;
    },
    reorderLayerGroup(parentId, orderedLayerIds) {
      applyLogicalLayerOrder(map, parentId, orderedLayerIds);
    },
    setLayerStyleValue(layerId, key, value) {
      if (!layerState[layerId] || typeof layerState[layerId] !== "object") {
        layerState[layerId] = {};
      }

      layerState[layerId][key] = value;

      // ── Registry-driven layers (land, outline, japan, africa, countriesLand,
      //    graticules, countries, transportRail) ─────────────────────────────
      const registryEntry = STANDARD_LAYER_REGISTRY.find((e) => e.layerId === layerId);
      if (registryEntry && applyRegistryStyleValue(registryEntry, map, layerState, key, value)) {
        return;
      }

      // ── Ocean (background layer — no source, special paint) ───────────────
      if (layerId === "ocean") {
        if (!map.getLayer("atlas-water")) return;
        if (key === "fillColor") {
          map.setPaintProperty("atlas-water", "background-color", buildWaterBackgroundColor(
            value,
            getLayerStyleValue(layerState, "ocean", "fillOpacity", 100),
          ));
        } else if (key === "fillOpacity") {
          map.setPaintProperty("atlas-water", "background-color", buildWaterBackgroundColor(
            getLayerStyleValue(layerState, "ocean", "fillColor", DEFAULT_OCEAN_FILL_COLOR),
            value,
          ));
        } else if (key === "visible") {
          map.setLayoutProperty("atlas-water", "visibility", getInheritedLayoutVisibility(layerState, "ocean"));
        }
        return;
      }

      // ── Australia (8-tile fill + outline) ────────────────────────────────
      if (layerId === "australia") {
        if (key === "fillColor") {
          AUSTRALIA_FILL_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "fill-color", String(value));
          });
        } else if (key === "fillOpacity") {
          AUSTRALIA_FILL_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "fill-opacity", Number(value) / 100);
          });
        } else if (key === "lineColor") {
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "line-color", String(value));
          });
        } else if (key === "lineOpacity") {
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", Number(value) / 100);
          });
        } else if (key === "lineWeight") {
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "line-width", buildLineWidthExpression(Number(value)));
          });
        } else if (key === "visible") {
          AUSTRALIA_FILL_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
          });
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
          });
        }
        return;
      }

      // ── Victoria (4-tile outline + 1 fill) ───────────────────────────────
      if (layerId === "victoria") {
        if (key === "fillColor" && map.getLayer(VICTORIA_FILL_LAYER_ID)) {
          map.setPaintProperty(VICTORIA_FILL_LAYER_ID, "fill-color", String(value));
        } else if (key === "fillOpacity" && map.getLayer(VICTORIA_FILL_LAYER_ID)) {
          map.setPaintProperty(VICTORIA_FILL_LAYER_ID, "fill-opacity", Number(value) / 100);
        } else if (key === "lineColor") {
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "line-color", String(value));
          });
        } else if (key === "lineOpacity") {
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", Number(value) / 100);
          });
        } else if (key === "lineWeight") {
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setPaintProperty(id, "line-width", buildLineWidthExpression(Number(value)));
          });
        } else if (key === "visible") {
          if (map.getLayer(VICTORIA_FILL_LAYER_ID)) {
            map.setLayoutProperty(VICTORIA_FILL_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "victoria"));
          }
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, "victoria"));
          });
        }
        return;
      }

      // ── Group parent visibility cascades ─────────────────────────────────
      if (key === "visible") {
        if (layerId === "earth") {
          if (map.getLayer("atlas-water")) {
            map.setLayoutProperty("atlas-water", "visibility", getInheritedLayoutVisibility(layerState, "ocean"));
          }
          STANDARD_LAYER_REGISTRY.forEach((entry) => {
            if (PARENT_LAYER_IDS[entry.layerId] === "earth") {
              applyRegistryStyleValue(entry, map, layerState, "visible", value);
            }
          });
          AUSTRALIA_FILL_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
          });
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
          });
          return;
        }

        if (layerId === "transport") {
          STANDARD_LAYER_REGISTRY.forEach((entry) => {
            if (PARENT_LAYER_IDS[entry.layerId] === "transport") {
              applyRegistryStyleValue(entry, map, layerState, "visible", value);
            }
          });
          return;
        }

        if (layerId === "olympics") {
          [
            ["olympicsGold", OLYMPICS_GOLD_LAYER_ID],
            ["olympicsSilver", OLYMPICS_SILVER_LAYER_ID],
            ["olympicsBronze", OLYMPICS_BRONZE_LAYER_ID],
          ].forEach(([childId, mapLayerId]) => {
            if (map.getLayer(mapLayerId)) {
              map.setLayoutProperty(mapLayerId, "visibility", getInheritedLayoutVisibility(layerState, childId));
            }
          });
          return;
        }

        if (layerId === "olympicsGold" && map.getLayer(OLYMPICS_GOLD_LAYER_ID)) {
          map.setLayoutProperty(OLYMPICS_GOLD_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "olympicsGold"));
          return;
        }
        if (layerId === "olympicsSilver" && map.getLayer(OLYMPICS_SILVER_LAYER_ID)) {
          map.setLayoutProperty(OLYMPICS_SILVER_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "olympicsSilver"));
          return;
        }
        if (layerId === "olympicsBronze" && map.getLayer(OLYMPICS_BRONZE_LAYER_ID)) {
          map.setLayoutProperty(OLYMPICS_BRONZE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "olympicsBronze"));
          return;
        }

        if (layerId === "empires") {
          Object.entries(EMPIRE_FILL_LAYER_IDS).forEach(([empireLayerId, fillLayerId]) => {
            if (map.getLayer(fillLayerId)) {
              map.setLayoutProperty(fillLayerId, "visibility", getInheritedLayoutVisibility(layerState, empireLayerId));
            }
          });
          Object.entries(EMPIRE_LINE_LAYER_IDS).forEach(([empireLayerId, lineLayerId]) => {
            if (map.getLayer(lineLayerId)) {
              map.setLayoutProperty(lineLayerId, "visibility", getInheritedLayoutVisibility(layerState, empireLayerId));
            }
          });
          return;
        }

        // Individual empire layers (roman / mongol / british)
        const empireFillLayerId = EMPIRE_FILL_LAYER_IDS[layerId];
        if (empireFillLayerId && map.getLayer(empireFillLayerId)) {
          map.setLayoutProperty(empireFillLayerId, "visibility", getInheritedLayoutVisibility(layerState, layerId));
        }
        const empireLineLayerId = LINE_LAYER_IDS[layerId];
        if (empireLineLayerId && map.getLayer(empireLineLayerId)) {
          map.setLayoutProperty(empireLineLayerId, "visibility", getInheritedLayoutVisibility(layerState, layerId));
        }
        return;
      }

      // ── Empire fill / line style (roman / mongol / british) ──────────────
      if (key === "fillColor") {
        const fillLayerId = EMPIRE_FILL_LAYER_IDS[layerId];
        if (fillLayerId && map.getLayer(fillLayerId)) map.setPaintProperty(fillLayerId, "fill-color", String(value));
        return;
      }
      if (key === "fillOpacity") {
        const fillLayerId = EMPIRE_FILL_LAYER_IDS[layerId];
        if (fillLayerId && map.getLayer(fillLayerId)) map.setPaintProperty(fillLayerId, "fill-opacity", Number(value) / 100);
        return;
      }
      if (key === "lineColor") {
        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (lineLayerId && map.getLayer(lineLayerId)) map.setPaintProperty(lineLayerId, "line-color", String(value));
        return;
      }
      if (key === "lineOpacity") {
        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (lineLayerId && map.getLayer(lineLayerId)) map.setPaintProperty(lineLayerId, "line-opacity", Number(value) / 100);
        return;
      }
      if (key === "lineWeight") {
        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (lineLayerId && map.getLayer(lineLayerId)) map.setPaintProperty(lineLayerId, "line-width", buildLineWidthExpression(Number(value)));
        return;
      }

      // ── Olympics custom keys ──────────────────────────────────────────────
      if (layerId === "olympics" && key === "pointRadius") {
        [OLYMPICS_GOLD_LAYER_ID, OLYMPICS_SILVER_LAYER_ID, OLYMPICS_BRONZE_LAYER_ID].forEach((nextLayerId) => {
          if (map.getLayer(nextLayerId)) map.setPaintProperty(nextLayerId, "circle-radius", getOlympicsPointRadius(layerState));
        });
        return;
      }
      if (layerId === "olympics" && key === "selectedYear") {
        const olympicsSource = map.getSource(OLYMPICS_SOURCE_ID);
        if (olympicsSource && "setData" in olympicsSource) {
          olympicsSource.setData(getOlympicsVectorUrl(layerState));
        }
      }
    },
  };
}

export { createMapInstance, isRealPmtilesUrl };
