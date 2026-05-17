import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORLD_ATLAS_DIR = path.join(ROOT_DIR, "public", "data", "world-atlas");
const DETAILS = ["110m", "50m", "10m"];

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
  fail("Missing required converter: ogr2ogr (GDAL)");
}

fs.mkdirSync(WORLD_ATLAS_DIR, { recursive: true });

DETAILS.forEach((detail) => {
  const basename = `ne_${detail}_coastline`;
  const zipPath = path.join(WORLD_ATLAS_DIR, `${basename}.zip`);
  const outputPath = path.join(WORLD_ATLAS_DIR, `${basename}.geojson`);

  if (!fs.existsSync(zipPath)) {
    fail(`Missing Natural Earth coastline zip: ${zipPath}`);
  }

  fs.rmSync(outputPath, { force: true });
  runOgr2ogr([
    "-f",
    "GeoJSON",
    outputPath,
    `/vsizip/${zipPath}/${basename}.shp`,
    "-overwrite",
    "-nln",
    basename,
    "-lco",
    "COORDINATE_PRECISION=5",
  ]);

  const bytes = fs.statSync(outputPath).size;
  console.log(`Built ${outputPath} (${(bytes / 1024).toFixed(0)} KB)`);
});
