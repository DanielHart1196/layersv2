import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "world-atlas-osm");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "pmtiles");
const OUTLINE_SOURCE = path.join(CACHE_DIR, "coastlines-split-4326", "lines.shp");
const OUTLINE_TARGET = path.join(PUBLIC_DIR, "osm-outline-japan.pmtiles");
const JAPAN_BOUNDS = {
  minLon: 122,
  minLat: 24,
  maxLon: 154,
  maxLat: 46,
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

ensureReadableFile(OUTLINE_SOURCE);
ensureDirectory(PUBLIC_DIR);
fs.rmSync(OUTLINE_TARGET, { force: true });
fs.rmSync(`${OUTLINE_TARGET}.tmp.mbtiles`, { force: true });

runOgr2ogr([
  "-f",
  "PMTiles",
  OUTLINE_TARGET,
  OUTLINE_SOURCE,
  "-overwrite",
  "-progress",
  "-spat",
  String(JAPAN_BOUNDS.minLon),
  String(JAPAN_BOUNDS.minLat),
  String(JAPAN_BOUNDS.maxLon),
  String(JAPAN_BOUNDS.maxLat),
  "-clipsrc",
  String(JAPAN_BOUNDS.minLon),
  String(JAPAN_BOUNDS.minLat),
  String(JAPAN_BOUNDS.maxLon),
  String(JAPAN_BOUNDS.maxLat),
  "-nln",
  "coastlines",
  "-dsco",
  "NAME=OSM Coastlines Japan Test",
  "-dsco",
  "DESCRIPTION=Japan-only OSM coastlines for atlas-product outline fidelity testing",
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
