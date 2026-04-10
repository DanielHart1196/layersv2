function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === "") {
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

function createPanelShell() {
  const root = document.createElement("div");
  root.className = "dtp-panel";
  root.innerHTML = `
    <div class="dtp-inner" role="dialog" aria-modal="true" aria-label="Layer data">
      <div class="dtp-header">
        <div class="dtp-title-wrap">
          <div class="dtp-eyebrow">Data</div>
          <div class="dtp-title">Dataset</div>
        </div>
        <button class="dtp-close" type="button" aria-label="Close data panel">×</button>
      </div>
      <div class="dtp-content"></div>
    </div>
  `;
  return root;
}

export function mountDataTablePanel({ loadTablePreview }) {
  const panel = createPanelShell();
  document.body.appendChild(panel);

  let state = {
    layerId: null,
    layerName: "",
    offset: 0,
    limit: 50,
    loading: false,
    error: "",
    rows: [],
    fields: [],
    hasMore: false,
  };

  function close() {
    panel.classList.remove("is-open");
  }

  async function loadPage(offset = 0) {
    if (!state.layerId) {
      return;
    }

    state.loading = true;
    state.error = "";
    state.offset = Math.max(0, offset);
    render();

    try {
      const result = await loadTablePreview(state.layerId, { limit: state.limit, offset: state.offset });
      state.rows = result?.rows ?? [];
      state.fields = result?.fields ?? [];
      state.hasMore = Boolean(result?.hasMore);
      state.offset = result?.offset ?? state.offset;
    } catch (error) {
      state.error = error?.message ?? "Failed to load data.";
      state.rows = [];
      state.fields = [];
      state.hasMore = false;
    } finally {
      state.loading = false;
      render();
    }
  }

  function renderTable() {
    if (state.loading) {
      return `<div class="dtp-empty">Loading rows…</div>`;
    }

    if (state.error) {
      return `<div class="dtp-empty">${escapeHtml(state.error)}</div>`;
    }

    if (!state.rows.length || !state.fields.length) {
      return `<div class="dtp-empty">No rows to show yet.</div>`;
    }

    const head = state.fields.map((field) => `<th>${escapeHtml(field.label ?? field.key ?? "")}</th>`).join("");
    const body = state.rows.map((row) => {
      const cells = state.fields.map((field) => {
        let value = "";
        const key = field?.key ?? "";
        if (key === "id") {
          value = row.id;
        } else if (key === "valid_from" || key === "valid_to") {
          value = row[key] ?? "";
        } else {
          value = row.properties?.[key] ?? "";
        }
        const rendered = formatCellValue(value);
        return `<td title="${escapeHtml(rendered)}">${escapeHtml(rendered)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    return `
      <div class="dtp-table-wrap">
        <table class="dtp-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function render() {
    panel.querySelector(".dtp-title").textContent = state.layerName || "Dataset";
    const content = panel.querySelector(".dtp-content");
    const start = state.rows.length ? state.offset + 1 : 0;
    const end = state.offset + state.rows.length;
    const rangeLabel = state.loading ? "Loading…" : state.rows.length ? `${start}-${end}` : "0 rows";

    content.innerHTML = `
      <div class="dtp-toolbar">
        <div class="dtp-range">Rows ${escapeHtml(rangeLabel)}</div>
        <div class="dtp-actions">
          <button class="dtp-nav" type="button" data-dir="prev" ${state.loading || state.offset === 0 ? "disabled" : ""}>Previous</button>
          <button class="dtp-nav" type="button" data-dir="next" ${state.loading || !state.hasMore ? "disabled" : ""}>Next</button>
        </div>
      </div>
      ${renderTable()}
    `;

    content.querySelector("[data-dir=prev]")?.addEventListener("click", () => {
      void loadPage(Math.max(0, state.offset - state.limit));
    });
    content.querySelector("[data-dir=next]")?.addEventListener("click", () => {
      void loadPage(state.offset + state.limit);
    });
  }

  panel.querySelector(".dtp-close")?.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      close();
    }
  });

  return {
    open({ layerId, layerName }) {
      state.layerId = layerId;
      state.layerName = layerName ?? "Dataset";
      state.offset = 0;
      state.error = "";
      state.rows = [];
      state.fields = [];
      state.hasMore = false;
      panel.classList.add("is-open");
      render();
      void loadPage(0);
    },
    close,
  };
}
