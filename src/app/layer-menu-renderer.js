import {
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
  color: "#000000",
  opacity: 85,
};
const DEFAULT_SCREEN_BACKGROUND = {
  color: "#000000",
  opacity: 100,
};
const LAYER_MENU_VIEWPORT_MARGIN = 12;
const OCEAN_LEGEND_RADIUS_PX = 9.2;
const EARTH_GLOBE_PATHS = Object.freeze([
  "M17.72 18.32 L17.47 18.28 L17.46 18.47 L17.68 18.81 L17.74 19.08 L17.97 19.42 L18.21 19.43 L18.28 19.45 L18.55 19.18 L18.68 19.28 L18.72 18.96 L18.85 18.82 L18.82 18.35 L18.6 18.32 L18.3 18.4 L18.09 18.46 L17.72 18.32 Z",
  "M17.02 7.51 L17.04 7.36 L17.01 7.13 L16.87 6.93 L16.85 6.76 L16.76 6.71 L16.73 6.46 L16.62 6.27 L16.48 6.42 L16.47 6.53 L16.4 6.75 L16.31 6.96 L16.37 7.1 L16.3 7.18 L16.25 7.48 L16.29 7.71 L16.26 7.82 L16.32 8.02 L16.2 8.34 L16.15 8.56 L16.07 8.73 L16 8.95 L15.75 9.08 L15.38 8.95 L15.33 8.83 L15.13 8.72 L15.02 8.72 L14.74 8.49 L14.55 8.35 L14.26 8.22 L13.95 8 L13.93 7.89 L14.06 7.69 L14.17 7.49 L14.13 7.33 L14.26 7.32 L14.4 7.15 L14.51 6.94 L14.33 6.74 L14.24 6.82 L14.1 6.78 L13.88 6.9 L13.64 6.78 L13.53 6.82 L13.21 6.71 L13.01 6.55 L12.76 6.45 L12.55 6.51 L12.83 6.64 L12.84 6.85 L12.52 6.92 L12.32 6.87 L12.09 7.01 L11.93 7.24 L11.99 7.34 L11.81 7.45 L11.63 7.77 L11.71 7.99 L11.47 7.95 L11.23 7.95 L11.02 7.71 L10.74 7.53 L10.56 7.58 L10.39 7.64 L10.38 7.74 L10.21 7.69 L10.21 7.8 L10.02 7.87 L9.92 8.03 L9.72 8.23 L9.67 8.53 L9.5 8.44 L9.38 8.64 L9.52 8.83 L9.36 8.91 L9.2 8.56 L8.93 8.9 L8.92 9.12 L8.9 9.28 L8.68 9.48 L8.58 9.7 L8.37 9.87 L7.97 9.99 L7.76 9.98 L7.66 10.02 L7.6 10.11 L7.37 10.15 L7.07 10.3 L6.97 10.25 L6.79 10.28 L6.5 10.43 L6.32 10.6 L6.01 10.73 L5.85 11.01 L5.82 10.7 L5.66 10.99 L5.7 11.22 L5.65 11.42 L5.57 11.52 L5.53 11.75 L5.62 11.87 L5.66 12 L5.84 12.31 L5.85 12.52 L5.74 12.36 L5.55 12.25 L5.68 12.62 L5.51 12.45 L5.56 12.62 L5.78 12.93 L5.83 13.25 L6 13.41 L6.01 13.52 L6.16 13.78 L6.14 14.01 L6.2 14.24 L6.41 14.64 L6.45 14.88 L6.4 15.16 L6.42 15.3 L6.35 15.39 L6.16 15.45 L6.15 15.68 L6.36 15.75 L6.76 16.01 L7.02 16.01 L7.3 16.03 L7.48 15.9 L7.67 15.79 L7.78 15.8 L8.01 15.59 L8.27 15.57 L8.54 15.53 L8.88 15.6 L9.12 15.57 L9.44 15.56 L9.58 15.39 L9.66 15.18 L9.99 15.09 L10.39 14.89 L10.75 14.91 L11.19 14.78 L11.68 14.64 L12.36 14.6 L12.73 14.79 L13 14.8 L13.49 15.05 L13.41 15.14 L13.61 15.29 L13.85 15.58 L13.84 15.79 L14.14 15.96 L14.28 15.64 L14.52 15.5 L14.83 15.16 L14.86 15.46 L14.72 15.65 L14.66 15.88 L14.46 16.1 L14.8 16.03 L14.98 15.75 L15.08 16.05 L14.95 16.24 L15.32 16.29 L15.5 16.46 L15.59 16.66 L15.66 16.96 L15.91 17.21 L16.28 17.32 L16.5 17.35 L16.71 17.42 L17.04 17.52 L17.38 17.23 L17.58 17.16 L17.52 17.37 L17.76 17.44 L18.07 17.61 L18.3 17.44 L18.48 17.29 L18.83 17.12 L19.26 17.11 L19.48 16.97 L19.46 16.84 L19.5 16.57 L19.6 16.27 L19.75 16.07 L19.86 15.72 L19.99 15.53 L20.13 15.22 L20.41 15.02 L20.58 14.66 L20.65 14.37 L20.65 14.14 L20.75 13.78 L20.81 13.6 L20.84 13.24 L20.65 12.9 L20.68 12.66 L20.67 12.43 L20.56 12.11 L20.27 11.78 L20.09 11.63 L19.82 11.38 L19.75 10.96 L19.66 11.02 L19.51 10.85 L19.35 10.94 L19.21 10.5 L18.99 10.25 L19.04 10.16 L18.78 9.98 L18.51 9.79 L18.1 9.58 L17.98 9.31 L18.01 9.1 L17.91 8.76 L17.81 8.71 L17.76 8.51 L17.68 8.17 L17.71 7.99 L17.53 7.84 L17.41 7.67 L17.16 7.82 L17.02 7.51 Z",
]);
const EARTH_GRATICULE_PATHS = Object.freeze([
  "M13 2.4C11 5.2 10.1 9 10.1 13C10.1 17 11 20.8 13 23.6",
  "M2.4 13C5.2 11.5 8.8 10.8 13 10.8C17.2 10.8 20.8 11.5 23.6 13",
]);

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

  let grabber = null;
  if (options.grabber) {
    grabber = document.createElement("button");
    grabber.type = "button";
    grabber.className = "layer-menu-row-grabber";
    grabber.setAttribute("aria-label", "Reorder row");
    grabber.innerHTML = "<span></span><span></span>";
  }

  const label = options.labelButton ? document.createElement("button") : document.createElement("span");
  label.className = options.labelButton ? "layer-menu-row-toggle" : "layer-menu-row-label";
  label.title = labelText;
  if (options.labelButton) {
    label.type = "button";
    const labelTextNode = document.createElement("span");
    labelTextNode.className = "layer-menu-row-label";
    labelTextNode.textContent = labelText;
    labelTextNode.title = labelText;
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
    if (options.chevronLabel) {
      chevron.setAttribute("aria-label", options.chevronLabel);
    }
    chevron.textContent = options.chevronText ?? "›";
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

  if (grabber) {
    header.append(grabber);
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

function getEarthLegendStyleState(rowId, runtimeTargetId, layerModel, appearanceState) {
  const row = layerModel.getRowById(rowId);
  if (!row || row.runtimeTargetId !== runtimeTargetId) {
    return null;
  }

  return {
    row,
    value: getDisplayRowValue(row, layerModel, appearanceState),
    visible: layerModel.isRowVisible(row.id),
  };
}

function getEarthLegendRenderOrder(layerModel) {
  const menuOrder = [];
  layerModel.getChildRows("earth").forEach((row) => {
    if (row?.id === "ocean") {
      menuOrder.push("ocean.fill");
      return;
    }

    if (row?.id === "graticules") {
      menuOrder.push("graticules.line");
      return;
    }

    if (row?.id === "land") {
      layerModel.getChildRows("land").forEach((childRow) => {
        if (childRow?.runtimeTargetId === "land::fill") {
          menuOrder.push("land.fill");
        } else if (childRow?.runtimeTargetId === "land::line") {
          menuOrder.push("land.line");
        }
      });
    }
  });

  return menuOrder.length
    ? menuOrder.reverse()
    : ["ocean.fill", "land.fill", "land.line", "graticules.line"];
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

  if (definition.id === "earth") {
    const oceanFill = getEarthLegendStyleState("ocean-fill", "ocean::fill", layerModel, appearanceState);
    const landFill = getEarthLegendStyleState("land-fill", "land::fill", layerModel, appearanceState);
    const landLine = getEarthLegendStyleState("land-line", "land::line", layerModel, appearanceState);
    const graticulesLine = getEarthLegendStyleState("graticules-line", "graticules::line", layerModel, appearanceState);

    return {
      kind: "globe",
      oceanColor: oceanFill?.value?.color ?? "#2C6F92",
      oceanOpacity: oceanFill?.visible ? oceanFill.value.opacity : 0,
      landColor: landFill?.value?.color ?? "#6EAA6E",
      landOpacity: landFill?.visible ? landFill.value.opacity : 0,
      landLineColor: landLine?.value?.color ?? "#000000",
      landLineOpacity: landLine?.visible ? landLine.value.opacity : 0,
      landLineWeight: landLine?.visible ? landLine.value.weight : 0,
      graticulesColor: graticulesLine?.value?.color ?? "#8FA9BC",
      graticulesOpacity: graticulesLine?.visible ? graticulesLine.value.opacity : 0,
      graticulesWeight: graticulesLine?.visible ? graticulesLine.value.weight : 0,
      renderOrder: getEarthLegendRenderOrder(layerModel),
    };
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

  if (spec.kind === "globe") {
    const svg = createSvgElement("svg");
    svg.classList.add("layer-menu-row-legend-svg", "layer-menu-row-globe-svg");
    svg.setAttribute("viewBox", "0 0 26 26");
    svg.setAttribute("width", "30");
    svg.setAttribute("height", "30");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    const clipId = `layer-menu-earth-globe-clip-${Math.random().toString(36).slice(2, 8)}`;

    const defs = createSvgElement("defs");
    const clipPath = createSvgElement("clipPath");
    clipPath.setAttribute("id", clipId);
    const clipCircle = createSvgElement("circle");
    clipCircle.setAttribute("cx", "13");
    clipCircle.setAttribute("cy", "13");
    clipCircle.setAttribute("r", "11");
    clipPath.append(clipCircle);
    defs.append(clipPath);
    svg.append(defs);

    const contentGroup = createSvgElement("g");
    contentGroup.setAttribute("clip-path", `url(#${clipId})`);
    svg.append(contentGroup);

    const renderOrder = Array.isArray(spec.renderOrder) && spec.renderOrder.length
      ? spec.renderOrder
      : ["ocean.fill", "land.fill", "land.line", "graticules.line"];
    renderOrder.forEach((layerId) => {
      if (layerId === "ocean.fill") {
        const globe = createSvgElement("circle");
        globe.setAttribute("cx", "13");
        globe.setAttribute("cy", "13");
        globe.setAttribute("r", "11");
        globe.setAttribute("fill", normalizeHexColor(spec.oceanColor) ?? "#2C6F92");
        globe.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, (Number(spec.oceanOpacity) || 0) / 100))));
        contentGroup.append(globe);
        return;
      }

      if (layerId === "graticules.line") {
        EARTH_GRATICULE_PATHS.forEach((pathData) => {
          const path = createSvgElement("path");
          path.setAttribute("d", pathData);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", normalizeHexColor(spec.graticulesColor) ?? "#8FA9BC");
          path.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(spec.graticulesOpacity) || 0) / 100))));
          path.setAttribute("stroke-width", String(Math.max(0, Math.min(1.6, Number(spec.graticulesWeight) || 0))));
          path.setAttribute("stroke-linecap", "round");
          contentGroup.append(path);
        });
        return;
      }

      if (layerId === "land.fill") {
        EARTH_GLOBE_PATHS.forEach((pathData) => {
          const path = createSvgElement("path");
          path.setAttribute("d", pathData);
          path.setAttribute("fill", normalizeHexColor(spec.landColor) ?? "#6EAA6E");
          path.setAttribute("fill-opacity", String(Math.max(0, Math.min(1, (Number(spec.landOpacity) || 0) / 100))));
          contentGroup.append(path);
        });
        return;
      }

      if (layerId === "land.line") {
        EARTH_GLOBE_PATHS.forEach((pathData) => {
          const path = createSvgElement("path");
          path.setAttribute("d", pathData);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", normalizeHexColor(spec.landLineColor) ?? "#000000");
          path.setAttribute("stroke-opacity", String(Math.max(0, Math.min(1, (Number(spec.landLineOpacity) || 0) / 100))));
          path.setAttribute("stroke-width", String(Math.max(0, Math.min(1.8, Number(spec.landLineWeight) || 0))));
          path.setAttribute("stroke-linejoin", "round");
          path.setAttribute("stroke-linecap", "round");
          contentGroup.append(path);
        });
      }
    });

    const outline = createSvgElement("circle");
    outline.setAttribute("cx", "13");
    outline.setAttribute("cy", "13");
    outline.setAttribute("r", "11");
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000000");
    outline.setAttribute("stroke-width", "1");
    svg.append(outline);
    swatch.append(svg);
    return swatch;
  }

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

  const leading = header.querySelector(".layer-menu-row-leading");
  const label = leading?.querySelector(".layer-menu-row-toggle, .layer-menu-row-label");
  if (leading && label) {
    leading.insertBefore(nextLegend, label);
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
    chevronExpanded: !isEarthParent && Boolean(state?.expanded),
    chevronText: isEarthParent ? "×" : "›",
    chevronLabel: isEarthParent ? "Close earth rows" : null,
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
    const leading = header.querySelector(".layer-menu-row-leading");
    if (leading) {
      leading.insertBefore(legend, label);
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
    row.setAttribute("aria-expanded", String(isEarthParent || Boolean(state?.expanded)));
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
    if (isEarthParent) {
      document.getElementById("layerMenuEarthButton")?.click();
      return;
    }
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
      if (isEarthParent) {
        document.getElementById("layerMenuEarthButton")?.click();
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
      let grabber = null;

      if (parentId) {
        el.dataset.rowId = row.id;
        el.dataset.parentId = parentId;
        if (reorderApi.dragState?.parentId === parentId && reorderApi.dragState?.rowId === row.id) {
          el.classList.add("is-dragging");
        }
        grabber = document.createElement("button");
        grabber.type = "button";
        grabber.className = "layer-menu-row-grabber";
        grabber.setAttribute("aria-label", "Reorder row");
        grabber.innerHTML = "<span></span><span></span>";
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
      if (grabber) header.append(grabber);
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
        ? orderedChildRows
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
    const screenButton = document.getElementById("layerMenuScreenButton");
    const scrollRegion = document.getElementById("layerMenuPanelScroll") ?? panel;
    const footerRegion = document.getElementById("layerMenuPanelFooter");
    applySettingsBackground(panel, appearanceButton, appearanceState.settings);
    applyScreenBackground(appearanceState.screen, screenButton);

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

      if (parentRowId !== "earth") {
        const earthRow = layerModel.getRowById("earth");
        const earthState = layerModel.getState()?.earth ?? null;
        const earthRowElement = scrollRegion.querySelector('.layer-menu-row-layer[data-row-id="earth"]');
        updateLayerLegendSwatch(
          earthRowElement,
          getLayerLegendSpec(earthRow, earthState, layerModel, layerModel.getAppearanceState()),
          {
            state: earthState,
            expandStateKey: "earth",
            onToggleExpanded,
            toggleEnabled: false,
          },
        );
      }
    };

    if (panel.dataset.earthRowOpen === "true") {
      const earthRow = layerModel.getRowById("earth");
      scrollRegion.append(
        buildRows(
          earthRow ? [earthRow] : [],
          layerModel,
          onToggleExpanded,
          onToggleVisibility,
          reorderApi,
          onPanelRowInput,
          appearanceState,
          0,
          layerModel.getRootParentId(),
          false,
          null,
          null,
          onDataAction ?? null,
        ),
      );
    }

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
        reorderApi.getOrderedRows(layerModel.getRootParentId()).filter((row) => row?.id !== "earth"),
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
