import { createLayerModel } from "../core/layer-model.js";
import { mountAddDataPanel } from "./add-data-panel.js";
import { mountCreateLayerPanel } from "./create-layer-panel.js";
import { mountDataTablePanel } from "./data-table-panel.js";
import { getProjectionRegistry } from "../core/projection/projection-registry.js";
import { createStyleModel } from "../core/style-model.js";
import { createViewModel } from "../core/view-model.js";
import { createShareStateUrl } from "../export/qr/state-url.js";
import { enableLayerMenuControls } from "./layer-menu-controls.js";
import { renderLayerMenuRows } from "./layer-menu-renderer.js";
import { enableRefreshControls } from "./refresh-controls.js";
import { createPrintRendererAdapter } from "../renderers/print/print-renderer.js";
import { createMaplibreScreenRuntime } from "../renderers/screen/maplibre/runtime.js";
import { createScreenRendererAdapter } from "../renderers/screen/screen-renderer.js";
import { createEditableRuntimeStore } from "../sources/editable/runtime-store.js";
import { createPmtilesManifest } from "../sources/pmtiles/source-manifest.js";
import { loadLayerFromSupabase } from "../sources/supabase/layer-loader.js";
import { getRowRuntimeTargetId, getRowStateKey } from "../core/layer-definitions.js";

const supabaseLayerDataCache = new Map();

