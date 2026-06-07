import { closeOpenSelect, createCustomSelect } from "./shared/custom-select.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugifyVariableId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getNumericValueStats(values) {
  const numbers = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) {
    return null;
  }
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

const OPERATOR_PARTS = ["lt", "eq", "gt"];
const OPERATOR_LABELS = {
  lt: "<",
  eq: "=",
  gt: ">",
};

function getOperatorParts(operator) {
  switch (operator) {
    case "<":
      return ["lt"];
    case "<=":
      return ["lt", "eq"];
    case ">":
      return ["gt"];
    case ">=":
      return ["eq", "gt"];
    case "!=":
      return ["lt", "gt"];
    case "all":
      return ["lt", "eq", "gt"];
    case "==":
    case "=":
    default:
      return ["eq"];
  }
}

function getOperatorFromParts(parts = []) {
  const selected = OPERATOR_PARTS.filter((part) => parts.includes(part));
  if (!selected.length) return "==";
  if (selected.length === 3) return "all";
  if (selected.includes("lt") && selected.includes("eq")) return "<=";
  if (selected.includes("eq") && selected.includes("gt")) return ">=";
  if (selected.includes("lt") && selected.includes("gt")) return "!=";
  if (selected.includes("lt")) return "<";
  if (selected.includes("gt")) return ">";
  return "==";
}

