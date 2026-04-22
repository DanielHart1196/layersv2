import {
  DECK_EARTH_ROW_ID,
  DECK_EARTH_TARGET_IDS,
  getRowRuntimeTargetId,
  getRowStateKey,
} from "../core/layer-definitions.js";

function formatRowValue(row, value) {
  if (row?.valueFormat === "points") {
    return `${Number(value) || 0}pt`;
  }

  if (row?.valueFormat === "pixels") {
    return `${Number(value) || 0}px`;
  }

  if (row?.valueFormat === "percent") {
    return `${Math.round(Number(value) || 0)}%`;
  }

  return String(value ?? "");
}

const SETTINGS_BACKGROUND_PRESETS = ["#000000", "#FFFFFF", "#d94b4b", "#e58a2b", "#e5c84a", "#5b8c5a", "#4b6ed9", "#8c5bd6"];
const SETTINGS_BACKGROUND_STORAGE_KEY = "layerv2.colors.settingsBackground";
const SCREEN_BACKGROUND_STORAGE_KEY = "layerv2.colors.screenBackground";
const DEFAULT_SETTINGS_BACKGROUND = {
  color: "#FFFFFF",
  opacity: 0,
};
const DEFAULT_SCREEN_BACKGROUND = {
  color: "#000000",
  opacity: 100,
};
const LAYER_MENU_VIEWPORT_MARGIN = 12;
const OCEAN_LEGEND_RADIUS_PX = 9.2;

function normalizeHexColor(value) {
  const normalized = String(value ?? "").trim().replace(/^#*/, "");
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `#${normalized.toUpperCase()}`;
  }

  return null;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function hexToRgbaString(hex, opacity = 100, fallback = "rgba(255, 255, 255, 1)") {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return fallback;
  }

  const alpha = Math.max(0, Math.min(1, (Number(opacity) || 0) / 100));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function createSvgElement(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
  }

  return {
    h: (h * 60 + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToHex({ h, s, v }) {
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs(hp % 2 - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) {
    r1 = c; g1 = x;
  } else if (hp < 2) {
    r1 = x; g1 = c;
  } else if (hp < 3) {
    g1 = c; b1 = x;
  } else if (hp < 4) {
    g1 = x; b1 = c;
  } else if (hp < 5) {
    r1 = x; b1 = c;
  } else {
    r1 = c; b1 = x;
  }

  const m = v - c;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return normalizeHexColor(`#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`);
}

function getStoredColors(storageKey) {
  if (!storageKey) {
    return [];
  }

  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeHexColor).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function saveStoredColors(storageKey, colors) {
  if (!storageKey) {
    return;
  }

  window.localStorage?.setItem(storageKey, JSON.stringify(colors.slice(0, 10)));
}

function applySettingsBackground(panel, appearanceButton, state) {
  const rgb = hexToRgb(state?.color ?? DEFAULT_SETTINGS_BACKGROUND.color) ?? hexToRgb(DEFAULT_SETTINGS_BACKGROUND.color);
  if (!rgb || !panel) {
    return;
  }

  const alpha = (Number(state?.opacity) || 0) / 100;
  const fillColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  panel.style.backgroundColor = fillColor;
  appearanceButton?.style.setProperty("--swatch-color", normalizeHexColor(state?.color) ?? DEFAULT_SETTINGS_BACKGROUND.color);

  const layerMenuButton = document.getElementById("layerMenuButton");
  const refreshButton = document.getElementById("mobileRefreshButton");
  if (layerMenuButton) {
    layerMenuButton.style.backgroundColor = fillColor;
  }
  if (refreshButton) {
    refreshButton.style.backgroundColor = fillColor;
  }
}

function applyScreenBackground(state, screenButton) {
  const rgb = hexToRgb(state?.color ?? DEFAULT_SCREEN_BACKGROUND.color) ?? hexToRgb(DEFAULT_SCREEN_BACKGROUND.color);
  const mapStage = document.getElementById("mapStage");
  if (!rgb || !mapStage) {
    return;
  }

  const alpha = (Number(state?.opacity) || 0) / 100;
  const fillColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  mapStage.style.backgroundColor = fillColor;
  screenButton?.style.setProperty("--swatch-color", normalizeHexColor(state?.color) ?? DEFAULT_SCREEN_BACKGROUND.color);
}

function applyDeckEarthButtonState(layerModel, earthButton) {
  const oceanFill = layerModel.getState()?.[DECK_EARTH_TARGET_IDS.ocean]?.fillColor ?? "#2C6F92";
  earthButton?.style.setProperty("--swatch-color", normalizeHexColor(oceanFill) ?? "#2C6F92");
}

function createColorPressRuntime() {
  return {
    removePressTimer: null,
    deleteTarget: null,
    deleteColor: null,
    longPressTriggered: false,
  };
}

function clearColorRemovePressTimer(runtime) {
  if (runtime.removePressTimer !== null) {
    window.clearTimeout(runtime.removePressTimer);
    runtime.removePressTimer = null;
  }
}

function hideCustomColorRemoveButton(runtime) {
  runtime.deleteTarget?.classList.remove("is-delete-armed");
  runtime.deleteTarget = null;
  runtime.deleteColor = null;
}

function getRenderedLayerRow(parentId, rowId) {
  return document.querySelector(`.layer-menu-row[data-parent-id="${parentId}"][data-row-id="${rowId}"]`);
}

function getAdjacentPreviewOrder(rowIds, rowId, direction) {
  if (!Array.isArray(rowIds) || !rowIds.length || !rowId) {
    return null;
  }

  const sourceIndex = rowIds.indexOf(rowId);
  if (sourceIndex === -1) {
    return null;
  }

  const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
  if (targetIndex < 0 || targetIndex >= rowIds.length) {
    return null;
  }

  const nextOrder = rowIds.slice();
  const [moved] = nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, moved);
  return nextOrder;
}

function setupPointerReorderGrabber(grabber, parentId, rowId, reorderApi) {
  let activeGesture = null;
  let suppressClick = false;

  function cleanupGesture(commit = false) {
    const gesture = activeGesture;
    if (!gesture) {
      return;
    }

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    window.removeEventListener("pointerleave", handlePointerCancel);
    document.body.classList.remove("is-reordering-rows");

    if (gesture.dragging) {
      if (commit && Array.isArray(gesture.previewOrder)) {
        reorderApi.onCommit(parentId, gesture.previewOrder);
      } else {
        reorderApi.onCancel(parentId);
      }
      reorderApi.setDragging(null);
    }

    if (typeof grabber.releasePointerCapture === "function") {
      try {
        if (grabber.hasPointerCapture?.(gesture.pointerId)) {
          grabber.releasePointerCapture(gesture.pointerId);
        }
      } catch {
        // Ignore release errors from browsers that lose capture during teardown.
      }
    }

    if (gesture.dragging) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }

    activeGesture = null;
  }

  function handlePointerMove(event) {
    const gesture = activeGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.dragging) {
      if (Math.hypot(deltaX, deltaY) < 6) {
        return;
      }

      gesture.dragging = true;
      document.body.classList.add("is-reordering-rows");
      reorderApi.setDragging({ parentId, rowId });
    }

    event.preventDefault();

    const renderedRow = getRenderedLayerRow(parentId, rowId);
    if (!renderedRow) {
      return;
    }

    const rect = renderedRow.getBoundingClientRect();
    let direction = null;
    if (event.clientY < rect.top) {
      direction = "up";
    } else if (event.clientY > rect.bottom) {
      direction = "down";
    }

    if (!direction) {
      return;
    }

    const nextPreviewOrder = getAdjacentPreviewOrder(
      reorderApi.getOrderedRowIds(parentId),
      rowId,
      direction,
    );

    if (!nextPreviewOrder) {
      return;
    }

    if (
      Array.isArray(gesture.previewOrder)
      && gesture.previewOrder.length === nextPreviewOrder.length
      && gesture.previewOrder.every((value, index) => value === nextPreviewOrder[index])
    ) {
      return;
    }

    // Collapse any expanded row being jumped over before the preview re-renders.
    const orderedIds = reorderApi.getOrderedRowIds(parentId);
    const currentIndex = orderedIds.indexOf(rowId);
    const jumpedIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (jumpedIndex >= 0 && jumpedIndex < orderedIds.length) {
      reorderApi.collapseRow(orderedIds[jumpedIndex]);
    }

    gesture.previewOrder = nextPreviewOrder;
    reorderApi.onPreview(parentId, nextPreviewOrder);
  }

  function handlePointerUp(event) {
    if (!activeGesture || event.pointerId !== activeGesture.pointerId) {
      return;
    }

    event.preventDefault();
    cleanupGesture(true);
  }

  function handlePointerCancel(event) {
    if (!activeGesture || event.pointerId !== activeGesture.pointerId) {
      return;
    }

    cleanupGesture(false);
  }

  grabber.addEventListener("click", (event) => {
    event.stopPropagation();
    if (suppressClick) {
      event.preventDefault();
    }
  });

  grabber.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    activeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      previewOrder: null,
    };

    if (typeof grabber.setPointerCapture === "function") {
      try {
        grabber.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures and fall back to window listeners.
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("pointerleave", handlePointerCancel);
  });
}

