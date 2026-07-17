import { geoAzimuthalEqualArea, geoGnomonic, geoOrthographic, geoPath, geoStream, geoTransverseMercator } from "d3-geo";
import { geoAirocean, geoCahillKeyes, geoImago } from "d3-geo-polygon";
import { geoInterruptedHomolosine, geoInterruptedSinuMollweide, geoLarrivee, geoMollweide, geoNaturalEarth2, geoPeirceQuincuncial, geoPolyhedralWaterman, geoRobinson, geoSinusoidal, geoSinuMollweide, geoWinkel3 } from "d3-geo-projection";

export const DEFAULT_FRAME_CAMERA = {
  zoomScale: 1,
  panX: 0,
  panY: 0,
};

export const DEFAULT_PRINT_CAMERA = {
  zoomScale: 1,
  rotationLon: 0,
  rotationLat: 0,
};

export const DEFAULT_ORTHOGRAPHIC_CAMERA = {
  projectionZoomScale: 1,
  frameZoomScale: 1,
  rotationLon: 0,
  rotationLat: 0,
  panX: 0,
  panY: 0,
};

export const DEFAULT_FLAT_CAMERA = {
  zoomScale: 1,
  centerLon: 0,
  centerLat: 0,
  offsetX: 0,
  offsetY: 0,
};

export const DEFAULT_NATURAL_EARTH_CAMERA = {
  projectionZoomScale: 1,
  frameZoomScale: 1,
  centerLon: 0,
  centerLat: 0,
  panX: 0,
  panY: 0,
};

export const DEFAULT_ITM_CAMERA = {
  projectionZoomScale: 1,
  frameZoomScale: 1,
  centerLon: 0,
  centerLat: 0,
  panX: 0,
  panY: 0,
};

export const DEFAULT_CUSTOM_CAMERA = {
  frameZoomScale: 1,
  panX: 0,
  panY: 0,
  selectedViewId: null,
  views: [],
};

export const ORTHOGRAPHIC_DRAG_SENSITIVITY = 0.35;
export const MIN_PRINT_ZOOM_SCALE = 0.25;
export const MAX_PRINT_ZOOM_SCALE = 16;

const ORTHOGRAPHIC_BASE_ROTATE = [20, -10, 0];
const FLAT_FIT_PADDING = 8;

function getProjectionDefinition(projectionType) {
  return PROJECTION_DEFINITIONS[projectionType] ?? null;
}

function getProjectionModel(projectionType) {
  return getProjectionDefinition(projectionType)?.model ?? null;
}

export function isFlatProjection(projectionType) {
  return getProjectionDefinition(projectionType)?.kind === "flat";
}

export function isCustomProjection(projectionType) {
  return getProjectionDefinition(projectionType)?.kind === "custom";
}

export function usesUnifiedProjectionModel(projectionType) {
  return Boolean(getProjectionModel(projectionType));
}

export function getProjectionRenderMode(projectionType) {
  return getProjectionDefinition(projectionType)?.renderMode ?? (isFlatProjection(projectionType) ? "worker" : "direct");
}

export function sharesCameraAcrossLockStates(projectionType) {
  return getProjectionDefinition(projectionType)?.sharesCameraAcrossLockStates === true;
}

function shouldApplyFrameTransform(projectionType, locked) {
  const model = getProjectionModel(projectionType);
  if (!model) {
    return locked;
  }
  return model.renderStrategy === "composite" || locked;
}

function getProjectionStateZoom(camera) {
  return camera?.projectionZoomScale ?? camera?.zoomScale ?? 1;
}

function getProjectionStateForFlatCamera(camera) {
  return {
    centerLon: camera?.centerLon ?? 0,
    centerLat: camera?.centerLat ?? 0,
    zoomScale: getProjectionStateZoom(camera),
    offsetX: camera?.offsetX ?? 0,
    offsetY: camera?.offsetY ?? 0,
  };
}

function getFrameStateForCamera(camera) {
  return {
    zoomScale: camera?.frameZoomScale ?? camera?.zoomScale ?? 1,
    panX: camera?.panX ?? 0,
    panY: camera?.panY ?? 0,
  };
}

function getCustomFrameStateForCamera(camera) {
  return {
    zoomScale: camera?.frameZoomScale ?? 1,
    panX: camera?.panX ?? 0,
    panY: camera?.panY ?? 0,
  };
}

function getAzimuthalProjectionState(camera) {
  return {
    rotationLon: camera?.rotationLon ?? 0,
    rotationLat: camera?.rotationLat ?? 0,
    zoomScale: camera?.projectionZoomScale ?? camera?.zoomScale ?? 1,
  };
}

function normalizePrintCamera(camera = null) {
  const zoomScale = Math.max(MIN_PRINT_ZOOM_SCALE, Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.zoomScale) || 1));
  const rotationLon = Number(camera?.rotationLon) || 0;
  const rotationLat = Number(camera?.rotationLat) || 0;
  return {
    zoomScale,
    rotationLon,
    rotationLat: Math.max(-89.999, Math.min(109.999, rotationLat)),
  };
}

function normalizeOrthographicCamera(camera = null, locked = false) {
  const explicitZoomScale = Number(camera?.zoomScale);
  const zoomScale = Number.isFinite(explicitZoomScale)
    ? Math.max(MIN_PRINT_ZOOM_SCALE, Math.min(MAX_PRINT_ZOOM_SCALE, explicitZoomScale || 1))
    : null;
  let projectionZoomScale = Math.max(
    MIN_PRINT_ZOOM_SCALE,
    Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.projectionZoomScale ?? 1) || 1),
  );
  let frameZoomScale = Math.max(
    MIN_PRINT_ZOOM_SCALE,
    Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.frameZoomScale ?? 1) || 1),
  );
  if (zoomScale !== null && !("projectionZoomScale" in (camera ?? {})) && !("frameZoomScale" in (camera ?? {}))) {
    projectionZoomScale = zoomScale;
    frameZoomScale = zoomScale;
  }
  const rotationLon = Number(camera?.rotationLon) || 0;
  const rotationLat = Number(camera?.rotationLat) || 0;
  const panX = Number(camera?.panX) || 0;
  const panY = Number(camera?.panY) || 0;
  return {
    projectionZoomScale,
    frameZoomScale,
    rotationLon,
    rotationLat: Math.max(-89.999, Math.min(109.999, rotationLat)),
    panX,
    panY,
    zoomScale: locked ? frameZoomScale : projectionZoomScale,
  };
}

function normalizeFrameCamera(camera = null) {
  const zoomScale = Math.max(MIN_PRINT_ZOOM_SCALE, Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.zoomScale) || 1));
  const panX = Number(camera?.panX) || 0;
  const panY = Number(camera?.panY) || 0;
  return { zoomScale, panX, panY };
}

function wrapLongitude(longitude) {
  const normalized = Number(longitude) || 0;
  const wrapped = ((normalized + 180) % 360 + 360) % 360;
  return wrapped - 180;
}

function normalizeFlatCamera(camera = null) {
  const zoomScale = Math.max(MIN_PRINT_ZOOM_SCALE, Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.zoomScale) || 1));
  const centerLon = wrapLongitude(camera?.centerLon);
  const centerLat = Math.max(-89.999, Math.min(89.999, Number(camera?.centerLat) || 0));
  const offsetX = Number(camera?.offsetX) || 0;
  const offsetY = Number(camera?.offsetY) || 0;
  return { zoomScale, centerLon, centerLat, offsetX, offsetY };
}

