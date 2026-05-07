import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORLD_ATLAS_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const SOURCE_ZIP = path.join(WORLD_ATLAS_DIR, "ne_10m_admin_1_states_provinces.zip");
const SOURCE_GEOJSON = path.join(WORLD_ATLAS_DIR, "ne_10m_admin_1_states_provinces.geojson");
const TARGET_PMTILES = path.join(WORLD_ATLAS_DIR, "ne_10m_admin_1_states_provinces.pmtiles");
const TEMP_DIR = path.join(ROOT_DIR, ".tmp-tippecanoe-work");
const SOURCE_LAYER = "ne_10m_admin_1_states_provinces";
const TIPPECANOE = process.env.TIPPECANOE
  ?? (fs.existsSync(path.join(ROOT_DIR, ".tmp-tippecanoe-felt", "tippecanoe"))
    ? path.join(ROOT_DIR, ".tmp-tippecanoe-felt", "tippecanoe")
    : "tippecanoe");

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

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(SOURCE_ZIP)) {
  fail(`Missing required source zip: ${SOURCE_ZIP}`);
}

if (!hasCommand("ogr2ogr")) {
  fail("Missing required generator: ogr2ogr (GDAL)");
}

if (!fs.existsSync(TIPPECANOE) && !hasCommand(TIPPECANOE)) {
  fail("Missing required generator: tippecanoe. Set TIPPECANOE=/path/to/tippecanoe if it is not on PATH.");
}

fs.mkdirSync(WORLD_ATLAS_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.rmSync(SOURCE_GEOJSON, { force: true });
fs.rmSync(TARGET_PMTILES, { force: true });

run("ogr2ogr", [
  "-f",
  "GeoJSON",
  SOURCE_GEOJSON,
  `/vsizip/${SOURCE_ZIP}/${SOURCE_LAYER}.shp`,
  "-nln",
  SOURCE_LAYER,
  "-overwrite",
]);

run(TIPPECANOE, [
  "--force",
  "--output",
  TARGET_PMTILES,
  "--layer",
  "layer",
  "--minimum-zoom",
  "0",
  "--maximum-zoom",
  process.env.MAXZOOM ?? "10",
  "--detect-shared-borders",
  "--no-tile-size-limit",
  "--no-feature-limit",
  "--name",
  "Natural Earth Admin 1 States Provinces",
  "--description",
  "Natural Earth 10m admin-1 states/provinces polygons for PMTiles fill diagnostics",
  "--temporary-directory",
  TEMP_DIR,
  SOURCE_GEOJSON,
]);

console.log(`Built states GeoJSON at ${SOURCE_GEOJSON}`);
console.log(`Built states PMTiles at ${TARGET_PMTILES}`);
