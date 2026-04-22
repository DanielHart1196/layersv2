import maplibregl from "maplibre-gl";
import { LayerExtension } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, SolidPolygonLayer } from "@deck.gl/layers";
import "./styles.css";

const LAND_LOW_URL = "/data/world-atlas/ne_110m_land.geojson";
const GRATICULES_URL = "/data/graticules/world-graticules-10deg.geojson";
const OCEAN_RING = [[
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
]];

const STORAGE_KEY = "earthlab.earth.style.v1";
const HORIZON_CLIP_EPSILON = 0.002;
const DEFAULT_RENDER_ORDER = [
  "ocean.fill",
  "graticules.line",
  "land.line",
  "land.fill",
];

const DEFAULT_STYLE = {
  oceanColor: "#2c6f92",
  landFillColor: "#6eaa6e",
  landLineColor: "#d9e4da",
  graticulesColor: "#8fa9bc",
  oceanVisible: true,
  landVisible: true,
  graticulesVisible: true,
  renderOrder: DEFAULT_RENDER_ORDER,
};

const state = {
  map: null,
  overlay: null,
  landLow: null,
  land: null,
  graticules: null,
  style: readStyleState(),
  openStyleRow: null,
};

function setBootStage(stage) {
  document.body.dataset.earthlabStage = stage;
}

const hemisphereClipModule = {
  name: "hemisphereClip",
  vs: `\
layout(std140) uniform hemisphereClipUniforms {
  float enabled;
  float horizonEpsilon;
  vec3 cameraPosition;
} hemisphereClip;
`,
  fs: `\
layout(std140) uniform hemisphereClipUniforms {
  float enabled;
  float horizonEpsilon;
  vec3 cameraPosition;
} hemisphereClip;
`,
  uniformTypes: {
    enabled: "f32",
    horizonEpsilon: "f32",
    cameraPosition: "vec3<f32>",
  },
};

class HemisphereClipExtension extends LayerExtension {
  static extensionName = "HemisphereClipExtension";
  static defaultProps = {
    clipEnabled: true,
    clipHorizonEpsilon: HORIZON_CLIP_EPSILON,
  };

  getShaders() {
    return {
      modules: [hemisphereClipModule],
      inject: {
        "vs:#decl": `
out vec3 hemisphereClip_surfacePosition;
`,
        "vs:DECKGL_FILTER_GL_POSITION": `
hemisphereClip_surfacePosition = project_position(vec3(geometry.worldPosition.xy, 0.0));
`,
        "fs:#decl": `
in vec3 hemisphereClip_surfacePosition;
`,
        "fs:DECKGL_FILTER_COLOR": `
if (hemisphereClip.enabled > 0.5) {
  vec3 clipSurfacePoint = hemisphereClip_surfacePosition;
  vec3 clipViewDirection = normalize(hemisphereClip.cameraPosition - clipSurfacePoint);
  float clipFacing = dot(normalize(clipSurfacePoint), clipViewDirection);
  if (clipFacing < hemisphereClip.horizonEpsilon) {
    discard;
  }
}
`,
      },
    };
  }

  draw({}) {
    const viewport = this.context.viewport;
    this.setShaderModuleProps({
      hemisphereClip: {
        enabled: this.props.clipEnabled ? 1 : 0,
        horizonEpsilon: this.props.clipHorizonEpsilon,
        cameraPosition: viewport?.cameraPosition ?? [0, 0, 1],
      },
    });
  }
}

const hemisphereClipExtension = new HemisphereClipExtension();

const controls = {
  rows: document.getElementById("earthRows"),
  oceanSwatch: document.getElementById("oceanSwatch"),
  graticulesSwatch: document.getElementById("graticulesSwatch"),
  landSwatch: document.getElementById("landSwatch"),
  oceanToggle: document.getElementById("oceanToggle"),
  graticulesToggle: document.getElementById("graticulesToggle"),
  landToggle: document.getElementById("landToggle"),
  oceanStyle: document.getElementById("oceanStyle"),
  graticulesStyle: document.getElementById("graticulesStyle"),
  landStyle: document.getElementById("landStyle"),
  oceanColorPicker: document.getElementById("oceanColorPicker"),
  graticulesColorPicker: document.getElementById("graticulesColorPicker"),
  landFillColorPicker: document.getElementById("landFillColorPicker"),
  landLineColorPicker: document.getElementById("landLineColorPicker"),
  status: document.getElementById("status"),
};

function readStyleState() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_STYLE };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STYLE,
      ...parsed,
      renderOrder: normalizeRenderOrder(parsed?.renderOrder),
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

