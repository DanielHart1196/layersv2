import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "world-atlas-osm");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const LAND_SOURCE = path.join(CACHE_DIR, "land-polygons-split-4326", "land_polygons.shp");
const TARGET_PATH = path.join(PUBLIC_DIR, "victoria-land.geojson");
const VICTORIA_BOUNDS = {
  minLon: 140.7,
  minLat: -39.9,
  maxLon: 150.3,
  maxLat: -33.8,
};

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
fs.rmSync(TARGET_PATH, { force: true });

const result = spawnSync("ogr2ogr", [
  "-f",
  "GeoJSON",
  TARGET_PATH,
  LAND_SOURCE,
  "-overwrite",
  "-spat",
  String(VICTORIA_BOUNDS.minLon),
  String(VICTORIA_BOUNDS.minLat),
  String(VICTORIA_BOUNDS.maxLon),
  String(VICTORIA_BOUNDS.maxLat),
  "-clipsrc",
  String(VICTORIA_BOUNDS.minLon),
  String(VICTORIA_BOUNDS.minLat),
  String(VICTORIA_BOUNDS.maxLon),
  String(VICTORIA_BOUNDS.maxLat),
  "-nln",
  "victoria-land",
], {
  cwd: ROOT_DIR,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Built ${TARGET_PATH}`);
