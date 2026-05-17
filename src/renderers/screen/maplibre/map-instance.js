// MapLibre loaded from CDN - use global instead of import
// import maplibregl from "maplibre-gl";
// import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import {
  createGeojsonVectorSourceSpec,
  installAtlasVectorTileProtocol,
  registerGeojsonVectorTileSource,
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
const DEFAULT_OCEAN_FILL_COLOR = "#2C6F92";
const DEFAULT_OUTLINE_LINE_COLOR = "#d9e4da";
const SCALE_BAR_MAX_WIDTH_PX = 120;
const SCALE_BAR_HIDE_DELAY_MS = 1200;
const SCALE_BAR_SCREEN_OFFSET_X = 18;
const SCALE_BAR_SCREEN_OFFSET_Y = 28;
const COMPASS_ACTIVE_BEARING_THRESHOLD = 0.5;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;

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
      <svg class="map-compass-arrow" viewBox="0 0 18 20" focusable="false">
        <polygon points="9 -0.2 13.5 7 4.5 7"></polygon>
      </svg>
    </span>
    <span class="map-compass-label" aria-hidden="true">N</span>
  `;
  container.append(button);
  return button;
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

function localLayerMaplibreIds(entry) {
  return [
    ...(entry.fill ? [localLayerFillId(entry.id)] : []),
    ...(entry.line ? [localLayerLineId(entry.id)] : []),
  ];
}

function getDynamicLayerMaplibreIds(layerId, map) {
  if (!layerId || !map) {
    return [];
  }

  const sourceId = `dynamic-${layerId}`;
  return [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-circle`]
    .filter((id) => map.getLayer(id));
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

function getRuntimeTargetIdForRowDefinition(row) {
  return row?.runtimeTargetId ?? row?.runtimeLayerId ?? row?.layerRef ?? row?.layerId ?? row?.id ?? null;
}

function registerRuntimeRow(layerState, { rowId, runtimeTargetId, parentRowId = undefined } = {}) {
  if (!rowId || !runtimeTargetId) {
    return;
  }
  if (!layerState[rowId] || typeof layerState[rowId] !== "object") {
    layerState[rowId] = {};
  }
  layerState[rowId].runtimeTargetId = runtimeTargetId;
  if (parentRowId !== undefined) {
    layerState[rowId].parentRowId = parentRowId;
  }
}

