import { createLayerModel } from "../core/layer-model.js";
import { mountUploadPanel } from "../upload/upload-panel.js";
import { mountAddRowPanel } from "./add-row-panel.js";
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

  screenRuntime.mount(document.getElementById("mapStage"));

  // Re-attach any Supabase layers that were persisted from a previous session.
  // Fire-and-forget — failures are logged but don't block the rest of bootstrap.
  reattachPersistedSupabaseLayers(layerModel, screenRuntime);

  enableRefreshControls({
    wrapper: document.getElementById("mobileRefresh"),
    button: document.getElementById("mobileRefreshButton"),
    menu: document.getElementById("mobileRefreshMenu"),
    hardReloadButton: document.getElementById("hardReloadButton"),
    clearCacheReloadButton: document.getElementById("clearCacheReloadButton"),
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

      const update = layerModel.setRowValue(row, nextValue);
      if (!update) {
        return;
      }

      screenRuntime.setLayerStyleValue(update.layerId, update.key, update.value);

      // Persist style changes as new defaults for Supabase layers.
      const rowDef = layerModel.getRowById(update.layerId);
      if (rowDef?.layerRef && SUPABASE_UUID.test(rowDef.layerRef)) {
        debouncedUpdateDefaultStyle(rowDef.layerRef, update.key, update.value);
      }
    },
  });
  enableLayerMenuControls({
    wrapper: document.getElementById("layerMenu"),
    button: document.getElementById("layerMenuButton"),
    panel: document.getElementById("layerMenuPanel"),
    appearanceButton: document.getElementById("layerMenuAppearanceButton"),
    screenButton: document.getElementById("layerMenuScreenButton"),
    rerenderLayerMenu,
  });
  const uploadPanel = mountUploadPanel({
    onLayerCreated: async ({ layerId, name, parentId }) => {
      try {
        const { layer, geojson } = await loadLayerFromSupabase(layerId);
        if (geojson || layer.tiles_url) {
          screenRuntime.loadDynamicLayer({ layerId, geojson, tilesUrl: layer.tiles_url ?? null, style: layer.default_style });
        }
        const added = layerModel.addDataRow(parentId ?? layerModel.getRootParentId(), { name, layerRef: layerId });
        if (added) rerenderLayerMenu();
      } catch (err) {
        console.error("Failed to load uploaded layer onto map.", err);
      }
    },
  });

  const addRowPanel = mountAddRowPanel({
    onAddLayer({ parentId, name, layerRef }) {
      const added = layerModel.addDataRow(parentId, { name, layerRef });
      if (added) rerenderLayerMenu();
    },
    onAddRow({ parentId, rowType, config }) {
      const added = layerModel.addRowToLayer(parentId, rowType, config);
      if (added) rerenderLayerMenu();
    },
    onUploadRequested({ parentId }) {
      uploadPanel.open({ parentId });
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

  for (const { layerId } of supabaseLayers) {
    try {
      const { layer, geojson } = await loadLayerFromSupabase(layerId);
      if (geojson || layer.tiles_url) {
        screenRuntime.loadDynamicLayer({ layerId, geojson, tilesUrl: layer.tiles_url ?? null, style: layer.default_style });
      }
    } catch (err) {
      console.warn(`Failed to reattach layer ${layerId}:`, err.message);
    }
  }
}

export { bootstrapApplication };
