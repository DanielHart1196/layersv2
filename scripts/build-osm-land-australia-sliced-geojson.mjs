import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "world-atlas-osm");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const LAND_SOURCE = path.join(CACHE_DIR, "land-polygons-split-4326", "land_polygons.shp");
const AUSTRALIA_TILES = [
  { id: "a", minLon: 110, minLat: -46, maxLon: 121, maxLat: -27 },
  { id: "b", minLon: 121, minLat: -46, maxLon: 132, maxLat: -27 },
  { id: "c", minLon: 132, minLat: -46, maxLon: 143, maxLat: -27 },
  { id: "d", minLon: 143, minLat: -46, maxLon: 156, maxLat: -27 },
  { id: "e", minLon: 110, minLat: -27, maxLon: 121, maxLat: -8 },
  { id: "f", minLon: 121, minLat: -27, maxLon: 132, maxLat: -8 },
  { id: "g", minLon: 132, minLat: -27, maxLon: 143, maxLat: -8 },
  { id: "h", minLon: 143, minLat: -27, maxLon: 156, maxLat: -8 },
];

function hasCommand(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!hasCommand("ogr2ogr")) {
  fail("Missing required generator: ogr2ogr (GDAL)");
}

if (!fs.existsSync(LAND_SOURCE)) {
  fail(`Missing required source file: ${LAND_SOURCE}`);
}

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

for (const tile of AUSTRALIA_TILES) {
  const targetPath = path.join(PUBLIC_DIR, `australia-land-${tile.id}.geojson`);
  fs.rmSync(targetPath, { force: true });

  const result = spawnSync("ogr2ogr", [
    "-f",
    "GeoJSON",
    targetPath,
    LAND_SOURCE,
    "-overwrite",
    "-spat",
    String(tile.minLon),
    String(tile.minLat),
    String(tile.maxLon),
    String(tile.maxLat),
    "-clipsrc",
    String(tile.minLon),
    String(tile.minLat),
    String(tile.maxLon),
    String(tile.maxLat),
    "-nln",
    `australia-land-${tile.id}`,
  ], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Built ${AUSTRALIA_TILES.length} sliced Australia land GeoJSON files`);
