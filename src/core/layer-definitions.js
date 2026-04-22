import { LOCAL_LAYERS } from "../config/local-layers.js";

const ROOT_PARENT_ID = "__root__";
const ROOT_ROW_IDS = ["earth"];
const SHARED_COLOR_STORAGE_KEY = "layerv2.colors.customColors";
const SHARED_COLOR_PRESETS = ["#000000", "#FFFFFF", "#d94b4b", "#e58a2b", "#e5c84a", "#5b8c5a", "#4b6ed9", "#8c5bd6"];
const DECK_EARTH_ROW_ID = "deck-earth";
const DECK_EARTH_TARGET_IDS = {
  ocean: "deck-earth-ocean",
  land: "deck-earth-land",
  graticules: "deck-earth-graticules",
};

function normalizeGeometryTypes(geometryTypes = [], geometryType = "mixed") {
  const source = Array.isArray(geometryTypes) && geometryTypes.length
    ? geometryTypes
    : [geometryType];
  const normalized = source.map((value) => {
    if (value === "polygon" || value === "area") return "polygon";
    if (value === "line") return "line";
    if (value === "point") return "point";
    return null;
  }).filter(Boolean);

  return ["point", "line", "polygon"].filter((family, index, families) => (
    normalized.includes(family) && families.indexOf(family) === index
  ));
}

function collapseGeometryTypes(geometryTypes = []) {
  if (geometryTypes.length === 1) {
    return geometryTypes[0];
  }
  return "mixed";
}

function createDataRow({
  id,
  label,
  layerId,
  rows = [],
  hidden = false,
  defaultExpanded = false,
  pinnedOrder = null,
  layerRef = null,
  runtimeLayerId = null,
  geometryTypes = [],
  geometryType = "mixed",
}) {
  const resolvedGeometryTypes = normalizeGeometryTypes(geometryTypes, geometryType);
  return {
    id,
    type: "layer",
    kind: "data",
    label,
    layerId,
    runtimeLayerId: runtimeLayerId ?? layerId,
    layerRef,
    geometryTypes: resolvedGeometryTypes,
    geometryType: collapseGeometryTypes(resolvedGeometryTypes),
    hidden,
    defaultExpanded,
    ...(pinnedOrder ? { pinnedOrder } : {}),
    rows,
  };
}

function createFilterRow({
  id,
  label,
  field = "",
  op = "==",
  value = "",
  ui = null,
}) {
  return {
    id,
    type: "filter",
    kind: "filter",
    label,
    field,
    op,
    value,
    ...(ui ? { ui } : {}),
  };
}

function createSortRow({
  id,
  label,
  field = "",
  direction = "asc",
  ui = null,
}) {
  return {
    id,
    type: "sort",
    kind: "sort",
    label,
    field,
    direction,
    ...(ui ? { ui } : {}),
  };
}

function createStyleRow({
  id,
  type,
  label,
  layerId,
  runtimeTargetId = null,
  storageKey = null,
  presets = [],
  defaultColor,
  defaultOpacity,
  defaultWeight,
  defaultRadius,
}) {
  const resolvedLabel = label ?? (type === "fill" ? "Fill" : type === "line" ? "Line" : "Point");
  const resolvedRuntimeTargetId = runtimeTargetId
    ?? (type === "fill"
      ? `${layerId}::fill`
      : type === "line"
        ? `${layerId}::line`
        : `${layerId}::point-fill`);
  const base = {
    id,
    type,
    label: resolvedLabel,
    runtimeTargetId: resolvedRuntimeTargetId,
    storageKey,
    presets,
    min: 0,
    max: 100,
    step: 1,
  };
  if (type === "fill") {
    return {
      ...base,
      valueFormat: "percent",
      colorTarget: { kind: "layer-style", layerId, key: "fillColor" },
      opacityTarget: { kind: "layer-style", layerId, key: "fillOpacity" },
      initialState: { fillColor: defaultColor ?? "#000000", fillOpacity: defaultOpacity ?? 100 },
    };
  }
  if (type === "line") {
    return {
      ...base,
      valueFormat: "percent",
      weightMin: 0, weightMax: 10, weightStep: 0.1,
      colorTarget: { kind: "layer-style", layerId, key: "lineColor" },
      opacityTarget: { kind: "layer-style", layerId, key: "lineOpacity" },
      weightTarget: { kind: "layer-style", layerId, key: "lineWeight" },
      initialState: { lineColor: defaultColor ?? "#000000", lineOpacity: defaultOpacity ?? 100, lineWeight: defaultWeight ?? 1 },
    };
  }
  if (type === "point") {
    return {
      ...base,
      valueFormat: "percent",
      radiusMin: 1, radiusMax: 20, radiusStep: 0.1,
      colorTarget: { kind: "layer-style", layerId, key: "pointColor" },
      opacityTarget: { kind: "layer-style", layerId, key: "pointOpacity" },
      radiusTarget: { kind: "layer-style", layerId, key: "pointRadius" },
      initialState: { pointColor: defaultColor ?? "#e74c3c", pointOpacity: defaultOpacity ?? 80, pointRadius: defaultRadius ?? 6 },
    };
  }
  return null;
}

function createSliderRow({
  id,
  label,
  layerId,
  key,
  min,
  max,
  step = 1,
  valueFormat = null,
  initialValue,
}) {
  return {
    id,
    type: "slider",
    label,
    target: { kind: "layer-style", layerId, key },
    min,
    max,
    step,
    valueFormat,
    initialState: {
      [key]: initialValue,
    },
  };
}

