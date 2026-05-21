import { createLayerModel, saveLayerPersistenceSnapshot } from "../core/layer-model.js";
import { getProjectionRegistry } from "../core/projection/projection-registry.js";
import { createStyleModel } from "../core/style-model.js";
import { createViewModel } from "../core/view-model.js";
import { enableLayerMenuControls } from "./layer-menu-controls.js";
import { renderLayerMenuRows } from "./layer-menu-renderer.js";
import { createPrintRendererAdapter } from "../renderers/print/print-renderer.js";
import { createScreenRendererAdapter } from "../renderers/screen/screen-renderer.js";
import { createEditableRuntimeStore } from "../sources/editable/runtime-store.js";
import { createPmtilesManifest } from "../sources/pmtiles/source-manifest.js";
import { getRowRuntimeTargetId, getRowStateKey } from "../core/layer-definitions.js";
import { bindShareControls, readShareSnapshotFromLocation } from "./share-controls.js";
import { bindTitleControls } from "./title-controls.js";
import { createFeatureInspector } from "./feature-inspector.js";

const supabaseLayerDataCache = new Map();

async function bootstrapApplication() {
  const styleModel = createStyleModel();
  const sharedSnapshot = await readShareSnapshotFromLocation();
  if (sharedSnapshot?.layers) {
    saveLayerPersistenceSnapshot(sharedSnapshot.layers);
  }
  const layerModel = createLayerModel();
  const viewModel = createViewModel(sharedSnapshot?.view);
  const pmtilesManifest = createPmtilesManifest();
  const editableStore = createEditableRuntimeStore();
  const screenRenderer = createScreenRendererAdapter();
  const printRenderer = createPrintRendererAdapter();
  const projections = getProjectionRegistry();
  const featureInspector = createFeatureInspector();
  const viewState = {
    ...viewModel.getState(),
    hasCameraState: viewModel.hasCameraState(),
  };
  const screenRuntime = createDeferredScreenRuntime();
  let mapStartupError = null;

  let rerenderLayerMenu = () => {};
  const getLayerDatasets = async (layerId) => {
    const cached = supabaseLayerDataCache.get(layerId);
    if (Array.isArray(cached?.datasets) && cached.datasets.length) {
      return cached.datasets;
    }
    const { getLayerDatasets: loadDatasets } = await import("../sources/supabase/layer-loader.js");
    return loadDatasets(layerId);
  };
  const createFilterFromTableSelection = async ({ layerId, parentRowId = "", columnName, value, op = "==", mode = "fixed", variableConfig = null }) => {
    const parentRow = parentRowId
      ? layerModel.getRowById(parentRowId)
      : findLayerRowByLayerRef(layerModel, layerId);
    if (!parentRow) {
      throw new Error("Could not find the parent layer for this filter.");
    }

    if (mode === "variable") {
      const controlType = variableConfig?.controlType === "dropdown" ? "dropdown" : "slider";
      const variableId = String(variableConfig?.variableId ?? "").trim();
      if (!variableId) {
        throw new Error("Variable is required.");
      }
      const controlRow = layerModel.addRowToLayer(parentRow.id, controlType === "dropdown" ? "variable-select" : "slider", {
        label: variableConfig?.label || "Variable",
        variableId,
        min: variableConfig?.min,
        max: variableConfig?.max,
        step: variableConfig?.step,
        initialValue: variableConfig?.initialValue,
        options: variableConfig?.options,
      });
      if (!controlRow) {
        throw new Error("Failed to create variable control row.");
      }

      const conditions = Array.isArray(variableConfig?.conditions) && variableConfig.conditions.length
        ? variableConfig.conditions
        : [{ field: columnName, op, valueRef: variableId }];
      const variableFilter = layerModel.addVariableFilterToLayer(parentRow.id, {
        label: variableConfig?.filterLabel || variableConfig?.label || "Variable filter",
        controlRowId: controlRow.id,
        combinator: variableConfig?.combinator ?? "all",
        conditions,
      });
      if (!variableFilter) {
        throw new Error("Failed to create variable filter.");
      }

      syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
      syncChildDynamicFilterRows(layerModel, screenRuntime, parentRow);
      screenRuntime.reapplyFullOrder?.();
      rerenderLayerMenu();
      return;
    }

    const existingFilterRow = layerModel.getChildRows(parentRow.id).find((row) => (
      row?.type === "layer"
      && row.kind === "filter"
      && row.filter?.field === String(columnName)
      && (row.filter?.op ?? "==") === op
      && String(row.filter?.value ?? "") === String(value ?? "")
    ));
    if (existingFilterRow) {
      return;
    }

    const nextRow = layerModel.addRowToLayer(parentRow.id, "filter", {
      name: `${columnName} ${formatFilterOperatorLabel(op)} ${value === "" ? "Empty value" : value}`,
      field: columnName,
      value,
      op,
      sourceLayerId: layerId,
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
  const updateFilterFromPanel = async ({ editFilter, columnName, value, op = "==", mode = "fixed", variableConfig = null }) => {
    if (!editFilter) {
      throw new Error("No filter was selected for editing.");
    }

    if (mode === "variable") {
      const controlRowId = editFilter.controlRowId;
      const controlType = variableConfig?.controlType === "dropdown" ? "dropdown" : "slider";
      const variableId = String(variableConfig?.variableId ?? "").trim();
      if (!controlRowId || !variableId) {
        throw new Error("Variable filter details are missing.");
      }
      const result = layerModel.updateVariableFilterForControlRow(controlRowId, {
        controlType,
        label: variableConfig?.label || "Variable",
        variableId,
        min: variableConfig?.min,
        max: variableConfig?.max,
        step: variableConfig?.step,
        initialValue: variableConfig?.initialValue,
        options: variableConfig?.options,
        filterLabel: variableConfig?.filterLabel || variableConfig?.label || "Variable filter",
        combinator: variableConfig?.combinator ?? "all",
        conditions: Array.isArray(variableConfig?.conditions) && variableConfig.conditions.length
          ? variableConfig.conditions
          : [{ field: columnName, op, valueRef: variableId }],
      });
      if (!result) {
        throw new Error("Failed to save variable filter.");
      }
      syncParentDynamicFilterOwnership(layerModel, screenRuntime, result.parentRow);
      syncChildDynamicFilterRows(layerModel, screenRuntime, result.parentRow);
      screenRuntime.reapplyFullOrder?.();
      rerenderLayerMenu();
      return;
    }

    const updatedRow = layerModel.updateFixedFilterRow(editFilter.rowId, {
      name: `${columnName} ${formatFilterOperatorLabel(op)} ${value === "" ? "Empty value" : value}`,
      field: columnName,
      value,
      op,
    });
    if (!updatedRow) {
      throw new Error("Failed to save filter.");
    }
    screenRuntime.setDynamicLayerFeatureFilter?.(
      getRowRuntimeTargetId(updatedRow),
      buildDynamicFilterLayerExpression(layerModel, updatedRow),
    );
    const parentRow = updatedRow?.filter?.parentLayerId
      ? (findRowByRuntimeTargetId(layerModel, updatedRow.filter.parentLayerId) ?? findLayerRowByLayerRef(layerModel, updatedRow.filter.parentLayerId))
      : null;
    if (parentRow) {
      syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
    }
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
  const renameLayer = async ({ layerId, name }) => {
    const { invalidateSupabaseCatalogCache, updateLayerName } = await import("../sources/supabase/layer-loader.js");
    const result = await updateLayerName(layerId, name);
    invalidateSupabaseCatalogCache();
    const cached = supabaseLayerDataCache.get(layerId);
    if (cached?.layer) {
      cached.layer = { ...cached.layer, name: result.name };
    }
    layerModel.renameDataRowByLayerRef(layerId, result.name);
    rerenderLayerMenu();
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
  const updateFeatureInspectorDefault = async ({ datasetId, config }) => {
    const { updateDatasetFeatureInspector } = await import("../sources/supabase/layer-loader.js");
    const result = await updateDatasetFeatureInspector(datasetId, config);
    supabaseLayerDataCache.forEach((cached) => {
      if (!Array.isArray(cached?.datasets)) {
        return;
      }
      cached.datasets = cached.datasets.map((dataset) => (
        dataset?.id === datasetId
          ? { ...dataset, feature_inspector: result.feature_inspector ?? {} }
          : dataset
      ));
    });
    return result.feature_inspector ?? {};
  };
  const applyFeatureInspectorDefaultToLayer = async ({ layerId, config }) => {
    const { updateLayerDatasetsFeatureInspector } = await import("../sources/supabase/layer-loader.js");
    const results = await updateLayerDatasetsFeatureInspector(layerId, config);
    const savedConfigByDatasetId = new Map(results.map((dataset) => [dataset.id, dataset.feature_inspector ?? {}]));
    const cached = supabaseLayerDataCache.get(layerId);
    if (cached && Array.isArray(cached.datasets)) {
      cached.datasets = cached.datasets.map((dataset) => (
        savedConfigByDatasetId.has(dataset.id)
          ? { ...dataset, feature_inspector: savedConfigByDatasetId.get(dataset.id) }
          : dataset
      ));
    }
    return results[0]?.feature_inspector ?? config;
  };
  let addDataPanelPromise = null;
  let dataTablePanelPromise = null;
  let createLayerPanelPromise = null;
  let filterPanelPromise = null;
  let addRowPanelPromise = null;
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
        onRenameLayer: renameLayer,
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
  const getFilterPanel = () => {
    if (!filterPanelPromise) {
      filterPanelPromise = import("./filter-panel.js").then(({ mountFilterPanel }) => mountFilterPanel({
        getLayerFields: loadLayerFields,
        getLayerFieldValues: loadLayerFieldValues,
        onCreateFilter: createFilterFromTableSelection,
        onUpdateFilter: updateFilterFromPanel,
      }));
    }
    return filterPanelPromise;
  };
  const getAddRowPanel = () => {
    if (!addRowPanelPromise) {
      addRowPanelPromise = import("./add-row-panel.js").then(({ mountAddRowPanel }) => mountAddRowPanel({
        onCreateRow({ parentId, rowType, config }) {
          const nextRow = layerModel.addRowToLayer(parentId, rowType, config);
          if (!nextRow) {
            throw new Error("Failed to create row.");
          }
          rerenderLayerMenu();
          return nextRow;
        },
      }));
    }
    return addRowPanelPromise;
  };

  rerenderLayerMenu = renderLayerMenuRows({
    panel: document.getElementById("layerMenuPanel"),
    layerModel,
    onAddRow: ({ kind, parentId, depth }) => {
      if (kind === "open-add-panel") {
        if (depth > 0) {
          void getAddRowPanel()
            .then((addRowPanel) => addRowPanel.open({ parentId }))
            .catch((error) => console.error("Failed to open add row panel.", error));
          return;
        }
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

      if (update.target?.kind === "earth-land-detail") {
        screenRuntime.setEarthLandDetail(update.value);
        return;
      }

      if (update.target?.kind === "source-choice") {
        const selectedOption = Array.isArray(row.options)
          ? row.options.find((option) => String(option.value) === String(update.value))
          : null;
        screenRuntime.setSourceChoice(update.target, selectedOption ?? { value: update.value });
        return;
      }

      if (update.target?.kind === "row-variable") {
        applyVariableDrivenFilterRows(layerModel, screenRuntime, row.variableId ?? update.key);
        return;
      }

      // Skip map update if the row has been disabled.
      if (!layerModel.isRowVisible(row.id)) {
        return;
      }

      screenRuntime.setLayerStyleValue(update.runtimeTargetId ?? update.layerId, update.key, update.value);
      // Persist style changes as new defaults for Supabase layers.
      const styleOwnerLayerRef = getStyleOwnerLayerRef(layerModel, update);
      if (styleOwnerLayerRef) {
        debouncedUpdateDefaultStyle(styleOwnerLayerRef, update.key, update.value);
      }
    },
    onRemoveRow: (rowId, parentId, row) => {
      const removed = layerModel.removeRow(rowId, parentId);
      if (!removed) return;
      const affectedVariableFilterParents = layerModel.removeVariableFiltersForControlRow(rowId)
        .map((affectedParentId) => layerModel.getRowById(affectedParentId))
        .filter(Boolean);
      // If removing a dynamic layer row, also detach it from the map.
      if (row?.type === "layer" && row?.layerRef) {
        screenRuntime.detachDynamicLayer(row.layerRef);
      } else if (row?.kind === "filter") {
        const parentRow = row?.filter?.parentLayerId
          ? (findRowByRuntimeTargetId(layerModel, row.filter.parentLayerId) ?? findLayerRowByLayerRef(layerModel, row.filter.parentLayerId))
          : null;
        screenRuntime.detachDynamicLayer(getRowRuntimeTargetId(row));
        if (parentRow) {
          syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
        }
      }
      affectedVariableFilterParents.forEach((parentRow) => {
        syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
        syncChildDynamicFilterRows(layerModel, screenRuntime, parentRow);
      });
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
      const sourceLayerId = getFilterActionSourceLayerId(row, layerModel);
      if (!sourceLayerId || !SUPABASE_UUID.test(sourceLayerId)) {
        return;
      }

      void getFilterPanel()
        .then((filterPanel) => {
          filterPanel.open({
            layerId: sourceLayerId,
            layerName: row.label ?? row.name ?? "Dataset",
            parentRowId: row.id,
          });
        })
        .catch((error) => console.error("Failed to open filter panel.", error));
    },
    onEditFilterAction: (row) => {
      const variableMatch = findVariableFilterByControlRow(layerModel, row?.id);
      const parentRow = row?.kind === "filter" && row?.filter?.parentLayerId
        ? (findRowByRuntimeTargetId(layerModel, row.filter.parentLayerId) ?? findLayerRowByLayerRef(layerModel, row.filter.parentLayerId))
        : variableMatch?.parentRow;
      const targetRow = parentRow ?? row;
      const sourceLayerId = getFilterActionSourceLayerId(targetRow, layerModel);
      if (!sourceLayerId || !SUPABASE_UUID.test(sourceLayerId)) {
        return;
      }
      const editFilter = row?.kind === "filter"
        ? {
          mode: "fixed",
          rowId: row.id,
          columnName: row.filter?.field ?? "",
          value: row.filter?.value ?? "",
          op: row.filter?.op ?? "==",
        }
        : createVariableFilterEditPayload(layerModel, row, variableMatch?.filter);

      void getFilterPanel()
        .then((filterPanel) => {
          filterPanel.edit({
            layerId: sourceLayerId,
            layerName: targetRow.label ?? targetRow.name ?? "Dataset",
            parentRowId: targetRow.id,
            filter: editFilter,
          });
        })
        .catch((error) => console.error("Failed to open filter panel.", error));
    },
  });
  const layerMenuControls = enableLayerMenuControls({
    wrapper: document.getElementById("layerMenu"),
    button: document.getElementById("layerMenuButton"),
    panel: document.getElementById("layerMenuPanel"),
    reloadMenu: document.getElementById("layerMenuReloadMenu"),
    reloadButton: document.getElementById("layerMenuReloadButton"),
    hardReloadButton: document.getElementById("layerMenuHardReloadButton"),
    clearCacheReloadButton: document.getElementById("layerMenuClearCacheReloadButton"),
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
    shareUrl: null,
    rerenderLayerMenu,
  };
  bindShareControls({
    layerModel,
    screenRuntime,
    viewModel,
  });
  bindTitleControls({ viewModel });

  const startMapRuntime = async () => {
    try {
      await waitForMaplibreGlobal();
      const { createMaplibreScreenRuntime } = await import("../renderers/screen/maplibre/runtime.js");
      const runtime = createMaplibreScreenRuntime({
        pmtilesManifest,
        viewState,
        initialLayerState: layerModel.getState(),
        getRuntimeVectors: () => editableStore.getCollections(),
        getOrderedChildRowIds: (parentId) => layerModel.getOrderedChildRowIds(parentId),
        onCameraChange: (camera) => {
          viewModel.setCamera(camera, { persist: true });
        },
        onFeatureSelect: (feature) => {
          if (!feature) {
            featureInspector.close();
            return;
          }
          const row = layerModel.getRowById(feature.layerId) ?? findLayerRowByLayerRef(layerModel, feature.layerId);
          const sourceLayerId = row?.kind === "filter" && row?.filter?.parentLayerId
            ? row.filter.parentLayerId
            : feature.layerId;
          const dataset = resolveFeatureDataset(supabaseLayerDataCache, feature, sourceLayerId);
          featureInspector.open({
            ...feature,
            datasetId: dataset?.id ?? feature.properties?._dataset_id ?? "",
            datasetName: dataset?.name ?? feature.properties?._dataset_name ?? "",
            layerName: row?.label ?? row?.name ?? feature.layerId,
          }, {
            config: dataset?.feature_inspector ?? {},
            onSaveConfig: dataset?.id
              ? (config) => updateFeatureInspectorDefault({ datasetId: dataset.id, config })
              : null,
            onApplyConfigToLayer: sourceLayerId
              ? (config) => applyFeatureInspectorDefaultToLayer({ layerId: sourceLayerId, config })
              : null,
          });
        },
      });
      runtime.mount(document.getElementById("mapStage"));
      screenRuntime.setRuntime(runtime);
      if (window.LayerV2) {
        window.LayerV2.screenRuntime = runtime.getStatus();
        window.LayerV2.mapStartupError = null;
      }
      runtime.whenStyleReady(() => {
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
    }
  };

  void startMapRuntime();

  void editableStore.initialize()
    .then(() => {
      if (window.LayerV2?.sources) {
        window.LayerV2.sources.editable = editableStore.getCollections();
      }
    })
    .catch((error) => {
      console.warn("Failed to initialize editable store.", error);
    });

  return {
    editableStore,
    screenRuntime,
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
    getCameraState() {
      return runtime?.getCameraState?.() ?? null;
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
    setEarthLandDetail(detail) {
      withRuntime((target) => target.setEarthLandDetail?.(detail));
    },
    setSourceChoice(choiceTarget, option) {
      withRuntime((target) => target.setSourceChoice?.(choiceTarget, option));
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

async function loadLayerFieldValues(layerRef, fieldKey) {
  if (!SUPABASE_UUID.test(layerRef)) return [];
  try {
    const { getLayerFieldValues } = await import("../sources/supabase/layer-loader.js");
    return await getLayerFieldValues(layerRef, fieldKey);
  } catch {
    return [];
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

function getStyleOwnerLayerRef(layerModel, update) {
  if (!update || update.target?.kind !== "layer-style") {
    return "";
  }
  if (SUPABASE_UUID.test(update.layerId)) {
    return update.layerId;
  }

  const runtimeTargetId = update.runtimeTargetId ?? update.layerId;
  const runtimeTargetBase = /^(.+)::/.exec(runtimeTargetId ?? "")?.[1] ?? runtimeTargetId;
  const ownerRow = findRowByRuntimeTargetId(layerModel, runtimeTargetBase)
    ?? layerModel.getRowById(runtimeTargetBase);
  return ownerRow?.layerRef && SUPABASE_UUID.test(ownerRow.layerRef)
    ? ownerRow.layerRef
    : "";
}

function findVariableFilterParentByControlRow(layerModel, controlRowId) {
  const targetControlRowId = String(controlRowId ?? "");
  if (!targetControlRowId) {
    return null;
  }

  const visit = (rows = []) => {
    for (const row of rows) {
      if (
        Array.isArray(row?.variableFilters)
        && row.variableFilters.some((filter) => String(filter?.controlRowId ?? "") === targetControlRowId)
      ) {
        return row;
      }
      const found = visit(layerModel.getChildRows(row.id));
      if (found) {
        return found;
      }
    }
    return null;
  };

  return visit(layerModel.getRootRows());
}

function findVariableFilterByControlRow(layerModel, controlRowId) {
  const targetControlRowId = String(controlRowId ?? "");
  if (!targetControlRowId) {
    return null;
  }

  const visit = (rows = []) => {
    for (const row of rows) {
      if (Array.isArray(row?.variableFilters)) {
        const filter = row.variableFilters.find((entry) => String(entry?.controlRowId ?? "") === targetControlRowId);
        if (filter) {
          return { parentRow: row, filter };
        }
      }
      const found = visit(layerModel.getChildRows(row.id));
      if (found) {
        return found;
      }
    }
    return null;
  };

  return visit(layerModel.getRootRows());
}

function createVariableFilterEditPayload(layerModel, controlRow, variableFilter) {
  const conditions = Array.isArray(variableFilter?.conditions) ? variableFilter.conditions : [];
  const valueRef = conditions.find((condition) => condition?.valueRef)?.valueRef
    ?? controlRow?.variableId
    ?? controlRow?.key
    ?? controlRow?.target?.key
    ?? "year";
  const activeRangeFields = conditions.length >= 2
    && conditions.some((condition) => condition.op === "<=" && String(condition.valueRef) === String(valueRef))
    && conditions.some((condition) => condition.op === ">=" && String(condition.valueRef) === String(valueRef));
  const matchCondition = conditions.find((condition) => String(condition.valueRef ?? "") === String(valueRef)) ?? conditions[0] ?? null;
  const currentValue = layerModel.getRowValue(controlRow);
  const dropdown = controlRow?.type === "variable-select" || controlRow?.type === "choice-slider";

  return {
    mode: "variable",
    controlRowId: controlRow?.id ?? "",
    columnName: matchCondition?.field ?? "",
    variableLogic: activeRangeFields ? "activeRange" : "match",
    variableControlType: dropdown ? "dropdown" : "slider",
    op: activeRangeFields ? "==" : matchCondition?.op ?? "==",
    variableLabel: controlRow?.label ?? variableFilter?.label ?? "Variable",
    variableId: String(valueRef),
    variableMin: dropdown ? "" : String(controlRow?.min ?? ""),
    variableMax: dropdown ? "" : String(controlRow?.max ?? ""),
    variableStep: dropdown ? "1" : String(controlRow?.step ?? "1"),
    variableDefault: currentValue == null ? "" : String(currentValue),
  };
}

function getFilterActionSourceLayerId(row, layerModel = null) {
  if (row?.layerRef) {
    return row.layerRef;
  }
  if (row?.filter?.sourceLayerId) {
    return row.filter.sourceLayerId;
  }
  if (row?.filter?.parentLayerId && SUPABASE_UUID.test(row.filter.parentLayerId)) {
    return row.filter.parentLayerId;
  }
  if (row?.filter?.parentLayerId && layerModel) {
    const parentRow = findRowByRuntimeTargetId(layerModel, row.filter.parentLayerId)
      ?? layerModel.getRowById(row.filter.parentLayerId);
    if (parentRow && parentRow !== row) {
      return getFilterActionSourceLayerId(parentRow, layerModel);
    }
  }
  return "";
}

function formatFilterOperatorLabel(op) {
  if (op === "==") return "=";
  if (op === "all") return "any";
  return op || "=";
}

function resolveFeatureDataset(layerDataCache, feature, sourceLayerId = feature?.layerId) {
  const layerId = sourceLayerId;
  const properties = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
  const datasetId = String(properties._dataset_id ?? feature?.datasetId ?? "");
  const cached = layerDataCache.get(layerId);
  const datasets = Array.isArray(cached?.datasets) ? cached.datasets : [];
  if (datasetId) {
    return datasets.find((dataset) => dataset?.id === datasetId) ?? null;
  }
  return datasets.length === 1 ? datasets[0] : null;
}

function buildExactMatchFilterExpression(field, value) {
  return [
    "==",
    ["to-string", ["coalesce", ["get", field], ""]],
    value == null ? "" : String(value),
  ];
}

function buildStringComparisonFilterExpression(op, field, value) {
  const comparisonValue = value == null ? "" : String(value);
  if (op === "!=") {
    return [
      "!=",
      ["to-string", ["coalesce", ["get", field], ""]],
      comparisonValue,
    ];
  }
  return buildExactMatchFilterExpression(field, comparisonValue);
}

function resolveFilterValue(layerModel, value, valueRef) {
  if (!valueRef) {
    return value;
  }

  const variableRow = findVariableRow(layerModel, valueRef);
  if (!variableRow) {
    return value;
  }

  return layerModel.getRowValue(variableRow) ?? value;
}

function buildFilterConditionExpression(layerModel, condition) {
  if (!condition?.field) {
    return null;
  }

  const op = condition.op ?? "==";
  const value = resolveFilterValue(layerModel, condition.value, condition.valueRef);
  if (op === "all") {
    return null;
  }
  if (op === "==" || op === "=") {
    return buildExactMatchFilterExpression(condition.field, value);
  }
  if (op === "!=") {
    return buildStringComparisonFilterExpression(op, condition.field, value);
  }
  if ([">", ">=", "<", "<="].includes(op)) {
    return [
      op,
      ["to-number", ["coalesce", ["get", condition.field], 0]],
      Number(value) || 0,
    ];
  }
  return null;
}

function buildRowFilterExpression(layerModel, row) {
  const conditions = Array.isArray(row?.filter?.conditions) ? row.filter.conditions : null;
  if (conditions?.length) {
    const expressions = conditions
      .map((condition) => buildFilterConditionExpression(layerModel, condition))
      .filter(Boolean);
    if (!expressions.length) {
      return null;
    }
    const combinator = row.filter.combinator === "any" ? "any" : "all";
    return expressions.length === 1 ? expressions[0] : [combinator, ...expressions];
  }

  return buildFilterConditionExpression(layerModel, {
    field: row.filter.field,
    op: row.filter.op ?? "==",
    value: row.filter.value,
  });
}

function findVariableRow(layerModel, variableId) {
  const targetVariableId = String(variableId ?? "");
  if (!targetVariableId) {
    return null;
  }

  const visit = (rows = []) => {
    for (const row of rows) {
      if (row?.variableId === targetVariableId || row?.target?.key === targetVariableId) {
        return row;
      }
      const found = visit(layerModel.getChildRows(row.id));
      if (found) {
        return found;
      }
    }
    return null;
  };

  return visit(layerModel.getRootRows());
}

function rowFilterUsesVariable(row, variableId) {
  return Array.isArray(row?.filter?.conditions)
    && row.filter.conditions.some((condition) => String(condition?.valueRef ?? "") === String(variableId));
}

function variableFiltersUseVariable(row, variableId) {
  return Array.isArray(row?.variableFilters)
    && row.variableFilters.some((filter) => (
      Array.isArray(filter?.conditions)
      && filter.conditions.some((condition) => String(condition?.valueRef ?? "") === String(variableId))
    ));
}

function applyVariableDrivenFilterRows(layerModel, screenRuntime, variableId) {
  const visit = (rows = []) => {
    rows.forEach((row) => {
      if (row?.type === "layer" && row.kind === "filter" && row.filter && rowFilterUsesVariable(row, variableId)) {
        screenRuntime.setDynamicLayerFeatureFilter?.(
          getRowRuntimeTargetId(row),
          buildDynamicFilterLayerExpression(layerModel, row),
        );
      }
      if (row?.type === "layer" && variableFiltersUseVariable(row, variableId)) {
        syncParentDynamicFilterOwnership(layerModel, screenRuntime, row);
        syncChildDynamicFilterRows(layerModel, screenRuntime, row);
      }
      visit(layerModel.getChildRows(row.id));
    });
  };

  visit(layerModel.getRootRows());
}

function buildLayerVariableFilterExpression(layerModel, row) {
  const filters = Array.isArray(row?.variableFilters) ? row.variableFilters : [];
  const expressions = filters
    .map((filter) => buildFilterGroupExpression(layerModel, filter))
    .filter(Boolean);
  if (!expressions.length) {
    return null;
  }
  return expressions.length === 1 ? expressions[0] : ["all", ...expressions];
}

function buildDynamicFilterLayerExpression(layerModel, row) {
  const parentRow = row?.filter?.parentLayerId
    ? (findRowByRuntimeTargetId(layerModel, row.filter.parentLayerId) ?? findLayerRowByLayerRef(layerModel, row.filter.parentLayerId))
    : null;
  return combineFilterExpressions([
    parentRow ? buildLayerVariableFilterExpression(layerModel, parentRow) : null,
    buildRowFilterExpression(layerModel, row),
  ]);
}

function buildFilterGroupExpression(layerModel, filter) {
  const conditions = Array.isArray(filter?.conditions) ? filter.conditions : [];
  const expressions = conditions
    .map((condition) => buildFilterConditionExpression(layerModel, condition))
    .filter(Boolean);
  if (!expressions.length) {
    return null;
  }
  const combinator = filter.combinator === "any" ? "any" : "all";
  return expressions.length === 1 ? expressions[0] : [combinator, ...expressions];
}

function combineFilterExpressions(expressions = []) {
  const filters = expressions.filter(Boolean);
  if (!filters.length) {
    return null;
  }
  return filters.length === 1 ? filters[0] : ["all", ...filters];
}

function buildParentExclusionFilter(layerModel, parentRow) {
  if (!parentRow?.id) {
    return null;
  }

  const childFilterExpressions = layerModel.getChildRows(parentRow.id)
    .filter((row) => row?.type === "layer" && row.kind === "filter" && row.filter)
    .map((row) => buildRowFilterExpression(layerModel, row))
    .filter(Boolean);

  if (!childFilterExpressions.length) {
    return null;
  }

  if (childFilterExpressions.length === 1) {
    return ["!", childFilterExpressions[0]];
  }

  return ["!", ["any", ...childFilterExpressions]];
}

function syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id || (parentRow.kind !== "filter" && (!parentRow.layerRef || !SUPABASE_UUID.test(parentRow.layerRef)))) {
    return;
  }

  screenRuntime.setDynamicLayerFeatureFilter?.(
    getRowRuntimeTargetId(parentRow),
    combineFilterExpressions([
      buildLayerVariableFilterExpression(layerModel, parentRow),
      buildParentExclusionFilter(layerModel, parentRow),
    ]),
  );
}

function syncChildDynamicFilterRows(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id) {
    return;
  }

  layerModel.getChildRows(parentRow.id).forEach((childRow) => {
    if (childRow?.type === "layer" && childRow.kind === "filter" && childRow.filter) {
      screenRuntime.setDynamicLayerFeatureFilter?.(
        getRowRuntimeTargetId(childRow),
        buildDynamicFilterLayerExpression(layerModel, childRow),
      );
    }
  });
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
      featureFilter: buildDynamicFilterLayerExpression(layerModel, row),
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
    attachDynamicFilterRowsRecursively(layerModel, screenRuntime, row);
    syncParentDynamicFilterOwnership(layerModel, screenRuntime, row);
  }
  screenRuntime.reapplyFullOrder?.();
}

export { bootstrapApplication };