function normalizeNaturalEarthCamera(camera = null, locked = false) {
  const explicitZoomScale = Number(camera?.zoomScale);
  const zoomScale = Number.isFinite(explicitZoomScale)
    ? Math.max(MIN_PRINT_ZOOM_SCALE, Math.min(MAX_PRINT_ZOOM_SCALE, explicitZoomScale || 1))
    : null;
  let projectionZoomScale = Math.max(
    MIN_PRINT_ZOOM_SCALE,
    Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.projectionZoomScale ?? 1) || 1),
  );
  let frameZoomScale = Math.max(
    MIN_PRINT_ZOOM_SCALE,
    Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.frameZoomScale ?? 1) || 1),
  );
  if (zoomScale !== null && !("projectionZoomScale" in (camera ?? {})) && !("frameZoomScale" in (camera ?? {}))) {
    if (locked) {
      frameZoomScale = zoomScale;
    } else {
      projectionZoomScale = zoomScale;
    }
  }
  const centerLon = wrapLongitude(camera?.centerLon);
  const centerLat = Math.max(-89.999, Math.min(89.999, Number(camera?.centerLat) || 0));
  const panX = Number(camera?.panX) || 0;
  const panY = Number(camera?.panY) || 0;
  return {
    projectionZoomScale,
    frameZoomScale,
    centerLon,
    centerLat,
    panX,
    panY,
    zoomScale: locked ? frameZoomScale : projectionZoomScale,
  };
}

function normalizeItmCamera(camera = null, locked = false) {
  const explicitZoomScale = Number(camera?.zoomScale);
  const zoomScale = Number.isFinite(explicitZoomScale) ? explicitZoomScale : null;
  const activeZoomScale = locked
    ? camera?.frameZoomScale
    : camera?.projectionZoomScale;
  const sharedZoomScale = Math.max(
    MIN_PRINT_ZOOM_SCALE,
    Math.min(
      MAX_PRINT_ZOOM_SCALE,
      Number(
        activeZoomScale
          ?? zoomScale
          ?? camera?.projectionZoomScale
          ?? camera?.frameZoomScale
          ?? 1,
      ) || 1,
    ),
  );
  const centerLon = wrapLongitude(camera?.centerLon);
  const centerLat = Math.max(-89.999, Math.min(89.999, Number(camera?.centerLat) || 0));
  const panX = Number(camera?.panX) || 0;
  const panY = Number(camera?.panY) || 0;
  return {
    projectionZoomScale: sharedZoomScale,
    frameZoomScale: sharedZoomScale,
    centerLon,
    centerLat,
    panX,
    panY,
    zoomScale: sharedZoomScale,
  };
}

function getDefaultCustomViewId(index = 0) {
  return `view-${index + 1}`;
}

function normalizeViewport(viewport = null) {
  const rawWidth = Number(viewport?.width);
  const rawHeight = Number(viewport?.height);
  const width = Math.max(0.05, Math.min(1, Number.isFinite(rawWidth) ? rawWidth : 0.36));
  const height = Math.max(0.05, Math.min(1, Number.isFinite(rawHeight) ? rawHeight : 0.36));
  const rawX = Number(viewport?.x);
  const rawY = Number(viewport?.y);
  const x = Math.max(0, Math.min(1 - width, Number.isFinite(rawX) ? rawX : 0.32));
  const y = Math.max(0, Math.min(1 - height, Number.isFinite(rawY) ? rawY : 0.32));
  return { x, y, width, height };
}

function normalizeProjectionFrame(frame = null, fallbackViewport = null) {
  const fallback = normalizeViewport(fallbackViewport);
  const rawWidth = Number(frame?.width);
  const rawHeight = Number(frame?.height);
  const rawX = Number(frame?.x);
  const rawY = Number(frame?.y);
  return {
    x: Number.isFinite(rawX) ? rawX : fallback.x,
    y: Number.isFinite(rawY) ? rawY : fallback.y,
    width: Math.max(0.05, Math.min(1, Number.isFinite(rawWidth) ? rawWidth : fallback.width)),
    height: Math.max(0.05, Math.min(1, Number.isFinite(rawHeight) ? rawHeight : fallback.height)),
  };
}

function getValidCustomChildProjection(projectionType) {
  if (projectionType && projectionType !== "custom" && PROJECTION_DEFINITIONS[projectionType]) {
    return projectionType;
  }
  return "naturalEarth";
}

export function createDefaultCustomView({
  id = null,
  projection = "naturalEarth",
  viewport = null,
  camera = null,
} = {}) {
  const childProjection = getValidCustomChildProjection(projection);
  const normalizedViewport = normalizeViewport(viewport);
  return {
    id: id || getDefaultCustomViewId(0),
    projection: childProjection,
    viewport: normalizedViewport,
    projectionFrame: normalizeProjectionFrame(null, normalizedViewport),
    camera: normalizeProjectionCamera(childProjection, camera, { locked: false }),
    clip: { type: "sphere" },
    shape: { type: "circle" },
    style: {},
  };
}

function normalizeCustomView(view = null, index = 0) {
  const childProjection = getValidCustomChildProjection(view?.projection);
  const id = typeof view?.id === "string" && view.id ? view.id : getDefaultCustomViewId(index);
  const clipType = view?.clip?.type === "rect" ? "rect" : "sphere";
  const shapeType = view?.shape?.type === "rect" ? "rect" : "circle";
  const viewport = normalizeViewport(view?.viewport);
  return {
    id,
    name: typeof view?.name === "string" ? view.name : "",
    projection: childProjection,
    viewport,
    projectionFrame: normalizeProjectionFrame(view?.projectionFrame, viewport),
    camera: normalizeProjectionCamera(childProjection, view?.camera, { locked: false }),
    clip: { ...(view?.clip ?? {}), type: clipType },
    shape: { ...(view?.shape ?? {}), type: shapeType },
    style: view?.style && typeof view.style === "object" ? { ...view.style } : {},
  };
}

function normalizeCustomCamera(camera = null, locked = false) {
  const frameZoomScale = Math.max(
    MIN_PRINT_ZOOM_SCALE,
    Math.min(MAX_PRINT_ZOOM_SCALE, Number(camera?.frameZoomScale ?? camera?.zoomScale ?? 1) || 1),
  );
  const panX = Number(camera?.panX) || 0;
  const panY = Number(camera?.panY) || 0;
  const views = Array.isArray(camera?.views)
    ? camera.views.map((view, index) => normalizeCustomView(view, index))
    : [];
  const firstViewId = views[0]?.id ?? null;
  const selectedViewId = views.some((view) => view.id === camera?.selectedViewId)
    ? camera.selectedViewId
    : firstViewId;
  const selectedView = views.find((view) => view.id === selectedViewId) ?? null;
  const selectedZoomScale = selectedView
    ? getProjectionStateZoom(selectedView.camera)
    : 1;
  return {
    frameZoomScale,
    panX,
    panY,
    selectedViewId,
    views,
    zoomScale: locked ? frameZoomScale : selectedZoomScale,
  };
}

function buildOrthographicCamera(camera, { projectionState = null, frameState = null, locked = false } = {}) {
  const nextCamera = {
    ...camera,
    ...(projectionState ? {
      rotationLon: projectionState.rotationLon,
      rotationLat: projectionState.rotationLat,
      projectionZoomScale: projectionState.zoomScale,
    } : null),
    ...(frameState ? {
      panX: frameState.panX,
      panY: frameState.panY,
      frameZoomScale: frameState.zoomScale,
    } : null),
  };
  return normalizeOrthographicCamera(nextCamera, locked);
}

function buildNaturalEarthCamera(camera, { projectionState = null, frameState = null, locked = false } = {}) {
  const nextCamera = {
    ...camera,
    ...(projectionState ? {
      centerLon: projectionState.centerLon,
      centerLat: projectionState.centerLat,
      projectionZoomScale: projectionState.zoomScale,
      offsetX: projectionState.offsetX,
      offsetY: projectionState.offsetY,
    } : null),
    ...(frameState ? {
      panX: frameState.panX,
      panY: frameState.panY,
      frameZoomScale: frameState.zoomScale,
    } : null),
  };
  return normalizeNaturalEarthCamera(nextCamera, locked);
}