function createRowHeader(labelText, valueText = null, className, options = {}) {
  const header = document.createElement("div");
  header.className = className;

  const leading = document.createElement("div");
  leading.className = "layer-menu-row-leading";
  header.append(leading);

  if (options.grabber) {
    const grabber = document.createElement("button");
    grabber.type = "button";
    grabber.className = "layer-menu-row-grabber";
    grabber.setAttribute("aria-label", "Reorder row");
    grabber.innerHTML = "<span></span><span></span>";
    leading.append(grabber);
  }

  const label = options.labelButton ? document.createElement("button") : document.createElement("span");
  label.className = options.labelButton ? "layer-menu-row-toggle" : "layer-menu-row-label";
  if (options.labelButton) {
    label.type = "button";
    const labelTextNode = document.createElement("span");
    labelTextNode.className = "layer-menu-row-label";
    labelTextNode.textContent = labelText;
    label.append(labelTextNode);
  } else {
    label.textContent = labelText;
  }
  leading.append(label);

  if (options.chevron) {
    const chevron = options.chevronButton ? document.createElement("button") : document.createElement("span");
    chevron.className = options.chevronButton ? "layer-menu-row-chevron-button" : "layer-menu-row-chevron";
    if (options.chevronButton) {
      chevron.type = "button";
    } else {
      chevron.setAttribute("aria-hidden", "true");
    }
    chevron.textContent = "›";
    if (options.chevronExpanded) {
      chevron.classList.add("is-expanded");
    }
    header.append(chevron);
  }

  if (valueText !== null) {
    const valueLabel = document.createElement("span");
    valueLabel.className = "layer-menu-row-value";
    valueLabel.textContent = valueText;
    header.append(valueLabel);
  }

  return {
    header,
    label,
    chevron: header.querySelector(".layer-menu-row-chevron, .layer-menu-row-chevron-button"),
    grabber: header.querySelector(".layer-menu-row-grabber"),
  };
}

function normalizeLegendGeometryType(geometryType) {
  if (geometryType === "point") return "point";
  if (geometryType === "line") return "line";
  if (geometryType === "polygon" || geometryType === "area") return "polygon";
  return "mixed";
}

function normalizeLegendGeometryTypes(geometryTypes = [], geometryType = "mixed") {
  const source = Array.isArray(geometryTypes) && geometryTypes.length
    ? geometryTypes
    : [geometryType];
  const normalized = source.map((value) => normalizeLegendGeometryType(value)).filter((value) => value !== "mixed");
  return ["point", "line", "polygon"].filter((family) => normalized.includes(family));
}

function getLayerLegendRuntimeId(definition, state) {
  return state?.runtimeTargetId
    ?? definition.runtimeLayerId
    ?? definition.layerRef
    ?? definition.layerId
    ?? definition.id;
}

function getLayerLegendChildState(childRows, runtimeTargetId, layerModel, appearanceState) {
  const row = childRows.find((candidate) => candidate.runtimeTargetId === runtimeTargetId);
  if (!row) {
    return null;
  }

  return {
    row,
    value: getDisplayRowValue(row, layerModel, appearanceState),
    visible: layerModel.isRowVisible(row.id),
  };
}

function getLayerLegendSpec(definition, state, layerModel, appearanceState) {
  const geometryType = normalizeLegendGeometryType(definition?.geometryType);
  const geometryTypes = normalizeLegendGeometryTypes(definition?.geometryTypes, definition?.geometryType);
  if (!definition?.id) {
    return null;
  }

  const runtimeLayerId = getLayerLegendRuntimeId(definition, state);
  const childRows = layerModel.getChildRows(definition.id);
  if (!runtimeLayerId || !childRows.length) {
    return null;
  }

  if (definition.id === "ocean") {
    const fillState = getLayerLegendChildState(childRows, `${runtimeLayerId}::fill`, layerModel, appearanceState);
    if (!fillState) {
      return null;
    }
    return {
      kind: "point",
      fillColor: fillState.value?.color ?? "#FFFFFF",
      fillOpacity: fillState.visible ? fillState.value.opacity : 0,
      radius: OCEAN_LEGEND_RADIUS_PX,
      strokeColor: "#FFFFFF",
      strokeOpacity: 0,
      strokeWeight: 0,
    };
  }

  if (geometryTypes.length > 1) {
    const items = [];

    if (geometryTypes.includes("polygon")) {
      const fillState = getLayerLegendChildState(childRows, `${runtimeLayerId}::fill`, layerModel, appearanceState);
      const lineState = getLayerLegendChildState(childRows, `${runtimeLayerId}::line`, layerModel, appearanceState);
      if (fillState || lineState) {
        items.push({
          kind: "polygon",
          fillColor: fillState?.value?.color ?? "#FFFFFF",
          fillOpacity: fillState?.visible ? fillState.value.opacity : 0,
          lineColor: lineState?.value?.color ?? "#FFFFFF",
          lineOpacity: lineState?.visible ? lineState.value.opacity : 0,
          lineWeight: lineState?.visible ? lineState.value.weight : 0,
          drawOrder: ["fill", "line"],
        });
      }
    }

    if (geometryTypes.includes("line")) {
      const lineState = getLayerLegendChildState(childRows, `${runtimeLayerId}::line`, layerModel, appearanceState);
      if (lineState?.value) {
        items.push({
          kind: "line",
          color: lineState.value.color,
          opacity: lineState.visible ? lineState.value.opacity : 0,
          weight: lineState.visible ? lineState.value.weight : 0,
        });
      }
    }

    if (geometryTypes.includes("point")) {
      const fillState = getLayerLegendChildState(childRows, `${runtimeLayerId}::point-fill`, layerModel, appearanceState);
      const strokeState = getLayerLegendChildState(childRows, `${runtimeLayerId}::point-stroke`, layerModel, appearanceState);
      if (fillState || strokeState) {
        items.push({
          kind: "point",
          fillColor: fillState?.value?.color ?? "#FFFFFF",
          fillOpacity: fillState?.visible ? fillState.value.opacity : 0,
          radius: Number(fillState?.value?.radius ?? 0),
          strokeColor: strokeState?.value?.color ?? "#FFFFFF",
          strokeOpacity: strokeState?.visible ? strokeState.value.opacity : 0,
          strokeWeight: strokeState?.visible ? strokeState.value.weight : 0,
        });
      }
    }

    if (!items.length) {
      return null;
    }

    return {
      kind: "composite",
      items,
    };
  }

  if (geometryType === "mixed") {
    return null;
  }

  if (geometryType === "line") {
    const lineState = getLayerLegendChildState(childRows, `${runtimeLayerId}::line`, layerModel, appearanceState);
    if (!lineState?.value) {
      return null;
    }
    return {
      kind: "line",
      color: lineState.value.color,
      opacity: lineState.visible ? lineState.value.opacity : 0,
      weight: lineState.visible ? lineState.value.weight : 0,
    };
  }

  if (geometryType === "polygon") {
    const fillState = getLayerLegendChildState(childRows, `${runtimeLayerId}::fill`, layerModel, appearanceState);
    const lineState = getLayerLegendChildState(childRows, `${runtimeLayerId}::line`, layerModel, appearanceState);
    if (!fillState && !lineState) {
      return null;
    }

    return {
      kind: "polygon",
      fillColor: fillState?.value?.color ?? "#FFFFFF",
      fillOpacity: fillState?.visible ? fillState.value.opacity : 0,
      lineColor: lineState?.value?.color ?? "#FFFFFF",
      lineOpacity: lineState?.visible ? lineState.value.opacity : 0,
      lineWeight: lineState?.visible ? lineState.value.weight : 0,
      drawOrder: childRows
        .filter((childRow) => childRow?.runtimeTargetId === `${runtimeLayerId}::fill` || childRow?.runtimeTargetId === `${runtimeLayerId}::line`)
        .map((childRow) => (childRow.runtimeTargetId.endsWith("::fill") ? "fill" : "line"))
        .reverse(),
    };
  }

  if (geometryType === "point") {
    const fillState = getLayerLegendChildState(childRows, `${runtimeLayerId}::point-fill`, layerModel, appearanceState);
    const strokeState = getLayerLegendChildState(childRows, `${runtimeLayerId}::point-stroke`, layerModel, appearanceState);
    if (!fillState && !strokeState) {
      return null;
    }
    return {
      kind: "point",
      fillColor: fillState?.value?.color ?? "#FFFFFF",
      fillOpacity: fillState?.visible ? fillState.value.opacity : 0,
      radius: Number(fillState?.value?.radius ?? 0),
      strokeColor: strokeState?.value?.color ?? "#FFFFFF",
      strokeOpacity: strokeState?.visible ? strokeState.value.opacity : 0,
      strokeWeight: strokeState?.visible ? strokeState.value.weight : 0,
    };
  }

  return null;
}

