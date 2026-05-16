import { createLayerModel } from "../core/layer-model.js";
import { getProjectionRegistry } from "../core/projection/projection-registry.js";
import { createStyleModel } from "../core/style-model.js";
import { createViewModel } from "../core/view-model.js";
import { createShareStateUrl } from "../export/qr/state-url.js";
import { enableLayerMenuControls } from "./layer-menu-controls.js";
import { renderLayerMenuRows } from "./layer-menu-renderer.js";
import { enableRefreshControls } from "./refresh-controls.js";
import { createPrintRendererAdapter } from "../renderers/print/print-renderer.js";
import { createScreenRendererAdapter } from "../renderers/screen/screen-renderer.js";
import { createEditableRuntimeStore } from "../sources/editable/runtime-store.js";
import { createPmtilesManifest } from "../sources/pmtiles/source-manifest.js";
import { getRowRuntimeTargetId, getRowStateKey } from "../core/layer-definitions.js";

const supabaseLayerDataCache = new Map();

async function bootstrapApplication() {
  const layerModel = createLayerModel();
  const styleModel = createStyleModel();
  const viewModel = createViewModel();
  const pmtilesManifest = createPmtilesManifest();
  const editableStore = createEditableRuntimeStore();
  const screenRenderer = createScreenRendererAdapter();
  const printRenderer = createPrintRendererAdapter();
  const projections = getProjectionRegistry();
  const viewState = viewModel.getState();
  const screenRuntime = createDeferredScreenRuntime();
  let mapStartupError = null;
  const debugOverlay = createStartupDebugOverlay({
    getStartupError: () => mapStartupError,
    getScreenRuntimeStatus: () => screenRuntime.getStatus(),
  });
  debugOverlay.update("bootstrap-start");

  let rerenderLayerMenu = () => {};
  const getLayerDatasets = async (layerId) => {
    const cached = supabaseLayerDataCache.get(layerId);
    if (Array.isArray(cached?.datasets) && cached.datasets.length) {
      return cached.datasets;
    }
    const { getLayerDatasets: loadDatasets } = await import("../sources/supabase/layer-loader.js");
    return loadDatasets(layerId);
  };
  const createFilterFromTableSelection = async ({ layerId, columnName, value }) => {
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
    screenRuntime.reapplyFullOrder?.();
    rerenderLayerMenu();
  };
  const renameDataset = async ({ datasetId, name }) => {
    const { updateDatasetName } = await import("../sources/supabase/layer-loader.js");
    const result = await updateDatasetName(datasetId, name);
    supabaseLayerDataCache.forEach((cached) => {
      if (!Array.isArray(cached?.datasets)) {
        return;
      }
      cached.datasets = cached.datasets.map((dataset) => (
        dataset?.id === datasetId ? { ...dataset, name: result.name } : dataset
      ));
    });
    return result;
  };
  const updateDatasetMetadata = async ({ datasetId, license, licenseUrl, attribution }) => {
    const { updateDatasetMetadata: saveDatasetMetadata } = await import("../sources/supabase/layer-loader.js");
    const result = await saveDatasetMetadata(datasetId, { license, licenseUrl, attribution });
    supabaseLayerDataCache.forEach((cached) => {
      if (!Array.isArray(cached?.datasets)) {
        return;
      }
      cached.datasets = cached.datasets.map((dataset) => (
        dataset?.id === datasetId
          ? {
            ...dataset,
            license: result.license,
            license_url: result.license_url,
            attribution: result.attribution,
          }
          : dataset
      ));
    });
    return result;
  };
  let addDataPanelPromise = null;
  let dataTablePanelPromise = null;
  let createLayerPanelPromise = null;
  const getAddDataPanel = () => {
    if (!addDataPanelPromise) {
      addDataPanelPromise = import("./add-data-panel.js").then(({ mountAddDataPanel }) => mountAddDataPanel({
        getAppearanceState: () => layerModel.getAppearanceState(),
        getLayerDatasets,
        async onDataAdded({ layerId, datasetId }) {
          const dataTablePanel = await getDataTablePanel();
          await dataTablePanel?.reloadLayerData?.({ layerId, datasetId });
        },
      }));
    }
    return addDataPanelPromise;
  };
  const getDataTablePanel = () => {
    if (!dataTablePanelPromise) {
      dataTablePanelPromise = import("./data-table-panel.js").then(({ mountDataTablePanel }) => mountDataTablePanel({
        getAppearanceState: () => layerModel.getAppearanceState(),
        getLayerDatasets,
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
          void getAddDataPanel()
            .then((addDataPanel) => addDataPanel.open(args))
            .catch((error) => console.error("Failed to open add data panel.", error));
        },
        onRenameDataset: renameDataset,
        onUpdateDatasetMetadata: updateDatasetMetadata,
      }));
    }
    return dataTablePanelPromise;
  };
  const getCreateLayerPanel = () => {
    if (!createLayerPanelPromise) {
      createLayerPanelPromise = import("./create-layer-panel.js").then(({ mountCreateLayerPanel }) => mountCreateLayerPanel({
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
      }));
    }
    return createLayerPanelPromise;
  };

  rerenderLayerMenu = renderLayerMenuRows({
    panel: document.getElementById("layerMenuPanel"),
    layerModel,
    onAddRow: ({ kind, parentId }) => {
      if (kind === "open-add-panel") {
        void getCreateLayerPanel()
          .then((createLayerPanel) => createLayerPanel.open({ parentId }))
          .catch((error) => console.error("Failed to open create layer panel.", error));
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
          if (
            nextValue !== false
            && targetRow.layerRef
            && SUPABASE_UUID.test(targetRow.layerRef)
            && !supabaseLayerDataCache.has(targetRow.layerRef)
          ) {
            void reloadSupabaseLayer(targetRow.layerRef, layerModel, screenRuntime)
              .catch((error) => console.warn("Failed to load toggled layer.", error));
          }
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

      void getDataTablePanel()
        .then((dataTablePanel) => {
          dataTablePanel.open({
            layerId: row.layerRef,
            layerName: row.label ?? row.name ?? "Dataset",
          });
        })
        .catch((error) => console.error("Failed to open data table panel.", error));
    },
    onFilterAction: (row) => {
      if (!row?.layerRef || !SUPABASE_UUID.test(row.layerRef)) {
        return;
      }

      console.info("[layers] Filter builder is not implemented yet.", {
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
  debugOverlay.update("window-layer-v2-ready");

  const startMapRuntime = async () => {
    debugOverlay.update("map-start-requested");
    try {
      await waitForMaplibreGlobal();
      debugOverlay.update("maplibre-global-ready");
      const { createMaplibreScreenRuntime } = await import("../renderers/screen/maplibre/runtime.js");
      debugOverlay.update("runtime-module-loaded");
      const runtime = createMaplibreScreenRuntime({
        pmtilesManifest,
        viewState,
        initialLayerState: layerModel.getState(),
        getRuntimeVectors: () => editableStore.getCollections(),
        getOrderedChildRowIds: (parentId) => layerModel.getOrderedChildRowIds(parentId),
      });
      runtime.mount(document.getElementById("mapStage"));
      debugOverlay.update("runtime-mounted");
      screenRuntime.setRuntime(runtime);
      if (window.LayerV2) {
        window.LayerV2.screenRuntime = runtime.getStatus();
        window.LayerV2.mapStartupError = null;
      }
      debugOverlay.update("runtime-live");
      runtime.whenStyleReady(() => {
        debugOverlay.update("style-ready");
        window.setTimeout(() => {
          void reattachPersistedSupabaseLayers(layerModel, screenRuntime);
        }, 0);
      });
    } catch (error) {
      mapStartupError = error;
      screenRuntime.setStartupError(error);
      console.error("Map startup failed.", error);
      document.body.dataset.mapStartup = "failed";
      if (window.LayerV2) {
        window.LayerV2.mapStartupError = String(error?.message ?? error);
        window.LayerV2.screenRuntime = screenRuntime.getStatus();
      }
      debugOverlay.update("map-start-failed");
    }
  };

  void startMapRuntime();

  void editableStore.initialize()
    .then(() => {
      if (window.LayerV2?.sources) {
        window.LayerV2.sources.editable = editableStore.getCollections();
      }
      debugOverlay.update("editable-store-ready");
    })
    .catch((error) => {
      console.warn("Failed to initialize editable store.", error);
      debugOverlay.update("editable-store-failed");
    });

  return {
    editableStore,
    screenRuntime,
  };
}

function createStartupDebugOverlay({
  getStartupError = () => null,
  getScreenRuntimeStatus = () => null,
} = {}) {
  const token = "map-debug-2026-05-15-a";
  const overlay = document.createElement("section");
  overlay.className = "startup-debug is-collapsed";
  overlay.setAttribute("aria-label", "Map startup debug");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "startup-debug-toggle";
  button.setAttribute("aria-expanded", "false");
  button.textContent = "Debug";

  const body = document.createElement("div");
  body.className = "startup-debug-body";
  overlay.append(button, body);
  document.body.append(overlay);

  let collapsed = true;
  let lastPhase = "init";
  let renderCount = 0;
  let intervalId = null;

  const fmtRect = (rect) => `${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`;
  const bool = (value) => (value ? "yes" : "no");

  function readState() {
    const stage = document.getElementById("mapStage");
    const stageRect = stage?.getBoundingClientRect?.();
    const canvas = stage?.querySelector?.("canvas");
    const canvasRect = canvas?.getBoundingClientRect?.();
    const status = getScreenRuntimeStatus?.() ?? null;
    const startupError = getStartupError?.() ?? window.LayerV2?.mapStartupError ?? null;
    const errorText = startupError ? String(startupError?.message ?? startupError) : "none";
    const topElement = document.elementFromPoint?.(16, 16);

    return [
      ["token", token],
      ["phase", lastPhase],
      ["maplibre", bool(Boolean(window.maplibregl))],
      ["startup", document.body.dataset.mapStartup ?? status?.startupMode ?? "none"],
      ["live", bool(Boolean(status?.liveMap))],
      ["zoom", Number.isFinite(status?.zoom) ? status.zoom.toFixed(2) : "none"],
      ["error", errorText.slice(0, 92)],
      ["stage", stageRect ? fmtRect(stageRect) : "missing"],
      ["canvas", canvasRect ? fmtRect(canvasRect) : "missing"],
      ["canvases", String(stage?.querySelectorAll?.("canvas")?.length ?? 0)],
      ["top-left", topElement?.id || topElement?.className || topElement?.tagName || "unknown"],
    ];
  }

  function render() {
    renderCount += 1;
    body.innerHTML = readState().map(([label, value]) => `
      <div class="startup-debug-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
    if (renderCount > 60 && intervalId != null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  button.addEventListener("click", () => {
    collapsed = !collapsed;
    overlay.classList.toggle("is-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
  });

  intervalId = window.setInterval(render, 500);
  render();

  return {
    update(phase) {
      lastPhase = phase;
      render();
    },
  };
}

function waitForMaplibreGlobal({ timeoutMs = 8000 } = {}) {
  if (window.maplibregl) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (window.maplibregl) {
        resolve();
        return;
      }
      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error("MapLibre failed to load before map startup timeout."));
        return;
      }
      window.setTimeout(check, 25);
    };
    check();
  });
}

function createDeferredScreenRuntime() {
  let runtime = null;
  let startupError = null;
  const queuedCalls = [];

  const withRuntime = (callback) => {
    if (runtime) {
      callback(runtime);
      return;
    }
    if (!startupError) {
      queuedCalls.push(callback);
    }
  };

  const flushQueuedCalls = () => {
    if (!runtime) {
      return;
    }
    queuedCalls.splice(0).forEach((callback) => {
      try {
        callback(runtime);
      } catch (error) {
        console.warn("Deferred screen runtime call failed.", error);
      }
    });
  };

  return {
    setRuntime(nextRuntime) {
      runtime = nextRuntime;
      startupError = null;
      flushQueuedCalls();
    },
    setStartupError(error) {
      startupError = error;
      queuedCalls.splice(0);
    },
    destroy() {
      if (runtime) {
        runtime.destroy?.();
      } else {
        queuedCalls.splice(0);
      }
    },
    getStatus() {
      if (runtime) {
        return runtime.getStatus?.() ?? { renderer: "maplibre-screen-adapter" };
      }
      return {
        renderer: "maplibre-screen-adapter",
        startupMode: startupError ? "startup-failed" : "loading-map-runtime",
        liveMap: false,
      };
    },
    mount(container) {
      withRuntime((target) => target.mount?.(container));
    },
    renderStage(container) {
      withRuntime((target) => target.renderStage?.(container));
    },
    whenStyleReady(callback) {
      withRuntime((target) => target.whenStyleReady?.(callback));
    },
    reorderLayerGroup(parentId, orderedLayerIds) {
      withRuntime((target) => target.reorderLayerGroup?.(parentId, orderedLayerIds));
    },
    reapplyFullOrder() {
      withRuntime((target) => target.reapplyFullOrder?.());
    },
    reapplyRowSubtreeOrder(rowId) {
      withRuntime((target) => target.reapplyRowSubtreeOrder?.(rowId));
    },
    setLayerStyleValue(layerId, key, value) {
      withRuntime((target) => target.setLayerStyleValue?.(layerId, key, value));
    },
    loadDynamicLayer(args) {
      withRuntime((target) => target.loadDynamicLayer?.(args));
    },
    setDynamicLayerFeatureFilter(layerId, featureFilter) {
      withRuntime((target) => target.setDynamicLayerFeatureFilter?.(layerId, featureFilter));
      return Boolean(runtime);
    },
    detachDynamicLayer(layerId) {
      withRuntime((target) => target.detachDynamicLayer?.(layerId));
    },
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

async function loadLayerFromSupabaseLazy(layerId) {
  const { loadLayerFromSupabase } = await import("../sources/supabase/layer-loader.js");
  return loadLayerFromSupabase(layerId);
}

async function reattachPersistedSupabaseLayers(layerModel, screenRuntime) {
  const supabaseLayers = layerModel.getSupabaseLayers();
  if (!supabaseLayers.length) return;

  let suppressedAny = false;
  for (const { rowId, layerId } of supabaseLayers) {
    try {
      const row = layerModel.getRowById(rowId);
      const loadedLayer = await loadLayerFromSupabaseLazy(layerId);
      const { layer, geojson, tilesUrl } = loadedLayer;
      supabaseLayerDataCache.set(layerId, loadedLayer);
      const rowState = layerModel.getState()?.[rowId] ?? {};
      if (geojson || tilesUrl) {
        screenRuntime.loadDynamicLayer({
          layerId,
          rowId,
          parentRowId: rowState.parentRowId ?? null,
          childRows: row?.rows ?? [],
          geojson,
          tilesUrl,
          style: layer.default_style,
          options: {
            geometryTypes: Array.isArray(layer.geometry_types) ? layer.geometry_types : [],
            geometryType: layer.geometry_type ?? null,
          },
        });
      }
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

  const rowState = layerModel.getState()?.[row.id] ?? {};
  screenRuntime.loadDynamicLayer?.({
    layerId: getRowRuntimeTargetId(row),
    rowId: row.id,
    parentRowId: rowState.parentRowId ?? null,
    childRows: row.rows ?? [],
    geojson: null,
    tilesUrl: null,
    style: null,
    options: {
      sourceLayerId: row.filter.parentLayerId,
      geometryTypes: row.geometryTypes ?? [],
      geometryType: row.geometryType,
      featureFilter: buildExactMatchFilterExpression(row.filter.field, row.filter.value),
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
    layerResult = await loadLayerFromSupabaseLazy(layerRef);
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
      rowId: added.id,
      parentRowId: resolvedParentId === layerModel.getRootParentId() ? null : resolvedParentId,
      childRows: added.rows ?? [],
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
  const layerResult = await loadLayerFromSupabaseLazy(layerId);
  const { layer, geojson, tilesUrl, sourceLayerId } = layerResult;
  supabaseLayerDataCache.set(layerId, layerResult);
  screenRuntime.detachDynamicLayer(layerId);
  if (geojson || tilesUrl) {
    const targetRow = layerModel.getSupabaseLayers().find((entry) => entry.layerId === layerId);
    const row = targetRow ? layerModel.getRowById(targetRow.rowId) : null;
    const rowState = targetRow ? layerModel.getState()?.[targetRow.rowId] ?? {} : {};
    screenRuntime.loadDynamicLayer({
      layerId,
      rowId: targetRow?.rowId ?? null,
      parentRowId: rowState.parentRowId ?? null,
      childRows: row?.rows ?? [],
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
