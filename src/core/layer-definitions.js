import { LOCAL_LAYERS } from "../config/local-layers.js";

const ROOT_PARENT_ID = "__root__";
const ROOT_ROW_IDS = ["earth", "transport", "olympics", "empires"];
const SHARED_COLOR_STORAGE_KEY = "layerv2.colors.customColors";
const SHARED_COLOR_PRESETS = ["#000000", "#FFFFFF", "#d94b4b", "#e58a2b", "#e5c84a", "#5b8c5a", "#4b6ed9", "#8c5bd6"];

function createStyleRow({
  id,
  type,
  label,
  layerId,
  storageKey = null,
  presets = [],
  defaultColor,
  defaultOpacity,
  defaultWeight,
  defaultRadius,
}) {
  const resolvedLabel = label ?? (type === "fill" ? "Fill" : type === "line" ? "Line" : "Point");
  const base = { id, type, label: resolvedLabel, storageKey, presets, min: 0, max: 100, step: 1 };
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
      radiusMin: 1, radiusMax: 30, radiusStep: 0.5,
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
  return {
    id: entry.id,
    type: "layer",
    label: entry.label,
    layerId: entry.id,
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
  };
}

function createLayerDefinitions() {
  return {
    earth: {
      id: "earth",
      label: "Earth",
      type: "layer",
      layerId: "earth",
      defaultExpanded: true,
      pinnedOrder: "start",
      rows: [
        {
          id: "ocean",
          type: "layer",
          label: "Ocean",
          layerId: "ocean",
          pinnedOrder: "start",
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
        },
        ...LOCAL_LAYERS.filter((l) => l.group === "earth").map(localLayerToRow),
        {
          id: "australia",
          type: "layer",
          label: "Australia",
          layerId: "australia",
          rows: [
            createStyleRow({
              type: "fill",
              id: "australia-fill",
              layerId: "australia",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createStyleRow({
              type: "line",
              id: "australia-line",
              layerId: "australia",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d9e4da",
            }),
          ],
        },
        {
          id: "victoria",
          type: "layer",
          label: "Victoria",
          layerId: "victoria",
          hidden: true,
          rows: [
            createStyleRow({
              type: "fill",
              id: "victoria-fill",
              layerId: "victoria",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createStyleRow({
              type: "line",
              id: "victoria-line",
              layerId: "victoria",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d9e4da",
            }),
          ],
        },
      ],
    },
    transport: {
      id: "transport",
      label: "Transport",
      type: "layer",
      layerId: "transport",
      defaultExpanded: true,
      rows: LOCAL_LAYERS.filter((l) => l.group === "transport").map(localLayerToRow),
    },
    olympics: {
      id: "olympics",
      type: "layer",
      label: "Olympics",
      layerId: "olympics",
      rows: [
        createSliderRow({
          id: "olympics-year",
          label: "Year",
          layerId: "olympics",
          key: "selectedYear",
          min: 1996,
          max: 2024,
          step: 4,
          initialValue: 2024,
        }),
        createSliderRow({
          id: "olympics-radius",
          label: "Radius",
          layerId: "olympics",
          key: "pointRadius",
          min: 1,
          max: 12,
          step: 0.1,
          valueFormat: "pixels",
          initialValue: 3.5,
        }),
        {
          id: "olympics-gold",
          type: "layer",
          label: "Gold",
          layerId: "olympicsGold",
          rows: [],
        },
        {
          id: "olympics-silver",
          type: "layer",
          label: "Silver",
          layerId: "olympicsSilver",
          rows: [],
        },
        {
          id: "olympics-bronze",
          type: "layer",
          label: "Bronze",
          layerId: "olympicsBronze",
          rows: [],
        },
      ],
    },
    empires: {
      id: "empires",
      type: "layer",
      layerId: "empires",
      label: "Empires",
      defaultExpanded: true,
      rows: [
        {
          id: "roman",
          type: "layer",
          label: "Roman",
          layerId: "roman",
          rows: [
            createStyleRow({
              type: "fill",
              id: "roman-fill",
              layerId: "roman",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#8c6a2a",
            }),
            createStyleRow({
              type: "line",
              id: "roman-line",
              layerId: "roman",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#c89a42",
            }),
          ],
        },
        {
          id: "mongol",
          type: "layer",
          label: "Mongol",
          layerId: "mongol",
          rows: [
            createStyleRow({
              type: "fill",
              id: "mongol-fill",
              layerId: "mongol",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#b85c38",
            }),
            createStyleRow({
              type: "line",
              id: "mongol-line",
              layerId: "mongol",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d96f44",
            }),
          ],
        },
        {
          id: "british",
          type: "layer",
          label: "British",
          layerId: "british",
          rows: [
            createStyleRow({
              type: "fill",
              id: "british-fill",
              layerId: "british",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#c84b31",
            }),
            createStyleRow({
              type: "line",
              id: "british-line",
              layerId: "british",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#f07a58",
            }),
          ],
        },
      ],
    },
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

  ROOT_ROW_IDS.forEach((id) => {
    const definition = layerDefinitions[id];
    if (!definition) {
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

export {
  ROOT_PARENT_ID,
  ROOT_ROW_IDS,
  SHARED_COLOR_PRESETS,
  SHARED_COLOR_STORAGE_KEY,
  createLayerDefinitions,
  createRowDefinitionIndex,
  createSliderRow,
  createStyleRow,
  getDefinitionChildOrder,
};
