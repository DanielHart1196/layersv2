import { createPrintView } from "../../print-view.js";
import { DEFAULT_EARTH_RENDER_ORDER, normalizeRenderOrder } from "../../print/render-order.js";
import {
  isValidProjectionId,
  normalizeProjectionCamera,
  sharesCameraAcrossLockStates,
} from "../../print/projection-adapters.js";

const PRINT_VIEW_CLASS = "layers-print-view";
const PRINT_PROJECTION_KEY = "layerv2.print.projection.v1";
const PRINT_TITLE_KEY = "layerv2.print.title.v1";
const PRINT_UNDO_LIMIT = 30;
const LAND_LOW_URL = "/data/world-atlas/land-110m.geojson";
const LAND_HIGH_URL = "/data/world-atlas/land-50m.geojson";
const GRATICULES_URL = "/data/graticules/world-graticules-10deg.geojson";

const DEFAULT_PRINT_TITLE = Object.freeze({
  text: "Layers",
  x: 0.04,
  y: 0.04,
  width: 0.92,
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 0.035,
  fontWeight: 700,
  lineHeight: 1.2,
  color: "#000000",
});

function createDefaultPrintState() {
  const projection = "naturalEarth";
  const locked = true;
  return {
    projection,
    locked,
    lockedCameras: {
      [projection]: normalizeProjectionCamera(projection, null, { locked: true }),
    },
    unlockedCameras: {
      [projection]: normalizeProjectionCamera(projection, null, { locked: false }),
    },
  };
}

function readJsonStorage(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Keep print mode usable if storage is unavailable.
  }
}

function normalizePrintTitle(title, fallbackText = "Layers") {
  const text = typeof title?.text === "string" ? title.text : fallbackText;
  return {
    ...DEFAULT_PRINT_TITLE,
    ...title,
    text,
    width: DEFAULT_PRINT_TITLE.width,
    fontFamily: typeof title?.fontFamily === "string" && title.fontFamily
      ? title.fontFamily
      : DEFAULT_PRINT_TITLE.fontFamily,
    fontSize: Number.isFinite(Number(title?.fontSize)) ? Math.max(0.018, Math.min(0.12, Number(title.fontSize))) : DEFAULT_PRINT_TITLE.fontSize,
    fontWeight: Number.isFinite(Number(title?.fontWeight)) ? Math.max(400, Math.min(900, Math.round(Number(title.fontWeight)))) : DEFAULT_PRINT_TITLE.fontWeight,
    lineHeight: Number.isFinite(Number(title?.lineHeight)) ? Math.max(1, Math.min(1.8, Number(title.lineHeight))) : DEFAULT_PRINT_TITLE.lineHeight,
    x: Number.isFinite(Number(title?.x)) ? Math.max(0, Math.min(0.9, Number(title.x))) : DEFAULT_PRINT_TITLE.x,
    y: Number.isFinite(Number(title?.y)) ? Math.max(0, Math.min(0.9, Number(title.y))) : DEFAULT_PRINT_TITLE.y,
    color: typeof title?.color === "string" && title.color ? title.color : DEFAULT_PRINT_TITLE.color,
  };
}

function normalizeCameraStore(store, locked) {
  const normalized = {};
  if (!store || typeof store !== "object") {
    return normalized;
  }
  Object.entries(store).forEach(([projection, camera]) => {
    if (isValidProjectionId(projection)) {
      normalized[projection] = normalizeProjectionCamera(projection, camera, { locked });
    }
  });
  return normalized;
}

function readPrintState() {
  const fallback = createDefaultPrintState();
  const projectionState = readJsonStorage(PRINT_PROJECTION_KEY);
  if (!projectionState || typeof projectionState !== "object") {
    return fallback;
  }
  const projection = isValidProjectionId(projectionState.projection) ? projectionState.projection : fallback.projection;
  const locked = projectionState.locked !== false;
  return {
    projection,
    locked,
    lockedCameras: {
      ...fallback.lockedCameras,
      ...normalizeCameraStore(projectionState.lockedByProjection, true),
    },
    unlockedCameras: {
      ...fallback.unlockedCameras,
      ...normalizeCameraStore(projectionState.unlockedByProjection, false),
    },
  };
}

function persistPrintState(printState) {
  writeJsonStorage(PRINT_PROJECTION_KEY, {
    projection: printState.projection,
    locked: printState.locked,
    lockedByProjection: printState.lockedCameras,
    unlockedByProjection: printState.unlockedCameras,
  });
}

