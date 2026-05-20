import { closeOpenSelect, createCustomSelect } from "./shared/custom-select.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createPanelShell() {
  const template = document.createElement("template");
  template.innerHTML = `
    <div class="clp-panel filter-panel">
      <div class="clp-inner filter-panel-inner">
        <div class="clp-header">
          <span class="clp-title">Add filter</span>
          <button class="clp-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="clp-content"></div>
      </div>
    </div>
  `.trim();
  return template.content.firstElementChild;
}

function mountFilterPanel({ getLayerFields, getLayerFieldValues, onCreateFilter }) {
  const panel = createPanelShell();
  document.body.appendChild(panel);

  let state = {
    layerId: "",
    layerName: "",
    fields: [],
    columnName: "",
    values: [],
    valuesLoading: false,
    value: "",
    loading: false,
    saving: false,
    error: "",
  };

  function close() {
    closeOpenSelect();
    panel.classList.remove("is-open");
  }

  function render() {
    const content = panel.querySelector(".clp-content");
    if (!content) {
      return;
    }

    const controlsDisabled = state.loading || state.saving || !state.fields.length;

    content.innerHTML = `
      <form class="filter-panel-form">
        <label class="clp-field">
          <span class="clp-field-label">Column</span>
          <div class="filter-panel-select-combo">
            <button class="clp-field-input filter-panel-column-display" type="button" aria-haspopup="listbox" ${controlsDisabled ? "disabled" : ""}>
              <span>${escapeHtml(state.columnName || (state.loading ? "Loading columns..." : "Column"))}</span>
            </button>
            <button class="filter-panel-select-menu-btn" type="button" tabindex="-1" aria-hidden="true" ${controlsDisabled ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
          </div>
        </label>
        <label class="clp-field">
          <span class="clp-field-label">Equals</span>
          <div class="filter-panel-value-combo">
            <input class="clp-field-input filter-panel-value" type="text" value="${escapeHtml(state.value)}" placeholder="Value" ${controlsDisabled ? "disabled" : ""} />
            <button class="filter-panel-value-menu-btn" type="button" aria-label="Choose existing value" title="Choose existing value" aria-haspopup="listbox" ${controlsDisabled || state.valuesLoading || !state.values.length ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
          </div>
        </label>
        ${state.error ? `<p class="upload-error">${escapeHtml(state.error)}</p>` : ""}
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary filter-panel-cancel" type="button">Cancel</button>
          <button class="upload-btn upload-btn-primary" type="submit" ${controlsDisabled ? "disabled" : ""}>Add filter</button>
        </div>
      </form>
    `;

    const openColumnSelect = () => {
      const anchor = content.querySelector(".filter-panel-select-combo");
      if (!anchor || controlsDisabled) {
        return;
      }
      createCustomSelect({
        anchor,
        options: state.fields,
        value: state.columnName,
        label: "Choose column",
        onSelect(nextValue) {
          state.columnName = String(nextValue ?? "");
          state.value = "";
          render();
          void loadValues();
        },
      });
    };
    content.querySelector(".filter-panel-select-combo")?.addEventListener("click", openColumnSelect);

    const openValueSelect = () => {
      const anchor = content.querySelector(".filter-panel-value-combo");
      if (!anchor || controlsDisabled || state.valuesLoading || !state.values.length) {
        return;
      }
      createCustomSelect({
        anchor,
        options: state.values.map((value) => ({
          value,
          label: value === "" ? "Empty value" : value,
        })),
        value: state.value,
        label: "Choose existing value",
        onSelect(nextValue) {
          state.value = String(nextValue ?? "");
          render();
        },
      });
    };
    content.querySelector(".filter-panel-value-menu-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openValueSelect();
    });
    content.querySelector(".filter-panel-column-display")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openColumnSelect();
    });
    content.querySelector(".filter-panel-value-menu-btn")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openValueSelect();
    });
    content.querySelector(".filter-panel-value")?.addEventListener("input", (event) => {
      closeOpenSelect();
      state.value = event.target.value;
    });
    content.querySelector(".filter-panel-cancel")?.addEventListener("click", close);
    content.querySelector(".filter-panel-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const columnName = String(state.columnName ?? "").trim();
      if (!columnName) {
        state.error = "Choose a column.";
        render();
        return;
      }

      state.saving = true;
      state.error = "";
      render();
      try {
        await onCreateFilter?.({
          layerId: state.layerId,
          columnName,
          value: state.value,
        });
        close();
      } catch (error) {
        state.error = error?.message ?? "Failed to add filter.";
      } finally {
        state.saving = false;
        render();
      }
    });
  }

  async function loadFields() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const fields = await getLayerFields?.(state.layerId);
      state.fields = Array.isArray(fields) ? fields : [];
      state.columnName = state.fields[0] ?? "";
      if (!state.fields.length) {
        state.error = "No filterable columns found.";
      }
      if (state.columnName) {
        void loadValues();
      }
    } catch (error) {
      state.fields = [];
      state.columnName = "";
      state.error = error?.message ?? "Failed to load columns.";
    } finally {
      state.loading = false;
      render();
      requestAnimationFrame(() => panel.querySelector(".filter-panel-column-display, .filter-panel-value")?.focus());
    }
  }

  let valueRequestId = 0;
  async function loadValues() {
    const requestId = valueRequestId + 1;
    valueRequestId = requestId;
    const columnName = state.columnName;
    if (!columnName) {
      state.values = [];
      state.valuesLoading = false;
      render();
      return;
    }

    state.values = [];
    state.valuesLoading = true;
    render();
    try {
      const values = await getLayerFieldValues?.(state.layerId, columnName);
      if (requestId !== valueRequestId) {
        return;
      }
      state.values = Array.isArray(values) ? values : [];
    } finally {
      if (requestId === valueRequestId) {
        state.valuesLoading = false;
        render();
      }
    }
  }

  panel.querySelector(".clp-close")?.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      close();
    }
  });
  panel.querySelector(".clp-inner")?.addEventListener("click", (event) => event.stopPropagation());

  return {
    open({ layerId = "", layerName = "" } = {}) {
      state = {
        layerId,
        layerName,
        fields: [],
        columnName: "",
        values: [],
        valuesLoading: false,
        value: "",
        loading: false,
        saving: false,
        error: "",
      };
      panel.classList.add("is-open");
      render();
      void loadFields();
    },
    close,
  };
}

export { mountFilterPanel };