function createLayerLegendSwatch(spec) {
  if (!spec) {
    return null;
  }

  const swatch = document.createElement("span");
  swatch.className = `layer-menu-row-legend layer-menu-row-legend-${spec.kind}`;
  swatch.setAttribute("aria-hidden", "true");
  const svg = createSvgElement("svg");
  svg.classList.add("layer-menu-row-legend-svg");
  svg.setAttribute("viewBox", "0 0 42 18");
  svg.setAttribute("width", "42");
  svg.setAttribute("height", "18");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  if (spec.kind === "line") {
    const line = createSvgElement("line");
    line.setAttribute("x1", "2");
    line.setAttribute("y1", "9");
    line.setAttribute("x2", "40");
    line.setAttribute("y2", "9");
    line.setAttribute("stroke", normalizeHexColor(spec.color) ?? "#FFFFFF");
    line.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(spec.opacity) || 0) / 100))));
    line.setAttribute("stroke-width", String(Math.max(0, Number(spec.weight) || 0)));
    line.setAttribute("stroke-linecap", "round");
    svg.append(line);
    swatch.append(svg);
    return swatch;
  }

  if (spec.kind === "composite") {
    const items = Array.isArray(spec.items) ? spec.items : [];
    const slots = [
      { x: 7, width: 10, cx: 12 },
      { x: 16, width: 10, cx: 21 },
      { x: 25, width: 10, cx: 30 },
    ];

    items.slice(0, slots.length).forEach((item, index) => {
      const slot = slots[index];
      if (item.kind === "polygon") {
        const fillRect = createSvgElement("rect");
        fillRect.setAttribute("x", String(slot.x));
        fillRect.setAttribute("y", "4");
        fillRect.setAttribute("width", String(slot.width));
        fillRect.setAttribute("height", "10");
        fillRect.setAttribute("rx", "1.5");
        fillRect.setAttribute("ry", "1.5");
        fillRect.setAttribute("fill", normalizeHexColor(item.fillColor) ?? "#FFFFFF");
        fillRect.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, (Number(item.fillOpacity) || 0) / 100))));
        fillRect.setAttribute("stroke", normalizeHexColor(item.lineColor) ?? "#FFFFFF");
        fillRect.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(item.lineOpacity) || 0) / 100))));
        fillRect.setAttribute("stroke-width", String(Math.max(0, Number(item.lineWeight) || 0)));
        svg.append(fillRect);
        return;
      }

      if (item.kind === "line") {
        const line = createSvgElement("line");
        line.setAttribute("x1", String(slot.x));
        line.setAttribute("y1", "9");
        line.setAttribute("x2", String(slot.x + slot.width));
        line.setAttribute("y2", "9");
        line.setAttribute("stroke", normalizeHexColor(item.color) ?? "#FFFFFF");
        line.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(item.opacity) || 0) / 100))));
        line.setAttribute("stroke-width", String(Math.max(0, Number(item.weight) || 0)));
        line.setAttribute("stroke-linecap", "round");
        svg.append(line);
        return;
      }

      if (item.kind === "point") {
        const fillRadius = Math.max(0, Math.min(4.5, Number(item.radius) || 0));
        const strokeWidth = Math.max(0, Math.min(3, Number(item.strokeWeight) || 0));
        if (strokeWidth > 0) {
          const strokeRing = createSvgElement("circle");
          strokeRing.setAttribute("cx", String(slot.cx));
          strokeRing.setAttribute("cy", "9");
          strokeRing.setAttribute("r", String(fillRadius + strokeWidth / 2));
          strokeRing.setAttribute("fill", "none");
          strokeRing.setAttribute("stroke", normalizeHexColor(item.strokeColor) ?? "#FFFFFF");
          strokeRing.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(item.strokeOpacity) || 0) / 100))));
          strokeRing.setAttribute("stroke-width", String(strokeWidth));
          svg.append(strokeRing);
        }

        const fillDot = createSvgElement("circle");
        fillDot.setAttribute("cx", String(slot.cx));
        fillDot.setAttribute("cy", "9");
        fillDot.setAttribute("r", String(fillRadius));
        fillDot.setAttribute("fill", normalizeHexColor(item.fillColor) ?? "#FFFFFF");
        fillDot.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, (Number(item.fillOpacity) || 0) / 100))));
        svg.append(fillDot);
      }
    });

    swatch.append(svg);
    return swatch;
  }

  if (spec.kind === "polygon") {
    const strokeWidth = Math.max(0, Number(spec.lineWeight) || 0);
    const x = "8";
    const y = "2";
    const width = "26";
    const height = "14";
    const fillOpacity = String(Math.max(0, Math.min(1, (Number(spec.fillOpacity) || 0) / 100)));
    const lineOpacity = String(Math.max(0, Math.min(1, (Number(spec.lineOpacity) || 0) / 100)));
    const fillColor = normalizeHexColor(spec.fillColor) ?? "#FFFFFF";
    const lineColor = normalizeHexColor(spec.lineColor) ?? "#FFFFFF";
    const drawOrder = Array.isArray(spec.drawOrder) && spec.drawOrder.length ? spec.drawOrder : ["fill", "line"];

    drawOrder.forEach((part) => {
      const rect = createSvgElement("rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", width);
      rect.setAttribute("height", height);
      rect.setAttribute("rx", "2.5");
      rect.setAttribute("ry", "2.5");

      if (part === "line") {
        rect.setAttribute("fill", "none");
        rect.setAttribute("stroke", lineColor);
        rect.setAttribute("stroke-opacity", lineOpacity);
        rect.setAttribute("stroke-width", String(strokeWidth));
      } else {
        rect.setAttribute("fill", fillColor);
        rect.setAttribute("fill-opacity", fillOpacity);
        rect.setAttribute("stroke", "none");
      }

      svg.append(rect);
    });

    swatch.append(svg);
    return swatch;
  }

  if (spec.kind === "point") {
    const fillRadius = Math.max(0, Number(spec.radius) || 0);
    const strokeWidth = Math.max(0, Number(spec.strokeWeight) || 0);

    if (strokeWidth > 0) {
      const strokeRing = createSvgElement("circle");
      strokeRing.setAttribute("cx", "21");
      strokeRing.setAttribute("cy", "9");
      strokeRing.setAttribute("r", String(fillRadius + strokeWidth / 2));
      strokeRing.setAttribute("fill", "none");
      strokeRing.setAttribute("stroke", normalizeHexColor(spec.strokeColor) ?? "#FFFFFF");
      strokeRing.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(spec.strokeOpacity) || 0) / 100))));
      strokeRing.setAttribute("stroke-width", String(strokeWidth));
      svg.append(strokeRing);
    }

    const fillDot = createSvgElement("circle");
    fillDot.setAttribute("cx", "21");
    fillDot.setAttribute("cy", "9");
    fillDot.setAttribute("r", String(fillRadius));
    fillDot.setAttribute("fill", normalizeHexColor(spec.fillColor) ?? "#FFFFFF");
    fillDot.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, (Number(spec.fillOpacity) || 0) / 100))));
    svg.append(fillDot);
    swatch.append(svg);
    return swatch;
  }

  return null;
}

