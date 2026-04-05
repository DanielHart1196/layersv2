#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as shapefile from "shapefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const WORLD_ATLAS_DIR = path.join(ROOT, "public", "data", "world-atlas");
const CACHE_DIR = path.join(ROOT, ".cache", "world-atlas-osm");

const LAND_ZIP_PATH = path.join(WORLD_ATLAS_DIR, "land-polygons-split-4326.zip");
const COASTLINES_ZIP_PATH = path.join(WORLD_ATLAS_DIR, "coastlines-split-4326.zip");

const LAND_SHP_BASE = path.join(CACHE_DIR, "land-polygons-split-4326", "land_polygons");
const COASTLINES_SHP_BASE = path.join(CACHE_DIR, "coastlines-split-4326", "lines");

const LAND_OUTPUT_PATH = path.join(WORLD_ATLAS_DIR, "osm-land-fill.runtime.geojson");
const COASTLINES_OUTPUT_PATH = path.join(WORLD_ATLAS_DIR, "osm-coastlines.runtime.geojson");

const LAND_TOLERANCE_DEGREES = 0.02;
const COASTLINE_TOLERANCE_DEGREES = 0.015;
const LAND_BATCH_SIZE = 2048;
const COASTLINE_BATCH_SIZE = 8192;

function sqSegmentDistance(point, segmentStart, segmentEnd) {
  let x = segmentStart[0];
  let y = segmentStart[1];
  let dx = segmentEnd[0] - x;
  let dy = segmentEnd[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / ((dx * dx) + (dy * dy));
    if (t > 1) {
      x = segmentEnd[0];
      y = segmentEnd[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return (dx * dx) + (dy * dy);
}

function radialSimplify(points, sqTolerance) {
  if (points.length <= 2) {
    return points.slice();
  }

  const simplified = [points[0]];
  let previous = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const dx = point[0] - previous[0];
    const dy = point[1] - previous[1];
    if ((dx * dx) + (dy * dy) > sqTolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function simplifyDouglasPeucker(points, sqTolerance) {
  const lastIndex = points.length - 1;
  const markers = new Uint8Array(points.length);
  const stack = [[0, lastIndex]];

  markers[0] = 1;
  markers[lastIndex] = 1;

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxSqDistance = 0;
    let index = 0;

    for (let current = first + 1; current < last; current += 1) {
      const sqDistance = sqSegmentDistance(points[current], points[first], points[last]);
      if (sqDistance > maxSqDistance) {
        index = current;
        maxSqDistance = sqDistance;
      }
    }

    if (maxSqDistance > sqTolerance) {
      markers[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const simplified = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    if (markers[index]) {
      simplified.push(points[index]);
    }
  }
  return simplified;
}

function simplifyLine(points, toleranceDegrees) {
  if (!Array.isArray(points) || points.length <= 2) {
    return points ?? [];
  }

  const sqTolerance = toleranceDegrees * toleranceDegrees;
  const radial = radialSimplify(points, sqTolerance);
  return simplifyDouglasPeucker(radial, sqTolerance);
}

function simplifyRing(ring, toleranceDegrees) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return null;
  }

  const openRing = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();

  const simplifiedOpenRing = simplifyLine(openRing, toleranceDegrees);
  if (simplifiedOpenRing.length < 3) {
    return null;
  }

  const closedRing = simplifiedOpenRing.concat([simplifiedOpenRing[0]]);
  return closedRing.length >= 4 ? closedRing : null;
}

function normalizePolygonGeometry(geometry, toleranceDegrees) {
  if (!geometry) {
    return [];
  }

  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  const normalized = [];
  for (const polygon of polygons) {
    const simplifiedRings = polygon
      .map((ring) => simplifyRing(ring, toleranceDegrees))
      .filter(Boolean);
    if (simplifiedRings.length > 0) {
      normalized.push(simplifiedRings);
    }
  }

  return normalized;
}

function normalizeLineGeometry(geometry, toleranceDegrees) {
  if (!geometry) {
    return [];
  }

  const lines = geometry.type === "LineString"
    ? [geometry.coordinates]
    : geometry.type === "MultiLineString"
      ? geometry.coordinates
      : [];

  return lines
    .map((line) => simplifyLine(line, toleranceDegrees))
    .filter((line) => Array.isArray(line) && line.length >= 2);
}

async function ensureExtracted(zipPath, shpBasePath) {
  const shpPath = `${shpBasePath}.shp`;
  const shxPath = `${shpBasePath}.shx`;
  if (fs.existsSync(shpPath) && fs.existsSync(shxPath)) {
    return;
  }

  await fsp.mkdir(CACHE_DIR, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", CACHE_DIR], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function createFeatureCollectionWriter(outputPath, metadata) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const stream = fs.createWriteStream(outputPath, { encoding: "utf8" });

  stream.write("{\"type\":\"FeatureCollection\",\"metadata\":");
  stream.write(JSON.stringify(metadata));
  stream.write(",\"features\":[");

  let wroteFeature = false;

  return {
    writeFeature(feature) {
      if (wroteFeature) {
        stream.write(",");
      }
      stream.write(JSON.stringify(feature));
      wroteFeature = true;
    },
    async close() {
      stream.write("]}\n");
      await new Promise((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
        stream.end();
      });
    },
  };
}

async function buildLandRuntime() {
  await ensureExtracted(LAND_ZIP_PATH, LAND_SHP_BASE);

  const source = await shapefile.openShp(`${LAND_SHP_BASE}.shp`);
  const writer = await createFeatureCollectionWriter(LAND_OUTPUT_PATH, {
    kind: "landFill",
    source: "OSMCoastline land-polygons-split-4326",
    toleranceDegrees: LAND_TOLERANCE_DEGREES,
    generatedBy: "scripts/build-osm-land-runtime.mjs",
    generatedAt: new Date().toISOString(),
  });

  let batch = [];
  let featureCount = 0;
  let polygonCount = 0;
  let recordCount = 0;

  while (true) {
    const { done, value } = await source.read();
    if (done) {
      break;
    }

    recordCount += 1;
    const polygons = normalizePolygonGeometry(value, LAND_TOLERANCE_DEGREES);
    for (const polygon of polygons) {
      batch.push(polygon);
      polygonCount += 1;

      if (batch.length >= LAND_BATCH_SIZE) {
        featureCount += 1;
        writer.writeFeature({
          type: "Feature",
          id: `osm-land-${featureCount}`,
          properties: { kind: "landFill" },
          geometry: {
            type: "MultiPolygon",
            coordinates: batch,
          },
        });
        batch = [];
      }
    }

    if (recordCount % 50000 === 0) {
      console.log(`Land runtime: processed ${recordCount} records`);
    }
  }

  if (batch.length > 0) {
    featureCount += 1;
    writer.writeFeature({
      type: "Feature",
      id: `osm-land-${featureCount}`,
      properties: { kind: "landFill" },
      geometry: {
        type: "MultiPolygon",
        coordinates: batch,
      },
    });
  }

  await writer.close();
  console.log(`Wrote ${LAND_OUTPUT_PATH} from ${recordCount} records as ${featureCount} features / ${polygonCount} polygons`);
}

async function buildCoastlineRuntime() {
  await ensureExtracted(COASTLINES_ZIP_PATH, COASTLINES_SHP_BASE);

  const source = await shapefile.openShp(`${COASTLINES_SHP_BASE}.shp`);
  const writer = await createFeatureCollectionWriter(COASTLINES_OUTPUT_PATH, {
    kind: "coastlines",
    source: "OSMCoastline coastlines-split-4326",
    toleranceDegrees: COASTLINE_TOLERANCE_DEGREES,
    generatedBy: "scripts/build-osm-land-runtime.mjs",
    generatedAt: new Date().toISOString(),
  });

  let batch = [];
  let featureCount = 0;
  let lineCount = 0;
  let recordCount = 0;

  while (true) {
    const { done, value } = await source.read();
    if (done) {
      break;
    }

    recordCount += 1;
    const lines = normalizeLineGeometry(value, COASTLINE_TOLERANCE_DEGREES);
    for (const line of lines) {
      batch.push(line);
      lineCount += 1;

      if (batch.length >= COASTLINE_BATCH_SIZE) {
        featureCount += 1;
        writer.writeFeature({
          type: "Feature",
          id: `osm-coastline-${featureCount}`,
          properties: { kind: "coastlines" },
          geometry: {
            type: "MultiLineString",
            coordinates: batch,
          },
        });
        batch = [];
      }
    }

    if (recordCount % 50000 === 0) {
      console.log(`Coastline runtime: processed ${recordCount} records`);
    }
  }

  if (batch.length > 0) {
    featureCount += 1;
    writer.writeFeature({
      type: "Feature",
      id: `osm-coastline-${featureCount}`,
      properties: { kind: "coastlines" },
      geometry: {
        type: "MultiLineString",
        coordinates: batch,
      },
    });
  }

  await writer.close();
  console.log(`Wrote ${COASTLINES_OUTPUT_PATH} from ${recordCount} records as ${featureCount} features / ${lineCount} lines`);
}

async function main() {
  await buildLandRuntime();
  await buildCoastlineRuntime();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