function localLayerToRow(entry) {
  return createDataRow({
    id: entry.id,
    label: entry.label,
    layerId: entry.id,
    geometryType: entry.fill ? "polygon" : "line",
    hidden: entry.defaultVisible === false,
    rows: [
      ...(entry.fill ? [createStyleRow({
        id: `${entry.id}-fill`, type: "fill",
        layerId: entry.id,
        storageKey: SHARED_COLOR_STORAGE_KEY,
        presets: SHARED_COLOR_PRESETS,
        defaultColor: entry.fill.color,
        defaultOpacity: entry.fill.opacity,
      })] : []),
      ...(entry.line ? [createStyleRow({
        id: `${entry.id}-line`, type: "line",
        layerId: entry.id,
        storageKey: SHARED_COLOR_STORAGE_KEY,
        presets: SHARED_COLOR_PRESETS,
        defaultColor: entry.line.color,
        defaultOpacity: entry.line.opacity,
        defaultWeight: entry.line.weight,
      })] : []),
    ],
  });
}

function createLayerDefinitions() {
  return {
    earth: createDataRow({
      id: "earth",
      label: "Earth",
      layerId: "earth",
      defaultExpanded: true,
      pinnedOrder: "end",
      rows: [
        createDataRow({
          id: "ocean",
          label: "Ocean",
          layerId: "ocean",
          pinnedOrder: "end",
          rows: [
            createStyleRow({
              type: "fill",
              id: "ocean-fill",
              layerId: "ocean",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#2C6F92",
            }),
          ],
        }),
        ...LOCAL_LAYERS.filter((l) => l.group === "earth").map(localLayerToRow),
      ],
    }),
    [DECK_EARTH_ROW_ID]: createDataRow({
      id: DECK_EARTH_ROW_ID,
      label: "Globe",
      layerId: DECK_EARTH_ROW_ID,
      hidden: true,
      defaultExpanded: true,
      rows: [
        createStyleRow({
          id: "deck-earth-ocean-fill",
          type: "fill",
          label: "Ocean",
          layerId: DECK_EARTH_TARGET_IDS.ocean,
          runtimeTargetId: `${DECK_EARTH_TARGET_IDS.ocean}::fill`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#2C6F92",
          defaultOpacity: 100,
        }),
        createStyleRow({
          id: "deck-earth-land-fill",
          type: "fill",
          label: "Land",
          layerId: DECK_EARTH_TARGET_IDS.land,
          runtimeTargetId: `${DECK_EARTH_TARGET_IDS.land}::fill`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#6EAA6E",
          defaultOpacity: 100,
        }),
        createStyleRow({
          id: "deck-earth-land-line",
          type: "line",
          label: "Outline",
          layerId: DECK_EARTH_TARGET_IDS.land,
          runtimeTargetId: `${DECK_EARTH_TARGET_IDS.land}::line`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#D9E4DA",
          defaultOpacity: 100,
          defaultWeight: 1,
        }),
        createStyleRow({
          id: "deck-earth-graticules-line",
          type: "line",
          label: "Graticules",
          layerId: DECK_EARTH_TARGET_IDS.graticules,
          runtimeTargetId: `${DECK_EARTH_TARGET_IDS.graticules}::line`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#8FA9BC",
          defaultOpacity: 100,
          defaultWeight: 1,
        }),
      ],
    }),
  };
}

function createRowDefinitionIndex(layerDefinitions) {
  const byId = new Map();

  function indexRows(rows = []) {
    rows.forEach((row) => {
      byId.set(row.id, row);
      if (Array.isArray(row.rows) && row.rows.length) {
        indexRows(row.rows);
      }
    });
  }

  Object.values(layerDefinitions).forEach((definition) => {
    if (!definition?.id) {
      return;
    }
    byId.set(definition.id, definition);
    indexRows(definition.rows);
  });

  return byId;
}

function getDefinitionChildOrder(definitionIndex, parentId, { includeHidden = false } = {}) {
  if (parentId === ROOT_PARENT_ID) {
    return includeHidden ? ROOT_ROW_IDS.slice() : ROOT_ROW_IDS.slice();
  }

  const parent = definitionIndex.get(parentId);
  if (!parent || !Array.isArray(parent.rows)) {
    return [];
  }

  return parent.rows
    .filter((row) => includeHidden || row.hidden !== true)
    .map((row) => row.id);
}

function getRowStateKey(row) {
  return row?.type === "layer" ? (row.id ?? row.layerId ?? null) : row?.id ?? null;
}

function getRowRuntimeTargetId(row) {
  return row?.runtimeTargetId ?? row?.runtimeLayerId ?? row?.layerId ?? row?.id ?? null;
}

export {
  ROOT_PARENT_ID,
  ROOT_ROW_IDS,
  DECK_EARTH_ROW_ID,
  DECK_EARTH_TARGET_IDS,
  SHARED_COLOR_PRESETS,
  SHARED_COLOR_STORAGE_KEY,
  createLayerDefinitions,
  createDataRow,
  createFilterRow,
  createRowDefinitionIndex,
  createSortRow,
  createSliderRow,
  createStyleRow,
  getDefinitionChildOrder,
  getRowRuntimeTargetId,
  getRowStateKey,
};
