import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOURCE_PATH = path.join(ROOT_DIR, "public", "data", "external-countries.geojson");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "data", "world-atlas", "countries-dissolved-land.geojson");
const SOURCE_LAYER = "ne_10m_admin_0_countries";

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

if (!fs.existsSync(SOURCE_PATH)) {
  fail(`Missing required source file: ${SOURCE_PATH}`);
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.rmSync(OUTPUT_PATH, { force: true });

const result = spawnSync("ogr2ogr", [
  "-f",
  "GeoJSON",
  OUTPUT_PATH,
  SOURCE_PATH,
  "-dialect",
  "sqlite",
  "-sql",
  `SELECT ST_Union(geometry) AS geometry, 'Dissolved Countries Land' AS name, 'external-countries.geojson' AS source FROM ${SOURCE_LAYER}`,
  "-overwrite",
], {
  cwd: ROOT_DIR,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Built dissolved countries land GeoJSON at ${OUTPUT_PATH}`);
