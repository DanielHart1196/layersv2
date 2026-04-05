import fs from "node:fs";
import path from "node:path";
import polygonClipping from "polygon-clipping";

function getFeatureBBox(feature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon"
    ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  polygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
    });
  });

  return { minX, minY, maxX, maxY };
}

function bboxIntersects(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function geometryToMultiPolygon(geometry) {
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

function multiPolygonToGeometry(multiPolygon) {
  if (!Array.isArray(multiPolygon) || multiPolygon.length === 0) {
    return null;
  }

  if (multiPolygon.length === 1) {
    return {
      type: "Polygon",
      coordinates: multiPolygon[0],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: multiPolygon,
  };
}

function countHoles(geometry) {
  const multiPolygon = geometryToMultiPolygon(geometry);
  return multiPolygon.reduce((total, polygon) => total + Math.max(0, polygon.length - 1), 0);
}

const cwd = process.cwd();
const empirePath = path.join(cwd, "public/data/empires/mongol_empire_1279_extent.medium.geojson");
const lakesPath = path.join(cwd, "public/data/water/ne_10m_lakes.geojson");
const outputPath = path.join(cwd, "public/data/empires/mongol_empire_1279_extent.medium.cutout.geojson");

const empire = JSON.parse(fs.readFileSync(empirePath, "utf8"));
const lakes = JSON.parse(fs.readFileSync(lakesPath, "utf8"));

const empireFeature = empire.features[0];
const empireBBox = getFeatureBBox(empireFeature);
const intersectingLakeFeatures = lakes.features.filter((feature) => {
  const geometry = feature?.geometry;
  if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") {
    return false;
  }

  return bboxIntersects(empireBBox, getFeatureBBox(feature));
});

let result = geometryToMultiPolygon(empireFeature.geometry);

intersectingLakeFeatures.forEach((lakeFeature) => {
  const lakeGeometry = geometryToMultiPolygon(lakeFeature.geometry);
  if (lakeGeometry.length === 0 || result.length === 0) {
    return;
  }

  const difference = polygonClipping.difference(result, lakeGeometry);
  result = Array.isArray(difference) ? difference : result;
});

const nextFeature = {
  ...empireFeature,
  properties: {
    ...empireFeature.properties,
    sourceWaterCutout: "Natural Earth ne_10m_lakes",
  },
  geometry: multiPolygonToGeometry(result),
};

const nextCollection = {
  ...empire,
  features: [nextFeature],
};

fs.writeFileSync(outputPath, JSON.stringify(nextCollection));

console.log(JSON.stringify({
  outputPath,
  intersectingLakes: intersectingLakeFeatures.length,
  originalHoles: countHoles(empireFeature.geometry),
  nextHoles: countHoles(nextFeature.geometry),
}, null, 2));
