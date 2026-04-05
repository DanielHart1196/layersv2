import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORLD_ATLAS_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "pmtiles");
const AFRICA_SOURCE = path.join(WORLD_ATLAS_DIR, "africa.geojson");
const AFRICA_TARGET = path.join(PUBLIC_DIR, "africa.pmtiles");

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

ensureReadableFile(AFRICA_SOURCE);
ensureDirectory(PUBLIC_DIR);
fs.rmSync(AFRICA_TARGET, { force: true });
fs.rmSync(`${AFRICA_TARGET}.tmp.mbtiles`, { force: true });

runOgr2ogr([
  "-f",
  "PMTiles",
  AFRICA_TARGET,
  AFRICA_SOURCE,
  "-overwrite",
  "-progress",
  "-nln",
  "land-fill",
  "-dsco",
  "NAME=Africa Test",
  "-dsco",
  "DESCRIPTION=Simple Africa polygon PMTiles test for atlas-product fill diagnostics",
  "-dsco",
  "MINZOOM=0",
  "-dsco",
  "MAXZOOM=10",
  "-dsco",
  "TYPE=overlay",
  "--config",
  "GDAL_NUM_THREADS",
  "ALL_CPUS",
]);
