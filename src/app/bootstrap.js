import { createLayerModel, saveLayerPersistenceSnapshot } from "../core/layer-model.js";
import { getProjectionRegistry } from "../core/projection/projection-registry.js";
import { createStyleModel } from "../core/style-model.js";
import { createViewModel } from "../core/view-model.js";
import { enableLayerMenuControls } from "./layer-menu-controls.js";
import { renderLayerMenuRows } from "./layer-menu-renderer.js";
import { createScreenRendererAdapter } from "../renderers/screen/screen-renderer.js";
import { createEditableRuntimeStore } from "../sources/editable/runtime-store.js";
import { createPmtilesManifest } from "../sources/pmtiles/source-manifest.js";
import { getRowRuntimeTargetId, getRowStateKey } from "../core/layer-definitions.js";
import {
  DATASET_FILTER_FIELD,
  DATASET_FILTER_LABEL,
  buildExactMatchFilterExpression,
  buildStringComparisonFilterExpression,
} from "../core/filter-expressions.js";
import { bindShareControls, readShareSnapshotFromLocation } from "./share-controls.js";
import { bindTitleControls } from "./title-controls.js";
import { createFeatureInspector } from "./feature-inspector.js";
import { isLocalAdminEnabled } from "../sources/supabase/local-admin-api.js";

const supabaseLayerDataCache = new Map();

