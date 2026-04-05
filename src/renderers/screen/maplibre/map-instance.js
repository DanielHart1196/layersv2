import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import polygonClipping from "polygon-clipping";
import {
  createGeojsonVectorSourceSpec,
  installAtlasVectorTileProtocol,
  registerGeojsonVectorTileSource,
} from "./vector-tiles.js";

let protocolInstalled = false;
const COUNTRY_SOURCE_ID = "atlas-country-vector";
const COUNTRY_TILE_SOURCE_ID = "atlas-country-vector-tiles";
const COUNTRY_TILE_SOURCE_LAYER = "countries";
const COUNTRY_FILL_LAYER_ID = "atlas-country-vector-fill";
const COUNTRY_LINE_LAYER_ID = "atlas-country-vector-line";
const COUNTRY_VECTOR_URL = "/data/external-countries.geojson";
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
const MONGOL_VECTOR_URL = "/data/empires/mongol_empire_1279_extent.medium.self-cutout.geojson";
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
  countries: COUNTRY_LINE_LAYER_ID,
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
      countries: [COUNTRY_FILL_LAYER_ID, COUNTRY_LINE_LAYER_ID],
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
      COUNTRY_FILL_LAYER_ID,
      COUNTRY_LINE_LAYER_ID,
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

function buildStyle(manifest) {
  const layers = [
    {
      id: "atlas-water",
      type: "background",
      paint: {
        "background-color": "#2c6f92",
      },
    },
  ];

  return {
    version: 8,
    projection: {
      type: "globe",
    },
    sources: {},
    layers,
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
    id: COUNTRY_TILE_SOURCE_ID,
    dataUrl: COUNTRY_VECTOR_URL,
    sourceLayer: COUNTRY_TILE_SOURCE_LAYER,
  });
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

async function attachOsmLandFillLayer(map, layerState, manifest) {
  if (map.getSource(OSM_LAND_SOURCE_ID)) {
    if (map.getLayer(OSM_LAND_FILL_LAYER_ID)) {
      map.removeLayer(OSM_LAND_FILL_LAYER_ID);
    }
    map.removeSource(OSM_LAND_SOURCE_ID);
  }

  map.addSource(OSM_LAND_SOURCE_ID, createRuntimeVectorSourceSpec({
    manifest,
    pmtilesId: OSM_LAND_PMTILES_ID,
    atlasVectorTileId: OSM_LAND_TILE_SOURCE_ID,
  }));

  map.addLayer({
    id: OSM_LAND_FILL_LAYER_ID,
    type: "fill",
    source: OSM_LAND_SOURCE_ID,
    "source-layer": OSM_LAND_TILE_SOURCE_LAYER,
    layout: {
      visibility: getLayoutVisibility(layerState, "land"),
    },
    paint: {
      "fill-color": getLayerStyleValue(layerState, "land", "fillColor", DEFAULT_LAND_FILL_COLOR),
      "fill-opacity": Number(getLayerStyleValue(layerState, "land", "fillOpacity", 100)) / 100,
    },
  });
}

async function attachOsmOutlineLayer(map, layerState, manifest) {
  if (map.getSource(OSM_OUTLINE_SOURCE_ID)) {
    if (map.getLayer(OSM_OUTLINE_LINE_LAYER_ID)) {
      map.removeLayer(OSM_OUTLINE_LINE_LAYER_ID);
    }
    map.removeSource(OSM_OUTLINE_SOURCE_ID);
  }

  map.addSource(OSM_OUTLINE_SOURCE_ID, createGeojsonVectorSourceSpec(OSM_OUTLINE_TILE_SOURCE_ID));

  map.addLayer({
    id: OSM_OUTLINE_LINE_LAYER_ID,
    type: "line",
    source: OSM_OUTLINE_SOURCE_ID,
    "source-layer": OSM_OUTLINE_TILE_SOURCE_LAYER,
    layout: {
      visibility: getLayoutVisibility(layerState, "outline"),
    },
    paint: {
      "line-color": getLayerStyleValue(layerState, "outline", "lineColor", DEFAULT_OUTLINE_LINE_COLOR),
      "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "outline", "lineWeight", 1)),
      "line-opacity": Number(getLayerStyleValue(layerState, "outline", "lineOpacity", 100)) / 100,
    },
  });
}

