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

export function buildPreviewTableMarkup({
  headers = [],
  rows = [],
  columnWidths = {},
  renamingColumn = "",
  renameDraft = "",
  sortColumn = "",
  sortDirection = "",
  sortDisabled = false,
  columnActionText = "&#128465;",
  columnActionAriaPrefix = "Remove",
  columnActionTitle = "",
}) {
  const widthStyle = (header) => {
    const width = columnWidths?.[header];
    return Number.isFinite(width)
      ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"`
      : "";
  };

  const sortGlyph = (header) => {
    if (sortColumn !== header || !sortDirection) {
      return "&#8597;";
    }
    return sortDirection === "desc" ? "&#8595;" : "&#8593;";
  };

  const head = headers.map((header, index) => `
    <th data-column-index="${index}" data-column-key="${escapeHtml(header)}"${widthStyle(header)}>
      <span class="clp-col-head">
        <button
          class="clp-col-sort"
          type="button"
          data-column="${escapeHtml(header)}"
          aria-label="Sort ${escapeHtml(header)}"
          title="${sortDisabled ? "Sort available when all rows are loaded" : `Sort ${escapeHtml(header)}`}"
          ${sortDisabled ? "disabled" : ""}
        >
          <span class="clp-col-sort-icon" aria-hidden="true">${sortGlyph(header)}</span>
        </button>
        ${renamingColumn === header ? `
          <input class="clp-col-name-input" type="text" value="${escapeHtml(renameDraft)}" data-column="${escapeHtml(header)}" aria-label="Rename ${escapeHtml(header)}" />
        ` : `
          <button class="clp-col-name-button" type="button" data-column="${escapeHtml(header)}" title="Rename column">
            <span class="clp-col-name">${escapeHtml(header)}</span>
          </button>
        `}
        <button
          class="clp-col-remove"
          type="button"
          data-column="${escapeHtml(header)}"
          aria-label="${escapeHtml(`${columnActionAriaPrefix} ${header}`)}"
          ${columnActionTitle ? `title="${escapeHtml(`${columnActionTitle} ${header}`)}"` : ""}
        >${columnActionText}</button>
      </span>
    </th>
  `).join("");

  const body = rows.map((row) => `
    <tr>${headers.map((header, index) => `<td data-column-index="${index}" data-column-key="${escapeHtml(header)}"${widthStyle(header)}>${escapeHtml(row?.[header] ?? "")}</td>`).join("")}</tr>
  `).join("");

  return { head, body };
}

