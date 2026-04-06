// Web Worker — generates a PMTiles archive from GeoJSON in the background.
// Runs off the main thread to keep the UI responsive.
//
// Receives: { geojson, layerName, minZoom?, maxZoom? }
// Posts:    { type: 'progress', pct: 0-100 }
//           { type: 'done', buffer: ArrayBuffer }  (transferable)
//           { type: 'error', message: string }

import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "vt-pbf";
import { buildPMTiles } from "./pmtiles-writer.js";

const MIN_ZOOM = 0;
const MAX_ZOOM = 14;

self.onmessage = async ({ data }) => {
  const { geojson, layerName } = data;
  const minZoom = data.minZoom ?? MIN_ZOOM;
  const maxZoom = data.maxZoom ?? MAX_ZOOM;

  try {
    // Calculate bounding box of the data.
    const bounds = getBounds(geojson);

    // Build the tile index. indexMaxZoom must match maxZoom.
    const index = new GeoJSONVT(geojson, {
      maxZoom,
      indexMaxZoom: maxZoom,
      indexMaxPoints: 200,
      tolerance: 3,
      buffer: 64,
    });

    // Enumerate all tiles in the bounding box at each zoom level.
    const tiles = [];
    let totalTiles = 0;
    let processedZooms = 0;
    const numZooms = maxZoom - minZoom + 1;

    for (let z = minZoom; z <= maxZoom; z++) {
      const [minTx, minTy, maxTx, maxTy] = bboxToTileRange(bounds, z);
      const zTiles = [];

      for (let x = minTx; x <= maxTx; x++) {
        for (let y = minTy; y <= maxTy; y++) {
          const tile = index.getTile(z, x, y);
          if (tile && tile.features && tile.features.length > 0) {
            const encoded = fromGeojsonVt({ layer: tile });
            zTiles.push({ z, x, y, data: encoded });
          }
        }
      }

      tiles.push(...zTiles);
      totalTiles += zTiles.length;
      processedZooms++;

      // Progress: tile enumeration is 80% of the work.
      const pct = Math.round((processedZooms / numZooms) * 80);
      self.postMessage({ type: "progress", pct });
    }

    if (tiles.length === 0) {
      throw new Error("No tiles generated — check that your file contains valid coordinates.");
    }

    // Build PMTiles archive (final 20%).
    const pmtilesBuffer = buildPMTiles({ tiles, minZoom, maxZoom, bounds });
    self.postMessage({ type: "progress", pct: 100 });

    self.postMessage({ type: "done", buffer: pmtilesBuffer.buffer }, [pmtilesBuffer.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
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
      case "Point":            visitCoord(geom.coordinates); break;
      case "LineString":       geom.coordinates.forEach(visitCoord); break;
      case "Polygon":          geom.coordinates.forEach((r) => r.forEach(visitCoord)); break;
      case "MultiPoint":       geom.coordinates.forEach(visitCoord); break;
      case "MultiLineString":  geom.coordinates.forEach((l) => l.forEach(visitCoord)); break;
      case "MultiPolygon":     geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(visitCoord))); break;
      case "GeometryCollection": geom.geometries.forEach(visitGeometry); break;
    }
  }

  for (const f of geojson.features ?? []) visitGeometry(f.geometry);

  // Clamp to valid range with a small margin.
  return [
    Math.max(-180, minX - 0.01),
    Math.max(-90,  minY - 0.01),
    Math.min(180,  maxX + 0.01),
    Math.min(90,   maxY + 0.01),
  ];
}

function bboxToTileRange([minLng, minLat, maxLng, maxLat], z) {
  const n = 1 << z;

  function lngToX(lng) { return Math.floor(((lng + 180) / 360) * n); }
  function latToY(lat) {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  }

  const minTx = Math.max(0, lngToX(minLng));
  const maxTx = Math.min(n - 1, lngToX(maxLng));
  const minTy = Math.max(0, latToY(maxLat)); // lat is inverted in tile coords
  const maxTy = Math.min(n - 1, latToY(minLat));

  return [minTx, minTy, maxTx, maxTy];
}
