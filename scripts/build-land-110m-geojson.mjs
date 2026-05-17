import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as topojson from "topojson-client";

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const DETAIL_LEVELS = ["110m", "50m", "10m"];

fs.mkdirSync(OUT_DIR, { recursive: true });

function splitPolygonFeatures(featureCollection, detail) {
  const features = [];
  featureCollection.features?.forEach((feature, featureIndex) => {
    const geometry = feature?.geometry;
    const baseProperties = feature?.properties && typeof feature.properties === "object"
      ? feature.properties
      : {};
    const polygons = geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

    polygons.forEach((coordinates, polygonIndex) => {
      features.push({
        type: "Feature",
        properties: {
          ...baseProperties,
          detail,
          sourceFeatureIndex: featureIndex,
          sourcePolygonIndex: polygonIndex,
        },
        geometry: {
          type: "Polygon",
          coordinates,
        },
      });
    });
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildExteriorLineFeatures(featureCollection, detail) {
  const features = [];
  featureCollection.features?.forEach((feature, featureIndex) => {
    const geometry = feature?.geometry;
    const baseProperties = feature?.properties && typeof feature.properties === "object"
      ? feature.properties
      : {};
    const polygons = geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

    polygons.forEach((coordinates, polygonIndex) => {
      const exteriorRing = coordinates?.[0];
      if (!Array.isArray(exteriorRing) || exteriorRing.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        properties: {
          ...baseProperties,
          detail,
          sourceFeatureIndex: featureIndex,
          sourcePolygonIndex: polygonIndex,
        },
        geometry: {
          type: "LineString",
          coordinates: exteriorRing,
        },
      });
    });
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

DETAIL_LEVELS.forEach((detail) => {
  const topology = require(`world-atlas/land-${detail}.json`);
  const sourceGeojson = topojson.feature(topology, topology.objects.land);
  const geojson = splitPolygonFeatures(sourceGeojson, detail);
  geojson.metadata = {
    kind: "naturalEarthLand",
    detail,
    source: `world-atlas/land-${detail}.json`,
    generatedBy: "scripts/build-land-110m-geojson.mjs",
  };

  const outputPath = path.join(OUT_DIR, `land-${detail}.geojson`);
  fs.writeFileSync(outputPath, `${JSON.stringify(geojson)}\n`);
  const bytes = fs.statSync(outputPath).size;
  console.log(`Built land-${detail}.geojson (${(bytes / 1024).toFixed(0)} KB) at ${outputPath}`);

  const outlineGeojson = buildExteriorLineFeatures(sourceGeojson, detail);
  outlineGeojson.metadata = {
    kind: "naturalEarthLandOutline",
    detail,
    source: `world-atlas/land-${detail}.json`,
    generatedBy: "scripts/build-land-110m-geojson.mjs",
  };
  const outlineOutputPath = path.join(OUT_DIR, `land-${detail}-outline.geojson`);
  fs.writeFileSync(outlineOutputPath, `${JSON.stringify(outlineGeojson)}\n`);
  const outlineBytes = fs.statSync(outlineOutputPath).size;
  console.log(`Built land-${detail}-outline.geojson (${(outlineBytes / 1024).toFixed(0)} KB) at ${outlineOutputPath}`);
});