function normalizeRenderOrder(order) {
  const source = Array.isArray(order) ? order : DEFAULT_RENDER_ORDER;
  const allowed = new Set(DEFAULT_RENDER_ORDER);
  const normalized = source.filter((layerId) => allowed.has(layerId));
  DEFAULT_RENDER_ORDER.forEach((layerId) => {
    if (!normalized.includes(layerId)) {
      normalized.push(layerId);
    }
  });
  return normalized;
}

function persistStyleState() {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state.style));
  } catch {
    // Keep the runtime usable if storage is unavailable.
  }
}

function hexToRgb(hex, fallback = { r: 255, g: 255, b: 255 }) {
  const normalized = String(hex ?? "").trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return fallback;
  }
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function toDeckColor(hex, alpha = 255) {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b, alpha];
}

function loadJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status}`);
    }
    return response.json();
  });
}

function defer(task) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => task(), { timeout: 1200 });
    return;
  }
  window.setTimeout(task, 0);
}

function syncControlsFromState() {
  controls.oceanSwatch.style.background = state.style.oceanColor;
  controls.graticulesSwatch.style.background = state.style.graticulesColor;
  controls.landSwatch.style.background = `linear-gradient(135deg, ${state.style.landFillColor} 0 62%, ${state.style.landLineColor} 62% 100%)`;
  controls.oceanToggle.setAttribute("aria-checked", String(state.style.oceanVisible));
  controls.graticulesToggle.setAttribute("aria-checked", String(state.style.graticulesVisible));
  controls.landToggle.setAttribute("aria-checked", String(state.style.landVisible));
  controls.oceanStyle.hidden = state.openStyleRow !== "ocean";
  controls.graticulesStyle.hidden = state.openStyleRow !== "graticules";
  controls.landStyle.hidden = state.openStyleRow !== "land";
  controls.oceanColorPicker.value = state.style.oceanColor;
  controls.graticulesColorPicker.value = state.style.graticulesColor;
  controls.landFillColorPicker.value = state.style.landFillColor;
  controls.landLineColorPicker.value = state.style.landLineColor;
}

function updateStatus() {
  if (!state.map) {
    controls.status.textContent = "Loading...";
    return;
  }

  const center = state.map.getCenter();
  const canvas = state.map.getCanvas();
  const canvasContainer = canvas?.parentElement;
  controls.status.textContent = [
    "mode: overlaid deck Earth",
    "projection: globe",
    `zoom: ${state.map.getZoom().toFixed(2)}`,
    `center: ${center.lng.toFixed(2)}, ${center.lat.toFixed(2)}`,
    `land loaded: ${state.land ? "yes" : "no"}`,
    `land detail: ${state.landLow ? "low" : "none"}`,
    `graticules loaded: ${state.graticules ? "yes" : "no"}`,
    `dragPan enabled: ${state.map.dragPan?.isEnabled?.() ? "yes" : "no"}`,
    `touchZoomRotate enabled: ${state.map.touchZoomRotate?.isEnabled?.() ? "yes" : "no"}`,
    `canvas interactive class: ${canvasContainer?.classList?.contains("maplibregl-interactive") ? "yes" : "no"}`,
  ].join("\n");
}

function buildLayers() {
  const clippedLayerProps = {
    clipEnabled: true,
    clipHorizonEpsilon: HORIZON_CLIP_EPSILON,
    extensions: [hemisphereClipExtension],
  };

  const layerBuilders = {
    "ocean.fill": () => new SolidPolygonLayer({
      id: "earthlab-ocean",
      data: [{ polygon: OCEAN_RING }],
      getPolygon: (entry) => entry.polygon,
      getFillColor: toDeckColor(state.style.oceanColor),
      visible: state.style.oceanVisible,
      pickable: false,
      parameters: { depthTest: false },
    }),
    "graticules.line": () => new GeoJsonLayer({
      id: "earthlab-graticules",
      ...clippedLayerProps,
      data: state.graticules ?? { type: "FeatureCollection", features: [] },
      filled: false,
      stroked: true,
      getLineColor: toDeckColor(state.style.graticulesColor),
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      visible: state.style.graticulesVisible,
      pickable: false,
      parameters: { depthTest: false },
    }),
    "land.line": () => new GeoJsonLayer({
      id: "earthlab-land-line",
      ...clippedLayerProps,
      data: state.land ?? { type: "FeatureCollection", features: [] },
      filled: false,
      stroked: true,
      getLineColor: toDeckColor(state.style.landLineColor),
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      visible: state.style.landVisible,
      pickable: false,
      parameters: { depthTest: false },
    }),
    "land.fill": () => new GeoJsonLayer({
      id: "earthlab-land-fill",
      ...clippedLayerProps,
      data: state.land ?? { type: "FeatureCollection", features: [] },
      filled: true,
      stroked: false,
      getFillColor: toDeckColor(state.style.landFillColor),
      visible: state.style.landVisible,
      pickable: false,
      parameters: { depthTest: false },
    }),
  };

  return normalizeRenderOrder(state.style.renderOrder)
    .map((layerId) => layerBuilders[layerId]?.())
    .filter(Boolean);
}

function updateOverlay() {
  if (!state.overlay) {
    return;
  }
  syncControlsFromState();
  state.overlay.setProps({ layers: buildLayers() });
  updateStatus();
}

function toggleStyleRow(rowId) {
  state.openStyleRow = state.openStyleRow === rowId ? null : rowId;
  syncControlsFromState();
}

function bindControls() {
  [
    ["oceanSwatch", "ocean"],
    ["graticulesSwatch", "graticules"],
    ["landSwatch", "land"],
  ].forEach(([controlKey, rowId]) => {
    controls[controlKey].addEventListener("click", () => {
      toggleStyleRow(rowId);
    });
  });

  [
    ["oceanToggle", "oceanVisible"],
    ["graticulesToggle", "graticulesVisible"],
    ["landToggle", "landVisible"],
  ].forEach(([controlKey, styleKey]) => {
    controls[controlKey].addEventListener("click", () => {
      state.style[styleKey] = !state.style[styleKey];
      persistStyleState();
      updateOverlay();
    });
  });

  [
    ["oceanColorPicker", "oceanColor"],
    ["graticulesColorPicker", "graticulesColor"],
    ["landFillColorPicker", "landFillColor"],
    ["landLineColorPicker", "landLineColor"],
  ].forEach(([controlKey, styleKey]) => {
    controls[controlKey].addEventListener("input", (event) => {
      state.style[styleKey] = event.currentTarget.value;
      persistStyleState();
      updateOverlay();
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!controls.rows.contains(event.target)) {
      state.openStyleRow = null;
      syncControlsFromState();
    }
  });
}

async function bootstrap() {
  setBootStage("boot");
  syncControlsFromState();
  bindControls();
  bindReloadControls();

  state.map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      projection: { type: "globe" },
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#061018",
          },
        },
      ],
    },
    center: [0, 18],
    zoom: 1.3,
    bearing: 0,
    pitch: 0,
    attributionControl: false,
  });

  state.map.on("move", () => {
    updateStatus();
  });
  state.map.on("load", () => {
    state.overlay = new MapboxOverlay({
      interleaved: false,
      layers: buildLayers(),
    });
    state.map.addControl(state.overlay);
    setBootStage("shell");
    updateStatus();

    void loadJson(LAND_LOW_URL)
      .then((landLow) => {
        state.landLow = landLow;
        state.land = landLow;
        setBootStage("ready");
        updateOverlay();
        defer(() => {
          void loadJson(GRATICULES_URL)
            .then((graticules) => {
              state.graticules = graticules;
              updateOverlay();
            })
            .catch((error) => {
              console.warn("[earthlab] Failed to load graticules.", error);
            });
        });
      })
      .catch((error) => {
        console.warn("[earthlab] Failed to load low-detail land.", error);
        defer(() => {
          void loadJson(GRATICULES_URL)
            .then((graticules) => {
              state.graticules = graticules;
              updateOverlay();
            })
            .catch((graticulesError) => {
              console.warn("[earthlab] Failed to load graticules.", graticulesError);
            });
        });
      });
  });
}

function bindReloadControls() {
  const reloadBtn = document.getElementById("reloadBtn");
  const reloadMenu = document.getElementById("reloadMenu");
  const hardReloadBtn = document.getElementById("hardReloadBtn");
  const clearReloadBtn = document.getElementById("clearReloadBtn");

  reloadBtn.addEventListener("click", () => {
    window.location.reload();
  });

  reloadBtn.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    reloadMenu.hidden = !reloadMenu.hidden;
  });

  hardReloadBtn.addEventListener("click", () => {
    reloadMenu.hidden = true;
    window.location.reload(true);
  });

  clearReloadBtn.addEventListener("click", async () => {
    reloadMenu.hidden = true;
    localStorage.clear();
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload(true);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!reloadBtn.contains(event.target) && !reloadMenu.contains(event.target)) {
      reloadMenu.hidden = true;
    }
  });
}

bootstrap().catch((error) => {
  controls.status.textContent = `Failed to start Earthlab.\n${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
