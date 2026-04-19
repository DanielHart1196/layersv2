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

const FILTER_DEBUG_VERSION = "filter-debug-2026-04-19-v3";
const FILTER_DEBUG_MAX_EVENTS = 10;
const supabaseLayerDataCache = new Map();

function formatDebugValue(value) {
  if (value == null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getDebugStackSnippet() {
  try {
    const rawStack = new Error().stack ?? "";
    return rawStack
      .split("\n")
      .slice(2, 5)
      .map((line) => line.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

function createFilterDebugOverlay() {
  const wrapper = document.createElement("div");
  wrapper.id = "filterDebugOverlayWrap";
  wrapper.style.position = "fixed";
  wrapper.style.top = "12px";
  wrapper.style.left = "12px";
  wrapper.style.zIndex = "30000";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "flex-start";
  wrapper.style.gap = "6px";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.id = "filterDebugOverlayToggle";
  toggleButton.textContent = "x";
  toggleButton.setAttribute("aria-label", "Minimize debug overlay");
  toggleButton.style.width = "24px";
  toggleButton.style.height = "24px";
  toggleButton.style.padding = "0";
  toggleButton.style.border = "0";
  toggleButton.style.borderRadius = "6px";
  toggleButton.style.background = "rgba(0, 0, 0, 0.9)";
  toggleButton.style.color = "#d7f7d9";
  toggleButton.style.font = "12px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  toggleButton.style.cursor = "pointer";
  toggleButton.style.pointerEvents = "auto";

  const overlay = document.createElement("pre");
  overlay.id = "filterDebugOverlay";
  overlay.setAttribute("aria-live", "polite");
  overlay.style.maxWidth = "280px";
  overlay.style.maxHeight = "38vh";
  overlay.style.overflow = "hidden";
  overlay.style.margin = "0";
  overlay.style.padding = "8px 10px";
  overlay.style.borderRadius = "8px";
  overlay.style.background = "rgba(0, 0, 0, 0.82)";
  overlay.style.color = "#d7f7d9";
  overlay.style.font = "10px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  overlay.style.whiteSpace = "pre-wrap";
  overlay.style.pointerEvents = "none";
  overlay.style.boxShadow = "0 6px 24px rgba(0,0,0,0.28)";
  overlay.textContent = `${FILTER_DEBUG_VERSION}\ninitializing…`;

  let minimized = false;
  const syncMinimizedState = () => {
    overlay.style.display = minimized ? "none" : "block";
    toggleButton.textContent = minimized ? "+" : "x";
    toggleButton.setAttribute("aria-label", minimized ? "Restore debug overlay" : "Minimize debug overlay");
  };
  toggleButton.addEventListener("click", () => {
    minimized = !minimized;
    syncMinimizedState();
  });
  syncMinimizedState();

  wrapper.append(toggleButton, overlay);
  document.body.append(wrapper);
  return overlay;
}

function renderFilterDebugOverlay(overlay, debugEvents = []) {
  if (!overlay) {
    return;
  }
  const lines = [FILTER_DEBUG_VERSION];
  if (!debugEvents.length) {
    lines.push("no filter events yet");
    overlay.textContent = lines.join("\n");
    return;
  }

  debugEvents.forEach((event, index) => {
    lines.push("");
    lines.push(`#${index + 1} ${event.kind}`);
    if (event.requestId != null) lines.push(`req ${event.requestId}`);
    if (event.parentId) lines.push(`parent ${event.parentId}`);
    if (event.rowId) lines.push(`row ${event.rowId}`);
    if (event.field != null || event.value != null) {
      lines.push(`match ${event.field ?? "?"}=${formatDebugValue(event.value ?? "")}`);
    }
    if (event.existingCount != null) lines.push(`existing ${event.existingCount}`);
    if (event.note) lines.push(event.note);
    if (event.stack) lines.push(event.stack);
  });

  overlay.textContent = lines.join("\n");
}

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
  const filterDebugOverlay = createFilterDebugOverlay();
  let filterDebugEvents = [];
  let filterDebugRequestId = 0;
  const pushFilterDebugEvent = (event) => {
    filterDebugEvents = [event, ...filterDebugEvents].slice(0, FILTER_DEBUG_MAX_EVENTS);
    renderFilterDebugOverlay(filterDebugOverlay, filterDebugEvents);
  };
  window.addEventListener("layerv2:filter-debug", (event) => {
    if (event?.detail) {
      pushFilterDebugEvent(event.detail);
    }
  });
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
      renderFilterDebugOverlay(filterDebugOverlay, filterDebugEvents);
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
      pushFilterDebugEvent({
        kind: "ui-create-request",
        requestId: ++filterDebugRequestId,
        parentId: parentRow.id,
        field: String(columnName),
        value,
        existingCount: layerModel.getChildRows(parentRow.id).filter((row) => row?.type === "layer" && row.kind === "filter").length,
        stack: getDebugStackSnippet(),
      });
      const requestId = filterDebugRequestId;
      if (existingFilterRow) {
        pushFilterDebugEvent({
          kind: "duplicate-filter-request",
          requestId,
          parentId: parentRow.id,
          rowId: existingFilterRow.id,
          field: String(columnName),
          value,
          stack: getDebugStackSnippet(),
        });
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
      syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
      screenRuntime.reapplyFullOrder?.();
      rerenderLayerMenu();
      pushFilterDebugEvent({
        kind: "bootstrap-created-filter",
        requestId,
        parentId: parentRow.id,
        rowId: nextRow.id,
        field: String(columnName),
        value,
        stack: getDebugStackSnippet(),
      });
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
      pushFilterDebugEvent({
        kind: "remove-filter",
        parentId: row?.filter?.parentLayerId ?? parentId,
        rowId,
        field: row?.filter?.field ?? null,
        value: row?.filter?.value ?? null,
      });
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
  renderFilterDebugOverlay(filterDebugOverlay, filterDebugEvents);
  const layerMenuControls = enableLayerMenuControls({
    wrapper: document.getElementById("layerMenu"),
    button: document.getElementById("layerMenuButton"),
    panel: document.getElementById("layerMenuPanel"),
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
        visible: false,
      parentRowId: row.filter.parentLayerId,
    },
  });
  screenRuntime.setLayerStyleValue?.(getRowRuntimeTargetId(row), "visible", false);
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
  const { layer, geojson, tilesUrl } = layerResult;
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
  const { layer, geojson, tilesUrl } = layerResult;
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
