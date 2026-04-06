// Web Worker — generates a PMTiles archive from GeoJSON in the background.
//
// Receives: { geojson, minZoom?, maxZoom? }
// Posts:    { type: 'progress', pct: 0-100 }
//           { type: 'done', buffer: ArrayBuffer }  (transferable)
//           { type: 'error', message: string }

import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "vt-pbf";
import { buildPMTiles } from "./pmtiles-writer.js";

const MIN_ZOOM = 0;
const MAX_ZOOM = 14;

self.onmessage = async ({ data }) => {
  const { geojson } = data;
  const minZoom = data.minZoom ?? MIN_ZOOM;
  const maxZoom = data.maxZoom ?? MAX_ZOOM;

  try {
    const bounds = getBounds(geojson);

    // indexMaxZoom must match maxZoom so getTile works at all levels.
    const index = new GeoJSONVT(geojson, {
      maxZoom,
      indexMaxZoom: maxZoom,
      indexMaxPoints: 200,
      tolerance: 3,
      buffer: 64,
    });

    // Quadtree traversal — only descend into tiles that contain data.
    // This avoids scanning millions of empty tiles in large bounding boxes.
    const tiles = [];
    const queue = [[0, 0, 0]]; // [z, x, y]
    let checked = 0;

    while (queue.length > 0) {
      const [z, x, y] = queue.shift();
      checked++;

      const tile = index.getTile(z, x, y);
      if (!tile || !tile.features || tile.features.length === 0) continue;

      if (z >= minZoom) {
        const encoded = fromGeojsonVt({ layer: tile });
        tiles.push({ z, x, y, data: encoded });
      }

      if (z < maxZoom) {
        queue.push(
          [z + 1, 2 * x,     2 * y],
          [z + 1, 2 * x + 1, 2 * y],
          [z + 1, 2 * x,     2 * y + 1],
          [z + 1, 2 * x + 1, 2 * y + 1],
        );
      }

      // Progress: estimate based on depth. Most work is at high zoom levels.
      if (checked % 500 === 0) {
        const depthFraction = z / maxZoom;
        const pct = Math.min(79, Math.round(depthFraction * depthFraction * 80));
        self.postMessage({ type: "progress", pct });
      }
    }

    if (tiles.length === 0) {
      throw new Error("No tiles generated — check that your file contains valid coordinates.");
    }

    self.postMessage({ type: "progress", pct: 80 });

    const pmtilesBuffer = buildPMTiles({ tiles, minZoom, maxZoom, bounds });

    self.postMessage({ type: "progress", pct: 100 });
    self.postMessage({ type: "done", buffer: pmtilesBuffer.buffer }, [pmtilesBuffer.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message ?? String(err) });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBounds(geojson) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function visitCoord([lng, lat]) {
    if (lng < minX) minX = lng;
    if (lat < minY) minY = lat;
    if (lng > maxX) maxX = lng;
    if (lat > maxY) maxY = lat;
  }

  function visitGeometry(geom) {
    if (!geom) return;
    switch (geom.type) {
      case "Point":              visitCoord(geom.coordinates); break;
      case "LineString":         geom.coordinates.forEach(visitCoord); break;
      case "Polygon":            geom.coordinates.forEach((r) => r.forEach(visitCoord)); break;
      case "MultiPoint":         geom.coordinates.forEach(visitCoord); break;
      case "MultiLineString":    geom.coordinates.forEach((l) => l.forEach(visitCoord)); break;
      case "MultiPolygon":       geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(visitCoord))); break;
      case "GeometryCollection": geom.geometries.forEach(visitGeometry); break;
    }
  }

  for (const f of geojson.features ?? []) visitGeometry(f.geometry);

  return [
    Math.max(-180, minX - 0.01),
    Math.max(-90,  minY - 0.01),
    Math.min(180,  maxX + 0.01),
    Math.min(90,   maxY + 0.01),
  ];
}
