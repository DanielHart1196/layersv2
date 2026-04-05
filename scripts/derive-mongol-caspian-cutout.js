import fs from "node:fs";
import path from "node:path";
import polygonClipping from "polygon-clipping";

function getPolygonBBox(polygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  polygon[0].forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  return { minX, minY, maxX, maxY };
}

function countHoles(multiPolygon) {
  return multiPolygon.reduce((total, polygon) => total + Math.max(0, polygon.length - 1), 0);
}

const CASPIAN_BBOX = {
  minX: 45,
  minY: 35,
  maxX: 56,
  maxY: 48,
};

function isWithinCaspianBBox(bbox) {
  return bbox.minX >= CASPIAN_BBOX.minX
    && bbox.maxX <= CASPIAN_BBOX.maxX
    && bbox.minY >= CASPIAN_BBOX.minY
    && bbox.maxY <= CASPIAN_BBOX.maxY;
}

const cwd = process.cwd();
const inputPath = path.join(cwd, "public/data/empires/mongol_empire_1279_extent.medium.geojson");
const outputPath = path.join(cwd, "public/data/empires/mongol_empire_1279_extent.medium.self-cutout.geojson");

const collection = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const feature = collection.features[0];
const polygons = feature.geometry.type === "Polygon"
  ? [feature.geometry.coordinates]
  : feature.geometry.coordinates;

const polygonRecords = polygons.map((polygon, index) => ({
  index,
  polygon,
  bbox: getPolygonBBox(polygon),
  pointCount: polygon[0].length,
}));

const mainPolygonRecord = [...polygonRecords].sort((a, b) => b.pointCount - a.pointCount)[0];
const cutoutRecords = polygonRecords.filter((record) => (
  record.index !== mainPolygonRecord.index && isWithinCaspianBBox(record.bbox)
));

if (!mainPolygonRecord || cutoutRecords.length === 0) {
  throw new Error("Failed to identify Mongol main polygon or Caspian cutout polygon.");
}

let mainResult = [mainPolygonRecord.polygon];
cutoutRecords.forEach((record) => {
  const difference = polygonClipping.difference(mainResult, [record.polygon]);
  if (Array.isArray(difference) && difference.length > 0) {
    mainResult = difference;
  }
});

const remainingPolygons = polygonRecords
  .filter((record) => record.index !== mainPolygonRecord.index && !cutoutRecords.some((cutout) => cutout.index === record.index))
  .map((record) => record.polygon);

const nextMultiPolygon = [...mainResult, ...remainingPolygons];
const nextFeature = {
  ...feature,
  properties: {
    ...feature.properties,
    sourceWaterCutout: "self-derived-caspian-from-mongol-geometry",
  },
  geometry: {
    type: "MultiPolygon",
    coordinates: nextMultiPolygon,
  },
};

fs.writeFileSync(outputPath, JSON.stringify({
  ...collection,
  features: [nextFeature],
}));

console.log(JSON.stringify({
  outputPath,
  mainPolygonIndex: mainPolygonRecord.index,
  cutoutPolygonIndexes: cutoutRecords.map((record) => record.index),
  originalHoles: countHoles(polygons),
  nextHoles: countHoles(nextMultiPolygon),
}, null, 2));
