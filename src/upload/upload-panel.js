import { parseFile, getFileType, SUPPORTED_EXTENSIONS } from "./parse-file.js";
import { rowsToFeatures } from "./csv-mapper.js";
import { insertLayer } from "./insert-layer.js";

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

// ─── Mount ────────────────────────────────────────────────────────────────────

export function mountUploadPanel({ onLayerCreated }) {
  const panel = createPanel();
  document.body.appendChild(panel);

  let state = {
    step: "drop",       // drop | map-columns | tile-consent | confirm | uploading | done
    file: null,
    parsed: null,       // result from parseFile()
    mapping: null,      // CSV column mapping (user-confirmed)
    features: null,     // final features array ready to insert
    usePmtiles: false,  // whether to generate a PMTiles file
    name: "",
    viewAccess: "unlisted",
  };

  function render() {
    const content = panel.querySelector(".upload-panel-content");
    content.innerHTML = "";

    if (state.step === "drop")          content.append(renderDrop());
    if (state.step === "map-columns")   content.append(renderColumnMap());
    if (state.step === "tile-consent")  content.append(renderTileConsent());
    if (state.step === "confirm")       content.append(renderConfirm());
    if (state.step === "uploading")     content.append(renderUploading());
    if (state.step === "done")          content.append(renderDone());
  }

  // ── Step 1: Drop ────────────────────────────────────────────────────────────

  function renderDrop() {
    const el = html(`
      <div class="upload-step">
        <div class="upload-dropzone" id="uploadDropzone">
          <p class="upload-dropzone-hint">Drop a file or click to browse</p>
          <p class="upload-dropzone-formats">${SUPPORTED_EXTENSIONS.join("  ·  ")}</p>
          <input type="file" class="upload-file-input" accept="${SUPPORTED_EXTENSIONS.join(",")}" />
        </div>
        <p class="upload-error" id="uploadError" hidden></p>
      </div>
    `);

    const zone  = el.querySelector("#uploadDropzone");
    const input = el.querySelector(".upload-file-input");
    const error = el.querySelector("#uploadError");

    zone.addEventListener("click", () => input.click());
    input.addEventListener("click", (e) => e.stopPropagation());
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("is-over"); handleFile(e.dataTransfer.files[0]); });
    input.addEventListener("change", () => handleFile(input.files[0]));

    async function handleFile(file) {
      if (!file) return;
      error.hidden = true;
      const parsed = await parseFile(file);
      if (parsed.error) {
        error.textContent = parsed.error;
        error.hidden = false;
        return;
      }
      state.file   = file;
      state.parsed = parsed;
      state.name   = file.name.replace(/\.[^.]+$/, "");

      if (parsed.type === "csv") {
        state.mapping = { ...parsed.mapping };
        state.step = "map-columns";
      } else {
        state.features = parsed.features;
        // Large non-CSV files: offer PMTiles generation
        if (file.size > LARGE_FILE_THRESHOLD) {
          state.step = "tile-consent";
        } else {
          state.usePmtiles = false;
          state.step = "confirm";
        }
      }
      render();
    }

    return el;
  }

  // ── Step 2: Column mapping (CSV only) ───────────────────────────────────────

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

    // Column role selectors
    const mapContainer = el.querySelector("#uploadColMap");
    for (const role of roles) {
      const row = html(`
        <div class="upload-col-row">
          <label class="upload-col-label">${role}</label>
          <select class="upload-col-select" data-role="${role}">
            <option value="">— none —</option>
            ${headers.map((h) => `<option value="${h}" ${mapping[role] === h ? "selected" : ""}>${h}</option>`).join("")}
          </select>
        </div>
      `);
      row.querySelector("select").addEventListener("change", (e) => {
        state.mapping[role] = e.target.value || null;
        updatePreview();
      });
      mapContainer.append(row);
    }

    // Preview table
    function updatePreview() {
      const table = el.querySelector("#uploadPreview");
      table.innerHTML = `
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${preview.map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      `;
    }
    updatePreview();

    el.querySelector("#uploadBack").addEventListener("click", () => { state.step = "drop"; render(); });
    el.querySelector("#uploadNext").addEventListener("click", () => {
      const error = el.querySelector("#uploadError");
      if (!state.mapping.lat || !state.mapping.lng) {
        error.textContent = "Latitude and longitude columns are required.";
        error.hidden = false;
        return;
      }
      state.features = rowsToFeatures(state.parsed.rows, state.mapping);
      if (state.features.length === 0) {
        error.textContent = "No valid rows found. Check lat/lng columns contain numbers.";
        error.hidden = false;
        return;
      }
      state.usePmtiles = false;
      state.step = "confirm";
      render();
    });

    return el;
  }

  // ── Step 3: Tile consent (large files only) ──────────────────────────────────

  function renderTileConsent() {
    const sizeMb = (state.file.size / 1024 / 1024).toFixed(1);
    const el = html(`
      <div class="upload-step">
        <h3 class="upload-step-title">Large file detected</h3>
        <p class="upload-step-sub">
          This file is ${sizeMb} MB. Generate optimised tiles for fast map rendering?
          This runs in your browser and may take a minute.
        </p>
        <div class="upload-actions upload-actions-col">
          <button class="upload-btn upload-btn-primary" id="uploadYesTiles">Yes, generate tiles</button>
          <button class="upload-btn upload-btn-secondary" id="uploadNoTiles">No, upload as-is</button>
          <button class="upload-btn upload-btn-ghost" id="uploadBack">Back</button>
        </div>
      </div>
    `);

    el.querySelector("#uploadYesTiles").addEventListener("click", () => {
      state.usePmtiles = true;
      state.step = "confirm";
      render();
    });
    el.querySelector("#uploadNoTiles").addEventListener("click", () => {
      state.usePmtiles = false;
      state.step = "confirm";
      render();
    });
    el.querySelector("#uploadBack").addEventListener("click", () => { state.step = "drop"; render(); });

    return el;
  }

  // ── Step 4: Confirm ─────────────────────────────────────────────────────────

  function renderConfirm() {
    const count = state.features.length;
    const types = [...new Set(state.features.map((f) => f.geometry?.type))].join(", ");
    const tileNote = state.usePmtiles
      ? `<div class="upload-summary-row"><span>Rendering</span><strong>Optimised tiles</strong></div>`
      : "";

    const el = html(`
      <div class="upload-step">
        <h3 class="upload-step-title">Ready to upload</h3>
        <div class="upload-summary">
          <div class="upload-summary-row"><span>Features</span><strong>${count.toLocaleString()}</strong></div>
          <div class="upload-summary-row"><span>Type</span><strong>${types}</strong></div>
          ${tileNote}
        </div>
        <label class="upload-field-label">Layer name
          <input class="upload-field-input" type="text" value="${state.name}" id="uploadName" />
        </label>
        <label class="upload-field-label">Visibility
          <select class="upload-field-input" id="uploadAccess">
            <option value="unlisted" selected>Unlisted (anyone with the link)</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary" id="uploadBack">Back</button>
          <button class="upload-btn upload-btn-primary" id="uploadConfirm">Upload</button>
        </div>
        <p class="upload-error" id="uploadError" hidden></p>
      </div>
    `);

    el.querySelector("#uploadName").addEventListener("input", (e) => { state.name = e.target.value; });
    el.querySelector("#uploadAccess").addEventListener("change", (e) => { state.viewAccess = e.target.value; });
    el.querySelector("#uploadBack").addEventListener("click", () => {
      if (state.parsed.type === "csv") state.step = "map-columns";
      else if (state.file.size > LARGE_FILE_THRESHOLD) state.step = "tile-consent";
      else state.step = "drop";
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
        if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; }
      }
    });

    return el;
  }

  // ── Step 5: Uploading ───────────────────────────────────────────────────────

  function renderUploading() {
    return html(`
      <div class="upload-step upload-step-uploading">
        <p class="upload-uploading-label">Uploading…</p>
        <div class="upload-progress-track">
          <div class="upload-progress-bar" style="width:0%"></div>
        </div>
        <p class="upload-progress-label">0%</p>
      </div>
    `);
  }

  // ── Step 6: Done ────────────────────────────────────────────────────────────

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
      state = { step: "drop", file: null, parsed: null, mapping: null, features: null, usePmtiles: false, name: "", viewAccess: "unlisted" };
      render();
    });
    el.querySelector("#uploadClose").addEventListener("click", () => closePanel());
    return el;
  }

  // ── Panel chrome ────────────────────────────────────────────────────────────

  function closePanel() {
    panel.classList.remove("is-open");
  }

  panel.querySelector(".upload-panel-close").addEventListener("click", closePanel);

  render();

  return {
    open({ parentId } = {}) {
      panel.classList.add("is-open");
      state = { step: "drop", file: null, parsed: null, mapping: null, features: null, usePmtiles: false, name: "", viewAccess: "unlisted", parentId: parentId ?? null };
      render();
    },
    close: closePanel,
  };
}

// ─── Panel shell HTML ─────────────────────────────────────────────────────────

function createPanel() {
  return html(`
    <div class="upload-panel" id="uploadPanel">
      <div class="upload-panel-inner">
        <div class="upload-panel-header">
          <span class="upload-panel-title">Add layer</span>
          <button class="upload-panel-close" aria-label="Close">✕</button>
        </div>
        <div class="upload-panel-content"></div>
      </div>
    </div>
  `);
}

function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}