function buildItmCamera(camera, { projectionState = null, frameState = null, locked = false } = {}) {
  const nextCamera = {
    ...camera,
    ...(projectionState ? {
      centerLon: projectionState.centerLon,
      centerLat: projectionState.centerLat,
      projectionZoomScale: projectionState.zoomScale,
      offsetX: projectionState.offsetX,
      offsetY: projectionState.offsetY,
    } : null),
    ...(frameState ? {
      panX: frameState.panX,
      panY: frameState.panY,
      frameZoomScale: frameState.zoomScale,
    } : null),
  };
  return normalizeItmCamera(nextCamera, locked);
}

function getAzimuthalProjectionZoomCamera({
  projectionType,
  camera,
  nextZoomScale,
}) {
  const model = getProjectionModel(projectionType);
  const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
  const projectionState = getAzimuthalProjectionState(normalizedCamera);
  if (model?.buildCamera) {
    return model.buildCamera(normalizedCamera, {
      projectionState: {
        ...projectionState,
        zoomScale: nextZoomScale,
      },
      locked: false,
    });
  }
  return normalizeProjectionCamera(
    projectionType,
    {
      ...normalizedCamera,
      zoomScale: nextZoomScale,
      projectionZoomScale: nextZoomScale,
    },
    { locked: false },
  );
}

function applyFlatProjectionStateWithCenter(projection, projectionState) {
  if (typeof projection.center === "function") {
    projection.center([projectionState.centerLon, projectionState.centerLat]);
  }
}

function applyFlatProjectionStateWithRotate(projection, projectionState) {
  if (typeof projection.rotate === "function") {
    projection.rotate([-projectionState.centerLon, -projectionState.centerLat, 0]);
    return;
  }
  applyFlatProjectionStateWithCenter(projection, projectionState);
}

function initializeProjectionWithBaseline(projection, baseline = null) {
  if (baseline?.rotate && typeof projection.rotate === "function") {
    projection.rotate([...baseline.rotate]);
  }
  if (baseline?.center && typeof projection.center === "function") {
    projection.center([...baseline.center]);
    return;
  }
  if (typeof projection.center === "function") {
    projection.center([0, 0]);
  }
}

function applyProjectionStateWithBaseline(projection, projectionState, baseline = null) {
  if (baseline?.rotate && typeof projection.rotate === "function") {
    projection.rotate([
      baseline.rotate[0] - projectionState.centerLon,
      baseline.rotate[1] - projectionState.centerLat,
      baseline.rotate[2] ?? 0,
    ]);
    return;
  }
  if (baseline?.center && typeof projection.center === "function") {
    projection.center([
      baseline.center[0] + projectionState.centerLon,
      baseline.center[1] + projectionState.centerLat,
    ]);
    return;
  }
  applyFlatProjectionStateWithRotate(projection, projectionState);
}

function scaleFlatProjection(projection, projectionState) {
  if (typeof projection.scale === "function") {
    projection.scale(projection.scale() * projectionState.zoomScale);
  }
}

function translateFlatProjection(projection, width, height, projectionState) {
  projection.translate([
    (width / 2) + ((projectionState.offsetX ?? 0) * width),
    (height / 2) + ((projectionState.offsetY ?? 0) * height),
  ]);
}

function solveProjectionSpaceFlatCamera({
  projectionType,
  width,
  height,
  camera,
  zoomScale,
  anchorGeo,
  targetX,
  targetY,
  locked = false,
}) {
  let candidate = normalizeProjectionCamera(
    projectionType,
    {
      ...camera,
      zoomScale,
      projectionZoomScale: zoomScale,
    },
    { locked },
  );
  for (let index = 0; index < 6; index += 1) {
    const view = createProjectionView({
      projectionType,
      width,
      height,
      camera: candidate,
      locked,
      renderQuality: "interactive",
    });
    const projectedAnchor = view.projection(anchorGeo);
    if (!Array.isArray(projectedAnchor) || !projectedAnchor.every(Number.isFinite)) {
      break;
    }
    const errorX = projectedAnchor[0] - targetX;
    const errorY = projectedAnchor[1] - targetY;
    if (Math.abs(errorX) < 0.5 && Math.abs(errorY) < 0.5) {
      break;
    }
    const targetGeo = projectScreenPointToGeo({
      projectionType,
      width,
      height,
      camera: candidate,
      x: targetX,
      y: targetY,
      locked,
      renderQuality: "interactive",
    });
    if (!targetGeo) {
      break;
    }
    candidate = normalizeProjectionCamera(
      projectionType,
      {
        ...candidate,
        centerLon: candidate.centerLon + wrapLongitudeDelta(anchorGeo[0] - targetGeo[0]),
        centerLat: clampLatitude(candidate.centerLat + (anchorGeo[1] - targetGeo[1])),
      },
      { locked },
    );
  }
  return candidate;
}

function getDefaultFlatUnlockedDragCamera({
  projectionType,
  width,
  height,
  camera,
  startX,
  startY,
  currentX,
  currentY,
}) {
  const startCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
  const anchorGeo = projectScreenPointToGeo({
    projectionType,
    width,
    height,
    camera: startCamera,
    x: startX,
    y: startY,
    locked: false,
  });
  if (!anchorGeo) {
    return startCamera;
  }
  return solveProjectionSpaceFlatCamera({
    projectionType,
    width,
    height,
    camera: startCamera,
    zoomScale: startCamera.zoomScale,
    anchorGeo,
    targetX: currentX,
    targetY: currentY,
    locked: false,
  });
}

function getDefaultFlatUnlockedZoomCamera({
  projectionType,
  width,
  height,
  camera,
  nextZoomScale,
  anchorX,
  anchorY,
}) {
  const startCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
  const anchorGeo = projectScreenPointToGeo({
    projectionType,
    width,
    height,
    camera: startCamera,
    x: anchorX,
    y: anchorY,
    locked: false,
  });
  if (!anchorGeo) {
    return normalizeProjectionCamera(
      projectionType,
      { ...startCamera, zoomScale: nextZoomScale },
      { locked: false },
    );
  }
  return solveProjectionSpaceFlatCamera({
    projectionType,
    width,
    height,
    camera: startCamera,
    zoomScale: nextZoomScale,
    anchorGeo,
    targetX: anchorX,
    targetY: anchorY,
    locked: false,
  });
}

function serializeAzimuthalCameraKey(prefix, width, height, camera) {
  return `${prefix}:${width}:${height}:${camera.projectionZoomScale}:${camera.frameZoomScale}:${camera.rotationLon}:${camera.rotationLat}:${camera.panX}:${camera.panY}`;
}

function serializeFlatCompositeCameraKey(prefix, width, height, camera) {
  return `${prefix}:${width}:${height}:${camera.projectionZoomScale}:${camera.frameZoomScale}:${camera.centerLon}:${camera.centerLat}:${camera.panX}:${camera.panY}`;
}

function serializeCustomCameraKey(width, height, camera) {
  const viewsKey = camera.views.map((view) => (
    `${view.id}:${view.projection}:${view.viewport.x}:${view.viewport.y}:${view.viewport.width}:${view.viewport.height}:${view.projectionFrame.x}:${view.projectionFrame.y}:${view.projectionFrame.width}:${view.projectionFrame.height}:${JSON.stringify(view.camera)}:${view.clip.type}:${view.shape.type}`
  )).join("|");
  return `custom:${width}:${height}:${camera.frameZoomScale}:${camera.panX}:${camera.panY}:${camera.selectedViewId}:${viewsKey}`;
}

