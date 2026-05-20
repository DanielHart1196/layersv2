const INTERNAL_FIELD_PREFIX = "_";
const DEFAULT_TITLE_FIELDS = ["name", "Name", "label", "title"];

function formatLabel(key) {
  return String(key ?? "")
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeConfig(config = {}) {
  const source = config && typeof config === "object" ? config : {};
  return {
    titleField: String(source.titleField ?? ""),
    subtitleFields: Array.isArray(source.subtitleFields) ? source.subtitleFields.map(String).filter(Boolean) : [],
    hiddenFields: Array.isArray(source.hiddenFields) ? source.hiddenFields.map(String).filter(Boolean) : [],
    fieldOrder: Array.isArray(source.fieldOrder) ? source.fieldOrder.map(String).filter(Boolean) : [],
    labels: source.labels && typeof source.labels === "object" && !Array.isArray(source.labels)
      ? { ...source.labels }
      : {},
  };
}

function getProperties(feature) {
  return feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
}

function getFieldKeys(feature) {
  return Object.keys(getProperties(feature))
    .filter((key) => !key.startsWith(INTERNAL_FIELD_PREFIX))
    .sort((left, right) => left.localeCompare(right));
}

function getOrderedFieldKeys(feature, config) {
  const keys = getFieldKeys(feature);
  const keySet = new Set(keys);
  const hidden = new Set(config.hiddenFields);
  return [
    ...config.fieldOrder.filter((key) => keySet.has(key)),
    ...keys.filter((key) => !config.fieldOrder.includes(key)),
  ].filter((key) => !hidden.has(key));
}

function getTitle(feature, config) {
  const props = getProperties(feature);
  const configuredTitle = formatValue(props[config.titleField]);
  if (configuredTitle) {
    return configuredTitle;
  }
  const defaultField = DEFAULT_TITLE_FIELDS.find((key) => formatValue(props[key]));
  return formatValue(props[defaultField])
    || formatValue(props._dataset_name)
    || formatValue(feature?.featureId)
    || "Selected feature";
}

function getSubtitle(feature, config) {
  const props = getProperties(feature);
  const configured = config.subtitleFields
    .map((key) => formatValue(props[key]))
    .filter(Boolean);
  if (configured.length) {
    return configured.join(" - ");
  }
  return [feature?.geometryType, props._dataset_name].map(formatValue).filter(Boolean).join(" - ");
}

function createFieldSelect({ name, value, fields, includeBlank = true }) {
  const select = document.createElement("select");
  select.className = "feature-inspector-select";
  select.name = name;
  if (includeBlank) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default";
    select.append(option);
  }
  fields.forEach((field) => {
    const option = document.createElement("option");
    option.value = field;
    option.textContent = formatLabel(field);
    option.selected = field === value;
    select.append(option);
  });
  return select;
}

