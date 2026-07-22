import { closeOpenSelect, createCustomSelect } from "./shared/custom-select.js";
import { DATASET_FILTER_FIELD, DATASET_FILTER_LABEL } from "../core/filter-expressions.js";

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
    .map((value) => Number(getOptionValue(value)))
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) {
    return null;
  }
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

function getOptionValue(option) {
  return typeof option === "object" && option !== null ? option.value : option;
}

function getOptionLabel(option) {
  return typeof option === "object" && option !== null ? option.label : option;
}

function normalizeOptions(options = []) {
  return (Array.isArray(options) ? options : [])
    .map((option) => {
      const value = String(getOptionValue(option) ?? "");
      const label = String(getOptionLabel(option) ?? value);
      return value ? { value, label } : null;
    })
    .filter(Boolean);
}

function getSelectedOptionLabel(options = [], value = "") {
  const selected = normalizeOptions(options).find((option) => String(option.value) === String(value));
  return selected?.label ?? String(value ?? "");
}

function getResolvedOptionLabel(options = [], value = "") {
  return normalizeOptions(options).find((option) => String(option.value) === String(value))?.label ?? "";
}

function formatColumnLabel(columnName, fields = []) {
  if (columnName === DATASET_FILTER_FIELD) {
    return DATASET_FILTER_LABEL;
  }
  return getSelectedOptionLabel(fields, columnName) || columnName;
}