function getWorkspacePointForCustomCamera(width, height, camera, x, y) {
  const transform = getFrameCameraTransform(width, height, {
    zoomScale: camera.frameZoomScale,
    panX: camera.panX,
    panY: camera.panY,
  });
  return invertTransformPoint({ x, y }, transform);
}

function getCustomViewBounds(width, height, view) {
  return {
    x: view.viewport.x * width,
    y: view.viewport.y * height,
    width: view.viewport.width * width,
    height: view.viewport.height * height,
  };
}

function getCustomProjectionBounds(width, height, view) {
  const frame = view.projectionFrame ?? view.viewport;
  return {
    x: frame.x * width,
    y: frame.y * height,
    width: Math.max(1, frame.width * width),
    height: Math.max(1, frame.height * height),
  };
}

export function getCustomViewAtPoint({
  width,
  height,
  camera,
  x,
  y,
  includeShape = true,
}) {
  const customCamera = normalizeCustomCamera(camera);
  const point = getWorkspacePointForCustomCamera(width, height, customCamera, x, y);
  for (let index = customCamera.views.length - 1; index >= 0; index -= 1) {
    const view = customCamera.views[index];
    const bounds = getCustomViewBounds(width, height, view);
    const insideRect = point.x >= bounds.x
      && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y
      && point.y <= bounds.y + bounds.height;
    if (!insideRect) {
      continue;
    }
    if (includeShape && view.shape.type === "circle") {
      const rx = bounds.width / 2;
      const ry = bounds.height / 2;
      const cx = bounds.x + rx;
      const cy = bounds.y + ry;
      const nx = rx > 0 ? (point.x - cx) / rx : 0;
      const ny = ry > 0 ? (point.y - cy) / ry : 0;
      if ((nx * nx) + (ny * ny) > 1) {
        continue;
      }
    }
    const projectionBounds = getCustomProjectionBounds(width, height, view);
    return {
      view,
      workspaceX: point.x,
      workspaceY: point.y,
      localX: point.x - projectionBounds.x,
      localY: point.y - projectionBounds.y,
      bounds,
      projectionBounds,
    };
  }
  return null;
}

function updateCustomView(camera, viewId, updater) {
  const customCamera = normalizeCustomCamera(camera);
  let changed = false;
  const views = customCamera.views.map((view) => {
    if (view.id !== viewId) {
      return view;
    }
    changed = true;
    return normalizeCustomView(updater(view), 0);
  });
  return normalizeCustomCamera({
    ...customCamera,
    selectedViewId: changed ? viewId : customCamera.selectedViewId,
    views,
  });
}

function getCustomSelectedView(camera) {
  const customCamera = normalizeCustomCamera(camera);
  return customCamera.views.find((view) => view.id === customCamera.selectedViewId) ?? null;
}

const IMAGO_BASELINE = Object.freeze({
  rotate: [18, -12.5, 3.5],
  center: [-139.405, 40.5844],
});

const AIROCEAN_BASELINE = Object.freeze({
  rotate: [-83.65929, 25.44458, -87.45184],
  center: [126, 0],
});

const CAHILL_KEYES_BASELINE = Object.freeze({
  rotate: [20, 0, 0],
  center: [0, -17],
});

const SINU_MOLLWEIDE_BASELINE = Object.freeze({
  rotate: [-20, -55, 0],
  center: [0, -5.4036],
});

const PEIRCE_QUINCUNCIAL_BASELINE = Object.freeze({
  rotate: [-115, -90, 45],
});

function createAzimuthalDefinition({
  id,
  name,
  factory,
  scaleFactor = 1,
  clipAngle = 90,
}) {
  return {
    id,
    name,
    kind: "azimuthal",
    renderMode: "direct",
    sharesCameraAcrossLockStates: true,
    sameProjectionLockedTransferMode: "preserve",
    sameProjectionUnlockedTransferMode: "preserve",
    createProjection({ width, height, camera, renderQuality }) {
      const padding = Math.max(24, Math.min(width, height) * 0.08);
      const baseRadius = Math.max(120, (Math.min(width, height) / 2) - padding);
      const projectionZoomScale = camera.projectionZoomScale ?? camera.zoomScale;
      const projection = factory();
      projection
        .precision(renderQuality === "interactive" ? 2 : 0.5)
        .translate([width / 2, height / 2])
        .scale(baseRadius * scaleFactor * projectionZoomScale)
        .rotate([
          ORTHOGRAPHIC_BASE_ROTATE[0] + camera.rotationLon,
          ORTHOGRAPHIC_BASE_ROTATE[1] + camera.rotationLat,
          ORTHOGRAPHIC_BASE_ROTATE[2],
        ])
        .clipAngle(clipAngle);
      return projection;
    },
    serializeCameraKey({ width, height, projectionCamera }) {
      return serializeAzimuthalCameraKey(`${id}-unified`, width, height, projectionCamera);
    },
    model: {
      renderStrategy: "composite",
      normalizeCamera: normalizeOrthographicCamera,
      buildCamera: buildOrthographicCamera,
      getFrameState: getFrameStateForCamera,
      getUnlockedZoomCamera: getAzimuthalProjectionZoomCamera,
    },
  };
}

function createFlatDefinition({
  id,
  name,
  factory,
  normalizeCamera = normalizeNaturalEarthCamera,
  buildCamera = buildNaturalEarthCamera,
  baseline = null,
  initializeProjection = null,
  applyProjectionState = null,
  unlockedApplyProjectionState = null,
  resetFrameStateOnUnlockTransfer = false,
}) {
  const resolvedApplyProjectionState = applyProjectionState
    ?? ((projection, projectionState) => applyProjectionStateWithBaseline(projection, projectionState, baseline));
  return {
    id,
    name,
    kind: "flat",
    renderMode: "worker",
    sharesCameraAcrossLockStates: true,
    sameProjectionLockedTransferMode: resetFrameStateOnUnlockTransfer ? "reset-frame-when-source-unlocked" : "preserve",
    sameProjectionUnlockedTransferMode: "preserve",
    resetFrameStateOnUnlockTransfer,
    createProjection({ width, height, camera, locked, renderQuality, definition }) {
      const projection = factory();
      const model = definition.model;
      const projectionState = model?.getProjectionState?.(camera) ?? camera;

      if (typeof projection.precision === "function") projection.precision(renderQuality === "interactive" ? 1.25 : 0.5);
      if (initializeProjection) {
        initializeProjection(projection);
      } else {
        initializeProjectionWithBaseline(projection, baseline);
      }

      projection.translate([width / 2, height / 2]);
      projection.fitExtent(
        [
          [FLAT_FIT_PADDING, FLAT_FIT_PADDING],
          [width - FLAT_FIT_PADDING, height - FLAT_FIT_PADDING],
        ],
        { type: "Sphere" },
      );
      projection.translate([width / 2, height / 2]);

      if (!locked || usesUnifiedProjectionModel(id)) {
        const activeApplyProjectionState = !locked && unlockedApplyProjectionState
          ? unlockedApplyProjectionState
          : model?.applyProjectionState;
        if (model?.applyProjectionState) {
          activeApplyProjectionState?.(projection, projectionState);
          scaleFlatProjection(projection, projectionState);
          translateFlatProjection(projection, width, height, projectionState);
        } else {
          if (typeof projection.center === "function") {
            projection.center([camera.centerLon, camera.centerLat]);
          }
          if (typeof projection.scale === "function") {
            projection.scale(projection.scale() * camera.zoomScale);
          }
          projection.translate([
            (width / 2) + ((camera.offsetX ?? 0) * width),
            (height / 2) + ((camera.offsetY ?? 0) * height),
          ]);
        }
      }

      return projection;
    },
    serializeCameraKey({ width, height, projectionCamera }) {
      return serializeFlatCompositeCameraKey(`${id}-unified`, width, height, projectionCamera);
    },
    model: {
      renderStrategy: "composite",
      normalizeCamera,
      buildCamera,
      getProjectionState: getProjectionStateForFlatCamera,
      getFrameState: getFrameStateForCamera,
      applyProjectionState: resolvedApplyProjectionState,
      getUnlockedDragCamera: getDefaultFlatUnlockedDragCamera,
      getUnlockedZoomCamera: getDefaultFlatUnlockedZoomCamera,
    },
  };
}

