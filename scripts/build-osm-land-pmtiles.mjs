import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "world-atlas-osm");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "pmtiles");

const LAND_SOURCE = path.join(CACHE_DIR, "land-polygons-split-4326", "land_polygons.shp");
const OUTLINE_SOURCE = path.join(CACHE_DIR, "coastlines-split-4326", "lines.shp");
const LAND_TARGET = path.join(PUBLIC_DIR, "osm-land.pmtiles");
const OUTLINE_TARGET = path.join(PUBLIC_DIR, "osm-outline.pmtiles");

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
ensureReadableFile(OUTLINE_SOURCE);
ensureDirectory(PUBLIC_DIR);

runOgr2ogr([
  "-f",
  "PMTiles",
  LAND_TARGET,
  LAND_SOURCE,
  "-overwrite",
  "-progress",
  "-nln",
  "land-fill",
  "-dsco",
  "NAME=OSM Land",
  "-dsco",
  "DESCRIPTION=OSM land polygons for atlas-product Earth land fill",
  "-dsco",
  "MINZOOM=0",
  "-dsco",
  "MAXZOOM=7",
  "-dsco",
  "TYPE=baselayer",
  "--config",
  "GDAL_NUM_THREADS",
  "ALL_CPUS",
]);

runOgr2ogr([
  "-f",
  "PMTiles",
  OUTLINE_TARGET,
  OUTLINE_SOURCE,
  "-overwrite",
  "-progress",
  "-nln",
  "coastlines",
  "-dsco",
  "NAME=OSM Coastlines",
  "-dsco",
  "DESCRIPTION=OSM coastlines for atlas-product Earth outline",
  "-dsco",
  "MINZOOM=0",
  "-dsco",
  "MAXZOOM=7",
  "-dsco",
  "TYPE=baselayer",
  "--config",
  "GDAL_NUM_THREADS",
  "ALL_CPUS",
]);
