import {
  Viewer,
  EllipsoidTerrainProvider,
  GeoJsonDataSource,
  Color,
  SkyBox,
  SkyAtmosphere,
  Sun,
  Moon,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

const BACKGROUND_COLOR = Color.fromCssColorString("#0a0a0f");
const OCEAN_COLOR = Color.fromCssColorString("#2C6F92");
const LAND_FILL_COLOR = Color.fromCssColorString("#6EAA6E");
const OUTLINE_COLOR = Color.fromCssColorString("#d9e4da");

const viewer = new Viewer("cesiumContainer", {
  terrainProvider: new EllipsoidTerrainProvider(),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  skyAtmosphere: new SkyAtmosphere(),
  skyBox: false,
  creditContainer: document.createElement("div"), // hide credits
});

// Ocean — set globe base color
viewer.scene.globe.baseColor = OCEAN_COLOR;

// Remove default imagery layer so globe shows baseColor cleanly
viewer.imageryLayers.removeAll();

// Background space color
viewer.scene.backgroundColor = BACKGROUND_COLOR;

// Load land
GeoJsonDataSource.load("/data/world-atlas/ne_110m_land.geojson", {
  fill: LAND_FILL_COLOR,
  stroke: OUTLINE_COLOR,
  strokeWidth: 1,
}).then((dataSource) => {
  viewer.dataSources.add(dataSource);
});

window.cesiumViewer = viewer;