const PROJECTION_DEFINITIONS = {
  custom: {
    id: "custom",
    name: "Custom",
    kind: "custom",
    renderMode: "direct",
    sharesCameraAcrossLockStates: true,
    sameProjectionLockedTransferMode: "preserve",
    sameProjectionUnlockedTransferMode: "preserve",
    serializeCameraKey({ width, height, normalizedCamera }) {
      return serializeCustomCameraKey(width, height, normalizedCamera);
    },
    model: {
      renderStrategy: "composite",
      normalizeCamera: normalizeCustomCamera,
      getFrameState: getCustomFrameStateForCamera,
    },
  },
  orthographic: createAzimuthalDefinition({
    id: "orthographic",
    name: "Orthographic",
    factory: geoOrthographic,
    clipAngle: 90,
  }),
  lambertAzimuthalEqualArea: createAzimuthalDefinition({
    id: "lambertAzimuthalEqualArea",
    name: "Lambert Azimuthal Equal-Area",
    factory: geoAzimuthalEqualArea,
    scaleFactor: 1 / Math.SQRT2,
    clipAngle: 180 - 1e-3,
  }),
  gnomonic: createAzimuthalDefinition({
    id: "gnomonic",
    name: "Gnomonic",
    factory: geoGnomonic,
    scaleFactor: 0.72,
    clipAngle: 89.999,
  }),
  naturalEarth: createFlatDefinition({
    id: "naturalEarth",
    name: "Natural Earth II",
    factory: geoNaturalEarth2,
    resetFrameStateOnUnlockTransfer: true,
  }),
  robinson: createFlatDefinition({
    id: "robinson",
    name: "Robinson",
    factory: geoRobinson,
    resetFrameStateOnUnlockTransfer: true,
  }),
  mollweide: createFlatDefinition({
    id: "mollweide",
    name: "Mollweide",
    factory: geoMollweide,
    resetFrameStateOnUnlockTransfer: true,
  }),
  sinusoidal: createFlatDefinition({
    id: "sinusoidal",
    name: "Sinusoidal",
    factory: geoSinusoidal,
    resetFrameStateOnUnlockTransfer: true,
  }),
  sinuMollweide: createFlatDefinition({
    id: "sinuMollweide",
    name: "Sinu-Mollweide",
    factory: geoSinuMollweide,
    baseline: SINU_MOLLWEIDE_BASELINE,
    resetFrameStateOnUnlockTransfer: true,
  }),
  interruptedSinuMollweide: createFlatDefinition({
    id: "interruptedSinuMollweide",
    name: "Interrupted Sinu-Mollweide",
    factory: geoInterruptedSinuMollweide,
    baseline: SINU_MOLLWEIDE_BASELINE,
    resetFrameStateOnUnlockTransfer: true,
  }),
  peirceQuincuncial: createFlatDefinition({
    id: "peirceQuincuncial",
    name: "Peirce Quincuncial",
    factory: geoPeirceQuincuncial,
    baseline: PEIRCE_QUINCUNCIAL_BASELINE,
    unlockedApplyProjectionState: applyFlatProjectionStateWithRotate,
    resetFrameStateOnUnlockTransfer: true,
  }),
  larrivee: createFlatDefinition({
    id: "larrivee",
    name: "Larrivee",
    factory: geoLarrivee,
    resetFrameStateOnUnlockTransfer: true,
  }),
  winkelTripel: createFlatDefinition({
    id: "winkelTripel",
    name: "Winkel Tripel",
    factory: geoWinkel3,
    resetFrameStateOnUnlockTransfer: true,
  }),
  cahillKeyes: createFlatDefinition({
    id: "cahillKeyes",
    name: "Cahill-Keyes",
    factory: geoCahillKeyes,
    baseline: CAHILL_KEYES_BASELINE,
    resetFrameStateOnUnlockTransfer: true,
  }),
  goode: createFlatDefinition({
    id: "goode",
    name: "Goode's Homolosine",
    factory: geoInterruptedHomolosine,
    resetFrameStateOnUnlockTransfer: true,
  }),
  authagraph: createFlatDefinition({
    id: "authagraph",
    name: "AuthaGraph (Imago)",
    factory: () => geoImago().k(0.68),
    baseline: IMAGO_BASELINE,
    resetFrameStateOnUnlockTransfer: true,
  }),
  dymaxion: createFlatDefinition({
    id: "dymaxion",
    name: "Dymaxion (Airocean)",
    factory: geoAirocean,
    baseline: AIROCEAN_BASELINE,
    resetFrameStateOnUnlockTransfer: true,
  }),
  interruptedTransverseMercator: createFlatDefinition({
    id: "interruptedTransverseMercator",
    name: "ITM",
    factory: geoTransverseMercator,
    normalizeCamera: normalizeItmCamera,
    buildCamera: buildItmCamera,
  }),
  waterman: createFlatDefinition({
    id: "waterman",
    name: "Waterman Butterfly",
    factory: geoPolyhedralWaterman,
    resetFrameStateOnUnlockTransfer: true,
  }),
};

export const PROJECTIONS = Object.values(PROJECTION_DEFINITIONS).map(({ id, name }) => ({ id, name }));

const VALID_PROJECTION_IDS = new Set(PROJECTIONS.map((p) => p.id));

export function isValidProjectionId(id) {
  return VALID_PROJECTION_IDS.has(id);
}

export function normalizeProjectionCamera(projectionType, camera = null, { locked = false } = {}) {
  const model = getProjectionModel(projectionType);
  if (model) {
    return model.normalizeCamera(camera, locked);
  }
  if (locked) {
    return normalizeFrameCamera(camera);
  }
  return isFlatProjection(projectionType)
    ? normalizeFlatCamera(camera)
    : normalizePrintCamera(camera);
}

export function getProjectionGestureMode(projectionType, locked = false) {
  if (locked) {
    return "pan";
  }
  if (isCustomProjection(projectionType)) {
    return "project";
  }
  return isFlatProjection(projectionType) ? "project" : "rotate";
}

export function getProjectionPanCamera({
  projectionType,
  camera,
  deltaX,
  deltaY,
}) {
  const model = getProjectionModel(projectionType);
  if (model?.buildCamera && model?.getFrameState) {
    const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked: true });
    const frameState = model.getFrameState(normalizedCamera);
    return model.buildCamera(normalizedCamera, {
      frameState: {
        ...frameState,
        panX: frameState.panX + deltaX,
        panY: frameState.panY + deltaY,
      },
      locked: true,
    });
  }
  const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked: true });
  return normalizeProjectionCamera(
    projectionType,
    {
      ...normalizedCamera,
      panX: normalizedCamera.panX + deltaX,
      panY: normalizedCamera.panY + deltaY,
    },
    { locked: true },
  );
}