function wireLayerLegendToggle(legend, state, expandStateKey, onToggleExpanded, { enabled = true } = {}) {
  if (!legend || !enabled || !expandStateKey || typeof onToggleExpanded !== "function") {
    return legend;
  }

  legend.style.cursor = "pointer";
  legend.setAttribute("role", "button");
  legend.setAttribute("tabindex", "0");
  legend.setAttribute("aria-label", state?.expanded ? "Hide style rows" : "Show style rows");

  const toggleStyleRows = (event) => {
    event?.stopPropagation?.();
    onToggleExpanded(expandStateKey);
  };

  legend.addEventListener("click", toggleStyleRows);
  legend.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleStyleRows(event);
    }
  });

  return legend;
}

function updateLayerLegendSwatch(rowElement, legendSpec, { state = null, expandStateKey = null, onToggleExpanded = null, toggleEnabled = false } = {}) {
  if (!rowElement) {
    return;
  }

  const header = rowElement.querySelector(".layer-menu-row-layer-header");
  if (!header) {
    return;
  }

  const existingLegend = header.querySelector(".layer-menu-row-legend");
  const nextLegend = createLayerLegendSwatch(legendSpec);

  if (!nextLegend) {
    existingLegend?.remove();
    return;
  }

  wireLayerLegendToggle(nextLegend, state, expandStateKey, onToggleExpanded, { enabled: toggleEnabled });

  if (existingLegend) {
    existingLegend.replaceWith(nextLegend);
    return;
  }

  const chevron = header.querySelector(".layer-menu-row-chevron, .layer-menu-row-chevron-button");
  if (chevron) {
    header.insertBefore(nextLegend, chevron);
    return;
  }

  header.append(nextLegend);
}

function isStyleChildRow(row) {
  return row?.type === "fill" || row?.type === "line" || row?.type === "point";
}

function createLayerRow(definition, state, parentId, inheritedHidden, onToggleExpanded, onToggleVisibility, reorderApi, dragState, childRows = [], legendSpec = null, onDataAction = null) {
  const row = document.createElement("div");
  row.className = "layer-menu-row layer-menu-row-layer";
  row.dataset.rowId = definition.id;
  const expandStateKey = definition.layerId ?? definition.id;
  const hasChildren = Array.isArray(definition.rows) && definition.rows.length > 0;
  const isEarthParent = definition.id === "earth";
  const hasStyleChildren = childRows.some(isStyleChildRow);
  const hasVisibility = Boolean(definition.layerId);
  const isExpandable = isEarthParent && (hasChildren || Boolean(definition.layerId));
  const isReorderable = Boolean(parentId && definition.layerId && definition.id !== "ocean" && definition.id !== "earth");
  const { header, label, chevron, grabber } = createRowHeader(definition.label, null, "layer-menu-row-header layer-menu-row-layer-header", {
    grabber: isReorderable,
    labelButton: hasVisibility || !isExpandable,
    chevron: isExpandable,
    chevronButton: isExpandable,
    chevronExpanded: Boolean(state?.expanded),
  });
  if (definition?.layerRef) {
    const gearButton = document.createElement("button");
    gearButton.type = "button";
    gearButton.className = "layer-menu-row-gear";
    gearButton.setAttribute("aria-label", "Open layer data view");
    gearButton.innerHTML = '<span aria-hidden="true">⚙</span>';
    gearButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onDataAction?.(definition);
    });
    header.append(gearButton);
  }
  const legend = createLayerLegendSwatch(legendSpec);
  if (legend) {
    if (inheritedHidden || state?.visible === false) {
      legend.classList.add("is-hidden");
    }
    const gearButton = header.querySelector(".layer-menu-row-gear");
    if (gearButton) {
      header.insertBefore(legend, chevron ?? null);
    } else if (chevron) {
      header.insertBefore(legend, chevron);
    } else {
      header.append(legend);
    }
  }
  row.append(header);
  if (isReorderable) {
    row.dataset.parentId = parentId;
    if (dragState?.parentId === parentId && dragState?.rowId === definition.id) {
      row.classList.add("is-dragging");
    }
  }

  if (isExpandable) {
    row.classList.add("is-expandable");
    row.setAttribute("aria-expanded", String(Boolean(state?.expanded)));
    row.dataset.expandKey = expandStateKey;
  } else if (hasStyleChildren) {
    row.dataset.expandKey = expandStateKey;
    row.setAttribute("aria-expanded", String(Boolean(state?.expanded)));
  }

  if (hasVisibility) {
    row.classList.toggle("is-hidden", inheritedHidden || state?.visible === false);
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      onToggleVisibility(definition);
    });
  } else if (!isExpandable) {
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      onToggleExpanded(definition.id);
    });
  }

  chevron?.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggleExpanded(expandStateKey);
  });

  if (grabber && isReorderable) {
    setupPointerReorderGrabber(grabber, parentId, definition.id, reorderApi);
  }

  if (isExpandable) {
    header.addEventListener("click", (event) => {
      if (
        event.target?.closest?.(".layer-menu-row-grabber")
        || event.target?.closest?.(".layer-menu-row-toggle")
        || event.target?.closest?.(".layer-menu-row-chevron-button")
      ) {
        return;
      }
      onToggleExpanded(expandStateKey);
    });
  }

  if (!isEarthParent && hasStyleChildren && legend) {
    wireLayerLegendToggle(legend, state, expandStateKey, onToggleExpanded, { enabled: true });
  }

  return row;
}

function createSliderRow(row, value, onInput, { inheritedHidden = false } = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "layer-menu-row layer-menu-row-slider";
  const { header, valueLabel } = (() => {
    const { header, label } = createRowHeader(row.label, formatRowValue(row, value), "layer-menu-slider-header");
    const valueLabel = header.querySelector(".layer-menu-row-value");
    return { header, label, valueLabel };
  })();

  const input = document.createElement("input");
  input.className = "layer-menu-slider";
  input.type = "range";
  input.min = String(row.min);
  input.max = String(row.max);
  input.step = String(row.step);
  input.value = String(value);
  input.disabled = inheritedHidden;
  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    valueLabel.textContent = formatRowValue(row, nextValue);
    onInput(nextValue);
  });

  wrapper.classList.toggle("is-hidden", inheritedHidden);
  wrapper.append(header, input);
  return wrapper;
}

function createOpacitySlider(inputClassName, row, value, onInput) {
  const slider = document.createElement("input");
  slider.className = inputClassName;
  slider.type = "range";
  slider.min = String(row.min);
  slider.max = String(row.max);
  slider.step = String(row.step);
  slider.value = String(value);
  slider.addEventListener("input", () => {
    onInput(Number(slider.value));
  });
  return slider;
}

function createSliderBlock({ label, row, value, onInput, className = "" }) {
  const block = document.createElement("div");
  block.className = className ? className : "layer-menu-row-fill-opacity";
  const { header } = createRowHeader(label, formatRowValue(row, value), "layer-menu-slider-header");
  const sliderValue = header.querySelector(".layer-menu-row-value");

  const slider = createOpacitySlider("layer-menu-slider", row, value, (nextValue) => {
    sliderValue.textContent = formatRowValue(row, nextValue);
    onInput(nextValue);
  });

  block.append(header, slider);
  return block;
}