function formatValueLabel(value, values = []) {
  if (value === "") {
    return "Empty value";
  }
  return getSelectedOptionLabel(values, value) || String(value ?? "");
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
    secondConditionEnabled: false,
    secondColumnName: "",
    secondValues: [],
    secondValuesLoading: false,
    secondValue: "",
    secondFilterOperator: "==",
    conditionCombinator: "all",
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

function normalizeEditConditions(filter = null) {
  const conditions = Array.isArray(filter?.conditions) && filter.conditions.length
    ? filter.conditions
    : [{ field: filter?.columnName ?? "", op: filter?.op ?? "==", value: filter?.value ?? "", valueRef: filter?.variableId ?? "" }];
  return conditions.slice(0, 2).map((condition) => ({
    field: String(condition?.field ?? ""),
    op: condition?.op ?? "==",
    value: condition?.value ?? "",
  }));
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
    const secondOperatorParts = getOperatorParts(state.secondFilterOperator);
    const valueStats = getNumericValueStats(state.values);
    const variableMin = state.variableMin || (valueStats ? String(valueStats.min) : "0");
    const variableMax = state.variableMax || (valueStats ? String(valueStats.max) : "100");
    const variableDefault = state.variableDefault || (valueStats ? String(valueStats.min) : "0");
    const title = state.panelMode === "edit" ? "Edit filter" : "Add filter";
    const submitLabel = state.panelMode === "edit" ? "Save filter" : "Add filter";
    const columnLabel = formatColumnLabel(state.columnName, state.fields);
    const secondColumnLabel = formatColumnLabel(state.secondColumnName, state.fields);
    const isDatasetColumn = state.columnName === DATASET_FILTER_FIELD;
    const isSecondDatasetColumn = state.secondColumnName === DATASET_FILTER_FIELD;
    const displayedValue = isDatasetColumn
      ? (state.valuesLoading ? "Loading values..." : getResolvedOptionLabel(state.values, state.value))
      : state.value;
    const secondDisplayedValue = isSecondDatasetColumn
      ? (state.secondValuesLoading ? "Loading values..." : getResolvedOptionLabel(state.secondValues, state.secondValue))
      : state.secondValue;

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
        <div class="filter-panel-condition" data-condition-index="0">
        <div class="clp-field">
          <span class="clp-field-label">Column</span>
          <div class="filter-panel-select-combo" data-condition-index="0">
            <div class="clp-field-input filter-panel-column-display" aria-hidden="true">
              <span>${escapeHtml(columnLabel || (state.loading ? "Loading columns..." : "Column"))}</span>
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
          <div class="filter-panel-operator-row" role="group" aria-label="Comparison" data-condition-index="0">
            ${OPERATOR_PARTS.map((part) => `
              <button class="filter-panel-operator-btn ${operatorParts.includes(part) ? "is-selected" : ""}" type="button" data-filter-operator-part="${part}" aria-pressed="${operatorParts.includes(part)}" ${controlsDisabled ? "disabled" : ""}>${OPERATOR_LABELS[part]}</button>
            `).join("")}
          </div>
        </div>
        ${!isVariableMode ? `<div class="clp-field">
          <span class="clp-field-label">Value</span>
          <div class="filter-panel-value-combo" data-condition-index="0">
            <input class="clp-field-input filter-panel-value filter-panel-value-input" type="text" value="${escapeHtml(displayedValue)}" placeholder="Value" ${controlsDisabled ? "disabled" : ""} ${isDatasetColumn ? "readonly" : ""} />
            <button class="filter-panel-value-menu-btn" type="button" aria-label="Choose existing value" title="Choose existing value" aria-haspopup="listbox" ${controlsDisabled || state.valuesLoading || !state.values.length ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
          </div>
        </div>` : ""}
        </div>
        ${state.secondConditionEnabled ? `
          <div class="filter-panel-condition-join" role="radiogroup" aria-label="Condition join">
            <button class="clp-mode-option filter-panel-combinator-option ${state.conditionCombinator === "all" ? "is-selected" : ""}" type="button" data-filter-combinator="all" aria-pressed="${state.conditionCombinator === "all"}" ${controlsDisabled ? "disabled" : ""}>And</button>
            <button class="clp-mode-option filter-panel-combinator-option ${state.conditionCombinator === "any" ? "is-selected" : ""}" type="button" data-filter-combinator="any" aria-pressed="${state.conditionCombinator === "any"}" ${controlsDisabled ? "disabled" : ""}>Or</button>
          </div>
          <div class="filter-panel-condition" data-condition-index="1">
            <div class="clp-field">
              <span class="clp-field-label">Column</span>
              <div class="filter-panel-select-combo" data-condition-index="1">
                <div class="clp-field-input filter-panel-column-display" aria-hidden="true">
                  <span>${escapeHtml(secondColumnLabel || (state.loading ? "Loading columns..." : "Column"))}</span>
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
              <div class="filter-panel-operator-row" role="group" aria-label="Comparison" data-condition-index="1">
                ${OPERATOR_PARTS.map((part) => `
                  <button class="filter-panel-operator-btn ${secondOperatorParts.includes(part) ? "is-selected" : ""}" type="button" data-filter-operator-part="${part}" aria-pressed="${secondOperatorParts.includes(part)}" ${controlsDisabled ? "disabled" : ""}>${OPERATOR_LABELS[part]}</button>
                `).join("")}
              </div>
            </div>
            ${!isVariableMode ? `<div class="clp-field">
              <span class="clp-field-label">Value</span>
              <div class="filter-panel-value-combo" data-condition-index="1">
                <input class="clp-field-input filter-panel-value filter-panel-value-input" type="text" value="${escapeHtml(secondDisplayedValue)}" placeholder="Value" ${controlsDisabled ? "disabled" : ""} ${isSecondDatasetColumn ? "readonly" : ""} />
                <button class="filter-panel-value-menu-btn" type="button" aria-label="Choose existing value" title="Choose existing value" aria-haspopup="listbox" ${controlsDisabled || state.secondValuesLoading || !state.secondValues.length ? "disabled" : ""}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M6 9l6 6 6-6"></path>
                  </svg>
                </button>
              </div>
            </div>` : ""}
          </div>
        ` : ""}
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
          <button class="upload-btn upload-btn-secondary filter-panel-add-condition" type="button" ${controlsDisabled ? "disabled" : ""}>${state.secondConditionEnabled ? "Remove condition" : "Add condition"}</button>
          <button class="upload-btn upload-btn-secondary filter-panel-cancel" type="button">Cancel</button>
          <button class="upload-btn upload-btn-primary" type="submit" ${controlsDisabled ? "disabled" : ""}>${submitLabel}</button>
        </div>
      </form>
    `;

    const openColumnSelect = () => {
      const anchor = content.querySelector('.filter-panel-select-combo[data-condition-index="0"]');
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
    const openSecondColumnSelect = () => {
      const anchor = content.querySelector('.filter-panel-select-combo[data-condition-index="1"]');
      if (!anchor || controlsDisabled || !state.secondConditionEnabled) {
        return;
      }
      createCustomSelect({
        anchor,
        options: state.fields,
        value: state.secondColumnName,
        label: "Choose column",
        onSelect(nextValue) {
          state.secondColumnName = String(nextValue ?? "");
          state.secondValue = "";
          render();
          void loadSecondValues();
        },
      });
    };
    content.querySelectorAll(".filter-panel-select-menu-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = button.closest(".filter-panel-select-combo")?.dataset.conditionIndex;
        if (index === "1") {
          openSecondColumnSelect();
        } else {
          openColumnSelect();
        }
      });
    });

    const openValueSelect = () => {
      const anchor = content.querySelector('.filter-panel-value-combo[data-condition-index="0"]');
      if (!anchor || controlsDisabled || state.valuesLoading || !state.values.length || isVariableMode) {
        return;
      }
      createCustomSelect({
        anchor,
        options: state.values.map((value) => ({
          value: getOptionValue(value),
          label: getOptionValue(value) === "" ? "Empty value" : getOptionLabel(value),
        })),
        value: state.value,
        label: "Choose existing value",
        onSelect(nextValue) {
          state.value = String(nextValue ?? "");
          render();
        },
      });
    };
    const openSecondValueSelect = () => {
      const anchor = content.querySelector('.filter-panel-value-combo[data-condition-index="1"]');
      if (!anchor || controlsDisabled || state.secondValuesLoading || !state.secondValues.length || isVariableMode || !state.secondConditionEnabled) {
        return;
      }
      createCustomSelect({
        anchor,
        options: state.secondValues.map((value) => ({
          value: getOptionValue(value),
          label: getOptionValue(value) === "" ? "Empty value" : getOptionLabel(value),
        })),
        value: state.secondValue,
        label: "Choose existing value",
        onSelect(nextValue) {
          state.secondValue = String(nextValue ?? "");
          render();
        },
      });
    };
    content.querySelectorAll(".filter-panel-value-menu-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = button.closest(".filter-panel-value-combo")?.dataset.conditionIndex;
        if (index === "1") {
          openSecondValueSelect();
        } else {
          openValueSelect();
        }
      });
    });
    content.querySelectorAll(".filter-panel-value-input").forEach((input) => {
      input.addEventListener("input", (event) => {
        const index = input.closest(".filter-panel-value-combo")?.dataset.conditionIndex;
        if (index === "1") {
          if (isSecondDatasetColumn) {
            event.target.value = getResolvedOptionLabel(state.secondValues, state.secondValue);
            return;
          }
          closeOpenSelect();
          state.secondValue = event.target.value;
          return;
        }
        if (isDatasetColumn) {
          event.target.value = getResolvedOptionLabel(state.values, state.value);
          return;
        }
        closeOpenSelect();
        state.value = event.target.value;
      });
    });
    content.querySelector(".filter-panel-label")?.addEventListener("input", (event) => {
      state.filterLabel = event.target.value;
    });
    content.querySelectorAll(".filter-panel-select-menu-btn").forEach((button) => {
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        const index = button.closest(".filter-panel-select-combo")?.dataset.conditionIndex;
        if (index === "1") {
          openSecondColumnSelect();
        } else {
          openColumnSelect();
        }
      });
    });
    content.querySelectorAll(".filter-panel-value-menu-btn").forEach((button) => {
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        const index = button.closest(".filter-panel-value-combo")?.dataset.conditionIndex;
        if (index === "1") {
          openSecondValueSelect();
        } else {
          openValueSelect();
        }
      });
    });
    content.querySelectorAll(".filter-panel-operator-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const index = button.closest(".filter-panel-operator-row")?.dataset.conditionIndex;
        if (index === "1") {
          state.secondFilterOperator = toggleOperatorPart(state.secondFilterOperator, button.dataset.filterOperatorPart);
        } else {
          state.filterOperator = toggleOperatorPart(state.filterOperator, button.dataset.filterOperatorPart);
        }
        state.error = "";
        render();
      });
    });
    content.querySelectorAll(".filter-panel-combinator-option").forEach((button) => {
      button.addEventListener("click", () => {
        state.conditionCombinator = button.dataset.filterCombinator === "any" ? "any" : "all";
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
    content.querySelector(".filter-panel-add-condition")?.addEventListener("click", () => {
      state.secondConditionEnabled = !state.secondConditionEnabled;
      if (state.secondConditionEnabled && !state.secondColumnName) {
        state.secondColumnName = state.fields.find((field) => field.value !== state.columnName)?.value ?? state.columnName;
      }
      if (!state.secondConditionEnabled) {
        state.secondValue = "";
        state.secondValues = [];
        state.secondValuesLoading = false;
      }
      state.error = "";
      render();
      if (state.secondConditionEnabled && state.secondColumnName) {
        void loadSecondValues();
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
      const secondColumnName = state.secondConditionEnabled ? String(state.secondColumnName ?? "").trim() : "";
      const filterLabel = String(state.filterLabel ?? "").trim();
      const columnLabel = formatColumnLabel(columnName, state.fields);
      const valueLabel = formatValueLabel(state.value, state.values);
      const secondColumnLabel = formatColumnLabel(secondColumnName, state.fields);
      const secondValueLabel = formatValueLabel(state.secondValue, state.secondValues);
      if (!columnName) {
        state.error = "Choose a column.";
        render();
        return;
      }
      if (state.secondConditionEnabled && !secondColumnName) {
        state.error = "Choose a column for the second condition.";
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
        const conditions = [
          state.filterMode === "variable"
            ? { field: columnName, op: state.filterOperator, valueRef: variableId }
            : { field: columnName, op: state.filterOperator, value: state.value },
          ...(state.secondConditionEnabled ? [
            state.filterMode === "variable"
              ? { field: secondColumnName, op: state.secondFilterOperator, valueRef: variableId }
              : { field: secondColumnName, op: state.secondFilterOperator, value: state.secondValue },
          ] : []),
        ];
        const payload = {
          layerId: state.layerId,
          parentRowId: state.parentRowId,
          label: filterLabel,
          columnLabel,
          valueLabel,
          secondColumnLabel,
          secondValueLabel,
          columnName,
          value: state.value,
          op: state.filterOperator,
          conditions,
          combinator: state.conditionCombinator,
          mode: state.filterMode,
          variableConfig: state.filterMode === "variable" ? {
            controlType: state.variableControlType,
            label: filterLabel || state.variableLabel || "Variable",
            variableId,
            min: Number(state.variableMin || variableMin),
            max: Number(state.variableMax || variableMax),
            step: Number(state.variableStep) || 1,
            initialValue: state.variableControlType === "dropdown"
              ? String(getOptionValue(state.values[0]) ?? "")
              : Number(state.variableDefault || variableDefault),
            options: state.values.map((optionValue) => ({
              label: getOptionValue(optionValue) === "" ? "Empty value" : String(getOptionLabel(optionValue)),
              value: String(getOptionValue(optionValue) ?? ""),
            })),
            filterLabel: filterLabel || `${columnLabel} variable`,
            combinator: state.conditionCombinator,
            conditions,
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
      state.fields = normalizeOptions(fields);
      const fieldValues = state.fields.map((field) => field.value);
      state.columnName = fieldValues.includes(state.columnName)
        ? state.columnName
        : state.fields[0]?.value ?? "";
      if (state.secondConditionEnabled) {
        state.secondColumnName = fieldValues.includes(state.secondColumnName)
          ? state.secondColumnName
          : state.fields.find((field) => field.value !== state.columnName)?.value ?? state.columnName;
      }
      if (!state.fields.length) {
        state.error = "No filterable columns found.";
      }
      if (state.columnName) {
        void loadValues();
      }
      if (state.secondConditionEnabled && state.secondColumnName) {
        void loadSecondValues();
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

  let secondValueRequestId = 0;
  async function loadSecondValues() {
    const requestId = secondValueRequestId + 1;
    secondValueRequestId = requestId;
    const columnName = state.secondColumnName;
    if (!columnName) {
      state.secondValues = [];
      state.secondValuesLoading = false;
      render();
      return;
    }

    state.secondValues = [];
    state.secondValuesLoading = true;
    render();
    try {
      const values = await getLayerFieldValues?.(state.layerId, columnName, getLoaderContext());
      if (requestId !== secondValueRequestId) {
        return;
      }
      state.secondValues = Array.isArray(values) ? values : [];
    } finally {
      if (requestId === secondValueRequestId) {
        state.secondValuesLoading = false;
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
      const conditions = normalizeEditConditions(filter);
      const firstCondition = conditions[0] ?? {};
      const secondCondition = conditions[1] ?? {};
      state = createDefaultState({
        panelMode: "edit",
        editFilter: filter,
        layerId,
        layerName,
        parentRowId,
        valueFilterExpression,
        filterLabel: filter?.label ?? filter?.variableLabel ?? "",
        columnName: firstCondition.field ?? "",
        value: firstCondition.value ?? "",
        filterOperator: firstCondition.op ?? "==",
        secondConditionEnabled: conditions.length > 1,
        secondColumnName: secondCondition.field ?? "",
        secondValue: secondCondition.value ?? "",
        secondFilterOperator: secondCondition.op ?? "==",
        conditionCombinator: filter?.combinator === "any" ? "any" : "all",
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
