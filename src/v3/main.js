import { Deck, _GlobeView as GlobeView } from "@deck.gl/core";
import { GeoJsonLayer, SolidPolygonLayer } from "@deck.gl/layers";

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1,
};

const LAND_COLOR = [110, 170, 110];
const OCEAN_COLOR = [30, 80, 120];
const OUTLINE_COLOR = [200, 220, 200];

const container = document.getElementById("globe");

const GLOBE_POLYGON = [[
  [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90],
]];

const deck = new Deck({
  parent: container,
  views: new GlobeView({ resolution: 5 }),
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  parameters: {
    clearColor: [0, 0, 0, 1],
    depthTest: true,
  },
  layers: [
    new SolidPolygonLayer({
      id: "ocean",
      data: [{ polygon: GLOBE_POLYGON }],
      getPolygon: (d) => d.polygon,
      getFillColor: OCEAN_COLOR,
      filled: true,
      extruded: false,
    }),
    new GeoJsonLayer({
      id: "land",
      data: "/data/world-atlas/ne_110m_land.geojson",
      filled: true,
      stroked: true,
      getFillColor: LAND_COLOR,
      getLineColor: OUTLINE_COLOR,
      getLineWidth: 1,
      lineWidthUnits: "pixels",
    }),
  ],
});

// Expose for console debugging
window.v3 = { deck };
