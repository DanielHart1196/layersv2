import { getLayerCatalogByGroup, getFullCatalogByGroup } from "../core/layer-catalog.js";

// ─── Mount ────────────────────────────────────────────────────────────────────

export function mountAddRowPanel({ onAddLayer, onAddRow, onUploadRequested, getFieldsForParent, getValuesForParentField }) {
  const panel = createPanelShell();
  document.body.appendChild(panel);

  let state = {
    depth: 0,
    parentId: null,
    // "type-picker" | "data-form" | "filter-form" | "sort-form"
    screen: "data-form",
  };

  function render() {
    const content = panel.querySelector(".arp-content");
    const title   = panel.querySelector(".arp-title");
    content.innerHTML = "";

    if (state.screen === "type-picker") {
      title.textContent = "Add row";
      content.append(renderTypePicker());
    } else if (state.screen === "data-form") {
      title.textContent = state.depth === 0 ? "Add layer" : "Add data row";
      content.append(renderDataForm());
    } else if (state.screen === "filter-form") {
      title.textContent = "Add filter";
      content.append(renderFilterForm());
    } else if (state.screen === "sort-form") {
      title.textContent = "Add sort";
      content.append(renderSortForm());
    }
  }

  function open({ depth, parentId }) {
    state = {
      depth,
      parentId,
      screen: depth === 0 ? "data-form" : "type-picker",
    };
    panel.classList.add("is-open");
    render();
    // Focus name input if present
    requestAnimationFrame(() => panel.querySelector(".arp-name-input")?.focus());
  }

  function close() {
    panel.classList.remove("is-open");
  }

  // ── Type picker (depth > 0) ────────────────────────────────────────────────

  function renderTypePicker() {
    const el = html(`
      <div class="arp-type-picker">
        <button class="arp-type-item" data-type="data">
          <span class="arp-type-label">Data / Layer</span>
          <span class="arp-type-sub">Point to a dataset</span>
        </button>
        <button class="arp-type-item" data-type="filter">
          <span class="arp-type-label">Filter</span>
          <span class="arp-type-sub">Show a subset of a layer</span>
        </button>
        <button class="arp-type-item" data-type="sort">
          <span class="arp-type-label">Sort</span>
          <span class="arp-type-sub">Order features by a field</span>
        </button>
        <div class="arp-type-divider">Style</div>
        <button class="arp-type-item arp-type-item-inline" data-type="fill">Fill</button>
        <button class="arp-type-item arp-type-item-inline" data-type="line">Line</button>
        <button class="arp-type-item arp-type-item-inline" data-type="point">Point</button>
      </div>
    `);

    el.querySelectorAll(".arp-type-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        if (type === "data") {
          state.screen = "data-form";
          render();
        } else if (type === "filter") {
          state.screen = "filter-form";
          render();
        } else if (type === "sort") {
          state.screen = "sort-form";
          render();
        } else {
          // fill / line / slider — instant, no form needed
          close();
          onAddRow({ parentId: state.parentId, rowType: type });
        }
      });
    });

    return el;
  }

  // ── Data form ──────────────────────────────────────────────────────────────

  function renderDataForm() {
    const isSubRow = state.depth > 0;

    const el = html(`
      <div class="arp-form">
        <label class="arp-field">
          <span class="arp-field-label">Name</span>
          <input class="arp-field-input arp-name-input" type="text"
            placeholder="${isSubRow ? "Row name" : "Layer name"}" />
        </label>
        <div class="arp-field">
          <span class="arp-field-label">Source</span>
          <div class="arp-radio-group">
            <label class="arp-radio">
              <input type="radio" name="arpSource" value="upload" checked />
              <span>Upload file</span>
            </label>
            <label class="arp-radio">
              <input type="radio" name="arpSource" value="catalog" />
              <span>Existing layer</span>
            </label>
          </div>
        </div>
        <div class="arp-source-section" id="arpCatalogSection">
          <select class="arp-select" id="arpLayerSelect">
            <option value="">Select a layer…</option>
            ${buildOptionGroups(getLayerCatalogByGroup())}
          </select>
        </div>
        <div class="arp-source-section" id="arpUploadSection">
          <div class="upload-dropzone" id="arpUploadDropzone">
            <p class="upload-dropzone-hint">Drop a file or click to browse</p>
            <p class="upload-dropzone-formats">CSV  |  XLSX  |  GeoJSON  |  JSON  |  GPX  |  KML  |  ZIP</p>
            <input type="file" class="upload-file-input" id="arpUploadInput" accept=".csv,.xlsx,.geojson,.json,.gpx,.kml,.zip" />
          </div>
        </div>
        <p class="arp-error" hidden></p>
        <div class="arp-actions">
          ${isSubRow
            ? `<button class="arp-btn arp-btn-secondary" id="arpBack">Back</button>`
            : `<button class="arp-btn arp-btn-secondary" id="arpCancel">Cancel</button>`}
          <button class="arp-btn arp-btn-primary" id="arpSubmit">
            ${isSubRow ? "Add row" : "Add layer"}
          </button>
        </div>
      </div>
    `);

    const catalogSection = el.querySelector("#arpCatalogSection");
    const uploadSection  = el.querySelector("#arpUploadSection");
    const submitBtn      = el.querySelector("#arpSubmit");
    const errorEl        = el.querySelector(".arp-error");
    const uploadZone     = el.querySelector("#arpUploadDropzone");
    const uploadInput    = el.querySelector("#arpUploadInput");

    catalogSection.hidden = true;
    uploadSection.hidden = false;
    submitBtn.textContent = "Continue to upload";

    el.querySelectorAll("input[name=arpSource]").forEach((radio) => {
      radio.addEventListener("change", () => {
        const val = el.querySelector("input[name=arpSource]:checked")?.value;
        catalogSection.hidden = val !== "catalog";
        uploadSection.hidden  = val !== "upload";
        submitBtn.textContent = val === "upload"
          ? "Continue to upload"
          : (isSubRow ? "Add row" : "Add layer");
      });
    });

    function requestUpload(file = null) {
      const name = el.querySelector(".arp-name-input").value.trim();
      close();
      onUploadRequested({ parentId: state.parentId, name, file });
    }

    uploadZone?.addEventListener("click", () => uploadInput?.click());
    uploadInput?.addEventListener("click", (event) => event.stopPropagation());
    uploadZone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadZone.classList.add("is-over");
    });
    uploadZone?.addEventListener("dragleave", () => uploadZone.classList.remove("is-over"));
    uploadZone?.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadZone.classList.remove("is-over");
      const file = event.dataTransfer?.files?.[0] ?? null;
      if (file) requestUpload(file);
    });
    uploadInput?.addEventListener("change", () => {
      const file = uploadInput.files?.[0] ?? null;
      if (file) requestUpload(file);
    });

    el.querySelector("#arpBack")?.addEventListener("click", () => {
      state.screen = "type-picker";
      render();
    });
    el.querySelector("#arpCancel")?.addEventListener("click", close);

    el.querySelector("#arpSubmit").addEventListener("click", () => {
      const name   = el.querySelector(".arp-name-input").value.trim();
      const source = el.querySelector("input[name=arpSource]:checked")?.value;

      if (source === "catalog") {
        const layerRef = el.querySelector("#arpLayerSelect").value;
        if (!layerRef) {
          errorEl.textContent = "Select a layer.";
          errorEl.hidden = false;
          return;
        }
        const selectedOption = el.querySelector(`#arpLayerSelect option[value="${layerRef}"]`);
        const fallbackLabel = selectedOption?.textContent ?? layerRef;
        const geometryType = selectedOption?.dataset.geometryType ?? "mixed";
        close();
        onAddLayer({ parentId: state.parentId, name: name || fallbackLabel, layerRef, geometryType });
      } else {
        requestUpload();
      }
    });

    // Async upgrade: swap in full catalog (local + Supabase) once it arrives.
    getFullCatalogByGroup().then((fullCatalog) => {
      const select = el.querySelector("#arpLayerSelect");
      if (!select) return; // panel already closed
      const currentValue = select.value;
      select.innerHTML = `<option value="">Select a layer…</option>` + buildOptionGroups(fullCatalog);
      if (currentValue) select.value = currentValue; // restore selection if user already picked
    });

    return el;
  }

  function buildOptionGroups(catalogByGroup) {
    return Object.entries(catalogByGroup)
      .map(([group, entries]) => `
        <optgroup label="${group}">
          ${entries.map((e) => `<option value="${e.id}" data-geometry-type="${e.geometryType ?? "mixed"}">${e.label}</option>`).join("")}
        </optgroup>
      `).join("");
  }

  // ── Filter form ────────────────────────────────────────────────────────────

  function renderFilterForm() {
    const el = html(`
      <div class="arp-form">
        <label class="arp-field">
          <span class="arp-field-label">Name</span>
          <input class="arp-field-input arp-name-input" type="text" placeholder="Filter name" />
        </label>
        <div class="arp-field">
          <span class="arp-field-label">Field</span>
          <div id="arpFieldWrap"><input class="arp-field-input" id="arpField" type="text" placeholder="Loading fields…" disabled /></div>
        </div>
        <label class="arp-field">
          <span class="arp-field-label">Operator</span>
          <select class="arp-select" id="arpOp">
            <option value="==">equals</option>
            <option value="!=">does not equal</option>
            <option value=">">greater than</option>
            <option value="<">less than</option>
            <option value=">=">≥</option>
            <option value="<=">≤</option>
          </select>
        </label>
        <div class="arp-field">
          <span class="arp-field-label">Value</span>
          <div id="arpValueWrap"><input class="arp-field-input" id="arpValue" type="text" placeholder="value" /></div>
        </div>
        <p class="arp-error" hidden></p>
        <div class="arp-actions">
          <button class="arp-btn arp-btn-secondary" id="arpBack">Back</button>
          <button class="arp-btn arp-btn-primary" id="arpSubmit">Add filter</button>
        </div>
      </div>
    `);

    populateFieldPicker(el, state.parentId, (field) => {
      populateValuePicker(el, state.parentId, field);
    });

    el.querySelector("#arpBack").addEventListener("click", () => {
      state.screen = "type-picker";
      render();
    });

    el.querySelector("#arpSubmit").addEventListener("click", () => {
      const errorEl = el.querySelector(".arp-error");
      const name    = el.querySelector(".arp-name-input").value.trim();
      const field   = getFieldValue(el);
      const op      = el.querySelector("#arpOp").value;
      const value   = el.querySelector("#arpValue").value.trim();
      if (!field) {
        errorEl.textContent = "Field is required.";
        errorEl.hidden = false;
        return;
      }
      close();
      onAddRow({ parentId: state.parentId, rowType: "filter", config: { name, field, op, value } });
    });

    return el;
  }

  // ── Sort form ──────────────────────────────────────────────────────────────

  function renderSortForm() {
    const el = html(`
      <div class="arp-form">
        <label class="arp-field">
          <span class="arp-field-label">Name</span>
          <input class="arp-field-input arp-name-input" type="text" placeholder="Sort name" />
        </label>
        <div class="arp-field">
          <span class="arp-field-label">Field</span>
          <div id="arpFieldWrap"><input class="arp-field-input" id="arpField" type="text" placeholder="Loading fields…" disabled /></div>
        </div>
        <label class="arp-field">
          <span class="arp-field-label">Direction</span>
          <select class="arp-select" id="arpDir">
            <option value="asc">Ascending (A → Z, 0 → 9)</option>
            <option value="desc">Descending (Z → A, 9 → 0)</option>
          </select>
        </label>
        <p class="arp-error" hidden></p>
        <div class="arp-actions">
          <button class="arp-btn arp-btn-secondary" id="arpBack">Back</button>
          <button class="arp-btn arp-btn-primary" id="arpSubmit">Add sort</button>
        </div>
      </div>
    `);

    populateFieldPicker(el, state.parentId);

    el.querySelector("#arpBack").addEventListener("click", () => {
      state.screen = "type-picker";
      render();
    });

    el.querySelector("#arpSubmit").addEventListener("click", () => {
      const errorEl = el.querySelector(".arp-error");
      const name    = el.querySelector(".arp-name-input").value.trim();
      const field   = getFieldValue(el);
      const dir     = el.querySelector("#arpDir").value;
      if (!field) {
        errorEl.textContent = "Field is required.";
        errorEl.hidden = false;
        return;
      }
      close();
      onAddRow({ parentId: state.parentId, rowType: "sort", config: { name, field, direction: dir } });
    });

    return el;
  }

  // ── Field picker helpers ───────────────────────────────────────────────────

  function getFieldValue(el) {
    const sel = el.querySelector("#arpField[tagName=SELECT], select#arpField");
    const input = el.querySelector("#arpField");
    return (input?.value ?? "").trim();
  }

  function populateFieldPicker(el, parentId, onFieldChange) {
    if (!getFieldsForParent) {
      const input = el.querySelector("#arpField");
      input.placeholder = "property name";
      input.disabled = false;
      if (onFieldChange) input.addEventListener("change", () => onFieldChange(input.value));
      return;
    }

    getFieldsForParent(parentId).then((fields) => {
      const wrap = el.querySelector("#arpFieldWrap");
      if (!wrap) return;

      if (!fields || fields.length === 0) {
        const input = el.querySelector("#arpField");
        input.placeholder = "property name";
        input.disabled = false;
        if (onFieldChange) input.addEventListener("change", () => onFieldChange(input.value));
        return;
      }

      wrap.innerHTML = "";
      const select = document.createElement("select");
      select.className = "arp-select";
      select.id = "arpField";
      select.innerHTML = `<option value="">Select a field…</option>` +
        fields.map((f) => `<option value="${f}">${f}</option>`).join("");
      if (onFieldChange) {
        select.addEventListener("change", () => onFieldChange(select.value));
      }
      wrap.append(select);
    });
  }

  function populateValuePicker(el, parentId, field) {
    const wrap = el.querySelector("#arpValueWrap");
    if (!wrap) return;

    if (!field || !getValuesForParentField) return;

    // Reset to loading state
    wrap.innerHTML = `<input class="arp-field-input" id="arpValue" type="text" placeholder="Loading values…" disabled />`;

    getValuesForParentField(parentId, field).then((values) => {
      if (!wrap.isConnected) return;

      if (!values || values.length === 0) {
        wrap.innerHTML = `<input class="arp-field-input" id="arpValue" type="text" placeholder="value" />`;
        return;
      }

      wrap.innerHTML = "";
      const select = document.createElement("select");
      select.className = "arp-select";
      select.id = "arpValue";
      select.innerHTML = `<option value="">Select a value…</option>` +
        values.map((v) => `<option value="${v}">${v}</option>`).join("");
      wrap.append(select);
    });
  }

  panel.querySelector(".arp-close").addEventListener("click", close);
  // Dismiss on backdrop click, but don't let inner clicks bubble to document.
  panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
  panel.querySelector(".arp-inner").addEventListener("click", (e) => e.stopPropagation());

  return { open, close };
}

// ─── Shell HTML ───────────────────────────────────────────────────────────────

function createPanelShell() {
  return html(`
    <div class="arp-panel">
      <div class="arp-inner">
        <div class="arp-header">
          <span class="arp-title">Add layer</span>
          <button class="arp-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="arp-content"></div>
      </div>
    </div>
  `);
}

function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}
