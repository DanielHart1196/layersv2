import { parseFile, SUPPORTED_EXTENSIONS } from "../upload/parse-file.js";
import { rowsToFeatures } from "../upload/csv-mapper.js";
import { inferFieldSchemaFromFeatures } from "../upload/field-schema.js";
import { summarizeFeatureComplexity } from "../upload/feature-complexity.js";
import { inferGeometryFamily } from "../upload/geometry-family.js";
import { createLayerWithDataset } from "../upload/insert-layer.js";

const MIN_PREVIEW_COLUMN_WIDTH = 96;
const PREVIEW_RESIZE_HIT_WIDTH = 8;
const PREVIEW_REORDER_HIT_HEIGHT = 10;
const PREVIEW_AUTO_SCROLL_EDGE = 28;
const PREVIEW_AUTO_SCROLL_MAX_SPEED = 18;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applySettingsBackground(panel, state) {
  const inner = panel.querySelector(".clp-inner");
  if (!inner) {
    return;
  }
  inner.style.backgroundColor = getSettingsBackground(state);
}

function getSettingsBackground(state) {
  const color = normalizeHexColor(state?.color, "#122330");
  const rgb = hexToRgb(color);
  const alpha = Math.max(0, Math.min(100, Number(state?.opacity) || 0)) / 100;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function inferGeometryType(features = []) {
  return inferGeometryFamily(features);
}

function flattenPreviewProperties(value, prefix = "", out = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return out;
  }

  Object.entries(value).forEach(([key, child]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) {
      out[nextKey] = `${child.length} item${child.length === 1 ? "" : "s"}`;
      return;
    }
    if (child && typeof child === "object") {
      flattenPreviewProperties(child, nextKey, out);
      return;
    }
    out[nextKey] = child ?? "";
  });

  return out;
}

function deletePropertyPath(target, path) {
  if (!target || typeof target !== "object") return;
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!parts.length) return;

  const stack = [];
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return;
    }
    stack.push([current, parts[i]]);
    current = current[parts[i]];
  }

  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return;
  }

  delete current[parts.at(-1)];

  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, key] = stack[i];
    const child = parent[key];
    if (child && typeof child === "object" && !Array.isArray(child) && Object.keys(child).length === 0) {
      delete parent[key];
    } else {
      break;
    }
  }
}

function getPropertyPathState(target, path) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!target || typeof target !== "object" || !parts.length) {
    return { exists: false, value: undefined };
  }

  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return { exists: false, value: undefined };
    }
    current = current[parts[i]];
  }

  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return { exists: false, value: undefined };
  }

  const key = parts.at(-1);
  if (!Object.prototype.hasOwnProperty.call(current, key)) {
    return { exists: false, value: undefined };
  }

  return {
    exists: true,
    value: structuredClone(current[key]),
  };
}

function setPropertyPath(target, path, value) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!target || typeof target !== "object" || !parts.length) {
    return;
  }

  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }

  current[parts.at(-1)] = structuredClone(value);
}

function renameObjectKey(target, fromKey, toKey) {
  if (!target || typeof target !== "object" || Array.isArray(target) || !fromKey || !toKey || fromKey === toKey) {
    return target;
  }
  const entries = Object.entries(target);
  return Object.fromEntries(entries.map(([key, value]) => [key === fromKey ? toKey : key, value]));
}

function orderHeaders(headers = [], desiredOrder = []) {
  const headerSet = new Set(headers);
  const ordered = [];
  const seen = new Set();

  desiredOrder.forEach((header) => {
    if (headerSet.has(header) && !seen.has(header)) {
      seen.add(header);
      ordered.push(header);
    }
  });

  headers.forEach((header) => {
    if (!seen.has(header)) {
      seen.add(header);
      ordered.push(header);
    }
  });

  return ordered;
}

function buildPreviewFromParsed(parsed) {
  if (parsed?.type === "csv") {
    const headers = Array.isArray(parsed.headers) ? parsed.headers : [];
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const features = rowsToFeatures(rows, parsed.mapping ?? {});
    return {
      kind: "tabular",
      headers,
      rows: rows.slice(0, 5),
      rowCount: rows.length,
      columnCount: headers.length,
      features,
      fieldSchema: inferFieldSchemaFromFeatures(features),
    };
  }

  const features = Array.isArray(parsed?.features) ? parsed.features : [];
  const propertyKeys = [];
  const seenKeys = new Set();

  features.forEach((feature) => {
    const properties = flattenPreviewProperties(feature?.properties ?? {});
    if (!properties || typeof properties !== "object") {
      return;
    }
    Object.keys(properties).forEach((key) => {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        propertyKeys.push(key);
      }
    });
  });

  const headers = propertyKeys.length ? propertyKeys : ["geometry_type"];
  const rows = features.slice(0, 5).map((feature) => {
    const properties = flattenPreviewProperties(feature?.properties ?? {});
    if (!propertyKeys.length) {
      return { geometry_type: feature?.geometry?.type ?? "" };
    }
    return Object.fromEntries(propertyKeys.map((key) => [key, properties[key] ?? ""]));
  });

  return {
    kind: "feature-table",
    headers,
    rows,
    rowCount: features.length,
    columnCount: headers.length,
    features,
    fieldSchema: inferFieldSchemaFromFeatures(features),
  };
}

