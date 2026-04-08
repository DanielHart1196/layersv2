import { LOCAL_LAYERS } from "../config/local-layers.js";

function createLayerModel() {
  const STORAGE_KEY = "layerv2.layerState.v1";
  const DEFS_STORAGE_KEY = "layerv2.dynamicDefs.v1";
  const ROOT_PARENT_ID = "__root__";
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
        colorTarget:   { kind: "layer-style", layerId, key: "fillColor" },
        opacityTarget: { kind: "layer-style", layerId, key: "fillOpacity" },
        initialState: { fillColor: defaultColor ?? "#000000", fillOpacity: defaultOpacity ?? 100 },
      };
    }
    if (type === "line") {
      return {
        ...base,
        valueFormat: "percent",
        weightMin: 0, weightMax: 10, weightStep: 0.1,
        colorTarget:   { kind: "layer-style", layerId, key: "lineColor" },
        opacityTarget: { kind: "layer-style", layerId, key: "lineOpacity" },
        weightTarget:  { kind: "layer-style", layerId, key: "lineWeight" },
        initialState: { lineColor: defaultColor ?? "#000000", lineOpacity: defaultOpacity ?? 100, lineWeight: defaultWeight ?? 1 },
      };
    }
    if (type === "point") {
      return {
        ...base,
        valueFormat: "percent",
        radiusMin: 1, radiusMax: 30, radiusStep: 0.5,
        colorTarget:   { kind: "layer-style", layerId, key: "pointColor" },
        opacityTarget: { kind: "layer-style", layerId, key: "pointOpacity" },
        radiusTarget:  { kind: "layer-style", layerId, key: "pointRadius" },
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

  const layerDefinitions = {
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
            createStyleRow({ type: "fill",
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
            createStyleRow({ type: "fill",
              id: "australia-fill",
              layerId: "australia",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createStyleRow({ type: "line",
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
            createStyleRow({ type: "fill",
              id: "victoria-fill",
              layerId: "victoria",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createStyleRow({ type: "line",
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
            createStyleRow({ type: "fill",
              id: "roman-fill",
              layerId: "roman",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#8c6a2a",
            }),
            createStyleRow({ type: "line",
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
            createStyleRow({ type: "fill",
              id: "mongol-fill",
              layerId: "mongol",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#b85c38",
            }),
            createStyleRow({ type: "line",
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
            createStyleRow({ type: "fill",
              id: "british-fill",
              layerId: "british",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#c84b31",
            }),
            createStyleRow({ type: "line",
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

  const ROOT_ROW_IDS = ["earth", "transport", "olympics", "empires"];
  const rootDynamicRows = []; // top-level user-added layers
  const dynamicIds = new Set(); // IDs of all dynamically added rows
  const staticParentAdditions = new Map(); // parentId → [rows] for rows added to static parents
  const rowDefinitionsById = new Map();

  function indexRowDefinitions(rows = []) {
    rows.forEach((row) => {
      rowDefinitionsById.set(row.id, row);
      if (Array.isArray(row.rows) && row.rows.length) {
        indexRowDefinitions(row.rows);
      }
    });
  }

  ROOT_ROW_IDS.forEach((id) => {
    const rootDefinition = layerDefinitions[id];
    if (!rootDefinition) {
      return;
    }
    rowDefinitionsById.set(rootDefinition.id, rootDefinition);
    indexRowDefinitions(rootDefinition.rows);
  });

  function getParentRows(parentId) {
    if (parentId === ROOT_PARENT_ID) {
      return [
        ...ROOT_ROW_IDS.map((id) => layerDefinitions[id]).filter(Boolean),
        ...rootDynamicRows,
      ];
    }

    const parent = rowDefinitionsById.get(parentId) ?? layerDefinitions[parentId];
    return parent?.rows ?? [];
  }

  function getOrderableChildRows(parentId) {
    return getParentRows(parentId).filter((row) => row.hidden !== true);
  }

  function getDefaultChildOrder(parentId) {
    const parent = rowDefinitionsById.get(parentId) ?? layerDefinitions[parentId];
    if (!parent || !parent.rows) {
      return [];
    }
    
    return parent.rows.map((row) => row.id);
  }

  function normalizeChildRowOrder(parentId, candidateOrder = null) {
    const orderableRows = getOrderableChildRows(parentId);
    if (!orderableRows.length) {
      return [];
    }
    const rowIds = orderableRows.map((row) => row.id);
    const pinnedStartIds = orderableRows
      .filter((row) => row.pinnedOrder === "start")
      .map((row) => row.id);
    const pinnedEndIds = orderableRows
      .filter((row) => row.pinnedOrder === "end")
      .map((row) => row.id);
    const movableIds = rowIds.filter((rowId) => !pinnedStartIds.includes(rowId) && !pinnedEndIds.includes(rowId));
    const movableOrderSource = Array.isArray(candidateOrder)
      ? candidateOrder
      : Array.isArray(layerState[parentId]?.rowOrder)
        ? layerState[parentId].rowOrder
        : getDefaultChildOrder(parentId);

    const movableOrdered = movableOrderSource.filter((rowId) => movableIds.includes(rowId));
    movableIds.forEach((rowId) => {
      if (!movableOrdered.includes(rowId)) {
        movableOrdered.push(rowId);
      }
    });

    return [...pinnedStartIds, ...movableOrdered, ...pinnedEndIds];
  }

  function buildDefaultLayerState() {
    const state = {
      [ROOT_PARENT_ID]: {
        rowOrder: getDefaultChildOrder(ROOT_PARENT_ID),
      },
      earth: {
        rowOrder: getDefaultChildOrder("earth"),
      },
    };

    const ensureLayerState = (layerId) => {
      if (!state[layerId]) {
        state[layerId] = {};
      }
      return state[layerId];
    };

    const applyRowDefaults = (row) => {
      if (row?.type === "layer") {
        const layerRecord = ensureLayerState(row.layerId);
        if (typeof layerRecord.expanded !== "boolean") {
          layerRecord.expanded = Boolean(row.defaultExpanded);
        }
        if (typeof layerRecord.visible !== "boolean") {
          layerRecord.visible = true;
        }
        if (Array.isArray(row.rows) && row.rows.length && !Array.isArray(layerRecord.rowOrder)) {
          layerRecord.rowOrder = getDefaultChildOrder(row.id);
        }
        row.rows?.forEach(applyRowDefaults);
        return;
      }

      if (!row?.initialState) {
        return;
      }

      // Per-row visible toggle — keyed by the row's own ID.
      const rowRecord = ensureLayerState(row.id);
      if (typeof rowRecord.rowVisible !== "boolean") {
        rowRecord.rowVisible = true;
      }

      const layerId =
        row.colorTarget?.layerId ??
        row.opacityTarget?.layerId ??
        row.weightTarget?.layerId ??
        row.target?.layerId;
      if (!layerId) {
        return;
      }

      const layerRecord = ensureLayerState(layerId);
      Object.entries(row.initialState).forEach(([key, value]) => {
        if (layerRecord[key] === undefined) {
          layerRecord[key] = value;
        }
      });
    };

    Object.values(layerDefinitions).forEach((definition) => {
      if (definition?.type === "layer") {
        applyRowDefaults(definition);
        return;
      }
      definition.rows?.forEach(applyRowDefaults);
    });

    return state;
  }

  const layerState = hydrateLayerState();
  hydrateDynamicDefs(); // must run after hydrateLayerState so state exists for dynamic rows
  layerState[ROOT_PARENT_ID].rowOrder = normalizeChildRowOrder(ROOT_PARENT_ID, layerState[ROOT_PARENT_ID]?.rowOrder);
  layerState.earth.rowOrder = normalizeChildRowOrder("earth", layerState.earth?.rowOrder);
  layerState.transport.rowOrder = normalizeChildRowOrder("transport", layerState.transport?.rowOrder);
  layerState.olympics.rowOrder = normalizeChildRowOrder("olympics", layerState.olympics?.rowOrder);
  layerState.empires.rowOrder = normalizeChildRowOrder("empires", layerState.empires?.rowOrder);

  function hydrateLayerState() {
    const baseState = buildDefaultLayerState();

    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) {
        return baseState;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return baseState;
      }

      Object.entries(baseState).forEach(([layerId, defaults]) => {
        const persisted = parsed[layerId];
        if (!persisted || typeof persisted !== "object") {
          return;
        }

        Object.keys(defaults).forEach((key) => {
          if (persisted[key] !== undefined) {
            baseState[layerId][key] = persisted[key];
          }
        });

        if (typeof baseState[layerId].lineWeight === "number" && baseState[layerId].lineWeight > 10) {
          baseState[layerId].lineWeight = Math.max(0, Math.min(10, baseState[layerId].lineWeight / 100));
        }
      });

      // Also restore state for dynamic layers (not in baseState).
      Object.entries(parsed).forEach(([layerId, state]) => {
        if (!baseState[layerId] && state && typeof state === "object") {
          baseState[layerId] = { ...state };
        }
      });
    } catch (_error) {
      return baseState;
    }

    return baseState;
  }

  function persistLayerState() {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(layerState));
    } catch (_error) {
      // Ignore storage failures and keep the runtime usable.
    }
  }

  function persistDynamicDefs() {
    try {
      const defs = {
        rootRows: rootDynamicRows,
        staticAdditions: Object.fromEntries(staticParentAdditions),
      };
      window.localStorage?.setItem(DEFS_STORAGE_KEY, JSON.stringify(defs));
    } catch (_error) {
      // ignore
    }
  }

  function hydrateDynamicDefs() {
    try {
      const raw = window.localStorage?.getItem(DEFS_STORAGE_KEY);
      if (!raw) return;
      const defs = JSON.parse(raw);
      if (!defs || typeof defs !== "object") return;

      // Restore root-level dynamic rows.
      (defs.rootRows ?? []).forEach((row) => {
        rootDynamicRows.push(row);
        dynamicIds.add(row.id);
        indexRowDefinitions([row]);
        // layerState for this row was already restored by hydrateLayerState.
      });

      // Restore rows added to static parents (e.g. filter under "earth").
      Object.entries(defs.staticAdditions ?? {}).forEach(([parentId, rows]) => {
        const parent = rowDefinitionsById.get(parentId) ?? layerDefinitions[parentId];
        if (!parent) return;
        if (!Array.isArray(parent.rows)) parent.rows = [];
        const correctLayerId = parent.layerRef ?? null;
        rows.forEach((row) => {
          // Migrate: fix style target layerIds that were stored before the mapLayerId fix.
          if (correctLayerId) migrateRowTargets(row, correctLayerId);
          parent.rows.push(row);
          rowDefinitionsById.set(row.id, row);
          dynamicIds.add(row.id);
        });
        staticParentAdditions.set(parentId, rows);
      });
    } catch (_error) {
      // ignore corrupt storage
    }
  }

  function getRootRows() {
    return getChildRows(ROOT_PARENT_ID);
  }

  function getRootParentId() {
    return ROOT_PARENT_ID;
  }

  function getChildRows(parentId) {
    if (!getParentRows(parentId).length) {
      return [];
    }

    const visibleRows = getOrderableChildRows(parentId);
    const rowById = new Map(visibleRows.map((row) => [row.id, row]));
    const persistedOrder = normalizeChildRowOrder(parentId);
    const orderedRows = persistedOrder
      .map((id) => rowById.get(id))
      .filter(Boolean);

    visibleRows.forEach((row) => {
      if (!orderedRows.includes(row)) {
        orderedRows.push(row);
      }
    });

    return orderedRows;
  }

  function getDefinitions() {
    return structuredClone(layerDefinitions);
  }

  function getState() {
    return structuredClone(layerState);
  }

  function getRowValue(row) {
    if (row?.type === "fill") {
      return {
        color: layerState[row.colorTarget?.layerId]?.[row.colorTarget?.key] ?? null,
        opacity: layerState[row.opacityTarget?.layerId]?.[row.opacityTarget?.key] ?? null,
      };
    }

    if (row?.type === "line") {
      return {
        color: layerState[row.colorTarget?.layerId]?.[row.colorTarget?.key] ?? null,
        opacity: layerState[row.opacityTarget?.layerId]?.[row.opacityTarget?.key] ?? null,
        weight: layerState[row.weightTarget?.layerId]?.[row.weightTarget?.key] ?? null,
      };
    }

    if (row?.type === "point") {
      return {
        color: layerState[row.colorTarget?.layerId]?.[row.colorTarget?.key] ?? null,
        opacity: layerState[row.opacityTarget?.layerId]?.[row.opacityTarget?.key] ?? null,
        radius: layerState[row.radiusTarget?.layerId]?.[row.radiusTarget?.key] ?? null,
      };
    }

    const target = row?.target;
    if (target?.kind !== "layer-style") {
      return null;
    }

    return layerState[target.layerId]?.[target.key] ?? null;
  }

  function setRowValue(row, nextValue) {
    const target = row?.target;
    if (target?.kind !== "layer-style") {
      return null;
    }

    if (!layerState[target.layerId]) {
      return null;
    }

    layerState[target.layerId][target.key] = nextValue;
    persistLayerState();
    return {
      layerId: target.layerId,
      key: target.key,
      value: nextValue,
    };
  }

  function isExpanded(layerId) {
    return layerState[layerId]?.expanded === true;
  }

  function toggleExpanded(layerId) {
    const record = layerState[layerId];
    if (!record || typeof record.expanded !== "boolean") {
      return null;
    }

    record.expanded = !record.expanded;
    persistLayerState();
    return record.expanded;
  }

  function toggleVisibility(layerId) {
    const record = layerState[layerId];
    if (!record || typeof record.visible !== "boolean") {
      return null;
    }

    record.visible = !record.visible;
    persistLayerState();
    return record.visible;
  }

  function isRowVisible(rowId) {
    return layerState[rowId]?.rowVisible !== false;
  }

  function toggleRowVisible(rowId) {
    if (!layerState[rowId]) layerState[rowId] = {};
    const current = layerState[rowId].rowVisible !== false;
    layerState[rowId].rowVisible = !current;
    persistLayerState();
    return !current;
  }

  function reorderChildRow(parentId, rowId, targetRowId, placement = "before") {
    if (!getParentRows(parentId).length) {
      return null;
    }

    const currentOrder = getChildRows(parentId).map((row) => row.id);
    const fromIndex = currentOrder.indexOf(rowId);
    const targetIndex = currentOrder.indexOf(targetRowId);
    if (fromIndex === -1 || targetIndex === -1 || rowId === targetRowId) {
      return null;
    }

    const nextOrder = currentOrder.slice();
    const [moved] = nextOrder.splice(fromIndex, 1);
    let insertIndex = nextOrder.indexOf(targetRowId);
    if (insertIndex === -1) {
      return null;
    }
    if (placement === "after") {
      insertIndex += 1;
    }
    nextOrder.splice(insertIndex, 0, moved);

    layerState[parentId].rowOrder = nextOrder;
    persistLayerState();
    return nextOrder.slice();
  }

  // Fixes style target layerIds on a row — used during hydration to repair rows
  // created before the mapLayerId fix (when uid was used instead of layerRef).
  function migrateRowTargets(row, correctLayerId) {
    const fix = (t) => { if (t?.kind === "layer-style" && t.layerId !== correctLayerId) t.layerId = correctLayerId; };
    fix(row.colorTarget);
    fix(row.opacityTarget);
    fix(row.weightTarget);
    fix(row.radiusTarget);
    fix(row.target);
  }

  // Removes a dynamic row from its parent. Returns the removed row or null if not removable.
  function removeRow(rowId, parentId) {
    if (!dynamicIds.has(rowId)) return null;

    if (parentId === ROOT_PARENT_ID) {
      const idx = rootDynamicRows.findIndex((r) => r.id === rowId);
      if (idx !== -1) rootDynamicRows.splice(idx, 1);
    } else {
      const parentDef = rowDefinitionsById.get(parentId) ?? layerDefinitions[parentId];
      if (parentDef?.rows) {
        const idx = parentDef.rows.findIndex((r) => r.id === rowId);
        if (idx !== -1) parentDef.rows.splice(idx, 1);
      }
      if (staticParentAdditions.has(parentId)) {
        const additions = staticParentAdditions.get(parentId).filter((r) => r.id !== rowId);
        if (additions.length) staticParentAdditions.set(parentId, additions);
        else staticParentAdditions.delete(parentId);
      }
    }

    rowDefinitionsById.delete(rowId);
    dynamicIds.delete(rowId);
    persistDynamicDefs();
    persistLayerState();
    return rowId;
  }

  // Appends a new child row to any parent row (layer or group).
  // config is used by filter/sort types.
  function addRowToLayer(layerId, rowType, config = {}) {
    const parentDef = rowDefinitionsById.get(layerId) ?? layerDefinitions[layerId];
    if (!parentDef || parentDef.type !== "layer") {
      return null;
    }

    const uid = `${layerId}-dyn-${rowType}-${Date.now()}`;
    // Style targets must reference the actual map layer ID.
    // For Supabase-backed rows, the map uses layerRef (UUID); the model row uses its own uid.
    const mapLayerId = parentDef.layerRef ?? layerId;
    let newRow;
    if (rowType === "fill") {
      newRow = createStyleRow({ type: "fill",
        id: uid,
        label: "Fill",
        layerId: mapLayerId,
        storageKey: SHARED_COLOR_STORAGE_KEY,
        presets: SHARED_COLOR_PRESETS,
        defaultColor: "#8C6A2A",
        defaultOpacity: 80,
      });
    } else if (rowType === "line") {
      newRow = createStyleRow({ type: "line",
        id: uid,
        label: "Line",
        layerId: mapLayerId,
        storageKey: SHARED_COLOR_STORAGE_KEY,
        presets: SHARED_COLOR_PRESETS,
        defaultColor: "#000000",
        defaultOpacity: 100,
        defaultWeight: 1,
      });
    } else if (rowType === "point") {
      newRow = createStyleRow({ type: "point",
        id: uid,
        label: "Point",
        layerId: mapLayerId,
        storageKey: SHARED_COLOR_STORAGE_KEY,
        presets: SHARED_COLOR_PRESETS,
        defaultColor: "#e74c3c",
        defaultOpacity: 80,
        defaultRadius: 6,
      });
    } else if (rowType === "slider") {
      newRow = createSliderRow({
        id: uid,
        label: "Slider",
        layerId,
        key: `dyn_${uid}`,
        min: 0,
        max: 100,
        step: 1,
        valueFormat: "percent",
        initialValue: 50,
      });
    } else if (rowType === "filter") {
      newRow = {
        id: uid,
        type: "filter",
        label: config.name || "Filter",
        field: config.field ?? "",
        op: config.op ?? "==",
        value: config.value ?? "",
      };
    } else if (rowType === "sort") {
      newRow = {
        id: uid,
        type: "sort",
        label: config.name || "Sort",
        field: config.field ?? "",
        direction: config.direction ?? "asc",
      };
    } else {
      return null;
    }

    if (!Array.isArray(parentDef.rows)) {
      parentDef.rows = [];
    }
    parentDef.rows.push(newRow);
    rowDefinitionsById.set(newRow.id, newRow);
    dynamicIds.add(newRow.id);

    if (newRow.initialState) {
      if (!layerState[mapLayerId]) {
        layerState[mapLayerId] = {};
      }
      Object.entries(newRow.initialState).forEach(([key, value]) => {
        if (layerState[mapLayerId][key] === undefined) {
          layerState[mapLayerId][key] = value;
        }
      });
      // Per-row visibility — keyed by row ID, not target layer ID.
      if (!layerState[newRow.id]) layerState[newRow.id] = {};
      if (typeof layerState[newRow.id].rowVisible !== "boolean") {
        layerState[newRow.id].rowVisible = true;
      }
    }

    // Track so we can re-attach to the parent on hydration.
    if (!staticParentAdditions.has(layerId)) staticParentAdditions.set(layerId, []);
    staticParentAdditions.get(layerId).push(newRow);
    persistDynamicDefs();
    persistLayerState();

    return newRow;
  }

  // Adds a new data row (type: "layer") pointing to an entry in the layer catalog.
  // layerRef is the catalog layer ID (e.g. "countriesLand", or a Supabase UUID later).
  function addDataRow(parentId, { name, layerRef }) {
    const uid = `dyn-${Date.now()}`;
    const newRow = {
      id: uid,
      type: "layer",
      label: name || layerRef,
      layerId: uid,
      layerRef,
      rows: [],
    };

    if (parentId === ROOT_PARENT_ID) {
      rootDynamicRows.push(newRow);
    } else {
      const parentDef = rowDefinitionsById.get(parentId) ?? layerDefinitions[parentId];
      if (!parentDef) return null;
      if (!Array.isArray(parentDef.rows)) parentDef.rows = [];
      parentDef.rows.push(newRow);
      if (!staticParentAdditions.has(parentId)) staticParentAdditions.set(parentId, []);
      staticParentAdditions.get(parentId).push(newRow);
    }

    rowDefinitionsById.set(newRow.id, newRow);
    dynamicIds.add(newRow.id);
    layerState[uid] = { expanded: false, visible: true };
    persistDynamicDefs();
    persistLayerState();

    return newRow;
  }

  function setChildRowOrder(parentId, nextOrder) {
    if (!getParentRows(parentId).length || !Array.isArray(nextOrder)) {
      return null;
    }

    const allowedIds = getOrderableChildRows(parentId).map((row) => row.id);
    if (
      nextOrder.length !== allowedIds.length
      || allowedIds.some((rowId) => !nextOrder.includes(rowId))
    ) {
      return null;
    }

    layerState[parentId].rowOrder = normalizeChildRowOrder(parentId, nextOrder);
    persistLayerState();
    return layerState[parentId].rowOrder.slice();
  }

  function getRowById(rowId) {
    return rowDefinitionsById.get(rowId) ?? layerDefinitions[rowId] ?? null;
  }

  // Returns all dynamically added rows that point to a Supabase layer UUID.
  // Used on boot to re-attach layers to the map.
  function getSupabaseLayers() {
    const supabaseUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const results = [];
    dynamicIds.forEach((id) => {
      const row = rowDefinitionsById.get(id);
      if (row && row.layerRef && supabaseUuidPattern.test(row.layerRef)) {
        results.push({ rowId: id, layerId: row.layerRef, name: row.label });
      }
    });
    return results;
  }

  return {
    addDataRow,
    addRowToLayer,
    getChildRows,
    getDefinitions,
    getRootRows,
    getRootParentId,
    getRowById,
    getRowValue,
    getState,
    getSupabaseLayers,
    isExpanded,
    isRowVisible,
    isDynamic: (rowId) => dynamicIds.has(rowId),
    normalizeChildRowOrder,
    reorderChildRow,
    removeRow,
    setChildRowOrder,
    setRowValue,
    toggleExpanded,
    toggleRowVisible,
    toggleVisibility,
  };
}

export { createLayerModel };
