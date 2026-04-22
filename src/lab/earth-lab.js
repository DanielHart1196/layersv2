import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, SolidPolygonLayer } from "@deck.gl/layers";

const LAND_URL = "/data/world-atlas/countries-dissolved-land.geojson";
const GRATICULES_URL = "/data/graticules/world-graticules-10deg.geojson";
const OCEAN_POLYGON = [[
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
]];

const state = {
  map: null,
  overlay: null,
  land: null,
  graticules: null,
  mode: "interleaved",
  visibility: {
    ocean: true,
    landFill: true,
    landLine: true,
    graticules: true,
  },
};

const statusEl = document.getElementById("status");
const modeSelect = document.getElementById("modeSelect");
const oceanToggle = document.getElementById("oceanToggle");
const landFillToggle = document.getElementById("landFillToggle");
const landLineToggle = document.getElementById("landLineToggle");
const graticulesToggle = document.getElementById("graticulesToggle");

function updateStatus() {
  if (!state.map) {
    statusEl.textContent = "Loading…";
    return;
  }

  const center = state.map.getCenter();
  const zoom = state.map.getZoom();
  statusEl.textContent = [
    `mode: ${state.mode}`,
    `projection: globe`,
    `zoom: ${zoom.toFixed(2)}`,
    `center: ${center.lng.toFixed(2)}, ${center.lat.toFixed(2)}`,
    `land loaded: ${state.land ? "yes" : "no"}`,
    `graticules loaded: ${state.graticules ? "yes" : "no"}`,
  ].join("\n");
}

function getBeforeId() {
  if (!state.map || state.mode !== "interleaved") {
    return undefined;
  }
  const styleLayers = state.map.getStyle()?.layers ?? [];
  const earthIds = new Set(["lab-ocean", "lab-land-fill", "lab-land-line", "lab-graticules"]);
  return styleLayers.find((layer) => (
    layer?.id
    && layer.id !== "lab-anchor"
    && !earthIds.has(layer.id)
  ))?.id;
}

function buildLayers() {
  const beforeId = getBeforeId();
  return [
    new SolidPolygonLayer({
      id: "lab-ocean",
      beforeId,
      data: [{ polygon: OCEAN_POLYGON }],
      getPolygon: (d) => d.polygon,
      getFillColor: [44, 111, 146, 255],
      visible: state.visibility.ocean,
      pickable: false,
    }),
    new GeoJsonLayer({
      id: "lab-land-fill",
      beforeId,
      data: state.land ?? { type: "FeatureCollection", features: [] },
      filled: true,
      stroked: false,
      getFillColor: [110, 170, 110, 255],
      visible: state.visibility.landFill,
      pickable: false,
    }),
    new GeoJsonLayer({
      id: "lab-land-line",
      beforeId,
      data: state.land ?? { type: "FeatureCollection", features: [] },
      filled: false,
      stroked: true,
      getLineColor: [217, 228, 218, 255],
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      visible: state.visibility.landLine,
      pickable: false,
    }),
    new GeoJsonLayer({
      id: "lab-graticules",
      beforeId,
      data: state.graticules ?? { type: "FeatureCollection", features: [] },
      filled: false,
      stroked: true,
      getLineColor: [143, 169, 188, 255],
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
      visible: state.visibility.graticules,
      pickable: false,
    }),
  ];
}

function updateOverlay() {
  if (!state.overlay) {
    return;
  }
  state.overlay.setProps({
    layers: buildLayers(),
  });
  updateStatus();
}

function replaceOverlay() {
  if (!state.map) {
    return;
  }
  if (state.overlay) {
    state.map.removeControl(state.overlay);
  }
  state.overlay = new MapboxOverlay({
    interleaved: state.mode === "interleaved",
    layers: buildLayers(),
  });
  state.map.addControl(state.overlay);
  updateStatus();
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  state.map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      projection: { type: "globe" },
      sources: {
        "lab-anchor": {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [[
                    [-180, -90],
                    [180, -90],
                    [180, 90],
                    [-180, 90],
                    [-180, -90],
                  ]],
                },
              },
            ],
          },
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#061018",
          },
        },
        {
          id: "lab-anchor",
          type: "fill",
          source: "lab-anchor",
          paint: {
            "fill-color": "#061018",
            "fill-opacity": 0.0001,
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

  state.map.on("move", updateStatus);
  state.map.on("load", async () => {
    replaceOverlay();
    updateStatus();
    const [land, graticules] = await Promise.all([
      loadJson(LAND_URL),
      loadJson(GRATICULES_URL),
    ]);
    state.land = land;
    state.graticules = graticules;
    updateOverlay();
  });
}

modeSelect.addEventListener("change", () => {
  state.mode = modeSelect.value;
  replaceOverlay();
});

oceanToggle.addEventListener("change", () => {
  state.visibility.ocean = oceanToggle.checked;
  updateOverlay();
});

landFillToggle.addEventListener("change", () => {
  state.visibility.landFill = landFillToggle.checked;
  updateOverlay();
});

landLineToggle.addEventListener("change", () => {
  state.visibility.landLine = landLineToggle.checked;
  updateOverlay();
});

graticulesToggle.addEventListener("change", () => {
  state.visibility.graticules = graticulesToggle.checked;
  updateOverlay();
});

bootstrap().catch((error) => {
  statusEl.textContent = `Failed to start Earth Lab.\n${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