function readPrintTitle(fallbackText = "Layers") {
  return normalizePrintTitle(readJsonStorage(PRINT_TITLE_KEY), fallbackText);
}

function persistPrintTitle(title) {
  writeJsonStorage(PRINT_TITLE_KEY, title);
}

function getActiveCamera(printState) {
  const store = printState.locked ? printState.lockedCameras : printState.unlockedCameras;
  return store[printState.projection] ?? normalizeProjectionCamera(printState.projection, null, { locked: printState.locked });
}

function setCameraForMode(printState, projection, camera, locked = printState.locked) {
  const normalized = normalizeProjectionCamera(projection, camera, { locked });
  if (sharesCameraAcrossLockStates(projection)) {
    printState.lockedCameras = { ...printState.lockedCameras, [projection]: normalized };
    printState.unlockedCameras = { ...printState.unlockedCameras, [projection]: normalized };
    return;
  }
  if (locked) {
    printState.lockedCameras = { ...printState.lockedCameras, [projection]: normalized };
  } else {
    printState.unlockedCameras = { ...printState.unlockedCameras, [projection]: normalized };
  }
}

function resetProjectionCamera(printState, projection) {
  const unlocked = normalizeProjectionCamera(projection, null, { locked: false });
  const locked = normalizeProjectionCamera(projection, null, { locked: true });
  if (sharesCameraAcrossLockStates(projection)) {
    printState.lockedCameras = { ...printState.lockedCameras, [projection]: unlocked };
    printState.unlockedCameras = { ...printState.unlockedCameras, [projection]: unlocked };
    return;
  }
  printState.lockedCameras = { ...printState.lockedCameras, [projection]: locked };
  printState.unlockedCameras = { ...printState.unlockedCameras, [projection]: unlocked };
}

function colorWithOpacity(color, opacity = 100) {
  const normalized = String(color ?? "#f8f8f8").trim();
  const alpha = Math.max(0, Math.min(100, Number(opacity) || 0)) / 100;
  if (alpha >= 1) {
    return normalized;
  }
  const hex = normalized.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return normalized;
  }
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function getStateRecord(layerState, id) {
  return layerState?.[id] && typeof layerState[id] === "object" ? layerState[id] : {};
}

function isVisible(layerState, layerId, styleRowId = null) {
  const layerRecord = getStateRecord(layerState, layerId);
  const styleRecord = styleRowId ? getStateRecord(layerState, styleRowId) : null;
  return layerRecord.visible !== false
    && layerRecord.rowVisible !== false
    && (!styleRecord || styleRecord.rowVisible !== false);
}

function getFillChannel(layerState, layerId, styleRowId, fallbackColor, fallbackOpacity = 100) {
  const record = getStateRecord(layerState, layerId);
  return {
    color: record.fillColor ?? fallbackColor,
    opacity: record.fillOpacity ?? fallbackOpacity,
    visible: isVisible(layerState, layerId, styleRowId),
  };
}

function getLineChannel(layerState, layerId, styleRowId, fallbackColor, fallbackOpacity = 100, fallbackWidth = 1) {
  const record = getStateRecord(layerState, layerId);
  return {
    color: record.lineColor ?? fallbackColor,
    opacity: record.lineOpacity ?? fallbackOpacity,
    width: record.lineWeight ?? fallbackWidth,
    visible: isVisible(layerState, layerId, styleRowId),
  };
}

function getPointChannel(layerState, layerId, fallbackColor = "#e74c3c", fallbackOpacity = 80, fallbackRadius = 6) {
  const record = getStateRecord(layerState, layerId);
  return {
    color: record.pointColor ?? fallbackColor,
    opacity: record.pointOpacity ?? fallbackOpacity,
    radius: record.pointRadius ?? fallbackRadius,
    visible: record.visible !== false,
  };
}

function getEarthRenderOrder(layerModel, layerState) {
  const order = [];
  const earthRows = layerModel.getOrderedChildRows?.("earth") ?? [];
  earthRows.forEach((row) => {
    if (row.id === "ocean") {
      order.push("ocean.fill");
      return;
    }
    if (row.id === "land") {
      const childRows = layerModel.getOrderedChildRows?.("land") ?? row.rows ?? [];
      childRows.forEach((child) => {
        if (child.type === "fill") order.push("land.fill");
        if (child.type === "line") order.push("land.line");
      });
      return;
    }
    if (row.id === "graticules") {
      order.push("graticules.line");
    }
  });
  return normalizeRenderOrder(order.length ? order : DEFAULT_EARTH_RENDER_ORDER);
}