export function mountCreateLayerPanel({ getAppearanceState, onLayerCreated }) {
  const panel = createPanelShell();
  document.body.appendChild(panel);

  let state = createInitialState();

  function createInitialState(overrides = {}) {
    return {
      parentId: null,
      name: "",
      step: "form",
      file: null,
      parsed: null,
      preview: null,
      undoStack: [],
      renamingColumn: "",
      renameDraft: "",
      previewScrollLeft: 0,
      usePmtiles: false,
      uploadingLabel: "0%",
      uploadingPct: 0,
      layerId: null,
      error: "",
      ...overrides,
    };
  }

  function render() {
    const content = panel.querySelector(".clp-content");
    content.innerHTML = "";

    if (state.step === "form") content.append(renderForm());
    if (state.step === "preview") content.append(renderPreview());
    if (state.step === "uploading") content.append(renderUploading());
    if (state.step === "done") content.append(renderDone());

    applySettingsBackground(panel, getAppearanceState?.()?.settings);
    if (state.step === "preview") {
      const tableWrap = panel.querySelector(".clp-table-wrap");
      if (tableWrap && Number.isFinite(state.previewScrollLeft)) {
        tableWrap.scrollLeft = state.previewScrollLeft;
      }
    }
  }

  function rebuildPreview(columnWidths = state.preview?.columnWidths ?? {}) {
    const nextPreview = buildPreviewFromParsed(state.parsed);
    const desiredOrder = state.preview?.headerOrder ?? state.preview?.headers ?? nextPreview.headers;
    const orderedHeaders = orderHeaders(nextPreview.headers ?? [], desiredOrder ?? []);
    nextPreview.headers = orderedHeaders;
    nextPreview.headerOrder = orderedHeaders.slice();
    nextPreview.rows = (nextPreview.rows ?? []).map((row) => {
      if (!row || typeof row !== "object") {
        return row;
      }
      return Object.fromEntries(orderedHeaders.map((header) => [header, row[header] ?? ""]));
    });
    nextPreview.columnWidths = Object.fromEntries(
      orderedHeaders
        .filter((header) => Number.isFinite(columnWidths?.[header]))
        .map((header) => [header, columnWidths[header]])
    );
    state.preview = nextPreview;
  }

  function reorderPreviewColumn(columnName, targetIndex) {
    if (!state.preview || !columnName) {
      return;
    }

    const headers = Array.isArray(state.preview.headers) ? [...state.preview.headers] : [];
    const currentIndex = headers.indexOf(columnName);
    if (currentIndex === -1) {
      return;
    }

    headers.splice(currentIndex, 1);
    const boundedTarget = Math.max(0, Math.min(targetIndex, headers.length));
    headers.splice(boundedTarget, 0, columnName);
    state.preview.headers = headers;
    state.preview.headerOrder = headers.slice();

    state.preview.rows = (state.preview.rows ?? []).map((row) => {
      if (!row || typeof row !== "object") {
        return row;
      }
      return Object.fromEntries(headers.map((header) => [header, row[header] ?? ""]));
    });
  }

  function reorderPreviewToOrder(nextOrder) {
    if (!state.preview) {
      return;
    }
    const headers = orderHeaders(state.preview.headers ?? [], nextOrder ?? []);
    state.preview.headers = headers;
    state.preview.headerOrder = headers.slice();
    state.preview.rows = (state.preview.rows ?? []).map((row) => {
      if (!row || typeof row !== "object") {
        return row;
      }
      return Object.fromEntries(headers.map((header) => [header, row[header] ?? ""]));
    });
  }

  function close() {
    panel.classList.remove("is-open");
  }

  async function handleFile(file) {
    if (!file) {
      return;
    }

    try {
      const parsed = await parseFile(file);
      if (parsed?.error) {
        state.error = parsed.error;
        render();
        return;
      }

      state.file = file;
      state.parsed = parsed;
      rebuildPreview({});
      state.usePmtiles = false;
      state.error = "";
      if (!state.name.trim()) {
        state.name = file.name.replace(/\.[^.]+$/, "");
      }
      state.step = "preview";
      render();
    } catch (error) {
      state.error = error?.message ?? "Failed to parse file.";
      render();
    }
  }

  async function submitLayer() {
    if (!state.preview?.features?.length) {
      state.error = "This file did not produce any usable features yet.";
      state.step = "preview";
      render();
      return;
    }

    state.step = "uploading";
    state.uploadingPct = 0;
    state.uploadingLabel = "0%";
    render();

    try {
      const { layerId } = await createLayerWithDataset({
        name: state.name.trim() || state.file?.name?.replace(/\.[^.]+$/, "") || "Layer",
        datasetName: state.file?.name?.replace(/\.[^.]+$/, "") || "Dataset",
        viewAccess: "unlisted",
        features: state.preview.features,
        fieldSchema: state.preview.fieldSchema,
        rawFile: state.file,
        usePmtiles: state.usePmtiles,
        onProgress: (pct, label) => {
          state.uploadingPct = pct;
          state.uploadingLabel = label ?? `${pct}%`;
          const bar = panel.querySelector(".clp-progress-bar");
          const labelEl = panel.querySelector(".clp-progress-label");
          if (bar) bar.style.width = `${pct}%`;
          if (labelEl) labelEl.textContent = state.uploadingLabel;
        },
      });

      state.layerId = layerId;
      state.step = "done";
      render();
      onLayerCreated?.({
        layerId,
        name: state.name.trim() || state.file?.name?.replace(/\.[^.]+$/, "") || "Layer",
        parentId: state.parentId ?? null,
        geometryType: inferGeometryType(state.preview.features),
      });
    } catch (error) {
      state.error = error?.message ?? "Failed to create layer.";
      state.step = "preview";
      render();
    }
  }

  function removePreviewColumn(columnName) {
    if (!state.preview || !columnName) {
      return;
    }

    const headers = state.preview.headers ?? [];
    const headerIndex = headers.indexOf(columnName);
    if (headerIndex === -1) {
      return;
    }

    const previousWidths = { ...(state.preview.columnWidths ?? {}) };
    let operation = null;

    if (state.parsed?.type === "csv") {
      const parsedHeaders = Array.isArray(state.parsed.headers) ? state.parsed.headers : [];
      const parsedRows = Array.isArray(state.parsed.rows) ? state.parsed.rows : [];
      operation = {
        type: "remove_column_csv",
        columnName,
        headerIndex,
        previousWidths,
        rowValues: parsedRows.map((row) => ({
          existed: Boolean(row && Object.prototype.hasOwnProperty.call(row, columnName)),
          value: row && Object.prototype.hasOwnProperty.call(row, columnName)
            ? structuredClone(row[columnName])
            : undefined,
        })),
      };
      state.parsed.headers = parsedHeaders.filter((header) => header !== columnName);
      state.parsed.rows = parsedRows.map((row) => {
        if (!row || typeof row !== "object") {
          return row;
        }
        const nextRow = { ...row };
        delete nextRow[columnName];
        return nextRow;
      });
    } else {
      const parsedFeatures = Array.isArray(state.parsed?.features) ? state.parsed.features : [];
      operation = {
        type: "remove_column_feature",
        columnName,
        headerIndex,
        previousWidths,
        featureValues: parsedFeatures.map((feature) => {
          const properties = feature?.properties && typeof feature.properties === "object"
            ? feature.properties
            : {};
          return getPropertyPathState(properties, columnName);
        }),
      };
      state.parsed.features = parsedFeatures.map((feature) => {
        if (!feature || typeof feature !== "object") {
          return feature;
        }
        const nextFeature = {
          ...feature,
          properties: feature.properties && typeof feature.properties === "object"
            ? structuredClone(feature.properties)
            : {},
        };
        deletePropertyPath(nextFeature.properties, columnName);
        return nextFeature;
      });
    }

    state.undoStack.push(operation);
    rebuildPreview(
      Object.fromEntries(Object.entries(previousWidths).filter(([header]) => header !== columnName))
    );
    reorderPreviewToOrder(headers.filter((header) => header !== columnName));
    render();
  }

  function startRenameColumn(columnName) {
    if (!state.preview || !columnName) {
      return;
    }
    state.renamingColumn = columnName;
    state.renameDraft = columnName;
    render();
  }

  function cancelRenameColumn() {
    if (!state.renamingColumn) {
      return;
    }
    state.renamingColumn = "";
    state.renameDraft = "";
    render();
  }

  function renamePreviewColumn(fromColumnName, rawNextColumnName) {
    if (!state.preview || !fromColumnName) {
      return false;
    }

    const nextColumnName = String(rawNextColumnName ?? "").trim();
    if (!nextColumnName) {
      state.error = "Column names cannot be empty.";
      render();
      return false;
    }

    if (nextColumnName === fromColumnName) {
      state.renamingColumn = "";
      state.renameDraft = "";
      state.error = "";
      render();
      return true;
    }

    const headers = state.preview.headers ?? [];
    const headerIndex = headers.indexOf(fromColumnName);
    if (headerIndex === -1) {
      return false;
    }

    if (headers.includes(nextColumnName)) {
      state.error = `A column named "${nextColumnName}" already exists.`;
      render();
      return false;
    }

    const previousWidths = { ...(state.preview.columnWidths ?? {}) };
    let operation = null;

    if (state.parsed?.type === "csv") {
      state.parsed.headers = (Array.isArray(state.parsed.headers) ? state.parsed.headers : []).map((header) => (
        header === fromColumnName ? nextColumnName : header
      ));
      state.parsed.rows = (Array.isArray(state.parsed.rows) ? state.parsed.rows : []).map((row) => {
        if (!row || typeof row !== "object") {
          return row;
        }
        return renameObjectKey(row, fromColumnName, nextColumnName);
      });
      operation = {
        type: "rename_column_csv",
        fromColumnName,
        toColumnName: nextColumnName,
        headerIndex,
        previousWidths,
      };
    } else {
      state.parsed.features = (Array.isArray(state.parsed.features) ? state.parsed.features : []).map((feature) => {
        if (!feature || typeof feature !== "object") {
          return feature;
        }
        const nextFeature = {
          ...feature,
          properties: feature.properties && typeof feature.properties === "object"
            ? structuredClone(feature.properties)
            : {},
        };
        const existing = getPropertyPathState(nextFeature.properties, fromColumnName);
        if (existing.exists) {
          deletePropertyPath(nextFeature.properties, fromColumnName);
          setPropertyPath(nextFeature.properties, nextColumnName, existing.value);
        }
        return nextFeature;
      });
      operation = {
        type: "rename_column_feature",
        fromColumnName,
        toColumnName: nextColumnName,
        headerIndex,
        previousWidths,
      };
    }

    state.undoStack.push(operation);
    const nextWidths = { ...previousWidths };
    if (Object.prototype.hasOwnProperty.call(nextWidths, fromColumnName)) {
      nextWidths[nextColumnName] = nextWidths[fromColumnName];
      delete nextWidths[fromColumnName];
    }
    rebuildPreview(nextWidths);
    reorderPreviewToOrder(headers.map((header) => (header === fromColumnName ? nextColumnName : header)));
    state.renamingColumn = "";
    state.renameDraft = "";
    state.error = "";
    render();
    return true;
  }

  function getPreviewColumnWidths() {
    if (!state.preview) {
      return {};
    }
    if (!state.preview.columnWidths || typeof state.preview.columnWidths !== "object") {
      state.preview.columnWidths = {};
    }
    return state.preview.columnWidths;
  }

  function setPreviewColumnWidth(previewEl, columnIndex, columnName, width) {
    const nextWidth = Math.max(MIN_PREVIEW_COLUMN_WIDTH, Math.round(width));
    getPreviewColumnWidths()[columnName] = nextWidth;
    previewEl.querySelectorAll(`[data-column-index="${columnIndex}"]`).forEach((cell) => {
      cell.style.width = `${nextWidth}px`;
      cell.style.minWidth = `${nextWidth}px`;
      cell.style.maxWidth = `${nextWidth}px`;
    });
  }

  function bindPreviewColumnResize(previewEl, headers) {
    const table = previewEl.querySelector(".upload-preview");
    const tableWrap = previewEl.querySelector(".clp-table-wrap");
    if (!table || !tableWrap || headers.length < 2) {
      return;
    }

    let activeResize = null;
    let activeReorder = null;
    let autoScrollFrame = 0;

    function clearResizeTargets() {
      table.querySelectorAll(".is-col-resize-target, .is-col-reorder-target").forEach((cell) => {
        cell.classList.remove("is-col-resize-target");
        cell.classList.remove("is-col-reorder-target");
      });
    }

    function syncPreviewTable(previewHeaders = state.preview?.headers ?? []) {
      const headRow = previewEl.querySelector(".upload-preview thead tr");
      if (!headRow) {
        return;
      }

      const headCells = new Map(
        [...headRow.children].map((cell) => [cell.dataset.columnKey, cell])
      );
      previewHeaders.forEach((header, index) => {
        const cell = headCells.get(header);
        if (!cell) {
          return;
        }
        cell.dataset.columnIndex = String(index);
        headRow.append(cell);
      });

      previewEl.querySelectorAll(".upload-preview tbody tr").forEach((row) => {
        const cells = new Map(
          [...row.children].map((cell) => [cell.dataset.columnKey, cell])
        );
        previewHeaders.forEach((header, index) => {
          const cell = cells.get(header);
          if (!cell) {
            return;
          }
          cell.dataset.columnIndex = String(index);
          row.append(cell);
        });
      });
    }

    function updateActiveResizeWidth() {
      if (!activeResize) {
        return;
      }
      const nextWidth = activeResize.startWidth
        + (activeResize.currentX - activeResize.startX)
        + (tableWrap.scrollLeft - activeResize.startScrollLeft);
      setPreviewColumnWidth(previewEl, activeResize.columnIndex, activeResize.columnName, nextWidth);
    }

    function applyActiveReorderAtPointer(pointerX) {
      if (!activeReorder) {
        return;
      }

      const currentHeaders = state.preview?.headers ?? [];
      const currentIndex = currentHeaders.indexOf(activeReorder.columnName);
      if (currentIndex === -1) {
        return;
      }

      const currentHeader = table.querySelector(`th[data-column-key="${CSS.escape(activeReorder.columnName)}"]`);
      if (!currentHeader) {
        return;
      }

      const rect = currentHeader.getBoundingClientRect();
      let direction = null;
      if (pointerX < rect.left) {
        direction = "left";
      } else if (pointerX > rect.right) {
        direction = "right";
      }

      if (!direction) {
        return;
      }

      const nextIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= currentHeaders.length) {
        return;
      }

      reorderPreviewColumn(activeReorder.columnName, nextIndex);
      syncPreviewTable(state.preview.headers);
    }

    function computeAutoScrollDelta() {
      const currentX = activeResize?.currentX ?? activeReorder?.currentX;
      if (!Number.isFinite(currentX)) {
        return 0;
      }
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
      if (!activeResize && !activeReorder) {
        return;
      }

      const delta = computeAutoScrollDelta();
      if (delta !== 0) {
        const maxScrollLeft = tableWrap.scrollWidth - tableWrap.clientWidth;
        const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, tableWrap.scrollLeft + delta));
        if (nextScrollLeft !== tableWrap.scrollLeft) {
          tableWrap.scrollLeft = nextScrollLeft;
          if (activeResize) {
            updateActiveResizeWidth();
          }
          if (activeReorder) {
            applyActiveReorderAtPointer(activeReorder.currentX);
          }
        }
      }

      if (activeResize || activeReorder) {
        autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
      }
    }

    function stopResize() {
      if (!activeResize) {
        return;
      }
      const completedResize = activeResize;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (autoScrollFrame) {
        window.cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = 0;
      }
      previewEl.classList.remove("is-resizing-columns");
      completedResize.header.classList.remove("is-col-resize-target");
      activeResize = null;
      const finalWidth = getPreviewColumnWidths()[completedResize.columnName];
      if (Number.isFinite(finalWidth) && Math.round(finalWidth) !== Math.round(completedResize.startWidth)) {
        state.undoStack.push({
          type: "resize_column",
          columnName: completedResize.columnName,
          previousWidth: completedResize.previousWidth,
          nextWidth: finalWidth,
        });
        render();
      }
    }

    function stopReorder(commit = true) {
      if (!activeReorder) {
        return;
      }
      const completedReorder = activeReorder;
      state.previewScrollLeft = tableWrap.scrollLeft;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (autoScrollFrame) {
        window.cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = 0;
      }
      previewEl.classList.remove("is-reordering-columns");
      clearResizeTargets();
      activeReorder = null;
      if (
        commit
        && completedReorder.dragging
        && completedReorder.previousOrder.some((header, index) => header !== state.preview.headers[index])
      ) {
        state.undoStack.push({
          type: "reorder_columns",
          previousOrder: completedReorder.previousOrder,
          nextOrder: [...state.preview.headers],
        });
        render();
      }
    }

    function handlePointerMove(event) {
      if (activeReorder) {
        const gesture = activeReorder;
        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;

        if (!gesture.dragging) {
          if (Math.hypot(deltaX, deltaY) < 6) {
            return;
          }
          gesture.dragging = true;
          previewEl.classList.add("is-reordering-columns");
        }

        event.preventDefault();
        gesture.currentX = event.clientX;
        applyActiveReorderAtPointer(gesture.currentX);
        return;
      }

      if (!activeResize) {
        return;
      }
      activeResize.currentX = event.clientX;
      updateActiveResizeWidth();
    }

    function handlePointerUp() {
      if (activeReorder) {
        stopReorder(true);
        return;
      }
      stopResize();
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
          && !event.target.closest(".clp-col-remove")
          && !event.target.closest(".clp-col-name-button")
          && !event.target.closest(".clp-col-name-input")
        );
      }

      headerCell.addEventListener("pointermove", (event) => {
        if (activeResize || activeReorder) {
          return;
        }
        const nearDivider = isNearDivider(event);
        const inReorderZone = isInReorderZone(event);
        headerCell.classList.toggle("is-col-resize-target", nearDivider);
        headerCell.classList.toggle("is-col-reorder-target", inReorderZone);
      });

      headerCell.addEventListener("pointerleave", () => {
        if (!activeResize && !activeReorder) {
          headerCell.classList.remove("is-col-resize-target");
          headerCell.classList.remove("is-col-reorder-target");
        }
      });

      headerCell.addEventListener("pointerdown", (event) => {
        if (isInReorderZone(event)) {
          event.preventDefault();
          clearResizeTargets();
          activeReorder = {
            columnName: headers[columnIndex],
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            dragging: false,
            previousOrder: [...(state.preview?.headers ?? headers)],
          };
          headerCell.classList.add("is-col-reorder-target");
          window.addEventListener("pointermove", handlePointerMove, { passive: false });
          window.addEventListener("pointerup", handlePointerUp, { passive: false });
          window.addEventListener("pointercancel", handlePointerUp);
          if (!autoScrollFrame) {
            autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
          }
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
        clearResizeTargets();
        activeResize = {
          header: headerCell,
          columnIndex,
          columnName: headers[columnIndex],
          previousWidth: getPreviewColumnWidths()[headers[columnIndex]],
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
        if (!autoScrollFrame) {
          autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
        }
      });
    });
  }

  function undoPreviewChange() {
    const operation = state.undoStack.pop();
    if (!operation) {
      return;
    }

    if (operation.type === "resize_column") {
      const columnWidths = getPreviewColumnWidths();
      if (Number.isFinite(operation.previousWidth)) {
        columnWidths[operation.columnName] = operation.previousWidth;
      } else {
        delete columnWidths[operation.columnName];
      }
      render();
      return;
    }

    if (operation.type === "reorder_columns") {
      reorderPreviewToOrder(operation.previousOrder);
      render();
      return;
    }

    if (operation.type === "remove_column_csv") {
      const parsedHeaders = Array.isArray(state.parsed?.headers) ? [...state.parsed.headers] : [];
      parsedHeaders.splice(operation.headerIndex, 0, operation.columnName);
      state.parsed.headers = parsedHeaders;
      state.parsed.rows = (Array.isArray(state.parsed?.rows) ? state.parsed.rows : []).map((row, index) => {
        if (!row || typeof row !== "object") {
          return row;
        }
        const nextRow = { ...row };
        const rowValue = operation.rowValues[index];
        if (rowValue?.existed) {
          nextRow[operation.columnName] = structuredClone(rowValue.value);
        }
        return nextRow;
      });
      rebuildPreview(operation.previousWidths);
      render();
      return;
    }

    if (operation.type === "remove_column_feature") {
      state.parsed.features = (Array.isArray(state.parsed?.features) ? state.parsed.features : []).map((feature, index) => {
        if (!feature || typeof feature !== "object") {
          return feature;
        }
        const nextFeature = {
          ...feature,
          properties: feature.properties && typeof feature.properties === "object"
            ? structuredClone(feature.properties)
            : {},
        };
        const featureValue = operation.featureValues[index];
        if (featureValue?.exists) {
          setPropertyPath(nextFeature.properties, operation.columnName, featureValue.value);
        }
        return nextFeature;
      });
      rebuildPreview(operation.previousWidths);
      reorderPreviewColumn(operation.columnName, operation.headerIndex);
      render();
      return;
    }

    if (operation.type === "rename_column_csv") {
      state.parsed.headers = (Array.isArray(state.parsed.headers) ? state.parsed.headers : []).map((header) => (
        header === operation.toColumnName ? operation.fromColumnName : header
      ));
      state.parsed.rows = (Array.isArray(state.parsed.rows) ? state.parsed.rows : []).map((row) => {
        if (!row || typeof row !== "object") {
          return row;
        }
        return renameObjectKey(row, operation.toColumnName, operation.fromColumnName);
      });
      rebuildPreview(operation.previousWidths);
      reorderPreviewColumn(operation.fromColumnName, operation.headerIndex);
      render();
      return;
    }

    if (operation.type === "rename_column_feature") {
      state.parsed.features = (Array.isArray(state.parsed?.features) ? state.parsed.features : []).map((feature) => {
        if (!feature || typeof feature !== "object") {
          return feature;
        }
        const nextFeature = {
          ...feature,
          properties: feature.properties && typeof feature.properties === "object"
            ? structuredClone(feature.properties)
            : {},
        };
        const existing = getPropertyPathState(nextFeature.properties, operation.toColumnName);
        if (existing.exists) {
          deletePropertyPath(nextFeature.properties, operation.toColumnName);
          setPropertyPath(nextFeature.properties, operation.fromColumnName, existing.value);
        }
        return nextFeature;
      });
      rebuildPreview(operation.previousWidths);
      reorderPreviewColumn(operation.fromColumnName, operation.headerIndex);
      render();
    }
  }

  function renderForm() {
    const el = html(`
      <div class="clp-form">
        <label class="clp-field">
          <span class="clp-field-label">Layer name</span>
          <input class="clp-field-input clp-name-input" type="text" value="${escapeHtml(state.name)}" placeholder="Layer name" />
        </label>
        <div class="upload-dropzone" id="clpUploadDropzone">
          <p class="upload-dropzone-hint">Drop a file or click to browse</p>
          <p class="upload-dropzone-formats">${SUPPORTED_EXTENSIONS.join("  |  ")}</p>
          <input type="file" class="upload-file-input" id="clpUploadInput" accept="${SUPPORTED_EXTENSIONS.join(",")}" />
        </div>
        <p class="clp-error" ${state.error ? "" : "hidden"}>${escapeHtml(state.error)}</p>
      </div>
    `);

    const nameInput = el.querySelector(".clp-name-input");
    const uploadZone = el.querySelector("#clpUploadDropzone");
    const uploadInput = el.querySelector("#clpUploadInput");

    nameInput?.addEventListener("input", (event) => {
      state.name = event.target.value;
    });

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
      void handleFile(event.dataTransfer?.files?.[0] ?? null);
    });
    uploadInput?.addEventListener("change", () => {
      void handleFile(uploadInput.files?.[0] ?? null);
    });

    return el;
  }

  function renderPreview() {
    const headers = state.preview?.headers ?? [];
    const rows = state.preview?.rows ?? [];
    const rowCount = state.preview?.rowCount ?? 0;
    const columnCount = state.preview?.columnCount ?? 0;
    const columnWidths = getPreviewColumnWidths();
    const renamingColumn = state.renamingColumn ?? "";
    const complexity = summarizeFeatureComplexity(state.preview?.features ?? []);
    const summaryText = state.preview?.kind === "tabular"
      ? `${rowCount.toLocaleString()} rows · ${columnCount.toLocaleString()} columns`
      : `${rowCount.toLocaleString()} rows · ${columnCount.toLocaleString()} columns · ${complexity.featureCount.toLocaleString()} features · ${complexity.vertexCount.toLocaleString()} vertices`;
    const widthStyle = (header) => {
      const width = columnWidths?.[header];
      return Number.isFinite(width)
        ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"`
        : "";
    };
    const head = headers.map((header, index) => `
      <th data-column-index="${index}" data-column-key="${escapeHtml(header)}"${widthStyle(header)}>
        <span class="clp-col-head">
          ${renamingColumn === header ? `
            <input
              class="clp-col-name-input"
              type="text"
              value="${escapeHtml(state.renameDraft)}"
              data-column="${escapeHtml(header)}"
              aria-label="Rename ${escapeHtml(header)}"
            />
          ` : `
            <button class="clp-col-name-button" type="button" data-column="${escapeHtml(header)}" title="Rename column">
              <span class="clp-col-name">${escapeHtml(header)}</span>
            </button>
          `}
          <button class="clp-col-remove" type="button" data-column="${escapeHtml(header)}" aria-label="Remove ${escapeHtml(header)}">🗑</button>
        </span>
      </th>
    `).join("");
    const body = rows.map((row) => `
      <tr>${headers.map((header, index) => `<td data-column-index="${index}" data-column-key="${escapeHtml(header)}"${widthStyle(header)}>${escapeHtml(row?.[header] ?? "")}</td>`).join("")}</tr>
    `).join("");

    const el = html(`
      <div class="clp-preview">
        <label class="clp-field">
          <span class="clp-field-label">Layer name</span>
          <input class="clp-field-input clp-name-input" type="text" value="${escapeHtml(state.name)}" placeholder="Layer name" />
        </label>
        <h3 class="upload-step-title">${escapeHtml(state.file?.name ?? "Uploaded file")}</h3>
        <div class="clp-preview-summary-row">
          <p class="upload-step-sub">${escapeHtml(summaryText)}</p>
          ${state.undoStack.length ? `<button class="clp-undo-icon" id="clpUndo" type="button" aria-label="Undo last preview change" title="Undo"><span aria-hidden="true">↶</span></button>` : ""}
        </div>
        <div class="clp-table-wrap">
          <table class="upload-preview">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <label class="upload-field-label upload-field-label-inline">
          <input type="checkbox" id="clpUsePmtiles" ${state.usePmtiles ? "checked" : ""} />
          Generate PMTiles
        </label>
        <div class="clp-actions">
          <button class="clp-btn clp-btn-secondary" id="clpBack">Back</button>
          <button class="clp-btn clp-btn-primary" id="clpCreate">Create layer</button>
        </div>
        <p class="clp-error" ${state.error ? "" : "hidden"}>${escapeHtml(state.error)}</p>
      </div>
    `);

    el.querySelector("#clpBack")?.addEventListener("click", () => {
      state.step = "form";
      state.error = "";
      render();
    });
    el.querySelector(".clp-name-input")?.addEventListener("input", (event) => {
      state.name = event.target.value;
    });
    el.querySelector("#clpUsePmtiles")?.addEventListener("change", (event) => {
      state.usePmtiles = event.target.checked;
    });
    el.querySelector(".clp-table-wrap")?.addEventListener("scroll", (event) => {
      state.previewScrollLeft = event.currentTarget.scrollLeft;
    });
    el.querySelector("#clpUndo")?.addEventListener("click", undoPreviewChange);
    el.querySelectorAll(".clp-col-name-button").forEach((button) => {
      button.addEventListener("click", () => {
        startRenameColumn(button.dataset.column);
      });
    });
    el.querySelectorAll(".clp-col-name-input").forEach((input) => {
      const originalColumn = input.dataset.column;
      input.addEventListener("input", (event) => {
        state.renameDraft = event.target.value;
      });
      input.addEventListener("blur", () => {
        void renamePreviewColumn(originalColumn, state.renameDraft);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRenameColumn();
        }
      });
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
    el.querySelectorAll(".clp-col-remove").forEach((button) => {
      button.addEventListener("click", () => {
        removePreviewColumn(button.dataset.column);
      });
    });
    bindPreviewColumnResize(el, headers);
    el.querySelector("#clpCreate")?.addEventListener("click", () => {
      void submitLayer();
    });

    return el;
  }

  function renderUploading() {
    return html(`
      <div class="clp-uploading">
        <p class="clp-uploading-label">Creating layer...</p>
        <div class="clp-progress-track">
          <div class="clp-progress-bar" style="width:${state.uploadingPct}%"></div>
        </div>
        <p class="clp-progress-label">${escapeHtml(state.uploadingLabel)}</p>
      </div>
    `);
  }

  function renderDone() {
    const el = html(`
      <div class="clp-uploading">
        <p class="clp-uploading-label">Layer added to map</p>
        <div class="clp-actions">
          <button class="clp-btn clp-btn-secondary" id="clpAnother">Create another</button>
          <button class="clp-btn clp-btn-primary" id="clpClose">Done</button>
        </div>
      </div>
    `);

    el.querySelector("#clpAnother")?.addEventListener("click", () => {
      state = createInitialState({ parentId: state.parentId });
      render();
    });
    el.querySelector("#clpClose")?.addEventListener("click", close);
    return el;
  }

  panel.querySelector(".clp-close")?.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      close();
    }
  });
  panel.querySelector(".clp-inner")?.addEventListener("click", (event) => event.stopPropagation());

  return {
    open({ parentId = null, name = "" } = {}) {
      state = createInitialState({ parentId, name });
      panel.classList.add("is-open");
      render();
      requestAnimationFrame(() => panel.querySelector(".clp-name-input")?.focus());
    },
    close,
  };
}

function createPanelShell() {
  return html(`
    <div class="clp-panel">
      <div class="clp-inner">
        <div class="clp-header">
          <span class="clp-title">Create layer</span>
          <button class="clp-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="clp-content"></div>
      </div>
    </div>
  `);
}

function html(str) {
  const template = document.createElement("template");
  template.innerHTML = str.trim();
  return template.content.firstElementChild;
}