function createFeatureInspector() {
  const panel = document.createElement("aside");
  panel.className = "feature-inspector";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");
  document.body.appendChild(panel);

  let currentFeature = null;
  let currentConfig = normalizeConfig();
  let saveConfig = null;
  let applyConfigToLayer = null;
  let isEditing = false;
  let isSaving = false;
  let error = "";

  function close() {
    panel.hidden = true;
    currentFeature = null;
    saveConfig = null;
    applyConfigToLayer = null;
    isEditing = false;
    isSaving = false;
    error = "";
    panel.replaceChildren();
  }

  function renderView() {
    if (!currentFeature) {
      close();
      return;
    }
    const props = getProperties(currentFeature);
    const fieldKeys = getOrderedFieldKeys(currentFeature, currentConfig);

    panel.innerHTML = `
      <div class="feature-inspector-header">
        <div class="feature-inspector-heading">
          <p class="feature-inspector-eyebrow"></p>
          <h2 class="feature-inspector-title"></h2>
        </div>
        <div class="feature-inspector-actions">
          <button class="feature-inspector-icon-btn feature-inspector-edit" type="button" aria-label="Edit feature panel defaults" title="Edit feature panel defaults">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
          <button class="feature-inspector-icon-btn feature-inspector-close" type="button" aria-label="Close feature details" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </button>
        </div>
      </div>
      <p class="feature-inspector-subtitle"></p>
      <dl class="feature-inspector-fields"></dl>
    `;

    panel.querySelector(".feature-inspector-eyebrow").textContent = currentFeature.layerName || currentFeature.layerId || "Feature";
    panel.querySelector(".feature-inspector-title").textContent = getTitle(currentFeature, currentConfig);
    const subtitle = panel.querySelector(".feature-inspector-subtitle");
    subtitle.textContent = getSubtitle(currentFeature, currentConfig);
    subtitle.hidden = !subtitle.textContent;

    const fields = panel.querySelector(".feature-inspector-fields");
    fieldKeys.forEach((key) => {
      const value = formatValue(props[key]);
      if (!value) {
        return;
      }
      const dt = document.createElement("dt");
      dt.textContent = currentConfig.labels[key] || formatLabel(key);
      const dd = document.createElement("dd");
      dd.textContent = value;
      fields.append(dt, dd);
    });
    if (!fields.children.length) {
      const empty = document.createElement("dd");
      empty.className = "feature-inspector-empty";
      empty.textContent = "No visible feature properties";
      fields.append(empty);
    }

    panel.querySelector(".feature-inspector-edit")?.addEventListener("click", () => {
      isEditing = true;
      renderEditor();
    });
    panel.querySelector(".feature-inspector-close")?.addEventListener("click", close);
    panel.hidden = false;
  }

  function renderEditor() {
    if (!currentFeature) {
      close();
      return;
    }
    const fieldKeys = getFieldKeys(currentFeature);
    const hidden = new Set(currentConfig.hiddenFields);
    const subtitleFields = new Set(currentConfig.subtitleFields);
    const visibleOrder = [
      ...currentConfig.fieldOrder.filter((key) => fieldKeys.includes(key)),
      ...fieldKeys.filter((key) => !currentConfig.fieldOrder.includes(key)),
    ];

    panel.innerHTML = `
      <div class="feature-inspector-header">
        <div class="feature-inspector-heading">
          <p class="feature-inspector-eyebrow">Panel defaults</p>
          <h2 class="feature-inspector-title">Feature panel</h2>
        </div>
        <button class="feature-inspector-icon-btn feature-inspector-close" type="button" aria-label="Close feature details" title="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>
      <div class="feature-inspector-editor">
        <label class="feature-inspector-editor-field">
          <span>Title</span>
        </label>
        <div class="feature-inspector-editor-group" data-group="subtitle">
          <span class="feature-inspector-editor-label">Subtitle</span>
        </div>
        <div class="feature-inspector-editor-group" data-group="fields">
          <span class="feature-inspector-editor-label">Visible fields</span>
        </div>
        ${error ? `<p class="feature-inspector-error"></p>` : ""}
        <div class="feature-inspector-editor-actions">
          <button class="feature-inspector-text-btn feature-inspector-cancel" type="button" ${isSaving ? "disabled" : ""}>Cancel</button>
          <button class="feature-inspector-text-btn feature-inspector-save" type="button" ${isSaving || !saveConfig ? "disabled" : ""}>Save</button>
          <button class="feature-inspector-text-btn feature-inspector-apply-layer" type="button" ${isSaving || !applyConfigToLayer ? "disabled" : ""}>${isSaving ? "Saving..." : "Apply to layer"}</button>
        </div>
      </div>
    `;

    const titleField = panel.querySelector(".feature-inspector-editor-field");
    titleField?.append(createFieldSelect({
      name: "titleField",
      value: currentConfig.titleField,
      fields: fieldKeys,
    }));

    const subtitleGroup = panel.querySelector('[data-group="subtitle"]');
    fieldKeys.forEach((key) => {
      const label = document.createElement("label");
      label.className = "feature-inspector-check-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "subtitleFields";
      input.value = key;
      input.checked = subtitleFields.has(key);
      const text = document.createElement("span");
      text.textContent = formatLabel(key);
      label.append(input, text);
      subtitleGroup?.append(label);
    });

    const fieldsGroup = panel.querySelector('[data-group="fields"]');
    visibleOrder.forEach((key) => {
      const label = document.createElement("label");
      label.className = "feature-inspector-check-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "visibleFields";
      input.value = key;
      input.checked = !hidden.has(key);
      const text = document.createElement("span");
      text.textContent = formatLabel(key);
      label.append(input, text);
      fieldsGroup?.append(label);
    });
    const errorEl = panel.querySelector(".feature-inspector-error");
    if (errorEl) {
      errorEl.textContent = error;
    }

    panel.querySelector(".feature-inspector-cancel")?.addEventListener("click", () => {
      isEditing = false;
      error = "";
      renderView();
    });
    panel.querySelector(".feature-inspector-close")?.addEventListener("click", close);
    panel.querySelector(".feature-inspector-save")?.addEventListener("click", () => {
      void saveEditorConfig("dataset");
    });
    panel.querySelector(".feature-inspector-apply-layer")?.addEventListener("click", () => {
      void saveEditorConfig("layer");
    });
    panel.hidden = false;
  }

  async function saveEditorConfig(scope = "dataset") {
    const saveHandler = scope === "layer" ? applyConfigToLayer : saveConfig;
    if (!currentFeature || typeof saveHandler !== "function") {
      return;
    }
    const titleField = panel.querySelector('[name="titleField"]')?.value ?? "";
    const subtitleFields = [...panel.querySelectorAll('[name="subtitleFields"]:checked')].map((input) => input.value);
    const visibleFields = [...panel.querySelectorAll('[name="visibleFields"]:checked')].map((input) => input.value);
    const allFields = getFieldKeys(currentFeature);
    const hiddenFields = allFields.filter((key) => !visibleFields.includes(key));
    const nextConfig = normalizeConfig({
      ...currentConfig,
      titleField,
      subtitleFields,
      hiddenFields,
      fieldOrder: allFields,
    });

    isSaving = true;
    error = "";
    renderEditor();
    try {
      const savedConfig = await saveHandler(nextConfig);
      currentConfig = normalizeConfig(savedConfig ?? nextConfig);
      isEditing = false;
      renderView();
    } catch (saveError) {
      error = saveError?.message ?? "Failed to save panel defaults.";
      isSaving = false;
      renderEditor();
      return;
    }
    isSaving = false;
  }

  function open(feature = {}, { config = {}, onSaveConfig = null, onApplyConfigToLayer = null } = {}) {
    currentFeature = feature;
    currentConfig = normalizeConfig(config);
    saveConfig = onSaveConfig;
    applyConfigToLayer = onApplyConfigToLayer;
    isEditing = false;
    isSaving = false;
    error = "";
    renderView();
  }

  return {
    close,
    open,
  };
}

export { createFeatureInspector };
