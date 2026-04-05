import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "world-atlas-osm");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "pmtiles");
const OUTLINE_SOURCE = path.join(CACHE_DIR, "coastlines-split-4326", "lines.shp");
const VICTORIA_TILES = [
  { id: "a", minLon: 140.7, minLat: -39.9, maxLon: 143.6, maxLat: -37.0 },
  { id: "b", minLon: 143.2, minLat: -39.9, maxLon: 145.9, maxLat: -37.1 },
  { id: "c", minLon: 145.4, minLat: -39.9, maxLon: 148.1, maxLat: -37.0 },
  { id: "d", minLon: 147.5, minLat: -38.7, maxLon: 150.3, maxLat: -33.8 },
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

function buildTargetPath(tileId) {
  return path.join(PUBLIC_DIR, `osm-outline-victoria-${tileId}.pmtiles`);
}

if (!hasCommand("ogr2ogr")) {
  fail("Missing required PMTiles generator: ogr2ogr (GDAL)");
}

ensureReadableFile(OUTLINE_SOURCE);
ensureDirectory(PUBLIC_DIR);

for (const tile of VICTORIA_TILES) {
  const targetPath = buildTargetPath(tile.id);
  fs.rmSync(targetPath, { force: true });
  fs.rmSync(`${targetPath}.tmp.mbtiles`, { force: true });

  runOgr2ogr([
    "-f",
    "PMTiles",
    targetPath,
    OUTLINE_SOURCE,
    "-overwrite",
    "-progress",
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
    "coastlines",
    "-dsco",
    `NAME=OSM Coastlines Victoria ${tile.id.toUpperCase()}`,
    "-dsco",
    `DESCRIPTION=Victoria-only OSM coastlines tile ${tile.id.toUpperCase()} for atlas-product high-detail outline testing`,
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
}

console.log(`Built ${VICTORIA_TILES.length} Victoria outline PMTiles coastal slices`);