async function bootstrapApplication() {
  const layerModel = createLayerModel();
  const styleModel = createStyleModel();
  const viewModel = createViewModel();
  const pmtilesManifest = createPmtilesManifest();
  const editableStore = createEditableRuntimeStore();
  await editableStore.initialize();
  const screenRenderer = createScreenRendererAdapter();
  const printRenderer = createPrintRendererAdapter();
  const projections = getProjectionRegistry();
  const viewState = viewModel.getState();
  const initialLayerState = layerModel.getState();
  const screenRuntime = createMaplibreScreenRuntime({
    pmtilesManifest,
    viewState,
    initialLayerState,
    getRuntimeVectors: () => editableStore.getCollections(),
    getOrderedChildRowIds: (parentId) => layerModel.getOrderedChildRowIds(parentId),
  });

  let mapStartupError = null;
  try {
    screenRuntime.mount(document.getElementById("mapStage"));
  } catch (error) {
    mapStartupError = error;
    console.error("Map startup failed.", error);
    document.body.dataset.mapStartup = "failed";
  }

  // Re-attach any Supabase layers that were persisted from a previous session.
  // Fire-and-forget — failures are logged but don't block the rest of bootstrap.
  if (!mapStartupError) {
    screenRuntime.whenStyleReady(() => {
      void reattachPersistedSupabaseLayers(layerModel, screenRuntime);
    });
  }

  let dataTablePanel = null;
  const addDataPanel = mountAddDataPanel({
    getAppearanceState: () => layerModel.getAppearanceState(),
    async getLayerDatasets(layerId) {
      const cached = supabaseLayerDataCache.get(layerId);
      if (Array.isArray(cached?.datasets) && cached.datasets.length) {
        return cached.datasets;
      }
      const { getLayerDatasets } = await import("../sources/supabase/layer-loader.js");
      return getLayerDatasets(layerId);
    },
    async onDataAdded({ layerId, datasetId }) {
      await dataTablePanel?.reloadLayerData?.({ layerId, datasetId });
    },
  });
  dataTablePanel = mountDataTablePanel({
    getAppearanceState: () => layerModel.getAppearanceState(),
    async getLayerDatasets(layerId) {
      const cached = supabaseLayerDataCache.get(layerId);
      if (Array.isArray(cached?.datasets) && cached.datasets.length) {
        return cached.datasets;
      }
      const { getLayerDatasets } = await import("../sources/supabase/layer-loader.js");
      return getLayerDatasets(layerId);
    },
    async loadTablePreview(layerId, { limit, offset, datasetId }) {
      const cached = supabaseLayerDataCache.get(layerId);
      const {
        getLayerTablePreview,
        getLayerTablePreviewFromLoadedData,
      } = await import("../sources/supabase/layer-loader.js");
      const cachedPreview = getLayerTablePreviewFromLoadedData(cached, { limit, offset, datasetId });
      if (cachedPreview) {
        return cachedPreview;
      }
      return getLayerTablePreview(layerId, { limit, offset, datasetId });
    },
    onAddDataRequested(args) {
      addDataPanel.open(args);
    },
    async onCreateFilterRequested({ layerId, columnName, value }) {
      const parentRow = findLayerRowByLayerRef(layerModel, layerId);
      if (!parentRow) {
        throw new Error("Could not find the parent layer for this filter.");
      }

      const existingFilterRow = layerModel.getChildRows(parentRow.id).find((row) => (
        row?.type === "layer"
        && row.kind === "filter"
        && row.filter?.field === String(columnName)
        && (row.filter?.op ?? "==") === "=="
        && String(row.filter?.value ?? "") === String(value ?? "")
      ));
      if (existingFilterRow) {
        return;
      }

      const nextRow = layerModel.addRowToLayer(parentRow.id, "filter", {
        name: `${columnName} = ${value === "" ? "Empty value" : value}`,
        field: columnName,
        value,
        op: "==",
        geometryTypes: parentRow.geometryTypes ?? [],
        geometryType: parentRow.geometryType ?? "mixed",
      });
      if (!nextRow) {
        throw new Error("Failed to create filter row.");
      }

      attachDynamicFilterRow(layerModel, screenRuntime, nextRow);
      applyPersistedRowVisibility(layerModel, screenRuntime, nextRow);
      syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
      screenRuntime.reapplyRowSubtreeOrder?.(parentRow.id);
      rerenderLayerMenu();
    },
  });
  const rerenderLayerMenu = renderLayerMenuRows({
    panel: document.getElementById("layerMenuPanel"),
    layerModel,
    onAddRow: ({ kind, parentId }) => {
      if (kind === "open-add-panel") {
        createLayerPanel.open({ parentId });
      }
    },
    onRowInput: (row, nextValue) => {
      if (row?.type === "reorder") {
        screenRuntime.reorderLayerGroup(row.parentId, nextValue);
        return;
      }

      if (row?.target?.kind === "layer-style" && row.target.key === "visible") {
        const targetRow = findRowByRuntimeTargetId(layerModel, row.target.layerId);
        if (targetRow) {
          applyRowVisibilityTree(layerModel, screenRuntime, targetRow);
          return;
        }
      }

      if (row?.target?.kind === "runtime-style") {
        screenRuntime.setLayerStyleValue(row.target.runtimeTargetId, row.target.key, nextValue);
        return;
      }

      const update = layerModel.setRowValue(row, nextValue);
      if (!update) {
        return;
      }

      // Skip map update if the row has been disabled.
      if (!layerModel.isRowVisible(row.id)) {
        return;
      }

      screenRuntime.setLayerStyleValue(update.runtimeTargetId ?? update.layerId, update.key, update.value);
      // Persist style changes as new defaults for Supabase layers.
      if (SUPABASE_UUID.test(update.layerId)) {
        debouncedUpdateDefaultStyle(update.layerId, update.key, update.value);
      }
    },
    onRemoveRow: (rowId, parentId, row) => {
      const removed = layerModel.removeRow(rowId, parentId);
      if (!removed) return;
      // If removing a dynamic layer row, also detach it from the map.
      if (row?.type === "layer" && row?.layerRef) {
        screenRuntime.detachDynamicLayer(row.layerRef);
      } else if (row?.kind === "filter") {
        const parentRow = row?.filter?.parentLayerId
          ? findLayerRowByLayerRef(layerModel, row.filter.parentLayerId)
          : null;
        screenRuntime.detachDynamicLayer(getRowRuntimeTargetId(row));
        if (parentRow) {
          syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
        }
      }
      rerenderLayerMenu();
    },
    onDataAction: (row) => {
      if (!row?.layerRef || !SUPABASE_UUID.test(row.layerRef)) {
        return;
      }

      dataTablePanel.open({
        layerId: row.layerRef,
        layerName: row.label ?? row.name ?? "Dataset",
      });
    },
  });
  const layerMenuControls = enableLayerMenuControls({
    wrapper: document.getElementById("layerMenu"),
    button: document.getElementById("layerMenuButton"),
    panel: document.getElementById("layerMenuPanel"),
    earthButton: document.getElementById("layerMenuEarthButton"),
    appearanceButton: document.getElementById("layerMenuAppearanceButton"),
    screenButton: document.getElementById("layerMenuScreenButton"),
    rerenderLayerMenu,
    onMobileMenuClosed: () => {
      if (collapseExpandedLayerRows(layerModel)) {
        rerenderLayerMenu();
      }
    },
  });
  enableRefreshControls({
    wrapper: document.getElementById("mobileRefresh"),
    button: document.getElementById("mobileRefreshButton"),
    menu: document.getElementById("mobileRefreshMenu"),
    hardReloadButton: document.getElementById("hardReloadButton"),
    clearCacheReloadButton: document.getElementById("clearCacheReloadButton"),
    onBeforeMenuOpen: () => layerMenuControls?.close?.(),
  });
  const createLayerPanel = mountCreateLayerPanel({
    getAppearanceState: () => layerModel.getAppearanceState(),
    onLayerCreated: async ({ layerId, name, parentId, geometryTypes = [], geometryType }) => {
      try {
        const result = await addDataRowAndAttach({
          parentId: parentId ?? layerModel.getRootParentId(),
          name,
          layerRef: layerId,
          geometryTypes,
          geometryType,
          layerModel,
          screenRuntime,
        });
        if (result) rerenderLayerMenu();
        return result;
      } catch (err) {
        console.error("Failed to load uploaded layer onto map.", err);
        throw err;
      }
    },
  });

  window.LayerV2 = {
    layers: layerModel.getDefinitions(),
    layerState: layerModel.getState(),
    styles: styleModel.getStyles(),
    view: viewState,
    projections,
    sources: {
      pmtiles: pmtilesManifest,
      editable: editableStore.getCollections(),
    },
    renderers: {
      screen: screenRenderer.getContract(),
      print: printRenderer.getContract(),
    },
    screenRuntime: screenRuntime.getStatus(),
    mapStartupError: mapStartupError ? String(mapStartupError?.message ?? mapStartupError) : null,
    shareUrl: createShareStateUrl(viewState),
    rerenderLayerMenu,
  };

  return {
    editableStore,
    screenRuntime,
  };
}

const SUPABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accumulate style changes per layer and flush after 1s of inactivity.
const pendingStyleUpdates = new Map(); // layerRef → { ...style keys }
const styleUpdateTimers = new Map();   // layerRef → timer id

function debouncedUpdateDefaultStyle(layerRef, key, value) {
  if (!pendingStyleUpdates.has(layerRef)) pendingStyleUpdates.set(layerRef, {});
  pendingStyleUpdates.get(layerRef)[key] = value;

  clearTimeout(styleUpdateTimers.get(layerRef));
  styleUpdateTimers.set(layerRef, setTimeout(async () => {
    const patch = pendingStyleUpdates.get(layerRef);
    pendingStyleUpdates.delete(layerRef);
    styleUpdateTimers.delete(layerRef);
    try {
      const { updateLayerDefaultStyle } = await import("../sources/supabase/layer-loader.js");
      await updateLayerDefaultStyle(layerRef, patch);
    } catch (err) {
      console.warn("Failed to save layer style defaults:", err.message);
    }
  }, 1000));
}

async function loadLayerFields(layerRef) {
  if (!SUPABASE_UUID.test(layerRef)) return null;
  try {
    const { getLayerFields } = await import("../sources/supabase/layer-loader.js");
    return await getLayerFields(layerRef);
  } catch {
    return null;
  }
}

async function reattachPersistedSupabaseLayers(layerModel, screenRuntime) {
  const supabaseLayers = layerModel.getSupabaseLayers();
  if (!supabaseLayers.length) return;

  let suppressedAny = false;
  for (const { rowId, layerId } of supabaseLayers) {
    try {
      const loadedLayer = await loadLayerFromSupabase(layerId);
      const { layer, geojson, tilesUrl } = loadedLayer;
      supabaseLayerDataCache.set(layerId, loadedLayer);
      if (geojson || tilesUrl) {
        screenRuntime.loadDynamicLayer({
          layerId,
          geojson,
          tilesUrl,
          style: layer.default_style,
          options: {
            geometryTypes: Array.isArray(layer.geometry_types) ? layer.geometry_types : [],
            geometryType: layer.geometry_type ?? null,
          },
        });
      }
      const row = layerModel.getRowById(rowId);
      if (row) {
        applyPersistedRowVisibility(layerModel, screenRuntime, row);
        attachDynamicFilterRowsRecursively(layerModel, screenRuntime, row);
        syncParentDynamicFilterOwnership(layerModel, screenRuntime, row);
      }
    } catch (err) {
      if (err?.code === "LAYER_NOT_FOUND") {
        suppressedAny = layerModel.suppressRow(rowId) || suppressedAny;
        continue;
      }
      console.warn(`Failed to reattach layer ${layerId}:`, err.message);
    }
  }

  if (suppressedAny) {
    window.LayerV2?.rerenderLayerMenu?.();
  }
  screenRuntime.reapplyFullOrder?.();
}

