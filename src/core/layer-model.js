function createLayerModel() {
  const STORAGE_KEY = "atlas.layerState.v1";
  const ROOT_PARENT_ID = "__root__";
  const SHARED_COLOR_STORAGE_KEY = "atlas.colors.customColors";
  const SHARED_COLOR_PRESETS = ["#000000", "#FFFFFF", "#d94b4b", "#e58a2b", "#e5c84a", "#5b8c5a", "#4b6ed9", "#8c5bd6"];

  function createFillRow({
    id,
    label = "Fill",
    layerId,
    storageKey = null,
    presets = [],
    defaultColor = "#000000",
    defaultOpacity = 100,
  }) {
    return {
      id,
      type: "fill",
      label,
      colorTarget: { kind: "layer-style", layerId, key: "fillColor" },
      opacityTarget: { kind: "layer-style", layerId, key: "fillOpacity" },
      storageKey,
      presets,
      min: 0,
      max: 100,
      step: 1,
      valueFormat: "percent",
      initialState: {
        fillColor: defaultColor,
        fillOpacity: defaultOpacity,
      },
    };
  }

  function createLineRow({
    id,
    label = "Line",
    layerId,
    storageKey = null,
    presets = [],
    defaultColor = "#000000",
    defaultOpacity = 100,
    defaultWeight = 1,
  }) {
    return {
      id,
      type: "line",
      label,
      colorTarget: { kind: "layer-style", layerId, key: "lineColor" },
      opacityTarget: { kind: "layer-style", layerId, key: "lineOpacity" },
      weightTarget: { kind: "layer-style", layerId, key: "lineWeight" },
      storageKey,
      presets,
      min: 0,
      max: 100,
      step: 1,
      valueFormat: "pixels",
      weightMin: 0,
      weightMax: 10,
      weightStep: 0.1,
      initialState: {
        lineColor: defaultColor,
        lineOpacity: defaultOpacity,
        lineWeight: defaultWeight,
      },
    };
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
            createFillRow({
              id: "ocean-fill",
              layerId: "ocean",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#2C6F92",
            }),
          ],
        },
        {
          id: "land",
          type: "layer",
          label: "Land",
          layerId: "land",
          hidden: true,
          rows: [
            createFillRow({
              id: "land-fill",
              layerId: "land",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
          ],
        },
        {
          id: "outline",
          type: "layer",
          label: "Outline",
          layerId: "outline",
          hidden: true,
          rows: [
            createLineRow({
              id: "outline-line",
              layerId: "outline",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d9e4da",
            }),
          ],
        },
        {
          id: "japan",
          type: "layer",
          label: "Japan",
          layerId: "japan",
          hidden: true,
          rows: [
            createLineRow({
              id: "japan-line",
              layerId: "japan",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d9e4da",
            }),
          ],
        },
        {
          id: "australia",
          type: "layer",
          label: "Australia",
          layerId: "australia",
          rows: [
            createFillRow({
              id: "australia-fill",
              layerId: "australia",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createLineRow({
              id: "australia-line",
              layerId: "australia",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d9e4da",
            }),
          ],
        },
        {
          id: "africa",
          type: "layer",
          label: "Africa",
          layerId: "africa",
          hidden: true,
          rows: [
            createFillRow({
              id: "africa-fill",
              layerId: "africa",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
          ],
        },
        {
          id: "countries-land",
          type: "layer",
          label: "Land",
          layerId: "countriesLand",
          rows: [
            createFillRow({
              id: "countries-land-fill",
              layerId: "countriesLand",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createLineRow({
              id: "countries-land-line",
              layerId: "countriesLand",
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
            createFillRow({
              id: "victoria-fill",
              layerId: "victoria",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#6EAA6E",
            }),
            createLineRow({
              id: "victoria-line",
              layerId: "victoria",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#d9e4da",
            }),
          ],
        },
        {
          id: "graticules",
          type: "layer",
          label: "Graticules",
          layerId: "graticules",
          rows: [
            createLineRow({
              id: "graticules-line",
              layerId: "graticules",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#8FA9BC",
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
      rows: [
        {
          id: "transport-rail",
          type: "layer",
          label: "Rail (SA)",
          layerId: "transportRail",
          rows: [
            createLineRow({
              id: "transport-rail-line",
              layerId: "transportRail",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#f07a58",
              defaultOpacity: 92,
              defaultWeight: 3.5,
            }),
          ],
        },
      ],
    },
    countries: {
      id: "countries",
      type: "layer",
      label: "Countries",
      layerId: "countries",
      rows: [
        createFillRow({
          id: "countries-fill",
          layerId: "countries",
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#6EAA6E",
          defaultOpacity: 0,
        }),
        createLineRow({
          id: "countries-line",
          layerId: "countries",
          storageKey: SHARED_COLOR_STORAGE_KEY,
          presets: SHARED_COLOR_PRESETS,
          defaultColor: "#e1efe4",
          defaultOpacity: 0,
        }),
      ],
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
            createFillRow({
              id: "roman-fill",
              layerId: "roman",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#8c6a2a",
            }),
            createLineRow({
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
            createFillRow({
              id: "mongol-fill",
              layerId: "mongol",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#b85c38",
            }),
            createLineRow({
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
            createFillRow({
              id: "british-fill",
              layerId: "british",
              storageKey: SHARED_COLOR_STORAGE_KEY,
              presets: SHARED_COLOR_PRESETS,
              defaultColor: "#c84b31",
            }),
            createLineRow({
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

  const ROOT_ROW_IDS = ["earth", "transport", "countries", "olympics", "empires"];
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
      return ROOT_ROW_IDS
        .map((id) => layerDefinitions[id])
        .filter(Boolean);
    }

    const parent = rowDefinitionsById.get(parentId) ?? layerDefinitions[parentId];
    return parent?.rows ?? [];
  }

  function getOrderableChildRows(parentId) {
    return getParentRows(parentId).filter((row) => row.hidden !== true);
  }

  function getDefaultChildOrder(parentId) {
    return getOrderableChildRows(parentId).map((row) => row.id);
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

      if (parsed.land && !parsed.countries) {
        parsed.countries = parsed.land;
      }

      if (parsed.countries && !parsed.land) {
        parsed.land = {
          fillColor: parsed.countries.fillColor,
          fillOpacity: parsed.countries.fillOpacity,
          visible: true,
        };
        parsed.outline = {
          visible: true,
        };
        parsed.countries = {
          ...parsed.countries,
          fillOpacity: 0,
        };
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

  return {
    getChildRows,
    getDefinitions,
    getRootRows,
    getRootParentId,
    getRowValue,
    getState,
    normalizeChildRowOrder,
    reorderChildRow,
    setChildRowOrder,
    setRowValue,
    toggleExpanded,
    toggleVisibility,
  };
}

export { createLayerModel };
