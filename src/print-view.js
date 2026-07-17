import { geoPath } from "d3-geo";
import { createGestureController } from "./print/gesture-controller.js";
import { buildDynamicDrawCommands } from "./print/dynamic-commands.js";
import {
  createProjectionAdapter,
  createProjectionAdapterState,
  createDefaultCustomView,
  getCustomViewAtPoint,
  getProjectionGestureMode,
  getProjectionPanCamera,
  getProjectionPanZoomCamera,
  getProjectionRenderMode,
  getProjectionDragCamera,
  getProjectionZoomCamera,
  getProjectionViewportTransform,
  isCustomProjection,
  isFlatProjection,
  normalizeProjectionCamera,
  ORTHOGRAPHIC_DRAG_SENSITIVITY,
  PROJECTIONS,
  transferProjectionCamera,
} from "./print/projection-adapters.js";
import { createPerfTracker, shouldEnablePrintPerf } from "./print/perf-metrics.js";
import { createRenderInvalidation } from "./print/render-invalidation.js";
import { createPrintSceneModel } from "./print/scene-model.js";
import { drawProjectedScene, prepareContext } from "./print/shared-canvas.js";
import { PRINT_WORKER_MESSAGE } from "./print/worker/worker-protocol.js";

function canUseFlatWorker() {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

export function createPrintView({
  mount,
  onCameraChange = null,
  onProjectionChange = null,
  onProjectionLockChange = null,
  onProjectionReset = null,
  onTitleChange = null,
  onUndo = null,
}) {
  const PRINT_PREVIEW_INSET = 12;
  const PRINT_PREVIEW_RATIO = Math.sqrt(2);
  const PRINT_PREVIEW_MASK_FILL = "rgba(120, 120, 120, 0.34)";
  const PRINT_PREVIEW_BORDER = "rgba(0, 0, 0, 0.45)";
  const PRINT_ALIGNMENT_THRESHOLD_PX = 0.75;
  const PRINT_SNAP_CAPTURE_THRESHOLD_PX = 1;
  const PRINT_ALIGNMENT_CENTER_RGB = "220, 32, 32";
  const PRINT_ALIGNMENT_CENTER_MAX_ALPHA = 0.95;
  const PRINT_ALIGNMENT_CENTER_FADE_MS = 800;
  const PRINT_ALIGNMENT_EDGE_COLOR = "rgba(32, 170, 80, 0.95)";
  const DEFAULT_PRINT_TITLE = {
    text: "",
    x: 0.04,
    y: 0.04,
    width: 0.92,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 0.035,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#000000",
  };
  const PRINT_TITLE_FONT_OPTIONS = [
    { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
    { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica" },
    { value: "'Courier New', monospace", label: "Courier" },
  ];

  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;";

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none;";

  const titleLayer = document.createElement("div");
  titleLayer.className = "earthlab-print-title-layer";
  titleLayer.hidden = true;

  const titleToolbar = document.createElement("div");
  titleToolbar.className = "earthlab-print-title-toolbar";
  titleToolbar.hidden = true;

  const titleFontSelect = document.createElement("select");
  titleFontSelect.className = "earthlab-print-title-select";
  for (const optionDef of PRINT_TITLE_FONT_OPTIONS) {
    const option = document.createElement("option");
    option.value = optionDef.value;
    option.textContent = optionDef.label;
    titleFontSelect.append(option);
  }

  const titleSizeInput = document.createElement("input");
  titleSizeInput.className = "earthlab-print-title-size";
  titleSizeInput.type = "range";
  titleSizeInput.min = "18";
  titleSizeInput.max = "64";
  titleSizeInput.step = "1";

  const titleMoveHandle = document.createElement("button");
  titleMoveHandle.type = "button";
  titleMoveHandle.className = "earthlab-print-title-move";
  titleMoveHandle.textContent = "Move";

  titleToolbar.append(titleFontSelect, titleSizeInput, titleMoveHandle);

  const titleShell = document.createElement("div");
  titleShell.className = "earthlab-print-title-shell";

  const titleEditorWrap = document.createElement("div");
  titleEditorWrap.className = "earthlab-print-title-wrap";

  const titleEditor = document.createElement("div");
  titleEditor.className = "earthlab-print-title-editor";
  titleEditor.contentEditable = "true";
  titleEditor.spellcheck = false;
  titleEditor.setAttribute("enterkeyhint", "done");
  titleEditor.setAttribute("role", "textbox");
  titleEditor.setAttribute("aria-label", "Print title");

  const titleClearBtn = document.createElement("button");
  titleClearBtn.type = "button";
  titleClearBtn.className = "earthlab-print-title-clear";
  titleClearBtn.textContent = "×";

  titleEditorWrap.append(titleEditor, titleClearBtn);
  titleShell.append(titleEditorWrap);
  titleLayer.append(titleToolbar, titleShell);

  const projectionBtn = document.createElement("button");
  projectionBtn.type = "button";
  projectionBtn.className = "earthlab-projection-btn";

  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.className = "earthlab-projection-btn";
  lockBtn.classList.add("earthlab-lock-btn");

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "earthlab-projection-btn";
  resetBtn.classList.add("earthlab-reset-btn");
  resetBtn.textContent = "Reset";

  const projectionControls = document.createElement("div");
  projectionControls.className = "earthlab-projection-controls";
  projectionControls.append(lockBtn, resetBtn);

  const customControls = document.createElement("div");
  customControls.className = "earthlab-custom-controls";
  customControls.hidden = true;

  const customAddBtn = document.createElement("button");
  customAddBtn.type = "button";
  customAddBtn.className = "earthlab-projection-btn";
  customAddBtn.textContent = "Add projection";

  const customLockBtn = document.createElement("button");
  customLockBtn.type = "button";
  customLockBtn.className = "earthlab-projection-btn earthlab-lock-btn earthlab-custom-selected-control";

  const customResetBtn = document.createElement("button");
  customResetBtn.type = "button";
  customResetBtn.className = "earthlab-projection-btn earthlab-reset-btn earthlab-custom-selected-control";
  customResetBtn.textContent = "Reset";

  const customDeleteBtn = document.createElement("button");
  customDeleteBtn.type = "button";
  customDeleteBtn.className = "earthlab-projection-btn earthlab-custom-selected-control";
  customDeleteBtn.textContent = "Delete";

  const customProjectionSelect = document.createElement("select");
  customProjectionSelect.className = "earthlab-custom-select earthlab-custom-selected-control";
  for (const { id, name } of PROJECTIONS) {
    if (id === "custom") {
      continue;
    }
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    customProjectionSelect.append(option);
  }

  const customLayoutModeBtn = document.createElement("button");
  customLayoutModeBtn.type = "button";
  customLayoutModeBtn.className = "earthlab-projection-btn earthlab-custom-selected-control";
  customLayoutModeBtn.textContent = "Reshape";

  const customShapeToggleBtn = document.createElement("button");
  customShapeToggleBtn.type = "button";
  customShapeToggleBtn.className = "earthlab-projection-btn earthlab-custom-selected-control earthlab-custom-reshape-control";

  customControls.append(customAddBtn, customProjectionSelect, customLockBtn, customResetBtn, customLayoutModeBtn, customShapeToggleBtn, customDeleteBtn);

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "earthlab-projection-btn";
  undoBtn.textContent = "Undo";
  undoBtn.style.top = "0";
  undoBtn.style.bottom = "auto";
  undoBtn.style.right = "0";

  const projectionDropdown = document.createElement("div");
  projectionDropdown.className = "earthlab-projection-dropdown";
  projectionDropdown.hidden = true;
  for (const { id, name } of PROJECTIONS) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "earthlab-projection-option";
    item.dataset.projId = id;
    item.textContent = name;
    projectionDropdown.appendChild(item);
  }

  const customAddDropdown = document.createElement("div");
  customAddDropdown.className = "earthlab-projection-dropdown earthlab-custom-add-dropdown";
  customAddDropdown.hidden = true;
  for (const { id, name } of PROJECTIONS) {
    if (id === "custom") {
      continue;
    }
    const item = document.createElement("button");
    item.type = "button";
    item.className = "earthlab-projection-option";
    item.dataset.customAddProjId = id;
    item.textContent = name;
    customAddDropdown.appendChild(item);
  }

  const debugPanel = document.createElement("details");
  debugPanel.className = "earthlab-debug-panel";
  const debugSummary = document.createElement("summary");
  debugSummary.textContent = "Debug";
  const debugPre = document.createElement("pre");
  debugPre.className = "earthlab-debug-pre";
  debugPanel.append(debugSummary, debugPre);

  container.append(canvas, titleLayer, projectionDropdown, customAddDropdown, projectionBtn, projectionControls, customControls, undoBtn, debugPanel);
  mount.replaceChildren(container);

  const context = canvas.getContext("2d");
  const sceneModel = createPrintSceneModel();
  const invalidation = createRenderInvalidation(["scene", "camera", "frame"]);
  const projectionAdapterState = createProjectionAdapterState();
  const perfTracker = createPerfTracker("main", shouldEnablePrintPerf());

  let width = 0;
  let height = 0;
  let pixelRatio = window.devicePixelRatio || 1;
  let frameHandle = 0;
  let preparedDynamicCommands = [];
  let preparedDynamicKey = "";
  let workerSceneRevisionSent = -1;
  let workerFrameRequestCounter = 0;

  let viewState = {
    projection: "naturalEarth",
    activeCamera: normalizeProjectionCamera("naturalEarth", null, { locked: true }),
    locked: true,
  };
  let printTitle = { ...DEFAULT_PRINT_TITLE };
  let showCanvasTitle = true;
  let canUndo = false;

  const interactionState = {
    active: false,
    pendingCameraCommit: false,
  };
  const alignmentFadeState = {
    centerXStartedAt: null,
    centerYStartedAt: null,
    centerXVisible: false,
    centerYVisible: false,
  };
  const titleUiState = {
    selected: false,
    dragging: false,
    dragPointerId: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
  };
  const customLayoutDragState = {
    active: false,
    pointerId: null,
    mode: null,
    layoutMode: null,
    viewId: null,
    startX: 0,
    startY: 0,
    startCamera: null,
  };
  const customUiState = {
    layoutMode: "resize",
  };
  const stylePreviewState = {
    active: false,
    initialized: false,
    overrides: null,
  };
  const stylePreviewInvalidation = createRenderInvalidation(["earth", "dynamic-shapes", "points"]);
  const stylePreviewSurfaces = {
    earth: null,
    "dynamic-shapes": null,
    points: null,
  };
  const stylePreviewContexts = {
    earth: null,
    "dynamic-shapes": null,
    points: null,
  };

  const workerState = {
    enabled: canUseFlatWorker(),
    instance: null,
    latestBitmap: null,
    latestFrameKey: "",
    currentRequestKey: "",
    awaitingSettledFrame: false,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeTitle(nextTitle) {
    return {
      text: typeof nextTitle?.text === "string" ? nextTitle.text : "",
      x: Number.isFinite(Number(nextTitle?.x)) ? clamp(Number(nextTitle.x), 0, 0.9) : DEFAULT_PRINT_TITLE.x,
      y: Number.isFinite(Number(nextTitle?.y)) ? clamp(Number(nextTitle.y), 0, 0.9) : DEFAULT_PRINT_TITLE.y,
      width: Number.isFinite(Number(nextTitle?.width)) ? clamp(Number(nextTitle.width), 0.92, 0.92) : DEFAULT_PRINT_TITLE.width,
      fontFamily: typeof nextTitle?.fontFamily === "string" && nextTitle.fontFamily
        ? nextTitle.fontFamily
        : DEFAULT_PRINT_TITLE.fontFamily,
      fontSize: Number.isFinite(Number(nextTitle?.fontSize)) ? clamp(Number(nextTitle.fontSize), 0.018, 0.12) : DEFAULT_PRINT_TITLE.fontSize,
      fontWeight: Number.isFinite(Number(nextTitle?.fontWeight)) ? clamp(Math.round(Number(nextTitle.fontWeight)), 400, 900) : DEFAULT_PRINT_TITLE.fontWeight,
      lineHeight: Number.isFinite(Number(nextTitle?.lineHeight)) ? clamp(Number(nextTitle.lineHeight), 1, 1.8) : DEFAULT_PRINT_TITLE.lineHeight,
      color: typeof nextTitle?.color === "string" && nextTitle.color ? nextTitle.color : DEFAULT_PRINT_TITLE.color,
    };
  }

  function getSceneProps() {
    return sceneModel.get();
  }

  function getStylePreviewSceneProps() {
    if (!stylePreviewState.overrides) {
      return getSceneProps();
    }
    return {
      ...getSceneProps(),
      ...stylePreviewState.overrides,
    };
  }

  function getCamera() {
    return normalizeProjectionCamera(viewState.projection, viewState.activeCamera, { locked: viewState.locked });
  }

  function getCameraCommitCallback() {
    return onCameraChange;
  }

  function commitCameraIfNeeded() {
    if (!interactionState.pendingCameraCommit) {
      return;
    }
    interactionState.pendingCameraCommit = false;
    getCameraCommitCallback()?.(getCamera());
  }

  function applyCamera(nextCamera, { notify = true } = {}) {
    let snappedCamera = viewState.locked
      ? applyPrintPreviewSnap(viewState.projection, nextCamera, true)
      : normalizeProjectionCamera(viewState.projection, nextCamera, { locked: false });
    if (isCustomProjection(viewState.projection) && nextCamera?.selectedViewId === null) {
      snappedCamera = { ...snappedCamera, selectedViewId: null };
    }
    viewState = {
      ...viewState,
      activeCamera: snappedCamera,
    };
    invalidation.invalidate(["camera", "frame"]);
    requestRender();
    if (!notify) {
      return;
    }
    if (interactionState.active) {
      interactionState.pendingCameraCommit = true;
      return;
    }
    getCameraCommitCallback()?.(getCamera());
  }

  function ensurePreparedDynamicCommands() {
    const sceneProps = getSceneProps();
    const nextKey = `${sceneProps.dynamicLayersRevision}:${sceneProps.dynamicLayerDataRevision}`;
    if (nextKey === preparedDynamicKey) {
      return;
    }
    preparedDynamicCommands = perfTracker.time(
      "buildDynamicCommandsMs",
      () => buildDynamicDrawCommands(sceneProps.dynamicLayers, sceneProps.dynamicLayerData),
    );
    preparedDynamicKey = nextKey;
    perfTracker.gauge("preparedDynamicCommands", preparedDynamicCommands.length);
  }

  function syncCanvasSize(nextWidth, nextHeight) {
    const dpr = window.devicePixelRatio || 1;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = dpr;
    const scaledWidth = Math.max(1, Math.round(nextWidth * dpr));
    const scaledHeight = Math.max(1, Math.round(nextHeight * dpr));
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      invalidation.invalidate(["scene", "camera", "frame"]);
      stylePreviewState.initialized = false;
      stylePreviewInvalidation.invalidate("all");
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createStylePreviewSurface() {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(
        Math.max(1, Math.round(width * pixelRatio)),
        Math.max(1, Math.round(height * pixelRatio)),
      );
    }
    const surface = document.createElement("canvas");
    surface.width = Math.max(1, Math.round(width * pixelRatio));
    surface.height = Math.max(1, Math.round(height * pixelRatio));
    return surface;
  }

  function ensureStylePreviewSurface(pass) {
    const scaledWidth = Math.max(1, Math.round(width * pixelRatio));
    const scaledHeight = Math.max(1, Math.round(height * pixelRatio));
    const surface = stylePreviewSurfaces[pass];
    if (!surface || surface.width !== scaledWidth || surface.height !== scaledHeight) {
      stylePreviewSurfaces[pass] = createStylePreviewSurface();
      stylePreviewContexts[pass] = stylePreviewSurfaces[pass].getContext("2d");
    }
    stylePreviewContexts[pass].setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return stylePreviewContexts[pass];
  }

  function updateProjectionBtn() {
    const proj = PROJECTIONS.find((p) => p.id === viewState.projection);
    const customMode = isCustomProjection(viewState.projection);
    projectionBtn.textContent = proj?.name ?? viewState.projection;
    lockBtn.textContent = viewState.locked ? "Unlock" : "Lock";
    customLockBtn.textContent = viewState.locked ? "Unlock" : "Lock";
    customControls.hidden = !customMode;
    projectionControls.hidden = customMode;
    syncCustomControls();
    for (const item of projectionDropdown.querySelectorAll("[data-proj-id]")) {
      item.classList.toggle("is-active", item.dataset.projId === viewState.projection);
    }
    undoBtn.disabled = !canUndo;
    undoBtn.style.opacity = canUndo ? "1" : "0.45";
    undoBtn.style.cursor = canUndo ? "pointer" : "default";
    positionUndoButton();
    positionProjectionControls();
  }

  function closeDropdown() {
    projectionDropdown.hidden = true;
    customAddDropdown.hidden = true;
  }

  function getPrintPreviewFrame() {
    const maxWidth = Math.max(0, width - (PRINT_PREVIEW_INSET * 2));
    const maxHeight = Math.max(0, height - (PRINT_PREVIEW_INSET * 2));
    let frameHeight = maxHeight;
    let frameWidth = frameHeight * PRINT_PREVIEW_RATIO;
    if (frameWidth > maxWidth) {
      frameWidth = maxWidth;
      frameHeight = frameWidth / PRINT_PREVIEW_RATIO;
    }
    const x = (width - frameWidth) / 2;
    const y = (height - frameHeight) / 2;
    return { x, y, width: frameWidth, height: frameHeight };
  }

  function getTitleMetrics(title = printTitle) {
    const frame = getPrintPreviewFrame();
    const normalizedTitle = normalizeTitle(title);
    const x = frame.x + (frame.width * normalizedTitle.x);
    const y = frame.y + (frame.height * normalizedTitle.y);
    const maxWidth = Math.max(96, frame.width * normalizedTitle.width);
    const fontSizePx = Math.max(18, frame.width * normalizedTitle.fontSize);
    const lineHeightPx = fontSizePx * normalizedTitle.lineHeight;
    return {
      frame,
      title: normalizedTitle,
      x,
      y,
      maxWidth,
      fontSizePx,
      lineHeightPx,
    };
  }

  function syncTitleEditorEmptyState() {
    titleEditor.dataset.empty = String(titleEditor.textContent.trim() === "");
  }

  function updateDebugPanel() {
    const frame = getPrintPreviewFrame();
    const metrics = getTitleMetrics(printTitle);
    const shellRect = titleShell.getBoundingClientRect();
    const wrapRect = titleEditorWrap.getBoundingClientRect();
    const editorRect = titleEditor.getBoundingClientRect();
    const clearRect = titleClearBtn.getBoundingClientRect();
    const projectionRect = projectionBtn.getBoundingClientRect();
    const lockRect = lockBtn.getBoundingClientRect();
    const resetRect = resetBtn.getBoundingClientRect();
    debugPre.textContent = [
      `projection=${viewState.projection}`,
      `locked=${viewState.locked}`,
      `selected=${titleUiState.selected}`,
      `canvas=${width}x${height}`,
      `frame x=${frame.x.toFixed(1)} y=${frame.y.toFixed(1)} w=${frame.width.toFixed(1)} h=${frame.height.toFixed(1)}`,
      `title x=${metrics.x.toFixed(1)} y=${metrics.y.toFixed(1)} maxWidth=${metrics.maxWidth.toFixed(1)}`,
      `shell w=${shellRect.width.toFixed(1)} h=${shellRect.height.toFixed(1)}`,
      `wrap w=${wrapRect.width.toFixed(1)} h=${wrapRect.height.toFixed(1)}`,
      `editor w=${editorRect.width.toFixed(1)} h=${editorRect.height.toFixed(1)}`,
      `clear x=${clearRect.x.toFixed(1)} y=${clearRect.y.toFixed(1)} w=${clearRect.width.toFixed(1)} opacity=${getComputedStyle(titleClearBtn).opacity}`,
      `projectionBtn x=${projectionRect.x.toFixed(1)} y=${projectionRect.y.toFixed(1)} w=${projectionRect.width.toFixed(1)}`,
      `lockBtn x=${lockRect.x.toFixed(1)} y=${lockRect.y.toFixed(1)} w=${lockRect.width.toFixed(1)}`,
      `resetBtn x=${resetRect.x.toFixed(1)} y=${resetRect.y.toFixed(1)} w=${resetRect.width.toFixed(1)}`,
      `title text len=${(printTitle.text ?? "").length}`,
      `titleEditor text="${(titleEditor.textContent ?? "").replace(/\n/g, "\\n")}"`,
      `camera=${JSON.stringify(getCamera())}`,
    ].join("\n");
  }

  function emitTitleChange(nextTitle, { commit = false } = {}) {
    printTitle = normalizeTitle(nextTitle);
    syncTitleOverlay();
    updateDebugPanel();
    requestRender();
    onTitleChange?.(printTitle, { commit });
  }

  function updateToolbarVisibility() {
    titleToolbar.hidden = !titleUiState.selected;
    titleShell.classList.toggle("is-selected", titleUiState.selected);
  }

  function syncTitleOverlay() {
    const titleInsetX = 6;
    const titleInsetY = 4;
    const metrics = getTitleMetrics(printTitle);
    const nextText = printTitle.text;
    if (titleEditor.textContent !== nextText) {
      titleEditor.textContent = nextText;
    }
    syncTitleEditorEmptyState();
    titleEditor.style.fontFamily = metrics.title.fontFamily;
    titleEditor.style.fontSize = `${metrics.fontSizePx}px`;
    titleEditor.style.fontWeight = String(metrics.title.fontWeight);
    titleEditor.style.lineHeight = `${metrics.lineHeightPx}px`;
    titleEditor.style.color = metrics.title.color;
    titleShell.style.left = `${metrics.x}px`;
    titleShell.style.top = `${metrics.y}px`;
    titleShell.style.width = `${metrics.maxWidth}px`;
    titleEditorWrap.style.paddingTop = `${titleInsetY}px`;
    titleEditorWrap.style.paddingBottom = `${titleInsetY}px`;
    titleEditorWrap.style.paddingLeft = `${titleInsetX}px`;
    titleEditorWrap.style.paddingRight = `${titleInsetX}px`;
    titleToolbar.style.left = `${metrics.frame.x}px`;
    titleToolbar.style.top = `${Math.max(8, metrics.frame.y - 42)}px`;
    titleFontSelect.value = metrics.title.fontFamily;
    titleSizeInput.value = String(Math.round(metrics.fontSizePx));
    updateToolbarVisibility();
    updateDebugPanel();
  }

  function positionUndoButton() {
    const frame = getPrintPreviewFrame();
    const gutterRight = Math.max(0, width - (frame.x + frame.width));
    undoBtn.style.top = `${Math.max(8, frame.y - 34)}px`;
    undoBtn.style.right = `${gutterRight}px`;
  }

  function positionProjectionControls() {
    const frame = getPrintPreviewFrame();
    const top = frame.y + frame.height + 6;
    const right = Math.max(0, width - (frame.x + frame.width));
    projectionControls.style.top = `${top}px`;
    projectionControls.style.right = `${right}px`;
    customControls.style.top = `${top}px`;
    customControls.style.left = `${frame.x}px`;
    positionCustomAddDropdown();
  }

  function positionCustomAddDropdown() {
    if (customAddDropdown.hidden) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const addRect = customAddBtn.getBoundingClientRect();
    const dropdownHeight = customAddDropdown.offsetHeight || 240;
    const left = Math.max(0, addRect.left - containerRect.left);
    const top = Math.max(0, addRect.top - containerRect.top - dropdownHeight - 6);
    customAddDropdown.style.left = `${left}px`;
    customAddDropdown.style.top = `${top}px`;
  }

  function getCustomCamera() {
    const normalized = normalizeProjectionCamera("custom", viewState.activeCamera, { locked: viewState.locked });
    if (viewState.activeCamera?.selectedViewId === null) {
      return { ...normalized, selectedViewId: null };
    }
    return normalized;
  }

  function getSelectedCustomView(camera = getCustomCamera()) {
    if (camera.selectedViewId === null) {
      return null;
    }
    return camera.views.find((view) => view.id === camera.selectedViewId) ?? null;
  }

  function isCustomResizeMode() {
    return customUiState.layoutMode === "resize";
  }

  function isCustomReshapeMode() {
    return customUiState.layoutMode === "reshape";
  }

  function getCustomLayoutModeActionLabel() {
    return isCustomReshapeMode() ? "Resize" : "Reshape";
  }

  function syncCustomControls() {
    if (!isCustomProjection(viewState.projection)) {
      return;
    }
    const camera = getCustomCamera();
    const selectedView = getSelectedCustomView(camera);
    customAddBtn.hidden = !!selectedView;
    for (const control of customControls.querySelectorAll(".earthlab-custom-selected-control")) {
      control.hidden = !selectedView;
    }
    customDeleteBtn.disabled = !selectedView;
    customProjectionSelect.disabled = !selectedView;
    customLockBtn.disabled = !selectedView;
    customResetBtn.disabled = !selectedView;
    customLayoutModeBtn.disabled = !selectedView;
    customShapeToggleBtn.disabled = !selectedView;
    customLayoutModeBtn.textContent = getCustomLayoutModeActionLabel();
    if (selectedView) {
      customProjectionSelect.value = selectedView.projection;
      customShapeToggleBtn.textContent = selectedView.shape?.type === "rect" ? "Rectangle" : "Circle";
    }
    const showShapeToggle = !!selectedView && isCustomReshapeMode();
    customShapeToggleBtn.hidden = !showShapeToggle;
    customShapeToggleBtn.style.display = showShapeToggle ? "" : "none";
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function getCustomWorkspacePoint(camera, x, y) {
    const transform = getProjectionViewportTransform("custom", width, height, camera, { locked: viewState.locked });
    if (!transform) {
      return { x, y };
    }
    return {
      x: (x - transform.tx) / transform.zoom,
      y: (y - transform.ty) / transform.zoom,
    };
  }

  function getCustomViewBounds(view) {
    return {
      x: view.viewport.x * width,
      y: view.viewport.y * height,
      width: view.viewport.width * width,
      height: view.viewport.height * height,
    };
  }

  function getCustomProjectionBounds(view) {
    const frame = view.projectionFrame ?? view.viewport;
    return {
      x: frame.x * width,
      y: frame.y * height,
      width: Math.max(1, frame.width * width),
      height: Math.max(1, frame.height * height),
    };
  }

  function getCustomEditBounds(view) {
    return isCustomResizeMode() ? getCustomProjectionBounds(view) : getCustomViewBounds(view);
  }

  function getCustomShapeHit(view, point, bounds = getCustomViewBounds(view)) {
    const insideRect = point.x >= bounds.x
      && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y
      && point.y <= bounds.y + bounds.height;
    if (!insideRect) {
      return false;
    }
    if (view.shape?.type !== "circle") {
      return true;
    }
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    const cx = bounds.x + rx;
    const cy = bounds.y + ry;
    const nx = rx > 0 ? (point.x - cx) / rx : 0;
    const ny = ry > 0 ? (point.y - cy) / ry : 0;
    return (nx * nx) + (ny * ny) <= 1;
  }

  function getNextCustomViewId(camera) {
    const used = new Set(camera.views.map((view) => view.id));
    let index = camera.views.length + 1;
    let id = `view-${index}`;
    while (used.has(id)) {
      index += 1;
      id = `view-${index}`;
    }
    return id;
  }

  function updateSelectedCustomView(updater, { notify = true } = {}) {
    const camera = getCustomCamera();
    const selectedView = getSelectedCustomView(camera);
    if (!selectedView) {
      return;
    }
    const views = camera.views.map((view) => (
      view.id === selectedView.id ? updater(view) : view
    ));
    applyCamera(
      normalizeProjectionCamera("custom", { ...camera, views }, { locked: viewState.locked }),
      { notify },
    );
    syncCustomControls();
  }

  function getCenteredCustomViewport(camera, widthValue = 0.36, heightValue = 0.36) {
    const frame = getPrintPreviewFrame();
    const screenCenterX = frame.x + (frame.width / 2);
    const screenCenterY = frame.y + (frame.height / 2);
    const workspaceCenter = getCustomWorkspacePoint(camera, screenCenterX, screenCenterY);
    const centerX = width ? workspaceCenter.x / width : 0.5;
    const centerY = height ? workspaceCenter.y / height : 0.5;
    return clampCustomViewport({
      x: centerX - (widthValue / 2),
      y: centerY - (heightValue / 2),
      width: widthValue,
      height: heightValue,
    });
  }

  function addCustomProjectionView(projection = "naturalEarth") {
    const camera = getCustomCamera();
    const id = getNextCustomViewId(camera);
    const view = createDefaultCustomView({
      id,
      projection,
      viewport: getCenteredCustomViewport(camera),
    });
    applyCamera(
      normalizeProjectionCamera("custom", {
        ...camera,
        selectedViewId: id,
        views: [...camera.views, view],
      }, { locked: viewState.locked }),
    );
    updateProjectionBtn();
  }

  function deleteSelectedCustomProjectionView() {
    const camera = getCustomCamera();
    const selectedView = getSelectedCustomView(camera);
    if (!selectedView) {
      return;
    }
    const views = camera.views.filter((view) => view.id !== selectedView.id);
    applyCamera(
      {
        ...camera,
        selectedViewId: null,
        views,
      },
    );
    updateProjectionBtn();
  }

  function getCustomLayoutHit(x, y) {
    if (!isCustomProjection(viewState.projection)) {
      return null;
    }
    const camera = getCustomCamera();
    const point = getCustomWorkspacePoint(camera, x, y);
    const selectedView = getSelectedCustomView(camera);
    const selectedBounds = selectedView ? getCustomEditBounds(selectedView) : null;
    const threshold = 14 / Math.max(camera.frameZoomScale || 1, 0.001);

    if (selectedView && selectedBounds) {
      const nearLeft = Math.abs(point.x - selectedBounds.x) <= threshold;
      const nearRight = Math.abs(point.x - (selectedBounds.x + selectedBounds.width)) <= threshold;
      const nearTop = Math.abs(point.y - selectedBounds.y) <= threshold;
      const nearBottom = Math.abs(point.y - (selectedBounds.y + selectedBounds.height)) <= threshold;
      const withinX = point.x >= selectedBounds.x - threshold && point.x <= selectedBounds.x + selectedBounds.width + threshold;
      const withinY = point.y >= selectedBounds.y - threshold && point.y <= selectedBounds.y + selectedBounds.height + threshold;
      if (withinX && withinY) {
        if (nearRight && nearBottom) return { mode: "resize-se", viewId: selectedView.id };
        if (nearLeft && nearBottom) return { mode: "resize-sw", viewId: selectedView.id };
        if (nearRight && nearTop) return { mode: "resize-ne", viewId: selectedView.id };
        if (nearLeft && nearTop) return { mode: "resize-nw", viewId: selectedView.id };
        if (nearLeft || nearRight || nearTop || nearBottom) return { mode: "move", viewId: selectedView.id };

        const inSelectedShape = getCustomShapeHit(selectedView, point, selectedBounds);
        if (inSelectedShape && viewState.locked) {
          return { mode: "move", viewId: selectedView.id };
        }
      }
    }

    const rectHit = getCustomViewAtPoint({
      width,
      height,
      camera,
      x,
      y,
      includeShape: false,
    });
    if (!rectHit?.view) {
      return null;
    }
    const hitView = rectHit.view;
    if (hitView.id !== camera.selectedViewId) {
      return { mode: "select", viewId: hitView.id };
    }
    return null;
  }

  function getSelectedCustomResizeHandleHit(x, y) {
    if (!isCustomProjection(viewState.projection)) {
      return null;
    }
    const camera = getCustomCamera();
    const point = getCustomWorkspacePoint(camera, x, y);
    const selectedView = getSelectedCustomView(camera);
    const selectedBounds = selectedView ? getCustomEditBounds(selectedView) : null;
    if (!selectedView || !selectedBounds) {
      return null;
    }
    const threshold = 18 / Math.max(camera.frameZoomScale || 1, 0.001);
    const corners = [
      { mode: "resize-nw", x: selectedBounds.x, y: selectedBounds.y },
      { mode: "resize-ne", x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y },
      { mode: "resize-sw", x: selectedBounds.x, y: selectedBounds.y + selectedBounds.height },
      { mode: "resize-se", x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y + selectedBounds.height },
    ];
    const hit = corners.find((corner) => Math.hypot(point.x - corner.x, point.y - corner.y) <= threshold);
    return hit ? { mode: hit.mode, viewId: selectedView.id } : null;
  }

  function clampCustomViewport(viewport) {
    const widthValue = Math.max(0.05, Math.min(1, Number(viewport.width) || 0.05));
    const heightValue = Math.max(0.05, Math.min(1, Number(viewport.height) || 0.05));
    return {
      x: Math.max(0, Math.min(1 - widthValue, Number(viewport.x) || 0)),
      y: Math.max(0, Math.min(1 - heightValue, Number(viewport.y) || 0)),
      width: widthValue,
      height: heightValue,
    };
  }

  function resizeCustomViewport(startViewport, mode, dx, dy) {
    const minSize = 0.05;
    const left = startViewport.x;
    const top = startViewport.y;
    const right = startViewport.x + startViewport.width;
    const bottom = startViewport.y + startViewport.height;
    const startWidth = Math.max(minSize, startViewport.width);
    const startHeight = Math.max(minSize, startViewport.height);
    const dragXSign = mode === "resize-se" || mode === "resize-ne" ? 1 : -1;
    const dragYSign = mode === "resize-se" || mode === "resize-sw" ? 1 : -1;
    const widthScale = (startWidth + (dx * dragXSign)) / startWidth;
    const heightScale = (startHeight + (dy * dragYSign)) / startHeight;
    let scale = Math.max(minSize / startWidth, minSize / startHeight, Math.max(widthScale, heightScale));

    const anchorX = dragXSign === 1 ? left : right;
    const anchorY = dragYSign === 1 ? top : bottom;
    const maxWidth = dragXSign === 1 ? 1 - anchorX : anchorX;
    const maxHeight = dragYSign === 1 ? 1 - anchorY : anchorY;
    scale = Math.min(scale, maxWidth / startWidth, maxHeight / startHeight);

    const nextWidth = startWidth * scale;
    const nextHeight = startHeight * scale;
    const nextLeft = dragXSign === 1 ? anchorX : anchorX - nextWidth;
    const nextTop = dragYSign === 1 ? anchorY : anchorY - nextHeight;

    return {
      x: nextLeft,
      y: nextTop,
      width: nextWidth,
      height: nextHeight,
    };
  }

  function resizeCustomMaskViewport(startViewport, mode, dx, dy) {
    const minSize = 0.05;
    const left = startViewport.x;
    const top = startViewport.y;
    const right = startViewport.x + startViewport.width;
    const bottom = startViewport.y + startViewport.height;
    let nextLeft = left;
    let nextTop = top;
    let nextRight = right;
    let nextBottom = bottom;

    if (mode === "resize-se" || mode === "resize-ne") nextRight = right + dx;
    if (mode === "resize-sw" || mode === "resize-nw") nextLeft = left + dx;
    if (mode === "resize-se" || mode === "resize-sw") nextBottom = bottom + dy;
    if (mode === "resize-ne" || mode === "resize-nw") nextTop = top + dy;

    if (nextRight - nextLeft < minSize) {
      if (mode === "resize-sw" || mode === "resize-nw") nextLeft = right - minSize;
      else nextRight = left + minSize;
    }
    if (nextBottom - nextTop < minSize) {
      if (mode === "resize-ne" || mode === "resize-nw") nextTop = bottom - minSize;
      else nextBottom = top + minSize;
    }

    nextLeft = Math.max(0, nextLeft);
    nextTop = Math.max(0, nextTop);
    nextRight = Math.min(1, nextRight);
    nextBottom = Math.min(1, nextBottom);

    if (nextRight - nextLeft < minSize) {
      if (nextLeft === 0) nextRight = minSize;
      else nextLeft = Math.max(0, nextRight - minSize);
    }
    if (nextBottom - nextTop < minSize) {
      if (nextTop === 0) nextBottom = minSize;
      else nextTop = Math.max(0, nextBottom - minSize);
    }

    return {
      x: nextLeft,
      y: nextTop,
      width: nextRight - nextLeft,
      height: nextBottom - nextTop,
    };
  }

  function applyCustomLayoutDrag(currentX, currentY) {
    const startCamera = customLayoutDragState.startCamera;
    const selectedView = startCamera?.views.find((view) => view.id === customLayoutDragState.viewId);
    if (!startCamera || !selectedView) {
      return;
    }
    const startPoint = getCustomWorkspacePoint(startCamera, customLayoutDragState.startX, customLayoutDragState.startY);
    const currentPoint = getCustomWorkspacePoint(startCamera, currentX, currentY);
    const dx = (currentPoint.x - startPoint.x) / Math.max(1, width);
    const dy = (currentPoint.y - startPoint.y) / Math.max(1, height);
    let viewport = { ...selectedView.viewport };
    let projectionFrame = { ...(selectedView.projectionFrame ?? selectedView.viewport) };
    if (customLayoutDragState.mode === "move") {
      const movedViewport = clampCustomViewport({
        ...viewport,
        x: viewport.x + dx,
        y: viewport.y + dy,
      });
      const actualDx = movedViewport.x - viewport.x;
      const actualDy = movedViewport.y - viewport.y;
      viewport = movedViewport;
      projectionFrame = {
        ...projectionFrame,
        x: projectionFrame.x + actualDx,
        y: projectionFrame.y + actualDy,
      };
    } else if (customLayoutDragState.mode === "select") {
      return;
    } else if (customLayoutDragState.layoutMode === "reshape") {
      viewport = resizeCustomMaskViewport(viewport, customLayoutDragState.mode, dx, dy);
    } else {
      projectionFrame = resizeCustomViewport(projectionFrame, customLayoutDragState.mode, dx, dy);
    }
    const views = startCamera.views.map((view) => (
      view.id === selectedView.id ? { ...view, viewport, projectionFrame } : view
    ));
    applyCamera(
      normalizeProjectionCamera("custom", { ...startCamera, views }, { locked: false }),
      { notify: false },
    );
  }

  function getProjectedSphereBoundsFor(projectionType, camera, locked = viewState.locked, renderQuality = "settled") {
    const projectionAdapter = createProjectionAdapter({
      projectionType,
      width,
      height,
      camera,
      locked,
      state: projectionAdapterState,
      perfTracker,
      renderQuality,
    });
    const bounds = geoPath(projectionAdapter.projection).bounds({ type: "Sphere" });
    const [[x0, y0], [x1, y1]] = bounds;
    if (![x0, y0, x1, y1].every(Number.isFinite)) {
      return null;
    }
    if (!locked) {
      return { x0, y0, x1, y1 };
    }
    const transform = getProjectionViewportTransform(
      projectionType,
      width,
      height,
      normalizeProjectionCamera(projectionType, camera, { locked }),
      { locked },
    );
    if (!transform) {
      return { x0, y0, x1, y1 };
    }
    return {
      x0: (x0 * transform.zoom) + transform.tx,
      y0: (y0 * transform.zoom) + transform.ty,
      x1: (x1 * transform.zoom) + transform.tx,
      y1: (y1 * transform.zoom) + transform.ty,
    };
  }

  function getPrintPreviewAlignment(projectionAdapter) {
    const frame = getPrintPreviewFrame();
    if (!viewState.locked) {
      return {
        frame,
        centerX: false,
        centerY: false,
        left: false,
        right: false,
        top: false,
        bottom: false,
      };
    }
    const bounds = getProjectedSphereBoundsFor(
      viewState.projection,
      viewState.activeCamera,
      viewState.locked,
    );
    if (!bounds) {
      return {
        frame,
        centerX: false,
        centerY: false,
        left: false,
        right: false,
        top: false,
        bottom: false,
      };
    }

    const frameCenterX = frame.x + (frame.width / 2);
    const frameCenterY = frame.y + (frame.height / 2);
    const boundsCenterX = (bounds.x0 + bounds.x1) / 2;
    const boundsCenterY = (bounds.y0 + bounds.y1) / 2;

    return {
      frame,
      centerX: Math.abs(boundsCenterX - frameCenterX) <= PRINT_ALIGNMENT_THRESHOLD_PX,
      centerY: Math.abs(boundsCenterY - frameCenterY) <= PRINT_ALIGNMENT_THRESHOLD_PX,
      left: Math.abs(bounds.x0 - frame.x) <= PRINT_ALIGNMENT_THRESHOLD_PX,
      right: Math.abs(bounds.x1 - (frame.x + frame.width)) <= PRINT_ALIGNMENT_THRESHOLD_PX,
      top: Math.abs(bounds.y0 - frame.y) <= PRINT_ALIGNMENT_THRESHOLD_PX,
      bottom: Math.abs(bounds.y1 - (frame.y + frame.height)) <= PRINT_ALIGNMENT_THRESHOLD_PX,
    };
  }

  function getAxisSnapTarget(candidates) {
    let best = null;
    for (const candidate of candidates) {
      if (Math.abs(candidate.delta) > PRINT_SNAP_CAPTURE_THRESHOLD_PX) continue;
      if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) {
        best = candidate;
      }
    }
    return best;
  }

  function applyPrintPreviewSnap(projectionType, camera, locked = viewState.locked) {
    if (!width || !height || isCustomProjection(projectionType)) {
      return normalizeProjectionCamera(projectionType, camera, { locked });
    }

    const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked });
    const bounds = getProjectedSphereBoundsFor(projectionType, normalizedCamera, locked, "interactive");
    if (!bounds) {
      return normalizedCamera;
    }

    const frame = getPrintPreviewFrame();
    const frameCenterX = frame.x + (frame.width / 2);
    const frameCenterY = frame.y + (frame.height / 2);
    const boundsCenterX = (bounds.x0 + bounds.x1) / 2;
    const boundsCenterY = (bounds.y0 + bounds.y1) / 2;

    if (locked) {
      const nextCamera = { ...normalizedCamera };
      const snapX = getAxisSnapTarget([
        { delta: frameCenterX - boundsCenterX },
        { delta: frame.x - bounds.x0 },
        { delta: (frame.x + frame.width) - bounds.x1 },
      ]);
      const snapY = getAxisSnapTarget([
        { delta: frameCenterY - boundsCenterY },
        { delta: frame.y - bounds.y0 },
        { delta: (frame.y + frame.height) - bounds.y1 },
      ]);
      if (snapX) {
        nextCamera.panX += snapX.delta / width;
      }
      if (snapY) {
        nextCamera.panY += snapY.delta / height;
      }
      return normalizeProjectionCamera(projectionType, nextCamera, { locked: true });
    }

    if (isFlatProjection(projectionType)) {
      return normalizedCamera;
    }

    const radiusX = (bounds.x1 - bounds.x0) / 2;
    const radiusY = (bounds.y1 - bounds.y0) / 2;
    const snapX = getAxisSnapTarget([
      { delta: frame.x - bounds.x0, targetRadius: width / 2 - frame.x },
      { delta: (frame.x + frame.width) - bounds.x1, targetRadius: frame.x + frame.width - width / 2 },
    ]);
    const snapY = getAxisSnapTarget([
      { delta: frame.y - bounds.y0, targetRadius: height / 2 - frame.y },
      { delta: (frame.y + frame.height) - bounds.y1, targetRadius: frame.y + frame.height - height / 2 },
    ]);

    if (!snapX && !snapY) {
      return normalizedCamera;
    }

    let zoomScale = normalizedCamera.zoomScale;
    if (snapX?.targetRadius && radiusX > 0) {
      zoomScale *= snapX.targetRadius / radiusX;
    } else if (snapY?.targetRadius && radiusY > 0) {
      zoomScale *= snapY.targetRadius / radiusY;
    }

    return normalizeProjectionCamera(projectionType, { ...normalizedCamera, zoomScale }, { locked: false });
  }

  function getAlignmentCenterAlpha(axis, visible, now) {
    const key = axis === "x" ? "centerXStartedAt" : "centerYStartedAt";
    const visibleKey = axis === "x" ? "centerXVisible" : "centerYVisible";
    if (interactionState.active) {
      alignmentFadeState[key] = null;
      alignmentFadeState[visibleKey] = !!visible;
      return visible ? PRINT_ALIGNMENT_CENTER_MAX_ALPHA : 0;
    }
    if (!alignmentFadeState[visibleKey]) {
      alignmentFadeState[key] = null;
      return 0;
    }
    if (alignmentFadeState[key] === null) {
      alignmentFadeState[key] = now;
    }
    const elapsed = now - alignmentFadeState[key];
    if (elapsed >= PRINT_ALIGNMENT_CENTER_FADE_MS) {
      alignmentFadeState[key] = null;
      alignmentFadeState[visibleKey] = false;
      return 0;
    }
    requestRender();
    return PRINT_ALIGNMENT_CENTER_MAX_ALPHA * (1 - (elapsed / PRINT_ALIGNMENT_CENTER_FADE_MS));
  }

  function drawPrintPreviewOverlay(ctx, projectionAdapter = null) {
    if (!width || !height) return;
    const alignment = projectionAdapter ? getPrintPreviewAlignment(projectionAdapter) : null;
    const frame = alignment?.frame ?? getPrintPreviewFrame();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(frame.x, frame.y, frame.width, frame.height);
    ctx.fillStyle = PRINT_PREVIEW_MASK_FILL;
    ctx.fill("evenodd");
    ctx.beginPath();
    ctx.rect(frame.x + 0.5, frame.y + 0.5, Math.max(0, frame.width - 1), Math.max(0, frame.height - 1));
    ctx.strokeStyle = PRINT_PREVIEW_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (showCanvasTitle && printTitle.text.trim()) {
      const titleInsetX = 6;
      const metrics = getTitleMetrics(printTitle);
      ctx.font = `${metrics.title.fontWeight} ${metrics.fontSizePx}px ${metrics.title.fontFamily}`;
      const wrapWidth = Math.max(1, metrics.maxWidth - (titleInsetX * 2));
      const words = printTitle.text.split(/\s+/).filter(Boolean);
      const lines = [];
      let currentLine = "";
      for (const word of words) {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (!currentLine || ctx.measureText(nextLine).width <= wrapWidth) {
          currentLine = nextLine;
          continue;
        }
        lines.push(currentLine);
        currentLine = word;
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      if (!lines.length && printTitle.text.trim()) {
        lines.push(printTitle.text.trim());
      }

      ctx.fillStyle = metrics.title.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          metrics.x + titleInsetX,
          metrics.y + (index * metrics.lineHeightPx),
          wrapWidth,
        );
      });
    }

    const now = performance.now();
    const centerXAlpha = getAlignmentCenterAlpha("x", alignment?.centerX, now);
    const centerYAlpha = getAlignmentCenterAlpha("y", alignment?.centerY, now);
    if (centerXAlpha > 0) {
      const x = frame.x + (frame.width / 2);
      ctx.beginPath();
      ctx.moveTo(x, frame.y);
      ctx.lineTo(x, frame.y + frame.height);
      ctx.strokeStyle = `rgba(${PRINT_ALIGNMENT_CENTER_RGB}, ${centerXAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (centerYAlpha > 0) {
      const y = frame.y + (frame.height / 2);
      ctx.beginPath();
      ctx.moveTo(frame.x, y);
      ctx.lineTo(frame.x + frame.width, y);
      ctx.strokeStyle = `rgba(${PRINT_ALIGNMENT_CENTER_RGB}, ${centerYAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (interactionState.active && alignment?.left) {
      ctx.beginPath();
      ctx.moveTo(frame.x, frame.y);
      ctx.lineTo(frame.x, frame.y + frame.height);
      ctx.strokeStyle = PRINT_ALIGNMENT_EDGE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (interactionState.active && alignment?.right) {
      const x = frame.x + frame.width;
      ctx.beginPath();
      ctx.moveTo(x, frame.y);
      ctx.lineTo(x, frame.y + frame.height);
      ctx.strokeStyle = PRINT_ALIGNMENT_EDGE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (interactionState.active && alignment?.top) {
      ctx.beginPath();
      ctx.moveTo(frame.x, frame.y);
      ctx.lineTo(frame.x + frame.width, frame.y);
      ctx.strokeStyle = PRINT_ALIGNMENT_EDGE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (interactionState.active && alignment?.bottom) {
      const y = frame.y + frame.height;
      ctx.beginPath();
      ctx.moveTo(frame.x, y);
      ctx.lineTo(frame.x + frame.width, y);
      ctx.strokeStyle = PRINT_ALIGNMENT_EDGE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBitmapFrame(bitmap) {
    const sceneProps = getSceneProps();
    prepareContext(context, width, height, sceneProps.backgroundFill);
    context.drawImage(bitmap, 0, 0, width, height);
    const projectionAdapter = createProjectionAdapter({
      projectionType: viewState.projection,
      width,
      height,
      camera: viewState.activeCamera,
      locked: viewState.locked,
      state: projectionAdapterState,
      perfTracker,
      renderQuality: "settled",
    });
    drawPrintPreviewOverlay(context, projectionAdapter);
  }

  function getCurrentFlatFrameKey() {
    return JSON.stringify({
      projection: viewState.projection,
      width,
      height,
      pixelRatio,
      sceneRevision: sceneModel.getRevision(),
      camera: normalizeProjectionCamera(viewState.projection, viewState.activeCamera, { locked: viewState.locked }),
      locked: viewState.locked,
      interactionActive: interactionState.active,
    });
  }

  function ensureFlatWorker() {
    if (!workerState.enabled || workerState.instance) {
      return workerState.instance;
    }
    workerState.instance = new Worker(
      new URL("./print/worker/flat-render-worker.js", import.meta.url),
      { type: "module" },
    );
    workerState.instance.onmessage = (event) => {
      const {
        type,
        bitmap,
        projection,
        width: frameWidth,
        height: frameHeight,
        frameRequestKey,
        perf,
      } = event.data ?? {};
      if (type !== PRINT_WORKER_MESSAGE.FRAME) {
        return;
      }
      if (projection !== viewState.projection || getProjectionRenderMode(viewState.projection) !== "worker") {
        bitmap?.close?.();
        return;
      }
      if (!frameRequestKey || frameRequestKey !== workerState.currentRequestKey) {
        bitmap?.close?.();
        return;
      }
      workerState.latestBitmap?.close?.();
      workerState.latestBitmap = bitmap;
      workerState.latestFrameKey = frameRequestKey;
      if (interactionState.active) {
        return;
      }
      if (workerState.awaitingSettledFrame && frameRequestKey === workerState.currentRequestKey) {
        workerState.awaitingSettledFrame = false;
      }
      if (width && height) {
        drawBitmapFrame(bitmap);
      }
      if (perf) {
        globalThis.__earthlabPrintPerfLatest = {
          ...(globalThis.__earthlabPrintPerfLatest ?? {}),
          worker: perf,
        };
      }
    };
    workerState.instance.postMessage({
      type: PRINT_WORKER_MESSAGE.INIT,
      width,
      height,
      pixelRatio,
      perfEnabled: perfTracker.enabled,
    });
    return workerState.instance;
  }

  function postWorkerSceneIfNeeded(worker) {
    const revision = sceneModel.getRevision();
    if (revision === workerSceneRevisionSent) {
      return false;
    }
    worker.postMessage({
      type: PRINT_WORKER_MESSAGE.SET_SCENE,
      scene: getSceneProps(),
      sceneRevision: revision,
    });
    workerSceneRevisionSent = revision;
    return true;
  }

  function requestFlatWorkerFrame() {
    const worker = ensureFlatWorker();
    if (!worker || !width || !height) {
      return false;
    }
    const frameRequestKey = `${++workerFrameRequestCounter}:${getCurrentFlatFrameKey()}`;
    workerState.currentRequestKey = frameRequestKey;
    const sceneDirty = postWorkerSceneIfNeeded(worker);
    worker.postMessage({
      type: PRINT_WORKER_MESSAGE.SET_VIEW,
      width,
      height,
      pixelRatio,
      projection: viewState.projection,
      camera: viewState.activeCamera,
      locked: viewState.locked,
      sceneDirty,
      frameRequestKey,
    });
    worker.postMessage({
      type: PRINT_WORKER_MESSAGE.SET_INTERACTION,
      active: interactionState.active,
    });
    worker.postMessage({
      type: PRINT_WORKER_MESSAGE.RENDER,
      passes: sceneDirty ? "all" : "frame",
    });
    return true;
  }

  function getActiveLandGeometry() {
    const sceneProps = getSceneProps();
    if (interactionState.active) {
      return sceneProps.interactionLand ?? sceneProps.land;
    }
    return sceneProps.land;
  }

  function rebuildStylePreviewPass(pass) {
    const previewSceneProps = getStylePreviewSceneProps();
    const previewContext = ensureStylePreviewSurface(pass);
    prepareContext(previewContext, width, height, "rgba(0, 0, 0, 0)");
    const projectionAdapter = createProjectionAdapter({
      projectionType: viewState.projection,
      width,
      height,
      camera: viewState.activeCamera,
      locked: viewState.locked,
      state: projectionAdapterState,
      perfTracker,
      renderQuality: "settled",
    });
    drawProjectedScene(
      previewContext,
      projectionAdapter,
      previewSceneProps,
      preparedDynamicCommands,
      {
        land: previewSceneProps.land,
        graticules: previewSceneProps.graticules,
        applyViewportTransform: true,
        includeEarth: pass === "earth",
        includeDynamicShapes: pass === "dynamic-shapes",
        includePoints: pass === "points",
        perfTracker,
      },
    );
  }

  function renderStylePreview() {
    const previewSceneProps = getStylePreviewSceneProps();
    const dirty = stylePreviewInvalidation.consume();
    if (dirty.has("dynamic-shapes") || dirty.has("points")) {
      ensurePreparedDynamicCommands();
    }
    if (dirty.has("earth")) {
      rebuildStylePreviewPass("earth");
    }
    if (dirty.has("dynamic-shapes")) {
      rebuildStylePreviewPass("dynamic-shapes");
    }
    if (dirty.has("points")) {
      rebuildStylePreviewPass("points");
    }
    prepareContext(context, width, height, previewSceneProps.backgroundFill);
    context.drawImage(stylePreviewSurfaces.earth, 0, 0, width, height);
    context.drawImage(stylePreviewSurfaces["dynamic-shapes"], 0, 0, width, height);
    context.drawImage(stylePreviewSurfaces.points, 0, 0, width, height);
    const projectionAdapter = createProjectionAdapter({
      projectionType: viewState.projection,
      width,
      height,
      camera: viewState.activeCamera,
      locked: viewState.locked,
      state: projectionAdapterState,
      perfTracker,
      renderQuality: "settled",
    });
    drawPrintPreviewOverlay(context, projectionAdapter);
  }

  function renderOrthographic() {
    const sceneProps = getSceneProps();
    if (!interactionState.active) {
      ensurePreparedDynamicCommands();
    }
    prepareContext(context, width, height, sceneProps.backgroundFill);
    const projectionAdapter = createProjectionAdapter({
      projectionType: viewState.projection,
      width,
      height,
      camera: viewState.activeCamera,
      locked: viewState.locked,
      state: projectionAdapterState,
      perfTracker,
      renderQuality: interactionState.active ? "interactive" : "settled",
    });
    drawProjectedScene(
      context,
      projectionAdapter,
      sceneProps,
      preparedDynamicCommands,
      {
        land: getActiveLandGeometry(),
        graticules: sceneProps.graticules,
        applyViewportTransform: true,
        includeDynamicShapes: !interactionState.active,
        includePoints: !interactionState.active,
        perfTracker,
      },
    );
    drawPrintPreviewOverlay(context, projectionAdapter);
  }

  function renderFlat() {
    const sceneProps = getSceneProps();
    if (interactionState.active) {
      prepareContext(context, width, height, sceneProps.backgroundFill);
      const projectionAdapter = createProjectionAdapter({
        projectionType: viewState.projection,
        width,
        height,
        camera: viewState.activeCamera,
        locked: viewState.locked,
        state: projectionAdapterState,
        perfTracker,
        renderQuality: "interactive",
      });
      drawProjectedScene(
        context,
        projectionAdapter,
        sceneProps,
        preparedDynamicCommands,
        {
          land: sceneProps.interactionLand ?? sceneProps.land,
          graticules: sceneProps.graticules,
          applyViewportTransform: true,
          includeDynamicShapes: false,
          includePoints: false,
          perfTracker,
        },
      );
      drawPrintPreviewOverlay(context, projectionAdapter);
      return;
    }

    if (stylePreviewState.active) {
      ensurePreparedDynamicCommands();
      prepareContext(context, width, height, sceneProps.backgroundFill);
      const projectionAdapter = createProjectionAdapter({
        projectionType: viewState.projection,
        width,
        height,
        camera: viewState.activeCamera,
        locked: viewState.locked,
        state: projectionAdapterState,
        perfTracker,
        renderQuality: "settled",
      });
      drawProjectedScene(
        context,
        projectionAdapter,
        sceneProps,
        preparedDynamicCommands,
        {
          land: sceneProps.land,
          graticules: sceneProps.graticules,
          applyViewportTransform: true,
          includeEarth: true,
          includeDynamicShapes: true,
          includePoints: true,
          perfTracker,
        },
      );
      drawPrintPreviewOverlay(context, projectionAdapter);
      return;
    }

    prepareContext(context, width, height, sceneProps.backgroundFill);
    if (requestFlatWorkerFrame()
      && !workerState.awaitingSettledFrame
      && workerState.latestBitmap
      && workerState.latestFrameKey === workerState.currentRequestKey) {
      drawBitmapFrame(workerState.latestBitmap);
      return;
    }
    ensurePreparedDynamicCommands();
    const projectionAdapter = createProjectionAdapter({
      projectionType: viewState.projection,
      width,
      height,
      camera: viewState.activeCamera,
      locked: viewState.locked,
      state: projectionAdapterState,
      perfTracker,
      renderQuality: "settled",
    });
    drawProjectedScene(
      context,
      projectionAdapter,
      sceneProps,
      preparedDynamicCommands,
      {
        land: sceneProps.land,
        graticules: sceneProps.graticules,
        applyViewportTransform: true,
        perfTracker,
      },
    );
    drawPrintPreviewOverlay(context, projectionAdapter);
  }

  function getCustomViewScene(sceneProps, view) {
    return {
      ...sceneProps,
      ...(view.style?.oceanFill ? { oceanFill: view.style.oceanFill } : null),
      ...(view.style?.landFill ? { landFill: view.style.landFill } : null),
      ...(view.style?.landLine ? { landLine: view.style.landLine } : null),
      ...(view.style?.graticulesLine ? { graticulesLine: view.style.graticulesLine } : null),
      ...(Array.isArray(view.style?.earthRenderOrder) ? { earthRenderOrder: view.style.earthRenderOrder } : null),
    };
  }

  function drawCustomSelectionOverlay(ctx, camera) {
    const selectedView = getSelectedCustomView(camera);
    if (!selectedView) {
      return;
    }
    const bounds = getCustomEditBounds(selectedView);
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.setLineDash([]);
    const handleSize = 10;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height],
      [bounds.x + bounds.width, bounds.y + bounds.height],
    ].forEach(([x, y]) => {
      ctx.fillRect(x - (handleSize / 2), y - (handleSize / 2), handleSize, handleSize);
      ctx.strokeRect(x - (handleSize / 2), y - (handleSize / 2), handleSize, handleSize);
    });
    ctx.restore();
  }

  function renderCustom() {
    const sceneProps = getSceneProps();
    if (!interactionState.active) {
      ensurePreparedDynamicCommands();
    }
    prepareContext(context, width, height, sceneProps.backgroundFill);
    const camera = getCustomCamera();
    const frameTransform = getProjectionViewportTransform("custom", width, height, camera, { locked: viewState.locked });
    context.save();
    if (frameTransform) {
      context.transform(frameTransform.zoom, 0, 0, frameTransform.zoom, frameTransform.tx, frameTransform.ty);
    }
    for (const view of camera.views) {
      const bounds = {
        x: view.viewport.x * width,
        y: view.viewport.y * height,
        width: Math.max(1, view.viewport.width * width),
        height: Math.max(1, view.viewport.height * height),
      };
      const projectionBounds = getCustomProjectionBounds(view);
      context.save();
      context.beginPath();
      if (view.shape?.type === "rect") {
        context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      } else {
        context.ellipse(
          bounds.x + (bounds.width / 2),
          bounds.y + (bounds.height / 2),
          bounds.width / 2,
          bounds.height / 2,
          0,
          0,
          Math.PI * 2,
        );
      }
      context.clip();
      context.translate(projectionBounds.x, projectionBounds.y);
      const projectionAdapter = createProjectionAdapter({
        projectionType: view.projection,
        width: projectionBounds.width,
        height: projectionBounds.height,
        camera: view.camera,
        locked: false,
        state: projectionAdapterState,
        perfTracker,
        renderQuality: interactionState.active ? "interactive" : "settled",
      });
      drawProjectedScene(
        context,
        projectionAdapter,
        getCustomViewScene(sceneProps, view),
        preparedDynamicCommands,
        {
          land: getActiveLandGeometry(),
          graticules: sceneProps.graticules,
          applyViewportTransform: true,
          includeDynamicShapes: !interactionState.active,
          includePoints: !interactionState.active,
          clipToSphere: view.clip?.type !== "rect",
          perfTracker,
        },
      );
      context.restore();
    }
    if (getSelectedCustomView(camera)) {
      drawCustomSelectionOverlay(context, camera);
    }
    context.restore();
    drawPrintPreviewOverlay(context, null);
  }

  function render() {
    const started = performance.now();
    const nextWidth = mount.clientWidth;
    const nextHeight = mount.clientHeight;
    if (!nextWidth || !nextHeight || !context) {
      return;
    }
    syncCanvasSize(nextWidth, nextHeight);
    mount.style.backgroundColor = stylePreviewState.active
      ? getStylePreviewSceneProps().backgroundFill
      : getSceneProps().backgroundFill;
    if (stylePreviewState.active) {
      if (isCustomProjection(viewState.projection)) {
        renderCustom();
        invalidation.consume();
        updateDebugPanel();
        perfTracker.recordDuration("renderFrameMs", performance.now() - started);
        perfTracker.publish();
        return;
      }
      renderStylePreview();
      invalidation.consume();
      updateDebugPanel();
      perfTracker.recordDuration("renderFrameMs", performance.now() - started);
      perfTracker.publish();
      return;
    }
    if (getProjectionRenderMode(viewState.projection) === "worker") {
      renderFlat();
      invalidation.consume();
      updateDebugPanel();
      perfTracker.recordDuration("renderFrameMs", performance.now() - started);
      perfTracker.publish();
      return;
    }
    if (isCustomProjection(viewState.projection)) {
      renderCustom();
      invalidation.consume();
      updateDebugPanel();
      perfTracker.recordDuration("renderFrameMs", performance.now() - started);
      perfTracker.publish();
      return;
    }
    renderOrthographic();
    invalidation.consume();
    updateDebugPanel();
    perfTracker.recordDuration("renderFrameMs", performance.now() - started);
    perfTracker.publish();
  }

  function requestRender() {
    if (frameHandle) {
      return;
    }
    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = 0;
      render();
    });
  }

  let dropdownCloseListener = null;
  titleShell.addEventListener("pointerdown", (event) => {
    if (event.target === titleShell || event.target === titleEditorWrap) {
      event.preventDefault();
      titleEditor.focus();
    }
  });

  titleEditor.addEventListener("focus", () => {
    titleUiState.selected = true;
    syncTitleOverlay();
  });

  titleEditor.addEventListener("blur", (event) => {
    if (event.relatedTarget === titleClearBtn || event.relatedTarget === titleMoveHandle || event.relatedTarget === titleFontSelect || event.relatedTarget === titleSizeInput) {
      return;
    }
    titleUiState.selected = false;
    emitTitleChange({ ...printTitle, text: titleEditor.textContent ?? "" }, { commit: true });
  });

  titleEditor.addEventListener("input", () => {
    syncTitleEditorEmptyState();
    emitTitleChange({ ...printTitle, text: titleEditor.textContent ?? "" });
  });

  titleEditor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleEditor.blur();
    }
  });

  titleClearBtn.addEventListener("mousedown", (event) => event.preventDefault());
  titleClearBtn.addEventListener("click", () => {
    emitTitleChange({ ...printTitle, text: "" }, { commit: true });
    titleEditor.focus();
  });

  titleFontSelect.addEventListener("input", () => {
    titleUiState.selected = true;
    emitTitleChange({ ...printTitle, fontFamily: titleFontSelect.value }, { commit: true });
  });

  titleSizeInput.addEventListener("input", () => {
    titleUiState.selected = true;
    const frame = getPrintPreviewFrame();
    const fontSizePx = Number(titleSizeInput.value);
    const fontSize = frame.width > 0 ? fontSizePx / frame.width : printTitle.fontSize;
    emitTitleChange({ ...printTitle, fontSize }, { commit: false });
  });

  titleSizeInput.addEventListener("change", () => {
    const frame = getPrintPreviewFrame();
    const fontSizePx = Number(titleSizeInput.value);
    const fontSize = frame.width > 0 ? fontSizePx / frame.width : printTitle.fontSize;
    emitTitleChange({ ...printTitle, fontSize }, { commit: true });
  });

  titleMoveHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    titleUiState.selected = true;
    titleUiState.dragging = true;
    titleUiState.dragPointerId = event.pointerId;
    const metrics = getTitleMetrics(printTitle);
    titleUiState.dragOffsetX = event.clientX - metrics.x;
    titleUiState.dragOffsetY = event.clientY - metrics.y;
    titleMoveHandle.setPointerCapture?.(event.pointerId);
    titleShell.classList.add("is-dragging");
    syncTitleOverlay();
  });

  titleMoveHandle.addEventListener("pointermove", (event) => {
    if (!titleUiState.dragging || event.pointerId !== titleUiState.dragPointerId) {
      return;
    }
    event.preventDefault();
    const frame = getPrintPreviewFrame();
    const shellWidth = titleShell.offsetWidth || Math.max(96, frame.width * printTitle.width);
    const shellHeight = titleShell.offsetHeight || 24;
    const nextX = clamp((event.clientX - titleUiState.dragOffsetX - frame.x) / Math.max(1, frame.width), 0, Math.max(0, 1 - (shellWidth / Math.max(1, frame.width))));
    const nextY = clamp((event.clientY - titleUiState.dragOffsetY - frame.y) / Math.max(1, frame.height), 0, Math.max(0, 1 - (shellHeight / Math.max(1, frame.height))));
    emitTitleChange({ ...printTitle, x: nextX, y: nextY });
  });

  function finishTitleDrag(event) {
    if (!titleUiState.dragging || event.pointerId !== titleUiState.dragPointerId) {
      return;
    }
    titleUiState.dragging = false;
    titleUiState.dragPointerId = null;
    titleShell.classList.remove("is-dragging");
    titleMoveHandle.releasePointerCapture?.(event.pointerId);
    emitTitleChange(printTitle, { commit: true });
  }

  titleMoveHandle.addEventListener("pointerup", finishTitleDrag);
  titleMoveHandle.addEventListener("pointercancel", finishTitleDrag);

  projectionBtn.addEventListener("click", () => {
    if (!projectionDropdown.hidden) {
      closeDropdown();
      if (dropdownCloseListener) {
        document.removeEventListener("pointerdown", dropdownCloseListener, true);
        dropdownCloseListener = null;
      }
      return;
    }
    customAddDropdown.hidden = true;
    projectionDropdown.hidden = false;
    dropdownCloseListener = (event) => {
      if (!projectionDropdown.contains(event.target) && event.target !== projectionBtn) {
        closeDropdown();
        document.removeEventListener("pointerdown", dropdownCloseListener, true);
        dropdownCloseListener = null;
      }
    };
    document.addEventListener("pointerdown", dropdownCloseListener, true);
  });

  projectionDropdown.addEventListener("click", (event) => {
    const item = event.target.closest("[data-proj-id]");
    if (!item || item.dataset.projId === viewState.projection) {
      return;
    }
    closeDropdown();
    const nextProjection = item.dataset.projId;
    const frame = getPrintPreviewFrame();
    const nextCamera = width && height
      ? transferProjectionCamera({
        sourceProjectionType: viewState.projection,
        targetProjectionType: nextProjection,
        width,
        height,
        camera: viewState.activeCamera,
        sourceLocked: viewState.locked,
        targetLocked: viewState.locked,
        focusX: frame.x + (frame.width / 2),
        focusY: frame.y + (frame.height / 2),
      })
      : normalizeProjectionCamera(nextProjection, null, { locked: viewState.locked });
    viewState = {
      ...viewState,
      projection: nextProjection,
      activeCamera: nextCamera,
    };
    invalidation.invalidate(["scene", "camera", "frame"]);
    updateProjectionBtn();
    requestRender();
    onProjectionChange?.(nextProjection, nextCamera, viewState.locked);
  });

  function toggleProjectionLock() {
    closeDropdown();
    const nextLocked = !viewState.locked;
    let nextCamera = viewState.activeCamera
      ? normalizeProjectionCamera(viewState.projection, viewState.activeCamera, { locked: nextLocked })
      : normalizeProjectionCamera(viewState.projection, null, { locked: nextLocked });
    if (isCustomProjection(viewState.projection) && getCustomCamera().selectedViewId === null) {
      nextCamera = { ...nextCamera, selectedViewId: null };
    }
    viewState = {
      ...viewState,
      locked: nextLocked,
      activeCamera: nextCamera,
    };
    updateProjectionBtn();
    invalidation.invalidate(["camera", "frame"]);
    requestRender();
    onProjectionLockChange?.(nextLocked, nextCamera);
  }

  function resetActiveProjection() {
    closeDropdown();
    if (isCustomProjection(viewState.projection)) {
      const selectedView = getSelectedCustomView();
      if (selectedView) {
        updateSelectedCustomView((view) => ({
          ...view,
          projectionFrame: { ...view.viewport },
          camera: normalizeProjectionCamera(view.projection, null, { locked: false }),
        }));
      }
      return;
    }
    onProjectionReset?.(viewState.projection, viewState.locked);
  }

  lockBtn.addEventListener("click", toggleProjectionLock);
  customLockBtn.addEventListener("click", toggleProjectionLock);
  resetBtn.addEventListener("click", resetActiveProjection);
  customResetBtn.addEventListener("click", resetActiveProjection);

  customAddBtn.addEventListener("click", () => {
    if (!customAddDropdown.hidden) {
      closeDropdown();
      if (dropdownCloseListener) {
        document.removeEventListener("pointerdown", dropdownCloseListener, true);
        dropdownCloseListener = null;
      }
      return;
    }
    projectionDropdown.hidden = true;
    customAddDropdown.hidden = false;
    positionCustomAddDropdown();
    dropdownCloseListener = (event) => {
      if (!customAddDropdown.contains(event.target) && event.target !== customAddBtn) {
        closeDropdown();
        document.removeEventListener("pointerdown", dropdownCloseListener, true);
        dropdownCloseListener = null;
      }
    };
    document.addEventListener("pointerdown", dropdownCloseListener, true);
  });

  customAddDropdown.addEventListener("click", (event) => {
    const item = event.target.closest("[data-custom-add-proj-id]");
    if (!item) {
      return;
    }
    closeDropdown();
    addCustomProjectionView(item.dataset.customAddProjId);
  });

  customDeleteBtn.addEventListener("click", () => {
    closeDropdown();
    deleteSelectedCustomProjectionView();
  });

  customProjectionSelect.addEventListener("change", () => {
    const projection = customProjectionSelect.value;
    updateSelectedCustomView((view) => ({
      ...view,
      projection,
      projectionFrame: { ...view.viewport },
      camera: normalizeProjectionCamera(projection, null, { locked: false }),
    }));
  });

  customLayoutModeBtn.addEventListener("click", () => {
    customUiState.layoutMode = isCustomReshapeMode() ? "resize" : "reshape";
    syncCustomControls();
  });

  customShapeToggleBtn.addEventListener("click", () => {
    updateSelectedCustomView((view) => ({
      ...view,
      clip: { ...(view.clip ?? {}), type: view.shape?.type === "rect" ? "sphere" : "rect" },
      shape: { ...(view.shape ?? {}), type: view.shape?.type === "rect" ? "circle" : "rect" },
    }));
  });

  undoBtn.addEventListener("click", () => {
    if (!canUndo) {
      return;
    }
    closeDropdown();
    onUndo?.();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!isCustomProjection(viewState.projection)) {
      return;
    }
    const point = getCanvasPoint(event);
    const layoutHit = getSelectedCustomResizeHandleHit(point.x, point.y) ?? getCustomLayoutHit(point.x, point.y);
    if (layoutHit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (layoutHit.mode === "select") {
        applyCamera({ ...getCustomCamera(), selectedViewId: layoutHit.viewId }, { notify: false });
        updateProjectionBtn();
        return;
      }
      customLayoutDragState.active = true;
      customLayoutDragState.pointerId = event.pointerId;
      customLayoutDragState.mode = layoutHit.mode;
      customLayoutDragState.layoutMode = customUiState.layoutMode;
      customLayoutDragState.viewId = layoutHit.viewId;
      customLayoutDragState.startX = point.x;
      customLayoutDragState.startY = point.y;
      customLayoutDragState.startCamera = getCustomCamera();
      interactionState.active = true;
      canvas.setPointerCapture?.(event.pointerId);
      invalidation.invalidate("frame");
      requestRender();
      return;
    }
    const hit = getCustomViewAtPoint({
      width,
      height,
      camera: getCustomCamera(),
      x: point.x,
      y: point.y,
    });
    if (hit?.view && hit.view.id !== getCustomCamera().selectedViewId) {
      applyCamera({ ...getCustomCamera(), selectedViewId: hit.view.id }, { notify: false });
      updateProjectionBtn();
    }
    if (!hit?.view) {
      if (getCustomCamera().selectedViewId !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        applyCamera({ ...getCustomCamera(), selectedViewId: null }, { notify: false });
        updateProjectionBtn();
      }
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!customLayoutDragState.active || event.pointerId !== customLayoutDragState.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = getCanvasPoint(event);
    applyCustomLayoutDrag(point.x, point.y);
  });

  function finishCustomLayoutDrag(event) {
    if (!customLayoutDragState.active || event.pointerId !== customLayoutDragState.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    customLayoutDragState.active = false;
    customLayoutDragState.pointerId = null;
    customLayoutDragState.mode = null;
    customLayoutDragState.layoutMode = null;
    customLayoutDragState.viewId = null;
    customLayoutDragState.startCamera = null;
    interactionState.active = false;
    canvas.releasePointerCapture?.(event.pointerId);
    getCameraCommitCallback()?.(getCamera());
    invalidation.invalidate("frame");
    requestRender();
  }

  canvas.addEventListener("pointerup", finishCustomLayoutDrag);
  canvas.addEventListener("pointercancel", finishCustomLayoutDrag);

  canvas.addEventListener("pointermove", (event) => {
    if (!isCustomProjection(viewState.projection) || customLayoutDragState.active) {
      canvas.style.cursor = "";
      return;
    }
    const point = getCanvasPoint(event);
    const hit = getCustomLayoutHit(point.x, point.y);
    if (!hit) {
      canvas.style.cursor = "";
      return;
    }
    if (hit.mode === "move") {
      canvas.style.cursor = "move";
    } else if (hit.mode === "resize-se" || hit.mode === "resize-nw") {
      canvas.style.cursor = "nwse-resize";
    } else if (hit.mode === "resize-sw" || hit.mode === "resize-ne") {
      canvas.style.cursor = "nesw-resize";
    } else {
      canvas.style.cursor = "";
    }
  });

  canvas.addEventListener("pointerleave", () => {
    if (!customLayoutDragState.active) {
      canvas.style.cursor = "";
    }
  });

  createGestureController(canvas, {
    getCamera,
    onCamera: applyCamera,
    sensitivity: ORTHOGRAPHIC_DRAG_SENSITIVITY,
    getMode: () => {
      if (isCustomProjection(viewState.projection) && !getSelectedCustomView()) {
        return "pan";
      }
      return getProjectionGestureMode(viewState.projection, viewState.locked);
    },
    getProjectDragCamera: ({ startCamera, startX, startY, currentX, currentY }) => getProjectionDragCamera({
      projectionType: viewState.projection,
      width,
      height,
      camera: startCamera,
      startX,
      startY,
      currentX,
      currentY,
    }),
    getProjectZoomCamera: ({ camera, nextZoomScale, anchorX, anchorY }) => getProjectionZoomCamera({
      projectionType: viewState.projection,
      width,
      height,
      camera,
      nextZoomScale,
      anchorX,
      anchorY,
    }),
    getPanCamera: ({ camera, deltaX, deltaY }) => getProjectionPanCamera({
      projectionType: viewState.projection,
      camera,
      deltaX,
      deltaY,
    }),
    getPanZoomCamera: ({ camera, nextZoomScale, anchorCx, anchorCy }) => getProjectionPanZoomCamera({
      projectionType: viewState.projection,
      camera,
      nextZoomScale,
      anchorCx,
      anchorCy,
    }),
    onInteractionStart() {
      interactionState.active = true;
      workerState.awaitingSettledFrame = false;
      invalidation.invalidate("frame");
      requestRender();
    },
    onInteractionEnd() {
      interactionState.active = false;
      workerState.awaitingSettledFrame = true;
      commitCameraIfNeeded();
      invalidation.invalidate("frame");
      requestRender();
    },
  });

  const resizeObserver = new ResizeObserver(() => {
    invalidation.invalidate(["scene", "camera", "frame"]);
    syncTitleOverlay();
    requestRender();
  });
  resizeObserver.observe(mount);

  updateProjectionBtn();
  syncTitleOverlay();

  return {
    previewStylePatch({ passes = [], sceneOverrides = null } = {}) {
      stylePreviewState.active = true;
      stylePreviewState.overrides = sceneOverrides;
      if (!stylePreviewState.initialized) {
        stylePreviewState.initialized = true;
        stylePreviewInvalidation.invalidate("all");
      } else if (passes.length) {
        stylePreviewInvalidation.invalidate(passes);
      }
      invalidation.invalidate("frame");
      requestRender();
    },
    setProps(nextProps) {
      stylePreviewState.active = false;
      stylePreviewState.initialized = false;
      stylePreviewState.overrides = null;
      stylePreviewInvalidation.invalidate("all");
      const sceneChanged = sceneModel.update({
        backgroundFill: nextProps?.backgroundFill ?? getSceneProps().backgroundFill,
        oceanFill: nextProps?.oceanFill ?? getSceneProps().oceanFill,
        landFill: nextProps?.landFill ?? getSceneProps().landFill,
        landLine: nextProps?.landLine ?? getSceneProps().landLine,
        graticulesLine: nextProps?.graticulesLine ?? getSceneProps().graticulesLine,
        land: nextProps?.land ?? getSceneProps().land,
        interactionLand: nextProps?.interactionLand ?? getSceneProps().interactionLand,
        graticules: nextProps?.graticules ?? getSceneProps().graticules,
        dynamicLayers: nextProps?.dynamicLayers ?? getSceneProps().dynamicLayers,
        dynamicLayersRevision: nextProps?.dynamicLayersRevision ?? getSceneProps().dynamicLayersRevision,
        dynamicLayerData: nextProps?.dynamicLayerData ?? getSceneProps().dynamicLayerData,
        dynamicLayerDataRevision: nextProps?.dynamicLayerDataRevision ?? getSceneProps().dynamicLayerDataRevision,
        earthRenderOrder: nextProps?.earthRenderOrder ?? getSceneProps().earthRenderOrder,
      });
      viewState = {
        ...viewState,
        projection: nextProps?.projection ?? viewState.projection,
        activeCamera: normalizeProjectionCamera(
          nextProps?.projection ?? viewState.projection,
          nextProps?.activeCamera ?? viewState.activeCamera,
          { locked: nextProps?.locked ?? viewState.locked },
        ),
        locked: nextProps?.locked ?? viewState.locked,
      };
      if ("printTitle" in (nextProps ?? {})) {
        printTitle = normalizeTitle(nextProps?.printTitle);
      }
      if ("showCanvasTitle" in (nextProps ?? {})) {
        showCanvasTitle = nextProps?.showCanvasTitle !== false;
      }
      canUndo = nextProps?.canUndo === true;
      if (sceneChanged) {
        preparedDynamicKey = "";
        invalidation.invalidate(["scene", "frame"]);
      } else {
        invalidation.invalidate("frame");
      }
      updateProjectionBtn();
      syncTitleOverlay();
      requestRender();
    },
    destroy() {
      resizeObserver.disconnect();
      workerState.instance?.postMessage({ type: PRINT_WORKER_MESSAGE.DISPOSE });
      workerState.instance?.terminate?.();
      workerState.latestBitmap?.close?.();
      if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
      mount.replaceChildren();
    },
    getPerfSnapshot() {
      return {
        main: perfTracker.snapshot(),
        worker: globalThis.__earthlabPrintPerfLatest?.worker ?? null,
      };
    },
  };
}