export function bindPreviewTableInteractions(previewEl, options) {
  const {
    headers = [],
    getHeaders = () => headers,
    getColumnWidths,
    setColumnWidth,
    reorderColumn,
    onSort,
    onStartRename,
    onRenameDraftChange,
    onRenameCommit,
    onRenameCancel,
    onRemoveColumn,
    onColumnAction,
    getScrollLeft = () => 0,
    setScrollLeft = () => {},
    getScrollTop = () => 0,
    setScrollTop = () => {},
    onResizeComplete,
    onReorderComplete,
    requestRender,
  } = options;

  previewEl.querySelectorAll(".clp-col-name-button").forEach((button) => {
    button.addEventListener("click", () => {
      onStartRename?.(button.dataset.column ?? "");
    });
  });

  previewEl.querySelectorAll(".clp-col-sort").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onSort?.(button.dataset.column ?? "");
    });
  });

  previewEl.querySelectorAll(".clp-col-name-input").forEach((input) => {
    const originalColumn = input.dataset.column ?? "";
    input.addEventListener("input", (event) => {
      onRenameDraftChange?.(event.target.value);
    });
    input.addEventListener("blur", () => {
      onRenameCommit?.(originalColumn, input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onRenameCancel?.();
      }
    });
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });

  previewEl.querySelectorAll(".clp-col-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const columnName = button.dataset.column ?? "";
      if (typeof onColumnAction === "function") {
        onColumnAction(columnName);
        return;
      }
      onRemoveColumn?.(columnName);
    });
  });

  const tableWrap = previewEl.querySelector(".clp-table-wrap");
  tableWrap?.addEventListener("scroll", (event) => {
    setScrollLeft?.(event.currentTarget.scrollLeft);
    setScrollTop?.(event.currentTarget.scrollTop);
  });

  const table = previewEl.querySelector(".upload-preview");
  if (!table || !tableWrap || headers.length < 2) {
    if (tableWrap && Number.isFinite(getScrollLeft?.())) {
      tableWrap.scrollLeft = getScrollLeft();
    }
    if (tableWrap && Number.isFinite(getScrollTop?.())) {
      tableWrap.scrollTop = getScrollTop();
    }
    return;
  }

  if (Number.isFinite(getScrollLeft?.())) {
    tableWrap.scrollLeft = getScrollLeft();
  }
  if (Number.isFinite(getScrollTop?.())) {
    tableWrap.scrollTop = getScrollTop();
  }

  let activeResize = null;
  let activeReorder = null;
  let autoScrollFrame = 0;

  function clearTargets() {
    table.querySelectorAll(".is-col-resize-target, .is-col-reorder-target").forEach((cell) => {
      cell.classList.remove("is-col-resize-target", "is-col-reorder-target");
    });
  }

  function syncPreviewTable(previewHeaders = getHeaders()) {
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

  function applyColumnWidth(columnIndex, columnName, width) {
    const nextWidth = Math.max(MIN_PREVIEW_COLUMN_WIDTH, Math.round(width));
    setColumnWidth?.(columnIndex, columnName, nextWidth);
    previewEl.querySelectorAll(`[data-column-index="${columnIndex}"]`).forEach((cell) => {
      cell.style.width = `${nextWidth}px`;
      cell.style.minWidth = `${nextWidth}px`;
      cell.style.maxWidth = `${nextWidth}px`;
    });
  }

  function autosizeColumn(columnIndex, columnName) {
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
          if (nameInput) {
            nameWidth += (
              parseFloat(nameStyles.paddingLeft || "0")
              + parseFloat(nameStyles.paddingRight || "0")
              + parseFloat(nameStyles.borderLeftWidth || "0")
              + parseFloat(nameStyles.borderRightWidth || "0")
            );
          }
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
    const previousWidth = getColumnWidths?.()?.[columnName];
    const startWidth = Number.isFinite(previousWidth) ? previousWidth : cells[0].getBoundingClientRect().width;
    applyColumnWidth(columnIndex, columnName, maxWidth);
    const nextWidth = getColumnWidths?.()?.[columnName];
    onResizeComplete?.({
      columnName,
      previousWidth,
      nextWidth,
      startWidth,
      autoSized: true,
    });
  }

  function updateActiveResizeWidth() {
    if (!activeResize) return;
    const nextWidth = activeResize.startWidth
      + (activeResize.currentX - activeResize.startX)
      + (tableWrap.scrollLeft - activeResize.startScrollLeft);
    applyColumnWidth(activeResize.columnIndex, activeResize.columnName, nextWidth);
  }

  function applyActiveReorderAtPointer(pointerX) {
    if (!activeReorder) return;
    const currentHeaders = getHeaders();
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

    reorderColumn?.(activeReorder.columnName, nextIndex);
    syncPreviewTable(getHeaders());
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
          setScrollLeft?.(tableWrap.scrollLeft);
          setScrollTop?.(tableWrap.scrollTop);
          if (activeResize) updateActiveResizeWidth();
          if (activeReorder) applyActiveReorderAtPointer(activeReorder.currentX);
        }
    }
    if (activeResize || activeReorder) {
      autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
    }
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

    if (activeResize) {
      const completedResize = activeResize;
      const nextWidth = getColumnWidths?.()?.[completedResize.columnName];
      onResizeComplete?.({
        columnName: completedResize.columnName,
        previousWidth: completedResize.previousWidth,
        nextWidth,
        startWidth: completedResize.startWidth,
        autoSized: false,
      });
    }

    if (activeReorder) {
      onReorderComplete?.({
        previousOrder: activeReorder.previousOrder,
        nextOrder: [...getHeaders()],
        dragging: activeReorder.dragging,
      });
    }

    activeResize = null;
    activeReorder = null;
    setScrollLeft?.(tableWrap.scrollLeft);
    setScrollTop?.(tableWrap.scrollTop);
    requestRender?.();
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
      autosizeColumn(columnIndex, headers[columnIndex]);
      requestRender?.();
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
          previousOrder: [...getHeaders()],
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
        previousWidth: getColumnWidths?.()?.[headers[columnIndex]],
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