function geometryRecordFromFeatures(features) {
  const bucket = {
    polygon: [],
    line: [],
    point: [],
  };
  features.forEach((feature) => {
    const type = feature?.geometry?.type;
    if (type === "Polygon" || type === "MultiPolygon") bucket.polygon.push(feature);
    if (type === "LineString" || type === "MultiLineString") bucket.line.push(feature);
    if (type === "Point" || type === "MultiPoint") bucket.point.push(feature);
  });
  return {
    polygon: { type: "FeatureCollection", features: bucket.polygon },
    line: { type: "FeatureCollection", features: bucket.line },
    point: { type: "FeatureCollection", features: bucket.point },
  };
}

function buildDynamicPrintEntries(layerModel, layerState, dynamicLayerData = []) {
  const dataByLayerId = new Map(dynamicLayerData.map((entry) => [entry.layerId ?? entry.id, entry]));
  const dynamicRows = (layerModel.getOrderedChildRows?.(layerModel.getRootParentId?.()) ?? [])
    .filter((row) => row?.type === "layer" && row.kind === "data" && row.layerRef && dataByLayerId.has(row.layerRef));

  const dynamicLayers = [];
  const printData = [];
  dynamicRows.forEach((row) => {
    const source = dataByLayerId.get(row.layerRef);
    const geojson = source?.geojson;
    if (!geojson?.features?.length || getStateRecord(layerState, row.id).visible === false) {
      return;
    }
    const layerId = row.layerRef;
    dynamicLayers.push({
      id: layerId,
      visible: true,
      channels: {
        fill: getFillChannel(layerState, layerId, null, source?.style?.fillColor ?? "#c85e50", source?.style?.fillOpacity ?? 65),
        line: getLineChannel(layerState, layerId, null, source?.style?.lineColor ?? "#000000", source?.style?.lineOpacity ?? 100, source?.style?.lineWeight ?? 1),
        point: getPointChannel(layerState, layerId, source?.style?.pointColor ?? "#e74c3c", source?.style?.pointOpacity ?? 80, source?.style?.pointRadius ?? 6),
        pointLine: { color: "#ffffff", opacity: 100, width: 1, visible: true },
      },
      channelOrder: ["fill", "line", "point"],
      filters: [],
    });
    printData.push({
      id: layerId,
      data: {
        geojson,
        geometry: geometryRecordFromFeatures(geojson.features ?? []),
      },
    });
  });

  return { dynamicLayers, dynamicLayerData: printData };
}