export function getProjectionPanZoomCamera({
  projectionType,
  camera,
  nextZoomScale,
  anchorCx = 0,
  anchorCy = 0,
}) {
  if (isCustomProjection(projectionType)) {
    const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked: true });
    const frameState = getCustomFrameStateForCamera(normalizedCamera);
    const factor = nextZoomScale / Math.max(frameState.zoomScale || 1, MIN_PRINT_ZOOM_SCALE);
    return normalizeProjectionCamera(
      projectionType,
      {
        ...normalizedCamera,
        frameZoomScale: nextZoomScale,
        panX: anchorCx - (anchorCx - frameState.panX) * factor,
        panY: anchorCy - (anchorCy - frameState.panY) * factor,
      },
      { locked: true },
    );
  }
  const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked: true });
  const model = getProjectionModel(projectionType);
  const frameState = model?.getFrameState
    ? model.getFrameState(normalizedCamera)
    : getFrameStateForCamera(normalizedCamera);
  const factor = nextZoomScale / Math.max(frameState.zoomScale || 1, MIN_PRINT_ZOOM_SCALE);
  const panX = anchorCx - (anchorCx - frameState.panX) * factor;
  const panY = anchorCy - (anchorCy - frameState.panY) * factor;
  if (model?.buildCamera) {
    return model.buildCamera(normalizedCamera, {
      frameState: {
        zoomScale: nextZoomScale,
        panX,
        panY,
      },
      locked: true,
    });
  }
  return normalizeProjectionCamera(
    projectionType,
    {
      ...normalizedCamera,
      zoomScale: nextZoomScale,
      panX,
      panY,
    },
    { locked: true },
  );
}

// Returns the canvas 2D transform parameters that apply frame pan/zoom.
// Equivalent to: translate to cx+panX, scale around center, translate back.
function getFrameCameraTransform(width, height, camera) {
  const cx = width / 2;
  const cy = height / 2;
  const zoom = camera.zoomScale;
  const tx = cx * (1 - zoom) + camera.panX * width;
  const ty = cy * (1 - zoom) + camera.panY * height;
  return { zoom, tx, ty };
}

function applyTransformToPoint(point, transform) {
  return {
    x: (point.x * transform.zoom) + transform.tx,
    y: (point.y * transform.zoom) + transform.ty,
  };
}

function invertTransformPoint(point, transform) {
  return {
    x: (point.x - transform.tx) / transform.zoom,
    y: (point.y - transform.ty) / transform.zoom,
  };
}

function clampLatitude(latitude) {
  return Math.max(-89.999, Math.min(89.999, latitude));
}

function wrapLongitudeDelta(longitude) {
  return wrapLongitude(longitude);
}

function getProjectedBoundsForView(view) {
  const bounds = geoPath(view.projection).bounds({ type: "Sphere" });
  const [[x0, y0], [x1, y1]] = bounds;
  if (![x0, y0, x1, y1].every(Number.isFinite)) {
    return null;
  }
  if (!view.frameTransform) {
    return { x0, y0, x1, y1 };
  }
  const topLeft = applyTransformToPoint({ x: x0, y: y0 }, view.frameTransform);
  const bottomRight = applyTransformToPoint({ x: x1, y: y1 }, view.frameTransform);
  return {
    x0: topLeft.x,
    y0: topLeft.y,
    x1: bottomRight.x,
    y1: bottomRight.y,
  };
}

function getProjectionCameraForRender(projectionType, normalizedCamera, locked) {
  if (usesUnifiedProjectionModel(projectionType)) {
    return normalizedCamera;
  }
  if (locked) {
    return isFlatProjection(projectionType)
      ? normalizeProjectionCamera(projectionType, null)
      : normalizeProjectionCamera(projectionType, null);
  }
  return normalizedCamera;
}

function createProjectionView({
  projectionType,
  width,
  height,
  camera,
  locked = false,
  renderQuality = "settled",
}) {
  const definition = getProjectionDefinition(projectionType);
  const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked });
  const isFlat = isFlatProjection(projectionType);
  const projectionCamera = getProjectionCameraForRender(projectionType, normalizedCamera, locked);
  const projection = definition?.createProjection
    ? definition.createProjection({
      width,
      height,
      camera: projectionCamera,
      locked,
      renderQuality,
      definition,
    })
    : null;
  const frameTransform = shouldApplyFrameTransform(projectionType, locked)
    ? usesUnifiedProjectionModel(projectionType)
    ? getFrameCameraTransform(width, height, {
      zoomScale: normalizedCamera.frameZoomScale,
      panX: normalizedCamera.panX,
      panY: normalizedCamera.panY,
    })
    : getFrameCameraTransform(width, height, normalizedCamera)
    : null;
  const cameraKey = definition?.serializeCameraKey
    ? definition.serializeCameraKey({
      width,
      height,
      normalizedCamera,
      projectionCamera,
      locked,
    })
    : locked
      ? `frame:${projectionType}:${width}:${height}`
      : isFlat
        ? `flat:${projectionType}:${width}:${height}:${projectionCamera.zoomScale}:${projectionCamera.centerLon}:${projectionCamera.centerLat}:${projectionCamera.offsetX}:${projectionCamera.offsetY}`
        : `ortho:${width}:${height}:${projectionCamera.zoomScale}:${projectionCamera.rotationLon}:${projectionCamera.rotationLat}`;
  return {
    normalizedCamera,
    projection,
    frameTransform,
    cameraKey,
  };
}

export function getProjectionViewportTransform(projectionType, width, height, camera, { locked = false } = {}) {
  if (usesUnifiedProjectionModel(projectionType)) {
    if (!shouldApplyFrameTransform(projectionType, locked)) {
      return null;
    }
    const normalizedCamera = normalizeProjectionCamera(projectionType, camera, { locked });
    return getFrameCameraTransform(width, height, {
      zoomScale: normalizedCamera.frameZoomScale,
      panX: normalizedCamera.panX,
      panY: normalizedCamera.panY,
    });
  }
  if (!locked) {
    return null;
  }
  return getFrameCameraTransform(width, height, normalizeProjectionCamera(projectionType, camera, { locked: true }));
}

export function projectScreenPointToGeo({
  projectionType,
  width,
  height,
  camera,
  x,
  y,
  locked = false,
  renderQuality = "interactive",
}) {
  const { projection, frameTransform } = createProjectionView({
    projectionType,
    width,
    height,
    camera,
    locked,
    renderQuality,
  });
  if (typeof projection.invert !== "function") {
    return null;
  }
  const localPoint = frameTransform
    ? invertTransformPoint({ x, y }, frameTransform)
    : { x, y };
  const geo = projection.invert([localPoint.x, localPoint.y]);
  return Array.isArray(geo) && geo.every(Number.isFinite) ? geo : null;
}

