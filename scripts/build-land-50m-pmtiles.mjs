import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORLD_ATLAS_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "pmtiles");
const LAND_SOURCE = path.join(WORLD_ATLAS_DIR, "land-50m.geojson");
const LAND_TARGET = path.join(PUBLIC_DIR, "land-50m.pmtiles");

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
  "-nln",
  "land-fill",
  "-dsco",
  "NAME=World Land 50m",
  "-dsco",
  "DESCRIPTION=50m global land polygons for atlas-product Earth land testing",
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