function createPrintRendererAdapter() {
  const contract = {
    primaryRenderer: "earthlab-print-view",
    responsibilities: [
      "print-specific projection render",
      "custom multi-projection layout",
      "projection lock, pan, zoom, and reset",
      "movable print title",
      "snapshot undo for print state",
      "worker-assisted flat projection rendering",
    ],
    nonGoals: [
      "screen-hot-path animation",
    ],
  };

  const printState = readPrintState();
  const undoStack = [];
  let printView = null;
  let overlay = null;
  let mount = null;
  let boundPrintButton = null;
  let title = readPrintTitle();
  let sceneData = null;
  let bound = false;
  let open = false;
  let getContext = () => ({});

  function getContract() {
    return structuredClone(contract);
  }

  async function ensureSceneData() {
    if (sceneData) {
      return sceneData;
    }
    const [landLow, landHigh, graticules] = await Promise.all([
      fetchJson(LAND_LOW_URL),
      fetchJson(LAND_HIGH_URL).catch(() => fetchJson(LAND_LOW_URL)),
      fetchJson(GRATICULES_URL),
    ]);
    sceneData = {
      landLow,
      landHigh,
      graticules,
    };
    return sceneData;
  }

  function getSnapshot() {
    return {
      printState: structuredClone(printState),
      title: structuredClone(title),
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    Object.assign(printState, structuredClone(snapshot.printState));
    title = normalizePrintTitle(snapshot.title, title.text);
    persistPrintState(printState);
    persistPrintTitle(title);
    sync();
  }

  function pushUndoSnapshot() {
    undoStack.push(getSnapshot());
    if (undoStack.length > PRINT_UNDO_LIMIT) {
      undoStack.shift();
    }
  }

  function undo() {
    const snapshot = undoStack.pop();
    if (snapshot) {
      restoreSnapshot(snapshot);
    }
  }

  function getSceneProps(context, data) {
    const layerModel = context.layerModel;
    const layerState = layerModel?.getState?.() ?? {};
    const appearance = layerModel?.getAppearanceState?.() ?? {};
    const dynamic = buildDynamicPrintEntries(layerModel, layerState, context.dynamicLayerData ?? []);
    return {
      projection: printState.projection,
      locked: printState.locked,
      activeCamera: getActiveCamera(printState),
      backgroundFill: colorWithOpacity(appearance.screen?.color ?? "#f8f8f8", appearance.screen?.opacity ?? 100),
      oceanFill: getFillChannel(layerState, "ocean", "ocean-fill", "#2C6F92", 100),
      landFill: getFillChannel(layerState, "land", "land-fill", "#6EAA6E", 100),
      landLine: getLineChannel(layerState, "land", "land-line", "#000000", 100, 1),
      graticulesLine: getLineChannel(layerState, "graticules", "graticules-line", "#8FA9BC", 100, 1),
      land: data.landHigh,
      interactionLand: data.landLow,
      graticules: data.graticules,
      dynamicLayers: dynamic.dynamicLayers,
      dynamicLayersRevision: context.dynamicLayerRevision ?? dynamic.dynamicLayers.length,
      dynamicLayerData: dynamic.dynamicLayerData,
      dynamicLayerDataRevision: context.dynamicLayerDataRevision ?? dynamic.dynamicLayerData.length,
      earthRenderOrder: getEarthRenderOrder(layerModel, layerState),
      printTitle: title,
      showCanvasTitle: true,
      canUndo: undoStack.length > 0,
    };
  }

  async function sync() {
    if (!printView) {
      return;
    }
    const context = getContext() ?? {};
    const data = await ensureSceneData();
    printView.setProps(getSceneProps(context, data));
  }

  function ensureMounted() {
    if (overlay) {
      return;
    }
    overlay = document.createElement("section");
    overlay.className = PRINT_VIEW_CLASS;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");

    mount = document.createElement("div");
    mount.className = "earthlab-print-view";

    overlay.append(mount);
    document.body.append(overlay);

    printView = createPrintView({
      mount,
      onCameraChange(nextCamera) {
        pushUndoSnapshot();
        setCameraForMode(printState, printState.projection, nextCamera, printState.locked);
        persistPrintState(printState);
        sync();
      },
      onProjectionChange(nextProjection, nextCamera, nextLocked) {
        pushUndoSnapshot();
        printState.projection = nextProjection;
        printState.locked = nextLocked !== false;
        setCameraForMode(printState, nextProjection, nextCamera, printState.locked);
        persistPrintState(printState);
        sync();
      },
      onProjectionLockChange(nextLocked, nextCamera) {
        pushUndoSnapshot();
        printState.locked = nextLocked !== false;
        setCameraForMode(printState, printState.projection, nextCamera, printState.locked);
        persistPrintState(printState);
        sync();
      },
      onProjectionReset(projection) {
        pushUndoSnapshot();
        resetProjectionCamera(printState, projection);
        persistPrintState(printState);
        sync();
      },
      onTitleChange(nextTitle, { commit = false } = {}) {
        if (commit) {
          pushUndoSnapshot();
        }
        title = normalizePrintTitle(nextTitle, title.text);
        if (commit) {
          persistPrintTitle(title);
        }
        sync();
      },
      onUndo() {
        undo();
      },
    });
  }

  async function openPrint() {
    ensureMounted();
    open = true;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-print-view-open");
    if (boundPrintButton) {
      boundPrintButton.textContent = "Web";
      boundPrintButton.setAttribute("aria-label", "Return to web map");
    }
    await sync();
  }

  function closePrint() {
    open = false;
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("is-print-view-open");
    if (boundPrintButton) {
      boundPrintButton.textContent = "Print";
      boundPrintButton.setAttribute("aria-label", "Open print mode");
    }
  }

  function bind({ printButton = null, contextProvider = null } = {}) {
    if (bound) {
      return;
    }
    bound = true;
    if (typeof contextProvider === "function") {
      getContext = contextProvider;
      const originalContextProvider = getContext;
      getContext = () => {
        const context = originalContextProvider() ?? {};
        title = normalizePrintTitle(title, context.title ?? title.text);
        return context;
      };
    }
    boundPrintButton = printButton;
    printButton?.addEventListener("click", (event) => {
      event.preventDefault();
      if (open) {
        closePrint();
        return;
      }
      void openPrint();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && open) {
        closePrint();
      }
    });
  }

  return {
    bind,
    close: closePrint,
    getContract,
    open: openPrint,
    sync,
  };
}

export { createPrintRendererAdapter };
