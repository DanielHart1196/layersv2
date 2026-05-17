const DEFAULT_VIEW_TITLE = "Layers";
const TITLE_STORAGE_KEY = "layerv2.mapTitle.v1";
const VIEW_STATE_STORAGE_KEY = "layerv2.viewState.v1";

function normalizeTitle(value, fallback = DEFAULT_VIEW_TITLE) {
  const title = String(value ?? "").replace(/\s+/g, " ").trim();
  return title || fallback;
}

function readPersistedTitle() {
  try {
    return normalizeTitle(window.localStorage?.getItem(TITLE_STORAGE_KEY));
  } catch (_error) {
    return DEFAULT_VIEW_TITLE;
  }
}

function normalizeCameraState(camera = {}) {
  const longitude = Number(camera.center?.longitude);
  const latitude = Number(camera.center?.latitude);
  const zoom = Number(camera.zoom);
  const bearing = Number(camera.bearing);
  const pitch = Number(camera.pitch);
  if (![longitude, latitude, zoom, bearing, pitch].every(Number.isFinite)) {
    return null;
  }
  return {
    center: {
      longitude: Math.max(-180, Math.min(180, longitude)),
      latitude: Math.max(-85, Math.min(85, latitude)),
    },
    zoom: Math.max(0, Math.min(24, zoom)),
    bearing,
    pitch: Math.max(0, Math.min(85, pitch)),
  };
}

function readPersistedViewState() {
  try {
    const raw = window.localStorage?.getItem(VIEW_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function persistViewState(state) {
  try {
    window.localStorage?.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify({
      title: state.title,
      projectionId: state.projectionId,
      center: state.center,
      zoom: state.zoom,
      bearing: state.bearing,
      pitch: state.pitch,
    }));
  } catch (_error) {
    // Ignore storage failures and keep the runtime usable.
  }
}

function createViewModel(initialState = null) {
  const persistedState = readPersistedViewState();
  let hasExplicitCamera = false;
  const state = {
    title: normalizeTitle(persistedState?.title ?? readPersistedTitle()),
    projectionId: "globe",
    center: { longitude: 0, latitude: 0 },
    zoom: 1.1,
    bearing: 0,
    pitch: 0,
    print: {
      page: "A3",
      orientation: "portrait",
      includeQr: true,
      dpiTarget: 300,
    },
  };

  function applyState(nextState) {
    if (!nextState || typeof nextState !== "object") {
      return;
    }
    if (typeof nextState.title === "string") {
      state.title = normalizeTitle(nextState.title);
    }
    if (typeof nextState.projectionId === "string") {
      state.projectionId = nextState.projectionId;
    }
    const camera = normalizeCameraState(nextState);
    if (camera) {
      state.center = camera.center;
      state.zoom = camera.zoom;
      state.bearing = camera.bearing;
      state.pitch = camera.pitch;
      hasExplicitCamera = true;
    }
  }

  applyState(persistedState);
  applyState(initialState);

  function setCamera(camera, { persist = false } = {}) {
    const nextCamera = normalizeCameraState(camera);
    if (!nextCamera) {
      return getState();
    }
    state.center = nextCamera.center;
    state.zoom = nextCamera.zoom;
    state.bearing = nextCamera.bearing;
    state.pitch = nextCamera.pitch;
    hasExplicitCamera = true;
    if (persist) {
      persistViewState(state);
    }
    return getState();
  }

  function setTitle(title, { persist = false } = {}) {
    state.title = normalizeTitle(title);
    if (persist) {
      try {
        window.localStorage?.setItem(TITLE_STORAGE_KEY, state.title);
      } catch (_error) {
        // Ignore storage failures and keep the runtime usable.
      }
      persistViewState(state);
    }
    document.title = state.title;
    return state.title;
  }

  function getTitle() {
    return state.title;
  }

  function getState() {
    return structuredClone(state);
  }

  function hasCameraState() {
    return hasExplicitCamera;
  }

  document.title = state.title;

  return {
    getTitle,
    getState,
    hasCameraState,
    setCamera,
    setTitle,
  };
}

export { createViewModel };
