import { createLayerModel } from "../core/layer-model.js";
import { mountUploadPanel } from "../upload/upload-panel.js";
import { mountAddRowPanel } from "./add-row-panel.js";
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
    reattachPersistedSupabaseLayers(layerModel, screenRuntime);
  }

  const dataTablePanel = mountDataTablePanel({
    async loadTablePreview(layerId, { limit, offset }) {
      const { getLayerTablePreview } = await import("../sources/supabase/layer-loader.js");
      return getLayerTablePreview(layerId, { limit, offset });
    },
  });
  const rerenderLayerMenu = renderLayerMenuRows({
    panel: document.getElementById("layerMenuPanel"),
    layerModel,
    onAddRow: ({ kind, depth, parentId, rowType }) => {
      if (kind === "open-add-panel") {
        addRowPanel.open({ depth, parentId });
      } else if (kind === "row") {
        const added = layerModel.addRowToLayer(parentId, rowType);
        if (added) rerenderLayerMenu();
      }
    },
    onRowInput: (row, nextValue) => {
      if (row?.type === "reorder") {
        screenRuntime.reorderLayerGroup(row.parentId, nextValue);
        return;
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
    appearanceButton: document.getElementById("layerMenuAppearanceButton"),
    screenButton: document.getElementById("layerMenuScreenButton"),
    rerenderLayerMenu,
  });
  enableRefreshControls({
    wrapper: document.getElementById("mobileRefresh"),
    button: document.getElementById("mobileRefreshButton"),
    menu: document.getElementById("mobileRefreshMenu"),
    hardReloadButton: document.getElementById("hardReloadButton"),
    clearCacheReloadButton: document.getElementById("clearCacheReloadButton"),
    onBeforeMenuOpen: () => layerMenuControls?.close?.(),
  });
  const uploadPanel = mountUploadPanel({
    onLayerCreated: async ({ layerId, name, parentId, geometryType }) => {
      try {
        const added = await addDataRowAndAttach({
          parentId: parentId ?? layerModel.getRootParentId(),
          name,
          layerRef: layerId,
          geometryType,
          layerModel,
          screenRuntime,
        });
        if (added) rerenderLayerMenu();
      } catch (err) {
        console.error("Failed to load uploaded layer onto map.", err);
      }
    },
  });

  const addRowPanel = mountAddRowPanel({
    async onAddLayer({ parentId, name, layerRef, geometryType }) {
      const added = await addDataRowAndAttach({
        parentId,
        name,
        layerRef,
        geometryType,
        layerModel,
        screenRuntime,
      });
      if (added) rerenderLayerMenu();
    },
    onAddRow({ parentId, rowType, config }) {
      const added = layerModel.addRowToLayer(parentId, rowType, config);
      if (added) rerenderLayerMenu();
    },
    onUploadRequested({ parentId, name, file }) {
      uploadPanel.open({ parentId, name, file });
    },
    async getFieldsForParent(parentId) {
      const row = layerModel.getRowById(parentId);
      if (!row?.layerRef) return null;
      return loadLayerFields(row.layerRef);
    },
    async getValuesForParentField(parentId, field) {
      const row = layerModel.getRowById(parentId);
      if (!row?.layerRef || !SUPABASE_UUID.test(row.layerRef)) return null;
      try {
        const { getLayerFieldValues } = await import("../sources/supabase/layer-loader.js");
        return await getLayerFieldValues(row.layerRef, field);
      } catch {
        return null;
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
      const { layer, geojson } = await loadLayerFromSupabase(layerId);
      if (geojson || layer.tiles_url) {
        screenRuntime.loadDynamicLayer({ layerId, geojson, tilesUrl: layer.tiles_url ?? null, style: layer.default_style });
      }
      const row = layerModel.getRowById(rowId);
      if (row) {
        applyPersistedRowVisibility(layerModel, screenRuntime, row);
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
  const runtimeTargetId = getRowRuntimeTargetId(row);
  if (runtimeTargetId) {
    const visible = row.type === "layer"
      ? layerModel.getState()?.[getRowStateKey(row)]?.visible
      : layerModel.isRowVisible(row.id);
    if (typeof visible === "boolean") {
      screenRuntime.setLayerStyleValue(runtimeTargetId, "visible", visible);
    }
  }

  layerModel.getChildRows(row.id).forEach((childRow) => {
    applyPersistedRowVisibility(layerModel, screenRuntime, childRow);
  });
}

async function addDataRowAndAttach({ parentId, name, layerRef, geometryType, layerModel, screenRuntime }) {
  const resolvedParentId = parentId ?? layerModel.getRootParentId();
  if (!SUPABASE_UUID.test(layerRef)) {
    const added = layerModel.addDataRow(resolvedParentId, { name, layerRef, geometryType });
    if (!added) {
      return null;
    }
    return added;
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
  const { layer, geojson } = layerResult;
  const added = layerModel.addDataRow(resolvedParentId, {
    name,
    layerRef,
    geometryType: geometryType ?? layer.geometry_type ?? "mixed",
  });
  if (!added) {
    return null;
  }
  if (geojson || layer.tiles_url) {
    screenRuntime.loadDynamicLayer({ layerId: layerRef, geojson, tilesUrl: layer.tiles_url ?? null, style: layer.default_style });
  }

  const runtimeTargetId = getRowRuntimeTargetId(added);
  const stateKey = getRowStateKey(added);
  const visible = layerModel.getState()?.[stateKey]?.visible;
  if (runtimeTargetId && typeof visible === "boolean") {
    screenRuntime.setLayerStyleValue(runtimeTargetId, "visible", visible);
  }

  return added;
}

export { bootstrapApplication };