function createColorRow(row, value, onInput, requestRender) {
  const wrapper = document.createElement("div");
  wrapper.className = "layer-menu-row layer-menu-row-color";
  let currentHex = normalizeHexColor(value) ?? "#8C6A2A";
  let currentHsv = rgbToHsv(hexToRgb(currentHex));
  const pressRuntime = createColorPressRuntime();
  const persistedUiState = requestRender?.__getColorRowUiState?.(row.id) ?? null;
  const { header } = createRowHeader(row.label, formatRowValue(row, currentHex), "layer-menu-color-header");
  const valueLabel = header.querySelector(".layer-menu-row-value");

  const swatches = document.createElement("div");
  swatches.className = "layer-menu-color-swatches";

  const storedColors = getStoredColors(row.storageKey);
  const presetColors = row.presets ?? [];
  let addButton = null;

  function syncAddButtonState() {
    if (!addButton) {
      return;
    }

    const isDeleteArmed = Boolean(pressRuntime.deleteColor);
    const isOpen = panel.classList.contains("is-open");
    addButton.classList.toggle("is-open", isOpen && !isDeleteArmed);
    addButton.classList.toggle("is-delete-armed", isDeleteArmed);
    addButton.textContent = isDeleteArmed ? "−" : "+";
    addButton.setAttribute("aria-label", isDeleteArmed ? "Delete saved color" : (isOpen ? "Close color picker" : "Open color picker"));
  }

  function buildUiState() {
    return {
      rowId: row.id,
      swatchScrollLeft: swatches.scrollLeft,
      panelOpen: panel.classList.contains("is-open"),
    };
  }

  if (row.storageKey) {
    addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "layer-menu-color-swatch layer-menu-color-swatch-add";
    addButton.setAttribute("aria-label", "Open color picker");
    addButton.textContent = "+";
    swatches.append(addButton);
  }

  function createSwatchButton(color, { removable = false } = {}) {
    if (!removable) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "layer-menu-color-swatch";
      button.setAttribute("aria-label", `Choose ${color}`);
      button.style.setProperty("--swatch-color", color);
      if (String(color).toLowerCase() === String(currentHex).toLowerCase()) {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => {
        currentHex = normalizeHexColor(color) ?? currentHex;
        currentHsv = rgbToHsv(hexToRgb(currentHex));
        onInput(color);
        requestRender(buildUiState());
      });
      return button;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "layer-menu-color-swatch";
    button.setAttribute("aria-label", `Choose ${color}`);
    button.style.setProperty("--swatch-color", color);
    if (String(color).toLowerCase() === String(currentHex).toLowerCase()) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => {
      if (pressRuntime.longPressTriggered) {
        pressRuntime.longPressTriggered = false;
        return;
      }
      currentHex = normalizeHexColor(color) ?? currentHex;
      currentHsv = rgbToHsv(hexToRgb(currentHex));
      hideCustomColorRemoveButton(pressRuntime);
      syncAddButtonState();
      onInput(color);
      requestRender(buildUiState());
    });

    const startLongPress = () => {
      clearColorRemovePressTimer(pressRuntime);
      pressRuntime.longPressTriggered = false;
      pressRuntime.removePressTimer = window.setTimeout(() => {
        if (pressRuntime.deleteTarget && pressRuntime.deleteTarget !== button) {
          pressRuntime.deleteTarget.classList.remove("is-delete-armed");
        }
        pressRuntime.deleteTarget = button;
        pressRuntime.deleteTarget.classList.add("is-delete-armed");
        pressRuntime.deleteColor = color;
        pressRuntime.longPressTriggered = true;
        pressRuntime.removePressTimer = null;
        syncAddButtonState();
      }, 300);
    };

    const cancelLongPress = () => {
      clearColorRemovePressTimer(pressRuntime);
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      startLongPress();
    });
    button.addEventListener("pointerup", cancelLongPress);
    button.addEventListener("pointerleave", cancelLongPress);
    button.addEventListener("pointercancel", cancelLongPress);
    button.addEventListener("touchstart", startLongPress, { passive: true });
    button.addEventListener("touchend", cancelLongPress, { passive: true });
    button.addEventListener("touchcancel", cancelLongPress, { passive: true });
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    return button;
  }

  storedColors.forEach((preset) => {
    swatches.append(createSwatchButton(preset, { removable: true }));
  });

  presetColors.forEach((preset) => {
    const button = document.createElement("button");
    swatches.append(createSwatchButton(preset));
  });

  const panel = document.createElement("div");
  panel.className = "layer-menu-color-panel";
  panel.hidden = true;

  const field = document.createElement("div");
  field.className = "layer-menu-color-field";
  const fieldHandle = document.createElement("span");
  fieldHandle.className = "layer-menu-color-field-handle";
  field.append(fieldHandle);

  const hue = document.createElement("div");
  hue.className = "layer-menu-color-hue";
  const hueHandle = document.createElement("span");
  hueHandle.className = "layer-menu-color-hue-handle";
  hue.append(hueHandle);

  const inputRow = document.createElement("div");
  inputRow.className = "layer-menu-color-input-row";
  const hexInput = document.createElement("input");
  hexInput.className = "layer-menu-color-hex";
  hexInput.type = "text";
  hexInput.value = currentHex;
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "layer-menu-color-save";
  saveButton.textContent = "Add";
  inputRow.append(hexInput, saveButton);

  panel.append(field, hue, inputRow);

  function syncPickerUi() {
    valueLabel.textContent = formatRowValue(row, currentHex);
    hexInput.value = currentHex;
    field.style.setProperty("--picker-hue", `hsl(${currentHsv.h} 100% 50%)`);
    fieldHandle.style.left = `${currentHsv.s * 100}%`;
    fieldHandle.style.top = `${(1 - currentHsv.v) * 100}%`;
    hueHandle.style.left = `${(currentHsv.h / 360) * 100}%`;
  }

  function commitColor(nextHex, { persist = false, preserveHsv = false } = {}) {
    const normalized = normalizeHexColor(nextHex);
    if (!normalized) {
      return;
    }

    currentHex = normalized;
    if (!preserveHsv) {
      currentHsv = rgbToHsv(hexToRgb(currentHex));
    }
    onInput(currentHex);

    if (persist && row.storageKey) {
      const nextStoredColors = [currentHex, ...storedColors.filter((color) => color !== currentHex)];
      saveStoredColors(row.storageKey, nextStoredColors);
      syncPickerUi();
      requestRender(buildUiState());
      return;
    }

    syncPickerUi();
  }

  function bind2dPointer(target, onMove) {
    function updateFromEvent(event) {
      const rect = target.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      onMove({ x, y, width: rect.width, height: rect.height });
    }

    target.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      target.setPointerCapture?.(event.pointerId);
      updateFromEvent(event);
    });
    target.addEventListener("pointermove", (event) => {
      if ((event.buttons & 1) !== 1 && event.pointerType !== "touch") {
        return;
      }
      updateFromEvent(event);
    });
  }

  bind2dPointer(field, ({ x, y, width, height }) => {
    currentHsv = {
      ...currentHsv,
      s: width === 0 ? currentHsv.s : x / width,
      v: height === 0 ? currentHsv.v : 1 - (y / height),
    };
    commitColor(hsvToHex(currentHsv), { preserveHsv: true });
  });

  bind2dPointer(hue, ({ x, width }) => {
    const nextHueRatio = width === 0 ? (currentHsv.h / 360) : (x / width);
    currentHsv = {
      ...currentHsv,
      h: Math.min(nextHueRatio * 360, 359.999),
    };
    commitColor(hsvToHex(currentHsv), { preserveHsv: true });
  });

  hexInput.addEventListener("change", () => {
    commitColor(hexInput.value);
  });

  saveButton.addEventListener("click", () => {
    commitColor(hexInput.value, { persist: true });
  });

  addButton?.addEventListener("click", () => {
    if (pressRuntime.deleteColor) {
      const nextStoredColors = storedColors.filter((entry) => entry !== pressRuntime.deleteColor);
      saveStoredColors(row.storageKey, nextStoredColors);
      hideCustomColorRemoveButton(pressRuntime);
      syncAddButtonState();
      requestRender(buildUiState());
      return;
    }

    const nextOpen = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", nextOpen);
    panel.hidden = !nextOpen;
    hideCustomColorRemoveButton(pressRuntime);
    syncAddButtonState();
  });

  wrapper.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!swatches.contains(target) && !panel.contains(target)) {
      hideCustomColorRemoveButton(pressRuntime);
      clearColorRemovePressTimer(pressRuntime);
      pressRuntime.longPressTriggered = false;
      syncAddButtonState();
    }
  });

  syncPickerUi();
  if (persistedUiState?.panelOpen) {
    panel.classList.add("is-open");
    panel.hidden = false;
  }
  syncAddButtonState();
  wrapper.append(header, swatches, panel);
  if (persistedUiState && typeof persistedUiState.swatchScrollLeft === "number") {
    requestAnimationFrame(() => {
      swatches.scrollLeft = persistedUiState.swatchScrollLeft;
    });
  }
  return wrapper;
}