async function attachJapanOutlineLayer(map, layerState, manifest) {
  if (map.getSource(JAPAN_OUTLINE_SOURCE_ID)) {
    if (map.getLayer(JAPAN_OUTLINE_LINE_LAYER_ID)) {
      map.removeLayer(JAPAN_OUTLINE_LINE_LAYER_ID);
    }
    map.removeSource(JAPAN_OUTLINE_SOURCE_ID);
  }

  map.addSource(JAPAN_OUTLINE_SOURCE_ID, createRuntimeVectorSourceSpec({
    manifest,
    pmtilesId: JAPAN_OUTLINE_PMTILES_ID,
    atlasVectorTileId: JAPAN_OUTLINE_TILE_SOURCE_ID,
  }));

  map.addLayer({
    id: JAPAN_OUTLINE_LINE_LAYER_ID,
    type: "line",
    source: JAPAN_OUTLINE_SOURCE_ID,
    "source-layer": JAPAN_OUTLINE_TILE_SOURCE_LAYER,
    layout: {
      visibility: getLayoutVisibility(layerState, "japan"),
    },
    paint: {
      "line-color": getLayerStyleValue(layerState, "japan", "lineColor", DEFAULT_OUTLINE_LINE_COLOR),
      "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "japan", "lineWeight", 1)),
      "line-opacity": Number(getLayerStyleValue(layerState, "japan", "lineOpacity", 100)) / 100,
    },
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

async function attachAfricaFillLayer(map, layerState, manifest) {
  if (map.getSource(AFRICA_FILL_SOURCE_ID)) {
    if (map.getLayer(AFRICA_FILL_LAYER_ID)) {
      map.removeLayer(AFRICA_FILL_LAYER_ID);
    }
    map.removeSource(AFRICA_FILL_SOURCE_ID);
  }

  map.addSource(AFRICA_FILL_SOURCE_ID, createRuntimeVectorSourceSpec({
    manifest,
    pmtilesId: AFRICA_FILL_PMTILES_ID,
    atlasVectorTileId: AFRICA_FILL_TILE_SOURCE_ID,
  }));

  map.addLayer({
    id: AFRICA_FILL_LAYER_ID,
    type: "fill",
    source: AFRICA_FILL_SOURCE_ID,
    "source-layer": AFRICA_FILL_TILE_SOURCE_LAYER,
    layout: {
      visibility: getLayoutVisibility(layerState, "africa"),
    },
    paint: {
      "fill-color": getLayerStyleValue(layerState, "africa", "fillColor", DEFAULT_LAND_FILL_COLOR),
      "fill-opacity": Number(getLayerStyleValue(layerState, "africa", "fillOpacity", 100)) / 100,
    },
  });
}

async function attachCountriesLandLayers(map, layerState) {
  if (map.getSource(COUNTRIES_LAND_SOURCE_ID)) {
    if (map.getLayer(COUNTRIES_LAND_LINE_LAYER_ID)) {
      map.removeLayer(COUNTRIES_LAND_LINE_LAYER_ID);
    }
    if (map.getLayer(COUNTRIES_LAND_FILL_LAYER_ID)) {
      map.removeLayer(COUNTRIES_LAND_FILL_LAYER_ID);
    }
    map.removeSource(COUNTRIES_LAND_SOURCE_ID);
  }

  map.addSource(COUNTRIES_LAND_SOURCE_ID, {
    type: "geojson",
    data: COUNTRIES_LAND_VECTOR_URL,
  });

  map.addLayer({
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
  });

  map.addLayer({
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
  });
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

async function attachCountriesVectorLayer(map, layerState) {
  if (map.getSource(COUNTRY_SOURCE_ID)) {
    if (map.getLayer(COUNTRY_LINE_LAYER_ID)) {
      map.removeLayer(COUNTRY_LINE_LAYER_ID);
    }
    if (map.getLayer(COUNTRY_FILL_LAYER_ID)) {
      map.removeLayer(COUNTRY_FILL_LAYER_ID);
    }
    map.removeSource(COUNTRY_SOURCE_ID);
  }

  map.addSource(COUNTRY_SOURCE_ID, createGeojsonVectorSourceSpec(COUNTRY_TILE_SOURCE_ID));

  map.addLayer({
    id: COUNTRY_FILL_LAYER_ID,
    type: "fill",
    source: COUNTRY_SOURCE_ID,
    "source-layer": COUNTRY_TILE_SOURCE_LAYER,
    layout: {
      visibility: getLayoutVisibility(layerState, "countries"),
    },
    paint: {
      "fill-color": getLayerStyleValue(layerState, "countries", "fillColor", DEFAULT_LAND_FILL_COLOR),
      "fill-opacity": Number(getLayerStyleValue(layerState, "countries", "fillOpacity", 0)) / 100,
    },
  });

  map.addLayer({
    id: COUNTRY_LINE_LAYER_ID,
    type: "line",
    source: COUNTRY_SOURCE_ID,
    "source-layer": COUNTRY_TILE_SOURCE_LAYER,
    layout: {
      visibility: getLayoutVisibility(layerState, "countries"),
    },
    paint: {
      "line-color": getLayerStyleValue(layerState, "countries", "lineColor", "#e1efe4"),
      "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "countries", "lineWeight", 1)),
      "line-opacity": Number(getLayerStyleValue(layerState, "countries", "lineOpacity", 0)) / 100,
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

async function attachTransportRailLayer(map, layerState) {
  if (map.getSource(TRANSPORT_RAIL_SOURCE_ID)) {
    if (map.getLayer(TRANSPORT_RAIL_LINE_LAYER_ID)) {
      map.removeLayer(TRANSPORT_RAIL_LINE_LAYER_ID);
    }
    map.removeSource(TRANSPORT_RAIL_SOURCE_ID);
  }

  map.addSource(TRANSPORT_RAIL_SOURCE_ID, {
    type: "geojson",
    data: TRANSPORT_RAIL_VECTOR_URL,
  });

  map.addLayer({
    id: TRANSPORT_RAIL_LINE_LAYER_ID,
    type: "line",
    source: TRANSPORT_RAIL_SOURCE_ID,
    layout: {
      "line-cap": "round",
      "line-join": "round",
      visibility: getInheritedLayoutVisibility(layerState, "transportRail"),
    },
    paint: {
      "line-color": getLayerStyleValue(layerState, "transportRail", "lineColor", "#f07a58"),
      "line-width": buildLineWidthExpression(getLayerStyleValue(layerState, "transportRail", "lineWeight", 3.5)),
      "line-opacity": Number(getLayerStyleValue(layerState, "transportRail", "lineOpacity", 92)) / 100,
    },
  });
}

async function attachGraticulesLayer(map, layerState) {
  if (map.getSource(GRATICULES_SOURCE_ID)) {
    if (map.getLayer(GRATICULES_LINE_LAYER_ID)) {
      map.removeLayer(GRATICULES_LINE_LAYER_ID);
    }
    map.removeSource(GRATICULES_SOURCE_ID);
  }

  map.addSource(GRATICULES_SOURCE_ID, createGeojsonVectorSourceSpec(GRATICULES_TILE_SOURCE_ID));

  map.addLayer({
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
  });
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
    style: buildStyle(manifest),
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
    if (map.getLayer("atlas-water")) {
      map.setLayoutProperty("atlas-water", "visibility", getInheritedLayoutVisibility(layerState, "ocean"));
      map.setPaintProperty(
        "atlas-water",
        "background-color",
        buildWaterBackgroundColor(
          getLayerStyleValue(layerState, "ocean", "fillColor", DEFAULT_OCEAN_FILL_COLOR),
          getLayerStyleValue(layerState, "ocean", "fillOpacity", 100),
        ),
      );
    }
    void (async () => {
      try {
        await attachAustraliaFillLayer(map, layerState, manifest);
        await attachAustraliaOutlineLayer(map, layerState, manifest);
        await attachCountriesLandLayers(map, layerState);
        await attachGraticulesLayer(map, layerState);
        await attachTransportRailLayer(map, layerState);
        await attachCountriesVectorLayer(map, layerState);
        await attachRomanEmpireLayer(map, layerState);
        await attachMongolEmpireLayer(map, layerState);
        await attachBritishEmpireLayer(map, layerState);
        await attachOlympicsLayers(map, layerState);
        applyLogicalLayerOrder(map, "__root__", getLayerStyleValue(layerState, "__root__", "rowOrder", ["earth", "transport", "countries", "olympics", "empires"]));
        applyLogicalLayerOrder(map, "earth", getLayerStyleValue(layerState, "earth", "rowOrder", ["ocean", "australia", "countries-land", "graticules"]));
        applyLogicalLayerOrder(map, "transport", getLayerStyleValue(layerState, "transport", "rowOrder", ["transport-rail"]));
        applyLogicalLayerOrder(map, "olympics", getLayerStyleValue(layerState, "olympics", "rowOrder", ["olympics-gold", "olympics-silver", "olympics-bronze"]));
        applyLogicalLayerOrder(map, "empires", getLayerStyleValue(layerState, "empires", "rowOrder", ["roman", "mongol", "british"]));
      } catch (error) {
        console.error("Failed to attach ordered atlas layers.", error);
      }
    })();
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

      if (key === "fillOpacity") {
        if (layerId === "land" && map.getLayer(OSM_LAND_FILL_LAYER_ID)) {
          map.setPaintProperty(OSM_LAND_FILL_LAYER_ID, "fill-opacity", Number(value) / 100);
          return;
        }

        if (layerId === "australia" && AUSTRALIA_FILL_LAYER_IDS.some((fillLayerId) => map.getLayer(fillLayerId))) {
          AUSTRALIA_FILL_LAYER_IDS.forEach((fillLayerId) => {
            if (map.getLayer(fillLayerId)) {
              map.setPaintProperty(fillLayerId, "fill-opacity", Number(value) / 100);
            }
          });
          return;
        }

        if (layerId === "africa" && map.getLayer(AFRICA_FILL_LAYER_ID)) {
          map.setPaintProperty(AFRICA_FILL_LAYER_ID, "fill-opacity", Number(value) / 100);
          return;
        }

        if (layerId === "countriesLand" && map.getLayer(COUNTRIES_LAND_FILL_LAYER_ID)) {
          map.setPaintProperty(COUNTRIES_LAND_FILL_LAYER_ID, "fill-opacity", Number(value) / 100);
          return;
        }

        if (layerId === "victoria" && map.getLayer(VICTORIA_FILL_LAYER_ID)) {
          map.setPaintProperty(VICTORIA_FILL_LAYER_ID, "fill-opacity", Number(value) / 100);
          return;
        }

        if (layerId === "countries" && map.getLayer(COUNTRY_FILL_LAYER_ID)) {
          map.setPaintProperty(COUNTRY_FILL_LAYER_ID, "fill-opacity", Number(value) / 100);
          return;
        }

        if (layerId === "ocean" && map.getLayer("atlas-water")) {
          map.setPaintProperty(
            "atlas-water",
            "background-color",
            buildWaterBackgroundColor(
              getLayerStyleValue(layerState, "ocean", "fillColor", DEFAULT_OCEAN_FILL_COLOR),
              value,
            ),
          );
          return;
        }

        const fillLayerId = EMPIRE_FILL_LAYER_IDS[layerId];
        if (!fillLayerId || !map.getLayer(fillLayerId)) {
          return;
        }

        map.setPaintProperty(fillLayerId, "fill-opacity", Number(value) / 100);
        return;
      }

      if (key === "fillColor") {
        if (layerId === "land" && map.getLayer(OSM_LAND_FILL_LAYER_ID)) {
          map.setPaintProperty(OSM_LAND_FILL_LAYER_ID, "fill-color", String(value));
          return;
        }

        if (layerId === "australia" && AUSTRALIA_FILL_LAYER_IDS.some((fillLayerId) => map.getLayer(fillLayerId))) {
          AUSTRALIA_FILL_LAYER_IDS.forEach((fillLayerId) => {
            if (map.getLayer(fillLayerId)) {
              map.setPaintProperty(fillLayerId, "fill-color", String(value));
            }
          });
          return;
        }

        if (layerId === "africa" && map.getLayer(AFRICA_FILL_LAYER_ID)) {
          map.setPaintProperty(AFRICA_FILL_LAYER_ID, "fill-color", String(value));
          return;
        }

        if (layerId === "countriesLand" && map.getLayer(COUNTRIES_LAND_FILL_LAYER_ID)) {
          map.setPaintProperty(COUNTRIES_LAND_FILL_LAYER_ID, "fill-color", String(value));
          return;
        }

        if (layerId === "victoria" && map.getLayer(VICTORIA_FILL_LAYER_ID)) {
          map.setPaintProperty(VICTORIA_FILL_LAYER_ID, "fill-color", String(value));
          return;
        }

        if (layerId === "countries" && map.getLayer(COUNTRY_FILL_LAYER_ID)) {
          map.setPaintProperty(COUNTRY_FILL_LAYER_ID, "fill-color", String(value));
          return;
        }

        if (layerId === "ocean" && map.getLayer("atlas-water")) {
          map.setPaintProperty(
            "atlas-water",
            "background-color",
            buildWaterBackgroundColor(
              value,
              getLayerStyleValue(layerState, "ocean", "fillOpacity", 100),
            ),
          );
          return;
        }

        const fillLayerId = EMPIRE_FILL_LAYER_IDS[layerId];
        if (!fillLayerId || !map.getLayer(fillLayerId)) {
          return;
        }

        map.setPaintProperty(fillLayerId, "fill-color", String(value));
        return;
      }

        if (key === "lineColor") {
        if (layerId === "victoria") {
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((lineLayerId) => {
            if (map.getLayer(lineLayerId)) {
              map.setPaintProperty(lineLayerId, "line-color", String(value));
            }
          });
          return;
        }

        if (layerId === "countriesLand" && map.getLayer(COUNTRIES_LAND_LINE_LAYER_ID)) {
          map.setPaintProperty(COUNTRIES_LAND_LINE_LAYER_ID, "line-color", String(value));
          return;
        }

        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (!lineLayerId || !map.getLayer(lineLayerId)) {
          return;
        }

        if (layerId === "australia") {
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((nextLayerId) => {
            if (map.getLayer(nextLayerId)) {
              map.setPaintProperty(nextLayerId, "line-color", String(value));
            }
          });
          return;
        }

        map.setPaintProperty(lineLayerId, "line-color", String(value));
        return;
      }

      if (key === "lineOpacity") {
        if (layerId === "victoria") {
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((lineLayerId) => {
            if (map.getLayer(lineLayerId)) {
              map.setPaintProperty(lineLayerId, "line-opacity", Number(value) / 100);
            }
          });
          return;
        }

        if (layerId === "countriesLand" && map.getLayer(COUNTRIES_LAND_LINE_LAYER_ID)) {
          map.setPaintProperty(COUNTRIES_LAND_LINE_LAYER_ID, "line-opacity", Number(value) / 100);
          return;
        }

        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (!lineLayerId || !map.getLayer(lineLayerId)) {
          return;
        }

        if (layerId === "australia") {
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((nextLayerId) => {
            if (map.getLayer(nextLayerId)) {
              map.setPaintProperty(nextLayerId, "line-opacity", Number(value) / 100);
            }
          });
          return;
        }

        map.setPaintProperty(lineLayerId, "line-opacity", Number(value) / 100);
        return;
      }

      if (key === "lineWeight") {
        if (layerId === "victoria") {
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((lineLayerId) => {
            if (map.getLayer(lineLayerId)) {
              map.setPaintProperty(lineLayerId, "line-width", buildLineWidthExpression(Number(value)));
            }
          });
          return;
        }

        if (layerId === "countriesLand" && map.getLayer(COUNTRIES_LAND_LINE_LAYER_ID)) {
          map.setPaintProperty(COUNTRIES_LAND_LINE_LAYER_ID, "line-width", buildLineWidthExpression(Number(value)));
          return;
        }

        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (!lineLayerId || !map.getLayer(lineLayerId)) {
          return;
        }

        if (layerId === "australia") {
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((nextLayerId) => {
            if (map.getLayer(nextLayerId)) {
              map.setPaintProperty(nextLayerId, "line-width", buildLineWidthExpression(Number(value)));
            }
          });
          return;
        }

        map.setPaintProperty(lineLayerId, "line-width", buildLineWidthExpression(Number(value)));
        return;
      }

      if (key === "visible") {
        const visibility = value ? "visible" : "none";

        if (layerId === "ocean" && map.getLayer("atlas-water")) {
          map.setLayoutProperty("atlas-water", "visibility", getInheritedLayoutVisibility(layerState, "ocean"));
          return;
        }

        if (layerId === "earth") {
          if (map.getLayer("atlas-water")) {
            map.setLayoutProperty("atlas-water", "visibility", getInheritedLayoutVisibility(layerState, "ocean"));
          }
          if (map.getLayer(COUNTRIES_LAND_FILL_LAYER_ID)) {
            map.setLayoutProperty(COUNTRIES_LAND_FILL_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "countriesLand"));
          }
          if (map.getLayer(COUNTRIES_LAND_LINE_LAYER_ID)) {
            map.setLayoutProperty(COUNTRIES_LAND_LINE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "countriesLand"));
          }
          AUSTRALIA_FILL_LAYER_IDS.forEach((fillLayerId) => {
            if (map.getLayer(fillLayerId)) {
              map.setLayoutProperty(fillLayerId, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
            }
          });
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((lineLayerId) => {
            if (map.getLayer(lineLayerId)) {
              map.setLayoutProperty(lineLayerId, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
            }
          });
          if (map.getLayer(GRATICULES_LINE_LAYER_ID)) {
            map.setLayoutProperty(GRATICULES_LINE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "graticules"));
          }
          return;
        }

        if (layerId === "transport" && map.getLayer(TRANSPORT_RAIL_LINE_LAYER_ID)) {
          map.setLayoutProperty(TRANSPORT_RAIL_LINE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "transportRail"));
          return;
        }

        if (layerId === "countries") {
          if (map.getLayer(COUNTRY_FILL_LAYER_ID)) {
            map.setLayoutProperty(COUNTRY_FILL_LAYER_ID, "visibility", visibility);
          }
          if (map.getLayer(COUNTRY_LINE_LAYER_ID)) {
            map.setLayoutProperty(COUNTRY_LINE_LAYER_ID, "visibility", visibility);
          }
          return;
        }

        if (layerId === "transportRail" && map.getLayer(TRANSPORT_RAIL_LINE_LAYER_ID)) {
          map.setLayoutProperty(TRANSPORT_RAIL_LINE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "transportRail"));
          return;
        }

        if (layerId === "olympics") {
          if (map.getLayer(OLYMPICS_GOLD_LAYER_ID)) {
            map.setLayoutProperty(OLYMPICS_GOLD_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "olympicsGold"));
          }
          if (map.getLayer(OLYMPICS_SILVER_LAYER_ID)) {
            map.setLayoutProperty(OLYMPICS_SILVER_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "olympicsSilver"));
          }
          if (map.getLayer(OLYMPICS_BRONZE_LAYER_ID)) {
            map.setLayoutProperty(OLYMPICS_BRONZE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "olympicsBronze"));
          }
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

        if (layerId === "land" && map.getLayer(OSM_LAND_FILL_LAYER_ID)) {
          map.setLayoutProperty(OSM_LAND_FILL_LAYER_ID, "visibility", visibility);
          return;
        }

        if (layerId === "africa" && map.getLayer(AFRICA_FILL_LAYER_ID)) {
          map.setLayoutProperty(AFRICA_FILL_LAYER_ID, "visibility", visibility);
          return;
        }

        if (layerId === "countriesLand") {
          if (map.getLayer(COUNTRIES_LAND_FILL_LAYER_ID)) {
            map.setLayoutProperty(COUNTRIES_LAND_FILL_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "countriesLand"));
          }
          if (map.getLayer(COUNTRIES_LAND_LINE_LAYER_ID)) {
            map.setLayoutProperty(COUNTRIES_LAND_LINE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "countriesLand"));
          }
          return;
        }

        if (layerId === "outline" && map.getLayer(OSM_OUTLINE_LINE_LAYER_ID)) {
          map.setLayoutProperty(OSM_OUTLINE_LINE_LAYER_ID, "visibility", visibility);
          return;
        }

        if (layerId === "japan" && map.getLayer(JAPAN_OUTLINE_LINE_LAYER_ID)) {
          map.setLayoutProperty(JAPAN_OUTLINE_LINE_LAYER_ID, "visibility", visibility);
          return;
        }

        if (layerId === "victoria") {
          if (map.getLayer(VICTORIA_FILL_LAYER_ID)) {
            map.setLayoutProperty(VICTORIA_FILL_LAYER_ID, "visibility", visibility);
          }
          VICTORIA_OUTLINE_LINE_LAYER_IDS.forEach((lineLayerId) => {
            if (map.getLayer(lineLayerId)) {
              map.setLayoutProperty(lineLayerId, "visibility", visibility);
            }
          });
          return;
        }

        if (layerId === "australia") {
          AUSTRALIA_FILL_LAYER_IDS.forEach((fillLayerId) => {
            if (map.getLayer(fillLayerId)) {
              map.setLayoutProperty(fillLayerId, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
            }
          });
          AUSTRALIA_OUTLINE_LINE_LAYER_IDS.forEach((lineLayerId) => {
            if (map.getLayer(lineLayerId)) {
              map.setLayoutProperty(lineLayerId, "visibility", getInheritedLayoutVisibility(layerState, "australia"));
            }
          });
          return;
        }

        if (layerId === "graticules" && map.getLayer(GRATICULES_LINE_LAYER_ID)) {
          map.setLayoutProperty(GRATICULES_LINE_LAYER_ID, "visibility", getInheritedLayoutVisibility(layerState, "graticules"));
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

        const fillLayerId = EMPIRE_FILL_LAYER_IDS[layerId];
        if (fillLayerId && map.getLayer(fillLayerId)) {
          map.setLayoutProperty(fillLayerId, "visibility", getInheritedLayoutVisibility(layerState, layerId));
        }

        const lineLayerId = LINE_LAYER_IDS[layerId];
        if (lineLayerId && map.getLayer(lineLayerId)) {
          map.setLayoutProperty(lineLayerId, "visibility", getInheritedLayoutVisibility(layerState, layerId));
        }
        return;
      }

      if (layerId === "olympics" && key === "pointRadius") {
        [OLYMPICS_GOLD_LAYER_ID, OLYMPICS_SILVER_LAYER_ID, OLYMPICS_BRONZE_LAYER_ID].forEach((nextLayerId) => {
          if (map.getLayer(nextLayerId)) {
            map.setPaintProperty(nextLayerId, "circle-radius", getOlympicsPointRadius(layerState));
          }
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