function toggleOperatorPart(operator, part) {
  const parts = getOperatorParts(operator);
  const nextParts = parts.includes(part)
    ? parts.filter((entry) => entry !== part)
    : [...parts, part];
  return getOperatorFromParts(nextParts.length ? nextParts : [part]);
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

function createDefaultState(overrides = {}) {
  return {
    panelMode: "create",
    editFilter: null,
    layerId: "",
    layerName: "",
    parentRowId: "",
    valueFilterExpression: null,
    filterLabel: "",
    fields: [],
    columnName: "",
    values: [],
    valuesLoading: false,
    value: "",
    filterOperator: "==",
    filterMode: "fixed",
    variableControlType: "slider",
    variableLabel: "Year",
    variableId: "year",
    variableMin: "",
    variableMax: "",
    variableStep: "1",
    variableDefault: "",
    loading: false,
    saving: false,
    error: "",
    ...overrides,
  };
}

function mountFilterPanel({ getLayerFields, getLayerFieldValues, onCreateFilter, onUpdateFilter }) {
  const panel = createPanelShell();
  document.body.appendChild(panel);

  let state = createDefaultState();

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
    const modeLocked = state.panelMode === "edit";
    const isVariableMode = state.filterMode === "variable";
    const operatorParts = getOperatorParts(state.filterOperator);
    const valueStats = getNumericValueStats(state.values);
    const variableMin = state.variableMin || (valueStats ? String(valueStats.min) : "0");
    const variableMax = state.variableMax || (valueStats ? String(valueStats.max) : "100");
    const variableDefault = state.variableDefault || (valueStats ? String(valueStats.min) : "0");
    const title = state.panelMode === "edit" ? "Edit filter" : "Add filter";
    const submitLabel = state.panelMode === "edit" ? "Save filter" : "Add filter";

    panel.querySelector(".clp-title").textContent = title;

    content.innerHTML = `
      <form class="filter-panel-form">
        <label class="clp-field">
          <span class="clp-field-label">Label</span>
          <input class="clp-field-input filter-panel-label" type="text" value="${escapeHtml(state.filterLabel)}" placeholder="Filter label" ${state.saving ? "disabled" : ""} />
        </label>
        <div class="clp-mode-selector" role="radiogroup" aria-label="Filter type">
          <button class="clp-mode-option filter-panel-mode-option ${state.filterMode === "fixed" ? "is-selected" : ""}" type="button" data-filter-mode="fixed" aria-pressed="${state.filterMode === "fixed"}" ${modeLocked ? "disabled" : ""}>Fixed</button>
          <button class="clp-mode-option filter-panel-mode-option ${state.filterMode === "variable" ? "is-selected" : ""}" type="button" data-filter-mode="variable" aria-pressed="${state.filterMode === "variable"}" ${modeLocked ? "disabled" : ""}>Variable</button>
        </div>
        ${isVariableMode ? `
          <label class="clp-field">
            <span class="clp-field-label">Control</span>
            <select class="clp-field-input filter-panel-variable-control" ${controlsDisabled ? "disabled" : ""}>
              <option value="slider" ${state.variableControlType === "slider" ? "selected" : ""}>Slider</option>
              <option value="dropdown" ${state.variableControlType === "dropdown" ? "selected" : ""}>Dropdown</option>
            </select>
          </label>
        ` : ""}
        <div class="clp-field">
          <span class="clp-field-label">Column</span>
          <div class="filter-panel-select-combo">
            <div class="clp-field-input filter-panel-column-display" aria-hidden="true">
              <span>${escapeHtml(state.columnName || (state.loading ? "Loading columns..." : "Column"))}</span>
            </div>
            <button class="filter-panel-select-menu-btn" type="button" aria-label="Choose column" title="Choose column" aria-haspopup="listbox" ${controlsDisabled ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="clp-field">
          <span class="clp-field-label">Compare</span>
          <div class="filter-panel-operator-row" role="group" aria-label="Comparison">
            ${OPERATOR_PARTS.map((part) => `
              <button class="filter-panel-operator-btn ${operatorParts.includes(part) ? "is-selected" : ""}" type="button" data-filter-operator-part="${part}" aria-pressed="${operatorParts.includes(part)}" ${controlsDisabled ? "disabled" : ""}>${OPERATOR_LABELS[part]}</button>
            `).join("")}
          </div>
        </div>
        ${!isVariableMode ? `<div class="clp-field">
          <span class="clp-field-label">Value</span>
          <div class="filter-panel-value-combo">
            <input class="clp-field-input filter-panel-value filter-panel-value-input" type="text" value="${escapeHtml(state.value)}" placeholder="Value" ${controlsDisabled ? "disabled" : ""} />
            <button class="filter-panel-value-menu-btn" type="button" aria-label="Choose existing value" title="Choose existing value" aria-haspopup="listbox" ${controlsDisabled || state.valuesLoading || !state.values.length ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
          </div>
        </div>` : ""}
        ${isVariableMode ? `
          <label class="clp-field">
            <span class="clp-field-label">Variable</span>
            <input class="clp-field-input filter-panel-variable-id" type="text" value="${escapeHtml(state.variableId)}" placeholder="year" ${controlsDisabled ? "disabled" : ""} />
          </label>
          ${state.variableControlType === "slider" ? `
            <div class="arp-field-row">
              <label class="clp-field">
                <span class="clp-field-label">Min</span>
                <input class="clp-field-input filter-panel-variable-min" type="number" value="${escapeHtml(variableMin)}" ${controlsDisabled ? "disabled" : ""} />
              </label>
              <label class="clp-field">
                <span class="clp-field-label">Max</span>
                <input class="clp-field-input filter-panel-variable-max" type="number" value="${escapeHtml(variableMax)}" ${controlsDisabled ? "disabled" : ""} />
              </label>
            </div>
            <div class="arp-field-row">
              <label class="clp-field">
                <span class="clp-field-label">Step</span>
                <input class="clp-field-input filter-panel-variable-step" type="number" value="${escapeHtml(state.variableStep)}" ${controlsDisabled ? "disabled" : ""} />
              </label>
              <label class="clp-field">
                <span class="clp-field-label">Default</span>
                <input class="clp-field-input filter-panel-variable-default" type="number" value="${escapeHtml(variableDefault)}" ${controlsDisabled ? "disabled" : ""} />
              </label>
            </div>
          ` : `
            <div class="clp-field">
              <span class="clp-field-label">Options</span>
              <div class="clp-field-input filter-panel-value" aria-hidden="true">
                <span>${state.valuesLoading ? "Loading values..." : `${state.values.length} values from column`}</span>
              </div>
            </div>
          `}
        ` : ""}
        ${state.error ? `<p class="upload-error">${escapeHtml(state.error)}</p>` : ""}
        <div class="upload-actions">
          <button class="upload-btn upload-btn-secondary filter-panel-cancel" type="button">Cancel</button>
          <button class="upload-btn upload-btn-primary" type="submit" ${controlsDisabled ? "disabled" : ""}>${submitLabel}</button>
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
    content.querySelector(".filter-panel-select-menu-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openColumnSelect();
    });

    const openValueSelect = () => {
      const anchor = content.querySelector(".filter-panel-value-combo");
      if (!anchor || controlsDisabled || state.valuesLoading || !state.values.length || isVariableMode) {
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
    content.querySelector(".filter-panel-value-input")?.addEventListener("input", (event) => {
      closeOpenSelect();
      state.value = event.target.value;
    });
    content.querySelector(".filter-panel-label")?.addEventListener("input", (event) => {
      state.filterLabel = event.target.value;
    });
    content.querySelector(".filter-panel-select-menu-btn")?.addEventListener("keydown", (event) => {
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
    content.querySelectorAll(".filter-panel-operator-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.filterOperator = toggleOperatorPart(state.filterOperator, button.dataset.filterOperatorPart);
        state.error = "";
        render();
      });
    });
    content.querySelectorAll(".filter-panel-mode-option").forEach((button) => {
      button.addEventListener("click", () => {
        if (modeLocked) {
          return;
        }
        state.filterMode = button.dataset.filterMode === "variable" ? "variable" : "fixed";
        if (state.filterMode === "variable") {
          state.variableLabel = state.variableLabel || "Year";
          state.variableId = state.variableId || "year";
        }
        state.error = "";
        render();
        if (state.columnName) {
          void loadValues();
        }
      });
    });
    content.querySelector(".filter-panel-variable-control")?.addEventListener("change", (event) => {
      state.variableControlType = event.target.value === "dropdown" ? "dropdown" : "slider";
      state.error = "";
      render();
      if (state.columnName) {
        void loadValues();
      }
    });
    content.querySelector(".filter-panel-cancel")?.addEventListener("click", close);
    content.querySelector(".filter-panel-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.filterLabel = content.querySelector(".filter-panel-label")?.value ?? state.filterLabel;
      state.variableId = content.querySelector(".filter-panel-variable-id")?.value ?? state.variableId;
      state.variableMin = content.querySelector(".filter-panel-variable-min")?.value ?? state.variableMin;
      state.variableMax = content.querySelector(".filter-panel-variable-max")?.value ?? state.variableMax;
      state.variableStep = content.querySelector(".filter-panel-variable-step")?.value ?? state.variableStep;
      state.variableDefault = content.querySelector(".filter-panel-variable-default")?.value ?? state.variableDefault;
      const columnName = String(state.columnName ?? "").trim();
      const filterLabel = String(state.filterLabel ?? "").trim();
      if (!columnName) {
        state.error = "Choose a column.";
        render();
        return;
      }
      if (state.filterMode === "variable" && state.variableControlType === "dropdown" && !state.values.length) {
        state.error = "No dropdown values found.";
        render();
        return;
      }
      const variableId = slugifyVariableId(state.variableId || filterLabel || state.variableLabel);
      if (state.filterMode === "variable" && !variableId) {
        state.error = "Variable is required.";
        render();
        return;
      }
      if (!columnName && state.filterMode !== "variable") {
        state.error = "Choose a column.";
        render();
        return;
      }

      state.saving = true;
      state.error = "";
      render();
      try {
        const payload = {
          layerId: state.layerId,
          parentRowId: state.parentRowId,
          label: filterLabel,
          columnName,
          value: state.value,
          op: state.filterOperator,
          mode: state.filterMode,
          variableConfig: state.filterMode === "variable" ? {
            controlType: state.variableControlType,
            label: filterLabel || state.variableLabel || "Variable",
            variableId,
            min: Number(state.variableMin || variableMin),
            max: Number(state.variableMax || variableMax),
            step: Number(state.variableStep) || 1,
            initialValue: state.variableControlType === "dropdown"
              ? String(state.values[0] ?? "")
              : Number(state.variableDefault || variableDefault),
            options: state.values.map((optionValue) => ({
              label: optionValue === "" ? "Empty value" : String(optionValue),
              value: String(optionValue),
            })),
            filterLabel: filterLabel || `${columnName} variable`,
            combinator: "all",
            conditions: [{ field: columnName, op: state.filterOperator, valueRef: variableId }],
          } : null,
        };
        if (state.panelMode === "edit") {
          await onUpdateFilter?.({
            ...payload,
            editFilter: state.editFilter,
          });
        } else {
          await onCreateFilter?.(payload);
        }
        close();
      } catch (error) {
        state.error = error?.message ?? (state.panelMode === "edit" ? "Failed to save filter." : "Failed to add filter.");
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
      const fields = await getLayerFields?.(state.layerId, getLoaderContext());
      state.fields = Array.isArray(fields) ? fields : [];
      state.columnName = state.fields.includes(state.columnName)
        ? state.columnName
        : state.fields[0] ?? "";
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
      requestAnimationFrame(() => panel.querySelector(".filter-panel-select-menu-btn, .filter-panel-value-menu-btn")?.focus());
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
      const values = await getLayerFieldValues?.(state.layerId, columnName, getLoaderContext());
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
    open({ layerId = "", layerName = "", parentRowId = "", valueFilterExpression = null } = {}) {
      state = createDefaultState({
        layerId,
        layerName,
        parentRowId,
        valueFilterExpression,
      });
      panel.classList.add("is-open");
      render();
      void loadFields();
    },
    edit({ layerId = "", layerName = "", parentRowId = "", filter = null, valueFilterExpression = null } = {}) {
      const mode = filter?.mode === "variable" ? "variable" : "fixed";
      state = createDefaultState({
        panelMode: "edit",
        editFilter: filter,
        layerId,
        layerName,
        parentRowId,
        valueFilterExpression,
        filterLabel: filter?.label ?? filter?.variableLabel ?? "",
        columnName: filter?.columnName ?? "",
        value: filter?.value ?? "",
        filterOperator: filter?.op ?? "==",
        filterMode: mode,
        variableControlType: filter?.variableControlType === "dropdown" ? "dropdown" : "slider",
        variableLabel: filter?.variableLabel ?? "Year",
        variableId: filter?.variableId ?? "year",
        variableMin: filter?.variableMin ?? "",
        variableMax: filter?.variableMax ?? "",
        variableStep: filter?.variableStep ?? "1",
        variableDefault: filter?.variableDefault ?? "",
      });
      panel.classList.add("is-open");
      render();
      void loadFields();
    },
    close,
  };

  function getLoaderContext() {
    return {
      parentRowId: state.parentRowId,
      valueFilterExpression: state.valueFilterExpression,
      editFilter: state.editFilter,
      panelMode: state.panelMode,
    };
  }
}

export { mountFilterPanel };