function applyPersistedRowVisibility(layerModel, screenRuntime, row) {
  applyRowVisibilityTree(layerModel, screenRuntime, row);
}

function getStoredRowVisibility(layerModel, row) {
  if (!row) {
    return true;
  }

  if (row.type === "layer") {
    return layerModel.getState()?.[getRowStateKey(row)]?.visible !== false;
  }

  return layerModel.isRowVisible(row.id);
}

function applyRowVisibilityTree(layerModel, screenRuntime, row, inheritedHidden = false) {
  if (!row) {
    return;
  }

  const storedVisible = getStoredRowVisibility(layerModel, row);
  const effectiveVisible = !inheritedHidden && storedVisible;
  const runtimeTargetId = getRowRuntimeTargetId(row);
  if (runtimeTargetId) {
    screenRuntime.setLayerStyleValue(runtimeTargetId, "visible", effectiveVisible);
  }

  if (!row.id) {
    return;
  }

  const nextInheritedHidden = inheritedHidden || !storedVisible;
  layerModel.getChildRows(row.id).forEach((childRow) => {
    applyRowVisibilityTree(layerModel, screenRuntime, childRow, nextInheritedHidden);
  });
}

function findRowByRuntimeTargetId(layerModel, runtimeTargetId) {
  if (!runtimeTargetId) {
    return null;
  }

  const directRow = layerModel.getRowById(runtimeTargetId);
  if (directRow && getRowRuntimeTargetId(directRow) === runtimeTargetId) {
    return directRow;
  }

  const state = layerModel.getState();
  for (const [rowId, rowState] of Object.entries(state ?? {})) {
    if (rowState?.runtimeTargetId === runtimeTargetId) {
      return layerModel.getRowById(rowId);
    }
  }

  return null;
}

function collapseExpandedLayerRows(layerModel, parentId = layerModel.getRootParentId()) {
  let changed = false;

  layerModel.getChildRows(parentId).forEach((row) => {
    if (!row || row.type !== "layer") {
      return;
    }

    if (layerModel.isExpanded(row.id)) {
      layerModel.toggleExpanded(row.id);
      changed = true;
    }

    if (collapseExpandedLayerRows(layerModel, row.id)) {
      changed = true;
    }
  });

  return changed;
}

function findLayerRowByLayerRef(layerModel, layerRef) {
  return layerModel.getSupabaseLayers()
    .map((entry) => layerModel.getRowById(entry.rowId))
    .find((row) => row?.layerRef === layerRef) ?? null;
}

function buildExactMatchFilterExpression(field, value) {
  return [
    "==",
    ["to-string", ["coalesce", ["get", field], ""]],
    value == null ? "" : String(value),
  ];
}

function buildParentExclusionFilter(layerModel, parentRow) {
  if (!parentRow?.id) {
    return null;
  }

  const childFilterExpressions = layerModel.getChildRows(parentRow.id)
    .filter((row) => row?.type === "layer" && row.kind === "filter" && row.filter)
    .map((row) => buildExactMatchFilterExpression(row.filter.field, row.filter.value));

  if (!childFilterExpressions.length) {
    return null;
  }

  if (childFilterExpressions.length === 1) {
    return ["!", childFilterExpressions[0]];
  }

  return ["!", ["any", ...childFilterExpressions]];
}

function syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.layerRef || !SUPABASE_UUID.test(parentRow.layerRef)) {
    return;
  }

  screenRuntime.setDynamicLayerFeatureFilter?.(
    getRowRuntimeTargetId(parentRow),
    buildParentExclusionFilter(layerModel, parentRow),
  );
}

function attachDynamicFilterRow(layerModel, screenRuntime, row) {
  if (!row || row.type !== "layer" || row.kind !== "filter" || !row.filter) {
    return;
  }

  screenRuntime.loadDynamicLayer?.({
      layerId: getRowRuntimeTargetId(row),
      geojson: null,
      tilesUrl: null,
      style: null,
      options: {
        sourceLayerId: row.filter.parentLayerId,
        geometryTypes: row.geometryTypes ?? [],
        geometryType: row.geometryType,
        featureFilter: buildExactMatchFilterExpression(row.filter.field, row.filter.value),
      parentRowId: row.filter.parentLayerId,
    },
  });
}

