import { parseFile, SUPPORTED_EXTENSIONS } from "./parse-file.js";
import { rowsToFeatures } from "./csv-mapper.js";
import { summarizeFeatureComplexity } from "./feature-complexity.js";
import { inferFieldSchemaFromFeatures } from "./field-schema.js";
import { inferGeometryFamily } from "./geometry-family.js";
import {
  addDatasetToLayer,
  appendFeaturesToDataset,
  createLayerWithDataset,
} from "./insert-layer.js";
import { getLayerDatasets, getSupabaseCatalog } from "../sources/supabase/layer-loader.js";

function inferGeometryType(features = []) {
  return inferGeometryFamily(features);
}

function normalizeDatasetName(value, fallback = "Dataset") {
  const trimmed = String(value ?? "").replace(/\.[^.]+$/, "").trim();
  return trimmed || fallback;
}

export function mountUploadPanel({ onLayerCreated, onLayerUpdated }) {
  const panel = createPanel();
  document.body.appendChild(panel);

  let state = createInitialState();

  function createInitialState(overrides = {}) {
    return {
      step: "mode", // mode | drop | map-columns | confirm | uploading | done
      mode: "",
      file: null,
      parsed: null,
      mapping: null,
      features: null,
      fieldSchema: [],
      complexity: null,
      usePmtiles: false,
      name: "",
      datasetName: "",
      viewAccess: "unlisted",
      parentId: null,
      targetLayerId: "",
      targetLayerName: "",
      targetDatasetId: "",
      targetDatasetName: "",
      catalog: [],
      catalogLoaded: false,
      datasets: [],
      loadingTargets: false,
      targetsLoadedFor: "",
      error: "",
      layerId: null,
      datasetId: null,
      ...overrides,
    };
  }

  function setError(message = "") {
    state.error = message;
    const errorEl = panel.querySelector("#uploadError");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }
  }

  function render() {
    const content = panel.querySelector(".upload-panel-content");
    content.innerHTML = "";

    if (state.step === "mode") content.append(renderModeSelect());
    if (state.step === "drop") content.append(renderDrop());
    if (state.step === "map-columns") content.append(renderColumnMap());
    if (state.step === "confirm") content.append(renderConfirm());
    if (state.step === "uploading") content.append(renderUploading());
    if (state.step === "done") content.append(renderDone());
  }

  function ensureModeSelected() {
    if (!state.mode) {
      state.step = "mode";
      render();
      return false;
    }
    return true;
  }

  async function loadCatalogIfNeeded() {
    if (state.catalogLoaded || state.loadingTargets) {
      return;
    }
    state.loadingTargets = true;
    render();
    try {
      state.catalog = await getSupabaseCatalog();
    } catch (_error) {
      state.catalog = [];
    } finally {
      state.catalogLoaded = true;
      state.loadingTargets = false;
      render();
    }
  }

  async function loadDatasetsForLayer(layerId) {
    if (!layerId || state.targetsLoadedFor === layerId) {
      return;
    }
    state.loadingTargets = true;
    render();
    try {
      state.datasets = await getLayerDatasets(layerId);
      state.targetsLoadedFor = layerId;
    } catch (_error) {
      state.datasets = [];
      state.targetsLoadedFor = "";
    } finally {
      state.loadingTargets = false;
      render();
    }
  }

  function applyFeatures(features) {
    state.features = features;
    state.fieldSchema = inferFieldSchemaFromFeatures(features);
    state.complexity = summarizeFeatureComplexity(features);
    state.usePmtiles = state.complexity.recommendPmtiles;
  }

  async function processSelectedFile(file) {
    if (!file) return { ok: false };

    const parsed = await parseFile(file);
    if (parsed.error) {
      return { ok: false, error: parsed.error };
    }

    state.file = file;
    state.parsed = parsed;
    if (!state.name && state.mode === "new-layer") {
      state.name = normalizeDatasetName(file.name, "Layer");
    }
    if (!state.datasetName) {
      state.datasetName = normalizeDatasetName(file.name);
    }

    if (parsed.type === "csv") {
      state.mapping = { ...parsed.mapping };
      state.step = "map-columns";
    } else {
      applyFeatures(parsed.features);
      state.step = "confirm";
    }

    return { ok: true };
  }

  function renderModeSelect() {
    void loadCatalogIfNeeded();
    const layerOptions = state.catalog.map((entry) => `
      <option value="${entry.id}" ${state.targetLayerId === entry.id ? "selected" : ""}>${entry.label}</option>
    `).join("");
    const datasetOptions = state.datasets.map((dataset) => `
      <option value="${dataset.id}" ${state.targetDatasetId === dataset.id ? "selected" : ""}>${dataset.name}</option>
    `).join("");

    const el = html(`
      <div class="upload-step">
        <h3 class="upload-step-title">Add data</h3>
        <div class="upload-col-map">
          <label class="upload-col-row">
            <span class="upload-col-label">Mode</span>
            <select class="upload-col-select" id="uploadMode">
              <option value="">Choose...</option>
              <option value="new-layer" ${state.mode === "new-layer" ? "selected" : ""}>New layer</option>
              <option value="existing-layer" ${state.mode === "existing-layer" ? "selected" : ""}>Add to existing layer</option>
              <option value="existing-dataset" ${state.mode === "existing-dataset" ? "selected" : ""}>Add to existing dataset</option>
            </select>
          </label>
          ${(state.mode === "existing-layer" || state.mode === "existing-dataset") ? `
            <label class="upload-col-row">
              <span class="upload-col-label">Layer</span>
              <select class="upload-col-select" id="uploadTargetLayer">
                <option value="">Choose layer...</option>
                ${layerOptions}
              </select>
            </label>
          ` : ""}
          ${state.mode === "existing-dataset" ? `
            <label class="upload-col-row">
              <span class="upload-col-label">Dataset</span>
              <select class="upload-col-select" id="uploadTargetDataset">
                <option value="">Choose dataset...</option>
                ${datasetOptions}
              </select>
            </label>
          ` : ""}
        </div>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-primary" id="uploadModeNext" ${state.loadingTargets ? "disabled" : ""}>Continue</button>
        </div>
        <p class="upload-error" id="uploadError" ${state.error ? "" : "hidden"}>${state.error || ""}</p>
      </div>
    `);

    el.querySelector("#uploadMode")?.addEventListener("change", async (event) => {
      state.mode = event.target.value;
      state.targetLayerId = "";
      state.targetLayerName = "";
      state.targetDatasetId = "";
      state.targetDatasetName = "";
      state.datasets = [];
      state.targetsLoadedFor = "";
      setError("");
      render();
    });

    el.querySelector("#uploadTargetLayer")?.addEventListener("change", async (event) => {
      state.targetLayerId = event.target.value;
      const match = state.catalog.find((entry) => entry.id === state.targetLayerId);
      state.targetLayerName = match?.label ?? "";
      state.targetDatasetId = "";
      state.targetDatasetName = "";
      state.datasets = [];
      state.targetsLoadedFor = "";
      if (state.mode === "existing-dataset" && state.targetLayerId) {
        await loadDatasetsForLayer(state.targetLayerId);
      } else {
        render();
      }
    });

    el.querySelector("#uploadTargetDataset")?.addEventListener("change", (event) => {
      state.targetDatasetId = event.target.value;
      const match = state.datasets.find((dataset) => dataset.id === state.targetDatasetId);
      state.targetDatasetName = match?.name ?? "";
    });

    el.querySelector("#uploadModeNext")?.addEventListener("click", async () => {
      if (!state.mode) {
        setError("Choose how you want to add data.");
        return;
      }
      if ((state.mode === "existing-layer" || state.mode === "existing-dataset") && !state.targetLayerId) {
        setError("Choose a target layer.");
        return;
      }
      if (state.mode === "existing-dataset" && !state.targetDatasetId) {
        setError("Choose a target dataset.");
        return;
      }

      setError("");
      state.step = "drop";
      render();
    });

    return el;
  }

  function renderDrop() {
    const el = html(`
      <div class="upload-step">
        <div class="upload-dropzone" id="uploadDropzone">
          <p class="upload-dropzone-hint">Drop a file or click to browse</p>
          <p class="upload-dropzone-formats">${SUPPORTED_EXTENSIONS.join("  |  ")}</p>
          <input type="file" class="upload-file-input" accept="${SUPPORTED_EXTENSIONS.join(",")}" />
        </div>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadBackMode">Back</button>
        </div>
        <p class="upload-error" id="uploadError" hidden></p>
      </div>
    `);

    const zone = el.querySelector("#uploadDropzone");
    const input = el.querySelector(".upload-file-input");
    const error = el.querySelector("#uploadError");

    zone.addEventListener("click", () => input.click());
    input.addEventListener("click", (event) => event.stopPropagation());
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-over");
      void handleFile(event.dataTransfer.files[0]);
    });
    input.addEventListener("change", () => {
      void handleFile(input.files[0]);
    });
    el.querySelector("#uploadBackMode")?.addEventListener("click", () => {
      state.step = "mode";
      render();
    });

    async function handleFile(file) {
      error.hidden = true;
      const result = await processSelectedFile(file);
      if (!result?.ok) {
        if (result?.error) {
          error.textContent = result.error;
          error.hidden = false;
        }
        return;
      }
      render();
    }

    return el;
  }

  function renderColumnMap() {
    const { headers, rows, mapping } = state.parsed;
    const preview = rows.slice(0, 3);
    const roles = ["lat", "lng", "valid_from", "valid_to", "label"];

    const el = html(`
      <div class="upload-step">
        <h3 class="upload-step-title">${state.file?.name || "Untitled upload"}</h3>
        <p class="upload-step-sub">${rows.length.toLocaleString()} rows · ${headers.length} columns</p>
        <div class="upload-col-map" id="uploadColMap"></div>
        <table class="upload-preview" id="uploadPreview"></table>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadBack">Back</button>
          <button class="upload-btn upload-btn-primary" id="uploadNext">Continue</button>
        </div>
        <p class="upload-error" id="uploadError" hidden></p>
      </div>
    `);

    const mapContainer = el.querySelector("#uploadColMap");
    roles.forEach((role) => {
      const row = html(`
        <div class="upload-col-row">
          <label class="upload-col-label">${role}</label>
          <select class="upload-col-select" data-role="${role}">
            <option value="">- none -</option>
            ${headers.map((header) => `<option value="${header}" ${mapping[role] === header ? "selected" : ""}>${header}</option>`).join("")}
          </select>
        </div>
      `);
      row.querySelector("select").addEventListener("change", (event) => {
        state.mapping[role] = event.target.value || null;
        updatePreview();
      });
      mapContainer.append(row);
    });

    function updatePreview() {
      const table = el.querySelector("#uploadPreview");
      table.innerHTML = `
        <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
        <tbody>${preview.map((row) => `<tr>${headers.map((header) => `<td>${row[header] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      `;
    }
    updatePreview();

    el.querySelector("#uploadBack").addEventListener("click", () => {
      state.step = "drop";
      render();
    });
    el.querySelector("#uploadNext").addEventListener("click", () => {
      const error = el.querySelector("#uploadError");
      if (!state.mapping.lat || !state.mapping.lng) {
        error.textContent = "Latitude and longitude columns are required.";
        error.hidden = false;
        return;
      }

      const features = rowsToFeatures(state.parsed.rows, state.mapping);
      if (features.length === 0) {
        error.textContent = "No valid rows found. Check lat/lng columns contain numbers.";
        error.hidden = false;
        return;
      }

      applyFeatures(features);
      state.step = "confirm";
      render();
    });

    return el;
  }

  function renderConfirm() {
    const count = state.features.length;
    const types = [...new Set(state.features.map((feature) => feature.geometry?.type))].join(", ");
    const complexity = state.complexity ?? summarizeFeatureComplexity(state.features);
    const recommendation = complexity.recommendPmtiles
      ? `PMTiles recommended. ${complexity.recommendationReason}`
      : complexity.recommendationReason;
    const showLayerName = state.mode === "new-layer";
    const showDatasetName = state.mode === "new-layer" || state.mode === "existing-layer";
    const showPmtilesOption = state.mode !== "existing-dataset";

    const el = html(`
      <div class="upload-step">
        <h3 class="upload-step-title">Ready to upload</h3>
        <p class="upload-step-sub">${recommendation}</p>
        <div class="upload-summary">
          <div class="upload-summary-row"><span>Features</span><strong>${count.toLocaleString()}</strong></div>
          <div class="upload-summary-row"><span>Type</span><strong>${types}</strong></div>
          <div class="upload-summary-row"><span>Vertices</span><strong>${complexity.vertexCount.toLocaleString()}</strong></div>
          ${showPmtilesOption ? `<div class="upload-summary-row"><span>Rendering</span><strong>${state.usePmtiles ? "Optimised tiles" : "Flat GeoJSON"}</strong></div>` : ""}
          ${state.mode !== "new-layer" ? `<div class="upload-summary-row"><span>Layer</span><strong>${state.targetLayerName}</strong></div>` : ""}
          ${state.mode === "existing-dataset" ? `<div class="upload-summary-row"><span>Dataset</span><strong>${state.targetDatasetName}</strong></div>` : ""}
        </div>
        ${showLayerName ? `
          <label class="upload-field-label">Layer name
            <input class="upload-field-input" type="text" value="${state.name}" id="uploadName" />
          </label>
        ` : ""}
        ${showDatasetName ? `
          <label class="upload-field-label">Dataset name
            <input class="upload-field-input" type="text" value="${state.datasetName}" id="uploadDatasetName" />
          </label>
        ` : ""}
        ${showPmtilesOption ? `
          <label class="upload-field-label">
            <input type="checkbox" id="uploadUsePmtiles" ${state.usePmtiles ? "checked" : ""} />
            Generate PMTiles for faster rendering
          </label>
        ` : ""}
        ${state.mode === "new-layer" ? `
          <label class="upload-field-label">Visibility
            <select class="upload-field-input" id="uploadAccess">
              <option value="unlisted" ${state.viewAccess === "unlisted" ? "selected" : ""}>Unlisted (anyone with the link)</option>
              <option value="public" ${state.viewAccess === "public" ? "selected" : ""}>Public</option>
              <option value="private" ${state.viewAccess === "private" ? "selected" : ""}>Private</option>
            </select>
          </label>
        ` : ""}
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadBack">Back</button>
          <button class="upload-btn upload-btn-primary" id="uploadConfirm">Upload</button>
        </div>
        <p class="upload-error" id="uploadError" hidden></p>
      </div>
    `);

    el.querySelector("#uploadName")?.addEventListener("input", (event) => {
      state.name = event.target.value;
    });
    el.querySelector("#uploadDatasetName")?.addEventListener("input", (event) => {
      state.datasetName = event.target.value;
    });
    el.querySelector("#uploadUsePmtiles")?.addEventListener("change", (event) => {
      state.usePmtiles = event.target.checked;
    });
    el.querySelector("#uploadAccess")?.addEventListener("change", (event) => {
      state.viewAccess = event.target.value;
    });
    el.querySelector("#uploadBack").addEventListener("click", () => {
      state.step = state.parsed.type === "csv" ? "map-columns" : "drop";
      render();
    });
    el.querySelector("#uploadConfirm").addEventListener("click", async () => {
      const error = el.querySelector("#uploadError");
      if (!ensureModeSelected()) {
        return;
      }
      if (state.mode === "new-layer" && !state.name.trim()) {
        error.textContent = "Layer name is required.";
        error.hidden = false;
        return;
      }
      if (showDatasetName && !state.datasetName.trim()) {
        error.textContent = "Dataset name is required.";
        error.hidden = false;
        return;
      }

      state.step = "uploading";
      render();

      try {
        if (state.mode === "new-layer") {
          const { layerId, datasetId } = await createLayerWithDataset({
            name: state.name.trim(),
            datasetName: state.datasetName.trim(),
            viewAccess: state.viewAccess,
            features: state.features,
            fieldSchema: state.fieldSchema,
            rawFile: state.file,
            usePmtiles: state.usePmtiles,
            onProgress: setUploadProgress,
          });
          state.layerId = layerId;
          state.datasetId = datasetId;
          state.step = "done";
          render();
          onLayerCreated?.({
            layerId,
            datasetId,
            name: state.name.trim(),
            parentId: state.parentId ?? null,
            geometryType: inferGeometryType(state.features),
          });
          return;
        }

        if (state.mode === "existing-layer") {
          const { datasetId } = await addDatasetToLayer({
            layerId: state.targetLayerId,
            name: state.datasetName.trim(),
            features: state.features,
            fieldSchema: state.fieldSchema,
            rawFile: state.file,
            usePmtiles: state.usePmtiles,
            onProgress: setUploadProgress,
          });
          state.layerId = state.targetLayerId;
          state.datasetId = datasetId;
          state.step = "done";
          render();
          onLayerUpdated?.({
            layerId: state.targetLayerId,
            datasetId,
            mode: state.mode,
          });
          return;
        }

        const result = await appendFeaturesToDataset({
          datasetId: state.targetDatasetId,
          features: state.features,
          onProgress: setUploadProgress,
        });
        state.layerId = state.targetLayerId;
        state.datasetId = result.datasetId;
        state.step = "done";
        render();
        onLayerUpdated?.({
          layerId: state.targetLayerId,
          datasetId: result.datasetId,
          mode: state.mode,
        });
      } catch (err) {
        state.step = "confirm";
        render();
        const errorEl = panel.querySelector("#uploadError");
        if (errorEl) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        }
      }
    });

    return el;
  }

  function setUploadProgress(pct, label) {
    const bar = panel.querySelector(".upload-progress-bar");
    if (bar) bar.style.width = `${pct}%`;
    const labelEl = panel.querySelector(".upload-progress-label");
    if (labelEl) labelEl.textContent = label ?? `${pct}%`;
  }

  function renderUploading() {
    return html(`
      <div class="upload-step upload-step-uploading">
        <p class="upload-uploading-label">Uploading...</p>
        <div class="upload-progress-track">
          <div class="upload-progress-bar" style="width:0%"></div>
        </div>
        <p class="upload-progress-label">0%</p>
      </div>
    `);
  }

  function renderDone() {
    const label = state.mode === "new-layer" ? "Layer added to map" : "Data added";
    const el = html(`
      <div class="upload-step upload-step-done">
        <p class="upload-done-label">${label}</p>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadAnother">Upload another</button>
          <button class="upload-btn upload-btn-primary" id="uploadClose">Done</button>
        </div>
      </div>
    `);
    el.querySelector("#uploadAnother").addEventListener("click", () => {
      state = createInitialState({
        mode: state.mode,
        step: state.mode ? "drop" : "mode",
        parentId: state.parentId,
        targetLayerId: state.targetLayerId,
        targetLayerName: state.targetLayerName,
        targetDatasetId: state.mode === "existing-dataset" ? state.targetDatasetId : "",
        targetDatasetName: state.mode === "existing-dataset" ? state.targetDatasetName : "",
        catalog: state.catalog,
        catalogLoaded: state.catalogLoaded,
        datasets: state.datasets,
        targetsLoadedFor: state.targetsLoadedFor,
      });
      render();
    });
    el.querySelector("#uploadClose").addEventListener("click", () => closePanel());
    return el;
  }

  function closePanel() {
    panel.classList.remove("is-open");
  }

  panel.querySelector(".upload-panel-close").addEventListener("click", closePanel);

  render();

  return {
    open({ mode = "", layerId = "", datasetId = "", parentId, name = "", file = null } = {}) {
      state = createInitialState({
        mode,
        step: mode ? "drop" : "mode",
        name,
        parentId: parentId ?? null,
        targetLayerId: layerId,
        targetDatasetId: datasetId,
      });
      panel.classList.add("is-open");

      if (layerId) {
        void loadCatalogIfNeeded().then(async () => {
          const match = state.catalog.find((entry) => entry.id === layerId);
          state.targetLayerName = match?.label ?? "";
          if (mode === "existing-dataset" && layerId) {
            await loadDatasetsForLayer(layerId);
            const dataset = state.datasets.find((entry) => entry.id === datasetId);
            state.targetDatasetName = dataset?.name ?? "";
          }
          render();
        });
      } else {
        render();
      }

      if (file) {
        void processSelectedFile(file).then((result) => {
          if (!result?.ok) {
            render();
            const errorEl = panel.querySelector("#uploadError");
            if (errorEl && result?.error) {
              errorEl.textContent = result.error;
              errorEl.hidden = false;
            }
            return;
          }
          render();
        });
      }
    },
    close: closePanel,
  };
}

function createPanel() {
  return html(`
    <div class="upload-panel" id="uploadPanel">
      <div class="upload-panel-inner">
        <div class="upload-panel-header">
          <span class="upload-panel-title">Add layer</span>
          <button class="upload-panel-close" aria-label="Close">X</button>
        </div>
        <div class="upload-panel-content"></div>
      </div>
    </div>
  `);
}

function html(str) {
  const template = document.createElement("template");
  template.innerHTML = str.trim();
  return template.content.firstElementChild;
}