function registerRuntimeChildRows(layerState, rows = [], parentRowId = null) {
  if (!Array.isArray(rows)) {
    return;
  }

  rows.forEach((row) => {
    const runtimeTargetId = getRuntimeTargetIdForRowDefinition(row);
    registerRuntimeRow(layerState, {
      rowId: row?.id,
      runtimeTargetId,
      parentRowId,
    });
    registerRuntimeChildRows(layerState, row?.rows ?? [], row?.id ?? null);
  });
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

function isEarthRuntimeTarget(layerState, runtimeTargetId) {
  const rowStateKey = findRowStateKeyForRuntimeTarget(layerState, runtimeTargetId);
  return isEarthRowOrDescendant(layerState, rowStateKey ?? runtimeTargetId);
}

function moveRowSubtree(map, layerState, rowId, moveLayer, getOrderedChildRowIds = null) {
  const movedLayerIds = new Set();
  const childOrder = getOrderedChildLayerRowIds(layerState, rowId, [], getOrderedChildRowIds);
  for (const childId of [...childOrder].reverse()) {
    const childMovedLayerIds = moveRowSubtree(map, layerState, childId, moveLayer, getOrderedChildRowIds);
    childMovedLayerIds.forEach((layerId) => movedLayerIds.add(layerId));
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

function getFirstNonEarthPhysicalLayerId(map, layerState, getOrderedChildRowIds = null) {
  const rootOrder = getOrderedChildLayerRowIds(layerState, ROOT_PARENT_ID, ROOT_ROW_IDS, getOrderedChildRowIds)
    .filter((rowId) => rowId !== EARTH_ROW_ID);
  const layerIds = [];
  rootOrder.forEach((rowId) => {
    const runtimeTargetId = getRuntimeTargetIdFromState(layerState, rowId);
    if (!isEarthRuntimeTarget(layerState, runtimeTargetId)) {
      layerIds.push(...getMaplibreLayerIdsForRuntimeTarget(runtimeTargetId, map));
    }
  });
  return layerIds.find((layerId) => map.getLayer(layerId)) ?? null;
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
  const moveLayer = (id) => {
    if (map.getLayer(id)) {
      map.moveLayer(id, undefined);
    }
  };
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
  applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
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
    if (entry.line.deferInitial) {
      return specs;
    }
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
        : { type: "geojson", data: entry.id === "land" ? getLandDetailUrl(layerState) : (entry.source.initialUrl ?? entry.source.url) },
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

function buildLineWidthExpression(weightPx) {
  return Math.max(0, Number(weightPx) || 0);
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
  // which avoids blocking the main thread with a heavy polygon union.
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

function ensureProtocol(maplibregl, manifest = []) {
  if (protocolInstalled) {
    return;
  }
  if (!maplibregl) {
    throw new Error("MapLibre global is unavailable during protocol setup.");
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

function toRegistrySource(layerId, source, sourceId = localLayerSourceId(layerId), tileSourceId = localLayerTileSourceId(layerId)) {
  if (source.kind === "pmtiles") {
    return {
      kind: "runtime-vector",
      id: sourceId,
      pmtilesId: source.pmtilesId,
      atlasVectorTileId: tileSourceId,
    };
  }
  if (source.kind === "atlas-vector") {
    return {
      kind: "atlas-vector",
      id: sourceId,
      atlasVectorTileId: tileSourceId,
    };
  }
  return { kind: "geojson", id: sourceId, url: source.url };
}

function toRegistryEntry(entry) {
  const { id, deferred, source, fill, line, circle } = entry;
  const sourceLayer = source.sourceLayer ?? null;
  const registrySource = toRegistrySource(id, source);
  const registryLineSource = line?.source
    ? toRegistrySource(id, line.source, `${localLayerSourceId(id)}-line-source`, `${localLayerTileSourceId(id)}-line`)
    : null;
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
      source: registryLineSource,
      sourceLayer: line.source?.sourceLayer ?? sourceLayer,
      defaultColor: line.color,
      defaultOpacity: line.opacity,
      defaultWeight: line.weight ?? 1,
      deferred: Boolean(line.deferInitial),
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
const LAND_LAYER_CONFIG = LOCAL_LAYERS.find((entry) => entry.id === "land") ?? null;
const LAND_DETAIL_URLS = new Map((LAND_LAYER_CONFIG?.detailLevels ?? []).map((entry) => [entry.value, entry.url]));
const LAND_DETAIL_LINE_URLS = new Map((LAND_LAYER_CONFIG?.detailLevels ?? [])
  .filter((entry) => entry.lineUrl)
  .map((entry) => [entry.value, entry.lineUrl]));

function normalizeLandDetail(detail) {
  if (detail === "50m" || detail === "10m" || detail === "osm") {
    return "high";
  }
  if (detail === "110m") {
    return "low";
  }
  return detail;
}

function getLandDetailUrl(layerState, detail = null) {
  const selectedDetail = normalizeLandDetail(detail ?? layerState?.["land-detail"]?.detail ?? LAND_LAYER_CONFIG?.defaultDetail ?? "low");
  return LAND_DETAIL_URLS.get(selectedDetail) ?? LAND_LAYER_CONFIG?.source?.url ?? "/data/world-atlas/ne_110m_land.geojson";
}

function getLandDetailLineUrl(layerState, detail = null) {
  const selectedDetail = normalizeLandDetail(detail ?? layerState?.["land-detail"]?.detail ?? LAND_LAYER_CONFIG?.defaultDetail ?? "low");
  return LAND_DETAIL_LINE_URLS.get(selectedDetail)
    ?? LAND_LAYER_CONFIG?.line?.source?.url
    ?? getLandDetailUrl(layerState, detail);
}

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

function ensureRegistrySource(map, manifest, source) {
  if (!source || map.getSource(source.id)) {
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
}

function attachStandardLayer(map, layerState, manifest, entry) {
  const { source, fill, line, layerId } = entry;

  ensureRegistrySource(map, manifest, source);

  if (fill && !map.getLayer(fill.id)) {
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

  if (line && !map.getLayer(line.id)) {
    const lineSource = layerId === "land" && line.source
      ? { ...line.source, url: getLandDetailLineUrl(layerState) }
      : line.source ?? source;
    ensureRegistrySource(map, manifest, lineSource);
    const lineSpec = {
      id: line.id,
      type: "line",
      source: lineSource.id,
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

function createMapInstance({ container, manifest = [], viewState, initialLayerState = {}, getOrderedChildRowIds = null }) {
  if (!container) {
    return null;
  }

  // Use MapLibre from CDN
  const maplibregl = window.maplibregl;

  ensureProtocol(maplibregl, manifest);
  const layerState = structuredClone(initialLayerState);
  const scaleOverlay = createScaleOverlay(container);
  const compassOverlay = createCompassOverlay(container);
  let interactionOverlayHideTimeout = null;

  function clearInteractionOverlayHideTimeout() {
    if (interactionOverlayHideTimeout) {
      window.clearTimeout(interactionOverlayHideTimeout);
      interactionOverlayHideTimeout = null;
    }
  }

  function showInteractionOverlays() {
    clearInteractionOverlayHideTimeout();
    updateScaleOverlay(map, scaleOverlay);
    updateCompassOverlay(map, compassOverlay);
    scaleOverlay.classList.add("is-visible");
    compassOverlay.classList.add("is-visible");
  }

  function hideInteractionOverlaysSoon() {
    clearInteractionOverlayHideTimeout();
    interactionOverlayHideTimeout = window.setTimeout(() => {
      scaleOverlay.classList.remove("is-visible");
      compassOverlay.classList.remove("is-visible");
      interactionOverlayHideTimeout = null;
    }, SCALE_BAR_HIDE_DELAY_MS);
  }

  const initialZoom = viewState?.projectionId === "globe"
    ? getInitialGlobeZoom(container, viewState.zoom)
    : viewState.zoom;

  const map = new maplibregl.Map({
    container,
    style: buildStyle(layerState),
    validateStyle: false,
    center: [viewState.center.longitude, viewState.center.latitude],
    zoom: initialZoom,
    minZoom: 0.7,
    bearing: viewState.bearing,
    pitch: viewState.pitch,
    attributionControl: false,
  });
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
    showInteractionOverlays();
  });
  map.on("move", () => {
    showInteractionOverlays();
  });
  map.on("moveend", () => {
    showInteractionOverlays();
    hideInteractionOverlaysSoon();
  });
  map.on("resize", () => {
    if (scaleOverlay.classList.contains("is-visible")) {
      updateScaleOverlay(map, scaleOverlay);
    }
    updateCompassOverlay(map, compassOverlay);
  });
  compassOverlay.addEventListener("click", () => {
    map.easeTo({ bearing: 0 });
  });
  map.on("load", () => {
    updateCompassOverlay(map, compassOverlay);
    // First paint already has water, low-detail land, and graticules from the
    // initial style. Attach the remaining non-deferred local layers directly so
    // Earth reaches a complete base before user datasets restore.
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
      } catch (error) {
        console.error("Failed to attach primary layers.", error);
      }
    })();

    // Phase 2: deferred layers. Avoid startup tile prewarm here because
    // GeoJSONVT index construction is main-thread work.
    const loadDeferredLayers = async () => {
      try {
        // Deferred standard Earth layers first.
        await Promise.all(
          STANDARD_LAYER_REGISTRY
            .filter((entry) => entry.deferred)
            .map((entry) => attachStandardLayer(map, layerState, manifest, entry))
        );

        applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
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

  function attachDynamicLayer(layerId, geojson, tilesUrl, style, { sourceLayerId = null, featureFilter = null, geometryTypes = [], geometryType = null, visible = true, parentRowId = undefined, rowId = null, childRows = [] } = {}) {
    if (!layerId) {
      return;
    }

    const resolvedGeometryTypes = normalizeDynamicGeometryTypes(geometryTypes, geometryType, style);
    const resolvedRowId = rowId ?? layerId;
    registerRuntimeRow(layerState, {
      rowId: resolvedRowId,
      runtimeTargetId: layerId,
      parentRowId,
    });
    registerRuntimeChildRows(layerState, childRows, resolvedRowId);

    if (!sourceLayerId || !featureFilter) {
      const sourceId = `dynamic-${layerId}`;
      if (map.getSource(sourceId)) {
        applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
        return;
      }

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
      applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
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
    applyRuntimeTargetVisibility(layerId, map, layerState);
    ["fill", "line", "point-fill", "point-stroke"].forEach((subtarget) => {
      applyRuntimeTargetVisibility(`${layerId}::${subtarget}`, map, layerState);
    });
    applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
  }

  return {
    destroy() {
      clearInteractionOverlayHideTimeout();
      scaleOverlay.remove();
      compassOverlay.remove();
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
    getCameraState() {
      const center = map.getCenter();
      return {
        center: {
          longitude: center.lng,
          latitude: center.lat,
        },
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
    },
    getZoom() {
      return map.getZoom();
    },
    reorderLayerGroup(parentId, orderedLayerIds) {
      if (layerState[parentId]) {
        layerState[parentId].rowOrder = orderedLayerIds;
      }
      const getLiveOrderedChildRowIds = (candidateParentId) => {
        if (candidateParentId === parentId) {
          return orderedLayerIds;
        }
        return typeof getOrderedChildRowIds === "function"
          ? getOrderedChildRowIds(candidateParentId)
          : null;
      };
      applyFullLayerOrder(map, layerState, getLiveOrderedChildRowIds);
    },
    reapplyFullOrder() {
      applyFullLayerOrder(map, layerState, getOrderedChildRowIds);
    },
    reapplyRowSubtreeOrder(rowId) {
      applyRowSubtreeOrder(map, layerState, rowId, getOrderedChildRowIds);
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
        return;
      }

      // ── Runtime-target-driven styles and special background targets ────────
      const runtimeStyleApplied = applyRuntimeTargetStyle(layerId, key, value, map, layerState);
      if (runtimeStyleApplied) {
        return;
      }

      // ── Group parent visibility cascades ─────────────────────────────────
      if (key === "visible") {
        applyRuntimeTargetVisibility(layerId, map, layerState);
        const rowStateKey = findRowStateKeyForRuntimeTarget(layerState, layerId);
        getDescendantRuntimeTargetIds(layerState, rowStateKey).forEach((runtimeTargetId) => {
          applyRuntimeTargetVisibility(runtimeTargetId, map, layerState);
        });
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
    },
    setEarthLandDetail(detail) {
      if (!layerState["land-detail"] || typeof layerState["land-detail"] !== "object") {
        layerState["land-detail"] = {};
      }
      layerState["land-detail"].detail = detail;
      const source = map.getSource(localLayerSourceId("land"));
      const detailUrl = getLandDetailUrl(layerState, detail);
      if (source && "setData" in source) {
        source.setData(detailUrl);
      }
      const lineSource = map.getSource(`${localLayerSourceId("land")}-line-source`);
      const detailLineUrl = getLandDetailLineUrl(layerState, detail);
      if (lineSource && "setData" in lineSource) {
        lineSource.setData(detailLineUrl);
      }
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
    },
  };
}

export { createMapInstance, isRealPmtilesUrl };
