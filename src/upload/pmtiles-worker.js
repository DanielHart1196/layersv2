// Web Worker - generates a PMTiles archive from GeoJSON in the background.
//
// Receives: { geojson, minZoom?, maxZoom? }
// Posts:    { type: 'progress', pct: 0-100 }
//           { type: 'done', buffer: ArrayBuffer }  (transferable)
//           { type: 'error', message: string }

import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";
import { buildPMTiles } from "./pmtiles-writer.js";

const MIN_ZOOM = 0;
const MAX_ZOOM = 14;

self.onmessage = async ({ data }) => {
  const { geojson } = data;
  const minZoom = data.minZoom ?? MIN_ZOOM;
  const maxZoom = data.maxZoom ?? MAX_ZOOM;

  try {
    const startedAt = performance.now();
    const bounds = getBounds(geojson);
    const afterBounds = performance.now();

    // indexMaxZoom must match maxZoom so getTile works at all levels.
    const index = new GeoJSONVT(geojson, {
      maxZoom,
      indexMaxZoom: maxZoom,
      indexMaxPoints: 0,
      tolerance: 3,
      buffer: 64,
    });
    const afterIndex = performance.now();

    const tiles = collectTiles(index, minZoom, maxZoom);
    const afterCollect = performance.now();

    if (tiles.length === 0) {
      throw new Error("No tiles generated - check that your file contains valid coordinates.");
    }

    self.postMessage({ type: "progress", pct: 80 });

    const pmtilesBuffer = buildPMTiles({ tiles, minZoom, maxZoom, bounds });
    const finishedAt = performance.now();

    self.postMessage({ type: "progress", pct: 100 });
    self.postMessage({
      type: "done",
      buffer: pmtilesBuffer.buffer,
      diagnostics: {
        tileCount: tiles.length,
        sizeBytes: pmtilesBuffer.byteLength,
        timingsMs: {
          bounds: Math.round(afterBounds - startedAt),
          index: Math.round(afterIndex - afterBounds),
          collect: Math.round(afterCollect - afterIndex),
          write: Math.round(finishedAt - afterCollect),
          total: Math.round(finishedAt - startedAt),
        },
      },
    }, [pmtilesBuffer.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message ?? String(err) });
  }
};

function collectTiles(index, minZoom, maxZoom) {
  const coords = Array.isArray(index?.tileCoords) ? index.tileCoords : null;
  if (coords?.length) {
    return collectTilesFromCoords(index, coords, minZoom);
  }
  const tileRecords = index?.tiles && typeof index.tiles === "object"
    ? Object.values(index.tiles)
    : null;
  if (tileRecords?.length) {
    return collectTilesFromIndexTiles(index, tileRecords, minZoom, maxZoom);
  }
  return collectTilesByTraversal(index, minZoom, maxZoom);
}

function collectTilesFromCoords(index, coords, minZoom) {
  const tiles = [];

  for (let i = 0; i < coords.length; i++) {
    const { z, x, y } = coords[i];
    if (z < minZoom) continue;

    const tile = index.getTile(z, x, y);
    if (!tile?.features?.length) continue;

    tiles.push({ z, x, y, data: fromGeojsonVt({ layer: tile }) });

    if (i % 100 === 0) {
      self.postMessage({ type: "progress", pct: Math.min(79, Math.round((i / coords.length) * 80)) });
    }
  }

  return tiles;
}

function collectTilesFromIndexTiles(index, tileRecords, minZoom, maxZoom) {
  const tiles = [];

  for (let i = 0; i < tileRecords.length; i++) {
    const record = tileRecords[i];
    const z = Number(record?.z);
    const x = Number(record?.x);
    const y = Number(record?.y);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (z < minZoom || z > maxZoom) continue;

    const tile = index.getTile(z, x, y);
    if (!tile?.features?.length) continue;

    tiles.push({ z, x, y, data: fromGeojsonVt({ layer: tile }) });

    if (i % 100 === 0) {
      self.postMessage({ type: "progress", pct: Math.min(79, Math.round((i / tileRecords.length) * 80)) });
    }
  }

  return tiles;
}

function collectTilesByTraversal(index, minZoom, maxZoom) {
  const tiles = [];
  const queue = [[0, 0, 0]];
  let checked = 0;

  while (queue.length > 0) {
    const [z, x, y] = queue.shift();
    checked += 1;

    const tile = index.getTile(z, x, y);
    if (!tile?.features?.length) {
      continue;
    }

    if (z >= minZoom) {
      tiles.push({ z, x, y, data: fromGeojsonVt({ layer: tile }) });
    }

    if (z < maxZoom) {
      queue.push(
        [z + 1, 2 * x, 2 * y],
        [z + 1, 2 * x + 1, 2 * y],
        [z + 1, 2 * x, 2 * y + 1],
        [z + 1, 2 * x + 1, 2 * y + 1],
      );
    }

    if (checked % 500 === 0) {
      const depthFraction = z / maxZoom;
      const pct = Math.min(79, Math.round(depthFraction * depthFraction * 80));
      self.postMessage({ type: "progress", pct });
    }
  }

  return tiles;
}

function getBounds(geojson) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function visitCoord([lng, lat]) {
    if (lng < minX) minX = lng;
    if (lat < minY) minY = lat;
    if (lng > maxX) maxX = lng;
    if (lat > maxY) maxY = lat;
  }

  function visitGeometry(geom) {
    if (!geom) return;
    switch (geom.type) {
      case "Point":
        visitCoord(geom.coordinates);
        break;
      case "LineString":
        geom.coordinates.forEach(visitCoord);
        break;
      case "Polygon":
        geom.coordinates.forEach((ring) => ring.forEach(visitCoord));
        break;
      case "MultiPoint":
        geom.coordinates.forEach(visitCoord);
        break;
      case "MultiLineString":
        geom.coordinates.forEach((line) => line.forEach(visitCoord));
        break;
      case "MultiPolygon":
        geom.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(visitCoord)));
        break;
      case "GeometryCollection":
        geom.geometries.forEach(visitGeometry);
        break;
    }
  }

  for (const feature of geojson.features ?? []) {
    visitGeometry(feature.geometry);
  }

  return [
    Math.max(-180, minX - 0.01),
    Math.max(-90, minY - 0.01),
    Math.min(180, maxX + 0.01),
    Math.min(90, maxY + 0.01),
  ];
}
