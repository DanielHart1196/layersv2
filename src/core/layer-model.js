import {
  ROOT_PARENT_ID,
  ROOT_ROW_IDS,
  SHARED_COLOR_PRESETS,
  SHARED_COLOR_STORAGE_KEY,
  createDataRow,
  createFilterRow,
  createLayerDefinitions,
  createSortRow,
  createSliderRow,
  createStyleRow,
} from "./layer-definitions.js";

function createLayerModel() {
  const STORAGE_KEY = "layerv2.layerState.v1";
  const DEFS_STORAGE_KEY = "layerv2.dynamicDefs.v1";
  const APPEARANCE_STATE_KEY = "__appearance__";
  const LEGACY_SETTINGS_BACKGROUND_STORAGE_KEY = "layerv2.layerMenuAppearance.v1";
  const LEGACY_SCREEN_BACKGROUND_STORAGE_KEY = "layerv2.screenAppearance.v1";
  const layerDefinitions = createLayerDefinitions();
  const rootDynamicRows = []; // top-level user-added layers
  const dynamicIds = new Set(); // IDs of all dynamically added rows
  const suppressedRowIds = new Set(); // session-only hidden rows for missing remote layers
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
    const appearanceDefaults = loadLegacyAppearanceDefaults();
    const state = {
      [ROOT_PARENT_ID]: {
        rowOrder: getDefaultChildOrder(ROOT_PARENT_ID),
      },
      earth: {
        rowOrder: getDefaultChildOrder("earth"),
      },
      [APPEARANCE_STATE_KEY]: appearanceDefaults,
    };

    const ensureLayerState = (layerId) => {
      if (!state[layerId]) {
        state[layerId] = {};
      }
      return state[layerId];
    };

    const applyRowDefaults = (row, parentRowId = null) => {
      if (row?.type === "layer") {
        const layerRecord = ensureLayerState(row.layerId);
        if (typeof layerRecord.expanded !== "boolean") {
          layerRecord.expanded = Boolean(row.defaultExpanded);
        }
        if (typeof layerRecord.visible !== "boolean") {
          layerRecord.visible = true;
        }
        if (typeof layerRecord.runtimeTargetId !== "string") {
          layerRecord.runtimeTargetId = row.runtimeLayerId ?? row.layerId;
        }
        if (layerRecord.parentRowId === undefined) {
          layerRecord.parentRowId = parentRowId;
        }
        if (Array.isArray(row.rows) && row.rows.length && !Array.isArray(layerRecord.rowOrder)) {
          layerRecord.rowOrder = getDefaultChildOrder(row.id);
        }
        row.rows?.forEach((childRow) => applyRowDefaults(childRow, row.id));
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
      if (typeof rowRecord.expanded !== "boolean") {
        rowRecord.expanded = false;
      }
      if (typeof row.runtimeTargetId === "string" && typeof rowRecord.runtimeTargetId !== "string") {
        rowRecord.runtimeTargetId = row.runtimeTargetId;
      }
      if (rowRecord.parentRowId === undefined) {
        rowRecord.parentRowId = parentRowId;
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
        applyRowDefaults(definition, null);
        return;
      }
      definition.rows?.forEach((row) => applyRowDefaults(row, definition.id ?? null));
    });

    return state;
  }

  const layerState = hydrateLayerState();
  hydrateDynamicDefs(); // must run after hydrateLayerState so state exists for dynamic rows
  delete layerState.transport;
  delete layerState.olympics;
  delete layerState.empires;
  layerState[ROOT_PARENT_ID].rowOrder = normalizeChildRowOrder(ROOT_PARENT_ID, layerState[ROOT_PARENT_ID]?.rowOrder);
  layerState.earth.rowOrder = normalizeChildRowOrder("earth", layerState.earth?.rowOrder);

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
        if (!layerState[row.id] || typeof layerState[row.id] !== "object") {
          layerState[row.id] = {};
        }
        if (typeof layerState[row.id].visible !== "boolean") {
          layerState[row.id].visible = true;
        }
        if (typeof layerState[row.id].expanded !== "boolean") {
          layerState[row.id].expanded = false;
        }
        if (typeof layerState[row.id].runtimeTargetId !== "string") {
          layerState[row.id].runtimeTargetId = row.runtimeLayerId ?? row.layerRef ?? row.layerId ?? row.id;
        }
        if (layerState[row.id].parentRowId === undefined) {
          layerState[row.id].parentRowId = null;
        }
        initializeDynamicRowState(row.rows, row.runtimeLayerId ?? row.layerRef ?? row.layerId ?? row.id, row.id);
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
          if (!layerState[row.id] || typeof layerState[row.id] !== "object") {
            layerState[row.id] = {};
          }
          if (typeof layerState[row.id].visible !== "boolean") {
            layerState[row.id].visible = true;
          }
          if (typeof layerState[row.id].expanded !== "boolean") {
            layerState[row.id].expanded = false;
          }
          if (typeof layerState[row.id].runtimeTargetId !== "string") {
            layerState[row.id].runtimeTargetId = row.runtimeLayerId ?? row.layerRef ?? row.layerId ?? row.id;
          }
          if (layerState[row.id].parentRowId === undefined) {
            layerState[row.id].parentRowId = parentId;
          }
          initializeDynamicRowState(row.rows, row.runtimeLayerId ?? row.layerRef ?? row.layerId ?? row.id, row.id);
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

    const visibleRows = getOrderableChildRows(parentId).filter((row) => !suppressedRowIds.has(row.id));
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

  function normalizeAppearanceColor(value, fallback) {
    const normalized = String(value ?? "").trim().replace(/^#*/, "");
    if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return `#${normalized.toUpperCase()}`;
    }
    return fallback;
  }

  function readLegacyAppearanceState(storageKey, defaults) {
    try {
      const raw = window.localStorage?.getItem(storageKey);
      if (!raw) {
        return { ...defaults };
      }
      const parsed = JSON.parse(raw);
      return {
        color: normalizeAppearanceColor(parsed?.color, defaults.color),
        opacity: Math.max(0, Math.min(100, Number(parsed?.opacity) || 0)),
      };
    } catch (_error) {
      return { ...defaults };
    }
  }

  function loadLegacyAppearanceDefaults() {
    return {
      settings: readLegacyAppearanceState(LEGACY_SETTINGS_BACKGROUND_STORAGE_KEY, { color: "#FFFFFF", opacity: 0 }),
      screen: readLegacyAppearanceState(LEGACY_SCREEN_BACKGROUND_STORAGE_KEY, { color: "#000000", opacity: 100 }),
    };
  }

  function getAppearanceState() {
    const appearance = layerState[APPEARANCE_STATE_KEY];
    return structuredClone(appearance && typeof appearance === "object"
      ? appearance
      : loadLegacyAppearanceDefaults());
  }

  function setAppearanceValue(kind, key, value) {
    if (!layerState[APPEARANCE_STATE_KEY] || typeof layerState[APPEARANCE_STATE_KEY] !== "object") {
      layerState[APPEARANCE_STATE_KEY] = loadLegacyAppearanceDefaults();
    }
    if (!layerState[APPEARANCE_STATE_KEY][kind] || typeof layerState[APPEARANCE_STATE_KEY][kind] !== "object") {
      layerState[APPEARANCE_STATE_KEY][kind] = kind === "screen"
        ? { color: "#000000", opacity: 100 }
        : { color: "#FFFFFF", opacity: 0 };
    }

    if (key === "color") {
      layerState[APPEARANCE_STATE_KEY][kind].color = normalizeAppearanceColor(
        value,
        layerState[APPEARANCE_STATE_KEY][kind].color,
      );
    } else if (key === "opacity") {
      layerState[APPEARANCE_STATE_KEY][kind].opacity = Math.max(0, Math.min(100, Number(value) || 0));
    } else {
      return null;
    }

    persistLayerState();
    return structuredClone(layerState[APPEARANCE_STATE_KEY][kind]);
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
      runtimeTargetId: row?.runtimeTargetId ?? target.layerId,
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

  function normalizeDatasetGeometryType(geometryType) {
    if (geometryType === "point") return "point";
    if (geometryType === "line") return "line";
    if (geometryType === "polygon" || geometryType === "area") return "polygon";
    return "mixed";
  }

  function createDefaultDatasetRows(rowId, mapLayerId, geometryType) {
    const normalizedType = normalizeDatasetGeometryType(geometryType);
    if (normalizedType === "point") {
      return [
        createStyleRow({
          type: "point",
          id: `${rowId}-point`,
          layerId: mapLayerId,
          runtimeTargetId: `${mapLayerId}::point-fill`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#e74c3c",
          defaultOpacity: 80,
          defaultRadius: 6,
        }),
        createStyleRow({
          type: "line",
          id: `${rowId}-line`,
          layerId: mapLayerId,
          runtimeTargetId: `${mapLayerId}::point-stroke`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#ffffff",
          defaultOpacity: 100,
          defaultWeight: 1,
        }),
      ];
    }
    if (normalizedType === "line") {
      return [createStyleRow({
        type: "line",
        id: `${rowId}-line`,
        layerId: mapLayerId,
        runtimeTargetId: `${mapLayerId}::line`,
        storageKey: SHARED_COLOR_STORAGE_KEY,
        presets: SHARED_COLOR_PRESETS,
        defaultColor: "#3498db",
        defaultOpacity: 90,
        defaultWeight: 2,
      })];
    }
    if (normalizedType === "polygon") {
      return [
        createStyleRow({
          type: "fill",
          id: `${rowId}-fill`,
          layerId: mapLayerId,
          runtimeTargetId: `${mapLayerId}::fill`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#2ecc71",
          defaultOpacity: 60,
        }),
        createStyleRow({
          type: "line",
          id: `${rowId}-line`,
          layerId: mapLayerId,
          runtimeTargetId: `${mapLayerId}::line`,
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#1f7a45",
          defaultOpacity: 100,
          defaultWeight: 1,
        }),
      ];
    }
    return [];
  }

  function initializeDynamicRowState(rows, mapLayerId, parentRowId) {
    rows.forEach((row) => {
      rowDefinitionsById.set(row.id, row);
      dynamicIds.add(row.id);
      if (!layerState[row.id]) {
        layerState[row.id] = {};
      }
      if (typeof layerState[row.id].rowVisible !== "boolean") {
        layerState[row.id].rowVisible = true;
      }
      if (typeof layerState[row.id].expanded !== "boolean") {
        layerState[row.id].expanded = false;
      }
      if (typeof row.runtimeTargetId === "string" && typeof layerState[row.id].runtimeTargetId !== "string") {
        layerState[row.id].runtimeTargetId = row.runtimeTargetId;
      }
      if (layerState[row.id].parentRowId === undefined) {
        layerState[row.id].parentRowId = parentRowId ?? null;
      }
      if (row.initialState) {
        if (!layerState[mapLayerId]) {
          layerState[mapLayerId] = {};
        }
        Object.entries(row.initialState).forEach(([key, value]) => {
          if (layerState[mapLayerId][key] === undefined) {
            layerState[mapLayerId][key] = value;
          }
        });
      }
      if (Array.isArray(row.rows) && row.rows.length) {
        row.rows.forEach((childRow) => {
          if (!layerState[childRow.id]) {
            layerState[childRow.id] = {};
          }
          if (layerState[childRow.id].parentRowId === undefined) {
            layerState[childRow.id].parentRowId = row.id;
          }
        });
        initializeDynamicRowState(row.rows, mapLayerId, row.id);
      }
    });
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
      newRow = createFilterRow({
        id: uid,
        label: config.name || "Filter",
        field: config.field ?? "",
        op: config.op ?? "==",
        value: config.value ?? "",
      });
    } else if (rowType === "sort") {
      newRow = createSortRow({
        id: uid,
        label: config.name || "Sort",
        field: config.field ?? "",
        direction: config.direction ?? "asc",
      });
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
  // layerRef is the catalog layer ID (e.g. "land", or a Supabase UUID later).
  function addDataRow(parentId, { name, layerRef, geometryType = "mixed" }) {
    const uid = `dyn-${Date.now()}`;
    const mapLayerId = layerRef ?? uid;
    const rows = createDefaultDatasetRows(uid, mapLayerId, geometryType);
    const newRow = createDataRow({
      id: uid,
      label: name || layerRef,
      layerId: uid,
      layerRef,
      rows,
      runtimeLayerId: mapLayerId,
    });

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
    initializeDynamicRowState(rows, mapLayerId, newRow.id);
    dynamicIds.add(newRow.id);
    layerState[uid] = {
      expanded: rows.length > 0,
      visible: true,
      runtimeTargetId: newRow.runtimeLayerId,
      parentRowId: parentId === ROOT_PARENT_ID ? null : parentId,
    };
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

  function suppressRow(rowId) {
    if (!rowDefinitionsById.has(rowId) && !layerDefinitions[rowId]) {
      return false;
    }
    suppressedRowIds.add(rowId);
    return true;
  }

  function isRowSuppressed(rowId) {
    return suppressedRowIds.has(rowId);
  }

  return {
    addDataRow,
    addRowToLayer,
    getChildRows,
    getDefinitions,
    getAppearanceState,
    getRootRows,
    getRootParentId,
    getRowById,
    getRowValue,
    getState,
    getSupabaseLayers,
    isRowSuppressed,
    isExpanded,
    isRowVisible,
    isDynamic: (rowId) => dynamicIds.has(rowId),
    normalizeChildRowOrder,
    reorderChildRow,
    removeRow,
    setChildRowOrder,
    setAppearanceValue,
    setRowValue,
    suppressRow,
    toggleExpanded,
    toggleRowVisible,
    toggleVisibility,
  };
}

export { createLayerModel };