// ── Unified style row (fill / line / point) ───────────────────────────────────
// Shell: grabber + visibility toggle + label + optional remove button.
// Body: controls declared by the row definition (color, sliders).

function createStyleRow(row, value, onInput, requestRender, { parentId, reorderApi, isVisible, isExpanded, isExpandable = true, inheritedHidden = false, onToggleVisible, onToggleExpanded } = {}) {
  const isAppearanceRow = row?.colorTarget?.kind === "settings-background"
    || row?.opacityTarget?.kind === "settings-background"
    || row?.colorTarget?.kind === "screen-background"
    || row?.opacityTarget?.kind === "screen-background";
  const wrapper = document.createElement("div");
  wrapper.className = `layer-menu-row layer-menu-row-style`;
  wrapper.classList.toggle("is-hidden", inheritedHidden || !isVisible);
  if (isExpandable && !isAppearanceRow) {
    wrapper.classList.add("is-expandable");
    wrapper.setAttribute("aria-expanded", String(Boolean(isExpanded)));
    wrapper.dataset.expandKey = row.id;
  }

  // ── Shell header ────────────────────────────────────────────────────────────
  if (!isAppearanceRow) {
    const { header, label, chevron, grabber } = createRowHeader(row.label, null, "layer-menu-row-header layer-menu-style-header", {
      grabber: Boolean(parentId && reorderApi),
      labelButton: true,
      chevron: isExpandable,
      chevronButton: isExpandable,
      chevronExpanded: Boolean(isExpanded),
    });

    if (parentId && reorderApi) {
      wrapper.dataset.rowId = row.id;
      wrapper.dataset.parentId = parentId;
      if (reorderApi.dragState?.parentId === parentId && reorderApi.dragState?.rowId === row.id) {
        wrapper.classList.add("is-dragging");
      }
      setupPointerReorderGrabber(grabber, parentId, row.id, reorderApi);
    }

    label.setAttribute("aria-label", isVisible ? "Disable row" : "Enable row");
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleVisible?.();
    });
    if (isExpandable) {
      chevron?.addEventListener("click", (event) => {
        event.stopPropagation();
        onToggleExpanded?.();
      });
      header.addEventListener("click", (event) => {
        if (
          event.target?.closest?.(".layer-menu-row-grabber")
          || event.target?.closest?.(".layer-menu-row-toggle")
          || event.target?.closest?.(".layer-menu-row-gear")
          || event.target?.closest?.(".layer-menu-row-chevron-button")
        ) {
          return;
        }
        onToggleExpanded?.();
      });
    }

    wrapper.append(header);
  }

  // ── Body: controls ─────────────────────────────────────────────────────────
  const withRowContext = (target) => ({
    id: row.id,
    runtimeTargetId: row.runtimeTargetId,
    target,
  });

  let body = null;
  const ensureBody = () => {
    if (body) {
      return body;
    }
    body = document.createElement("div");
    body.className = "layer-menu-style-body";
    if (isAppearanceRow) {
      body.classList.add("layer-menu-style-body-standalone");
    }
    return body;
  };

  if (row.type === "fill" && isExpanded) {
    const bodyEl = ensureBody();
    const colorValue = value?.color ?? "#8C6A2A";
    const opacityValue = Number(value?.opacity ?? 100);
    const colorRow = createColorRow({
      id: `${row.id}-color`, label: isAppearanceRow ? row.label : "Color", type: "color",
      storageKey: row.storageKey, presets: row.presets,
    }, colorValue, (nextColor) => onInput(withRowContext(row.colorTarget), nextColor), requestRender);
    colorRow.classList.add("layer-menu-row-fill-color");
    const opacityBlock = createSliderBlock({
      label: "Opacity", row, value: opacityValue,
      onInput: (v) => onInput(withRowContext(row.opacityTarget), v),
    });
    bodyEl.append(colorRow, opacityBlock);
  }

  if (row.type === "line" && isExpanded) {
    const bodyEl = ensureBody();
    const weightValue = Number(value?.weight ?? 1);
    const colorValue = value?.color ?? "#C89A42";
    const opacityValue = Number(value?.opacity ?? 100);
    const weightBlock = createSliderBlock({
      label: "Weight", row: { ...row, min: row.weightMin, max: row.weightMax, step: row.weightStep, valueFormat: "pixels" },
      value: weightValue, onInput: (v) => onInput(withRowContext(row.weightTarget), v),
    });
    const colorRow = createColorRow({
      id: `${row.id}-color`, label: "Color", type: "color",
      storageKey: row.storageKey, presets: row.presets,
    }, colorValue, (nextColor) => onInput(withRowContext(row.colorTarget), nextColor), requestRender);
    colorRow.classList.add("layer-menu-row-line-color");
    const opacityBlock = createSliderBlock({
      label: "Opacity", row: { ...row, valueFormat: "percent" },
      value: opacityValue, onInput: (v) => onInput(withRowContext(row.opacityTarget), v),
    });
    bodyEl.append(weightBlock, colorRow, opacityBlock);
  }

  if (row.type === "point" && isExpanded) {
    const bodyEl = ensureBody();
    const radiusValue = Number(value?.radius ?? 6);
    const colorValue = value?.color ?? "#e74c3c";
    const opacityValue = Number(value?.opacity ?? 80);
    const radiusBlock = createSliderBlock({
      label: "Radius", row: { ...row, min: row.radiusMin, max: row.radiusMax, step: row.radiusStep, valueFormat: "pixels" },
      value: radiusValue, onInput: (v) => onInput(withRowContext(row.radiusTarget), v),
    });
    const colorRow = createColorRow({
      id: `${row.id}-color`, label: "Color", type: "color",
      storageKey: row.storageKey, presets: row.presets,
    }, colorValue, (nextColor) => onInput(withRowContext(row.colorTarget), nextColor), requestRender);
    colorRow.classList.add("layer-menu-row-point-color");
    const opacityBlock = createSliderBlock({
      label: "Opacity", row: { ...row, valueFormat: "percent" },
      value: opacityValue, onInput: (v) => onInput(withRowContext(row.opacityTarget), v),
    });
    bodyEl.append(radiusBlock, colorRow, opacityBlock);
  }

  if (body) {
    wrapper.append(body);
  }
  return wrapper;
}

function getDisplayRowValue(row, layerModel, appearanceState) {
  if (row?.colorTarget?.kind === "settings-background" || row?.opacityTarget?.kind === "settings-background") {
    return {
      color: appearanceState.settings.color,
      opacity: appearanceState.settings.opacity,
    };
  }

  if (row?.colorTarget?.kind === "screen-background" || row?.opacityTarget?.kind === "screen-background") {
    return {
      color: appearanceState.screen.color,
      opacity: appearanceState.screen.opacity,
    };
  }

  return layerModel.getRowValue(row);
}

function createAppearanceFillRow({ id, label, kind }) {
  return {
    id,
    type: "fill",
    label,
    storageKey: kind === "screen-background"
      ? SCREEN_BACKGROUND_STORAGE_KEY
      : SETTINGS_BACKGROUND_STORAGE_KEY,
    presets: SETTINGS_BACKGROUND_PRESETS,
    min: 0,
    max: 100,
    step: 1,
    valueFormat: "percent",
    colorTarget: {
      kind,
      key: "color",
    },
    opacityTarget: {
      kind,
      key: "opacity",
    },
  };
}

function createAddButton(depth, parentId, onAddRow) {
  const btn = document.createElement("button");
  btn.className = "layer-menu-add-row";
  btn.style.setProperty("--row-depth", String(depth + 1));
  btn.setAttribute("type", "button");
  btn.setAttribute("aria-label", depth === 0 ? "Add layer" : "Add row");
  btn.textContent = depth === 0 ? "+ Add layer" : "+ Add row";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onAddRow({ kind: "open-add-panel", depth, parentId });
  });
  return btn;
}

function makeRemoveButton(row, parentId, onRemoveRow) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "layer-menu-row-remove";
  btn.setAttribute("aria-label", "Remove row");
  btn.textContent = "×";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRemoveRow(row.id, parentId, row);
  });
  return btn;
}

