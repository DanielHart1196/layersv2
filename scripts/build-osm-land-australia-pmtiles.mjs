import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "world-atlas-osm");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "pmtiles");
const LAND_SOURCE = path.join(CACHE_DIR, "land-polygons-split-4326", "land_polygons.shp");
const LAND_TARGET = path.join(PUBLIC_DIR, "osm-land-australia.pmtiles");
const AUSTRALIA_BOUNDS = {
  minLon: 110,
  minLat: -46,
  maxLon: 156,
  maxLat: -8,
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

function ensureReadableFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required source file: ${filePath}`);
  }
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function runOgr2ogr(args) {
  const result = spawnSync("ogr2ogr", args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!hasCommand("ogr2ogr")) {
  fail("Missing required PMTiles generator: ogr2ogr (GDAL)");
}

ensureReadableFile(LAND_SOURCE);
ensureDirectory(PUBLIC_DIR);
fs.rmSync(LAND_TARGET, { force: true });
fs.rmSync(`${LAND_TARGET}.tmp.mbtiles`, { force: true });

runOgr2ogr([
  "-f",
  "PMTiles",
  LAND_TARGET,
  LAND_SOURCE,
  "-overwrite",
  "-progress",
  "-spat",
  String(AUSTRALIA_BOUNDS.minLon),
  String(AUSTRALIA_BOUNDS.minLat),
  String(AUSTRALIA_BOUNDS.maxLon),
  String(AUSTRALIA_BOUNDS.maxLat),
  "-clipsrc",
  String(AUSTRALIA_BOUNDS.minLon),
  String(AUSTRALIA_BOUNDS.minLat),
  String(AUSTRALIA_BOUNDS.maxLon),
  String(AUSTRALIA_BOUNDS.maxLat),
  "-nln",
  "land-fill",
  "-dsco",
  "NAME=OSM Land Australia Test",
  "-dsco",
  "DESCRIPTION=Australia-only OSM land polygons for atlas-product land fill fidelity testing",
  "-dsco",
  "MINZOOM=0",
  "-dsco",
  "MAXZOOM=14",
  "-dsco",
  "EXTENT=16384",
  "-dsco",
  "BUFFER=128",
  "-dsco",
  "MAX_SIZE=4000000",
  "-dsco",
  "SIMPLIFICATION=0",
  "-dsco",
  "SIMPLIFICATION_MAX_ZOOM=0",
  "-dsco",
  "TYPE=baselayer",
  "--config",
  "GDAL_NUM_THREADS",
  "ALL_CPUS",
]);