function createLazyPrintRendererAdapter() {
  const contract = {
    primaryRenderer: "earthlab-print-view",
    responsibilities: [
      "print-specific projection render",
      "custom multi-projection layout",
      "projection lock, pan, zoom, and reset",
      "movable print title",
      "snapshot undo for print state",
      "worker-assisted flat projection rendering",
    ],
    nonGoals: [
      "screen-hot-path animation",
    ],
  };
  let rendererPromise = null;
  let renderer = null;

  async function loadRenderer() {
    if (!rendererPromise) {
      rendererPromise = import("../renderers/print/print-renderer.js")
        .then(({ createPrintRendererAdapter }) => {
          renderer = createPrintRendererAdapter();
          return renderer;
        });
    }
    return rendererPromise;
  }

  return {
    bind({ printButton, contextProvider }) {
      if (!printButton) {
        return;
      }
      const handleFirstOpen = async (event) => {
        event.preventDefault();
        printButton.disabled = true;
        try {
          const loadedRenderer = await loadRenderer();
          printButton.removeEventListener("click", handleFirstOpen);
          loadedRenderer.bind({ printButton, contextProvider });
          loadedRenderer.open(contextProvider?.() ?? {});
        } catch (error) {
          console.warn("[layers] Failed to load print mode.", error);
        } finally {
          printButton.disabled = false;
        }
      };
      printButton.addEventListener("click", handleFirstOpen);
    },
    close() {
      renderer?.close?.();
    },
    getContract() {
      return renderer?.getContract?.() ?? structuredClone(contract);
    },
    open(context) {
      return loadRenderer().then((loadedRenderer) => loadedRenderer.open(context));
    },
    sync(context) {
      renderer?.sync?.(context);
    },
  };
}

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
  const printRenderer = createLazyPrintRendererAdapter();
  const projections = getProjectionRegistry();
  const featureInspector = createFeatureInspector();
  const canEditHostedLayers = isLocalAdminEnabled();
  const viewState = {
    ...viewModel.getState(),
    hasCameraState: viewModel.hasCameraState(),
  };
  const screenRuntime = createDeferredScreenRuntime();
  let mapStartupError = null;

  let rerenderLayerMenu = () => {};
  let syncPrintRenderer = () => {};
  let printSyncFrame = 0;
  const requestPrintRendererSync = () => {
    if (printSyncFrame) {
      return;
    }
    printSyncFrame = window.requestAnimationFrame(() => {
      printSyncFrame = 0;
      syncPrintRenderer();
    });
  };
  const getLayerDatasets = async (layerId) => {
    const cached = supabaseLayerDataCache.get(layerId);
    if (Array.isArray(cached?.datasets) && cached.datasets.length) {
      return cached.datasets;
    }
    const { getLayerDatasets: loadDatasets } = await import("../sources/supabase/layer-loader.js");
    return loadDatasets(layerId);
  };
  const createFilterFromTableSelection = async ({ layerId, parentRowId = "", label = "", columnLabel = "", valueLabel = "", columnName, value, op = "==", conditions = null, combinator = "all", mode = "fixed", variableConfig = null }) => {
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

      syncDynamicFilterTree(layerModel, screenRuntime, parentRow);
      screenRuntime.reapplyFullOrder?.();
      rerenderLayerMenu();
      requestPrintRendererSync();
      return;
    }

    const generatedLabel = `${formatFilterColumnLabel(columnName, columnLabel)} ${formatFilterOperatorLabel(op)} ${formatFilterValueLabel(value, valueLabel)}`;
    const filterLabel = String(label ?? "").trim() || generatedLabel;
    const fixedConditions = Array.isArray(conditions) && conditions.length
      ? conditions
      : [{ field: columnName, op, value }];
    const existingFilterRow = layerModel.getChildRows(parentRow.id).find((row) => (
      row?.type === "layer"
      && row.kind === "filter"
      && JSON.stringify(row.filter?.conditions ?? [{ field: row.filter?.field, op: row.filter?.op ?? "==", value: row.filter?.value ?? "" }]) === JSON.stringify(fixedConditions)
    ));
    if (existingFilterRow) {
      return;
    }

    const nextRow = layerModel.addRowToLayer(parentRow.id, "filter", {
      name: filterLabel,
      field: columnName,
      value,
      op,
      combinator,
      conditions: fixedConditions,
      sourceLayerId: layerId,
      geometryTypes: parentRow.geometryTypes ?? [],
      geometryType: parentRow.geometryType ?? "mixed",
    });
    if (!nextRow) {
      throw new Error("Failed to create filter row.");
    }

    const inheritedStyleUpdates = inheritParentStyleForFixedFilter(layerModel, nextRow, parentRow);
    inheritedStyleUpdates.forEach((update) => {
      screenRuntime.setLayerStyleValue(update.layerId, update.key, update.value);
    });
    attachDynamicFilterRow(layerModel, screenRuntime, nextRow);
    applyPersistedRowVisibility(layerModel, screenRuntime, nextRow);
    syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
    screenRuntime.reapplyFullOrder?.();
    rerenderLayerMenu();
  };
  const updateFilterFromPanel = async ({ editFilter, label = "", columnLabel = "", valueLabel = "", columnName, value, op = "==", conditions = null, combinator = "all", mode = "fixed", variableConfig = null }) => {
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
      syncDynamicFilterTree(layerModel, screenRuntime, result.parentRow);
      screenRuntime.reapplyFullOrder?.();
      rerenderLayerMenu();
      requestPrintRendererSync();
      return;
    }

    const generatedLabel = `${formatFilterColumnLabel(columnName, columnLabel)} ${formatFilterOperatorLabel(op)} ${formatFilterValueLabel(value, valueLabel)}`;
    const filterLabel = String(label ?? "").trim() || generatedLabel;
    const fixedConditions = Array.isArray(conditions) && conditions.length
      ? conditions
      : [{ field: columnName, op, value }];
    const updatedRow = layerModel.updateFixedFilterRow(editFilter.rowId, {
      name: filterLabel,
      field: columnName,
      value,
      op,
      combinator,
      conditions: fixedConditions,
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
      syncDynamicFilterTree(layerModel, screenRuntime, parentRow);
    }
    syncDynamicFilterTree(layerModel, screenRuntime, updatedRow);
    rerenderLayerMenu();
    requestPrintRendererSync();
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
    requestPrintRendererSync();
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
  const viewLocalUploadDraft = async ({ previousDraft, name, features = [], geometryTypes = [], geometryType = "mixed" } = {}) => {
    if (!Array.isArray(features) || !features.length) {
      throw new Error("No local features to view.");
    }

    if (previousDraft?.layerRef) {
      screenRuntime.detachDynamicLayer(previousDraft.layerRef);
    }
    if (previousDraft?.rowId) {
      layerModel.removeRow(previousDraft.rowId, previousDraft.parentId ?? layerModel.getRootParentId());
    }

    const parentId = layerModel.getRootParentId();
    const layerRef = `upload-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const added = layerModel.addDataRow(parentId, {
      name: `Draft: ${name || "Uploaded data"}`,
      layerRef,
      geometryTypes,
      geometryType,
      persist: false,
    });
    if (!added) {
      throw new Error("Could not create local draft row.");
    }

    const geojson = {
      type: "FeatureCollection",
      features,
    };
    screenRuntime.loadDynamicLayer({
      layerId: layerRef,
      rowId: added.id,
      parentRowId: null,
      childRows: added.rows ?? [],
      geojson,
      tilesUrl: null,
      style: null,
      options: {
        geometryTypes,
        geometryType,
      },
    });
    rerenderLayerMenu();
    requestPrintRendererSync();
    return {
      layerRef,
      rowId: added.id,
      parentId,
    };
  };
  let addDataPanelPromise = null;
  let dataTablePanelPromise = null;
  let createLayerPanelPromise = null;
  let filterPanelPromise = null;
  let addRowPanelPromise = null;
  const handleLayerCreated = async ({ layerId, name, parentId, geometryTypes = [], geometryType, onProgress = null }) => {
    try {
      const result = await addDataRowAndAttach({
        parentId: parentId ?? layerModel.getRootParentId(),
        name,
        layerRef: layerId,
        geometryTypes,
        geometryType,
        layerModel,
        screenRuntime,
        onProgress,
      });
      if (result) {
        rerenderLayerMenu();
        requestPrintRendererSync();
      }
      return result;
    } catch (err) {
      console.error("Failed to load uploaded layer onto map.", err);
      throw err;
    }
  };
  const getAddDataPanel = () => {
    if (!addDataPanelPromise) {
      addDataPanelPromise = import("./add-data-panel.js").then(({ mountAddDataPanel }) => mountAddDataPanel({
        getAppearanceState: () => layerModel.getAppearanceState(),
        getLayerDatasets,
        onLayerCreated: handleLayerCreated,
        async onDataAdded({ layerId, datasetId, displayGeometryTypes = [] }) {
          const dataTablePanel = await getDataTablePanel();
          await dataTablePanel?.reloadLayerData?.({ layerId, datasetId });
          await reloadSupabaseLayer(layerId, layerModel, screenRuntime, { displayGeometryTypes });
          requestPrintRendererSync();
        },
      }));
    }
    return addDataPanelPromise;
  };
  const getDataTablePanel = () => {
    if (!dataTablePanelPromise) {
      dataTablePanelPromise = import("./data-table-panel.js").then(({ mountDataTablePanel }) => mountDataTablePanel({
        canEditHostedLayers,
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
          if (!canEditHostedLayers) {
            return;
          }
          void getAddDataPanel()
            .then((addDataPanel) => addDataPanel.open(args))
            .catch((error) => console.error("Failed to open add data panel.", error));
        },
        onRenameLayer: canEditHostedLayers ? renameLayer : null,
        onRenameDataset: canEditHostedLayers ? renameDataset : null,
        onUpdateDatasetMetadata: canEditHostedLayers ? updateDatasetMetadata : null,
      }));
    }
    return dataTablePanelPromise;
  };
  const getCreateLayerPanel = () => {
    if (!createLayerPanelPromise) {
      createLayerPanelPromise = import("./create-layer-panel.js").then(({ mountCreateLayerPanel }) => mountCreateLayerPanel({
        allowCreateHostedLayers: canEditHostedLayers,
        getAppearanceState: () => layerModel.getAppearanceState(),
        onLayerCreated: handleLayerCreated,
        onLayerDeleted: canEditHostedLayers ? async (layer) => {
          const layerId = String(layer?.id ?? "").trim();
          if (!SUPABASE_UUID.test(layerId)) {
            throw new Error("Only uploaded layers can be deleted here.");
          }
          const { deleteLayer } = await import("../sources/supabase/layer-loader.js");
          await deleteLayer(layerId);
          const matchingRows = layerModel.getSupabaseLayers().filter((entry) => entry.layerId === layerId);
          matchingRows.forEach(({ rowId }) => {
            const row = layerModel.getRowById(rowId);
            const parentId = layerModel.getState()?.[rowId]?.parentRowId ?? layerModel.getRootParentId();
            layerModel.removeRow(rowId, parentId);
            screenRuntime.detachDynamicLayer(layerId);
            detachDynamicFilterRowsRecursively(screenRuntime, row);
          });
          supabaseLayerDataCache.delete(layerId);
          rerenderLayerMenu();
          requestPrintRendererSync();
        } : null,
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
          requestPrintRendererSync();
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
        requestPrintRendererSync();
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
              .then(() => requestPrintRendererSync())
              .catch((error) => console.warn("Failed to load toggled layer.", error));
          }
          requestPrintRendererSync();
          return;
        }
      }

      if (row?.target?.kind === "runtime-style") {
        screenRuntime.setLayerStyleValue(row.target.runtimeTargetId, row.target.key, nextValue);
        requestPrintRendererSync();
        return;
      }

      const update = layerModel.setRowValue(row, nextValue);
      if (!update) {
        return;
      }

      if (update.target?.kind === "earth-land-detail") {
        screenRuntime.setEarthLandDetail(update.value);
        requestPrintRendererSync();
        return;
      }

      if (update.target?.kind === "source-choice") {
        const selectedOption = Array.isArray(row.options)
          ? row.options.find((option) => String(option.value) === String(update.value))
          : null;
        screenRuntime.setSourceChoice(update.target, selectedOption ?? { value: update.value });
        requestPrintRendererSync();
        return;
      }

      if (update.target?.kind === "row-variable") {
        applyVariableDrivenFilterRows(layerModel, screenRuntime, row.variableId ?? update.key);
        requestPrintRendererSync();
        return;
      }

      // Skip map update if the row has been disabled.
      if (!layerModel.isRowVisible(row.id)) {
        requestPrintRendererSync();
        return;
      }

      screenRuntime.setLayerStyleValue(update.runtimeTargetId ?? update.layerId, update.key, update.value);
      syncVisibleStyleControls(cascadeParentStyleToFixedFilterChildren(layerModel, screenRuntime, row, update));
      requestPrintRendererSync();
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
        detachDynamicFilterRowsRecursively(screenRuntime, row);
        if (parentRow) {
          syncDynamicFilterTree(layerModel, screenRuntime, parentRow);
        }
      }
      affectedVariableFilterParents.forEach((parentRow) => {
        syncDynamicFilterTree(layerModel, screenRuntime, parentRow);
      });
      rerenderLayerMenu();
      requestPrintRendererSync();
    },
    onApplyLayerDefaults: canEditHostedLayers ? (row) => {
      return applyCurrentLayerSettingsAsDefaults(row, layerModel, screenRuntime)
        .then((result) => {
          requestPrintRendererSync();
          window.setTimeout(() => rerenderLayerMenu(), 900);
          return result;
        });
    } : null,
    onResetLayerDefaults: canEditHostedLayers ? (row) => {
      return resetLayerSettingsToDefaults(row, layerModel, screenRuntime)
        .then(() => {
          requestPrintRendererSync();
          window.setTimeout(() => rerenderLayerMenu(), 900);
        });
    } : null,
    onRenameLayer: canEditHostedLayers ? renameLayer : null,
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
            valueFilterExpression: buildFilterValueScopeExpression(layerModel, row.id),
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
          conditions: row.filter?.conditions ?? null,
          combinator: row.filter?.combinator ?? "all",
          label: row.label ?? "",
        }
        : createVariableFilterEditPayload(layerModel, row, variableMatch?.filter);

      void getFilterPanel()
        .then((filterPanel) => {
          filterPanel.edit({
            layerId: sourceLayerId,
            layerName: targetRow.label ?? targetRow.name ?? "Dataset",
            parentRowId: targetRow.id,
            filter: editFilter,
            valueFilterExpression: buildFilterValueScopeExpression(layerModel, targetRow.id),
          });
        })
        .catch((error) => console.error("Failed to open filter panel.", error));
    },
    onStateChange: requestPrintRendererSync,
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
  const getPrintDynamicLayerData = () => [...supabaseLayerDataCache.entries()]
    .map(([layerId, cached]) => ({
      layerId,
      geojson: cached?.geojson ?? null,
      style: cached?.layer?.default_style ?? null,
    }))
    .filter((entry) => entry.geojson?.features?.length);
  const getPrintContext = () => ({
    title: viewModel.getTitle?.() ?? viewModel.getState().title ?? document.title ?? "Layers",
    layerModel,
    dynamicLayerData: getPrintDynamicLayerData(),
  });
  syncPrintRenderer = () => {
    printRenderer.sync(getPrintContext());
  };
  bindShareControls({
    getPrintDynamicLayerData,
    layerModel,
    printRenderer,
    screenRuntime,
    viewModel,
  });
  bindTitleControls({
    viewModel,
    onTitleChange: requestPrintRendererSync,
  });

  const startMapRuntime = async () => {
    try {
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
        onFeatureSelect: (selection) => {
          if (!selection) {
            featureInspector.close();
            return;
          }
          const enrichFeatureSelection = (feature) => {
            const row = layerModel.getRowById(feature.layerId) ?? findLayerRowByLayerRef(layerModel, feature.layerId);
            const sourceLayerId = row?.kind === "filter" && row?.filter?.parentLayerId
              ? row.filter.parentLayerId
              : feature.layerId;
            const dataset = resolveFeatureDataset(supabaseLayerDataCache, feature, sourceLayerId);
            return {
              feature: {
                ...feature,
                datasetId: dataset?.id ?? feature.properties?._dataset_id ?? "",
                datasetName: dataset?.name ?? feature.properties?._dataset_name ?? "",
                layerName: row?.label ?? row?.name ?? feature.layerId,
              },
              config: dataset?.feature_inspector ?? {},
              onSaveConfig: dataset?.id
                ? (config) => updateFeatureInspectorDefault({ datasetId: dataset.id, config })
                : null,
              onApplyConfigToLayer: sourceLayerId
                ? (config) => applyFeatureInspectorDefaultToLayer({ layerId: sourceLayerId, config })
                : null,
            };
          };
          const stackEntries = selection.kind === "feature-stack" && Array.isArray(selection.features)
            ? selection.features.map(enrichFeatureSelection)
            : [enrichFeatureSelection(selection)];
          const activeIndex = Math.min(
            Math.max(Number(selection.activeIndex) || 0, 0),
            Math.max(stackEntries.length - 1, 0),
          );
          const activeEntry = stackEntries[activeIndex];
          if (!activeEntry) {
            featureInspector.close();
            return;
          }
          featureInspector.open(activeEntry.feature, {
            config: activeEntry.config,
            onSaveConfig: activeEntry.onSaveConfig,
            onApplyConfigToLayer: activeEntry.onApplyConfigToLayer,
            stackEntries,
            activeIndex,
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
        schedulePersistedSupabaseLayerReattach(layerModel, screenRuntime);
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
    fitBounds(bounds, options = {}) {
      withRuntime((target) => target.fitBounds?.(bounds, options));
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
const DEFAULT_VIEW_INITIAL_LOAD_ACTIVE_DEFAULTS = "active-defaults";

async function loadLayerFields(layerRef, context = {}) {
  const sourceLayerId = resolveFilterPanelSourceLayerId(layerRef, context);
  if (!SUPABASE_UUID.test(sourceLayerId)) return null;
  try {
    const { getLayerFields } = await import("../sources/supabase/layer-loader.js");
    return await getLayerFields(sourceLayerId);
  } catch {
    return null;
  }
}

async function loadLayerFieldValues(layerRef, fieldKey, context = {}) {
  const sourceLayerId = resolveFilterPanelSourceLayerId(layerRef, context);
  if (!SUPABASE_UUID.test(sourceLayerId)) return [];
  try {
    const { getLayerFieldValues } = await import("../sources/supabase/layer-loader.js");
    return await getLayerFieldValues(sourceLayerId, fieldKey, {
      filterExpression: context?.valueFilterExpression ?? null,
    });
  } catch {
    return [];
  }
}

async function loadLayerFromSupabaseLazy(layerId, options = {}) {
  const { loadLayerFromSupabase } = await import("../sources/supabase/layer-loader.js");
  return loadLayerFromSupabase(layerId, options);
}

async function loadLayerDefaultViewLazy(layerId) {
  const { getLayerDefaultView } = await import("../sources/supabase/layer-loader.js");
  return getLayerDefaultView(layerId);
}

async function loadCachedLayerResultLazy(layerId, propertyFilter = null) {
  const { getCachedLayerResult } = await import("../sources/supabase/layer-loader.js");
  return getCachedLayerResult(layerId, propertyFilter);
}

async function clearCachedLayerResultsLazy(layerId) {
  const { clearCachedLayerResults } = await import("../sources/supabase/layer-loader.js");
  return clearCachedLayerResults(layerId);
}

function normalizeLayerDefaultView(defaultView = {}) {
  if (!defaultView || typeof defaultView !== "object" || Array.isArray(defaultView)) {
    return {};
  }
  return {
    ...defaultView,
    rows: Array.isArray(defaultView.rows) ? defaultView.rows : [],
    initialLoad: defaultView.initialLoad && typeof defaultView.initialLoad === "object"
      ? defaultView.initialLoad
      : {},
  };
}

function scopedDefaultRowId(rootRowId, rowId) {
  const rawId = String(rowId ?? "").trim();
  if (!rawId) {
    return "";
  }
  const rootPrefix = `${rootRowId}-default-`;
  return rawId.startsWith(rootPrefix) ? rawId : `${rootPrefix}${rawId}`;
}

function getDefaultRowInitialValues(rows = [], values = {}) {
  rows.forEach((row) => {
    if (!row || typeof row !== "object") {
      return;
    }
    const variableId = String(row.variableId ?? row.key ?? "").trim();
    if (variableId && row.initialValue !== undefined) {
      values[variableId] = row.initialValue;
    }
    getDefaultRowInitialValues(Array.isArray(row.rows) ? row.rows : [], values);
  });
  return values;
}

function resolveDefaultConditionValue(condition, variableValues = {}) {
  const valueRef = String(condition?.valueRef ?? "").trim();
  if (valueRef && Object.hasOwn(variableValues, valueRef)) {
    return variableValues[valueRef];
  }
  return condition?.value;
}

function buildDefaultConditionExpression(condition, variableValues = {}) {
  if (!condition?.field) {
    return null;
  }
  const op = condition.op ?? "==";
  const value = resolveDefaultConditionValue(condition, variableValues);
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

function combineDefaultExpressions(expressions = [], combinator = "all") {
  const filters = expressions.filter(Boolean);
  if (!filters.length) {
    return null;
  }
  return filters.length === 1 ? filters[0] : [combinator === "any" ? "any" : "all", ...filters];
}

function buildDefaultFilterConfigExpression(row, variableValues = {}) {
  const filter = row?.filter && typeof row.filter === "object" ? row.filter : {};
  const filterConditions = Array.isArray(filter.conditions) && filter.conditions.length
    ? filter.conditions
    : filter.field
      ? [{ field: filter.field, op: filter.op ?? "==", value: filter.value }]
      : [];
  const rowExpression = combineDefaultExpressions(
    filterConditions.map((condition) => buildDefaultConditionExpression(condition, variableValues)),
    filter.combinator ?? "all",
  );
  const variableFilterExpressions = (Array.isArray(row?.variableFilters) ? row.variableFilters : [])
    .map((variableFilter) => combineDefaultExpressions(
      (Array.isArray(variableFilter?.conditions) ? variableFilter.conditions : [])
        .map((condition) => buildDefaultConditionExpression(condition, variableValues)),
      variableFilter?.combinator ?? "all",
    ))
    .filter(Boolean);

  return combineDefaultExpressions([rowExpression, ...variableFilterExpressions], "all");
}

function buildDefaultViewInitialLoadFilter(defaultView = {}) {
  const normalized = normalizeLayerDefaultView(defaultView);
  if (normalized.initialLoad?.mode !== DEFAULT_VIEW_INITIAL_LOAD_ACTIVE_DEFAULTS) {
    return null;
  }
  const variableValues = getDefaultRowInitialValues(normalized.rows);
  const rowExpressions = normalized.rows
    .filter((row) => row?.type === "filter" && row.visible !== false)
    .map((row) => buildDefaultFilterConfigExpression(row, variableValues))
    .filter(Boolean);
  const expression = combineDefaultExpressions(rowExpressions, "any");
  return expression ? { expression } : null;
}

function materializeLayerDefaultViewRows(layerModel, parentRow, defaultView = {}, { sourceLayerId = "", geometryTypes = [], geometryType = "mixed" } = {}) {
  const normalized = normalizeLayerDefaultView(defaultView);
  if (!parentRow?.id || !normalized.rows.length) {
    return false;
  }
  let changed = false;

  const materializeRow = (parentId, rowConfig, index = 0) => {
    if (!rowConfig || typeof rowConfig !== "object") {
      return null;
    }
    const rawId = String(rowConfig.id ?? `${rowConfig.type || "row"}-${index}`).trim();
    const id = scopedDefaultRowId(parentRow.id, rawId);
    let row = layerModel.getRowById(id);
    if (!row) {
      if (rowConfig.type === "filter") {
        row = layerModel.addRowToLayer(parentId, "filter", {
          id,
          name: rowConfig.label ?? rowConfig.name ?? "Filter",
          field: rowConfig.filter?.field ?? "",
          op: rowConfig.filter?.op ?? "==",
          value: rowConfig.filter?.value ?? "",
          conditions: rowConfig.filter?.conditions ?? null,
          combinator: rowConfig.filter?.combinator ?? "all",
          sourceLayerId,
          geometryTypes,
          geometryType,
        });
      } else if (rowConfig.type === "variable-slider") {
        row = layerModel.addRowToLayer(parentId, "slider", {
          id,
          label: rowConfig.label ?? "Slider",
          variableId: rowConfig.variableId,
          min: rowConfig.min,
          max: rowConfig.max,
          step: rowConfig.step,
          valueFormat: rowConfig.valueFormat ?? null,
          initialValue: rowConfig.initialValue,
        });
      } else if (rowConfig.type === "variable-select") {
        row = layerModel.addRowToLayer(parentId, "variable-select", {
          id,
          label: rowConfig.label ?? "Dropdown",
          variableId: rowConfig.variableId,
          options: rowConfig.options ?? [],
          initialValue: rowConfig.initialValue,
        });
      } else if (["fill", "line", "point", "sort"].includes(rowConfig.type)) {
        row = layerModel.addRowToLayer(parentId, rowConfig.type, {
          id,
          name: rowConfig.label ?? rowConfig.name,
          field: rowConfig.field,
          direction: rowConfig.direction,
        });
      }
      changed = Boolean(row) || changed;
    }

    const rowId = row?.id ?? id;
    (Array.isArray(rowConfig.rows) ? rowConfig.rows : []).forEach((childConfig, childIndex) => {
      materializeRow(rowId, childConfig, childIndex);
    });

    if (rowConfig.type === "filter" && Array.isArray(rowConfig.variableFilters)) {
      rowConfig.variableFilters.forEach((variableFilter, filterIndex) => {
        const result = layerModel.addVariableFilterToLayer(rowId, {
          id: scopedDefaultRowId(parentRow.id, variableFilter.id ?? `${rawId}-variable-filter-${filterIndex}`),
          label: variableFilter.label ?? "Variable filter",
          controlRowId: scopedDefaultRowId(parentRow.id, variableFilter.controlRowId),
          combinator: variableFilter.combinator ?? "all",
          conditions: variableFilter.conditions ?? [],
        });
        changed = Boolean(result) || changed;
      });
    }
    return row;
  };

  normalized.rows.forEach((rowConfig, index) => materializeRow(parentRow.id, rowConfig, index));
  return changed;
}

function stripDefaultRowScope(rootRowId, rowId) {
  const value = String(rowId ?? "").trim();
  const prefix = `${rootRowId}-default-`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function serializeFilterConfig(row) {
  const filter = row?.filter ?? {};
  const conditions = Array.isArray(filter.conditions) && filter.conditions.length
    ? filter.conditions.map((condition) => ({
      field: condition.field,
      op: condition.op ?? "==",
      ...(condition.valueRef ? { valueRef: condition.valueRef } : { value: condition.value ?? "" }),
    }))
    : filter.field
      ? [{ field: filter.field, op: filter.op ?? "==", value: filter.value ?? "" }]
      : [];
  return {
    ...(conditions.length ? { conditions } : {}),
    combinator: filter.combinator === "any" ? "any" : "all",
  };
}

function serializeRowDefaultView(layerModel, rootRowId, row) {
  if (!row?.id) {
    return null;
  }
  const base = {
    id: stripDefaultRowScope(rootRowId, row.id),
    label: row.label ?? "",
  };
  const childRows = layerModel.getChildRows(row.id)
    .map((childRow) => serializeRowDefaultView(layerModel, rootRowId, childRow))
    .filter(Boolean);

  if (row.type === "layer" && row.kind === "filter") {
    const variableFilters = (Array.isArray(row.variableFilters) ? row.variableFilters : []).map((filter) => ({
      id: stripDefaultRowScope(rootRowId, filter.id ?? ""),
      label: filter.label ?? "Variable filter",
      controlRowId: stripDefaultRowScope(rootRowId, filter.controlRowId ?? ""),
      combinator: filter.combinator === "any" ? "any" : "all",
      conditions: (Array.isArray(filter.conditions) ? filter.conditions : []).map((condition) => ({
        field: condition.field,
        op: condition.op ?? "==",
        ...(condition.valueRef ? { valueRef: condition.valueRef } : { value: condition.value ?? "" }),
      })),
    }));
    return {
      ...base,
      type: "filter",
      visible: layerModel.isRowVisible(row.id),
      filter: serializeFilterConfig(row),
      ...(childRows.length ? { rows: childRows } : {}),
      ...(variableFilters.length ? { variableFilters } : {}),
    };
  }

  if (row.type === "variable-slider") {
    return {
      ...base,
      type: "variable-slider",
      variableId: row.variableId,
      min: row.min,
      max: row.max,
      step: row.step,
      ...(row.valueFormat ? { valueFormat: row.valueFormat } : {}),
      initialValue: layerModel.getRowValue(row) ?? row.initialState?.[row.variableId],
    };
  }

  if (row.type === "variable-select") {
    return {
      ...base,
      type: "variable-select",
      variableId: row.variableId,
      options: Array.isArray(row.options) ? row.options : [],
      initialValue: layerModel.getRowValue(row) ?? row.initialState?.[row.variableId],
    };
  }

  if (row.type === "fill" || row.type === "line" || row.type === "point") {
    return null;
  }

  if (row.type === "sort") {
    return {
      ...base,
      type: "sort",
      field: row.field ?? "",
      direction: row.direction ?? "asc",
    };
  }

  return null;
}

function serializeLayerDefaultView(layerModel, row) {
  const childRows = layerModel.getChildRows(row.id)
    .map((childRow) => serializeRowDefaultView(layerModel, row.id, childRow))
    .filter(Boolean);
  return {
    version: 1,
    initialLoad: { mode: DEFAULT_VIEW_INITIAL_LOAD_ACTIVE_DEFAULTS },
    rows: childRows,
  };
}

function collectLayerDefaultStylePatch(layerModel, row) {
  const patch = {};
  const visit = (rows = []) => {
    rows.forEach((childRow) => {
      if (childRow?.type === "fill" || childRow?.type === "line" || childRow?.type === "point") {
        const value = layerModel.getRowValue(childRow);
        if (childRow.type === "fill") {
          if (value?.color != null) {
            patch.color = value.color;
            patch.fillColor = value.color;
          }
          if (value?.opacity != null) {
            patch.opacity = value.opacity;
            patch.fillOpacity = value.opacity;
          }
        }
        if (childRow.type === "line") {
          if (value?.color != null) patch.lineColor = value.color;
          if (value?.opacity != null) patch.lineOpacity = value.opacity;
          if (value?.weight != null) {
            patch.weight = value.weight;
            patch.lineWeight = value.weight;
          }
        }
        if (childRow.type === "point") {
          if (value?.color != null) {
            patch.color = value.color;
            patch.pointColor = value.color;
          }
          if (value?.opacity != null) {
            patch.opacity = value.opacity;
            patch.pointOpacity = value.opacity;
          }
          if (value?.radius != null) {
            patch.radius = value.radius;
            patch.pointRadius = value.radius;
          }
        }
      }
      visit(layerModel.getChildRows(childRow.id));
    });
  };
  visit(layerModel.getChildRows(row.id));
  return patch;
}

function formatDefaultStyleSummary(style = {}) {
  if (!style || typeof style !== "object") {
    return "no style";
  }
  const keys = ["fillOpacity", "lineOpacity", "lineWeight", "fillColor", "lineColor"];
  return keys
    .filter((key) => style[key] !== undefined && style[key] !== null)
    .map((key) => `${key}=${style[key]}`)
    .join(", ") || "no tracked style values";
}

function buildInitialLoadFilterExpressionForLayer(layerModel, row, defaultView = {}) {
  const normalized = normalizeLayerDefaultView(defaultView);
  if (normalized.initialLoad?.mode !== DEFAULT_VIEW_INITIAL_LOAD_ACTIVE_DEFAULTS) {
    return null;
  }
  if (row?.id) {
    const childExpressions = layerModel.getChildRows(row.id)
      .filter((childRow) => childRow?.type === "layer" && childRow.kind === "filter" && layerModel.isRowVisible(childRow.id))
      .map((childRow) => buildDynamicFilterLayerExpression(layerModel, childRow))
      .filter(Boolean);
    if (childExpressions.length) {
      const expression = childExpressions.length === 1 ? childExpressions[0] : ["any", ...childExpressions];
      return { expression };
    }
  }
  return buildDefaultViewInitialLoadFilter(normalized);
}

function attachSupabaseLayerResultToRuntime({ layerModel, screenRuntime, rowId, layerId, layerResult, displayGeometryTypes = [] }) {
  if (!layerResult?.geojson && !layerResult?.tilesUrl) {
    return false;
  }
  layerModel.applyHostedLayerDefaultStyle?.(layerId, layerResult.layer?.default_style);
  const row = rowId ? layerModel.getRowById(rowId) : null;
  const rowState = rowId ? layerModel.getState()?.[rowId] ?? {} : {};
  const runtimeGeometryTypes = Array.isArray(displayGeometryTypes) && displayGeometryTypes.length
    ? displayGeometryTypes
    : Array.isArray(row?.geometryTypes) && row.geometryTypes.length
      ? row.geometryTypes
      : Array.isArray(layerResult.layer?.geometry_types)
        ? layerResult.layer.geometry_types
        : Array.isArray(layerResult.layer?.geometryTypes)
          ? layerResult.layer.geometryTypes
          : [];
  screenRuntime.loadDynamicLayer({
    layerId,
    rowId,
    parentRowId: rowState.parentRowId ?? null,
    childRows: row?.rows ?? [],
    geojson: layerResult.geojson,
    tilesUrl: layerResult.tilesUrl,
    style: layerResult.layer?.default_style,
    options: {
      geometryTypes: runtimeGeometryTypes,
      geometryType: runtimeGeometryTypes.length === 1 ? runtimeGeometryTypes[0] : row?.geometryType ?? layerResult.layer?.geometry_type ?? null,
      sourceLayerId: layerResult.sourceLayerId,
    },
  });
  if (row) {
    applyPersistedRowVisibility(layerModel, screenRuntime, row);
    attachDynamicFilterRowsRecursively(layerModel, screenRuntime, row);
    syncDynamicFilterOwnershipRecursively(layerModel, screenRuntime, row);
  }
  screenRuntime.reapplyFullOrder?.();
  return true;
}

function scheduleIdleTask(callback, { timeout = 3000 } = {}) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout });
    return;
  }
  window.setTimeout(callback, Math.min(timeout, 1000));
}

function schedulePersistedSupabaseLayerReattach(layerModel, screenRuntime) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        void reattachPersistedSupabaseLayers(layerModel, screenRuntime);
      }, 0);
    });
  });
}

function isSupabaseLayerRowVisible(layerModel, rowId) {
  const row = layerModel.getRowById(rowId);
  return row ? getStoredRowVisibility(layerModel, row) : false;
}

async function reattachPersistedSupabaseLayer(layerModel, screenRuntime, { rowId, layerId }) {
  const row = layerModel.getRowById(rowId);
  const defaultView = await loadLayerDefaultViewLazy(layerId);
  materializeLayerDefaultViewRows(layerModel, row, defaultView, {
    sourceLayerId: layerId,
    geometryTypes: row?.geometryTypes ?? [],
    geometryType: row?.geometryType ?? "mixed",
  });
  const initialFilter = buildInitialLoadFilterExpressionForLayer(layerModel, row, defaultView);
  const cachedLayer = await loadCachedLayerResultLazy(layerId, initialFilter);
  if (cachedLayer) {
    supabaseLayerDataCache.set(layerId, cachedLayer);
    attachSupabaseLayerResultToRuntime({ layerModel, screenRuntime, rowId, layerId, layerResult: cachedLayer });
    requestPrintRendererSync();
  }
  const loadedLayer = await loadLayerFromSupabaseLazy(layerId, {
    propertyFilter: initialFilter,
  });
  supabaseLayerDataCache.set(layerId, loadedLayer);
  const freshRow = layerModel.getRowById(rowId) ?? row;
  if (loadedLayer.geojson || loadedLayer.tilesUrl) {
    attachSupabaseLayerResultToRuntime({ layerModel, screenRuntime, rowId, layerId, layerResult: loadedLayer });
  }
  if (freshRow) {
    applyPersistedRowVisibility(layerModel, screenRuntime, freshRow);
    attachDynamicFilterRowsRecursively(layerModel, screenRuntime, freshRow);
    syncDynamicFilterOwnershipRecursively(layerModel, screenRuntime, freshRow);
  }
}

async function reattachPersistedSupabaseLayerQueue(layerModel, screenRuntime, supabaseLayers) {
  let suppressedAny = false;
  for (const layerEntry of supabaseLayers) {
    try {
      await reattachPersistedSupabaseLayer(layerModel, screenRuntime, layerEntry);
    } catch (err) {
      if (err?.code === "LAYER_NOT_FOUND") {
        suppressedAny = layerModel.suppressRow(layerEntry.rowId) || suppressedAny;
        continue;
      }
      console.warn(`Failed to reattach layer ${layerEntry.layerId}:`, err.message);
    }
  }
  if (suppressedAny) {
    window.LayerV2?.rerenderLayerMenu?.();
  }
  screenRuntime.reapplyFullOrder?.();
}

async function reattachPersistedSupabaseLayers(layerModel, screenRuntime) {
  const supabaseLayers = layerModel.getSupabaseLayers();
  if (!supabaseLayers.length) return;

  const visibleLayers = supabaseLayers.filter(({ rowId }) => isSupabaseLayerRowVisible(layerModel, rowId));
  const hiddenLayers = supabaseLayers.filter(({ rowId }) => !isSupabaseLayerRowVisible(layerModel, rowId));

  await reattachPersistedSupabaseLayerQueue(layerModel, screenRuntime, visibleLayers);
  if (!hiddenLayers.length) {
    return;
  }

  scheduleIdleTask(() => {
    void reattachPersistedSupabaseLayerQueue(layerModel, screenRuntime, hiddenLayers);
  }, { timeout: 5000 });
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

function formatStyleControlValue(key, value) {
  if (key === "fillOpacity" || key === "lineOpacity" || key === "pointOpacity") {
    return `${Math.round(Number(value) || 0)}%`;
  }
  if (key === "lineWeight" || key === "pointRadius") {
    return `${Number(value) || 0}px`;
  }
  return String(value ?? "");
}

function syncVisibleStyleControls(updates = []) {
  updates.forEach((update) => {
    const layerId = CSS.escape(String(update.layerId ?? ""));
    const key = CSS.escape(String(update.key ?? ""));
    if (!layerId || !key) {
      return;
    }

    document.querySelectorAll(`[data-style-layer-id="${layerId}"][data-style-key="${key}"]`).forEach((element) => {
      const valueLabel = element.querySelector(".layer-menu-row-value");
      if (valueLabel) {
        valueLabel.textContent = formatStyleControlValue(update.key, update.value);
      }
      const slider = element.querySelector("input.layer-menu-slider");
      if (slider) {
        slider.value = String(update.value);
      }
    });
  });
  if (updates.length) {
    window.dispatchEvent(new CustomEvent("layers:style-control-sync", { detail: { updates } }));
  }
}

function isFixedFilterRow(row) {
  return row?.type === "layer" && row.kind === "filter" && row.filter;
}

function getFixedFilterChildRows(layerModel, parentRow) {
  if (!parentRow?.id) {
    return [];
  }

  return layerModel.getChildRows(parentRow.id).filter(isFixedFilterRow);
}

function findStyleTargetForKey(styleRow, key) {
  return [
    styleRow?.colorTarget,
    styleRow?.opacityTarget,
    styleRow?.weightTarget,
    styleRow?.radiusTarget,
  ].find((target) => target?.kind === "layer-style" && target.key === key) ?? null;
}

function getStyleTargetCurrentValue(layerModel, styleRow, target) {
  if (!target?.layerId || !target.key) {
    return null;
  }

  const storedValue = layerModel.getState()?.[target.layerId]?.[target.key];
  return storedValue !== undefined && storedValue !== null
    ? storedValue
    : styleRow?.initialState?.[target.key] ?? null;
}

function inheritParentStyleForFixedFilter(layerModel, filterRow, parentRow) {
  if (!filterRow?.id || !parentRow?.id) {
    return [];
  }

  const updates = [];
  const childRows = layerModel.getChildRows(filterRow.id);
  layerModel.getChildRows(parentRow.id).forEach((parentChildRow) => {
    [
      parentChildRow?.colorTarget,
      parentChildRow?.opacityTarget,
      parentChildRow?.weightTarget,
      parentChildRow?.radiusTarget,
    ].forEach((parentTarget) => {
      if (parentTarget?.kind !== "layer-style") {
        return;
      }
      const value = getStyleTargetCurrentValue(layerModel, parentChildRow, parentTarget);
      if (value === null || value === undefined) {
        return;
      }
      childRows.forEach((childRow) => {
        const childTarget = findStyleTargetForKey(childRow, parentTarget.key);
        if (!childTarget) {
          return;
        }
        const update = layerModel.setRowValue({
          id: childRow.id,
          runtimeTargetId: childRow.runtimeTargetId,
          target: childTarget,
        }, value);
        if (update) {
          updates.push(update);
        }
      });
    });
  });
  return updates;
}

function applyStyleValueToFixedFilterChild(layerModel, screenRuntime, filterRow, key, value) {
  const updates = [];
  layerModel.getChildRows(filterRow.id).forEach((childRow) => {
    const target = findStyleTargetForKey(childRow, key);
    if (!target) {
      return;
    }
    if (layerModel.isStyleCascadeLocked?.(target.layerId, target.key)) {
      return;
    }
    const childUpdate = layerModel.setRowValue({
      id: childRow.id,
      runtimeTargetId: childRow.runtimeTargetId,
      target,
    }, value);
    if (childUpdate) {
      screenRuntime.setLayerStyleValue(childUpdate.runtimeTargetId ?? childUpdate.layerId, childUpdate.key, childUpdate.value);
      updates.push(childUpdate);
    }
  });
  return updates;
}

function cascadeParentStyleToFixedFilterChildren(layerModel, screenRuntime, row, update) {
  if (!update || update.target?.kind !== "layer-style" || !row?.id) {
    return [];
  }

  const styleRowParentId = layerModel.getState()?.[row.id]?.parentRowId;
  const parentRow = styleRowParentId
    ? layerModel.getRowById(styleRowParentId)
    : (findRowByRuntimeTargetId(layerModel, update.layerId) ?? layerModel.getRowById(update.layerId));
  if (!parentRow || getRowRuntimeTargetId(parentRow) !== update.layerId) {
    return [];
  }

  return getFixedFilterChildRows(layerModel, parentRow)
    .flatMap((filterRow) => applyStyleValueToFixedFilterChild(layerModel, screenRuntime, filterRow, update.key, update.value));
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
    label: controlRow?.label ?? variableFilter?.label ?? "",
    columnName: matchCondition?.field ?? "",
    conditions,
    combinator: variableFilter?.combinator ?? "all",
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

function resolveFilterPanelSourceLayerId(layerRef, context = {}) {
  const contextSourceLayerId = String(context?.sourceLayerId ?? "").trim();
  if (SUPABASE_UUID.test(contextSourceLayerId)) {
    return contextSourceLayerId;
  }
  return String(layerRef ?? "").trim();
}

function buildFilterValueScopeExpression(layerModel, parentRowId) {
  const parentRow = parentRowId ? layerModel.getRowById(parentRowId) : null;
  if (!parentRow) {
    return null;
  }
  if (parentRow.kind === "filter" && parentRow.filter) {
    return buildDynamicFilterLayerExpression(layerModel, parentRow);
  }
  return buildLayerVariableFilterExpression(layerModel, parentRow);
}

function formatFilterOperatorLabel(op) {
  if (op === "==") return "=";
  if (op === "all") return "any";
  return op || "=";
}

function formatFilterColumnLabel(columnName, columnLabel = "") {
  if (columnName === DATASET_FILTER_FIELD) {
    return DATASET_FILTER_LABEL;
  }
  return String(columnLabel || columnName || "Column");
}

function formatFilterValueLabel(value, valueLabel = "") {
  if (value === "") {
    return "Empty value";
  }
  return String(valueLabel || (value ?? ""));
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

function resolveFilterValue(layerModel, value, valueRef, scopeRow = null) {
  if (!valueRef) {
    return value;
  }

  const variableRow = findVariableRow(layerModel, valueRef, scopeRow);
  if (!variableRow) {
    return value;
  }

  return layerModel.getRowValue(variableRow) ?? value;
}

function buildFilterConditionExpression(layerModel, condition, scopeRow = null) {
  if (!condition?.field) {
    return null;
  }

  const op = condition.op ?? "==";
  const value = resolveFilterValue(layerModel, condition.value, condition.valueRef, scopeRow);
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

function buildRowFilterExpression(layerModel, row, scopeRow = row) {
  const conditions = Array.isArray(row?.filter?.conditions) ? row.filter.conditions : null;
  if (conditions?.length) {
    const expressions = conditions
      .map((condition) => buildFilterConditionExpression(layerModel, condition, scopeRow))
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
  }, scopeRow);
}

function findVariableRow(layerModel, variableId, scopeRow = null) {
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

  if (scopeRow?.id) {
    const scopedMatch = visit([scopeRow]);
    if (scopedMatch) {
      return scopedMatch;
    }
  }

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
        syncDynamicFilterTree(layerModel, screenRuntime, row);
      }
      visit(layerModel.getChildRows(row.id));
    });
  };

  visit(layerModel.getRootRows());
}

function buildLayerVariableFilterExpression(layerModel, row) {
  const filters = Array.isArray(row?.variableFilters) ? row.variableFilters : [];
  const expressions = filters
    .map((filter) => buildFilterGroupExpression(layerModel, filter, row))
    .filter(Boolean);
  if (!expressions.length) {
    return null;
  }
  return expressions.length === 1 ? expressions[0] : ["all", ...expressions];
}

function getDynamicFilterParentRow(layerModel, row) {
  const parentRow = row?.filter?.parentLayerId
    ? (findRowByRuntimeTargetId(layerModel, row.filter.parentLayerId) ?? findLayerRowByLayerRef(layerModel, row.filter.parentLayerId))
    : null;
  return parentRow;
}

function buildDynamicFilterLayerExpression(layerModel, row, visitedRowIds = new Set()) {
  if (!row?.id || visitedRowIds.has(row.id)) {
    return null;
  }

  visitedRowIds.add(row.id);
  const parentRow = getDynamicFilterParentRow(layerModel, row);
  const parentExpression = parentRow?.kind === "filter" && parentRow.filter
    ? buildDynamicFilterLayerExpression(layerModel, parentRow, visitedRowIds)
    : parentRow
      ? buildLayerVariableFilterExpression(layerModel, parentRow)
      : null;

  return combineFilterExpressions([
    parentExpression,
    buildLayerVariableFilterExpression(layerModel, row),
    buildRowFilterExpression(layerModel, row, row),
  ]);
}

function buildFilterGroupExpression(layerModel, filter, scopeRow = null) {
  const conditions = Array.isArray(filter?.conditions) ? filter.conditions : [];
  const expressions = conditions
    .map((condition) => buildFilterConditionExpression(layerModel, condition, scopeRow))
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
  const childFilterExpressions = getFixedFilterChildRows(layerModel, parentRow)
    .map((row) => buildDynamicFilterLayerExpression(layerModel, row))
    .filter(Boolean);

  if (!childFilterExpressions.length) {
    return null;
  }

  return childFilterExpressions.length === 1
    ? ["!", childFilterExpressions[0]]
    : ["!", ["any", ...childFilterExpressions]];
}

function getParentRuntimeFilterExpression(layerModel, parentRow) {
  const parentExpression = parentRow?.kind === "filter" && parentRow.filter
    ? buildDynamicFilterLayerExpression(layerModel, parentRow)
    : buildLayerVariableFilterExpression(layerModel, parentRow);

  return combineFilterExpressions([
    parentExpression,
    buildParentExclusionFilter(layerModel, parentRow),
  ]);
}

function syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id || (parentRow.kind !== "filter" && (!parentRow.layerRef || !SUPABASE_UUID.test(parentRow.layerRef)))) {
    return;
  }

  screenRuntime.setDynamicLayerFeatureFilter?.(
    getRowRuntimeTargetId(parentRow),
    getParentRuntimeFilterExpression(layerModel, parentRow),
  );
}

function syncChildDynamicFilterRows(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id) {
    return;
  }

  layerModel.getChildRows(parentRow.id).forEach((childRow) => {
    if (isFixedFilterRow(childRow)) {
      screenRuntime.setDynamicLayerFeatureFilter?.(
        getRowRuntimeTargetId(childRow),
        buildDynamicFilterLayerExpression(layerModel, childRow),
      );
      syncChildDynamicFilterRows(layerModel, screenRuntime, childRow);
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
      sourceLayerId: row.filter.sourceLayerId ?? row.filter.parentLayerId,
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

function detachDynamicFilterRowsRecursively(screenRuntime, row) {
  if (!row) {
    return;
  }

  if (isFixedFilterRow(row)) {
    screenRuntime.detachDynamicLayer(getRowRuntimeTargetId(row));
  }
  if (Array.isArray(row.rows)) {
    row.rows.forEach((childRow) => detachDynamicFilterRowsRecursively(screenRuntime, childRow));
  }
}

function syncDynamicFilterOwnershipRecursively(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id) {
    return;
  }

  syncParentDynamicFilterOwnership(layerModel, screenRuntime, parentRow);
  layerModel.getChildRows(parentRow.id).forEach((childRow) => {
    if (isFixedFilterRow(childRow)) {
      syncDynamicFilterOwnershipRecursively(layerModel, screenRuntime, childRow);
    }
  });
}

function syncDynamicFilterTree(layerModel, screenRuntime, parentRow) {
  if (!parentRow?.id) {
    return;
  }

  syncDynamicFilterOwnershipRecursively(layerModel, screenRuntime, parentRow);
  syncChildDynamicFilterRows(layerModel, screenRuntime, parentRow);
}

function getUnavailableLayerDataMessage(layerResult, { name = "" } = {}) {
  const layerName = layerResult?.layer?.name || name || "This layer";
  const warning = layerResult?.loadWarning;
  if (warning?.code === "too_many_features_for_geojson") {
    const count = Number(warning.details?.featureCount);
    const max = Number(warning.details?.maxGeojsonFeatures);
    const countText = Number.isFinite(count) ? count.toLocaleString() : "too many";
    const maxText = Number.isFinite(max) ? max.toLocaleString() : "the current limit";
    return `${layerName} was added to the catalog, but it cannot be drawn yet: it has ${countText} features and the current merged GeoJSON loader is capped at ${maxText}. Add a year-specific dataset or serve this layer as PMTiles.`;
  }
  if (warning?.message) {
    return `${layerName} was added to the catalog, but it cannot be drawn yet: ${warning.message}`;
  }
  return `${layerName} was added to the catalog, but no map data source was returned. No GeoJSON or tile artifact was available to draw.`;
}

async function addDataRowAndAttach({ parentId, name, layerRef, geometryTypes = [], geometryType, layerModel, screenRuntime, onProgress = null }) {
  const resolvedParentId = parentId ?? layerModel.getRootParentId();
  const reportProgress = (pct, label) => onProgress?.(pct, label);
  const existingSupabaseLayer = SUPABASE_UUID.test(layerRef)
    ? layerModel.getSupabaseLayers().find((entry) => entry.layerId === layerRef)
    : null;

  if (existingSupabaseLayer) {
    reportProgress(20, "Layer is already in the map");
    const existingRow = layerModel.getRowById(existingSupabaseLayer.rowId);
    if (!existingRow) {
      return null;
    }
    const defaultView = await loadLayerDefaultViewLazy(layerRef);
    const defaultsChanged = materializeLayerDefaultViewRows(layerModel, existingRow, defaultView, {
      sourceLayerId: layerRef,
      geometryTypes: existingRow.geometryTypes ?? [],
      geometryType: existingRow.geometryType ?? "mixed",
    });

    reportProgress(55, "Restoring layer visibility");
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
    if (defaultsChanged) {
      reportProgress(75, "Applying default filter controls");
      syncDynamicFilterTree(layerModel, screenRuntime, layerModel.getRowById(existingRow.id) ?? existingRow);
    }

    reportProgress(100, "Layer already added");
    return { row: existingRow, duplicate: true };
  }

  if (!SUPABASE_UUID.test(layerRef)) {
    reportProgress(35, "Creating local layer row");
    const added = layerModel.addDataRow(resolvedParentId, { name, layerRef, geometryTypes, geometryType });
    if (!added) {
      return null;
    }
    reportProgress(100, "Layer added");
    return { row: added, duplicate: false };
  }

  let layerResult;
  let defaultView = {};
  try {
    reportProgress(10, "Loading layer metadata");
    defaultView = await loadLayerDefaultViewLazy(layerRef);
    layerResult = await loadLayerFromSupabaseLazy(layerRef, {
      propertyFilter: buildDefaultViewInitialLoadFilter(defaultView),
      onProgress: (pct, label) => reportProgress(pct, label),
    });
  } catch (err) {
    if (err?.code === "LAYER_NOT_FOUND") {
      return null;
    }
    throw err;
  }
  const { layer, geojson, tilesUrl, sourceLayerId, bounds } = layerResult;
  supabaseLayerDataCache.set(layerRef, layerResult);
  if (!geojson && !tilesUrl) {
    throw new Error(getUnavailableLayerDataMessage(layerResult, { name }));
  }
  const featureCount = Array.isArray(geojson?.features) ? geojson.features.length : null;
  const sourceLabel = tilesUrl
    ? "PMTiles"
    : featureCount === null
      ? "GeoJSON"
      : `${featureCount.toLocaleString()} features`;
  reportProgress(70, `Creating layer row (${sourceLabel})`);
  const added = layerModel.addDataRow(resolvedParentId, {
    name,
    layerRef,
    geometryTypes: geometryTypes.length ? geometryTypes : (Array.isArray(layer.geometry_types) ? layer.geometry_types : []),
    geometryType: geometryType ?? layer.geometry_type ?? "mixed",
    defaultStyle: layer.default_style,
  });
  if (!added) {
    return null;
  }
  materializeLayerDefaultViewRows(layerModel, added, layer.default_view ?? defaultView, {
    sourceLayerId: layerRef,
    geometryTypes: added.geometryTypes ?? geometryTypes,
    geometryType: added.geometryType ?? geometryType ?? layer.geometry_type ?? "mixed",
  });
  const runtimeRow = layerModel.getRowById(added.id) ?? added;
  if (geojson || tilesUrl) {
    reportProgress(82, "Attaching map source");
    screenRuntime.loadDynamicLayer({
      layerId: layerRef,
      rowId: added.id,
      parentRowId: resolvedParentId === layerModel.getRootParentId() ? null : resolvedParentId,
      childRows: runtimeRow.rows ?? [],
      geojson,
      tilesUrl,
      style: layer.default_style,
      options: {
        geometryTypes: added.geometryTypes ?? geometryTypes,
        geometryType: added.geometryType ?? geometryType ?? layer.geometry_type ?? null,
        sourceLayerId,
      },
    });
    if (runtimeRow.rows?.length) {
      reportProgress(92, "Applying default filter controls");
      syncDynamicFilterTree(layerModel, screenRuntime, runtimeRow);
    }
    reportProgress(96, "Layer added");
  }

  const runtimeTargetId = getRowRuntimeTargetId(added);
  const stateKey = getRowStateKey(added);
  const visible = layerModel.getState()?.[stateKey]?.visible;
  if (runtimeTargetId && typeof visible === "boolean") {
    screenRuntime.setLayerStyleValue(runtimeTargetId, "visible", visible);
  }
  if (Array.isArray(bounds)) {
    reportProgress(98, "Fitting map to layer");
    screenRuntime.fitBounds(bounds);
  }

  reportProgress(100, "Layer added to map");
  return { row: added, duplicate: false };
}

async function reloadSupabaseLayer(layerId, layerModel, screenRuntime, { displayGeometryTypes = [] } = {}) {
  const layerResult = await loadLayerFromSupabaseLazy(layerId);
  const { layer, geojson, tilesUrl, sourceLayerId } = layerResult;
  const runtimeGeometryTypes = Array.isArray(displayGeometryTypes) && displayGeometryTypes.length
    ? displayGeometryTypes
    : Array.isArray(layer.geometry_types) ? layer.geometry_types : [];
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
        geometryTypes: runtimeGeometryTypes,
        geometryType: runtimeGeometryTypes.length === 1 ? runtimeGeometryTypes[0] : layer.geometry_type ?? null,
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
    syncDynamicFilterOwnershipRecursively(layerModel, screenRuntime, row);
  }
  screenRuntime.reapplyFullOrder?.();
}

async function refreshSupabaseLayerDataInBackground(layerId, layerModel, screenRuntime, {
  rowId = "",
  propertyFilter = null,
  displayGeometryTypes = [],
  clearCache = false,
} = {}) {
  try {
    if (clearCache) {
      await clearCachedLayerResultsLazy(layerId);
    }
    const layerResult = await loadLayerFromSupabaseLazy(layerId, { propertyFilter });
    supabaseLayerDataCache.set(layerId, layerResult);
    const targetRowId = rowId || layerModel.getSupabaseLayers().find((entry) => entry.layerId === layerId)?.rowId || "";
    if (targetRowId && (layerResult.geojson || layerResult.tilesUrl)) {
      attachSupabaseLayerResultToRuntime({
        layerModel,
        screenRuntime,
        rowId: targetRowId,
        layerId,
        layerResult,
        displayGeometryTypes,
      });
      requestPrintRendererSync();
    }
  } catch (error) {
    console.warn("Failed to refresh Supabase layer data:", error?.message ?? error);
  }
}

async function applyCurrentLayerSettingsAsDefaults(row, layerModel, screenRuntime) {
  if (!row?.layerRef || !SUPABASE_UUID.test(row.layerRef)) {
    throw new Error("Layer defaults can only be saved for hosted Supabase layers.");
  }
  const defaultView = serializeLayerDefaultView(layerModel, row);
  const stylePatch = collectLayerDefaultStylePatch(layerModel, row);
  const { updateLayerDefaultStyle, updateLayerDefaultView } = await import("../sources/supabase/layer-loader.js");
  await updateLayerDefaultView(row.layerRef, defaultView);
  if (Object.keys(stylePatch).length) {
    await updateLayerDefaultStyle(row.layerRef, stylePatch);
  }
  await clearCachedLayerResultsLazy(row.layerRef);
  const verifiedLayer = await loadLayerFromSupabaseLazy(row.layerRef, {
    propertyFilter: buildInitialLoadFilterExpressionForLayer(layerModel, row, defaultView),
  });
  const savedRows = Array.isArray(verifiedLayer?.layer?.default_view?.rows)
    ? verifiedLayer.layer.default_view.rows.length
    : 0;
  const savedStyleKeys = verifiedLayer?.layer?.default_style && typeof verifiedLayer.layer.default_style === "object"
    ? Object.keys(verifiedLayer.layer.default_style).length
    : 0;
  if (!verifiedLayer?.layer) {
    throw new Error("Layer defaults were submitted, but the saved layer could not be verified.");
  }
  void refreshSupabaseLayerDataInBackground(row.layerRef, layerModel, screenRuntime, {
    rowId: row.id,
    propertyFilter: buildInitialLoadFilterExpressionForLayer(layerModel, row, defaultView),
    displayGeometryTypes: row.geometryTypes ?? [],
    clearCache: false,
  });
  return {
    message: `Saved defaults (${savedRows} rows, ${savedStyleKeys} style keys: ${formatDefaultStyleSummary(verifiedLayer.layer.default_style)}).`,
  };
}

async function resetLayerSettingsToDefaults(row, layerModel, screenRuntime) {
  if (!row?.id || !row.layerRef || !SUPABASE_UUID.test(row.layerRef)) {
    return;
  }
  const defaultView = await loadLayerDefaultViewLazy(row.layerRef);
  await clearCachedLayerResultsLazy(row.layerRef);
  layerModel.getChildRows(row.id)
    .filter((childRow) => childRow?.type !== "fill" && childRow?.type !== "line" && childRow?.type !== "point")
    .forEach((childRow) => {
      const removed = layerModel.removeRow(childRow.id, row.id);
      if (removed) {
        detachDynamicFilterRowsRecursively(screenRuntime, childRow);
      }
    });
  layerModel.clearLayerStyleOverrides(row.layerRef);
  materializeLayerDefaultViewRows(layerModel, row, defaultView, {
    sourceLayerId: row.layerRef,
    geometryTypes: row.geometryTypes ?? [],
    geometryType: row.geometryType ?? "mixed",
  });
  const refreshedRow = layerModel.getRowById(row.id) ?? row;
  syncDynamicFilterTree(layerModel, screenRuntime, refreshedRow);
  applyPersistedRowVisibility(layerModel, screenRuntime, refreshedRow);
  screenRuntime.reapplyFullOrder?.();
  void refreshSupabaseLayerDataInBackground(row.layerRef, layerModel, screenRuntime, {
    rowId: row.id,
    propertyFilter: buildInitialLoadFilterExpressionForLayer(layerModel, refreshedRow, defaultView),
    displayGeometryTypes: row.geometryTypes ?? [],
    clearCache: false,
  });
}

export { bootstrapApplication };