export function transferProjectionCamera({
  sourceProjectionType,
  targetProjectionType,
  width,
  height,
  camera,
  sourceLocked = false,
  targetLocked = sourceLocked,
  focusX = width / 2,
  focusY = height / 2,
}) {
  const targetDefinition = getProjectionDefinition(targetProjectionType);
  if (isCustomProjection(targetProjectionType)) {
    return normalizeProjectionCamera(
      targetProjectionType,
      isCustomProjection(sourceProjectionType) ? camera : null,
      { locked: targetLocked },
    );
  }
  if (isCustomProjection(sourceProjectionType)) {
    return normalizeProjectionCamera(targetProjectionType, null, { locked: targetLocked });
  }
  if (targetLocked) {
    if (sourceProjectionType === targetProjectionType) {
      if (targetDefinition?.sameProjectionLockedTransferMode === "reset-frame-when-source-unlocked" && !sourceLocked) {
        return normalizeProjectionCamera(
          targetProjectionType,
          {
            ...camera,
            frameZoomScale: 1,
            panX: 0,
            panY: 0,
            zoomScale: 1,
          },
          { locked: true },
        );
      }
      if (targetDefinition?.sameProjectionLockedTransferMode === "preserve") {
        return normalizeProjectionCamera(targetProjectionType, camera, { locked: true });
      }
    }
    if (sourceLocked) {
      return normalizeProjectionCamera(targetProjectionType, camera, { locked: true });
    }
    const sourceView = createProjectionView({
      projectionType: sourceProjectionType,
      width,
      height,
      camera,
      locked: sourceLocked,
      renderQuality: "interactive",
    });
    const targetView = createProjectionView({
      projectionType: targetProjectionType,
      width,
      height,
      camera: null,
      locked: false,
      renderQuality: "interactive",
    });
    const sourceBounds = getProjectedBoundsForView(sourceView);
    const targetBounds = getProjectedBoundsForView(targetView);
    if (!sourceBounds || !targetBounds) {
      return normalizeProjectionCamera(targetProjectionType, null, { locked: true });
    }
    const sourceWidth = Math.max(1e-6, sourceBounds.x1 - sourceBounds.x0);
    const sourceHeight = Math.max(1e-6, sourceBounds.y1 - sourceBounds.y0);
    const targetWidth = Math.max(1e-6, targetBounds.x1 - targetBounds.x0);
    const targetHeight = Math.max(1e-6, targetBounds.y1 - targetBounds.y0);
    const nextZoomScale = Math.max(
      MIN_PRINT_ZOOM_SCALE,
      Math.min(MAX_PRINT_ZOOM_SCALE, Math.min(sourceWidth / targetWidth, sourceHeight / targetHeight)),
    );
    const sourceCenterX = (sourceBounds.x0 + sourceBounds.x1) / 2;
    const sourceCenterY = (sourceBounds.y0 + sourceBounds.y1) / 2;
    const targetCenterX = (targetBounds.x0 + targetBounds.x1) / 2;
    const targetCenterY = (targetBounds.y0 + targetBounds.y1) / 2;
    const cx = width / 2;
    const cy = height / 2;
    const tx = sourceCenterX - (targetCenterX * nextZoomScale);
    const ty = sourceCenterY - (targetCenterY * nextZoomScale);
    return normalizeProjectionCamera(
      targetProjectionType,
      {
        zoomScale: nextZoomScale,
        panX: (tx - (cx * (1 - nextZoomScale))) / width,
        panY: (ty - (cy * (1 - nextZoomScale))) / height,
      },
      { locked: true },
    );
  }
  if (sourceProjectionType === targetProjectionType && targetDefinition?.sameProjectionUnlockedTransferMode === "preserve") {
    return normalizeProjectionCamera(targetProjectionType, camera, { locked: false });
  }
  const sourceCamera = normalizeProjectionCamera(sourceProjectionType, camera, { locked: sourceLocked });
  const focusGeo = projectScreenPointToGeo({
    projectionType: sourceProjectionType,
    width,
    height,
    camera: sourceCamera,
    x: focusX,
    y: focusY,
    locked: sourceLocked,
  });
  if (isFlatProjection(targetProjectionType)) {
    if (sourceLocked) {
      const sourceView = createProjectionView({
        projectionType: sourceProjectionType,
        width,
        height,
        camera,
        locked: true,
        renderQuality: "interactive",
      });
      const sourceBounds = getProjectedBoundsForView(sourceView);
      const baseCamera = normalizeProjectionCamera(
        targetProjectionType,
        {
          zoomScale: 1,
          centerLon: focusGeo?.[0] ?? 0,
          centerLat: focusGeo?.[1] ?? 0,
          offsetX: 0,
          offsetY: 0,
        },
        { locked: false },
      );
      const baseView = createProjectionView({
        projectionType: targetProjectionType,
        width,
        height,
        camera: baseCamera,
        locked: false,
        renderQuality: "interactive",
      });
      const baseBounds = getProjectedBoundsForView(baseView);
      if (sourceBounds && baseBounds) {
        const sourceWidth = Math.max(1e-6, sourceBounds.x1 - sourceBounds.x0);
        const sourceHeight = Math.max(1e-6, sourceBounds.y1 - sourceBounds.y0);
        const baseWidth = Math.max(1e-6, baseBounds.x1 - baseBounds.x0);
        const baseHeight = Math.max(1e-6, baseBounds.y1 - baseBounds.y0);
        const zoomScale = Math.max(
          MIN_PRINT_ZOOM_SCALE,
          Math.min(MAX_PRINT_ZOOM_SCALE, Math.min(sourceWidth / baseWidth, sourceHeight / baseHeight)),
        );
        const zoomedCamera = normalizeProjectionCamera(
          targetProjectionType,
          { ...baseCamera, zoomScale },
          { locked: false },
        );
        const zoomedView = createProjectionView({
          projectionType: targetProjectionType,
          width,
          height,
          camera: zoomedCamera,
          locked: false,
          renderQuality: "interactive",
        });
        const zoomedBounds = getProjectedBoundsForView(zoomedView);
        if (zoomedBounds) {
          const sourceCenterX = (sourceBounds.x0 + sourceBounds.x1) / 2;
          const sourceCenterY = (sourceBounds.y0 + sourceBounds.y1) / 2;
          const targetCenterX = (zoomedBounds.x0 + zoomedBounds.x1) / 2;
          const targetCenterY = (zoomedBounds.y0 + zoomedBounds.y1) / 2;
          const unlockedCamera = normalizeProjectionCamera(
            targetProjectionType,
            {
              ...zoomedCamera,
              offsetX: (sourceCenterX - targetCenterX) / width,
              offsetY: (sourceCenterY - targetCenterY) / height,
            },
            { locked: false },
          );
          if (targetDefinition?.resetFrameStateOnUnlockTransfer) {
            return normalizeProjectionCamera(
              targetProjectionType,
              {
                ...unlockedCamera,
                frameZoomScale: 1,
                panX: 0,
                panY: 0,
              },
              { locked: false },
            );
          }
          return unlockedCamera;
        }
      }
    }
    const unlockedCamera = normalizeProjectionCamera(
      targetProjectionType,
      {
        zoomScale: sourceCamera.zoomScale,
        centerLon: focusGeo?.[0] ?? 0,
        centerLat: focusGeo?.[1] ?? 0,
        offsetX: sourceCamera.offsetX ?? 0,
        offsetY: sourceCamera.offsetY ?? 0,
      },
      { locked: false },
    );
    if (targetDefinition?.resetFrameStateOnUnlockTransfer) {
      return normalizeProjectionCamera(
        targetProjectionType,
        {
          ...unlockedCamera,
          frameZoomScale: 1,
          panX: 0,
          panY: 0,
        },
        { locked: false },
      );
    }
    return unlockedCamera;
  }
  return normalizeProjectionCamera(
    targetProjectionType,
    {
      zoomScale: sourceCamera.zoomScale,
      rotationLon: focusGeo ? -focusGeo[0] - ORTHOGRAPHIC_BASE_ROTATE[0] : 0,
      rotationLat: focusGeo ? -focusGeo[1] - ORTHOGRAPHIC_BASE_ROTATE[1] : 0,
    },
    { locked: false },
  );
}

