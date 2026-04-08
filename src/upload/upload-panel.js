import { parseFile, SUPPORTED_EXTENSIONS } from "./parse-file.js";
import { rowsToFeatures } from "./csv-mapper.js";
import { summarizeFeatureComplexity } from "./feature-complexity.js";
import { insertLayer } from "./insert-layer.js";

export function mountUploadPanel({ onLayerCreated }) {
  const panel = createPanel();
  document.body.appendChild(panel);

  let state = {
    step: "drop", // drop | map-columns | confirm | uploading | done
    file: null,
    parsed: null,
    mapping: null,
    features: null,
    complexity: null,
    usePmtiles: false,
    name: "",
    viewAccess: "unlisted",
  };

  function render() {
    const content = panel.querySelector(".upload-panel-content");
    content.innerHTML = "";

    if (state.step === "drop") content.append(renderDrop());
    if (state.step === "map-columns") content.append(renderColumnMap());
    if (state.step === "confirm") content.append(renderConfirm());
    if (state.step === "uploading") content.append(renderUploading());
    if (state.step === "done") content.append(renderDone());
  }

  function applyFeatures(features) {
    state.features = features;
    state.complexity = summarizeFeatureComplexity(features);
    state.usePmtiles = state.complexity.recommendPmtiles;
  }

  function renderDrop() {
    const el = html(`
      <div class="upload-step">
        <div class="upload-dropzone" id="uploadDropzone">
          <p class="upload-dropzone-hint">Drop a file or click to browse</p>
          <p class="upload-dropzone-formats">${SUPPORTED_EXTENSIONS.join("  |  ")}</p>
          <input type="file" class="upload-file-input" accept="${SUPPORTED_EXTENSIONS.join(",")}" />
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

    async function handleFile(file) {
      if (!file) return;
      error.hidden = true;
      const parsed = await parseFile(file);
      if (parsed.error) {
        error.textContent = parsed.error;
        error.hidden = false;
        return;
      }

      state.file = file;
      state.parsed = parsed;
      state.name = file.name.replace(/\.[^.]+$/, "");

      if (parsed.type === "csv") {
        state.mapping = { ...parsed.mapping };
        state.step = "map-columns";
      } else {
        applyFeatures(parsed.features);
        state.step = "confirm";
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
        <h3 class="upload-step-title">Map columns</h3>
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

    const el = html(`
      <div class="upload-step">
        <h3 class="upload-step-title">Ready to upload</h3>
        <p class="upload-step-sub">${recommendation}</p>
        <div class="upload-summary">
          <div class="upload-summary-row"><span>Features</span><strong>${count.toLocaleString()}</strong></div>
          <div class="upload-summary-row"><span>Type</span><strong>${types}</strong></div>
          <div class="upload-summary-row"><span>Vertices</span><strong>${complexity.vertexCount.toLocaleString()}</strong></div>
          <div class="upload-summary-row"><span>Rendering</span><strong>${state.usePmtiles ? "Optimised tiles" : "Flat GeoJSON"}</strong></div>
        </div>
        <label class="upload-field-label">Layer name
          <input class="upload-field-input" type="text" value="${state.name}" id="uploadName" />
        </label>
        <label class="upload-field-label">
          <input type="checkbox" id="uploadUsePmtiles" ${state.usePmtiles ? "checked" : ""} />
          Generate PMTiles for faster rendering
        </label>
        <label class="upload-field-label">Visibility
          <select class="upload-field-input" id="uploadAccess">
            <option value="unlisted" ${state.viewAccess === "unlisted" ? "selected" : ""}>Unlisted (anyone with the link)</option>
            <option value="public" ${state.viewAccess === "public" ? "selected" : ""}>Public</option>
            <option value="private" ${state.viewAccess === "private" ? "selected" : ""}>Private</option>
          </select>
        </label>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadBack">Back</button>
          <button class="upload-btn upload-btn-primary" id="uploadConfirm">Upload</button>
        </div>
        <p class="upload-error" id="uploadError" hidden></p>
      </div>
    `);

    el.querySelector("#uploadName").addEventListener("input", (event) => {
      state.name = event.target.value;
    });
    el.querySelector("#uploadUsePmtiles").addEventListener("change", (event) => {
      state.usePmtiles = event.target.checked;
    });
    el.querySelector("#uploadAccess").addEventListener("change", (event) => {
      state.viewAccess = event.target.value;
    });
    el.querySelector("#uploadBack").addEventListener("click", () => {
      state.step = state.parsed.type === "csv" ? "map-columns" : "drop";
      render();
    });
    el.querySelector("#uploadConfirm").addEventListener("click", async () => {
      const error = el.querySelector("#uploadError");
      if (!state.name.trim()) {
        error.textContent = "Layer name is required.";
        error.hidden = false;
        return;
      }

      state.step = "uploading";
      render();

      try {
        const layerId = await insertLayer({
          name: state.name.trim(),
          viewAccess: state.viewAccess,
          features: state.features,
          rawFile: state.file,
          usePmtiles: state.usePmtiles,
          onProgress: (pct, label) => {
            const bar = panel.querySelector(".upload-progress-bar");
            if (bar) bar.style.width = `${pct}%`;
            const labelEl = panel.querySelector(".upload-progress-label");
            if (labelEl) labelEl.textContent = label ?? `${pct}%`;
          },
        });
        state.step = "done";
        state.layerId = layerId;
        render();
        onLayerCreated?.({ layerId, name: state.name.trim(), parentId: state.parentId ?? null });
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
    const el = html(`
      <div class="upload-step upload-step-done">
        <p class="upload-done-label">Layer added to map</p>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadAnother">Upload another</button>
          <button class="upload-btn upload-btn-primary" id="uploadClose">Done</button>
        </div>
      </div>
    `);
    el.querySelector("#uploadAnother").addEventListener("click", () => {
      state = { step: "drop", file: null, parsed: null, mapping: null, features: null, complexity: null, usePmtiles: false, name: "", viewAccess: "unlisted" };
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
    open({ parentId } = {}) {
      panel.classList.add("is-open");
      state = { step: "drop", file: null, parsed: null, mapping: null, features: null, complexity: null, usePmtiles: false, name: "", viewAccess: "unlisted", parentId: parentId ?? null };
      render();
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
