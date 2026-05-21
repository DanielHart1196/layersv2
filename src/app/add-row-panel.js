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

function createPanelShell() {
  const panel = document.createElement("div");
  panel.className = "arp-panel";
  panel.innerHTML = `
    <div class="arp-inner" role="dialog" aria-modal="true" aria-label="Add row">
      <div class="arp-header">
        <span class="arp-title">Add row</span>
        <button class="arp-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="arp-content"></div>
    </div>
  `;
  document.body.append(panel);
  return panel;
}

function normalizeChoiceOptions(raw) {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [labelPart, valuePart] = line.split("=").map((part) => part?.trim());
      const label = labelPart || valuePart || "";
      const value = valuePart || slugifyVariableId(label) || label;
      return { label, value };
    })
    .filter((option) => option.label && option.value);
}

function renderForm(state) {
  const isChoice = state.mode === "choice";
  return `
    <form class="arp-form">
      <label class="arp-field">
        <span class="arp-field-label">Type</span>
        <select class="arp-select arp-mode">
          <option value="number" ${state.mode === "number" ? "selected" : ""}>Number slider</option>
          <option value="choice" ${isChoice ? "selected" : ""}>Choice slider</option>
        </select>
      </label>
      <label class="arp-field">
        <span class="arp-field-label">Label</span>
        <input class="arp-field-input arp-label" type="text" value="${escapeHtml(state.label)}" placeholder="Year" />
      </label>
      <label class="arp-field">
        <span class="arp-field-label">Variable</span>
        <input class="arp-field-input arp-variable" type="text" value="${escapeHtml(state.variableId)}" placeholder="year" />
      </label>
      ${isChoice ? `
        <label class="arp-field">
          <span class="arp-field-label">Choices</span>
          <textarea class="arp-field-input arp-choice-options" rows="5" placeholder="Low = low&#10;High = high">${escapeHtml(state.choiceOptions)}</textarea>
        </label>
      ` : `
        <div class="arp-field-row">
          <label class="arp-field">
            <span class="arp-field-label">Min</span>
            <input class="arp-field-input arp-min" type="number" value="${escapeHtml(state.min)}" />
          </label>
          <label class="arp-field">
            <span class="arp-field-label">Max</span>
            <input class="arp-field-input arp-max" type="number" value="${escapeHtml(state.max)}" />
          </label>
        </div>
        <div class="arp-field-row">
          <label class="arp-field">
            <span class="arp-field-label">Step</span>
            <input class="arp-field-input arp-step" type="number" value="${escapeHtml(state.step)}" />
          </label>
          <label class="arp-field">
            <span class="arp-field-label">Default</span>
            <input class="arp-field-input arp-default" type="number" value="${escapeHtml(state.initialValue)}" />
          </label>
        </div>
      `}
      <p class="arp-error" ${state.error ? "" : "hidden"}>${escapeHtml(state.error)}</p>
      <div class="arp-actions">
        <button class="arp-btn arp-btn-secondary arp-cancel" type="button">Cancel</button>
        <button class="arp-btn arp-btn-primary" type="submit">Add slider</button>
      </div>
    </form>
  `;
}

function mountAddRowPanel({ onCreateRow }) {
  const panel = createPanelShell();
  const content = panel.querySelector(".arp-content");
  let state = {
    parentId: null,
    mode: "number",
    label: "Slider",
    variableId: "slider",
    min: "0",
    max: "100",
    step: "1",
    initialValue: "50",
    choiceOptions: "First = first\nSecond = second",
    error: "",
  };

  function close() {
    panel.classList.remove("is-open");
  }

  function updateFromDom() {
    state.mode = content.querySelector(".arp-mode")?.value ?? state.mode;
    state.label = content.querySelector(".arp-label")?.value ?? state.label;
    state.variableId = content.querySelector(".arp-variable")?.value ?? state.variableId;
    state.min = content.querySelector(".arp-min")?.value ?? state.min;
    state.max = content.querySelector(".arp-max")?.value ?? state.max;
    state.step = content.querySelector(".arp-step")?.value ?? state.step;
    state.initialValue = content.querySelector(".arp-default")?.value ?? state.initialValue;
    state.choiceOptions = content.querySelector(".arp-choice-options")?.value ?? state.choiceOptions;
  }

  function render() {
    content.innerHTML = renderForm(state);
    content.querySelector(".arp-mode")?.addEventListener("change", () => {
      updateFromDom();
      state.error = "";
      render();
    });
    content.querySelector(".arp-cancel")?.addEventListener("click", close);
    content.querySelector(".arp-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      updateFromDom();
      const label = state.label.trim() || "Slider";
      const variableId = slugifyVariableId(state.variableId || label);
      if (!variableId) {
        state.error = "Variable is required.";
        render();
        return;
      }

      if (state.mode === "choice") {
        const options = normalizeChoiceOptions(state.choiceOptions);
        if (options.length < 2) {
          state.error = "Add at least two choices.";
          render();
          return;
        }
        onCreateRow?.({
          parentId: state.parentId,
          rowType: "choice-slider",
          config: {
            label,
            variableId,
            options,
            initialValue: options[0]?.value,
          },
        });
        close();
        return;
      }

      onCreateRow?.({
        parentId: state.parentId,
        rowType: "slider",
        config: {
          label,
          variableId,
          min: Number(state.min),
          max: Number(state.max),
          step: Number(state.step),
          initialValue: Number(state.initialValue),
        },
      });
      close();
    });
  }

  panel.querySelector(".arp-close")?.addEventListener("click", close);
  panel.addEventListener("click", close);
  panel.querySelector(".arp-inner")?.addEventListener("click", (event) => event.stopPropagation());

  return {
    open({ parentId }) {
      state = {
        parentId,
        mode: "number",
        label: "Slider",
        variableId: "slider",
        min: "0",
        max: "100",
        step: "1",
        initialValue: "50",
        choiceOptions: "First = first\nSecond = second",
        error: "",
      };
      render();
      panel.classList.add("is-open");
      requestAnimationFrame(() => content.querySelector(".arp-label")?.focus());
    },
    close,
  };
}

export { mountAddRowPanel };