// Re-dispatches all stored values for a row's targets through onRowInput.
// Used when toggling row visibility so the map sees the enable/disable immediately.
function reapplyRowTargets(row, layerModel, onRowInput) {
  const value = layerModel.getRowValue(row);
  if (!value || typeof value !== "object") return;
  if (row.colorTarget  && value.color   != null) onRowInput({ target: row.colorTarget  }, value.color);
  if (row.opacityTarget && value.opacity != null) onRowInput({ target: row.opacityTarget }, value.opacity);
  if (row.weightTarget && value.weight  != null) onRowInput({ target: row.weightTarget  }, value.weight);
  if (row.radiusTarget && value.radius  != null) onRowInput({ target: row.radiusTarget  }, value.radius);
  if (row.runtimeTargetId) {
    onRowInput({ target: { kind: "runtime-style", runtimeTargetId: row.runtimeTargetId, key: "visible" } }, layerModel.isRowVisible(row.id));
  }
}

function buildRows(rows, layerModel, onToggleExpanded, onToggleVisibility, reorderApi, onRowInput, appearanceState, depth = 0, parentId = null, inheritedHidden = false, onAddRow = null, onRemoveRow = null, onDataAction = null) {
  const fragment = document.createDocumentFragment();
  const state = layerModel.getState();

  rows.forEach((row) => {
    const rowStateKey = getRowStateKey(row);
    const childRows = row.id ? reorderApi.getOrderedRows(row.id) : [];
    const orderedChildRows = row.id === "earth"
      ? [
        ...childRows.filter((childRow) => childRow?.id !== "ocean"),
        ...childRows.filter((childRow) => childRow?.id === "ocean"),
      ]
      : childRows;
    const isDynamic = onRemoveRow && layerModel.isDynamic(row.id);

    if (row.type === "slider") {
      const slider = createSliderRow(row, getDisplayRowValue(row, layerModel, appearanceState), (nextValue) => {
        onRowInput(row, nextValue);
      }, { inheritedHidden });
      slider.style.setProperty("--row-depth", String(depth));
      fragment.append(slider);
      return;
    }

    if (row.type === "color") {
      const colorRow = createColorRow(row, getDisplayRowValue(row, layerModel, appearanceState), (nextValue) => {
        onRowInput(row, nextValue);
      }, onToggleExpanded.__requestRender);
      colorRow.style.setProperty("--row-depth", String(depth));
      fragment.append(colorRow);
      return;
    }

    if (row.type === "filter" || row.type === "sort") {
      const labelText = row.type === "filter"
        ? `${row.label}: ${row.field} ${row.op} ${row.value}`
        : `${row.label}: ${row.field} ${row.direction === "asc" ? "↑" : "↓"}`;
      const isVisible = layerModel.isRowVisible(row.id);
      const el = document.createElement("div");
      el.className = "layer-menu-row layer-menu-row-meta";
      el.classList.toggle("is-hidden", inheritedHidden || !isVisible);
      el.style.setProperty("--row-depth", String(depth));

      const header = document.createElement("div");
      header.className = "layer-menu-row-header";
      const leading = document.createElement("div");
      leading.className = "layer-menu-row-leading";

      if (parentId) {
        el.dataset.rowId = row.id;
        el.dataset.parentId = parentId;
        if (reorderApi.dragState?.parentId === parentId && reorderApi.dragState?.rowId === row.id) {
          el.classList.add("is-dragging");
        }
        const grabber = document.createElement("button");
        grabber.type = "button";
        grabber.className = "layer-menu-row-grabber";
        grabber.setAttribute("aria-label", "Reorder row");
        grabber.innerHTML = "<span></span><span></span>";
        leading.append(grabber);
        setupPointerReorderGrabber(grabber, parentId, row.id, reorderApi);
      }

      const visBtn = document.createElement("button");
      visBtn.type = "button";
      visBtn.className = "layer-menu-row-toggle";
      visBtn.setAttribute("aria-label", isVisible ? "Disable row" : "Enable row");
      const labelSpan = document.createElement("span");
      labelSpan.className = "layer-menu-row-label";
      labelSpan.textContent = labelText;
      visBtn.append(labelSpan);
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layerModel.toggleRowVisible(row.id);
        reapplyRowTargets(row, layerModel, onRowInput);
        onToggleExpanded.__requestRender();
      });
      leading.append(visBtn);
      header.append(leading);
      if (isDynamic) header.append(makeRemoveButton(row, parentId, onRemoveRow));
      el.append(header);
      fragment.append(el);
      return;
    }

    if (row.type === "fill" || row.type === "line" || row.type === "point") {
      const isVisible = layerModel.isRowVisible(row.id);
      const isAppearanceRow = row?.colorTarget?.kind === "settings-background"
        || row?.opacityTarget?.kind === "settings-background"
        || row?.colorTarget?.kind === "screen-background"
        || row?.opacityTarget?.kind === "screen-background";
      const isExpanded = true;
      const styleRow = createStyleRow(
        row,
        getDisplayRowValue(row, layerModel, appearanceState),
        (syntheticRow, nextValue) => onRowInput(syntheticRow, nextValue),
        onToggleExpanded.__requestRender,
        {
          parentId: parentId ?? null,
          reorderApi: parentId ? reorderApi : null,
          isVisible,
          isExpanded,
          isExpandable: false,
          inheritedHidden,
          onToggleVisible: () => {
            layerModel.toggleRowVisible(row.id);
            reapplyRowTargets(row, layerModel, onRowInput);
            onToggleExpanded.__requestRender();
          },
          onToggleExpanded: null,
        },
      );
      styleRow.style.setProperty("--row-depth", String(depth));
      fragment.append(styleRow);
      return;
    }

    const layerRow = createLayerRow(
      row,
      state[rowStateKey],
      parentId,
      inheritedHidden,
      onToggleExpanded,
      onToggleVisibility,
      reorderApi,
      reorderApi.dragState,
      orderedChildRows,
      getLayerLegendSpec(row, state[rowStateKey], layerModel, appearanceState),
      onDataAction,
    );
    layerRow.style.setProperty("--row-depth", String(depth));
    fragment.append(layerRow);

    if (row.type === "layer" && row.layerId) {
      const nextInheritedHidden = inheritedHidden || (state[rowStateKey]?.visible === false);
      const isEarthParent = row.id === "earth";
      const visibleChildRows = isEarthParent
        ? (state[rowStateKey]?.expanded ? orderedChildRows : [])
        : orderedChildRows.filter((childRow) => !isStyleChildRow(childRow) || state[rowStateKey]?.expanded);
      if (visibleChildRows.length) {
        fragment.append(buildRows(visibleChildRows, layerModel, onToggleExpanded, onToggleVisibility, reorderApi, onRowInput, appearanceState, depth + 1, row.id, nextInheritedHidden, onAddRow, onRemoveRow, onDataAction));
      }
    }
  });

  return fragment;
}

function collapseExpandedLayersOnHoverLeave(layerModel) {
  let changed = false;

  function walkRows(parentId) {
    const rows = parentId === layerModel.getRootParentId()
      ? layerModel.getChildRows(parentId)
      : layerModel.getChildRows(parentId);

    rows.forEach((row) => {
      if (!row || row.type !== "layer") {
        return;
      }

      if (layerModel.isExpanded(row.id)) {
        layerModel.toggleExpanded(row.id);
        changed = true;
      }

      if (row.id) {
        walkRows(row.id);
      }
    });
  }

  walkRows(layerModel.getRootParentId());
  return changed;
}

function syncOpenLayerMenuLayout(panel) {
  if (!panel?.classList?.contains("is-open")) {
    return;
  }

  const wrapper = panel.closest(".layer-menu");
  const button = wrapper?.querySelector?.("#layerMenuButton");
  if (!wrapper || !button) {
    return;
  }

  const buttonRect = button.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const naturalTop = wrapperRect.top + buttonRect.height + 10;
  const viewportCap = Math.max(120, window.innerHeight - (LAYER_MENU_VIEWPORT_MARGIN * 2));
  const availableFromCurrentPosition = Math.max(120, window.innerHeight - naturalTop - LAYER_MENU_VIEWPORT_MARGIN);
  const availableHeight = Math.min(viewportCap, availableFromCurrentPosition);
  panel.style.maxHeight = `${availableHeight}px`;
}