function attachDynamicFilterRowsRecursively(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id) {
    return;
  }

  layerModel.getChildRows(parentRow.id).forEach((childRow) => {
    if (childRow?.type === "layer" && childRow.kind === "filter") {
      attachDynamicFilterRow(layerModel, screenRuntime, childRow);
    }
    attachDynamicFilterRowsRecursively(layerModel, screenRuntime, childRow);
  });
}

async function addDataRowAndAttach({ parentId, name, layerRef, geometryTypes = [], geometryType, layerModel, screenRuntime }) {
  const resolvedParentId = parentId ?? layerModel.getRootParentId();
  const existingSupabaseLayer = SUPABASE_UUID.test(layerRef)
    ? layerModel.getSupabaseLayers().find((entry) => entry.layerId === layerRef)
    : null;

  if (existingSupabaseLayer) {
    const existingRow = layerModel.getRowById(existingSupabaseLayer.rowId);
    if (!existingRow) {
      return null;
    }

    const update = layerModel.setRowValue({
      target: {
        kind: "layer-style",
        layerId: existingRow.id,
        key: "visible",
      },
      runtimeTargetId: getRowRuntimeTargetId(existingRow),
    }, true);

    applyPersistedRowVisibility(layerModel, screenRuntime, existingRow);
    if (update?.runtimeTargetId) {
      screenRuntime.setLayerStyleValue(update.runtimeTargetId, update.key, update.value);
    }

    return { row: existingRow, duplicate: true };
  }

  if (!SUPABASE_UUID.test(layerRef)) {
    const added = layerModel.addDataRow(resolvedParentId, { name, layerRef, geometryTypes, geometryType });
    if (!added) {
      return null;
    }
    return { row: added, duplicate: false };
  }

  let layerResult;
  try {
    layerResult = await loadLayerFromSupabase(layerRef);
  } catch (err) {
    if (err?.code === "LAYER_NOT_FOUND") {
      return null;
    }
    throw err;
  }
  const { layer, geojson, tilesUrl, sourceLayerId } = layerResult;
  supabaseLayerDataCache.set(layerRef, layerResult);
  const added = layerModel.addDataRow(resolvedParentId, {
    name,
    layerRef,
    geometryTypes: geometryTypes.length ? geometryTypes : (Array.isArray(layer.geometry_types) ? layer.geometry_types : []),
    geometryType: geometryType ?? layer.geometry_type ?? "mixed",
  });
  if (!added) {
    return null;
  }
  if (geojson || tilesUrl) {
    screenRuntime.loadDynamicLayer({
      layerId: layerRef,
      geojson,
      tilesUrl,
      style: layer.default_style,
      options: {
        geometryTypes: added.geometryTypes ?? geometryTypes,
        geometryType: added.geometryType ?? geometryType ?? layer.geometry_type ?? null,
        sourceLayerId,
      },
    });
  }

  const runtimeTargetId = getRowRuntimeTargetId(added);
  const stateKey = getRowStateKey(added);
  const visible = layerModel.getState()?.[stateKey]?.visible;
  if (runtimeTargetId && typeof visible === "boolean") {
    screenRuntime.setLayerStyleValue(runtimeTargetId, "visible", visible);
  }

  return { row: added, duplicate: false };
}

async function reloadSupabaseLayer(layerId, layerModel, screenRuntime) {
  const layerResult = await loadLayerFromSupabase(layerId);
  const { layer, geojson, tilesUrl, sourceLayerId } = layerResult;
  supabaseLayerDataCache.set(layerId, layerResult);
  screenRuntime.detachDynamicLayer(layerId);
  if (geojson || tilesUrl) {
    screenRuntime.loadDynamicLayer({
      layerId,
      geojson,
      tilesUrl,
      style: layer.default_style,
      options: {
        geometryTypes: Array.isArray(layer.geometry_types) ? layer.geometry_types : [],
        geometryType: layer.geometry_type ?? null,
        sourceLayerId,
      },
    });
  }

  const targetRow = layerModel.getSupabaseLayers().find((entry) => entry.layerId === layerId);
  if (!targetRow) {
    return;
  }
  const row = layerModel.getRowById(targetRow.rowId);
  if (row) {
    applyPersistedRowVisibility(layerModel, screenRuntime, row);
  }
  screenRuntime.reapplyFullOrder?.();
}

export { bootstrapApplication };