export function getProjectionDragCamera({
  projectionType,
  width,
  height,
  camera,
  startX,
  startY,
  currentX,
  currentY,
}) {
  if (isCustomProjection(projectionType)) {
    const customCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
    const startHit = getCustomViewAtPoint({
      width,
      height,
      camera: customCamera,
      x: startX,
      y: startY,
    });
    const selectedView = startHit?.view ?? null;
    if (!selectedView) {
      return customCamera;
    }
    const bounds = startHit.projectionBounds;
    const startPoint = startHit;
    const currentPoint = getWorkspacePointForCustomCamera(width, height, customCamera, currentX, currentY);
    const childStartCamera = selectedView.camera;
    let childCamera = childStartCamera;
    if (isFlatProjection(selectedView.projection)) {
      childCamera = getProjectionDragCamera({
        projectionType: selectedView.projection,
        width: bounds.width,
        height: bounds.height,
        camera: childStartCamera,
        startX: startPoint.localX,
        startY: startPoint.localY,
        currentX: currentPoint.x - bounds.x,
        currentY: currentPoint.y - bounds.y,
      });
    } else {
      const s = ORTHOGRAPHIC_DRAG_SENSITIVITY * (1.5 / Math.max(getProjectionStateZoom(childStartCamera), 1));
      childCamera = normalizeProjectionCamera(
        selectedView.projection,
        {
          ...childStartCamera,
          rotationLon: (childStartCamera.rotationLon ?? 0) + (currentPoint.x - (startPoint.workspaceX ?? startX)) * s,
          rotationLat: (childStartCamera.rotationLat ?? 0) - (currentPoint.y - (startPoint.workspaceY ?? startY)) * s,
        },
        { locked: false },
      );
    }
    return updateCustomView(customCamera, selectedView.id, (view) => ({
      ...view,
      camera: childCamera,
    }));
  }
  const model = getProjectionModel(projectionType);
  if (model?.getUnlockedDragCamera) {
    return model.getUnlockedDragCamera({
      projectionType,
      width,
      height,
      camera,
      startX,
      startY,
      currentX,
      currentY,
    });
  }
  const startCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
  if (!isFlatProjection(projectionType)) {
    return startCamera;
  }
  const anchorGeo = projectScreenPointToGeo({
    projectionType,
    width,
    height,
    camera: startCamera,
    x: startX,
    y: startY,
    locked: false,
  });
  if (!anchorGeo) {
    return startCamera;
  }
  return solveProjectionSpaceFlatCamera({
    projectionType,
    width,
    height,
    camera: startCamera,
    zoomScale: startCamera.zoomScale,
    anchorGeo,
    targetX: currentX,
    targetY: currentY,
  });
}

export function getProjectionZoomCamera({
  projectionType,
  width,
  height,
  camera,
  nextZoomScale,
  anchorX = width / 2,
  anchorY = height / 2,
}) {
  if (isCustomProjection(projectionType)) {
    const customCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
    const hit = getCustomViewAtPoint({
      width,
      height,
      camera: customCamera,
      x: anchorX,
      y: anchorY,
    });
    const selectedView = hit?.view ?? getCustomSelectedView(customCamera);
    if (!selectedView) {
      return customCamera;
    }
    const bounds = hit?.projectionBounds ?? getCustomProjectionBounds(width, height, selectedView);
    const childCamera = getProjectionZoomCamera({
      projectionType: selectedView.projection,
      width: bounds.width,
      height: bounds.height,
      camera: selectedView.camera,
      nextZoomScale,
      anchorX: hit ? hit.localX : bounds.width / 2,
      anchorY: hit ? hit.localY : bounds.height / 2,
    });
    return updateCustomView(customCamera, selectedView.id, (view) => ({
      ...view,
      camera: childCamera,
    }));
  }
  const model = getProjectionModel(projectionType);
  if (model?.getUnlockedZoomCamera) {
    return model.getUnlockedZoomCamera({
      projectionType,
      width,
      height,
      camera,
      nextZoomScale,
      anchorX,
      anchorY,
    });
  }
  const startCamera = normalizeProjectionCamera(projectionType, camera, { locked: false });
  if (!isFlatProjection(projectionType)) {
    return startCamera;
  }
  const anchorGeo = projectScreenPointToGeo({
    projectionType,
    width,
    height,
    camera: startCamera,
    x: anchorX,
    y: anchorY,
    locked: false,
  });
  if (!anchorGeo) {
    return normalizeProjectionCamera(
      projectionType,
      { ...startCamera, zoomScale: nextZoomScale },
      { locked: false },
    );
  }
  return solveProjectionSpaceFlatCamera({
    projectionType,
    width,
    height,
    camera: startCamera,
    zoomScale: nextZoomScale,
    anchorGeo,
    targetX: anchorX,
    targetY: anchorY,
  });
}

function buildPath2D(geometry, projection) {
  if (typeof Path2D === "undefined" || !geometry) return null;
  const path2d = new Path2D();
  geoPath(projection, path2d)(geometry);
  return path2d;
}

function collectProjectedPoints(geojson, projection) {
  const points = [];
  const listener = {
    point(x, y) { points.push([x, y]); },
    lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {}, sphere() {},
  };
  geoStream(geojson, projection.stream(listener));
  return points;
}

export function createProjectionAdapterState() {
  return {
    staticPaths: {
      sphere: { key: "", geometry: null, path: null },
      land: { key: "", geometry: null, path: null },
      graticules: { key: "", geometry: null, path: null },
    },
  };
}

export function createProjectionAdapter({
  projectionType,
  width,
  height,
  camera,
  locked = false,
  state,
  perfTracker = null,
  renderQuality = "settled",
}) {
  const {
    normalizedCamera,
    projection,
    frameTransform,
    cameraKey,
  } = createProjectionView({
    projectionType,
    width,
    height,
    camera,
    locked,
    renderQuality,
  });

  function getStaticPath(name, geometry) {
    const entry = state.staticPaths[name];
    if (!entry || !geometry) return null;
    const nextKey = `${cameraKey}:${geometry.type}`;
    if (entry.key !== nextKey || entry.geometry !== geometry) {
      perfTracker?.increment("staticPathMisses");
      entry.path = perfTracker?.time("buildStaticPathMs", () => buildPath2D(geometry, projection))
        ?? buildPath2D(geometry, projection);
      entry.key = nextKey;
      entry.geometry = geometry;
    } else {
      perfTracker?.increment("staticPathHits");
    }
    return entry.path;
  }

  function getCommandPath(command) {
    if (!command?.geojson || typeof Path2D === "undefined") return null;
    if (command.pathCameraKey !== cameraKey) {
      perfTracker?.increment("commandPathMisses");
      command.path2d = perfTracker?.time("buildCommandPathMs", () => buildPath2D(command.geojson, projection))
        ?? buildPath2D(command.geojson, projection);
      command.pathCameraKey = cameraKey;
    } else {
      perfTracker?.increment("commandPathHits");
    }
    return command.path2d ?? null;
  }

  function getProjectedPoints(command) {
    if (!command?.geojson) return [];
    if (command.projectedPointsCameraKey !== cameraKey) {
      perfTracker?.increment("projectedPointMisses");
      command.projectedPoints = perfTracker?.time(
        "projectPointsMs",
        () => collectProjectedPoints(command.geojson, projection),
      ) ?? collectProjectedPoints(command.geojson, projection);
      command.projectedPointsCameraKey = cameraKey;
    } else {
      perfTracker?.increment("projectedPointHits");
    }
    return command.projectedPoints ?? [];
  }

  // Wraps a draw callback in the flat projection viewport transform (pan + zoom as canvas
  // matrix). For unlocked projection-space movement, calls fn() directly.
  function applyViewportTransform(ctx, fn) {
    if (!frameTransform) {
      fn();
      return;
    }
    ctx.save();
    ctx.transform(frameTransform.zoom, 0, 0, frameTransform.zoom, frameTransform.tx, frameTransform.ty);
    fn();
    ctx.restore();
  }

  return {
    projection,
    camera: normalizedCamera,
    cameraKey,
    gestureMode: getProjectionGestureMode(projectionType, locked),
    getStaticPath,
    getCommandPath,
    getProjectedPoints,
    applyViewportTransform,
  };
}
