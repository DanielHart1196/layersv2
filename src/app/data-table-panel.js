import { buildPreviewTableMarkup, bindPreviewTableInteractions } from "./shared/preview-table.js";

const PREVIEW_PAGE_SIZE = 50;
const INITIAL_LOAD_SIZE = 50;
const BACKGROUND_LOAD_SIZE = 200;
const MIN_PREVIEW_COLUMN_WIDTH = 96;
const PREVIEW_RESIZE_HIT_WIDTH = 8;
const PREVIEW_REORDER_HIT_HEIGHT = 10;
const PREVIEW_AUTO_SCROLL_EDGE = 28;
const PREVIEW_AUTO_SCROLL_MAX_SPEED = 18;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHexColor(value, fallback = "#122330") {
  const normalized = String(value ?? "").trim().replace(/^#*/, "");
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `#${normalized.toUpperCase()}`;
  }
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function getSettingsBackground(state) {
  const color = normalizeHexColor(state?.color, "#122330");
  const rgb = hexToRgb(color);
  const alpha = Math.max(0, Math.min(100, Number(state?.opacity) || 0)) / 100;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getPreviewHeaderBackground(state) {
  const color = normalizeHexColor(state?.color, "#122330");
  const rgb = hexToRgb(color);
  const darkenFactor = 0.45;
  return `rgba(${Math.round(rgb.r * darkenFactor)}, ${Math.round(rgb.g * darkenFactor)}, ${Math.round(rgb.b * darkenFactor)}, 0.96)`;
}

function createPanelShell() {
  const root = document.createElement("div");
  root.className = "clp-panel dtv-panel";
  root.innerHTML = `
    <div class="clp-inner dtv-inner is-preview-step" role="dialog" aria-modal="true" aria-label="Layer data view">
      <div class="clp-header">
        <div class="dtv-title-wrap">
          <div class="dtv-eyebrow">Data View</div>
          <div class="clp-title">Layer Data</div>
        </div>
        <button class="clp-close" type="button" aria-label="Close data view">&times;</button>
      </div>
      <div class="clp-content"></div>
    </div>
  `;
  return root;
}

function getComparablePreviewValue(value) {
  if (value === null || value === undefined) {
    return { kind: "empty", value: "" };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "number", value };
  }
  const text = String(value).trim();
  if (!text) {
    return { kind: "empty", value: "" };
  }
  const numericValue = Number(text);
  if (Number.isFinite(numericValue) && /^[-+]?\d*\.?\d+$/.test(text)) {
    return { kind: "number", value: numericValue };
  }
  const dateValue = Date.parse(text);
  if (Number.isFinite(dateValue) && /[-/:T]/.test(text)) {
    return { kind: "date", value: dateValue };
  }
  return { kind: "text", value: text.toLocaleLowerCase() };
}

function comparePreviewRows(leftRow, rightRow, columnName, direction) {
  const leftComparable = getComparablePreviewValue(leftRow?.[columnName]);
  const rightComparable = getComparablePreviewValue(rightRow?.[columnName]);

  if (leftComparable.kind === "empty" && rightComparable.kind !== "empty") return 1;
  if (rightComparable.kind === "empty" && leftComparable.kind !== "empty") return -1;

  let result = 0;
  if (leftComparable.kind === rightComparable.kind) {
    if (leftComparable.value < rightComparable.value) result = -1;
    else if (leftComparable.value > rightComparable.value) result = 1;
  } else {
    result = String(leftComparable.value).localeCompare(String(rightComparable.value), undefined, { numeric: true });
  }
  return direction === "desc" ? -result : result;
}

function renameObjectKey(target, fromKey, toKey) {
  if (!target || typeof target !== "object" || Array.isArray(target) || !fromKey || !toKey || fromKey === toKey) {
    return target;
  }
  return Object.fromEntries(Object.entries(target).map(([key, value]) => [key === fromKey ? toKey : key, value]));
}

export function mountDataTablePanel({ loadTablePreview, getAppearanceState, getLayerDatasets, onAddDataRequested }) {
  const panel = createPanelShell();
  document.body.appendChild(panel);

  let state = createInitialState();

  function createInitialState(overrides = {}) {
    return {
      layerId: "",
      layerName: "",
      editableLayerName: "",
      datasets: [],
      datasetsLoading: false,
      selectedDatasetId: "",
      loading: false,
      isBackgroundLoading: false,
      isFullyLoaded: false,
      error: "",
      allRows: [],
      rows: [],
      headers: [],
      rowCount: 0,
      totalRowCount: 0,
      columnCount: 0,
      previewSortColumn: "",
      previewSortDirection: "",
      renamingColumn: "",
      renameDraft: "",
      previewPageOffset: 0,
      previewScrollLeft: 0,
      previewScrollTop: 0,
      columnWidths: {},
      headerAliases: {},
      removedSourceHeaders: {},
      loadRequestId: 0,
      ...overrides,
    };
  }

  function applyPanelBackground() {
    const inner = panel.querySelector(".clp-inner");
    if (!inner) return;
    const settings = getAppearanceState?.()?.settings;
    inner.style.backgroundColor = getSettingsBackground(settings);
    inner.style.setProperty("--clp-settings-background", getSettingsBackground(settings));
    inner.style.setProperty("--clp-preview-header-background", getPreviewHeaderBackground(settings));
  }

  function findSourceHeaderForDisplay(displayHeader) {
    if (!displayHeader) return "";
    const aliases = Object.entries(state.headerAliases ?? {});
    const match = aliases.find(([, aliasedDisplay]) => aliasedDisplay === displayHeader);
    return match ? match[0] : displayHeader;
  }

  function getDisplayHeaderForSource(sourceHeader) {
    if (!sourceHeader) return "";
    const requestedDisplay = (state.headerAliases ?? {})[sourceHeader] || sourceHeader;
    const owningSource = findSourceHeaderForDisplay(requestedDisplay);
    if (owningSource && owningSource !== sourceHeader) {
      return sourceHeader;
    }
    return requestedDisplay;
  }

  function normalizeRowToCurrentHeaders(row) {
    return Object.fromEntries((state.headers ?? []).map((header) => [header, row?.[header] ?? ""]));
  }

  function getSelectedDataset() {
    return (state.datasets ?? []).find((dataset) => dataset?.id === state.selectedDatasetId) ?? null;
  }

  function syncPreviewPageRows() {
    const sortColumn = state.previewSortColumn;
    const sortDirection = state.previewSortDirection;
    const sourceRows = Array.isArray(state.allRows) ? state.allRows : [];
    const sortedRows = sortColumn && sortDirection
      ? [...sourceRows]
        .map((row, index) => ({ row, index }))
        .sort((left, right) => {
          const result = comparePreviewRows(left.row, right.row, sortColumn, sortDirection);
          return result || left.index - right.index;
        })
        .map(({ row }) => row)
      : sourceRows;

    const rowCount = Math.max(0, Number(state.rowCount) || 0);
    const maxOffset = rowCount > PREVIEW_PAGE_SIZE
      ? Math.floor((rowCount - 1) / PREVIEW_PAGE_SIZE) * PREVIEW_PAGE_SIZE
      : 0;
    state.previewPageOffset = Math.max(0, Math.min(maxOffset, state.previewPageOffset || 0));
    state.rows = sortedRows.slice(state.previewPageOffset, state.previewPageOffset + PREVIEW_PAGE_SIZE);
  }

  function togglePreviewSort(columnName) {
    if (!columnName || !state.isFullyLoaded) return;
    if (state.previewSortColumn !== columnName) {
      state.previewSortColumn = columnName;
      state.previewSortDirection = "asc";
    } else if (state.previewSortDirection === "asc") {
      state.previewSortDirection = "desc";
    } else if (state.previewSortDirection === "desc") {
      state.previewSortColumn = "";
      state.previewSortDirection = "";
    } else {
      state.previewSortDirection = "asc";
    }
    state.previewPageOffset = 0;
    syncPreviewPageRows();
    render();
  }

  function appendChunk(fields, rows, totalRowCount) {
    const removedSourceHeaders = state.removedSourceHeaders ?? {};
    const incomingHeaders = fields.map((field) => field.label ?? field.key).filter(Boolean);
    let headersChanged = false;

    incomingHeaders.forEach((sourceHeader) => {
      if (removedSourceHeaders[sourceHeader]) {
        return;
      }
      const displayHeader = getDisplayHeaderForSource(sourceHeader);
      if (!state.headers.includes(displayHeader)) {
        state.headers.push(displayHeader);
        headersChanged = true;
      }
    });

    if (headersChanged) {
      state.allRows = state.allRows.map((row) => normalizeRowToCurrentHeaders(row));
    }

    const mappedRows = rows.map((row) => {
      const mapped = {};
      fields.forEach((field) => {
        const key = field?.key ?? "";
        const sourceHeader = field?.label ?? key;
        if (!sourceHeader || removedSourceHeaders[sourceHeader]) {
          return;
        }
        const displayHeader = getDisplayHeaderForSource(sourceHeader);
        if (key === "valid_from" || key === "valid_to") mapped[displayHeader] = row[key] ?? "";
        else mapped[displayHeader] = row.properties?.[key] ?? "";
      });
      return normalizeRowToCurrentHeaders(mapped);
    });

    state.allRows = state.allRows.concat(mappedRows);
    state.rowCount = state.allRows.length;
    state.totalRowCount = Math.max(state.rowCount, Number(totalRowCount) || 0);
    state.columnCount = state.headers.length;
    state.isFullyLoaded = state.rowCount >= state.totalRowCount;
    syncPreviewPageRows();
  }

  function reorderPreviewColumn(columnName, targetIndex) {
    const headers = Array.isArray(state.headers) ? [...state.headers] : [];
    const currentIndex = headers.indexOf(columnName);
    if (currentIndex === -1) return;
    headers.splice(currentIndex, 1);
    headers.splice(Math.max(0, Math.min(targetIndex, headers.length)), 0, columnName);
    state.headers = headers;
    state.allRows = state.allRows.map((row) => Object.fromEntries(headers.map((header) => [header, row?.[header] ?? ""])));
    syncPreviewPageRows();
  }

  function removePreviewColumn(columnName) {
    if (!columnName) return;
    const headers = state.headers ?? [];
    if (!headers.includes(columnName)) return;
    state.headers = headers.filter((header) => header !== columnName);
    state.allRows = state.allRows.map((row) => {
      const nextRow = { ...row };
      delete nextRow[columnName];
      return nextRow;
    });
    const sourceHeader = findSourceHeaderForDisplay(columnName);
    if (sourceHeader) {
      state.removedSourceHeaders[sourceHeader] = true;
      delete state.headerAliases[sourceHeader];
    }
    delete state.columnWidths[columnName];
    if (state.previewSortColumn === columnName) {
      state.previewSortColumn = "";
      state.previewSortDirection = "";
    }
    state.columnCount = state.headers.length;
    syncPreviewPageRows();
    render();
  }

  function renamePreviewColumn(fromColumnName, rawNextColumnName) {
    const nextColumnName = String(rawNextColumnName ?? "").trim();
    if (!nextColumnName || nextColumnName === fromColumnName || state.headers.includes(nextColumnName)) {
      state.renamingColumn = "";
      state.renameDraft = "";
      render();
      return;
    }
    state.headers = state.headers.map((header) => (header === fromColumnName ? nextColumnName : header));
    state.allRows = state.allRows.map((row) => renameObjectKey(row, fromColumnName, nextColumnName));
    const sourceHeader = findSourceHeaderForDisplay(fromColumnName);
    if (sourceHeader) {
      state.headerAliases[sourceHeader] = nextColumnName;
    }
    if (Object.prototype.hasOwnProperty.call(state.columnWidths, fromColumnName)) {
      state.columnWidths[nextColumnName] = state.columnWidths[fromColumnName];
      delete state.columnWidths[fromColumnName];
    }
    if (state.previewSortColumn === fromColumnName) {
      state.previewSortColumn = nextColumnName;
    }
    state.renamingColumn = "";
    state.renameDraft = "";
    syncPreviewPageRows();
    render();
  }

  function getColumnWidths() {
    if (!state.columnWidths || typeof state.columnWidths !== "object") {
      state.columnWidths = {};
    }
    return state.columnWidths;
  }

  function setPreviewColumnWidth(previewEl, columnIndex, columnName, width) {
    const nextWidth = Math.max(MIN_PREVIEW_COLUMN_WIDTH, Math.round(width));
    getColumnWidths()[columnName] = nextWidth;
    previewEl.querySelectorAll(`[data-column-index="${columnIndex}"]`).forEach((cell) => {
      cell.style.width = `${nextWidth}px`;
      cell.style.minWidth = `${nextWidth}px`;
      cell.style.maxWidth = `${nextWidth}px`;
    });
  }

  function autosizePreviewColumn(previewEl, columnIndex, columnName) {
    const cells = [...previewEl.querySelectorAll(`[data-column-index="${columnIndex}"]`)];
    if (!cells.length) return;

    const measurementEl = document.createElement("span");
    measurementEl.style.position = "absolute";
    measurementEl.style.visibility = "hidden";
    measurementEl.style.pointerEvents = "none";
    measurementEl.style.whiteSpace = "nowrap";
    measurementEl.style.left = "-99999px";
    document.body.appendChild(measurementEl);

    let maxWidth = MIN_PREVIEW_COLUMN_WIDTH;
    cells.forEach((cell) => {
      const computed = window.getComputedStyle(cell);
      const headerContent = cell.querySelector(".clp-col-head");
      if (headerContent) {
        const headStyles = window.getComputedStyle(headerContent);
        const sortButton = headerContent.querySelector(".clp-col-sort");
        const removeButton = headerContent.querySelector(".clp-col-remove");
        const nameInput = headerContent.querySelector(".clp-col-name-input");
        const nameLabel = headerContent.querySelector(".clp-col-name");
        const nameSource = nameInput ?? nameLabel;

        let nameWidth = 0;
        if (nameSource) {
          const nameStyles = window.getComputedStyle(nameSource);
          measurementEl.style.font = nameStyles.font;
          measurementEl.style.letterSpacing = nameStyles.letterSpacing;
          measurementEl.textContent = nameInput ? (nameInput.value ?? "") : (nameSource.textContent ?? "");
          nameWidth = Math.ceil(measurementEl.getBoundingClientRect().width);
        }

        const sortWidth = sortButton ? Math.ceil(sortButton.getBoundingClientRect().width) : 0;
        const removeWidth = removeButton ? Math.ceil(removeButton.getBoundingClientRect().width) : 0;
        const horizontalPadding = (
          parseFloat(computed.paddingLeft || "0")
          + parseFloat(computed.paddingRight || "0")
          + parseFloat(computed.borderLeftWidth || "0")
          + parseFloat(computed.borderRightWidth || "0")
        );
        const gap = parseFloat(headStyles.columnGap || headStyles.gap || "0");
        maxWidth = Math.max(maxWidth, Math.ceil(nameWidth + sortWidth + removeWidth + horizontalPadding + (sortWidth ? gap : 0) + (removeWidth ? gap : 0)));
        return;
      }

      measurementEl.style.font = computed.font;
      measurementEl.style.letterSpacing = computed.letterSpacing;
      measurementEl.textContent = cell.textContent ?? "";
      const horizontalPadding = (
        parseFloat(computed.paddingLeft || "0")
        + parseFloat(computed.paddingRight || "0")
        + parseFloat(computed.borderLeftWidth || "0")
        + parseFloat(computed.borderRightWidth || "0")
      );
      maxWidth = Math.max(maxWidth, Math.ceil(measurementEl.getBoundingClientRect().width + horizontalPadding));
    });

    measurementEl.remove();
    setPreviewColumnWidth(previewEl, columnIndex, columnName, maxWidth);
  }

  function bindPreviewColumnResize(previewEl, headers) {
    const table = previewEl.querySelector(".upload-preview");
    const tableWrap = previewEl.querySelector(".clp-table-wrap");
    if (!table || !tableWrap || headers.length < 2) return;

    let activeResize = null;
    let activeReorder = null;
    let autoScrollFrame = 0;

    function clearTargets() {
      table.querySelectorAll(".is-col-resize-target, .is-col-reorder-target").forEach((cell) => {
        cell.classList.remove("is-col-resize-target", "is-col-reorder-target");
      });
    }

    function syncPreviewTable(previewHeaders = state.headers ?? []) {
      const headRow = previewEl.querySelector(".upload-preview thead tr");
      if (!headRow) return;
      const headCells = new Map([...headRow.children].map((cell) => [cell.dataset.columnKey, cell]));
      previewHeaders.forEach((header, index) => {
        const cell = headCells.get(header);
        if (!cell) return;
        cell.dataset.columnIndex = String(index);
        headRow.append(cell);
      });
      previewEl.querySelectorAll(".upload-preview tbody tr").forEach((row) => {
        const cells = new Map([...row.children].map((cell) => [cell.dataset.columnKey, cell]));
        previewHeaders.forEach((header, index) => {
          const cell = cells.get(header);
          if (!cell) return;
          cell.dataset.columnIndex = String(index);
          row.append(cell);
        });
      });
    }

    function updateActiveResizeWidth() {
      if (!activeResize) return;
      const nextWidth = activeResize.startWidth
        + (activeResize.currentX - activeResize.startX)
        + (tableWrap.scrollLeft - activeResize.startScrollLeft);
      setPreviewColumnWidth(previewEl, activeResize.columnIndex, activeResize.columnName, nextWidth);
    }

    function applyActiveReorderAtPointer(pointerX) {
      if (!activeReorder) return;
      const currentHeaders = state.headers ?? [];
      const currentIndex = currentHeaders.indexOf(activeReorder.columnName);
      if (currentIndex === -1) return;
      const currentHeader = table.querySelector(`th[data-column-key="${CSS.escape(activeReorder.columnName)}"]`);
      if (!currentHeader) return;
      const rect = currentHeader.getBoundingClientRect();
      let direction = null;
      if (pointerX < rect.left) direction = "left";
      else if (pointerX > rect.right) direction = "right";
      if (!direction) return;
      const nextIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= currentHeaders.length) return;
      reorderPreviewColumn(activeReorder.columnName, nextIndex);
      syncPreviewTable(state.headers);
    }

    function computeAutoScrollDelta() {
      const currentX = activeResize?.currentX ?? activeReorder?.currentX;
      if (!Number.isFinite(currentX)) return 0;
      const rect = tableWrap.getBoundingClientRect();
      const leftDistance = currentX - rect.left;
      const rightDistance = rect.right - currentX;
      const clampedLeftDistance = Math.max(0, Math.min(PREVIEW_AUTO_SCROLL_EDGE, leftDistance));
      const clampedRightDistance = Math.max(0, Math.min(PREVIEW_AUTO_SCROLL_EDGE, rightDistance));
      if (leftDistance < PREVIEW_AUTO_SCROLL_EDGE && tableWrap.scrollLeft > 0) {
        const intensity = (PREVIEW_AUTO_SCROLL_EDGE - clampedLeftDistance) / PREVIEW_AUTO_SCROLL_EDGE;
        return -Math.max(1, Math.round(PREVIEW_AUTO_SCROLL_MAX_SPEED * intensity));
      }
      const maxScrollLeft = tableWrap.scrollWidth - tableWrap.clientWidth;
      if (rightDistance < PREVIEW_AUTO_SCROLL_EDGE && tableWrap.scrollLeft < maxScrollLeft) {
        const intensity = (PREVIEW_AUTO_SCROLL_EDGE - clampedRightDistance) / PREVIEW_AUTO_SCROLL_EDGE;
        return Math.max(1, Math.round(PREVIEW_AUTO_SCROLL_MAX_SPEED * intensity));
      }
      return 0;
    }

    function stepAutoScroll() {
      autoScrollFrame = 0;
      if (!activeResize && !activeReorder) return;
      const delta = computeAutoScrollDelta();
      if (delta !== 0) {
        const maxScrollLeft = tableWrap.scrollWidth - tableWrap.clientWidth;
        const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, tableWrap.scrollLeft + delta));
        if (nextScrollLeft !== tableWrap.scrollLeft) {
          tableWrap.scrollLeft = nextScrollLeft;
          if (activeResize) updateActiveResizeWidth();
          if (activeReorder) applyActiveReorderAtPointer(activeReorder.currentX);
        }
      }
      if (activeResize || activeReorder) autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
    }

    function stopActiveGesture() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (autoScrollFrame) {
        window.cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = 0;
      }
      previewEl.classList.remove("is-resizing-columns", "is-reordering-columns");
      clearTargets();
      activeResize = null;
      activeReorder = null;
      state.previewScrollLeft = tableWrap.scrollLeft;
    }

    function handlePointerMove(event) {
      if (activeReorder) {
        const deltaX = event.clientX - activeReorder.startX;
        const deltaY = event.clientY - activeReorder.startY;
        if (!activeReorder.dragging) {
          if (Math.hypot(deltaX, deltaY) < 6) return;
          activeReorder.dragging = true;
          previewEl.classList.add("is-reordering-columns");
        }
        event.preventDefault();
        activeReorder.currentX = event.clientX;
        applyActiveReorderAtPointer(activeReorder.currentX);
        return;
      }
      if (!activeResize) return;
      activeResize.currentX = event.clientX;
      updateActiveResizeWidth();
    }

    function handlePointerUp() {
      stopActiveGesture();
      render();
    }

    table.querySelectorAll("th[data-column-index]").forEach((headerCell, columnIndex) => {
      function isNearDivider(event) {
        const rect = headerCell.getBoundingClientRect();
        return rect.right - event.clientX <= PREVIEW_RESIZE_HIT_WIDTH;
      }

      function isInReorderZone(event) {
        const rect = headerCell.getBoundingClientRect();
        return (
          event.clientY - rect.top <= PREVIEW_REORDER_HIT_HEIGHT
          && !isNearDivider(event)
          && !event.target.closest(".clp-col-sort")
          && !event.target.closest(".clp-col-remove")
          && !event.target.closest(".clp-col-name-button")
          && !event.target.closest(".clp-col-name-input")
        );
      }

      headerCell.addEventListener("pointermove", (event) => {
        if (activeResize || activeReorder) return;
        headerCell.classList.toggle("is-col-resize-target", isNearDivider(event));
        headerCell.classList.toggle("is-col-reorder-target", isInReorderZone(event));
      });

      headerCell.addEventListener("pointerleave", () => {
        if (!activeResize && !activeReorder) {
          headerCell.classList.remove("is-col-resize-target", "is-col-reorder-target");
        }
      });

      headerCell.addEventListener("dblclick", (event) => {
        if (!isNearDivider(event)) return;
        event.preventDefault();
        autosizePreviewColumn(previewEl, columnIndex, headers[columnIndex]);
        render();
      });

      headerCell.addEventListener("pointerdown", (event) => {
        if (isInReorderZone(event)) {
          event.preventDefault();
          clearTargets();
          activeReorder = {
            columnName: headers[columnIndex],
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            dragging: false,
          };
          window.addEventListener("pointermove", handlePointerMove, { passive: false });
          window.addEventListener("pointerup", handlePointerUp, { passive: false });
          window.addEventListener("pointercancel", handlePointerUp);
          if (!autoScrollFrame) autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
          return;
        }

        if (
          event.button !== 0
          || event.target.closest(".clp-col-remove")
          || event.target.closest(".clp-col-name-button")
          || event.target.closest(".clp-col-name-input")
          || !isNearDivider(event)
        ) {
          return;
        }
        event.preventDefault();
        clearTargets();
        activeResize = {
          columnIndex,
          columnName: headers[columnIndex],
          startX: event.clientX,
          currentX: event.clientX,
          startWidth: headerCell.getBoundingClientRect().width,
          startScrollLeft: tableWrap.scrollLeft,
        };
        previewEl.classList.add("is-resizing-columns");
        headerCell.classList.add("is-col-resize-target");
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        if (!autoScrollFrame) autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
      });
    });
  }

  function render() {
    applyPanelBackground();
    const content = panel.querySelector(".clp-content");
    const headers = state.headers ?? [];
    const rows = state.rows ?? [];
    const rowCount = state.rowCount ?? 0;
    const totalRowCount = state.totalRowCount ?? rowCount;
    const columnCount = state.columnCount ?? 0;
    const pageOffset = state.previewPageOffset ?? 0;
    const pageStart = rowCount ? pageOffset + 1 : 0;
    const pageEnd = Math.min(pageOffset + rows.length, rowCount);
    const canGoPrev = pageOffset > 0;
    const canGoNext = pageOffset + PREVIEW_PAGE_SIZE < rowCount;
    const sortDisabled = !state.isFullyLoaded;
    const { head, body } = buildPreviewTableMarkup({
      headers,
      rows,
      columnWidths: state.columnWidths,
      renamingColumn: state.renamingColumn,
      renameDraft: state.renameDraft,
      sortColumn: state.previewSortColumn,
      sortDirection: state.previewSortDirection,
      sortDisabled,
    });
    const selectedDataset = getSelectedDataset();
    const datasetOptions = (state.datasets ?? []).map((dataset) => `
      <option value="${escapeHtml(dataset.id)}"${dataset.id === state.selectedDatasetId ? " selected" : ""}>${escapeHtml(dataset.name || "Dataset")}</option>
    `).join("");
    const licenseLabel = String(selectedDataset?.license ?? "").trim();
    const licenseUrl = String(selectedDataset?.license_url ?? "").trim();
    const attributionText = String(selectedDataset?.attribution ?? "").trim();
    const licenseMarkup = licenseLabel
      ? (licenseUrl
        ? `<a class="dtv-license-link" href="${escapeHtml(licenseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(licenseLabel)}</a>`
        : `<span class="dtv-license-text">${escapeHtml(licenseLabel)}</span>`)
      : `<span class="dtv-license-text dtv-license-text-muted">No license</span>`;
    const summaryText = state.loading
      ? "Loading rows..."
      : state.isBackgroundLoading && totalRowCount > rowCount
        ? `Loading ${rowCount.toLocaleString()} of ${totalRowCount.toLocaleString()} rows | ${columnCount.toLocaleString()} columns`
        : `${rowCount.toLocaleString()} rows | ${columnCount.toLocaleString()} columns`;

    content.innerHTML = `
      <div class="clp-preview dtv-preview">
        <label class="clp-field">
          <span class="clp-field-label">Layer name</span>
          <input class="clp-field-input dtv-name-input" type="text" value="${escapeHtml(state.editableLayerName)}" placeholder="Layer name" />
        </label>
        <div class="dtv-dataset-row">
          <div class="dtv-dataset-picker">
            <label class="clp-field dtv-dataset-field">
              <span class="clp-field-label">Dataset</span>
              <select class="clp-field-input dtv-dataset-select" ${state.datasetsLoading || !(state.datasets ?? []).length ? "disabled" : ""}>
                ${datasetOptions || `<option value="">No datasets</option>`}
              </select>
            </label>
            <button class="dtv-add-data-btn" type="button" aria-label="Add data" title="Add data">+</button>
          </div>
          <div class="dtv-license-panel" aria-label="Dataset licensing">
            <div class="dtv-license-item">
              <span class="dtv-license-label">License</span>
              ${licenseMarkup}
            </div>
            <div class="dtv-license-item">
              <span class="dtv-license-label">Attribution</span>
              <span class="dtv-license-text${attributionText ? "" : " dtv-license-text-muted"}">${escapeHtml(attributionText || "None")}</span>
            </div>
          </div>
        </div>
        <div class="clp-preview-summary-row">
          <p class="upload-step-sub">${escapeHtml(summaryText)}</p>
        </div>
        ${state.error ? `<p class="clp-error">${escapeHtml(state.error)}</p>` : ""}
        ${(!state.loading || headers.length) && headers.length ? `
          <div class="clp-table-wrap">
            <table class="upload-preview">
              <thead><tr>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
          <div class="clp-preview-controls">
            <div class="clp-preview-pagination">
              <span class="clp-preview-page-range">${escapeHtml(`${pageStart}-${pageEnd}`)}</span>
              <button class="clp-undo-icon clp-preview-page-btn" id="dtvPrev" type="button" aria-label="Previous preview rows" ${canGoPrev ? "" : "disabled"}><span aria-hidden="true">&#8249;</span></button>
              <button class="clp-undo-icon clp-preview-page-btn" id="dtvNext" type="button" aria-label="Next preview rows" ${canGoNext ? "" : "disabled"}><span aria-hidden="true">&#8250;</span></button>
            </div>
          </div>
        ` : `<div class="dtv-empty">${state.loading ? "Loading..." : "No rows to show yet."}</div>`}
      </div>
    `;

    content.querySelector(".dtv-name-input")?.addEventListener("input", (event) => {
      state.editableLayerName = event.target.value;
    });
    content.querySelector(".dtv-dataset-select")?.addEventListener("change", (event) => {
      const nextDatasetId = event.target.value ?? "";
      if (!nextDatasetId || nextDatasetId === state.selectedDatasetId) {
        return;
      }
      state.selectedDatasetId = nextDatasetId;
      state.headers = [];
      state.allRows = [];
      state.rows = [];
      state.rowCount = 0;
      state.totalRowCount = 0;
      state.columnCount = 0;
      state.previewPageOffset = 0;
      state.previewSortColumn = "";
      state.previewSortDirection = "";
      state.renamingColumn = "";
      state.renameDraft = "";
      state.previewScrollLeft = 0;
      state.previewScrollTop = 0;
      state.columnWidths = {};
      state.headerAliases = {};
      state.removedSourceHeaders = {};
      render();
      void loadLayer(state.layerId, nextDatasetId);
    });
    content.querySelector(".dtv-add-data-btn")?.addEventListener("click", () => {
      onAddDataRequested?.({
        layerId: state.layerId,
        layerName: state.layerName,
        datasets: state.datasets,
        selectedDatasetId: state.selectedDatasetId,
      });
    });
    content.querySelector("#dtvPrev")?.addEventListener("click", () => {
      state.previewPageOffset = Math.max(0, state.previewPageOffset - PREVIEW_PAGE_SIZE);
      syncPreviewPageRows();
      render();
    });
    content.querySelector("#dtvNext")?.addEventListener("click", () => {
      state.previewPageOffset += PREVIEW_PAGE_SIZE;
      syncPreviewPageRows();
      render();
    });
    if (headers.length) {
      bindPreviewTableInteractions(content, {
        headers,
        getHeaders: () => state.headers ?? [],
        getColumnWidths: () => state.columnWidths ?? {},
        setColumnWidth: (columnIndex, columnName, width) => {
          setPreviewColumnWidth(content, columnIndex, columnName, width);
        },
        reorderColumn: (columnName, targetIndex) => {
          reorderPreviewColumn(columnName, targetIndex);
        },
        onSort: (columnName) => {
          togglePreviewSort(columnName);
        },
        onStartRename: (columnName) => {
          state.renamingColumn = columnName;
          state.renameDraft = columnName;
          render();
        },
        onRenameDraftChange: (value) => {
          state.renameDraft = value;
        },
        onRenameCommit: (fromColumnName, nextColumnName) => {
          renamePreviewColumn(fromColumnName, nextColumnName);
        },
        onRenameCancel: () => {
          state.renamingColumn = "";
          state.renameDraft = "";
          render();
        },
        onRemoveColumn: (columnName) => {
          removePreviewColumn(columnName);
        },
        getScrollLeft: () => state.previewScrollLeft,
        setScrollLeft: (scrollLeft) => {
          state.previewScrollLeft = scrollLeft;
        },
        getScrollTop: () => state.previewScrollTop,
        setScrollTop: (scrollTop) => {
          state.previewScrollTop = scrollTop;
        },
        requestRender: () => {
          render();
        },
      });
    }
  }

  async function loadRemainingRows(layerId, datasetId, offset, requestId) {
    let nextOffset = offset;
    while (requestId === state.loadRequestId) {
      const result = await loadTablePreview(layerId, { limit: BACKGROUND_LOAD_SIZE, offset: nextOffset, datasetId });
      if (requestId !== state.loadRequestId) {
        return;
      }
      const fields = Array.isArray(result?.fields) ? result.fields : [];
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      appendChunk(fields, rows, result?.totalRowCount);
      state.isBackgroundLoading = Boolean(result?.hasMore);
      render();
      if (!result?.hasMore || !rows.length) {
        break;
      }
      nextOffset += rows.length;
    }
  }

  async function loadDatasets(layerId) {
    if (!layerId || typeof getLayerDatasets !== "function") {
      state.datasets = [];
      state.selectedDatasetId = "";
      return [];
    }
    state.datasetsLoading = true;
    render();
    try {
      const datasets = await getLayerDatasets(layerId);
      state.datasets = Array.isArray(datasets) ? datasets : [];
      if (!state.selectedDatasetId || !state.datasets.some((dataset) => dataset.id === state.selectedDatasetId)) {
        state.selectedDatasetId = state.datasets[0]?.id ?? "";
      }
      return state.datasets;
    } catch (error) {
      state.error = error?.message ?? "Failed to load datasets.";
      state.datasets = [];
      state.selectedDatasetId = "";
      return [];
    } finally {
      state.datasetsLoading = false;
      render();
    }
  }

  async function loadLayer(layerId, datasetId = state.selectedDatasetId) {
    if (!layerId || !datasetId) return;
    const requestId = state.loadRequestId + 1;
    state.loadRequestId = requestId;
    state.loading = true;
    state.isBackgroundLoading = false;
    state.isFullyLoaded = false;
    state.error = "";
    render();
    try {
      const result = await loadTablePreview(layerId, { limit: INITIAL_LOAD_SIZE, offset: 0, datasetId });
      if (requestId !== state.loadRequestId) {
        return;
      }
      state.headers = [];
      state.allRows = [];
      state.rows = [];
      state.rowCount = 0;
      state.totalRowCount = 0;
      state.columnCount = 0;
      state.previewPageOffset = 0;
      state.previewSortColumn = "";
      state.previewSortDirection = "";
      state.renamingColumn = "";
      state.renameDraft = "";
      state.previewScrollLeft = 0;
      state.previewScrollTop = 0;
      state.columnWidths = {};
      state.headerAliases = {};
      state.removedSourceHeaders = {};
      state.selectedDatasetId = datasetId;

      const fields = Array.isArray(result?.fields) ? result.fields : [];
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      appendChunk(fields, rows, result?.totalRowCount);
      state.isBackgroundLoading = Boolean(result?.hasMore);
      state.loading = false;
      render();

      if (state.isBackgroundLoading) {
        await loadRemainingRows(layerId, datasetId, state.rowCount, requestId);
      }
    } catch (error) {
      if (requestId !== state.loadRequestId) {
        return;
      }
      state.error = error?.message ?? "Failed to load data.";
      state.headers = [];
      state.allRows = [];
      state.rows = [];
      state.rowCount = 0;
      state.totalRowCount = 0;
      state.columnCount = 0;
      state.isBackgroundLoading = false;
      state.isFullyLoaded = false;
      state.loading = false;
      render();
      return;
    }

    if (requestId !== state.loadRequestId) {
      return;
    }
    state.isBackgroundLoading = false;
    state.isFullyLoaded = state.rowCount >= state.totalRowCount;
    render();
  }

  function close() {
    state.loadRequestId += 1;
    panel.classList.remove("is-open");
  }

  panel.querySelector(".clp-close")?.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) close();
  });

  return {
    open({ layerId, layerName }) {
      state = createInitialState({
        layerId,
        layerName: layerName ?? "Layer",
        editableLayerName: layerName ?? "Layer",
        loadRequestId: state.loadRequestId,
      });
      panel.classList.add("is-open");
      render();
      void (async () => {
        await loadDatasets(layerId);
        if (state.selectedDatasetId) {
          await loadLayer(layerId, state.selectedDatasetId);
        }
      })();
    },
    close,
    async reloadLayerData({ layerId = state.layerId, datasetId = state.selectedDatasetId } = {}) {
      if (!layerId) return;
      state.layerId = layerId;
      await loadDatasets(layerId);
      if (datasetId && state.datasets.some((dataset) => dataset.id === datasetId)) {
        state.selectedDatasetId = datasetId;
      }
      if (state.selectedDatasetId) {
        await loadLayer(layerId, state.selectedDatasetId);
      } else {
        render();
      }
    },
  };
}