function renderLayerMenuRows({
  panel,
  layerModel,
  onRowInput,
  onAddRow,
  onRemoveRow,
  onDataAction,
}) {
  if (!panel || !layerModel) {
    return () => {};
  }

  const transientColorRowState = new Map();
  const transientReorderState = new Map();
  let activeDragState = null;

  function render(nextUiState = null) {
    const appearanceState = layerModel.getAppearanceState();
    const appearanceButton = document.getElementById("layerMenuAppearanceButton");
    const earthButton = document.getElementById("layerMenuEarthButton");
    const screenButton = document.getElementById("layerMenuScreenButton");
    const scrollRegion = document.getElementById("layerMenuPanelScroll") ?? panel;
    const footerRegion = document.getElementById("layerMenuPanelFooter");
    applySettingsBackground(panel, appearanceButton, appearanceState.settings);
    applyScreenBackground(appearanceState.screen, screenButton);
    applyDeckEarthButtonState(layerModel, earthButton);

    if (nextUiState?.rowId) {
      transientColorRowState.set(nextUiState.rowId, nextUiState);
    }
    scrollRegion.innerHTML = "";
    if (footerRegion) {
      footerRegion.innerHTML = "";
    }
    const onToggleExpanded = (layerId) => {
      layerModel.toggleExpanded(layerId);
      render();
    };
    const onToggleVisibility = (row) => {
      const stateKey = getRowStateKey(row);
      const runtimeTargetId = getRowRuntimeTargetId(row);
      if (!stateKey || !runtimeTargetId) {
        return;
      }
      const nextVisible = layerModel.toggleVisibility(stateKey);
      if (typeof nextVisible === "boolean") {
        onRowInput({ target: { kind: "layer-style", layerId: runtimeTargetId, key: "visible" } }, nextVisible);
      }
      render();
    };
    const getOrderedRows = (parentId) => {
      const previewOrder = transientReorderState.get(parentId);
      const baseRows = layerModel.getChildRows(parentId);
      const resolvedOrder = previewOrder?.length
        ? layerModel.normalizeChildRowOrder(parentId, previewOrder)
        : layerModel.normalizeChildRowOrder(parentId);
      if (!resolvedOrder.length) {
        return baseRows;
      }
      const rowById = new Map(baseRows.map((row) => [row.id, row]));
      return resolvedOrder.map((rowId) => rowById.get(rowId)).filter(Boolean);
    };
    const getRenderedOrderedRowIds = (parentId) => {
      const selector = `[data-parent-id="${CSS.escape(parentId)}"][data-row-id]`;
      const renderedIds = [...scrollRegion.querySelectorAll(selector)]
        .map((element) => element.dataset.rowId)
        .filter(Boolean);
      return renderedIds.length ? renderedIds : getOrderedRows(parentId).map((row) => row.id);
    };
    const reorderApi = {
      dragState: activeDragState,
      getOrderedRows,
      getOrderedRowIds: (parentId) => getRenderedOrderedRowIds(parentId),
      setDragging(nextDragState) {
        activeDragState = nextDragState;
        render();
      },
      onPreview(parentId, previewOrder) {
        transientReorderState.set(parentId, previewOrder);
        render();
      },
      onCancel(parentId) {
        if (transientReorderState.delete(parentId)) {
          render();
        }
      },
      onCommit(parentId, nextOrder) {
        transientReorderState.delete(parentId);
        const fullOrder = getOrderedRows(parentId).map((row) => row.id);
        const nextOrderSet = new Set(nextOrder);
        const mergedOrder = fullOrder.map((rowId) => (
          nextOrderSet.has(rowId) ? nextOrder.shift() : rowId
        ));
        const committedOrder = layerModel.setChildRowOrder(parentId, mergedOrder);
        if (committedOrder) {
          onRowInput({ type: "reorder", parentId }, committedOrder);
        }
        render();
      },
      collapseRow(expandKey) {
        if (layerModel.isExpanded(expandKey)) {
          onToggleExpanded(expandKey);
        }
      },
    };

    onToggleExpanded.__requestRender = render;
    onToggleExpanded.__requestRender.__getColorRowUiState = (rowId) => transientColorRowState.get(rowId) ?? null;

    const onPanelRowInput = (row, nextValue) => {
      const target = row?.target ?? row?.colorTarget ?? row?.opacityTarget ?? row?.weightTarget;
      if (target?.kind === "settings-background") {
        const nextState = layerModel.setAppearanceValue("settings", target.key, nextValue)
          ?? layerModel.getAppearanceState().settings
          ?? { ...DEFAULT_SETTINGS_BACKGROUND };
        applySettingsBackground(panel, appearanceButton, nextState);
        return;
      }

      if (target?.kind === "screen-background") {
        const nextState = layerModel.setAppearanceValue("screen", target.key, nextValue)
          ?? layerModel.getAppearanceState().screen
          ?? { ...DEFAULT_SCREEN_BACKGROUND };
        applyScreenBackground(nextState, screenButton);
        return;
      }

      onRowInput(row, nextValue);
      applyDeckEarthButtonState(layerModel, earthButton);

      const parentRowId = row?.id ? layerModel.getState()?.[row.id]?.parentRowId : null;
      if (!parentRowId) {
        return;
      }

      const parentRow = layerModel.getRowById(parentRowId);
      if (!parentRow || parentRow.type !== "layer") {
        return;
      }

      const parentState = layerModel.getState()?.[getRowStateKey(parentRow)] ?? null;
      const parentRowElement = scrollRegion.querySelector(`.layer-menu-row-layer[data-row-id="${parentRowId}"]`);
      updateLayerLegendSwatch(
        parentRowElement,
        getLayerLegendSpec(parentRow, parentState, layerModel, layerModel.getAppearanceState()),
        {
          state: parentState,
          expandStateKey: getRowStateKey(parentRow),
          onToggleExpanded,
          toggleEnabled: parentRow.id !== "earth" && layerModel.getChildRows(parentRow.id).some(isStyleChildRow),
        },
      );
    };

    if (panel.dataset.screenRowOpen === "true") {
      scrollRegion.append(
        buildRows(
          [createAppearanceFillRow({ id: "screen-background-fill", label: "Background", kind: "screen-background" })],
          layerModel,
          onToggleExpanded,
          onToggleVisibility,
          reorderApi,
          onPanelRowInput,
          appearanceState,
          0,
          null,
          false,
          null,
          null,
          onDataAction ?? null,
        ),
      );
    }

    if (panel.dataset.earthRowOpen === "true") {
      scrollRegion.append(
        buildRows(
          layerModel.getChildRows(DECK_EARTH_ROW_ID),
          layerModel,
          onToggleExpanded,
          onToggleVisibility,
          reorderApi,
          onPanelRowInput,
          appearanceState,
          0,
          DECK_EARTH_ROW_ID,
          false,
          null,
          null,
          onDataAction ?? null,
        ),
      );
    }

    if (panel.dataset.appearanceRowOpen === "true") {
      scrollRegion.append(
        buildRows(
          [createAppearanceFillRow({ id: "settings-background-fill", label: "Settings", kind: "settings-background" })],
          layerModel,
          onToggleExpanded,
          onToggleVisibility,
          reorderApi,
          onPanelRowInput,
          appearanceState,
          0,
          null,
          false,
          null,
          null,
          onDataAction ?? null,
        ),
      );
    }

    scrollRegion.append(
      buildRows(
        reorderApi.getOrderedRows(layerModel.getRootParentId()),
        layerModel,
        onToggleExpanded,
        onToggleVisibility,
        reorderApi,
        onPanelRowInput,
        appearanceState,
        0,
        layerModel.getRootParentId(),
        false,
        onAddRow ?? null,
        onRemoveRow ?? null,
        onDataAction ?? null,
      ),
    );

    if (onAddRow) {
      (footerRegion ?? scrollRegion).append(createAddButton(0, layerModel.getRootParentId(), onAddRow));
    }

    requestAnimationFrame(() => {
      syncOpenLayerMenuLayout(panel);
    });
  }

  const hoverCapableMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  panel.addEventListener("pointerleave", () => {
    if (!hoverCapableMediaQuery.matches) {
      return;
    }
    if (collapseExpandedLayersOnHoverLeave(layerModel)) {
      render();
    }
  });

  render();
  return render;
}

export { renderLayerMenuRows };
