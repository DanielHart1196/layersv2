import fs from "node:fs";
import path from "node:path";
import polygonClipping from "polygon-clipping";

function geometryToMultiPolygonCoordinates(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return [];
}

const cwd = process.cwd();
const inputPath = path.join(cwd, "public/data/empires/mongol_empire_1279_extent.medium.self-cutout.geojson");
const outputPath = path.join(cwd, "public/data/empires/mongol_empire_1279_extent.medium.dissolved-fill.geojson");

const collection = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const sourceFeature = collection.features[0];
const polygonSets = [];

for (const feature of collection.features ?? []) {
  const polygons = geometryToMultiPolygonCoordinates(feature.geometry);
  if (polygons.length > 0) {
    polygonSets.push(polygons);
  }
}

if (polygonSets.length === 0) {
  throw new Error("No polygon geometry found for Mongol dissolved fill derivation.");
}

const dissolved = polygonClipping.union(...polygonSets);
const dissolvedFeature = {
  ...sourceFeature,
  properties: {
    ...sourceFeature.properties,
    derivedGeometry: "dissolved-fill",
    derivedFrom: "mongol_empire_1279_extent.medium.self-cutout.geojson",
  },
  geometry: {
    type: "MultiPolygon",
    coordinates: dissolved,
  },
};

fs.writeFileSync(outputPath, JSON.stringify({
  type: "FeatureCollection",
  features: [dissolvedFeature],
}));

console.log(JSON.stringify({
  outputPath,
  inputFeatureCount: collection.features?.length ?? 0,
  dissolvedPolygonCount: dissolved?.length ?? 0,
}, null, 2));
